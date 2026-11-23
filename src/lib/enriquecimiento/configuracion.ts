import { z } from "zod";
import { modeloAnthropic } from "../anthropic-modelo.ts";
import { MAX_LOTE } from "./contrato.ts";

const proveedorSchema = z.object({
  ENRICHMENT_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
});
export const origenImagenEnriquecimiento = z.string().trim().regex(/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/).optional();
const comun = {
  ENRICHMENT_MAX_BATCH_POSTS: z.coerce.number().int().min(1).max(MAX_LOTE).default(MAX_LOTE),
  ENRICHMENT_IMAGE_ORIGIN: origenImagenEnriquecimiento,
};
const mock = z.object(comun);
const anthropic = z.object({
  ...comun,
  ANTHROPIC_API_KEY: z.string().trim().min(1),
  ANTHROPIC_MODEL: modeloAnthropic,
  ENRICHMENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(200).max(2000).default(600),
  ENRICHMENT_MAX_INPUT_TOKENS: z.coerce.number().int().min(1000).max(100_000).default(12_000),
  ENRICHMENT_MAX_BATCH_USD: z.coerce.number().positive().max(100),
  ENRICHMENT_INPUT_USD_PER_MTOK: z.coerce.number().positive().max(1000),
  ENRICHMENT_OUTPUT_USD_PER_MTOK: z.coerce.number().positive().max(1000),
});

export function leerConfiguracionEnriquecimiento(variables: Record<string, string | undefined>) {
  const { ENRICHMENT_PROVIDER: proveedor } = proveedorSchema.parse(variables);
  if (proveedor === "mock") return { proveedor, ...mock.parse(variables) };
  return { proveedor, ...anthropic.parse(variables) };
}

export function diagnosticoConfiguracion(error: unknown) {
  if (!(error instanceof z.ZodError)) return "No se pudo leer la configuración de enriquecimiento.";
  const nombres = [...new Set(error.issues.map(({ path }) => path.join(".")))].filter(Boolean);
  return `Revisa las variables de enriquecimiento faltantes o inválidas: ${nombres.join(", ")}.`;
}
