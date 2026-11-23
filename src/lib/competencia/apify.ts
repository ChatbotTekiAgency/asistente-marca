import "server-only";

import { z } from "zod";
import { env } from "@/env";
import { crearClienteApify, iniciarInstagram, leerDatasetInstagram } from "@/lib/instagram/apify-cliente";
import { MAX_RESULTADOS_APIFY } from "./contrato-ingesta";
import type { ClienteCorridas } from "./corridas";

const schema = z.object({
  APIFY_COMPETIDORES_HABILITADO: z.literal("true"),
  APIFY_COMPETIDORES_MAX_USD: z.coerce.number().min(0.01).max(100),
  APIFY_COMPETIDORES_MAX_RESULTADOS: z.coerce.number().int().min(1).max(MAX_RESULTADOS_APIFY).default(20),
});

export function configuracionApifyCompetidores() {
  const config = schema.safeParse(process.env);
  return env.APIFY_TOKEN && config.success
    ? { limite: config.data.APIFY_COMPETIDORES_MAX_RESULTADOS, maxUsd: config.data.APIFY_COMPETIDORES_MAX_USD }
    : null;
}

export function clienteApifyCompetidores(): ClienteCorridas | null {
  if (!env.APIFY_TOKEN) return null;
  const cliente = crearClienteApify(env.APIFY_TOKEN, 8);
  return {
    iniciar: (username, limite, maxUsd) => iniciarInstagram(cliente, username, limite, maxUsd),
    consultar: (id) => cliente.run(id).get(),
    cancelar: (id) => cliente.run(id).abort(),
    dataset: (id, limite) => leerDatasetInstagram(cliente, id, limite),
  };
}
