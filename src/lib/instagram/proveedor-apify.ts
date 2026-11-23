import "server-only";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cuentas } from "@/db/schema";
import { env } from "@/env";
import { crearClienteApify, iniciarInstagram, leerDatasetInstagram, TIMEOUT_ACTOR_SECS } from "./apify-cliente";
import type { ProveedorDatos } from "./proveedor-datos";

const TIMEOUT_HTTP_SECS = 75;
const MAX_RESULTADOS = 100;

export const proveedorApify: ProveedorDatos = {
  async obtenerPublicaciones({ cuentaId, limite = 50, ejecucionAutorizada }) {
    if (ejecucionAutorizada !== true || !env.APIFY_TOKEN) {
      throw new Error("Apify requiere un token de servidor y autorización explícita para esta ejecución.");
    }

    const id = z.uuid().parse(cuentaId);
    const resultados = z.number().int().min(1).max(MAX_RESULTADOS).parse(limite);
    const [reserva] = await db.update(cuentas)
      .set({ apifyReservadaHasta: sql`date_trunc('milliseconds', clock_timestamp()) + interval '8 minutes'` })
      .where(and(eq(cuentas.id, id), or(
        isNull(cuentas.apifyReservadaHasta),
        sql`${cuentas.apifyReservadaHasta} <= clock_timestamp()`,
      )))
      .returning({ username: cuentas.username, hasta: cuentas.apifyReservadaHasta })
      .catch(() => { throw new Error("No se pudo reservar la cuenta para la ejecución de Apify."); });
    if (!reserva?.hasta) {
      throw new Error("La cuenta no existe o ya está reservada para una ejecución de Apify.");
    }

    let estadoConfirmado = true;
    try {
      const cliente = crearClienteApify(env.APIFY_TOKEN, TIMEOUT_HTTP_SECS);
      estadoConfirmado = false;
      const inicio = await iniciarInstagram(cliente, reserva.username, resultados);

      const corrida = await cliente.run(inicio.id).waitForFinish({ waitSecs: TIMEOUT_ACTOR_SECS + 15 });
      estadoConfirmado = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(corrida.status);
      if (corrida.status !== "SUCCEEDED") {
        throw new Error("El actor no terminó correctamente.");
      }
      const items = await leerDatasetInstagram(cliente, corrida.defaultDatasetId, resultados);
      return { idEjecucion: corrida.id, registros: items };
    } catch {
      throw new Error("No se pudo completar la ejecución o recuperar el dataset de Apify. Revisa el historial del actor.");
    } finally {
      // Si el estado remoto es incierto, la reserva se libera al vencer.
      if (estadoConfirmado) {
        await db.update(cuentas).set({ apifyReservadaHasta: null })
          .where(and(eq(cuentas.id, id), eq(cuentas.apifyReservadaHasta, reserva.hasta)))
          .catch(() => undefined);
      }
    }
  },
};
