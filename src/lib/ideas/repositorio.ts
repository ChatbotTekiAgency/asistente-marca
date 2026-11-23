import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { evidenciasIdeas, generacionesIdeas, ideasContenido } from "../../db/schema.ts";
import { claveInvestigacion } from "../tendencias/contrato.ts";
import { cambioEstadoIdea, editarIdea, filtrosIdeas, generacionIdeas } from "./contrato.ts";
import { resolverEvidenciaIdea } from "./evidencias.ts";
import type { ReferenciaIdea } from "./contrato.ts";

export type DetallesEvidenciasIdeas = ReadonlyMap<string, {
  muestra?: number; desdeDias?: number; hastaDias?: number; limitaciones: string[];
}>;
export function claveReferenciaIdea(ref: Pick<ReferenciaIdea, "tipo" | "id"> & { campo?: string }) {
  return [ref.tipo, ref.id, ref.campo ?? ""].join(":");
}

export class ErrorEvidenciaIdea extends Error {
  constructor() { super("Una evidencia no está disponible para la cuenta activa."); }
}

export function crearRepositorioIdeas<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string) {
  const generaciones = generacionesIdeas;
  const ideas = ideasContenido;
  const evidencias = evidenciasIdeas;
  const propias = eq(ideas.cuentaId, cuentaId);
  const listar = (entrada: unknown = {}) => {
    const { pagina, estado, titulo, orden, generacionId } = filtrosIdeas.parse(entrada);
    const ordenar = orden === "recientes" ? desc : asc;
    return db.select({ idea: ideas, proveedor: generaciones.proveedor, modelo: generaciones.modelo,
      costoEstimadoUsd: generaciones.costoEstimadoUsd }).from(ideas)
      .innerJoin(generaciones, and(eq(generaciones.cuentaId, ideas.cuentaId), eq(generaciones.id, ideas.generacionId)))
      .where(and(propias, estado ? eq(ideas.estado, estado) : undefined, generacionId ? eq(ideas.generacionId, generacionId) : undefined,
        titulo ? sql`strpos(lower(${ideas.titulo}), lower(${titulo})) > 0` : undefined))
      .orderBy(ordenar(ideas.generadaEn), ordenar(ideas.id)).limit(20).offset((pagina - 1) * 20);
  };
  return {
    async guardarGeneracion(entrada: unknown, detalles?: DetallesEvidenciasIdeas) {
      const datos = generacionIdeas.parse(entrada);
      const huella = createHash("sha256").update(JSON.stringify(datos)).digest("hex");
      return db.transaction(async (tx) => {
        const [nueva] = await tx.insert(generaciones).values({
          cuentaId, clave: datos.clave, huella, estado: datos.estado, solicitud: datos.solicitud, parametros: datos.parametros,
          proveedor: datos.proveedor, modelo: datos.modelo, ...datos.uso,
          cantidad: datos.estado === "completada" ? datos.ideas.length : 0, error: datos.estado === "fallida" ? datos.error : null,
        }).onConflictDoNothing({ target: [generaciones.cuentaId, generaciones.clave] }).returning();
        const [existente] = nueva ? [] : await tx.select().from(generaciones)
          .where(and(eq(generaciones.cuentaId, cuentaId), eq(generaciones.clave, datos.clave)));
        if (existente && existente.huella !== huella) return { estado: "conflicto" as const };
        const generacion = nueva ?? existente;
        if (nueva && datos.estado === "completada") {
          for (const [posicion, { evidencias: referencias, ...idea }] of datos.ideas.entries()) {
            const fuentes = await Promise.all(referencias.map((ref) => resolverEvidenciaIdea(tx, cuentaId, ref)));
            const [insertada] = await tx.insert(ideas).values({ ...idea, cuentaId, generacionId: nueva.id, posicion: posicion + 1 }).returning({ id: ideas.id });
            if (fuentes.length) await tx.insert(evidencias).values(fuentes.map((fuente, i) => {
              if (!fuente) throw new ErrorEvidenciaIdea();
              const resumen = detalles?.get(claveReferenciaIdea(referencias[i]));
              return { ...fuente, datos: { ...fuente.datos, ...(resumen && { contexto: resumen }) },
                cuentaId, ideaId: insertada.id, posicion: i + 1 };
            }));
          }
        }
        const lista = await tx.select().from(ideas).where(and(propias, eq(ideas.generacionId, generacion.id))).orderBy(asc(ideas.posicion));
        return { estado: nueva ? "guardada" as const : "repetida" as const, generacion, ideas: lista };
      });
    },
    listar,
    async listarConEvidencias(entrada: unknown = {}) {
      const filas = await listar(entrada);
      if (!filas.length) return [];
      const fuentes = await db.select().from(evidencias).where(and(eq(evidencias.cuentaId, cuentaId),
        inArray(evidencias.ideaId, filas.map(({ idea }) => idea.id)))).orderBy(asc(evidencias.posicion));
      return filas.map((fila) => ({ ...fila, evidencias: fuentes.filter(({ ideaId }) => ideaId === fila.idea.id) }));
    },
    async obtener(id: unknown) {
      const clave = claveInvestigacion.parse(id);
      const [fila] = await db.select({ idea: ideas, proveedor: generaciones.proveedor, modelo: generaciones.modelo }).from(ideas)
        .innerJoin(generaciones, and(eq(generaciones.cuentaId, ideas.cuentaId), eq(generaciones.id, ideas.generacionId)))
        .where(and(propias, eq(ideas.id, clave)));
      if (!fila) return null;
      const fuentes = await db.select().from(evidencias).where(and(eq(evidencias.cuentaId, cuentaId), eq(evidencias.ideaId, clave)))
        .orderBy(asc(evidencias.posicion));
      return { ...fila, evidencias: fuentes };
    },
    historial() {
      return db.select().from(generaciones).where(eq(generaciones.cuentaId, cuentaId))
        .orderBy(desc(generaciones.creadaEn), desc(generaciones.id)).limit(20);
    },
    async buscarGeneracion(clave: string) {
      const [generacion] = await db.select().from(generaciones)
        .where(and(eq(generaciones.cuentaId, cuentaId), eq(generaciones.clave, clave)));
      if (!generacion) return null;
      const lista = await db.select().from(ideas).where(and(propias, eq(ideas.generacionId, generacion.id))).orderBy(asc(ideas.posicion));
      return { generacion, ideas: lista };
    },
    async cambiarEstado(entrada: unknown) {
      const { id, revision, estado } = cambioEstadoIdea.parse(entrada);
      const [fila] = await db.update(ideas).set({ estado, revision: sql`gen_random_uuid()`, actualizadaEn: sql`clock_timestamp()` })
        .where(and(propias, eq(ideas.id, id), eq(ideas.revision, revision))).returning();
      return fila ?? null;
    },
    async editar(entrada: unknown) {
      const { id, revision, datos } = editarIdea.parse(entrada);
      const [fila] = await db.update(ideas).set({ ...datos, revision: sql`gen_random_uuid()`, actualizadaEn: sql`clock_timestamp()` })
        .where(and(propias, eq(ideas.id, id), eq(ideas.revision, revision))).returning();
      return fila ?? null;
    },
  };
}
