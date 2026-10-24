import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_URL: process.env.APP_URL,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}
