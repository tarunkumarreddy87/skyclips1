# HANUMAN AWS Production Deployment
# Usage: .\infrastructure\aws\deploy.ps1 [-SkipBuild] [-SkipImages]
param(
    [string]$Region = "us-east-1",
    [string]$EnvironmentName = "hanuman-prod",
    [string]$ImageTag = "latest",
    [switch]$SkipBuild,
    [switch]$SkipImages
)

$ErrorActionPreference = "Stop"
function Invoke-Aws {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $result = & aws @args 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "aws $($args -join ' ') failed: $result" }
    return $result
}
function Test-Aws {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & aws @args 2>$null | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return ($code -eq 0)
}
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$AccountId = (Invoke-Aws sts get-caller-identity --query Account --output text)
$EcrBase = "$AccountId.dkr.ecr.$Region.amazonaws.com"

$ArtifactsBucket = "hanuman-artifacts-$AccountId"

Write-Host "==> HANUMAN deploy account=$AccountId region=$Region" -ForegroundColor Cyan

# --- Network ---
$VpcId = Invoke-Aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region $Region
$SubnetIds = Invoke-Aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VpcId" --query "Subnets[*].SubnetId" --output text --region $Region
$SubnetList = $SubnetIds -split "\s+"
Write-Host "    VPC=$VpcId subnets=$($SubnetList.Count)"

# --- S3 ---
if (-not (Test-Aws s3api head-bucket --bucket $ArtifactsBucket --region $Region)) {
    Invoke-Aws s3api create-bucket --bucket $ArtifactsBucket --region $Region | Out-Null
    Invoke-Aws s3api put-bucket-versioning --bucket $ArtifactsBucket --versioning-configuration Status=Enabled | Out-Null
}
Write-Host "    S3 bucket: $ArtifactsBucket"

# --- ECR repos ---
$Services = @("api", "web", "orchestrator", "media", "render-service")
foreach ($svc in $Services) {
    $repo = "hanuman/$svc"
    if (-not (Test-Aws ecr describe-repositories --repository-names $repo --region $Region)) {
        Invoke-Aws ecr create-repository --repository-name $repo --region $Region | Out-Null
        Write-Host "    Created ECR: $repo"
    }
}

# --- ECR login + build ---
if (-not $SkipImages) {
    $login = Invoke-Aws ecr get-login-password --region $Region
    $login | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com"
    Set-Location $RepoRoot

    if (-not $SkipBuild) {
        Write-Host "==> Building Docker images..." -ForegroundColor Cyan
        docker build -f apps/api/Dockerfile -t "${EcrBase}/hanuman/api:${ImageTag}" .
        $SupaUrl = "https://qbyrlypptshxqjigrbuo.supabase.co"
        $SupaAnon = ((Get-Content (Join-Path $RepoRoot ".env") | Where-Object { $_ -match "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" } | Select-Object -First 1) -split "=", 2)[1].Trim().Trim('"').Trim("'")
        
        docker build -f apps/web/Dockerfile `
            --build-arg API_INTERNAL_URL=http://api.hanuman.local:8000 `
            --build-arg NEXT_PUBLIC_API_URL=/api `
            --build-arg NEXT_PUBLIC_APP_URL="$env:NEXT_PUBLIC_APP_URL" `
            --build-arg NEXT_PUBLIC_SUPABASE_URL="$SupaUrl" `
            --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$SupaAnon" `
            -t "${EcrBase}/hanuman/web:${ImageTag}" .
        docker build -f workers/orchestrator/Dockerfile -t "${EcrBase}/hanuman/orchestrator:${ImageTag}" .
        docker build -f workers/media/Dockerfile -t "${EcrBase}/hanuman/media:${ImageTag}" .
        docker build -f render-service/Dockerfile -t "${EcrBase}/hanuman/render-service:${ImageTag}" .
    }

    foreach ($svc in $Services) {
        Write-Host "    Pushing hanuman/$svc..." -ForegroundColor Gray
        docker push "${EcrBase}/hanuman/${svc}:${ImageTag}"
    }
}

# Secrets (local state - use Secrets Manager when IAM allows)
$StatePath = Join-Path $RepoRoot "infrastructure/aws/deployment-state.json"
$ExistingState = $null
if (Test-Path $StatePath) {
    $ExistingState = Get-Content $StatePath | ConvertFrom-Json
}

if ($ExistingState -and $ExistingState.dbPassword) {
    $DbPassword = $ExistingState.dbPassword
    $InternalKey = $ExistingState.internalApiKey
} else {
    $DbPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
    $InternalKey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
}

$SecretName = "$EnvironmentName/app-config"
$SecretJson = @{
    db_password = $DbPassword
    internal_api_key = $InternalKey
} | ConvertTo-Json -Compress

if (Test-Aws secretsmanager describe-secret --secret-id $SecretName --region $Region) {
    Invoke-Aws secretsmanager put-secret-value --secret-id $SecretName --secret-string $SecretJson --region $Region | Out-Null
    Write-Host "    Secrets Manager: $SecretName (updated)"
} elseif (Test-Aws secretsmanager create-secret --name $SecretName --secret-string $SecretJson --region $Region) {
    Write-Host "    Secrets Manager: $SecretName (created)"
} else {
    Write-Host "    Secrets Manager unavailable - storing in deployment-state.json (local only)" -ForegroundColor Yellow
}

# --- Security groups ---
function Get-OrCreate-SG($Name, $Description, $IngressRules) {
    $existing = Invoke-Aws ec2 describe-security-groups --filters "Name=group-name,Values=$Name" "Name=vpc-id,Values=$VpcId" --query "SecurityGroups[0].GroupId" --output text --region $Region
    if ($existing -and $existing -ne "None") { return $existing }
    $sg = Invoke-Aws ec2 create-security-group --group-name $Name --description $Description --vpc-id $VpcId --region $Region --query GroupId --output text
    foreach ($rule in $IngressRules) {
        Test-Aws ec2 authorize-security-group-ingress --group-id $sg --ip-permissions $rule --region $Region | Out-Null
    }
    return $sg
}

$AlbSg = Get-OrCreate-SG "$EnvironmentName-alb" "HANUMAN ALB" @(
    '{"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}'
)
$ecsIngressFromAlb = '{"IpProtocol":"tcp","FromPort":0,"ToPort":65535,"UserIdGroupPairs":[{"GroupId":"ALB_SG"}]}' -replace 'ALB_SG', $AlbSg
$EcsSg = Get-OrCreate-SG "$EnvironmentName-ecs" "HANUMAN ECS" @($ecsIngressFromAlb)
$ecsSelfIngress = '{"IpProtocol":"tcp","FromPort":0,"ToPort":65535,"UserIdGroupPairs":[{"GroupId":"ECS_SG"}]}' -replace 'ECS_SG', $EcsSg
Test-Aws ec2 authorize-security-group-ingress --group-id $EcsSg --ip-permissions $ecsSelfIngress --region $Region | Out-Null
$rdsIngress = '{"IpProtocol":"tcp","FromPort":5432,"ToPort":5432,"UserIdGroupPairs":[{"GroupId":"ECS_SG"}]}' -replace 'ECS_SG', $EcsSg
$RdsSg = Get-OrCreate-SG "$EnvironmentName-rds" "HANUMAN RDS" @($rdsIngress)

# --- RDS (optional, skipped if IAM denies rds:CreateDBInstance) ---
$DbId = "$EnvironmentName-postgres"
$DbHost = "postgres.hanuman.local"
$UseRds = $false
if (Test-Aws rds describe-db-instances --db-instance-identifier $DbId --region $Region) {
    $UseRds = $true
    $DbHost = Invoke-Aws rds describe-db-instances --db-instance-identifier $DbId --query "DBInstances[0].Endpoint.Address" --output text --region $Region
    Write-Host "    RDS: $DbHost"
} elseif (Test-Aws iam simulate-principal-policy --policy-source-arn (Invoke-Aws sts get-caller-identity --query Arn --output text) --action-names rds:CreateDBInstance --query "EvaluationResults[0].EvalDecision" --output text | Select-String -Pattern "allowed" -Quiet) {
    Write-Host "==> Creating RDS PostgreSQL (5-10 min)..." -ForegroundColor Cyan
    $SubnetGroup = "$EnvironmentName-db-subnet"
    if (-not (Test-Aws rds describe-db-subnet-groups --db-subnet-group-name $SubnetGroup --region $Region)) {
        Invoke-Aws rds create-db-subnet-group --db-subnet-group-name $SubnetGroup --db-subnet-group-description "HANUMAN" --subnet-ids $SubnetList --region $Region | Out-Null
    }
    Invoke-Aws rds create-db-instance --db-instance-identifier $DbId --db-instance-class db.t4g.micro --engine postgres --engine-version 16.4 --master-username hanuman --master-user-password $DbPassword --allocated-storage 20 --db-name hanuman --vpc-security-group-ids $RdsSg --db-subnet-group-name $SubnetGroup --no-publicly-accessible --backup-retention-period 7 --region $Region | Out-Null
    Invoke-Aws rds wait db-instance-available --db-instance-identifier $DbId --region $Region
    $DbHost = Invoke-Aws rds describe-db-instances --db-instance-identifier $DbId --query "DBInstances[0].Endpoint.Address" --output text --region $Region
    $UseRds = $true
    Write-Host "    RDS: $DbHost"
} else {
    Write-Host "    RDS unavailable - using containerized PostgreSQL on ECS (postgres.hanuman.local)" -ForegroundColor Yellow
}

# --- ECS Cluster ---
if (-not (Test-Aws ecs describe-clusters --clusters $EnvironmentName --region $Region)) {
    Invoke-Aws ecs create-cluster --cluster-name $EnvironmentName --settings "name=containerInsights,value=enabled" --region $Region | Out-Null
} else {
    $active = Invoke-Aws ecs describe-clusters --clusters $EnvironmentName --region $Region --query "clusters[?status=='ACTIVE'].clusterName" --output text
    if (-not $active) {
        Invoke-Aws ecs create-cluster --cluster-name $EnvironmentName --settings "name=containerInsights,value=enabled" --region $Region | Out-Null
    }
}

# --- Save deployment state ---
$State = @{
    accountId = $AccountId
    region = $Region
    environment = $EnvironmentName
    artifactsBucket = $ArtifactsBucket
    databaseHost = $DbHost
    useRds = $UseRds
    dbPassword = $DbPassword
    internalApiKey = $InternalKey
    ecrBase = $EcrBase
    imageTag = $ImageTag
    secretName = $SecretName
    vpcId = $VpcId
    deployedAt = (Get-Date -Format "o")
} | ConvertTo-Json -Depth 3
$State | Set-Content $StatePath -Encoding UTF8

Write-Host ""
Write-Host "==> Phase 1 complete. Core AWS resources ready." -ForegroundColor Green
Write-Host "    Artifacts S3:  s3://$ArtifactsBucket"
Write-Host "    RDS endpoint:  $DbHost"
Write-Host "    State file:    $StatePath"
Write-Host ""
Write-Host "Next: run .\infrastructure\aws\deploy-ecs.ps1 to launch ECS services" -ForegroundColor Yellow
