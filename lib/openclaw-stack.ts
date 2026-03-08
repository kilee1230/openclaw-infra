import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./config";

export class OpenClawStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3 Bucket ──────────────────────────────────────────────────
    const bucket = new s3.Bucket(this, "DataBucket", {
      bucketName: `${env.S3_BUCKET_PREFIX}-${this.account.slice(-8)}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "cleanup-old-backups",
          prefix: "backups/",
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // ── VPC (default) ──────────────────────────────────────────────
    const vpc = ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    // ── Security Group (no inbound, all outbound) ──────────────────
    const sg = new ec2.SecurityGroup(this, "InstanceSG", {
      vpc,
      description: "OpenClaw - no inbound, outbound only (Cloudflare tunnel)",
      allowAllOutbound: true,
    });
    cdk.Tags.of(sg).add("Name", "openclaw-sg");

    // ── IAM Role ───────────────────────────────────────────────────
    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "EC2 role for OpenClaw with S3 access",
    });

    bucket.grantReadWrite(role);

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    // ── User Data ──────────────────────────────────────────────────
    const userData = ec2.UserData.forLinux();

    const scriptsDir = join(__dirname, "..", "scripts");
    const installDocker = readFileSync(join(scriptsDir, "install-docker.sh"), "utf-8");
    const installCloudflared = readFileSync(join(scriptsDir, "install-cloudflared.sh"), "utf-8");
    const deployOpenclaw = readFileSync(join(scriptsDir, "deploy-openclaw.sh"), "utf-8");

    userData.addCommands(
      "set -euo pipefail",
      'exec > >(tee /var/log/openclaw-bootstrap.log) 2>&1',
      `echo "=== OpenClaw Bootstrap ==="`,
      `echo "Starting at $(date)"`,
      "",
      "export DEBIAN_FRONTEND=noninteractive",
      "apt-get update -qq",
      "apt-get upgrade -y -qq",
      "apt-get install -y -qq curl wget git unzip jq",
      "",
      `export CLOUDFLARE_TUNNEL_TOKEN="${env.CLOUDFLARE_TUNNEL_TOKEN}"`,
      `export CLOUDFLARE_TUNNEL_HOSTNAME="${env.CLOUDFLARE_TUNNEL_HOSTNAME}"`,
      `export OPENCLAW_IMAGE="${env.OPENCLAW_IMAGE}"`,
      `export OPENCLAW_PORT="${env.OPENCLAW_PORT}"`,
      `export S3_BUCKET="${bucket.bucketName}"`,
      `export AWS_REGION="${env.AWS_REGION}"`,
    );

    // Pass LLM API keys to user data (only if set)
    const llmKeys = {
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: env.GOOGLE_API_KEY,
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
      MISTRAL_API_KEY: env.MISTRAL_API_KEY,
    };

    const llmExports = Object.entries(llmKeys)
      .filter(([, v]) => v)
      .map(([k, v]) => `export ${k}="${v}"`);

    if (llmExports.length) {
      userData.addCommands("# --- LLM Provider API Keys ---", ...llmExports);
    }

    userData.addCommands("# --- Install Docker ---", ...installDocker.split("\n").filter(
      (line) => !line.startsWith("#!") && !line.startsWith("set -")
    ));

    userData.addCommands("# --- Install cloudflared ---", ...installCloudflared.split("\n").filter(
      (line) => !line.startsWith("#!") && !line.startsWith("set -")
    ));

    userData.addCommands("# --- Deploy OpenClaw ---", ...deployOpenclaw.split("\n").filter(
      (line) => !line.startsWith("#!") && !line.startsWith("set -")
    ));

    userData.addCommands(
      "",
      `echo "=== Bootstrap Complete ==="`,
      `echo "Finished at $(date)"`,
    );

    // ── AMI (Ubuntu 22.04) ─────────────────────────────────────────
    const ami = ec2.MachineImage.fromSsmParameter(
      "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id",
      { os: ec2.OperatingSystemType.LINUX }
    );

    // ── Launch Template with Spot ──────────────────────────────────
    const launchTemplate = new ec2.LaunchTemplate(this, "LaunchTemplate", {
      instanceType: new ec2.InstanceType(env.EC2_INSTANCE_TYPE),
      machineImage: ami,
      securityGroup: sg,
      role,
      userData,
      keyName: env.EC2_KEY_PAIR_NAME,
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(env.EC2_DISK_SIZE_GB, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
          }),
        },
      ],
      spotOptions: {
        requestType: ec2.SpotRequestType.PERSISTENT,
        interruptionBehavior: ec2.SpotInstanceInterruption.STOP,
      },
    });

    // ── EC2 Instance via CfnInstance (spot via launch template) ────
    const instance = new ec2.CfnInstance(this, "Instance", {
      launchTemplate: {
        launchTemplateId: launchTemplate.launchTemplateId,
        version: launchTemplate.versionNumber,
      },
      tags: [
        { key: "Name", value: "openclaw-server" },
        { key: "Project", value: "openclaw" },
      ],
    });

    // ── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket for OpenClaw data and backups",
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.ref,
      description: "EC2 instance ID",
    });

    new cdk.CfnOutput(this, "SecurityGroupId", {
      value: sg.securityGroupId,
      description: "Security group ID (no inbound ports)",
    });

    new cdk.CfnOutput(this, "TunnelHostname", {
      value: `https://${env.CLOUDFLARE_TUNNEL_HOSTNAME}`,
      description: "Cloudflare Tunnel URL for OpenClaw",
    });
  }
}
