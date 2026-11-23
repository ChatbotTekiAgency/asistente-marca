"use server";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/env";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { crearIngestasCompetidor } from "@/lib/competencia/ingestas";
import { MAX_BYTES_JSON, MENSAJE_ARCHIVO_JSON, leerDatasetCompetidor } from "@/lib/competencia/contrato-ingesta";
import { clienteApifyCompetidores, configuracionApifyCompetidores } from "@/lib/competencia/apify";
import { iniciarCorrida, gestionarCorrida, type RespuestaIngesta } from "@/lib/competencia/corridas";

const idSchema = z.uuid();
const ordenSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("iniciar"), confirmada: z.literal(true), limite: z.number().int(), maxUsd: z.number() }),
  z.strictObject({ tipo: z.enum(["consultar", "cancelar"]), id: idSchema }),
]);

async function operar(cuentaEsperada: string, competidorId: string,
  accion: (repo: ReturnType<typeof crearIngestasCompetidor>) => Promise<RespuestaIngesta>): Promise<RespuestaIngesta> {
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta || cuenta.id !== cuentaEsperada || !idSchema.safeParse(competidorId).success) {
      return { ok: false, mensaje: "Selecciona la cuenta correcta y verifica tu sesión." };
    }
    const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5_000 });
    let respuesta;
    try {
      respuesta = await accion(crearIngestasCompetidor(drizzle(pool), cuenta.id, competidorId));
    } finally { await pool.end(); }
    revalidatePath("/dashboard/competencia");
    return respuesta;
  } catch {
    return { ok: false, mensaje: "No se pudo completar la operación. Revisa la conexión y la migración." };
  }
}

export async function importarArchivoCompetidor(cuentaEsperada: string, competidorId: string, form: FormData) {
  return operar(cuentaEsperada, competidorId, async (repo) => {
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || !archivo.name.toLowerCase().endsWith(".json") || archivo.size > MAX_BYTES_JSON) {
      return { ok: false, mensaje: MENSAJE_ARCHIVO_JSON };
    }
    let dataset: unknown[];
    try {
      dataset = leerDatasetCompetidor(new Uint8Array(await archivo.arrayBuffer()));
    } catch (error) {
      return { ok: false, mensaje: error instanceof Error ? error.message : "Archivo inválido." };
    }
    const resultado = await repo.importar(dataset);
    if (!resultado) return { ok: false, mensaje: "El competidor no está disponible para la cuenta activa." };
    return { ok: resultado.estado !== "fallida", mensaje: "Archivo procesado.", resultado };
  });
}

export async function operarApifyCompetidor(cuentaEsperada: string, competidorId: string, entrada: unknown) {
  return operar(cuentaEsperada, competidorId, async (repo) => {
    const orden = ordenSchema.safeParse(entrada);
    if (!orden.success) return { ok: false, mensaje: "Confirma la ejecución y sus límites." };
    const cliente = clienteApifyCompetidores();
    if (!cliente) return { ok: false, mensaje: "Falta configurar el token de Apify en el servidor." };
    if (orden.data.tipo !== "iniciar") return gestionarCorrida(repo, cliente, orden.data.id, orden.data.tipo === "cancelar");
    const config = configuracionApifyCompetidores();
    if (!config || orden.data.limite !== config.limite || orden.data.maxUsd !== config.maxUsd) {
      return { ok: false, mensaje: "Apify no está habilitado o cambiaron los límites. Recarga antes de confirmar." };
    }
    return iniciarCorrida(repo, cliente, config.limite, config.maxUsd);
  });
}
