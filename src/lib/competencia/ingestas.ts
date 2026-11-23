import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql, count } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { competidores, ingestasCompetidor as ingestas, metricasPostCompetidor as metricas, postsCompetidor as posts } from "../../db/schema.ts";
import { actualizarPostImportado, guardarLotesInstagram, resultadoDataset } from "../instagram/guardar-lote.ts";
import { MAX_FILAS_JSON, type ResultadoIngesta } from "./contrato-ingesta.ts";

const pendientes = ["iniciando", "en_curso"] as const;

export function crearIngestasCompetidor<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string, competidorId: string) {
  const competidor = and(eq(competidores.id, competidorId), eq(competidores.cuentaId, cuentaId));
  const autorizados = db.select({ id: competidores.id }).from(competidores).where(competidor);
  const filtroIngestas = inArray(ingestas.competidorId, autorizados);
  const filtroPosts = inArray(posts.competidorId, autorizados);
  const enCurso = and(filtroIngestas, inArray(ingestas.estado, pendientes));

  return {
    async consultar(pagina = 1) {
      const ultima = db.select({ likes: metricas.likes, comentarios: metricas.comentarios, reproducciones: metricas.reproducciones })
        .from(metricas).where(eq(metricas.postId, posts.id)).orderBy(desc(metricas.capturadaEn), desc(metricas.id)).limit(1).as("ultima");
      const [historial, listado, [totales], [corrida]] = await Promise.all([
        db.select({ id: ingestas.id, origen: ingestas.origen, estado: ingestas.estado, procesadas: ingestas.procesadas,
          errores: ingestas.errores, iniciadaEn: ingestas.iniciadaEn, finalizadaEn: ingestas.finalizadaEn, mensaje: ingestas.mensajeError })
          .from(ingestas).where(filtroIngestas).orderBy(desc(ingestas.iniciadaEn), desc(ingestas.id)).limit(10),
        db.select({ id: posts.id, shortcode: posts.shortcode, tipo: posts.tipo, caption: sql<string | null>`left(${posts.caption}, 240)`,
          url: posts.url, fecha: posts.publicadaEn, likes: ultima.likes, comentarios: ultima.comentarios, reproducciones: ultima.reproducciones })
          .from(posts).leftJoinLateral(ultima, sql`true`).where(filtroPosts)
          .orderBy(desc(posts.publicadaEn), desc(posts.id)).limit(20).offset((pagina - 1) * 20),
        db.select({ total: count() }).from(posts).where(filtroPosts),
        db.select({ id: ingestas.id, estado: ingestas.estado, tieneRun: sql<boolean>`${ingestas.apifyRunId} is not null` })
          .from(ingestas).where(enCurso).limit(1),
      ]);
      return { historial, listado, total: totales.total, corrida: corrida ?? null };
    },

    async importar(dataset: unknown[], corridaId?: string): Promise<ResultadoIngesta | null> {
      if (!Array.isArray(dataset) || dataset.length > MAX_FILAS_JSON) throw new Error("Dataset fuera del límite.");
      const hashDataset = createHash("sha256").update(JSON.stringify(dataset)).digest("hex");
      return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        const [rival] = await tx.select({ username: competidores.username }).from(competidores).where(competidor).for("update");
        if (!rival) return null;
        const delRival = eq(ingestas.competidorId, competidorId);
        const [corrida] = corridaId ? await tx.select().from(ingestas).where(and(delRival, eq(ingestas.id, corridaId),
          eq(ingestas.estado, "en_curso"), eq(ingestas.username, rival.username))).for("update") : [];
        if (corridaId && !corrida?.apifyRunId) return null;
        const [previa] = await tx.select().from(ingestas).where(and(delRival, eq(ingestas.hashDataset, hashDataset)));
        if (previa && (previa.estado === "completada" || previa.estado === "parcial" || previa.estado === "fallida")) {
          if (corrida) await tx.update(ingestas).set({
            estado: previa.estado, procesadas: previa.procesadas, errores: previa.errores,
            finalizadaEn: sql`clock_timestamp()`, reservaHasta: null, mensajeError: "Se reutilizó una ingesta existente del mismo dataset.",
          }).where(eq(ingestas.id, corrida.id));
          return { id: previa.id, repetida: true, estado: previa.estado, procesadas: previa.procesadas,
            actualizadas: 0, insertadas: 0, rechazadas: previa.errores, detalle: [] };
        }

        const { publicaciones, rechazados, estado, mensajeError } = resultadoDataset(dataset, rival.username);
        const fin = { estado, hashDataset,
          procesadas: publicaciones.length, errores: rechazados.length, mensajeError, reservaHasta: null };
        const [{ id }] = corrida
          ? await tx.update(ingestas).set(fin).where(eq(ingestas.id, corrida.id)).returning({ id: ingestas.id })
          : await tx.insert(ingestas).values({ ...fin, competidorId, origen: "archivo", username: rival.username }).returning({ id: ingestas.id });
        const capturadaEn = new Date();
        const conteos = await guardarLotesInstagram(publicaciones, {
          contarExistentes: async (shortcodes) => (await tx.select({ total: count() }).from(posts)
            .where(and(eq(posts.competidorId, competidorId), inArray(posts.shortcode, shortcodes))))[0].total,
          guardarPosts: async (lote) => tx.insert(posts).values(lote.map((post) => ({ ...post, competidorId })))
            .onConflictDoUpdate({ target: [posts.competidorId, posts.shortcode], set: actualizarPostImportado })
            .returning({ id: posts.id, shortcode: posts.shortcode }),
          guardarMetricas: async (lote) => tx.insert(metricas).values(lote.map((fila) => ({ ...fila, competidorId, ingestaId: id, capturadaEn }))),
        });
        await tx.update(ingestas).set({ finalizadaEn: sql`clock_timestamp()` }).where(eq(ingestas.id, id));
        return { id, repetida: false, estado, procesadas: publicaciones.length, ...conteos, rechazadas: rechazados.length, detalle: rechazados };
      });
    },

    reservar(limite: number) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        const [rival] = await tx.select({ username: competidores.username, activo: competidores.activo })
          .from(competidores).where(competidor).for("update");
        if (!rival?.activo) return null;
        // Apify puede haber aceptado una solicitud cuyo ID no llegó. El tiempo por sí solo
        // no permite iniciar otra corrida con seguridad, incluso si la anterior sigue en cola.
        const [fila] = await tx.insert(ingestas).values({ competidorId, username: rival.username, origen: "apify",
          limite, estado: "iniciando", reservaHasta: sql`clock_timestamp() + interval '8 minutes'` })
          .onConflictDoNothing().returning({ id: ingestas.id, username: ingestas.username });
        return fila ?? null;
      });
    },

    async corrida(id: string) {
      const [fila] = await db.select().from(ingestas)
        .where(and(enCurso, eq(ingestas.id, id)));
      return fila ?? null;
    },

    async confirmarInicio(id: string, runId: string) {
      const filas = await db.update(ingestas).set({ apifyRunId: runId, estado: "en_curso", mensajeError: null })
        .where(and(enCurso, eq(ingestas.id, id), eq(ingestas.estado, "iniciando"))).returning({ id: ingestas.id });
      return filas.length === 1;
    },

    async anotar(id: string, mensaje: string, estado?: "fallida" | "cancelada" | "expirada") {
      await db.update(ingestas).set({ mensajeError: mensaje,
        ...(estado ? { estado, finalizadaEn: sql`clock_timestamp()`, reservaHasta: null, errores: estado === "cancelada" ? 0 : 1 } : {}),
      }).where(and(enCurso, eq(ingestas.id, id)));
    },
  };
}
