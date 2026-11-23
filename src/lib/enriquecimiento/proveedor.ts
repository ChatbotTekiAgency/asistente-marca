import "server-only";

import { crearClasificador } from "./anthropic";
import { leerConfiguracionEnriquecimiento } from "./configuracion";
import { clasificarMock } from "./motor";

export function configurarEnriquecimiento() {
  const config = leerConfiguracionEnriquecimiento(process.env);
  const { ENRICHMENT_IMAGE_ORIGIN: origen, ENRICHMENT_MAX_BATCH_POSTS: maxPublicaciones } = config;
  if (config.proveedor === "mock") {
    return { proveedor: config.proveedor, modelo: "mock-v1", presupuesto: 0, tarifaEntrada: 0, tarifaSalida: 0,
      maxEntrada: 0, maxSalida: 0, origen, maxPublicaciones, clasificar: clasificarMock };
  }
  const { ANTHROPIC_API_KEY: apiKey, ANTHROPIC_MODEL: modelo,
    ENRICHMENT_MAX_BATCH_USD: presupuesto, ENRICHMENT_INPUT_USD_PER_MTOK: tarifaEntrada,
    ENRICHMENT_OUTPUT_USD_PER_MTOK: tarifaSalida, ENRICHMENT_MAX_INPUT_TOKENS: maxEntrada,
    ENRICHMENT_MAX_OUTPUT_TOKENS: maxSalida } = config;
  return { proveedor: config.proveedor, modelo, presupuesto, tarifaEntrada, tarifaSalida, maxEntrada, maxSalida,
    origen, maxPublicaciones, clasificar: crearClasificador(apiKey, modelo, maxEntrada, maxSalida) };
}
