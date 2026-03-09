# OpenClaw Infrastructure

![Status: WIP](https://img.shields.io/badge/status-WIP-yellow)

> **Warning** — This project is under active development and not yet production-ready.

Minimal, cost-efficient personal deployment of OpenClaw on AWS using CDK, with Cloudflare Tunnel for secure access.

## Architecture

```
User
  │
  ▼
Cloudflare DNS (openclaw.example.com)
  │
  ▼
Cloudflare Tunnel (encrypted)
  │
  ▼
EC2 Spot Instance (no public ports)
  │
  ├─ Docker
  │    └─ OpenClaw (localhost:3000)
  │
  └─ S3 (data / backups)
```

> A proper AWS architecture diagram is auto-generated from the CDK stack using **cdk-graph**.
> Run `pnpm diagram` to produce SVG/PNG/DOT files in `cdk.out/` — see [Architecture Diagram](#architecture-diagram) below.

**Design decisions:**

- **AWS CDK** — Infrastructure as code, single `cdk deploy` provisions everything
- **EC2 Spot Instance** — `t3.small` at ~60–70% discount vs on-demand
- **No public ports** — Security group blocks all inbound traffic
- **Cloudflare Tunnel** — Secure ingress without exposing the instance
- **S3** — Persistent storage and backups with 30-day lifecycle on backup prefix
- **Zod** — All environment variables validated at synth/deploy time
- **SSM** — Instance includes SSM agent for emergency access without SSH
- **cdk-graph** — Auto-generated architecture diagrams from the live CDK stack

## Cost Estimate (ap-southeast-5 / Malaysia)

| Resource                          | Monthly   |
| --------------------------------- | --------- |
| EC2 Spot `t3.small` (~$0.0075/hr) | ~$4–5     |
| EBS 20 GB gp3 ($0.0864/GB)        | ~$1.73    |
| S3 (minimal)                      | ~$0.10    |
| Data transfer                     | ~$0–0.50  |
| Cloudflare Tunnel                 | Free      |
| **Total**                         | **~$6–7** |

## Prerequisites

- Node.js 24 (see `.nvmrc` — run `nvm use` to activate)
- pnpm
- AWS CLI configured (`aws configure`) or env vars
- AWS CDK bootstrapped in target account/region (`npx cdk bootstrap`)
- Cloudflare account with a domain
- An EC2 key pair created in the target region (or let CDK reference one by name)

## Setup

### 1. Clone and install

```bash
git clone <repo-url> openclaw-infra
cd openclaw-infra
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012

EC2_KEY_PAIR_NAME=openclaw-key
EC2_INSTANCE_TYPE=t3.small
EC2_DISK_SIZE_GB=20

S3_BUCKET_PREFIX=openclaw-data

CLOUDFLARE_TUNNEL_TOKEN=eyJ...
CLOUDFLARE_TUNNEL_HOSTNAME=openclaw.yourdomain.com

OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:latest
OPENCLAW_PORT=3000
```

### 3. Create Cloudflare Tunnel

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks → Tunnels**
3. Create a tunnel named `openclaw`
4. Copy the tunnel token into `CLOUDFLARE_TUNNEL_TOKEN`
5. Add a public hostname pointing to `http://localhost:18789`

### 4. Bootstrap CDK (first time only)

```bash
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

### 5. Create EC2 key pair (if needed)

```bash
aws ec2 create-key-pair \
  --key-name openclaw-key \
  --key-type ed25519 \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/openclaw-key.pem
chmod 400 ~/.ssh/openclaw-key.pem
```

## Deploy

```bash
# Preview changes
pnpm diff

# Deploy everything
pnpm deploy
```

CDK provisions the full stack in one command:

- S3 bucket with encryption and public access block
- IAM role with scoped S3 read/write + SSM access
- Security group with zero inbound rules
- EC2 Spot instance with user data that installs Docker, cloudflared, and starts OpenClaw

### Check outputs

After deploy, CDK prints:

```
Outputs:
OpenClawStack.BucketName = openclaw-data-12345678
OpenClawStack.InstanceId = i-0abc123def456
OpenClawStack.SecurityGroupId = sg-0abc123def456
OpenClawStack.TunnelHostname = https://openclaw.yourdomain.com
```

## Architecture Diagram

This project uses [`@aws/pdk` cdk-graph-plugin-diagram](https://aws.github.io/aws-pdk/developer_guides/cdk-graph-plugin-diagram/index.html) to auto-generate AWS architecture diagrams directly from the CDK stack.

### Generate diagrams

```bash
pnpm diagram
```

This runs `cdk synth` and produces the following files in `cdk.out/`:

| File                   | Format | Description                                      |
| ---------------------- | ------ | ------------------------------------------------ |
| `openclaw-compact.svg` | SVG    | Compact view — high-level resource relationships |
| `openclaw-compact.png` | PNG    | Same as above, raster format                     |
| `openclaw-compact.dot` | DOT    | Graphviz source for custom rendering             |
| `openclaw-verbose.svg` | SVG    | Verbose view — all constructs and CFN resources  |
| `openclaw-verbose.png` | PNG    | Same as above, raster format                     |
| `openclaw-verbose.dot` | DOT    | Graphviz source                                  |

Both diagrams use a dark theme. The compact preset filters out internal CDK constructs for a clean overview, while the verbose preset shows the full construct tree.

### Prerequisites for diagram rendering

SVG and PNG generation requires [Graphviz](https://graphviz.org/) installed locally:

```bash
# macOS
brew install graphviz

# Ubuntu/Debian
sudo apt-get install -y graphviz
```

If Graphviz is not installed, DOT files are still generated and can be rendered later or pasted into online viewers like [Graphviz Online](https://dreampuf.github.io/GraphvizOnline/).

## Tear Down

```bash
pnpm destroy
```

The S3 bucket uses `RETAIN` removal policy — delete it manually via the AWS console if needed.

## Project Structure

```
openclaw-infra/
├── package.json
├── tsconfig.json
├── cdk.json                    # CDK app config
├── .env.example                # Environment template
├── bin/
│   └── app.ts                  # CDK app entry point
├── lib/
│   ├── config.ts               # Zod-validated env config
│   └── openclaw-stack.ts       # CDK stack (EC2 spot, S3, IAM, SG)
├── scripts/
│   ├── install-docker.sh       # Docker CE installation
│   ├── install-cloudflared.sh  # Cloudflare tunnel systemd setup
│   └── deploy-openclaw.sh      # Docker Compose for OpenClaw
├── docker/
│   └── docker-compose.yml      # Reference compose file
└── cloudflare/
    └── config.yml              # Reference Cloudflare Tunnel config
```

## Security

- **No inbound ports** — Security group has zero ingress rules
- **Cloudflare Tunnel** — All user traffic routed through Cloudflare's encrypted tunnel
- **S3 encryption** — Server-side AES-256
- **S3 public access** — All public access blocked
- **Docker binding** — OpenClaw listens on `127.0.0.1` only
- **SSM access** — Emergency shell access via AWS Systems Manager (no SSH needed)
- **Zod validation** — Misconfigurations caught before deploy

## Spot Instance Behavior

The launch template uses **persistent** spot with **stop** interruption behavior:

- If AWS reclaims capacity, the instance **stops** (not terminates)
- When capacity returns, it **restarts** automatically
- EBS data is preserved across stop/start cycles
- cloudflared reconnects automatically on restart

## Troubleshooting

### View bootstrap logs

```bash
# Via SSM (no SSH needed)
aws ssm start-session --target i-0abc123def456

# Then on instance:
cat /var/log/openclaw-bootstrap.log
```

### Check services

```bash
# Docker
sudo docker ps
sudo docker logs openclaw

# Cloudflare tunnel
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

### Redeploy

Update `.env` or scripts, then run `pnpm deploy` again. CDK replaces the instance with fresh user data.

## License

MIT
