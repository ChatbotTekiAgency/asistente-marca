
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  ACCESS_KEY: z.string().min(32, "ACCESS_KEY debe tener al menos 32 caracteres"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  ENCRYPTION_KEY: z.string().min(1, "Falta ENCRYPTION_KEY"),
  ANTHROPIC_API_KEY: z.string().min(1, "Falta ANTHROPIC_API_KEY"),
  CRON_SECRET: z.string().min(32, "CRON_SECRET debe tener al menos 32 caracteres"),
});

export const env = envSchema.parse(process.env);
