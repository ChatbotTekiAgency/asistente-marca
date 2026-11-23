import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { enriquecimientos, posts } from "../../db/schema.ts";
import { VERSION_CLASIFICACION, VERSION_PROMPT, type Clasificacion, type Modalidad, type Proveedor, type Uso } from "./contrato.ts";

export type IdentidadAnalisis = { postId: string; proveedor: Proveedor; modelo: string; modalidad: Modalidad; hashContenido: string };
const version = { versionEsquema: VERSION_CLASIFICACION, versionPrompt: VERSION_PROMPT };

function filtroIdentidad(datos: IdentidadAnalisis) {
  return and(eq(enriquecimientos.postId, datos.postId), eq(enriquecimientos.proveedor, datos.proveedor),
    eq(enriquecimientos.modelo, datos.modelo), eq(enriquecimientos.modalidad, datos.modalidad),
    eq(enriquecimientos.hashContenido, datos.hashContenido), eq(enriquecimientos.versionEsquema, version.versionEsquema),
    eq(enriquecimientos.versionPrompt, version.versionPrompt));
}

export function crearRepositorioEnriquecimiento<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string) {
  const cuenta = eq(posts.cuentaId, cuentaId);
  const ocupado = sql<boolean>`${enriquecimientos.venceEn} > clock_timestamp()`;
  return {
    listar(pagina = 1, proveedor: Proveedor = "anthropic") {
      const resultado = db.select({
        clasificacion: enriquecimientos.clasificacion, proveedor: enriquecimientos.proveedor,
        analizadoEn: enriquecimientos.analizadoEn, modalidad: enriquecimientos.modalidad,
      }).from(enriquecimientos).where(and(eq(enriquecimientos.postId, posts.id), eq(enriquecimientos.estado, "completado")))
        .orderBy(sql`(${enriquecimientos.proveedor} = ${proveedor}) DESC`, desc(enriquecimientos.analizadoEn), desc(enriquecimientos.id))
        .limit(1).as("resultado");
      return db.select({
        id: posts.id, shortcode: posts.shortcode, caption: sql<string | null>`left(${posts.caption}, 220)`,
        conImagen: sql<boolean>`coalesce(${posts.imagenPersistida}, '') <> ''`, resultado: {
          clasificacion: resultado.clasificacion, proveedor: resultado.proveedor,
          analizadoEn: resultado.analizadoEn, modalidad: resultado.modalidad,
        },
      }).from(posts).leftJoinLateral(resultado, sql`true`).where(cuenta)
        .orderBy(desc(posts.publicadaEn), desc(posts.id)).limit(26).offset((pagina - 1) * 25);
    },
    seleccion(ids: string[]) {
      return db.select({ id: posts.id, shortcode: posts.shortcode, caption: posts.caption,
        tipo: posts.tipo, hashtags: posts.hashtags, imagen: posts.imagenPersistida })
        .from(posts).where(and(cuenta, inArray(posts.id, ids)));
    },
    estados(identidades: IdentidadAnalisis[]) {
      if (!identidades.length) return Promise.resolve([]);
      return db.select({ postId: enriquecimientos.postId, estado: enriquecimientos.estado, ocupado })
        .from(enriquecimientos).innerJoin(posts, eq(posts.id, enriquecimientos.postId))
        .where(and(cuenta, or(...identidades.map(filtroIdentidad))));
    },
    async reclamar(datos: IdentidadAnalisis) {
      const intento = crypto.randomUUID();
      const venceEn = sql`clock_timestamp() + interval '90 seconds'`;
      const seleccion = db.select({
        postId: posts.id,
        versionEsquema: sql<number>`${version.versionEsquema}::int`.as("version_esquema"),
        versionPrompt: sql<number>`${version.versionPrompt}::int`.as("version_prompt"),
        proveedor: sql<Proveedor>`${datos.proveedor}::text`.as("proveedor"),
        modelo: sql<string>`${datos.modelo}::text`.as("modelo"),
        modalidad: sql<Modalidad>`${datos.modalidad}::text`.as("modalidad"),
        hashContenido: sql<string>`${datos.hashContenido}::text`.as("hash_contenido"),
        estado: sql<"en_curso">`'en_curso'::text`.as("estado"),
        intento: sql<string>`${intento}::uuid`.as("intento"),
        venceEn: venceEn.as("vence_en"),
      }).from(posts).where(and(cuenta, eq(posts.id, datos.postId)));
      // La inserción lee la cuenta desde posts en la misma sentencia que adquiere la reserva.
      const [fila] = await db.insert(enriquecimientos).select(sql`
        SELECT gen_random_uuid(), entrada.* , NULL::jsonb, NULL::jsonb, NULL::timestamptz
        FROM (${seleccion}) AS entrada
      `).onConflictDoUpdate({
        target: [enriquecimientos.postId, enriquecimientos.versionEsquema, enriquecimientos.versionPrompt,
          enriquecimientos.proveedor, enriquecimientos.modelo, enriquecimientos.modalidad, enriquecimientos.hashContenido],
        set: { estado: "en_curso", intento, venceEn },
        setWhere: or(eq(enriquecimientos.estado, "fallido"), and(eq(enriquecimientos.estado, "en_curso"),
          sql`${enriquecimientos.venceEn} <= clock_timestamp()`)),
      }).returning({ intento: enriquecimientos.intento });
      return fila?.intento ?? null;
    },
    async terminar(id: string, intento: string, resultado: Clasificacion | null, uso?: Uso) {
      const autorizados = db.select({ id: posts.id }).from(posts).where(and(cuenta, eq(posts.id, id)));
      const filas = await db.update(enriquecimientos).set({
        estado: resultado ? "completado" : "fallido", clasificacion: resultado,
        uso: uso && sql`jsonb_strip_nulls(jsonb_build_object(
          'inputTokens', CASE WHEN ${uso.inputTokens ?? null}::int IS NULL THEN (${enriquecimientos.uso}->>'inputTokens')::bigint
            ELSE coalesce((${enriquecimientos.uso}->>'inputTokens')::bigint, 0) + ${uso.inputTokens ?? null}::int END,
          'outputTokens', CASE WHEN ${uso.outputTokens ?? null}::int IS NULL THEN (${enriquecimientos.uso}->>'outputTokens')::bigint
            ELSE coalesce((${enriquecimientos.uso}->>'outputTokens')::bigint, 0) + ${uso.outputTokens ?? null}::int END
        ))`,
        analizadoEn: resultado ? sql`clock_timestamp()` : null,
      }).where(and(inArray(enriquecimientos.postId, autorizados), eq(enriquecimientos.intento, intento),
        eq(enriquecimientos.estado, "en_curso"))).returning({ id: enriquecimientos.id });
      return filas.length === 1;
    },
  };
}
