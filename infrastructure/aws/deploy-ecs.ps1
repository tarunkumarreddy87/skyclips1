# Phase 2: ECS Fargate deployment for HANUMAN
param(
    [string]$Region = "us-east-1",
    [string]$EnvironmentName = "hanuman-prod"
)

$ErrorActionPreference = "Stop"

function Invoke-Aws {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $result = & aws @args 2>&1; $code = $LASTEXITCODE; $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "aws failed: $result" }; return $result
}
function Test-Aws {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & aws @args 2>$null | Out-Null; $code = $LASTEXITCODE; $ErrorActionPreference = $prev
    return ($code -eq 0)
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$StatePath = Join-Path $RepoRoot "infrastructure/aws/deployment-state.json"
$State = Get-Content $StatePath | ConvertFrom-Json

$AccountId = $State.accountId
$EcrBase = $State.ecrBase
$ImageTag = $State.imageTag
$DbPassword = $State.dbPassword
$InternalKey = $State.internalApiKey
$ArtifactsBucket = $State.artifactsBucket
$RemotionFunctionName = $State.remotionFunctionName
$RemotionServeUrl = $State.remotionServeUrl
$VpcId = $State.vpcId

$SubnetIds = @((Invoke-Aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VpcId" --query "Subnets[*].SubnetId" --output text --region $Region) -split "\s+" | Where-Object { $_ })
$AlbSg = Invoke-Aws ec2 describe-security-groups --filters "Name=group-name,Values=$EnvironmentName-alb" --query "SecurityGroups[0].GroupId" --output text --region $Region
$EcsSg = Invoke-Aws ec2 describe-security-groups --filters "Name=group-name,Values=$EnvironmentName-ecs" --query "SecurityGroups[0].GroupId" --output text --region $Region

# Service discovery namespace
$NsId = Invoke-Aws servicediscovery list-namespaces --filters "Name=TYPE,Values=DNS_PRIVATE" --query "Namespaces[?Name=='hanuman.local'].Id | [0]" --output text --region $Region
if (-not $NsId -or $NsId -eq "None") {
    $OpId = Invoke-Aws servicediscovery create-private-dns-namespace --name hanuman.local --vpc $VpcId --region $Region --query OperationId --output text
    do { Start-Sleep 5; $NsId = Invoke-Aws servicediscovery get-operation --operation-id $OpId --query "Operation.Targets.NAMESPACE" --output text --region $Region } while (-not $NsId -or $NsId -eq "None")
}

function Ensure-DiscoveryService($Name) {
    $id = Invoke-Aws servicediscovery list-services --filters "Name=NAMESPACE_ID,Values=$NsId" --query "Services[?Name=='$Name'].Id | [0]" --output text --region $Region
    if ($id -and $id -ne "None") { return $id }
    return Invoke-Aws servicediscovery create-service --name $Name --namespace-id $NsId --dns-config "NamespaceId=$NsId,DnsRecords=[{Type=A,TTL=10}]" --region $Region --query Service.Id --output text
}

$ApiDisc = Ensure-DiscoveryService "api"
$RenderDisc = Ensure-DiscoveryService "render-service"
$PostgresDisc = Ensure-DiscoveryService "postgres"
$RedisDisc = Ensure-DiscoveryService "redis"
$TemporalDisc = Ensure-DiscoveryService "temporal"

# ALB (optional - skip if IAM denies elasticloadbalancing)
$AlbArn = $null
$AlbDns = $null
$TgArn = $null
if (Test-Aws elbv2 describe-load-balancers --names "$EnvironmentName-alb" --region $Region) {
    $AlbArn = Invoke-Aws elbv2 describe-load-balancers --names "$EnvironmentName-alb" --query "LoadBalancers[0].LoadBalancerArn" --output text --region $Region
    $AlbDns = Invoke-Aws elbv2 describe-load-balancers --load-balancer-arns $AlbArn --query "LoadBalancers[0].DNSName" --output text --region $Region
    if (Test-Aws elbv2 describe-target-groups --names "$EnvironmentName-web" --region $Region) {
        $TgArn = Invoke-Aws elbv2 describe-target-groups --names "$EnvironmentName-web" --query "TargetGroups[0].TargetGroupArn" --output text --region $Region
    }
} elseif (Test-Aws elbv2 create-load-balancer --name "$EnvironmentName-alb" --subnets @($SubnetIds) --security-groups $AlbSg --region $Region) {
    $AlbArn = Invoke-Aws elbv2 describe-load-balancers --names "$EnvironmentName-alb" --query "LoadBalancers[0].LoadBalancerArn" --output text --region $Region
    $AlbDns = Invoke-Aws elbv2 describe-load-balancers --load-balancer-arns $AlbArn --query "LoadBalancers[0].DNSName" --output text --region $Region
    $TgArn = Invoke-Aws elbv2 create-target-group --name "$EnvironmentName-web" --protocol HTTP --port 3000 --vpc-id $VpcId --target-type ip --health-check-path / --region $Region --query TargetGroups[0].TargetGroupArn --output text
    Test-Aws elbv2 create-listener --load-balancer-arn $AlbArn --protocol HTTP --port 80 --default-actions "Type=forward,TargetGroupArn=$TgArn" --region $Region | Out-Null
} else {
    Write-Host "    ALB unavailable - exposing web on ECS public IP port 3000" -ForegroundColor Yellow
    $webPortRule = '{"IpProtocol":"tcp","FromPort":3000,"ToPort":3000,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}'
    Test-Aws ec2 authorize-security-group-ingress --group-id $EcsSg --ip-permissions $webPortRule --region $Region | Out-Null
}

$CorsOrigin = if ($AlbDns) { "http://$AlbDns" } else { "*" }

# IAM roles
$ExecRole = "${EnvironmentName}-ecs-exec"
$TaskRole = "${EnvironmentName}-ecs-task"
if (-not (Test-Aws iam get-role --role-name $ExecRole)) {
    [IO.File]::WriteAllText("$env:TEMP\ecs-trust.json", '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}')
    Invoke-Aws iam create-role --role-name $ExecRole --assume-role-policy-document "file://$($env:TEMP.Replace('\','/'))/ecs-trust.json" | Out-Null
    Invoke-Aws iam attach-role-policy --role-name $ExecRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy | Out-Null
}
if (-not (Test-Aws iam get-role --role-name $TaskRole)) {
    [IO.File]::WriteAllText("$env:TEMP\ecs-trust.json", '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}')
    Invoke-Aws iam create-role --role-name $TaskRole --assume-role-policy-document "file://$($env:TEMP.Replace('\','/'))/ecs-trust.json" | Out-Null
    $tp = @"
{"Version":"2012-10-17","Statement":[
{"Effect":"Allow","Action":["s3:*"],"Resource":["arn:aws:s3:::$ArtifactsBucket","arn:aws:s3:::$ArtifactsBucket/*","arn:aws:s3:::remotionlambda-*","arn:aws:s3:::remotionlambda-*/*"]},
{"Effect":"Allow","Action":["lambda:InvokeFunction","lambda:GetFunction"],"Resource":"arn:aws:lambda:${Region}:${AccountId}:function:remotion-render-*"}
]}
"@
    [IO.File]::WriteAllText("$env:TEMP\hanuman-task.json", $tp)
    Invoke-Aws iam put-role-policy --role-name $TaskRole --policy-name hanuman --policy-document "file://$($env:TEMP.Replace('\','/'))/hanuman-task.json" | Out-Null
}
$ExecRoleArn = Invoke-Aws iam get-role --role-name $ExecRole --query Role.Arn --output text
$TaskRoleArn = Invoke-Aws iam get-role --role-name $TaskRole --query Role.Arn --output text

$DatabaseUrl = "postgresql+asyncpg://hanuman:${DbPassword}@postgres.hanuman.local:5432/hanuman"
$AwsKey = aws configure get aws_access_key_id
$AwsSecret = aws configure get aws_secret_access_key

function Register-Task($Family, $Image, $Cpu, $Mem, $Port, $EnvVars, $LogGroup) {
    Test-Aws logs create-log-group --log-group-name $LogGroup --region $Region | Out-Null
    $env = @(); foreach ($k in $EnvVars.Keys) { $env += @{ name = $k; value = [string]$EnvVars[$k] } }
    $c = @{ name = $Family; image = $Image; essential = $true; environment = $env; logConfiguration = @{ logDriver = "awslogs"; options = @{ "awslogs-group" = $LogGroup; "awslogs-region" = $Region; "awslogs-stream-prefix" = "ecs" } } }
    if ($Port) { $c.portMappings = @(@{ containerPort = $Port; protocol = "tcp" }) }
    $td = @{ family = $Family; networkMode = "awsvpc"; requiresCompatibilities = @("FARGATE"); cpu = $Cpu; memory = $Mem; executionRoleArn = $ExecRoleArn; taskRoleArn = $TaskRoleArn; containerDefinitions = @($c) } | ConvertTo-Json -Depth 8
    $p = "$env:TEMP\$Family-td.json"; [IO.File]::WriteAllText($p, $td)
    Invoke-Aws ecs register-task-definition --cli-input-json "file://$($p.Replace('\','/'))" --region $Region | Out-Null
}

Register-Task "$EnvironmentName-postgres" "postgres:16-alpine" "256" "512" 5432 @{ POSTGRES_USER="hanuman"; POSTGRES_PASSWORD=$DbPassword; POSTGRES_DB="hanuman" } "/ecs/$EnvironmentName/postgres"
Register-Task "$EnvironmentName-redis" "redis:7-alpine" "256" "512" 6379 @{} "/ecs/$EnvironmentName/redis"
Register-Task "$EnvironmentName-temporal" "temporalio/auto-setup:1.25.2" "512" "1024" 7233 @{ DB="postgres12"; DB_PORT="5432"; POSTGRES_USER="hanuman"; POSTGRES_PWD=$DbPassword; POSTGRES_SEEDS="postgres.hanuman.local"; DBNAME="temporal" } "/ecs/$EnvironmentName/temporal"

# External provider keys — prefer process env, else repo-root .env (never commit real values)
function Get-EnvOrDotEnv([string]$Name) {
    $fromEnv = [Environment]::GetEnvironmentVariable($Name)
    if ($fromEnv) { return $fromEnv }
    $repoRoot = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
    foreach ($rel in @(".env", "apps/web/.env.local", "apps/web/.env")) {
        $dotEnv = Join-Path $repoRoot $rel
        if (Test-Path $dotEnv) {
            $line = Get-Content $dotEnv | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
            if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)$") {
                return $Matches[1].Trim().Trim('"').Trim("'")
            }
        }
    }
    return ""
}
$OpenRouterKey = Get-EnvOrDotEnv "OPENROUTER_API_KEY"
$PexelsKey = Get-EnvOrDotEnv "PEXELS_API_KEY"
$SarvamKey = Get-EnvOrDotEnv "SARVAM_API_KEY"
if (-not $OpenRouterKey -or -not $PexelsKey -or -not $SarvamKey) {
    Write-Warning "OPENROUTER_API_KEY / PEXELS_API_KEY / SARVAM_API_KEY missing - research/TTS/stock will fail until set"
}

$apiEnv = @{
    DATABASE_URL=$DatabaseUrl; REDIS_URL="redis://redis.hanuman.local:6379/0"; API_BASE_URL="http://api.hanuman.local:8000"
    INTERNAL_API_KEY=$InternalKey; S3_BUCKET=$ArtifactsBucket; S3_REGION=$Region; CORS_ORIGINS=$CorsOrigin
    TEMPORAL_HOST="temporal.hanuman.local:7233"; RENDER_SERVICE_URL="http://render-service.hanuman.local:8081"
    RENDER_ENGINE="remotion-lambda"; HANUMAN_STUB_MODE="false"
    OPENROUTER_API_KEY=$OpenRouterKey; PEXELS_API_KEY=$PexelsKey; SARVAM_API_KEY=$SarvamKey
    S3_ENDPOINT=""; S3_ACCESS_KEY=""; S3_SECRET_KEY=""
}
Register-Task "$EnvironmentName-api" "${EcrBase}/hanuman/api:${ImageTag}" "512" "1024" 8000 $apiEnv "/ecs/$EnvironmentName/api"

# ConcurrentExecutions=10: 8 frame Lambdas + 1 orchestrator + 1 spare.
# ~2800–3250 frames/chunk @ concurrencyPerLambda=3 keeps wall time ≪ 900s.
$renderEnv = @{
    PORT="8081"; AWS_ACCESS_KEY_ID=$AwsKey; AWS_SECRET_ACCESS_KEY=$AwsSecret; AWS_REGION=$Region
    REMOTION_FUNCTION_NAME=$RemotionFunctionName; REMOTION_SERVE_URL=$RemotionServeUrl
    S3_BUCKET_NAME=$ArtifactsBucket; S3_REGION=$Region
    REMOTION_ACCOUNT_CONCURRENCY_LIMIT="10"
    REMOTION_MAX_CONCURRENCY="8"
    REMOTION_CONCURRENCY_PER_LAMBDA="2"
    REMOTION_FUNCTION_MEMORY_MB="3008"
    REMOTION_FUNCTION_TIMEOUT_SEC="900"
    REMOTION_POLL_INTERVAL_MS="1000"
    RENDER_MAX_CONCURRENT="1"
    RENDER_JOB_MAX_RETRIES="3"
}
Register-Task "$EnvironmentName-render" "${EcrBase}/hanuman/render-service:${ImageTag}" "1024" "2048" 8081 $renderEnv "/ecs/$EnvironmentName/render"

$workerEnv = $apiEnv.Clone(); $workerEnv["TEMPORAL_TASK_QUEUE_ORCHESTRATOR"]="orchestrator"; $workerEnv["TEMPORAL_TASK_QUEUE_MEDIA"]="media"
Register-Task "$EnvironmentName-orchestrator" "${EcrBase}/hanuman/orchestrator:${ImageTag}" "512" "1024" $null $workerEnv "/ecs/$EnvironmentName/orchestrator"
Register-Task "$EnvironmentName-media" "${EcrBase}/hanuman/media:${ImageTag}" "512" "1024" $null $workerEnv "/ecs/$EnvironmentName/media"

$MongoUri = Get-EnvOrDotEnv "MONGODB_URI"
$BetterAuthSecret = Get-EnvOrDotEnv "BETTER_AUTH_SECRET"
$DodoKey = Get-EnvOrDotEnv "DODO_PAYMENTS_API_KEY"
if (-not $MongoUri -or -not $BetterAuthSecret) {
    Write-Warning "MONGODB_URI / BETTER_AUTH_SECRET missing — Better Auth disabled until set (ADR 0011)"
}

Register-Task "$EnvironmentName-web" "${EcrBase}/hanuman/web:${ImageTag}" "512" "1024" 3000 @{
    HOSTNAME="0.0.0.0"; PORT="3000"
    NEXT_PUBLIC_API_URL="/api"; API_INTERNAL_URL="http://api.hanuman.local:8000"; NEXT_PUBLIC_PREVIEW_ENGINE="remotion"
    NEXT_PUBLIC_APP_URL=$(Get-EnvOrDotEnv "NEXT_PUBLIC_APP_URL")
    BETTER_AUTH_URL=$(Get-EnvOrDotEnv "BETTER_AUTH_URL")
    BETTER_AUTH_SECRET=$BetterAuthSecret
    MONGODB_URI=$MongoUri
    MONGODB_DB_NAME=$(if (Get-EnvOrDotEnv "MONGODB_DB_NAME") { Get-EnvOrDotEnv "MONGODB_DB_NAME" } else { "skyclip" })
    DODO_PAYMENTS_API_KEY=$DodoKey
    DODO_PAYMENTS_WEBHOOK_KEY=$(Get-EnvOrDotEnv "DODO_PAYMENTS_WEBHOOK_KEY")
    DODO_PAYMENTS_ENVIRONMENT=$(if (Get-EnvOrDotEnv "DODO_PAYMENTS_ENVIRONMENT") { Get-EnvOrDotEnv "DODO_PAYMENTS_ENVIRONMENT" } else { "test_mode" })
} "/ecs/$EnvironmentName/web"

function Deploy-Svc($Name, $Family, $Port, $DiscId, $Tg) {
    $net = "awsvpcConfiguration={subnets=[$($SubnetIds -join ',')],securityGroups=[$EcsSg],assignPublicIp=ENABLED}"
    $svcName = Invoke-Aws ecs describe-services --cluster $EnvironmentName --services $Name --region $Region --query "services[?status=='ACTIVE'].serviceName | [0]" --output text
    $exists = ($svcName -and $svcName -ne "None")
    # Postgres/redis use ephemeral Fargate storage — avoid force redeploy or the DB is wiped.
    $stateful = @("postgres", "redis") -contains $Name
    if ($exists) {
        if ($stateful) {
            Invoke-Aws ecs update-service --cluster $EnvironmentName --service $Name --task-definition $Family --region $Region | Out-Null
        } else {
            Invoke-Aws ecs update-service --cluster $EnvironmentName --service $Name --task-definition $Family --force-new-deployment --region $Region | Out-Null
        }
    } else {
        $args = @("ecs","create-service","--cluster",$EnvironmentName,"--service-name",$Name,"--task-definition",$Family,"--desired-count","1","--launch-type","FARGATE","--network-configuration",$net,"--region",$Region)
        if ($DiscId) { $args += @("--service-registries","registryArn=arn:aws:servicediscovery:${Region}:${AccountId}:service/${DiscId}") }
        if ($Tg) { $args += @("--load-balancers","targetGroupArn=$Tg,containerName=$Family,containerPort=$Port") }
        & aws @args | Out-Null
    }
    Write-Host "  Deployed: $Name"
}

Write-Host "==> Deploying ECS services..." -ForegroundColor Cyan
Deploy-Svc "postgres" "$EnvironmentName-postgres" 5432 $PostgresDisc $null
Deploy-Svc "redis" "$EnvironmentName-redis" 6379 $RedisDisc $null
Start-Sleep 20
Deploy-Svc "temporal" "$EnvironmentName-temporal" 7233 $TemporalDisc $null
Deploy-Svc "render-service" "$EnvironmentName-render" 8081 $RenderDisc $null
Deploy-Svc "api" "$EnvironmentName-api" 8000 $ApiDisc $null
Start-Sleep 30
Deploy-Svc "orchestrator" "$EnvironmentName-orchestrator" 0 $null $null
Deploy-Svc "media" "$EnvironmentName-media" 0 $null $null
Deploy-Svc "web" "$EnvironmentName-web" 3000 $null $TgArn

$State | Add-Member -NotePropertyName loadBalancerDns -NotePropertyValue $AlbDns -Force
$State | ConvertTo-Json -Depth 3 | Set-Content $StatePath -Encoding UTF8

Write-Host ""
Write-Host "==> DEPLOYMENT COMPLETE" -ForegroundColor Green
if ($AlbDns) {
    Write-Host "    URL: http://$AlbDns"
} else {
    Write-Host "    Get web public IP: aws ecs list-tasks --cluster $EnvironmentName --service-name web --region $Region"
    Write-Host "    Then: aws ecs describe-tasks ... and check networkInterfaces association publicIp"
}
Write-Host "    Run migrations after API is healthy (see docs/runbooks/aws-production.md)"
