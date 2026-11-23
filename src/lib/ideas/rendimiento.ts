import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { posts } from "../../db/schema.ts";
import { intervaloCompetencia } from "../competencia/comparacion.ts";
import { interaccionesConocidas, publicacionesConUltimaMetrica } from "../instagram/ultima-metrica.ts";
import type { FormatoInstagram } from "../instagram/filtros-analitica.ts";
import { COBERTURA_MINIMA } from "../enriquecimiento/resumen.ts";

export type ExtremoPropio = {
  id: string; url: string; formato: FormatoInstagram; caption: string | null;
  publicadaEn: string; capturadaEn: string; likes: string; comentarios: string; interacciones: string;
  reproducciones: string | null; posicion: "superior" | "inferior"; desdeDias: number; muestra: number; mediana: number;
};

export async function consultarExtremosPropios<T extends PgQueryResultHKT>(
  db: PgDatabase<T>, cuentaId: string, intervalo: { desde: string; hasta: string }, caption: number,
) {
  const base = publicacionesConUltimaMetrica(db, cuentaId, intervaloCompetencia(posts.publicadaEn, intervalo));
  const [fila] = await db.select({ datos: sql<ExtremoPropio[]>`contexto.datos` }).from(sql`(
    WITH edades AS (
      SELECT *, ${interaccionesConocidas(sql`likes`, sql`comentarios`)} AS interacciones,
        floor(extract(epoch FROM (capturada_en - publicada_en)) / 604800)::int AS semana
      FROM (${base}) AS publicaciones WHERE likes IS NOT NULL AND comentarios IS NOT NULL
    ), comparables AS (
      SELECT tipo, semana, count(*)::int AS muestra, min(interacciones) AS menor, max(interacciones) AS mayor,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY interacciones) AS mediana
      FROM edades WHERE semana >= 1 GROUP BY tipo, semana
      HAVING count(*) >= ${COBERTURA_MINIMA} AND min(interacciones) < max(interacciones)
    ), cohortes AS (
      SELECT *, row_number() OVER (PARTITION BY tipo ORDER BY muestra DESC, semana ASC) AS prioridad FROM comparables
    ), extremos AS (
      SELECT p.id, p.url, p.tipo AS formato, left(p.caption, ${caption}) AS caption,
        p.publicada_en AS "publicadaEn", p.capturada_en AS "capturadaEn", p.likes::text AS likes,
        p.comentarios::text AS comentarios, p.reproducciones::text AS reproducciones, p.interacciones::text AS interacciones,
        CASE WHEN p.interacciones = c.mayor THEN 'superior' ELSE 'inferior' END AS posicion,
        p.semana * 7 AS "desdeDias", c.muestra, c.mediana, c.prioridad,
        row_number() OVER (PARTITION BY p.tipo,p.semana,p.interacciones ORDER BY p.publicada_en DESC,p.id) AS empate
      FROM edades p JOIN cohortes c USING (tipo, semana) WHERE c.prioridad <= 2 AND p.interacciones IN (c.menor,c.mayor)
    )
    SELECT coalesce(jsonb_agg(to_jsonb(e) - 'prioridad' - 'empate' ORDER BY e.prioridad, e.posicion DESC, e.formato), '[]'::jsonb) AS datos
    FROM extremos e WHERE e.empate = 1
  ) AS contexto`);
  return fila.datos;
}
