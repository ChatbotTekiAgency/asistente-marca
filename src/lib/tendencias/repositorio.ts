import { and, asc, count, desc, eq, getTableColumns, gt, lte, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cuentas, fuentesTendencias, resultadosTendencias, solicitudesTendencias } from "../../db/schema.ts";
import { respuestaTendencias, type IdentidadProveedorTendencias, type RespuestaTendencias, type UsoTendencias } from "./contrato.ts";

export const PLAZO_INVESTIGACION_MS = 90_000;
export const CACHE_TENDENCIAS_MS = 24 * 60 * 60 * 1000;
type ErrorInvestigacion = NonNullable<typeof solicitudesTendencias.$inferSelect.error>;
type Reserva = {
  huellaCache: string; tema: string | null; mercado: string | null;
  reservaEstimadaUsd: number; limiteDiario: number;
};

export function crearRepositorioTendencias<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string) {
  const solicitudes = solicitudesTendencias;
  const resultados = resultadosTendencias;
  const fuentes = fuentesTendencias;
  const cuenta = eq(solicitudes.cuentaId, cuentaId);
  const enCurso = eq(solicitudes.estado, "en_curso");
  const vigente = sql`${solicitudes.venceEn} > clock_timestamp()`;
  const cacheVigente = sql`${solicitudes.expiraCacheEn} > clock_timestamp()`;
  const completadaVigente = and(eq(solicitudes.estado, "completada"), cacheVigente);
  const cacheVencida = sql<boolean>`coalesce(${solicitudes.expiraCacheEn} <= clock_timestamp(), false)`;

  return {
    async buscar(huella: string) {
      const [fila] = await db.select({ id: solicitudes.id, estado: solicitudes.estado }).from(solicitudes)
        .where(and(cuenta, eq(solicitudes.huellaCache, huella), or(completadaVigente, and(enCurso, vigente))))
        .orderBy(asc(solicitudes.estado), desc(solicitudes.expiraCacheEn)).limit(1);
      return fila ?? null;
    },
    async reservar(clave: string, proveedor: IdentidadProveedorTendencias, { limiteDiario, ...datos }: Reserva) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        const [dueña] = await tx.select({ id: cuentas.id }).from(cuentas).where(eq(cuentas.id, cuentaId)).for("update");
        if (!dueña) throw new Error("Cuenta de investigación no disponible.");

        await tx.update(solicitudes).set({ estado: "fallida", error: "vencida", finalizadaEn: sql`clock_timestamp()` })
          .where(and(cuenta, enCurso, sql`NOT (${vigente})`));
        const [previa] = await tx.select().from(solicitudes).where(and(cuenta, eq(solicitudes.clave, clave))).limit(1);
        if (previa) return { tipo: previa.huellaCache === null || previa.huellaCache === datos.huellaCache
          ? "repetida" as const : "conflicto" as const, solicitud: previa };

        const [activa] = await tx.select().from(solicitudes)
          .where(and(cuenta, eq(solicitudes.huellaCache, datos.huellaCache), or(completadaVigente, enCurso)))
          .orderBy(asc(solicitudes.estado), desc(solicitudes.expiraCacheEn)).limit(1);
        if (activa) return { tipo: activa.estado === "completada" ? "cache" as const : "en_curso" as const, solicitud: activa };

        const [{ total }] = await tx.select({ total: count() }).from(solicitudes).where(and(cuenta, sql`
          ${solicitudes.creadaEn} >= (date_trunc('day', clock_timestamp() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota')`));
        if (total >= limiteDiario) return { tipo: "cuota" as const };

        const [solicitud] = await tx.insert(solicitudes).values({
          ...proveedor, ...datos, cuentaId, clave, estado: "en_curso", creadaEn: sql`clock_timestamp()`,
          venceEn: sql`clock_timestamp() + ${PLAZO_INVESTIGACION_MS} * interval '1 millisecond'`,
        }).returning();
        return { tipo: "adquirida" as const, solicitud };
      });
    },
    async fallar(id: string, error: ErrorInvestigacion, uso?: UsoTendencias) {
      await db.update(solicitudes).set({ ...uso, estado: "fallida", error, finalizadaEn: sql`clock_timestamp()` })
        .where(and(cuenta, eq(solicitudes.id, id), enCurso));
    },
    async completar(id: string, respuesta: RespuestaTendencias, uso: UsoTendencias | undefined, investigadaEn: Date,
      ttlMs = CACHE_TENDENCIAS_MS) {
      return db.transaction(async (tx) => {
        const [solicitud] = await tx.update(solicitudes).set({
          ...uso, estado: "completada", finalizadaEn: investigadaEn,
          expiraCacheEn: new Date(investigadaEn.getTime() + ttlMs),
        }).where(and(cuenta, eq(solicitudes.id, id), enCurso, vigente)).returning();
        if (!solicitud) return null;

        await tx.insert(resultados).values(respuesta.tendencias.map((fila, i) => ({
          id: fila.id, titulo: fila.titulo, descripcion: fila.descripcion, relevanciaMarca: fila.relevanciaMarca,
          ejemploAplicacion: fila.ejemploAplicacion, formato: fila.formato, publicoObjetivo: fila.publicoObjetivo,
          relevancia: fila.relevancia, solicitudId: id, posicion: i + 1, investigadaEn,
        })));
        await tx.insert(fuentes).values(respuesta.tendencias.flatMap(({ id, fuentes }) =>
          fuentes.map((fuente, i) => ({ ...fuente, tendenciaId: id, posicion: i + 1 }))));
        return solicitud;
      });
    },
    async obtener(id: string) {
      const filas = await db.select({ solicitud: solicitudes, resultado: resultados, fuente: fuentes, cacheVencida })
        .from(solicitudes).leftJoin(resultados, eq(resultados.solicitudId, solicitudes.id))
        .leftJoin(fuentes, eq(fuentes.tendenciaId, resultados.id))
        .where(and(cuenta, eq(solicitudes.id, id)))
        .orderBy(asc(resultados.posicion), asc(fuentes.posicion));
      if (!filas.length) return null;

      const solicitud = filas[0].solicitud;
      if (solicitud.estado !== "completada") return { solicitud, resultado: null, cacheVencida: false };

      const tendencias = new Map<string, RespuestaTendencias["tendencias"][number]>();
      for (const { resultado, fuente } of filas) {
        if (!resultado) continue;
        const { id, titulo, descripcion, relevanciaMarca, ejemploAplicacion, formato, publicoObjetivo, relevancia, investigadaEn } = resultado;
        const actual = tendencias.get(id) ?? {
          id, titulo, descripcion, relevanciaMarca, ejemploAplicacion, formato, publicoObjetivo, relevancia,
          investigadaEn: investigadaEn.toISOString(), fuentes: [],
        };
        if (fuente) actual.fuentes.push({
          titulo: fuente.titulo, url: fuente.url, ...(fuente.sitio && { sitio: fuente.sitio }),
          ...(fuente.publicadaEl && { publicadaEl: fuente.publicadaEl }),
        });
        tendencias.set(id, actual);
      }
      return { solicitud, resultado: respuestaTendencias.parse({ tendencias: [...tendencias.values()] }), cacheVencida: filas[0].cacheVencida };
    },
    historial(limite: number) {
      return db.select({ ...getTableColumns(solicitudes), cacheVencida }).from(solicitudes).where(cuenta)
        .orderBy(desc(solicitudes.creadaEn), desc(solicitudes.id)).limit(limite);
    },
    vigentesReales(consultadaEn: Date, limite: number) {
      return db.select({ id: solicitudes.id }).from(solicitudes)
        .where(and(cuenta, eq(solicitudes.estado, "completada"), eq(solicitudes.proveedor, "anthropic"),
          lte(solicitudes.finalizadaEn, consultadaEn), gt(solicitudes.expiraCacheEn, consultadaEn)))
        .orderBy(desc(solicitudes.finalizadaEn), desc(solicitudes.id)).limit(limite);
    },
  };
}

export type RepositorioTendencias = ReturnType<typeof crearRepositorioTendencias>;
