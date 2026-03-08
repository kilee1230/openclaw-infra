#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_IMAGE="${OPENCLAW_IMAGE:-ghcr.io/openclaw/openclaw:latest}"
OPENCLAW_PORT="${OPENCLAW_PORT:-3000}"
S3_BUCKET="${S3_BUCKET:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"

DEPLOY_DIR="/opt/openclaw"
mkdir -p "$DEPLOY_DIR"

# Build optional LLM env lines for docker-compose
LLM_ENV_LINES=""
for KEY in OPENAI_API_KEY ANTHROPIC_API_KEY GOOGLE_API_KEY OPENROUTER_API_KEY MISTRAL_API_KEY; do
  VALUE="${!KEY:-}"
  if [ -n "$VALUE" ]; then
    LLM_ENV_LINES="${LLM_ENV_LINES}      - ${KEY}=${VALUE}
"
  fi
done

echo "Writing docker-compose.yml..."
cat > "$DEPLOY_DIR/docker-compose.yml" <<COMPOSE
services:
  openclaw:
    image: ${OPENCLAW_IMAGE}
    container_name: openclaw
    restart: unless-stopped
    ports:
      - "127.0.0.1:${OPENCLAW_PORT}:${OPENCLAW_PORT}"
    volumes:
      - openclaw-data:/data
    environment:
      - PORT=${OPENCLAW_PORT}
      - S3_BUCKET=${S3_BUCKET}
      - AWS_REGION=${AWS_REGION}
${LLM_ENV_LINES}
volumes:
  openclaw-data:
COMPOSE

echo "Pulling image: ${OPENCLAW_IMAGE}..."
docker compose -f "$DEPLOY_DIR/docker-compose.yml" pull

echo "Starting OpenClaw..."
docker compose -f "$DEPLOY_DIR/docker-compose.yml" up -d

echo "OpenClaw running on 127.0.0.1:${OPENCLAW_PORT}"
docker compose -f "$DEPLOY_DIR/docker-compose.yml" ps
