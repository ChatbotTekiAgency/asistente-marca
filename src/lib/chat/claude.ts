import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { db } from "@/db";
import { env } from "@/env";
import { obtenerContextoMarca } from "@/lib/marca/servidor";
import { origenImagenEnriquecimiento } from "@/lib/enriquecimiento/configuracion";
import { crearGeneradorConHerramientas } from "./generar-con-herramientas";
import { crearHerramientasCompetencia } from "./herramientas-competencia";
import { crearHerramientasInstagram } from "./herramientas-instagram";
import { crearHerramientaLectura } from "./herramientas-lectura";
import { crearHerramientasSemanticas } from "./herramientas-semanticas";
import type { GenerarRespuesta } from "./proveedor";

export function responderClaude(cuenta: { id: string; username: string }): GenerarRespuesta {
  return async (contexto, signal, emitir) => {
    if (env.AI_PROVIDER !== "anthropic" || !env.ANTHROPIC_API_KEY || !env.ANTHROPIC_MODEL) {
      throw new Error("Anthropic no está habilitado.");
    }
    signal.throwIfAborted();
    const marca = await obtenerContextoMarca(cuenta.id);
    signal.throwIfAborted();
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const lectura = crearHerramientaLectura();
    const origenImagen = origenImagenEnriquecimiento.safeParse(process.env.ENRICHMENT_IMAGE_ORIGIN).data;
    const herramientas = {
      ...crearHerramientasCompetencia(db, cuenta, lectura),
      ...crearHerramientasInstagram(db, cuenta.id, lectura),
      ...crearHerramientasSemanticas(db, cuenta.id, { marca, origenImagen }, lectura),
    };
    const generar = crearGeneradorConHerramientas(anthropic(env.ANTHROPIC_MODEL), herramientas, marca);
    return generar(contexto, signal, emitir);
  };
}
