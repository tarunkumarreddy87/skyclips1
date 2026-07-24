import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8081),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  /** AWS credentials for Remotion Lambda (real AWS — not MinIO). */
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default("us-east-1"),

  REMOTION_FUNCTION_NAME: z.string().optional(),
  REMOTION_SERVE_URL: z.string().optional(),
  REMOTION_SITE_NAME: z.string().default("hanuman-timeline"),
  REMOTION_BUCKET_NAME: z.string().optional(),
  REMOTION_FRAMES_PER_LAMBDA: z.coerce.number().optional(),
  /** Target parallel frame Lambdas (≤ account limit − 2). Default 8 = full safe budget. */
  REMOTION_MAX_CONCURRENCY: z.coerce.number().default(8),
  /** AWS account regional concurrent Lambda limit (10 for this account). */
  REMOTION_ACCOUNT_CONCURRENCY_LIMIT: z.coerce.number().default(10),
  /**
   * Browser tabs per Lambda chunk (Remotion concurrencyPerLambda).
   * Local benchmark: 3 tabs best throughput for this composition; see isolate notes.
   */
  REMOTION_CONCURRENCY_PER_LAMBDA: z.coerce.number().default(2),
  REMOTION_FUNCTION_MEMORY_MB: z.coerce.number().default(3008),
  REMOTION_FUNCTION_TIMEOUT_SEC: z.coerce.number().default(900),
  REMOTION_FUNCTION_DISK_MB: z.coerce.number().default(2048),
  REMOTION_MAX_RETRIES: z.coerce.number().default(2),
  REMOTION_POLL_INTERVAL_MS: z.coerce.number().default(1000),

  /** Artifacts bucket (MinIO locally, S3 in production). */
  S3_BUCKET_NAME: z.string().default("hanuman-artifacts"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),

  RENDER_JOB_TTL_MS: z.coerce.number().default(86_400_000),
  /** Only one Remotion job at a time — critical when account concurrency is 10. */
  RENDER_MAX_CONCURRENT: z.coerce.number().default(1),
  RENDER_JOB_MAX_RETRIES: z.coerce.number().default(2),

  /** Optional shared secret for internal callers. */
  RENDER_SERVICE_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid render-service configuration:\n${missing}`);
  }
  return parsed.data;
}

export function assertLambdaReady(): void {
  if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Lambda rendering");
  }
  if (!config.REMOTION_SERVE_URL) {
    throw new Error("REMOTION_SERVE_URL is required. Run: ./infrastructure/remotion-lambda/deploy.sh");
  }
}

export const config = loadConfig();

/** Remotion Lambda client expects REMOTION_AWS_* env vars. */
export function applyRemotionEnv(): void {
  if (config.AWS_ACCESS_KEY_ID) {
    process.env.REMOTION_AWS_ACCESS_KEY_ID = config.AWS_ACCESS_KEY_ID;
  }
  if (config.AWS_SECRET_ACCESS_KEY) {
    process.env.REMOTION_AWS_SECRET_ACCESS_KEY = config.AWS_SECRET_ACCESS_KEY;
  }
  process.env.REMOTION_AWS_REGION = config.AWS_REGION;
  if (config.REMOTION_FUNCTION_NAME) {
    process.env.REMOTION_FUNCTION_NAME = config.REMOTION_FUNCTION_NAME;
  }
  if (config.REMOTION_SERVE_URL) {
    process.env.REMOTION_SERVE_URL = config.REMOTION_SERVE_URL;
  }
  if (config.REMOTION_FRAMES_PER_LAMBDA && config.REMOTION_FRAMES_PER_LAMBDA > 0) {
    process.env.REMOTION_FRAMES_PER_LAMBDA = String(config.REMOTION_FRAMES_PER_LAMBDA);
  }
  process.env.REMOTION_MAX_CONCURRENCY = String(config.REMOTION_MAX_CONCURRENCY);
  process.env.REMOTION_CONCURRENCY_PER_LAMBDA = String(config.REMOTION_CONCURRENCY_PER_LAMBDA);
  process.env.REMOTION_FUNCTION_TIMEOUT_SEC = String(config.REMOTION_FUNCTION_TIMEOUT_SEC);
  process.env.REMOTION_FUNCTION_MEMORY_MB = String(config.REMOTION_FUNCTION_MEMORY_MB);
}
