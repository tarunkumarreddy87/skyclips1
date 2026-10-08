import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8081),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  S3_BUCKET_NAME: z.string().default("hanuman-artifacts"),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  REDIS_URL: z.string().optional(),
  RENDER_GLOBAL_MAX_CONCURRENT: z.coerce.number().int().min(1).max(16).optional(),
  RENDER_PYTHON_EXECUTABLE: z.string().optional(),
  RENDER_ENCODER: z.enum(["auto", "libx264", "h264_nvenc"]).default("auto"),
  RENDER_PARALLEL_SECTIONS: z.coerce.number().int().min(1).max(8).default(2),
  RENDER_JOB_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
  RENDER_MAX_CONCURRENT: z.coerce.number().int().min(1).max(16).default(1),
  RENDER_JOB_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  RENDER_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(7_200_000),
  RENDER_SERVICE_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;
export const config = envSchema.parse(process.env);
