# Run Alembic migrations against production Postgres (ECS service discovery).
param(
    [string]$Region = "us-east-1",
    [string]$EnvironmentName = "hanuman-prod"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$State = Get-Content (Join-Path $RepoRoot "infrastructure/aws/deployment-state.json") | ConvertFrom-Json
$VpcId = $State.vpcId

$SubnetId = (aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VpcId" --query "Subnets[0].SubnetId" --output text --region $Region)
$EcsSg = aws ec2 describe-security-groups --filters "Name=group-name,Values=$EnvironmentName-ecs" --query "SecurityGroups[0].GroupId" --output text --region $Region

$overridesPath = Join-Path $RepoRoot "tmp-ecs-migrate-overrides.json"
if (-not (Test-Path $overridesPath)) {
    @"
{
  "containerOverrides": [
    {
      "name": "$EnvironmentName-api",
      "command": ["uv", "run", "alembic", "upgrade", "head"]
    }
  ]
}
"@ | Set-Content $overridesPath -Encoding ascii -NoNewline
}

Write-Host "==> Running alembic upgrade head on $EnvironmentName-postgres..." -ForegroundColor Cyan
$taskArn = aws ecs run-task `
    --cluster $EnvironmentName `
    --task-definition "$EnvironmentName-api" `
    --launch-type FARGATE `
    --network-configuration "awsvpcConfiguration={subnets=[$SubnetId],securityGroups=[$EcsSg],assignPublicIp=ENABLED}" `
    --overrides "file://$($overridesPath.Replace('\','/'))" `
    --region $Region `
    --query "tasks[0].taskArn" `
    --output text

if (-not $taskArn -or $taskArn -eq "None") { throw "Failed to start migrate task" }
Write-Host "    Task: $taskArn"

for ($i = 0; $i -lt 60; $i++) {
    $status = aws ecs describe-tasks --cluster $EnvironmentName --tasks $taskArn --region $Region --query "tasks[0].lastStatus" --output text
    if ($status -eq "STOPPED") { break }
    Start-Sleep 5
}

$result = aws ecs describe-tasks --cluster $EnvironmentName --tasks $taskArn --region $Region --query "tasks[0].containers[0].exitCode" --output text
if ($result -ne "0") { throw "Migration failed (exit $result)" }
Write-Host "==> Migrations applied successfully." -ForegroundColor Green
