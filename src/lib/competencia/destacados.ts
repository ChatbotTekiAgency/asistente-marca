import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { competidores, metricasPostCompetidor, postsCompetidor } from "../../db/schema.ts";
import type { FormatoInstagram } from "../instagram/filtros-analitica.ts";
import { intervaloCompetencia, type SeleccionComparacion } from "./comparacion.ts";

export const metricasDestacadas = ["interacciones", "me_gusta", "comentarios", "reproducciones"] as const;

export async function consultarDestacadosCompetidor<T extends PgQueryResultHKT>(
  db: PgDatabase<T>, cuentaId: string, competidorId: string,
  filtros: Pick<SeleccionComparacion, "desde" | "hasta"> & {
    cantidad: number; formato?: FormatoInstagram; metrica: typeof metricasDestacadas[number];
  },
) {
  const post = postsCompetidor;
  const captura = metricasPostCompetidor;
  const ultima = db.select({
    likes: captura.likes, comentarios: captura.comentarios, reproducciones: captura.reproducciones, fecha: captura.capturadaEn,
  }).from(captura).where(eq(captura.postId, post.id))
    .orderBy(sql`${captura.capturadaEn} DESC NULLS LAST`, sql`${captura.id} DESC NULLS LAST`).limit(1).as("ultima");
  const interacciones = sql`${ultima.likes}::numeric + ${ultima.comentarios}`;
  const orden = {
    interacciones, me_gusta: ultima.likes, comentarios: ultima.comentarios, reproducciones: ultima.reproducciones,
  }[filtros.metrica];

  return db.select({
    id: post.id, shortcode: post.shortcode, url: post.url, formato: post.tipo,
    fragmento: sql<string | null>`left(${post.caption}, 400)`,
    publicadaEn: post.publicadaEn, capturadaEn: ultima.fecha,
    meGusta: sql<string | null>`${ultima.likes}::text`, comentarios: sql<string | null>`${ultima.comentarios}::text`,
    reproducciones: sql<string | null>`${ultima.reproducciones}::text`, interacciones: sql<string | null>`(${interacciones})::text`,
  }).from(post).innerJoin(competidores, eq(competidores.id, post.competidorId))
    .leftJoinLateral(ultima, sql`true`)
    .where(and(eq(competidores.cuentaId, cuentaId), eq(competidores.id, competidorId),
      filtros.formato ? eq(post.tipo, filtros.formato) : undefined,
      filtros.metrica === "reproducciones" ? eq(post.tipo, "video") : undefined,
      intervaloCompetencia(post.publicadaEn, filtros), isNotNull(orden)))
    .orderBy(sql`${orden} DESC`, sql`${post.publicadaEn} DESC`, sql`${post.id} DESC`)
    .limit(filtros.cantidad);
}
