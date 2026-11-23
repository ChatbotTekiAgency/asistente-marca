import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { evaluacionesIdeas as e, generacionesIdeas, ideasContenido as i } from "../../db/schema.ts";
import { editarEvaluacion, motivosEvaluacion, type DatosEvaluacion } from "./evaluacion-contrato.ts";

export function crearRepositorioEvaluaciones<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string) {
  const propias = eq(e.cuentaId, cuentaId);
  const ideaPropia = eq(i.cuentaId, cuentaId);
  const ultimas = db.selectDistinctOn([e.ideaId]).from(e).where(propias)
    .orderBy(asc(e.ideaId), desc(e.version)).as("ultimas");

  return {
    async guardar(entrada: DatosEvaluacion) {
      const datos = editarEvaluacion.parse(entrada);
      return db.transaction(async (tx) => {
        const [idea] = await tx.select().from(i).where(and(ideaPropia, eq(i.id, datos.ideaId))).for("update");
        if (!idea || idea.revision !== datos.revisionIdea) return null;
        if ((idea.estado === "aprobada" || idea.estado === "descartada") && !datos.motivo) return "motivo_requerido" as const;
        const [actual] = await tx.select({ id: e.id, version: e.version }).from(e)
          .where(and(propias, eq(e.ideaId, idea.id))).orderBy(desc(e.version)).limit(1);
        if ((actual?.id ?? null) !== datos.anterior) return null;
        const [fila] = await tx.insert(e).values({
          cuentaId, ideaId: idea.id, version: (actual?.version ?? 0) + 1, calificacion: datos.calificacion,
          comentario: datos.comentario || null, motivo: datos.motivo, categorias: datos.categorias,
          estadoIdea: idea.estado, tituloIdea: idea.titulo, formatoIdea: idea.formato,
        }).returning();
        return fila;
      });
    },
    async actuales(ideas: string[]) {
      if (!ideas.length) return [];
      return db.select().from(ultimas).where(inArray(ultimas.ideaId, ideas));
    },
    async historial() {
      const mes = sql<string>`to_char(timezone('America/Bogota', ${e.evaluadaEn}), 'YYYY-MM')`;
      const [mejores, descartadas, motivos, evolucion, revisiones] = await Promise.all([
        db.select({ ideaId: i.id, titulo: i.titulo, calificacion: ultimas.calificacion }).from(ultimas)
          .innerJoin(i, and(eq(i.cuentaId, ultimas.cuentaId), eq(i.id, ultimas.ideaId)))
          .orderBy(desc(ultimas.calificacion), desc(ultimas.evaluadaEn), asc(i.id)).limit(10),
        db.select({ ideaId: i.id, titulo: i.titulo, calificacion: ultimas.calificacion, motivo: ultimas.motivo,
          estadoEvaluado: ultimas.estadoIdea }).from(i)
          .leftJoin(ultimas, and(eq(i.cuentaId, ultimas.cuentaId), eq(i.id, ultimas.ideaId)))
          .where(and(ideaPropia, eq(i.estado, "descartada"))).orderBy(desc(i.actualizadaEn), asc(i.id)).limit(10),
        db.select({ estado: ultimas.estadoIdea, motivo: ultimas.motivo, cantidad: sql<number>`count(*)::int` }).from(ultimas)
          .where(and(sql`${ultimas.motivo} IS NOT NULL`, inArray(ultimas.estadoIdea, ["aprobada", "descartada"])))
          .groupBy(ultimas.estadoIdea, ultimas.motivo).orderBy(sql`count(*) DESC`, asc(ultimas.motivo), asc(ultimas.estadoIdea)),
        db.select({ mes, cantidad: sql<number>`count(*)::int`,
          promedio: sql<number>`round(avg(${e.calificacion}), 2)::float8` }).from(e)
          .where(propias).groupBy(mes).orderBy(desc(mes)).limit(12),
        db.select().from(e)
          .where(propias).orderBy(desc(e.evaluadaEn), desc(e.version), asc(e.id)).limit(20),
      ]);
      return { mejores, descartadas, motivos, evolucion: evolucion.reverse(), revisiones };
    },
    async preferenciasEditoriales() {
      const filas = await db.select({ motivo: ultimas.motivo, formato: ultimas.formatoIdea,
        estado: ultimas.estadoIdea, titulo: ultimas.tituloIdea, calificacion: ultimas.calificacion }).from(ultimas)
        .innerJoin(i, and(eq(i.cuentaId, ultimas.cuentaId), eq(i.id, ultimas.ideaId)))
        .innerJoin(generacionesIdeas, and(eq(generacionesIdeas.cuentaId, i.cuentaId), eq(generacionesIdeas.id, i.generacionId)))
        .where(and(eq(generacionesIdeas.proveedor, "anthropic"), eq(i.estado, ultimas.estadoIdea),
          inArray(ultimas.estadoIdea, ["aprobada", "descartada"])))
        .orderBy(desc(ultimas.evaluadaEn), asc(ultimas.ideaId)).limit(50);

      const grupos = new Map<string, { estado: string; motivo: keyof typeof motivosEvaluacion;
        formato: (typeof i.$inferSelect)["formato"]; cantidad: number; ejemplos: string[] }>();
      for (const fila of filas) {
        const { motivo, formato, estado, titulo, calificacion } = fila;
        if (!motivo || !Object.hasOwn(motivosEvaluacion, motivo) || motivo === "otro" || (estado === "aprobada" && calificacion < 4)) continue;
        const clave = JSON.stringify([estado, motivo, formato]);
        const grupo = grupos.get(clave) ?? { estado, motivo, formato, cantidad: 0, ejemplos: [] };
        grupo.cantidad += 1;
        if (estado === "descartada" && grupo.ejemplos.length < 2) grupo.ejemplos.push(titulo.slice(0, 100));
        grupos.set(clave, grupo);
      }
      const patrones = [...grupos.values()].filter(({ cantidad }) => cantidad >= 2)
        .sort((a, b) => b.cantidad - a.cantidad).slice(0, 4)
        .map(({ motivo, ...grupo }) => ({ ...grupo, motivo: motivosEvaluacion[motivo] }));
      return patrones.length ? { muestra: filas.length, patrones } : null;
    },
  };
}
