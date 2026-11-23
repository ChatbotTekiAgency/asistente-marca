import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  competidores, enriquecimientos, fuentesTendencias, metricasPostCompetidor, perfilesMarca, posts,
  postsCompetidor, resultadosTendencias, solicitudesTendencias,
} from "../../db/schema.ts";
import { publicacionesConUltimaMetrica } from "../instagram/ultima-metrica.ts";
import { construirContextoMarca } from "../marca/contexto.ts";
import { crearRepositorioMarca } from "../marca/repositorio.ts";
import { fuenteTendencia } from "../tendencias/contrato.ts";
import type { ReferenciaIdea } from "./contrato.ts";
import type { evidenciasIdeas } from "../../db/schema.ts";

type Evidencia = Pick<typeof evidenciasIdeas.$inferInsert, "tipo" | "postId" | "postCompetidorId" | "tendenciaId"
  | "perfilId" | "campoPerfil" | "enriquecimientoId" | "relevancia" | "url" | "datos">;
const urlSegura = (url: string) => fuenteTendencia.shape.url.safeParse(url).data ?? null;

export async function resolverEvidenciaIdea<T extends PgQueryResultHKT>(
  db: PgDatabase<T>, cuentaId: string, ref: ReferenciaIdea,
): Promise<Evidencia | null> {
  const comun = { tipo: ref.tipo, relevancia: ref.relevancia };
  switch (ref.tipo) {
    case "publicacion_propia": {
      const base = publicacionesConUltimaMetrica(db, cuentaId, eq(posts.id, ref.id)).as("base");
      const [fila] = await db.select({
        url: base.url, tipo: base.tipo, shortcode: base.shortcode, publicadaEn: base.publicadaEn,
        capturadaEn: base.capturadaEn, likes: base.likes, comentarios: base.comentarios, reproducciones: base.reproducciones,
        caption: sql<string | null>`left(${base.caption}, 240)`,
      }).from(base);
      if (!fila) return null;
      const { url, ...datos } = fila;
      return { ...comun, postId: ref.id, url: urlSegura(url), datos };
    }
    case "publicacion_competidor": {
      const p = postsCompetidor;
      const m = metricasPostCompetidor;
      const ultima = db.select({ likes: m.likes, comentarios: m.comentarios, reproducciones: m.reproducciones,
        capturadaEn: m.capturadaEn }).from(m).where(eq(m.postId, p.id))
        .orderBy(sql`${m.capturadaEn} DESC NULLS LAST, ${m.id} DESC NULLS LAST`).limit(1).as("ultima");
      const [fila] = await db.select({ url: p.url, tipo: p.tipo, shortcode: p.shortcode, publicadaEn: p.publicadaEn,
        usuario: competidores.username, caption: sql<string | null>`left(${p.caption}, 240)`,
        likes: ultima.likes, comentarios: ultima.comentarios, reproducciones: ultima.reproducciones, capturadaEn: ultima.capturadaEn,
      }).from(p).innerJoin(competidores, eq(competidores.id, p.competidorId)).leftJoinLateral(ultima, sql`true`)
        .where(and(eq(competidores.cuentaId, cuentaId), eq(p.id, ref.id)));
      if (!fila) return null;
      const { url, ...datos } = fila;
      return { ...comun, postCompetidorId: ref.id, url: urlSegura(url), datos };
    }
    case "tendencia": {
      const r = resultadosTendencias;
      const s = solicitudesTendencias;
      const [datos] = await db.select({ titulo: r.titulo, descripcion: r.descripcion, investigadaEn: r.investigadaEn })
        .from(r).innerJoin(s, eq(s.id, r.solicitudId)).where(and(eq(r.id, ref.id), eq(s.cuentaId, cuentaId),
          eq(s.estado, "completada"), eq(s.proveedor, "anthropic")));
      if (!datos) return null;
      const f = fuentesTendencias;
      const fuentes = (await db.select({ titulo: f.titulo, url: f.url, publicadaEl: f.publicadaEl }).from(f)
        .where(eq(f.tendenciaId, ref.id)).orderBy(asc(f.posicion))).flatMap((fuente) => {
        const url = urlSegura(fuente.url);
        return url ? [{ ...fuente, url }] : [];
      });
      if (!fuentes.length) return null;
      return { ...comun, tendenciaId: ref.id, url: fuentes[0].url, datos: { ...datos, fuentes } };
    }
    case "perfil": {
      const [fila] = await db.select({ id: perfilesMarca.id }).from(perfilesMarca)
        .where(and(eq(perfilesMarca.id, ref.id), eq(perfilesMarca.cuentaId, cuentaId)));
      if (!fila) return null;
      const perfil = await crearRepositorioMarca(db).obtener(cuentaId);
      const valor = perfil && construirContextoMarca(perfil.datos)?.[ref.campo];
      return valor ? { ...comun, perfilId: ref.id, campoPerfil: ref.campo, datos: { valor } } : null;
    }
    case "enriquecimiento": {
      const e = enriquecimientos;
      const [fila] = await db.select({ clasificacion: e.clasificacion, analizadoEn: e.analizadoEn, modalidad: e.modalidad,
        url: posts.url }).from(e).innerJoin(posts, eq(posts.id, e.postId)).where(and(eq(posts.cuentaId, cuentaId),
          eq(e.id, ref.id), eq(e.proveedor, "anthropic"), eq(e.estado, "completado")));
      if (!fila?.clasificacion || !fila.analizadoEn) return null;
      const { url, modalidad, analizadoEn, clasificacion } = fila;
      return { ...comun, enriquecimientoId: ref.id, url: urlSegura(url), datos: {
        modalidad, analizadoEn, clasificacion: { ...clasificacion, descripcionVisual: modalidad === "visual" ? clasificacion.descripcionVisual : null },
      } };
    }
  }
}
