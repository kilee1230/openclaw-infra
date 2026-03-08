import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // AWS
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCOUNT_ID: z.string().min(12, "AWS account ID is required (12 digits)"),

  // EC2
  EC2_KEY_PAIR_NAME: z.string().default("openclaw-key"),
  EC2_INSTANCE_TYPE: z.string().default("t3.small"),
  EC2_DISK_SIZE_GB: z.coerce.number().int().min(8).max(100).default(20),

  // S3
  S3_BUCKET_PREFIX: z.string().default("openclaw-data"),

  // Cloudflare Tunnel
  CLOUDFLARE_TUNNEL_TOKEN: z
    .string()
    .min(1, "Cloudflare tunnel token is required"),
  CLOUDFLARE_TUNNEL_HOSTNAME: z.string().default("openclaw.example.com"),

  // OpenClaw
  OPENCLAW_IMAGE: z.string().default("ghcr.io/openclaw/openclaw:latest"),
  OPENCLAW_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // LLM Provider API Keys (all optional — configure after deploy if not set)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment configuration:\n");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    console.error("\nCopy .env.example to .env and fill in the values.");
    process.exit(1);
  }

  return result.data;
}

export const env = loadConfig();
