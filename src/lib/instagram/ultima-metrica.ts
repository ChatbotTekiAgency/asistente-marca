import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { metricasPost, posts } from "../../db/schema.ts";
import type { SQLWrapper } from "drizzle-orm";

export function interaccionesConocidas(likes: SQLWrapper, comentarios: SQLWrapper) {
  return sql`${likes}::numeric + ${comentarios}`;
}

export function publicacionesConUltimaMetrica<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string, periodo?: SQL) {
  const metrica = db.select({
    likes: metricasPost.likes,
    comentarios: metricasPost.comentarios,
    reproducciones: metricasPost.reproducciones,
    capturadaEn: metricasPost.capturadaEn,
  }).from(metricasPost).where(eq(metricasPost.postId, posts.id))
    .orderBy(desc(metricasPost.capturadaEn), desc(metricasPost.id)).limit(1).as("ultima_metrica");

  return db.select({
    id: posts.id,
    shortcode: posts.shortcode,
    tipo: posts.tipo,
    url: posts.url,
    caption: posts.caption,
    hashtags: posts.hashtags,
    imagenPersistida: posts.imagenPersistida,
    publicadaEn: posts.publicadaEn,
    likes: metrica.likes,
    comentarios: metrica.comentarios,
    reproducciones: metrica.reproducciones,
    capturadaEn: metrica.capturadaEn,
  }).from(posts).leftJoinLateral(metrica, sql`true`).where(and(eq(posts.cuentaId, cuentaId), periodo));
}
