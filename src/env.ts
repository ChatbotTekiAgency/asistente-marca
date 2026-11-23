
import { z } from "zod";
import { modeloAnthropic } from "./lib/anthropic-modelo";
import { MAX_COMPETIDORES } from "./lib/competencia/contrato";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  ACCESS_KEY: z.string().min(32, "ACCESS_KEY debe tener al menos 32 caracteres"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  ENCRYPTION_KEY: z.string().min(1, "Falta ENCRYPTION_KEY"),
  ANTHROPIC_API_KEY: z.string().trim().optional().transform((valor) => valor || undefined),
  ANTHROPIC_MODEL: z.string().trim().optional().transform((valor) => valor || undefined),
  AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  AI_DAILY_REQUEST_LIMIT: z.string().regex(/^\d+$/).transform(Number)
    .pipe(z.number().int().min(1).max(1000)).default(20),
  CRON_SECRET: z.string().min(32, "CRON_SECRET debe tener al menos 32 caracteres"),
  APIFY_TOKEN: z.string().trim().optional(),
  COMPETIDORES_MAX_ACTIVOS: z.string().regex(/^[1-5]$/).transform(Number).default(MAX_COMPETIDORES),
}).superRefine((config, ctx) => {
  if (config.AI_PROVIDER !== "anthropic") return;
  for (const campo of ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"] as const) {
    if (!config[campo]) {
      ctx.addIssue({ code: "custom", path: [campo], message: `Falta ${campo} para activar Anthropic` });
    }
  }
  if (config.ANTHROPIC_MODEL && !modeloAnthropic.safeParse(config.ANTHROPIC_MODEL).success) {
    ctx.addIssue({ code: "custom", path: ["ANTHROPIC_MODEL"], message: "Identificador de modelo inválido." });
  }
});

export const env = envSchema.parse(process.env);
