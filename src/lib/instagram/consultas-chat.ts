import { desc, isNotNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { z } from "zod";
import { publicacionesConUltimaMetrica } from "./ultima-metrica.ts";

const limiteSchema = z.number().int().min(1).max(30);

export function crearConsultasInstagram<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string, soloInteraccionesCompletas = false) {
  const publicaciones = publicacionesConUltimaMetrica(db, cuentaId).as("publicaciones_cuenta");
  const camposPublicos = {
    id: publicaciones.id, shortcode: publicaciones.shortcode, tipo: publicaciones.tipo, url: publicaciones.url,
    publicadaEn: publicaciones.publicadaEn, likes: publicaciones.likes,
    comentarios: publicaciones.comentarios, reproducciones: publicaciones.reproducciones, capturadaEn: publicaciones.capturadaEn,
  };

  const interaccionesParciales = sql`
    CASE WHEN ${publicaciones.likes} IS NOT NULL OR ${publicaciones.comentarios} IS NOT NULL
      THEN COALESCE(${publicaciones.likes}, 0)::numeric + COALESCE(${publicaciones.comentarios}, 0)
    END
  `;
  const sumaCompleta = sql`${publicaciones.likes}::numeric + ${publicaciones.comentarios}`;
  const interaccionesRegistradas = (soloInteraccionesCompletas ? sumaCompleta : interaccionesParciales)
    .mapWith(String).as("interacciones_registradas");
  const resumen = {
    publicaciones: sql<number>`count(*)`.mapWith(Number),
    publicacionesConLikes: sql<number>`count(${publicaciones.likes})`.mapWith(Number),
    publicacionesConComentarios: sql<number>`count(${publicaciones.comentarios})`.mapWith(Number),
    publicacionesConReproducciones: sql<number>`count(${publicaciones.reproducciones})`.mapWith(Number),
    likes: sql<string | null>`sum(${publicaciones.likes})`.mapWith(String),
    comentarios: sql<string | null>`sum(${publicaciones.comentarios})`.mapWith(String),
    reproducciones: sql<string | null>`sum(${publicaciones.reproducciones})`.mapWith(String),
  };

  return {
    recientes(limite = 10) {
      return db.select(camposPublicos).from(publicaciones).orderBy(desc(publicaciones.publicadaEn), desc(publicaciones.id))
        .limit(limiteSchema.parse(limite));
    },
    masInteracciones(limite = 10) {
      return db.select({
        ...camposPublicos,
        interaccionesRegistradas,
      }).from(publicaciones).where(isNotNull(interaccionesRegistradas.sql))
        .orderBy(desc(interaccionesRegistradas), desc(publicaciones.publicadaEn), desc(publicaciones.id))
        .limit(limiteSchema.parse(limite));
    },
    buscar(texto: string, limite = 10) {
      const termino = z.string().trim().min(2).max(100).refine((valor) => !valor.includes("\0")).parse(texto);
      return db.select({
        ...camposPublicos,
        captionNoConfiable: sql<string | null>`left(${publicaciones.caption}, 160)`,
      }).from(publicaciones)
        .where(sql`lower(${publicaciones.shortcode}) = lower(${termino})
          OR strpos(lower(${publicaciones.caption}), lower(${termino})) > 0`)
        .orderBy(desc(publicaciones.publicadaEn), desc(publicaciones.id)).limit(limiteSchema.parse(limite));
    },
    porFormato() {
      return db.select({ tipo: publicaciones.tipo, ...resumen }).from(publicaciones)
        .groupBy(publicaciones.tipo).orderBy(publicaciones.tipo);
    },
    async resumenPublico() {
      const [fila] = await db.select(resumen).from(publicaciones);
      return fila;
    },
  };
}

export type ConsultasInstagram = ReturnType<typeof crearConsultasInstagram>;
