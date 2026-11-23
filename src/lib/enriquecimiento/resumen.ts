import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { enriquecimientos } from "../../db/schema.ts";
import type { ContextoMarca } from "../marca/contexto.ts";
import { publicacionesConUltimaMetrica } from "../instagram/ultima-metrica.ts";
import { clasificacionSchema, VERSION_CLASIFICACION, VERSION_PROMPT, type Modalidad } from "./contrato.ts";
import { huella, identificarImagen, prepararContenido } from "./motor.ts";

export const COBERTURA_MINIMA = 5;
export const dimensionesSemanticas = ["tema", "intencion", "tono", "gancho"] as const;
type Dimension = typeof dimensionesSemanticas[number];
type Referencia = { marca: ContextoMarca | null; origenImagen?: string };
type Candidato = { id: string; hash: string; modalidad: Modalidad; analizadoEn: string; clasificacion: unknown };

export async function consultarEnriquecimientosVigentes<T extends PgQueryResultHKT>(
  db: PgDatabase<T>, cuentaId: string, { marca, origenImagen }: Referencia, filtro?: SQL,
) {
  const base = publicacionesConUltimaMetrica(db, cuentaId, filtro).as("base");
  const filas = await db.select({
    postId: base.id, shortcode: base.shortcode, caption: base.caption, hashtags: base.hashtags, imagen: base.imagenPersistida,
    tipo: base.tipo, url: base.url, publicadaEn: base.publicadaEn, capturadaEn: base.capturadaEn,
    interacciones: sql<string | null>`(${base.likes}::numeric + ${base.comentarios})::text`,
    candidatos: sql<Candidato[] | null>`(
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'hash', e.hash_contenido, 'modalidad', e.modalidad,
        'analizadoEn', e.analizado_en, 'clasificacion', e.clasificacion) ORDER BY e.analizado_en DESC, e.id DESC)
      FROM ${enriquecimientos} e
      WHERE e.post_id = base.id AND e.proveedor = 'anthropic' AND e.estado = 'completado'
        AND e.version_esquema = ${VERSION_CLASIFICACION} AND e.version_prompt = ${VERSION_PROMPT}
        AND e.analizado_en IS NOT NULL AND e.clasificacion IS NOT NULL
    )`,
  }).from(base).orderBy(sql`${base.publicadaEn} DESC, ${base.id} DESC`);

  const publicaciones = filas.flatMap(({ candidatos, caption, hashtags, imagen, ...post }) => {
    if (!candidatos?.length) return [];
    const entrada = prepararContenido({ caption, hashtags, tipo: post.tipo }, marca, null);
    const imagenActual = identificarImagen(imagen, origenImagen);
    const hashTexto = huella(entrada);
    const hashVisual = imagenActual ? huella({ ...entrada, imagen: imagenActual }) : null;
    for (const candidato of candidatos) {
      if (candidato.hash !== (candidato.modalidad === "visual" ? hashVisual : hashTexto)) continue;
      const clasificacion = clasificacionSchema.safeParse(candidato.clasificacion);
      if (!clasificacion.success) continue;
      const descripcionVisual = candidato.modalidad === "visual" ? clasificacion.data.descripcionVisual?.trim() || null : null;
      return [{ ...post, enriquecimientoId: candidato.id, modalidad: candidato.modalidad, analizadoEn: candidato.analizadoEn,
        clasificacion: { ...clasificacion.data, descripcionVisual } }];
    }
    return [];
  });
  return {
    publicaciones,
    cobertura: {
      publicacionesImportadas: filas.length,
      publicacionesEnriquecidas: publicaciones.length,
      conDescripcionVisual: publicaciones.filter(({ clasificacion }) => clasificacion.descripcionVisual !== null).length,
      enriquecidasConInteracciones: publicaciones.filter(({ interacciones }) => interacciones !== null).length,
    },
  };
}

type PublicacionEnriquecida = Awaited<ReturnType<typeof consultarEnriquecimientosVigentes>>["publicaciones"][number];

export function normalizarCategoria(valor: string) {
  return valor.trim().replace(/\s+/gu, " ").toLowerCase();
}

export function resumirDimension(publicaciones: PublicacionEnriquecida[], dimension: Dimension) {
  const grupos = new Map<string, { publicaciones: number; interacciones: number[] }>();
  for (const fila of publicaciones) {
    const datos = fila.clasificacion;
    const categoria = normalizarCategoria(dimension === "tema" ? datos.temaPrincipal : datos[dimension]);
    if (!categoria || (dimension === "gancho" && categoria === "sin_evidencia")) continue;
    const grupo = grupos.get(categoria) ?? { publicaciones: 0, interacciones: [] };
    grupo.publicaciones++;
    if (fila.interacciones !== null) grupo.interacciones.push(Number(fila.interacciones));
    grupos.set(categoria, grupo);
  }
  return [...grupos].map(([categoria, grupo]) => {
    const conInteracciones = grupo.interacciones.length;
    const medio = Math.floor(conInteracciones / 2);
    grupo.interacciones.sort((a, b) => a - b);
    const mediana = conInteracciones < COBERTURA_MINIMA ? null : conInteracciones % 2
      ? grupo.interacciones[medio] : (grupo.interacciones[medio - 1] + grupo.interacciones[medio]) / 2;
    return { dimension, categoria, publicaciones: grupo.publicaciones, conInteracciones, mediana };
  }).sort((a, b) => b.publicaciones - a.publicaciones || a.categoria.localeCompare(b.categoria, "es"));
}

export async function consultarDistribucionEnriquecida<T extends PgQueryResultHKT>(
  db: PgDatabase<T>, cuentaId: string, referencia: Referencia,
) {
  const { publicaciones } = await consultarEnriquecimientosVigentes(db, cuentaId, referencia);
  return dimensionesSemanticas.flatMap((dimension) => resumirDimension(publicaciones, dimension));
}
