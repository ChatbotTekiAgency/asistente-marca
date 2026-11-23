import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cuentas, reservasIdeas } from "../../db/schema.ts";
import { crearRepositorioIdeas, type DetallesEvidenciasIdeas } from "./repositorio.ts";

export const PLAZO_IDEAS_MS = 90_000;

export function crearReservasIdeas<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string) {
  const tabla = reservasIdeas;
  const cuenta = eq(tabla.cuentaId, cuentaId);
  const buscar = (clave: string) => and(cuenta, eq(tabla.clave, clave));
  return {
    reservar(clave: string, huella: string, limite: number) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        const [activa] = await tx.select({ id: cuentas.id }).from(cuentas).where(eq(cuentas.id, cuentaId)).for("update");
        if (!activa) return { estado: "sin_cuenta" as const };
        const [reserva] = await tx.select({
          huella: tabla.huella, vigente: sql<boolean>`${tabla.venceEn} > clock_timestamp()`,
        }).from(tabla).where(buscar(clave));
        if (reserva && reserva.huella !== huella) return { estado: "conflicto" as const };
        const previa = await crearRepositorioIdeas(tx, cuentaId).buscarGeneracion(clave);
        if (previa) return reserva ? { estado: "repetida" as const, ...previa } : { estado: "conflicto" as const };
        if (reserva) return { estado: reserva.vigente ? "en_curso" as const : "vencida" as const };
        const [{ total }] = await tx.select({ total: count() }).from(tabla).where(and(cuenta, sql`
          ${tabla.creadaEn} >= (date_trunc('day', clock_timestamp() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota')`));
        if (total >= limite) return { estado: "cuota" as const };
        await tx.insert(tabla).values({ cuentaId, clave, huella, creadaEn: sql`clock_timestamp()`,
          venceEn: sql`clock_timestamp() + ${PLAZO_IDEAS_MS} * interval '1 millisecond'` });
        return { estado: "reservada" as const };
      });
    },
    finalizar(clave: string, huella: string, entrada: unknown, detalles?: DetallesEvidenciasIdeas) {
      return db.transaction(async (tx) => {
        const [reserva] = await tx.update(tabla).set({ finalizadaEn: sql`clock_timestamp()` })
          .where(and(buscar(clave), eq(tabla.huella, huella), isNull(tabla.finalizadaEn), gt(tabla.venceEn, sql`clock_timestamp()`)))
          .returning({ clave: tabla.clave });
        if (!reserva) return { estado: "vencida" as const };
        return crearRepositorioIdeas(tx, cuentaId).guardarGeneracion(entrada, detalles);
      });
    },
  };
}
