#!/usr/bin/env bash
# Deploy Remotion Lambda infrastructure on AWS (us-east-1 by default).
#
# Prerequisites:
#   - AWS CLI configured (aws sts get-caller-identity)
#   - Node.js 22 + pnpm
#   - IAM user with permissions to create Lambda, S3, IAM (see docs/IAM.md)
#
# Usage:
#   export AWS_ACCESS_KEY_ID=...
#   export AWS_SECRET_ACCESS_KEY=...
#   export AWS_REGION=us-east-1
#   ./deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"

echo "==> HANUMAN Remotion Lambda deploy (region: $REGION)"

# Validate AWS credentials
aws sts get-caller-identity --region "$REGION" >/dev/null
echo "    AWS identity OK"

# Generate Remotion IAM policies (authoritative — do not hand-edit)
echo "==> Generating Remotion IAM policies"
cd "$REPO_ROOT/packages/remotion-renderer"
pnpm exec remotion lambda policies role > "$SCRIPT_DIR/policies/remotion-lambda-role-policy.json" 2>/dev/null || true
pnpm exec remotion lambda policies user > "$SCRIPT_DIR/policies/remotion-user-policy.json" 2>/dev/null || true
pnpm exec remotion lambda policies validate

# Ensure IAM role exists (Remotion requires exact name remotion-lambda-role)
ROLE_NAME="remotion-lambda-role"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "==> Creating IAM role: $ROLE_NAME"
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'
  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name remotion-lambda-policy \
    --policy-document "file://$SCRIPT_DIR/policies/remotion-lambda-role-policy.json"
else
  echo "    IAM role $ROLE_NAME already exists"
fi

# Deploy function + site via render-service
echo "==> Deploying Remotion Lambda function and site"
export REMOTION_AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
export REMOTION_AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
export REMOTION_AWS_REGION="$REGION"

cd "$REPO_ROOT"
pnpm --filter @hanuman/render-service lambda:deploy

echo ""
echo "==> Deployment complete. Add the printed env vars to your secrets store."
echo "    Set RENDER_ENGINE=remotion-lambda in production."
echo "    Request Lambda concurrency quota increase for 10+ minute parallel renders:"
echo "      cd packages/remotion-renderer && pnpm lambda:quotas"
