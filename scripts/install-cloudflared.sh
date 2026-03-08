#!/usr/bin/env bash
set -euo pipefail

if command -v cloudflared &>/dev/null; then
  echo "cloudflared already installed: $(cloudflared --version)"
else
  echo "Installing cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
    -o /tmp/cloudflared.deb
  dpkg -i /tmp/cloudflared.deb
  rm -f /tmp/cloudflared.deb
  echo "cloudflared installed: $(cloudflared --version)"
fi

if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo "WARNING: CLOUDFLARE_TUNNEL_TOKEN not set — skipping tunnel setup."
  exit 0
fi

echo "Installing cloudflared tunnel as systemd service..."

cloudflared service install "${CLOUDFLARE_TUNNEL_TOKEN}"

systemctl enable cloudflared
systemctl start cloudflared

echo "cloudflared tunnel service started."
