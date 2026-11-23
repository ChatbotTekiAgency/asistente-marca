import { z } from "zod";
import { modeloAnthropic } from "../anthropic-modelo.ts";

const proveedor = z.enum(["mock", "anthropic"]).default("mock");
const modelosConBusqueda = new Set(["claude-haiku-5-5", "claude-sonnet-4-6", "claude-opus-4-6"]);
const mercado = z.string().trim().min(2).max(100).optional();
const limites = z.object({
  TRENDS_CACHE_HOURS: z.coerce.number().int().min(12).max(24).default(24),
  TRENDS_DAILY_LIMIT: z.coerce.number().int().min(1).max(20).default(3),
  TRENDS_MARKET: mercado,
});
const real = z.object({
  ANTHROPIC_API_KEY: z.string().trim().min(1),
  TRENDS_ANTHROPIC_MODEL: modeloAnthropic.refine((modelo) => modelosConBusqueda.has(modelo), "Modelo de tendencias sin compatibilidad documentada."),
  TRENDS_MAX_SEARCHES: z.coerce.number().int().min(1).max(5).default(3),
  TRENDS_MAX_INPUT_TOKENS: z.coerce.number().int().min(2000).max(100_000).default(40_000),
  TRENDS_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1000).max(4000).default(2000),
  TRENDS_TIMEOUT_MS: z.coerce.number().int().min(5000).max(80_000).default(60_000),
  TRENDS_MAX_COST_USD: z.coerce.number().positive().max(50),
  TRENDS_INPUT_USD_PER_MTOK: z.coerce.number().positive().max(1000),
  TRENDS_OUTPUT_USD_PER_MTOK: z.coerce.number().positive().max(1000),
}).extend(limites.shape);

export type ConfiguracionTendenciasAnthropic = z.infer<typeof real>;

export function leerLimitesTendencias(variables: Record<string, string | undefined>) {
  return limites.parse(variables);
}

export function leerConfiguracionTendencias(variables: Record<string, string | undefined>) {
  const modo = proveedor.parse(variables.TRENDS_PROVIDER);
  if (modo === "mock") return { proveedor: modo, ...leerLimitesTendencias(variables) };
  return { proveedor: modo, ...real.parse({
    ...variables, TRENDS_ANTHROPIC_MODEL: variables.TRENDS_ANTHROPIC_MODEL ?? variables.ANTHROPIC_MODEL,
  }) };
}
