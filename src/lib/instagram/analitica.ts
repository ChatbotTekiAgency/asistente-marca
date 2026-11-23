import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FiltrosAnalitica, FormatoInstagram } from "./filtros-analitica.ts";
import { interaccionesConocidas, publicacionesConUltimaMetrica } from "./ultima-metrica.ts";

const ZONA = "America/Bogota";
export const PUBLICACIONES_POR_PAGINA = 20;

type Cobertura = {
  publicaciones: number;
  conLikes: number;
  conComentarios: number;
  conReproducciones: number;
  conInteracciones: number;
};

export type ResumenAnalitica = Cobertura & {
  likes: string | null;
  comentarios: string | null;
  reproducciones: string | null;
  mediana: number | null;
  frecuenciaMensual: number | null;
  primeraPublicacion: string | null;
  ultimaPublicacion: string | null;
  ultimaCaptura: string | null;
};

export type FormatoAnalitica = Cobertura & {
  tipo: FormatoInstagram;
  mediana: number | null;
  promedio: number | null;
  totalInteracciones: string | null;
  reproducciones: string | null;
  ultimaCaptura: string | null;
};

export type MesAnalitica = Record<FormatoInstagram, number> & {
  mes: string;
  publicaciones: number;
  mediana: number | null;
  conInteracciones: number;
};

export type PublicacionAnalitica = {
  id: string;
  shortcode: string;
  tipo: FormatoInstagram;
  url: string;
  caption: string | null;
  publicadaEn: string;
  capturadaEn: string | null;
  likes: string | null;
  comentarios: string | null;
  reproducciones: string | null;
  interacciones: string | null;
  multiplo: number | null;
};

export type InformeInstagram = {
  resumen: ResumenAnalitica;
  medianaCuenta: number | null;
  formatos: FormatoAnalitica[];
  meses: MesAnalitica[];
  ranking: PublicacionAnalitica[];
  publicaciones: PublicacionAnalitica[];
  pagina: number;
};

const mediana = sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY interacciones)`;
const cobertura = sql`
  count(*) AS publicaciones,
  count(likes) AS "conLikes",
  count(comentarios) AS "conComentarios",
  count(reproducciones) AS "conReproducciones",
  count(interacciones) AS "conInteracciones"
`;
const ordenFecha = sql`publicada_en DESC, id DESC`;
const ordenInteracciones = sql`interacciones DESC NULLS LAST, ${ordenFecha}`;

export async function consultarAnaliticaInstagram<T extends PgQueryResultHKT>(
  db: PgDatabase<T>, cuentaId: string, filtros: FiltrosAnalitica, { soloResumen = false } = {},
) {
  const condiciones: SQL[] = [sql`true`];
  if (filtros.formato) condiciones.push(sql`tipo = ${filtros.formato}`);
  if (filtros.desde) condiciones.push(sql`publicada_en >= (${filtros.desde}::date::timestamp AT TIME ZONE ${ZONA})`);
  if (filtros.hasta) condiciones.push(sql`publicada_en < ((${filtros.hasta}::date + 1)::timestamp AT TIME ZONE ${ZONA})`);
  const orden = filtros.orden === "interacciones" ? ordenInteracciones : ordenFecha;
  const base = publicacionesConUltimaMetrica(db, cuentaId);

  // Una sentencia mantiene los totales y el listado en la misma instantánea de PostgreSQL.
  const [fila] = await db.select({ informe: sql<InformeInstagram>`reporte.informe` }).from(sql`(
    WITH cuenta AS (
      SELECT *, ${interaccionesConocidas(sql`likes`, sql`comentarios`)} AS interacciones
      FROM (${base}) AS ultima
    ), filtradas AS (
      SELECT *, date_trunc('month', publicada_en AT TIME ZONE ${ZONA}) AS mes
      FROM cuenta WHERE ${sql.join(condiciones, sql` AND `)}
    ), referencia AS (
      SELECT ${mediana} AS mediana FROM cuenta
    ), resumen AS (
      SELECT ${cobertura}, sum(likes)::text AS likes, sum(comentarios)::text AS comentarios,
        sum(reproducciones)::text AS reproducciones, ${mediana} AS mediana,
        min(publicada_en) AS "primeraPublicacion", max(publicada_en) AS "ultimaPublicacion",
        max(capturada_en) AS "ultimaCaptura"
      FROM filtradas
    ), formatos AS (
      SELECT tipo, ${cobertura}, ${mediana} AS mediana, avg(interacciones) AS promedio,
        sum(interacciones)::text AS "totalInteracciones", sum(reproducciones)::text AS reproducciones,
        max(capturada_en) AS "ultimaCaptura"
      FROM filtradas GROUP BY tipo
    ), actividad AS (
      SELECT mes, count(*) AS publicaciones, ${mediana} AS mediana,
        count(interacciones) AS "conInteracciones",
        count(*) FILTER (WHERE tipo = 'carrusel') AS carrusel,
        count(*) FILTER (WHERE tipo = 'video') AS video,
        count(*) FILTER (WHERE tipo = 'imagen') AS imagen
      FROM filtradas GROUP BY mes
    ), meses AS (
      SELECT to_char(calendario.mes, 'YYYY-MM') AS mes,
        coalesce(actividad.publicaciones, 0) AS publicaciones, actividad.mediana,
        coalesce(actividad."conInteracciones", 0) AS "conInteracciones",
        coalesce(actividad.carrusel, 0) AS carrusel, coalesce(actividad.video, 0) AS video,
        coalesce(actividad.imagen, 0) AS imagen
      FROM (
        SELECT generate_series(min(mes), max(mes), interval '1 month') AS mes FROM actividad
      ) AS calendario LEFT JOIN actividad USING (mes)
    ), filas AS (
      SELECT id, publicada_en, interacciones, jsonb_build_object(
        'id', id, 'shortcode', shortcode, 'tipo', tipo, 'url', url, 'caption', left(caption, 160),
        'publicadaEn', publicada_en, 'capturadaEn', capturada_en,
        'likes', likes::text, 'comentarios', comentarios::text, 'reproducciones', reproducciones::text,
        'interacciones', interacciones::text, 'multiplo', interacciones / nullif(referencia.mediana, 0)
      ) AS post FROM filtradas CROSS JOIN referencia
    ), navegacion AS (
      SELECT least(${filtros.pagina}::int, greatest(1, ceil(publicaciones::numeric / ${PUBLICACIONES_POR_PAGINA}))) AS pagina
      FROM resumen
    )
    SELECT jsonb_build_object(
      'resumen', to_jsonb(resumen) || jsonb_build_object(
        'frecuenciaMensual', resumen.publicaciones::numeric / nullif((SELECT count(*) FROM meses), 0)
      ), 'medianaCuenta', ${soloResumen ? sql`NULL` : sql`referencia.mediana`}, 'pagina', navegacion.pagina,
      'formatos', coalesce((SELECT jsonb_agg(to_jsonb(formatos) ORDER BY tipo) FROM formatos), '[]'::jsonb),
      'meses', ${soloResumen ? sql`'[]'::jsonb` : sql`coalesce((SELECT jsonb_agg(to_jsonb(meses) ORDER BY mes) FROM meses), '[]'::jsonb)`},
      'ranking', ${soloResumen ? sql`'[]'::jsonb` : sql`coalesce((SELECT jsonb_agg(post) FROM (
        SELECT post FROM filas WHERE interacciones IS NOT NULL ORDER BY ${ordenInteracciones} LIMIT 5
      ) AS top), '[]'::jsonb)`},
      'publicaciones', ${soloResumen ? sql`'[]'::jsonb` : sql`coalesce((SELECT jsonb_agg(post) FROM (
        SELECT post FROM filas ORDER BY ${orden} LIMIT ${PUBLICACIONES_POR_PAGINA}
        OFFSET (SELECT ((pagina - 1) * ${PUBLICACIONES_POR_PAGINA})::bigint FROM navegacion)
      ) AS pagina_publicaciones), '[]'::jsonb)`}
    ) AS informe FROM resumen CROSS JOIN navegacion ${soloResumen ? sql`` : sql`CROSS JOIN referencia`}
  ) AS reporte`);
  return fila.informe;
}
