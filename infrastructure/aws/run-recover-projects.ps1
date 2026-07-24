# Rebuild project rows in Postgres from S3 artifacts (after DB wipe).
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

$overridesPath = Join-Path $RepoRoot "tmp-ecs-recover-overrides.json"
@"
{
  "containerOverrides": [
    {
      "name": "$EnvironmentName-api",
      "command": ["uv", "run", "python", "-m", "app.scripts.recover_projects_from_s3"]
    }
  ]
}
"@ | Set-Content $overridesPath -Encoding ascii -NoNewline

Write-Host "==> Recovering projects from S3 on $EnvironmentName-postgres..." -ForegroundColor Cyan
$taskArn = aws ecs run-task `
    --cluster $EnvironmentName `
    --task-definition "$EnvironmentName-api" `
    --launch-type FARGATE `
    --network-configuration "awsvpcConfiguration={subnets=[$SubnetId],securityGroups=[$EcsSg],assignPublicIp=ENABLED}" `
    --overrides "file://$($overridesPath.Replace('\','/'))" `
    --region $Region `
    --query "tasks[0].taskArn" `
    --output text

if (-not $taskArn -or $taskArn -eq "None") { throw "Failed to start recovery task" }
Write-Host "    Task: $taskArn"

for ($i = 0; $i -lt 60; $i++) {
    $status = aws ecs describe-tasks --cluster $EnvironmentName --tasks $taskArn --region $Region --query "tasks[0].lastStatus" --output text
    if ($status -eq "STOPPED") { break }
    Start-Sleep 5
}

$exitCode = aws ecs describe-tasks --cluster $EnvironmentName --tasks $taskArn --region $Region --query "tasks[0].containers[0].exitCode" --output text
$logGroup = "/ecs/$EnvironmentName/api"
$stream = aws logs describe-log-streams --log-group-name $logGroup --order-by LastEventTime --descending --limit 1 --region $Region --query "logStreams[0].logStreamName" --output text 2>$null
if ($stream -and $stream -ne "None") {
    Write-Host "==> Recent API logs:" -ForegroundColor Cyan
    aws logs get-log-events --log-group-name $logGroup --log-stream-name $stream --limit 30 --region $Region --query "events[*].message" --output text
}

if ($exitCode -ne "0") { throw "Recovery failed (exit $exitCode)" }
Write-Host "==> Project recovery completed." -ForegroundColor Green
