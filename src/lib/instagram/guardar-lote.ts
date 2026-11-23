import { sql } from "drizzle-orm";
import { normalizarApify } from "./normalizar-apify.ts";

type Fila = ReturnType<typeof normalizarApify>["publicaciones"][number];

export function resultadoDataset(dataset: unknown[], username: string) {
  const { publicaciones, rechazados } = normalizarApify(dataset, username);
  const estado = !publicaciones.length ? "fallida" : rechazados.length ? "parcial" : "completada";
  return {
    publicaciones, rechazados, estado,
    mensajeError: estado === "fallida" ? "El dataset no contiene publicaciones válidas."
      : estado === "parcial" ? "Algunos registros fueron rechazados." : null,
  } as const;
}

export const actualizarPostImportado = {
  instagramId: sql`excluded.instagram_id`, tipo: sql`excluded.tipo`, caption: sql`excluded.caption`,
  hashtags: sql`excluded.hashtags`, url: sql`excluded.url`, publicadaEn: sql`excluded.publicada_en`,
  imagenOrigenUrl: sql`excluded.imagen_origen_url`, actualizadaEn: sql`clock_timestamp()`,
};

export async function guardarLotesInstagram(publicaciones: Fila[], operaciones: {
  contarExistentes: (shortcodes: string[]) => Promise<number>;
  guardarPosts: (posts: Fila["post"][]) => Promise<{ id: string; shortcode: string }[]>;
  guardarMetricas: (filas: (Fila["metricas"] & { postId: string })[]) => Promise<unknown>;
}) {
  let actualizadas = 0;
  for (let inicio = 0; inicio < publicaciones.length; inicio += 250) {
    const lote = publicaciones.slice(inicio, inicio + 250);
    actualizadas += await operaciones.contarExistentes(lote.map(({ post }) => post.shortcode));
    const guardadas = await operaciones.guardarPosts(lote.map(({ post }) => post));
    const metricas = new Map(lote.map(({ post, metricas }) => [post.shortcode, metricas]));
    await operaciones.guardarMetricas(guardadas.map(({ id, shortcode }) => ({ ...metricas.get(shortcode)!, postId: id })));
  }
  return { actualizadas, insertadas: publicaciones.length - actualizadas };
}
