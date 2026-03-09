#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-5}"
STACK_NAME="${CDK_STACK_NAME:-OpenClawStack}"
LOCAL_PORT="${LOCAL_PORT:-18789}"
REMOTE_PORT="${REMOTE_PORT:-18789}"
MODE="${1:-tunnel}"

INSTANCE_ID=$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)

if [ -z "$INSTANCE_ID" ]; then
  echo "Error: Could not find instance ID from stack $STACK_NAME"
  exit 1
fi

echo "Instance: $INSTANCE_ID"

case "$MODE" in
  tunnel)
    echo "Starting port forward: localhost:${LOCAL_PORT} → EC2:${REMOTE_PORT}"
    echo "Open http://localhost:${LOCAL_PORT} in your browser"
    echo ""
    aws ssm start-session \
      --region "$REGION" \
      --target "$INSTANCE_ID" \
      --document-name AWS-StartPortForwardingSession \
      --parameters "{\"portNumber\":[\"${REMOTE_PORT}\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
    ;;
  shell)
    echo "Starting SSM shell session..."
    aws ssm start-session \
      --region "$REGION" \
      --target "$INSTANCE_ID"
    ;;
  *)
    echo "Usage: $0 [tunnel|shell]"
    echo "  tunnel  - Port forward localhost:${LOCAL_PORT} to EC2 (default)"
    echo "  shell   - Interactive shell on EC2"
    exit 1
    ;;
esac
