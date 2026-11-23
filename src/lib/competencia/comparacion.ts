import { sql, type SQLWrapper } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { competidores, cuentas, metricasPostCompetidor, posts, postsCompetidor } from "../../db/schema.ts";
import { interaccionesConocidas, publicacionesConUltimaMetrica } from "../instagram/ultima-metrica.ts";
import type { FormatoInstagram } from "../instagram/filtros-analitica.ts";

const ZONA = "America/Bogota";
export const DESTACADAS_POR_PAGINA = 10;

export type SeleccionComparacion = { rivales: string[]; desde?: string; hasta?: string; pagina: number };
type Interacciones = { publicaciones: number; conInteracciones: number; mediana: number | null; promedio: number | null };
export type CuentaComparada = Interacciones & {
  id: string; nombre: string; propia: boolean; ritmo: number | null; ultimaPublicacion: string | null;
  ultimaCaptura: string | null; conLikes: number; conComentarios: number; videos: number;
  videosConReproducciones: number; reproducciones: string | null; medianaReproducciones: number | null;
};
export type InformeComparacion = {
  desde: string | null; hasta: string | null; meses: number; cuentas: CuentaComparada[];
  formatos: (Interacciones & { cuentaId: string; tipo: FormatoInstagram })[];
  actividad: { cuentaId: string; mes: string; publicaciones: number }[];
  destacadas: { id: string; cuentaId: string; shortcode: string; tipo: FormatoInstagram;
    publicadaEn: string; capturadaEn: string; interacciones: string }[];
  totalDestacadas: number; pagina: number;
};

export function intervaloCompetencia(columna: SQLWrapper, { desde, hasta }: Pick<SeleccionComparacion, "desde" | "hasta">) {
  return sql.join([
    desde ? sql`${columna} >= (${desde}::date::timestamp AT TIME ZONE ${ZONA})` : sql`true`,
    hasta ? sql`${columna} < ((${hasta}::date + 1)::timestamp AT TIME ZONE ${ZONA})` : sql`true`,
  ], sql` AND `);
}

export async function consultarComparacionCompetitiva<T extends PgQueryResultHKT>(
  db: PgDatabase<T>, cuentaId: string, seleccion: SeleccionComparacion,
  { soloResumen = false, incluirPropia = true } = {},
) {
  const propios = publicacionesConUltimaMetrica(db, cuentaId,
    incluirPropia ? intervaloCompetencia(posts.publicadaEn, seleccion) : sql`false`);
  const rivalesSeleccionados = seleccion.rivales.length
    ? sql`id IN (${sql.join(seleccion.rivales.map((id) => sql`${id}::uuid`), sql`, `)})` : sql`false`;
  const estadisticas = sql`count(publicada_en)::int AS publicaciones, count(interacciones)::int AS "conInteracciones",
    percentile_cont(0.5) WITHIN GROUP (ORDER BY interacciones) AS mediana, avg(interacciones) AS promedio`;

  const [fila] = await db.select({ informe: sql<InformeComparacion>`comparacion.informe` }).from(sql`(
    WITH sujetos AS (
      SELECT id, username AS nombre, true AS propia FROM ${cuentas} WHERE id = ${cuentaId} AND ${incluirPropia}
      UNION ALL
      SELECT id, coalesce(nombre, username), false FROM ${competidores}
      WHERE cuenta_id = ${cuentaId} AND ${rivalesSeleccionados}
    ), publicaciones AS (
      SELECT ${cuentaId}::uuid AS sujeto, id, shortcode, tipo, publicada_en, likes, comentarios, reproducciones, capturada_en
      FROM (${propios}) AS propias
      UNION ALL
      SELECT s.id, p.id, p.shortcode, p.tipo, p.publicada_en, m.likes, m.comentarios, m.reproducciones, m.capturada_en
      FROM sujetos s JOIN ${postsCompetidor} p ON p.competidor_id = s.id AND NOT s.propia
      LEFT JOIN LATERAL (
        SELECT likes, comentarios, reproducciones, capturada_en FROM ${metricasPostCompetidor}
        WHERE post_id = p.id ORDER BY capturada_en DESC NULLS LAST, id DESC NULLS LAST LIMIT 1
      ) m ON true
      WHERE ${intervaloCompetencia(sql`p.publicada_en`, seleccion)}
    ), base AS (
      SELECT *, (publicada_en AT TIME ZONE ${ZONA})::date AS dia, ${interaccionesConocidas(sql`likes`, sql`comentarios`)} AS interacciones
      FROM publicaciones
    ), rango AS (
      SELECT coalesce(${seleccion.desde ?? null}::date, min(dia)) AS desde,
        coalesce(${seleccion.hasta ?? null}::date, max(dia)) AS hasta FROM base
    ), periodo AS (
      SELECT desde, hasta, CASE WHEN desde IS NULL OR hasta IS NULL THEN 0
        ELSE 12 * (extract(year FROM hasta)::int - extract(year FROM desde)::int)
          + extract(month FROM hasta)::int - extract(month FROM desde)::int + 1 END AS meses FROM rango
    ), indicadores AS (
      SELECT s.id, s.nombre, s.propia, ${estadisticas},
        count(b.id)::numeric / nullif(periodo.meses, 0) AS ritmo,
        max(b.publicada_en) AS "ultimaPublicacion", max(b.capturada_en) AS "ultimaCaptura",
        count(likes)::int AS "conLikes", count(comentarios)::int AS "conComentarios",
        count(b.id) FILTER (WHERE tipo='video')::int AS videos,
        count(reproducciones) FILTER (WHERE tipo='video')::int AS "videosConReproducciones",
        (sum(reproducciones) FILTER (WHERE tipo='video'))::text AS reproducciones,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY reproducciones) FILTER (WHERE tipo='video') AS "medianaReproducciones"
      FROM sujetos s CROSS JOIN periodo LEFT JOIN base b ON b.sujeto=s.id
      GROUP BY s.id,s.nombre,s.propia,periodo.meses
    ), formatos AS (
      SELECT sujeto AS "cuentaId", tipo, ${estadisticas} FROM base GROUP BY sujeto,tipo
    ), actividad AS (
      SELECT sujeto AS "cuentaId", to_char(dia, 'YYYY-MM') AS mes, count(*)::int AS publicaciones
      FROM base GROUP BY sujeto,to_char(dia,'YYYY-MM')
    ), ranking AS (
      SELECT id, sujeto AS "cuentaId", shortcode, tipo, publicada_en AS "publicadaEn", capturada_en AS "capturadaEn",
        interacciones::text AS interacciones, row_number() OVER (ORDER BY interacciones DESC, publicada_en DESC, sujeto,id) AS puesto
      FROM base WHERE interacciones IS NOT NULL
    ), navegacion AS (
      ${soloResumen ? sql`SELECT 0 AS total, 1 AS pagina` : sql`SELECT count(*)::int AS total, least(${seleccion.pagina}::int,
        greatest(1,ceil(count(*)::numeric / ${DESTACADAS_POR_PAGINA})))::int AS pagina FROM ranking`}
    )
    SELECT jsonb_build_object(
      'desde', periodo.desde, 'hasta', periodo.hasta, 'meses', periodo.meses,
      'cuentas', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.propia DESC,i.nombre,i.id) FROM indicadores i), '[]'::jsonb),
      'formatos', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f."cuentaId",f.tipo) FROM formatos f), '[]'::jsonb),
      'actividad', ${soloResumen ? sql`'[]'::jsonb` : sql`coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.mes,a."cuentaId") FROM actividad a), '[]'::jsonb)`},
      'destacadas', ${soloResumen ? sql`'[]'::jsonb` : sql`coalesce((SELECT jsonb_agg(to_jsonb(r) - 'puesto' ORDER BY r.puesto) FROM ranking r
        WHERE r.puesto > (navegacion.pagina - 1) * ${DESTACADAS_POR_PAGINA}
          AND r.puesto <= navegacion.pagina * ${DESTACADAS_POR_PAGINA}), '[]'::jsonb)`},
      'totalDestacadas', navegacion.total, 'pagina', navegacion.pagina
    ) AS informe FROM periodo CROSS JOIN navegacion
  ) AS comparacion`);
  return fila.informe;
}
