
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  bigint,
  integer,
  pgEnum,
  uniqueIndex,
  index,
  check,
  bigserial,
  date,
  primaryKey,
  boolean,
  foreignKey,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import type { PilarMarca } from "../lib/marca/validacion";
import type { IdentidadVisual } from "../lib/marca/identidad-visual";
import type { Clasificacion, Modalidad, Proveedor, Uso } from "../lib/enriquecimiento/contrato";
import { erroresGeneracionIdeas, estadosIdea, formatosIdea } from "../lib/ideas/contrato.ts";
import type { CategoriasEvaluacion, motivosEvaluacion } from "../lib/ideas/evaluacion-contrato";

export const cuentas = pgTable("cuentas", {
  id: uuid("id").defaultRandom().primaryKey(),

  igUserId: text("ig_user_id")
    .notNull()
    .unique(),

  username: text("username").notNull(),

  accessTokenCifrado: text("access_token_cifrado"),

  tokenExpiraEn: timestamp("token_expira_en", {
    withTimezone: true,
  }),

  apifyReservadaHasta: timestamp("apify_reservada_hasta", { withTimezone: true }),

  perfilMarca: jsonb("perfil_marca").$type<
    Record<string, unknown>
  >(),

  creadaEn: timestamp("creada_en", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  actualizadaEn: timestamp("actualizada_en", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const tipoPost = pgEnum("tipo_post", ["carrusel", "video", "imagen"]);

export const competidores = pgTable("competidores", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentas.id),
  username: text("username").notNull(),
  url: text("url").notNull().generatedAlwaysAs(sql`'https://www.instagram.com/' || "username" || '/'`),
  nombre: text("nombre"),
  descripcion: text("descripcion"),
  activo: boolean("activo").notNull().default(false),
  cupo: integer("cupo"),
  revision: uuid("revision").notNull().defaultRandom(),
  creadoEn: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
}, (tabla) => [
  uniqueIndex("competidores_cuenta_username_idx").on(tabla.cuentaId, tabla.username),
  uniqueIndex("competidores_cuenta_cupo_idx").on(tabla.cuentaId, tabla.cupo),
  check("competidores_username_normalizado", sql`${tabla.username} ~ '^[a-z0-9._]{1,30}$'`),
  check("competidores_estado_cupo", sql`(${tabla.activo} = (${tabla.cupo} IS NOT NULL)) AND (${tabla.cupo} BETWEEN 1 AND 5 OR ${tabla.cupo} IS NULL)`),
]);

export const estadoIngesta = pgEnum("estado_ingesta", [
  "completada", "parcial", "fallida",
]);

export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentas.id),
  instagramId: text("instagram_id").notNull(),
  shortcode: text("shortcode").notNull(),
  tipo: tipoPost("tipo").notNull(),
  caption: text("caption"),
  hashtags: text("hashtags").array().notNull().default(sql`ARRAY[]::text[]`),
  url: text("url").notNull(),
  publicadaEn: timestamp("publicada_en", { withTimezone: true }).notNull(),
  imagenOrigenUrl: text("imagen_origen_url"),
  imagenPersistida: text("imagen_persistida"),
  creadaEn: timestamp("creada_en", { withTimezone: true }).defaultNow().notNull(),
  actualizadaEn: timestamp("actualizada_en", { withTimezone: true }).defaultNow().notNull(),
}, (tabla) => [
  uniqueIndex("posts_cuenta_shortcode_idx").on(tabla.cuentaId, tabla.shortcode),
  index("posts_cuenta_publicada_idx").on(tabla.cuentaId, tabla.publicadaEn.desc()),
]);

export const ingestas = pgTable("ingestas", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentas.id),
  proveedor: text("proveedor").notNull(),
  apifyRunId: text("apify_run_id"),
  claveOrigen: text("clave_origen").notNull(),
  estado: estadoIngesta("estado").notNull(),
  procesadas: integer("procesadas").default(0).notNull(),
  errores: integer("errores").default(0).notNull(),
  iniciadaEn: timestamp("iniciada_en", { withTimezone: true }).notNull(),
  finalizadaEn: timestamp("finalizada_en", { withTimezone: true }).notNull(),
  mensajeError: text("mensaje_error"),
}, (tabla) => [
  uniqueIndex("ingestas_cuenta_origen_idx").on(tabla.cuentaId, tabla.proveedor, tabla.claveOrigen),
  uniqueIndex("ingestas_cuenta_apify_run_idx").on(tabla.cuentaId, tabla.apifyRunId),
]);

export const metricasPost = pgTable("metricas_post", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id").notNull().references(() => posts.id),
  ingestaId: uuid("ingesta_id").notNull().references(() => ingestas.id),
  likes: bigint("likes", { mode: "number" }),
  comentarios: bigint("comentarios", { mode: "number" }),
  reproducciones: bigint("reproducciones", { mode: "number" }),
  capturadaEn: timestamp("capturada_en", { withTimezone: true }).notNull(),
}, (tabla) => [
  uniqueIndex("metricas_post_ingesta_idx").on(tabla.postId, tabla.ingestaId),
  index("metricas_ingesta_idx").on(tabla.ingestaId),
  index("metricas_post_capturada_idx").on(tabla.postId, tabla.capturadaEn.desc(), tabla.id.desc()),
  check("metricas_no_negativas", sql`${tabla.likes} >= 0 AND ${tabla.comentarios} >= 0 AND ${tabla.reproducciones} >= 0`),
]);

export const estadoIngestaCompetidor = pgEnum("estado_ingesta_competidor", [
  "iniciando", "en_curso", "completada", "parcial", "fallida", "cancelada", "expirada",
]);

export const postsCompetidor = pgTable("posts_competidor", {
  id: uuid("id").defaultRandom().primaryKey(),
  competidorId: uuid("competidor_id").notNull().references(() => competidores.id),
  instagramId: text("instagram_id").notNull(),
  shortcode: text("shortcode").notNull(),
  tipo: tipoPost("tipo").notNull(),
  caption: text("caption"),
  hashtags: text("hashtags").array().notNull(),
  url: text("url").notNull(),
  publicadaEn: timestamp("publicada_en", { withTimezone: true }).notNull(),
  imagenOrigenUrl: text("imagen_origen_url"),
  creadaEn: timestamp("creada_en", { withTimezone: true }).defaultNow().notNull(),
  actualizadaEn: timestamp("actualizada_en", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("posts_competidor_shortcode_idx").on(t.competidorId, t.shortcode),
  uniqueIndex("posts_competidor_ambito_idx").on(t.competidorId, t.id),
  index("posts_competidor_fecha_idx").on(t.competidorId, t.publicadaEn.desc(), t.id.desc()),
]);

export const ingestasCompetidor = pgTable("ingestas_competidor", {
  id: uuid("id").defaultRandom().primaryKey(),
  competidorId: uuid("competidor_id").notNull().references(() => competidores.id),
  username: text("username").notNull(),
  origen: text("origen").$type<"archivo" | "apify">().notNull(),
  hashDataset: text("hash_dataset"),
  apifyRunId: text("apify_run_id"),
  limite: integer("limite"),
  estado: estadoIngestaCompetidor("estado").notNull(),
  procesadas: integer("procesadas").default(0).notNull(),
  errores: integer("errores").default(0).notNull(),
  iniciadaEn: timestamp("iniciada_en", { withTimezone: true }).defaultNow().notNull(),
  finalizadaEn: timestamp("finalizada_en", { withTimezone: true }),
  reservaHasta: timestamp("reserva_hasta", { withTimezone: true }),
  mensajeError: text("mensaje_error"),
}, (t) => [
  uniqueIndex("ingestas_competidor_ambito_idx").on(t.competidorId, t.id),
  uniqueIndex("ingestas_competidor_dataset_idx").on(t.competidorId, t.hashDataset),
  uniqueIndex("ingestas_competidor_run_idx").on(t.apifyRunId),
  uniqueIndex("ingestas_competidor_pendiente_idx").on(t.competidorId)
    .where(sql`${t.estado} IN ('iniciando', 'en_curso')`),
  index("ingestas_competidor_fecha_idx").on(t.competidorId, t.iniciadaEn.desc(), t.id.desc()),
  check("ingestas_competidor_origen_valido", sql`${t.origen} IN ('archivo', 'apify')`),
]);

export const metricasPostCompetidor = pgTable("metricas_post_competidor", {
  id: uuid("id").defaultRandom().primaryKey(),
  competidorId: uuid("competidor_id").notNull(),
  postId: uuid("post_id").notNull(),
  ingestaId: uuid("ingesta_id").notNull(),
  likes: bigint("likes", { mode: "number" }),
  comentarios: bigint("comentarios", { mode: "number" }),
  reproducciones: bigint("reproducciones", { mode: "number" }),
  capturadaEn: timestamp("capturada_en", { withTimezone: true }).notNull(),
}, (t) => [
  foreignKey({ name: "metricas_competidor_fk_post", columns: [t.competidorId, t.postId],
    foreignColumns: [postsCompetidor.competidorId, postsCompetidor.id] }),
  foreignKey({ name: "metricas_competidor_fk_ingesta", columns: [t.competidorId, t.ingestaId],
    foreignColumns: [ingestasCompetidor.competidorId, ingestasCompetidor.id] }),
  uniqueIndex("metricas_competidor_post_ingesta_idx").on(t.postId, t.ingestaId),
  index("metricas_competidor_ingesta_idx").on(t.competidorId, t.ingestaId),
  index("metricas_competidor_capturada_idx").on(t.postId, t.capturadaEn.desc(), t.id.desc()),
  check("metricas_competidor_no_negativas", sql`${t.likes} >= 0 AND ${t.comentarios} >= 0 AND ${t.reproducciones} >= 0`),
]);

export const rolMensaje = pgEnum("rol_mensaje", ["user", "assistant", "system"]);

export const conversaciones = pgTable("conversaciones", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentas.id),
  titulo: text("titulo").notNull(),
  creadaEn: timestamp("creada_en", { withTimezone: true }).defaultNow().notNull(),
  actualizadaEn: timestamp("actualizada_en", { withTimezone: true }).defaultNow().notNull(),
  intentoActivo: uuid("intento_activo"),
  reservaHasta: timestamp("reserva_hasta", { withTimezone: true }),
}, (tabla) => [
  index("conversaciones_cuenta_actualizada_idx").on(tabla.cuentaId, tabla.actualizadaEn.desc(), tabla.id.desc()),
  check("conversaciones_reserva_completa", sql`(${tabla.intentoActivo} IS NULL) = (${tabla.reservaHasta} IS NULL)`),
]);

export const mensajes = pgTable("mensajes", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversacionId: uuid("conversacion_id").notNull().references(() => conversaciones.id, { onDelete: "cascade" }),
  solicitudId: uuid("solicitud_id"),
  rol: rolMensaje("rol").notNull(),
  partes: jsonb("partes").$type<UIMessage["parts"]>().notNull(),
  orden: bigserial("orden", { mode: "bigint" }).notNull(),
  creadoEn: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  uso: jsonb("uso").$type<{ inputTokens?: number; outputTokens?: number }>(),
}, (tabla) => [
  uniqueIndex("mensajes_solicitud_rol_idx").on(tabla.conversacionId, tabla.solicitudId, tabla.rol),
  uniqueIndex("mensajes_conversacion_orden_idx").on(tabla.conversacionId, tabla.orden),
  check("mensajes_solicitud_requerida", sql`${tabla.rol} = 'system' OR ${tabla.solicitudId} IS NOT NULL`),
]);

export const cuotasChat = pgTable("cuotas_chat", {
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentas.id),
  dia: date("dia").notNull(),
  solicitudes: integer("solicitudes").notNull(),
}, (tabla) => [
  primaryKey({ columns: [tabla.cuentaId, tabla.dia] }),
  check("cuotas_chat_solicitudes_positivas", sql`${tabla.solicitudes} > 0`),
]);

export const perfilesMarca = pgTable("perfiles_marca", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull().unique().references(() => cuentas.id),
  nombre: text("nombre").notNull().default(""),
  sector: text("sector").notNull().default(""),
  descripcion: text("descripcion").notNull().default(""),
  productosServicios: text("productos_servicios").notNull().default(""),
  propuestaValor: text("propuesta_valor").notNull().default(""),
  publicoObjetivo: text("publico_objetivo").notNull().default(""),
  necesidades: text("necesidades").notNull().default(""),
  intereses: text("intereses").notNull().default(""),
  problemas: text("problemas").notNull().default(""),
  personalidad: text("personalidad").notNull().default(""),
  tono: text("tono").notNull().default(""),
  valores: text("valores").notNull().default(""),
  expresionesPreferidas: text("expresiones_preferidas").notNull().default(""),
  expresionesEvitar: text("expresiones_evitar").notNull().default(""),
  objetivos: text("objetivos").notNull().default(""),
  diferenciadores: text("diferenciadores").notNull().default(""),
  pilares: jsonb("pilares").$type<PilarMarca[]>().notNull().default(sql`'[]'::jsonb`),
  identidadVisual: jsonb("identidad_visual").$type<Partial<IdentidadVisual>>().notNull().default(sql`'{}'::jsonb`),
  revision: uuid("revision").defaultRandom().notNull(),
  creadaEn: timestamp("creada_en", { withTimezone: true }).defaultNow().notNull(),
  actualizadaEn: timestamp("actualizada_en", { withTimezone: true }).defaultNow().notNull(),
}, (tabla) => [
  check("perfiles_marca_pilares_array", sql`jsonb_typeof(${tabla.pilares}) = 'array'`),
  check("perfiles_marca_identidad_visual_objeto", sql`jsonb_typeof(${tabla.identidadVisual}) = 'object'`),
]);

export const enriquecimientos = pgTable("enriquecimientos_post", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id").notNull().references(() => posts.id),
  versionEsquema: integer("version_esquema").notNull(),
  versionPrompt: integer("version_prompt").notNull(),
  proveedor: text("proveedor").$type<Proveedor>().notNull(),
  modelo: text("modelo").notNull(),
  modalidad: text("modalidad").$type<Modalidad>().notNull(),
  hashContenido: text("hash_contenido").notNull(),
  estado: text("estado").$type<"en_curso" | "completado" | "fallido">().notNull(),
  intento: uuid("intento").notNull(),
  venceEn: timestamp("vence_en", { withTimezone: true }).notNull(),
  clasificacion: jsonb("clasificacion").$type<Clasificacion>(),
  uso: jsonb("uso").$type<Uso>(),
  analizadoEn: timestamp("analizado_en", { withTimezone: true }),
}, (tabla) => [
  uniqueIndex("enriquecimientos_identidad_idx").on(
    tabla.postId, tabla.versionEsquema, tabla.versionPrompt, tabla.proveedor, tabla.modelo, tabla.modalidad, tabla.hashContenido,
  ),
  index("enriquecimientos_post_fecha_idx").on(tabla.postId, tabla.analizadoEn.desc()),
  check("enriquecimientos_proveedor_valido", sql`${tabla.proveedor} IN ('mock','anthropic')`),
  check("enriquecimientos_modalidad_valida", sql`${tabla.modalidad} IN ('texto','visual')`),
  check("enriquecimientos_estado_valido", sql`${tabla.estado} IN ('en_curso','completado','fallido')`),
]);

export const solicitudesTendencias = pgTable("solicitudes_tendencias", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentas.id),
  clave: uuid("clave").notNull(),
  huellaCache: text("huella_cache"),
  tema: text("tema"),
  mercado: text("mercado"),
  reservaEstimadaUsd: numeric("reserva_estimada_usd", { precision: 14, scale: 8, mode: "number" }),
  estado: text("estado", { enum: ["en_curso", "completada", "fallida"] }).notNull(),
  proveedor: text("proveedor", { enum: ["mock", "anthropic"] }).notNull(),
  modelo: text("modelo").notNull(),
  tokensEntrada: integer("tokens_entrada"),
  tokensSalida: integer("tokens_salida"),
  busquedasWeb: integer("busquedas_web"),
  costoEstimadoUsd: numeric("costo_estimado_usd", { precision: 14, scale: 8, mode: "number" }),
  error: text("error", { enum: ["respuesta_invalida", "proveedor", "vencida"] }),
  creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
  venceEn: timestamp("vence_en", { withTimezone: true }).notNull(),
  finalizadaEn: timestamp("finalizada_en", { withTimezone: true }),
  expiraCacheEn: timestamp("expira_cache_en", { withTimezone: true }),
}, (t) => [
  uniqueIndex("tendencias_cuenta_clave_idx").on(t.cuentaId, t.clave),
  index("tendencias_cuenta_fecha_idx").on(t.cuentaId, t.creadaEn.desc(), t.id.desc()),
  index("tendencias_cache_vigencia_idx").on(t.cuentaId, t.huellaCache, t.expiraCacheEn.desc())
    .where(sql`${t.estado} = 'completada'`),
  uniqueIndex("tendencias_cache_en_curso_idx").on(t.cuentaId, t.huellaCache)
    .where(sql`${t.estado} = 'en_curso' AND ${t.huellaCache} IS NOT NULL`),
  check("tendencias_cache_metadatos_validos", sql`
    (${t.huellaCache} IS NULL OR ${t.huellaCache} ~ '^[a-f0-9]{64}$') AND
    (${t.busquedasWeb} IS NULL OR ${t.busquedasWeb} >= 0) AND
    (${t.reservaEstimadaUsd} IS NULL OR ${t.reservaEstimadaUsd} >= 0)`),
  check("tendencias_proveedor_valido", sql`${t.proveedor} IN ('mock', 'anthropic')`),
  check("tendencias_metadatos_validos", sql`${t.tokensEntrada} >= 0 AND ${t.tokensSalida} >= 0 AND ${t.costoEstimadoUsd} >= 0`),
  check("tendencias_estado_coherente", sql`
    (${t.estado} = 'en_curso' AND ${t.finalizadaEn} IS NULL AND ${t.expiraCacheEn} IS NULL AND ${t.error} IS NULL) OR
    (${t.estado} = 'completada' AND ${t.finalizadaEn} IS NOT NULL AND ${t.expiraCacheEn} > ${t.finalizadaEn}
      AND ${t.expiraCacheEn} IS NOT NULL AND ${t.error} IS NULL) OR
    (${t.estado} = 'fallida' AND ${t.finalizadaEn} IS NOT NULL AND ${t.expiraCacheEn} IS NULL
      AND ${t.error} IS NOT NULL AND ${t.error} IN ('respuesta_invalida', 'proveedor', 'vencida'))
  `),
]);

export const resultadosTendencias = pgTable("resultados_tendencias", {
  id: uuid("id").primaryKey(),
  solicitudId: uuid("solicitud_id").notNull().references(() => solicitudesTendencias.id),
  posicion: integer("posicion").notNull(),
  titulo: text("titulo").notNull(),
  descripcion: text("descripcion").notNull(),
  relevanciaMarca: text("relevancia_marca").notNull(),
  ejemploAplicacion: text("ejemplo_aplicacion").notNull(),
  formato: text("formato", { enum: ["reel", "carrusel", "imagen", "historia", "otro"] }).notNull(),
  publicoObjetivo: text("publico_objetivo").notNull(),
  relevancia: text("relevancia", { enum: ["alto", "medio", "bajo"] }).notNull(),
  investigadaEn: timestamp("investigada_en", { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex("tendencias_resultado_posicion_idx").on(t.solicitudId, t.posicion),
  check("tendencias_resultado_posicion_valida", sql`${t.posicion} BETWEEN 1 AND 4`),
  check("tendencias_formato_valido", sql`${t.formato} IN ('reel', 'carrusel', 'imagen', 'historia', 'otro')`),
  check("tendencias_relevancia_valida", sql`${t.relevancia} IN ('alto', 'medio', 'bajo')`),
]);

export const fuentesTendencias = pgTable("fuentes_tendencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  tendenciaId: uuid("tendencia_id").notNull().references(() => resultadosTendencias.id),
  posicion: integer("posicion").notNull(),
  titulo: text("titulo").notNull(),
  url: text("url").notNull(),
  sitio: text("sitio"),
  publicadaEl: date("publicada_el"),
}, (t) => [
  uniqueIndex("tendencias_fuente_posicion_idx").on(t.tendenciaId, t.posicion),
  uniqueIndex("tendencias_fuente_url_idx").on(t.tendenciaId, t.url),
  check("tendencias_fuente_valida", sql`${t.posicion} BETWEEN 1 AND 5 AND ${t.url} LIKE 'https://%'`),
]);

export const generacionesIdeas = pgTable("generaciones_ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentas.id),
  clave: uuid("clave").notNull(),
  huella: text("huella").notNull(),
  solicitud: text("solicitud").notNull(),
  parametros: jsonb("parametros").$type<Record<string, unknown>>().notNull(),
  estado: text("estado", { enum: ["completada", "fallida"] }).notNull(),
  proveedor: text("proveedor", { enum: ["mock", "anthropic"] }).notNull(),
  modelo: text("modelo"),
  cantidad: integer("cantidad").notNull(),
  tokensEntrada: integer("tokens_entrada"),
  tokensSalida: integer("tokens_salida"),
  costoEstimadoUsd: numeric("costo_estimado_usd", { precision: 14, scale: 8, mode: "number" }),
  error: text("error", { enum: erroresGeneracionIdeas }),
  creadaEn: timestamp("creada_en", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("generaciones_ideas_cuenta_clave_idx").on(t.cuentaId, t.clave),
  uniqueIndex("generaciones_ideas_ambito_idx").on(t.cuentaId, t.id),
  index("generaciones_ideas_historial_idx").on(t.cuentaId, t.creadaEn.desc(), t.id.desc()),
  check("generaciones_ideas_coherente", sql`
    ${t.proveedor} IN ('mock','anthropic') AND (${t.proveedor} = 'mock' OR ${t.modelo} IS NOT NULL)
    AND ((${t.estado} = 'completada' AND ${t.cantidad} BETWEEN 1 AND 10 AND ${t.error} IS NULL)
      OR (${t.estado} = 'fallida' AND ${t.cantidad} = 0 AND ${t.error} IS NOT NULL
        AND ${t.error} IN ('proveedor','respuesta_invalida','tiempo','presupuesto','limite_entrada','limite_salida')))
    AND ${t.tokensEntrada} >= 0 AND ${t.tokensSalida} >= 0 AND ${t.costoEstimadoUsd} >= 0`),
]);

export const ideasContenido = pgTable("ideas_contenido", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull(),
  generacionId: uuid("generacion_id").notNull(),
  posicion: integer("posicion").notNull(),
  titulo: text("titulo").notNull(),
  concepto: text("concepto").notNull(),
  objetivo: text("objetivo").notNull(),
  publico: text("publico").notNull(),
  pilar: text("pilar").notNull(),
  formato: text("formato", { enum: formatosIdea }).notNull(),
  gancho: text("gancho").notNull(),
  desarrollo: text("desarrollo").notNull(),
  cta: text("cta").notNull(),
  justificacion: text("justificacion").notNull(),
  advertencias: jsonb("advertencias").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  estado: text("estado", { enum: estadosIdea }).notNull().default("nueva"),
  revision: uuid("revision").defaultRandom().notNull(),
  generadaEn: timestamp("generada_en", { withTimezone: true }).defaultNow().notNull(),
  actualizadaEn: timestamp("actualizada_en", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: "ideas_generacion_fk", columns: [t.cuentaId, t.generacionId], foreignColumns: [generacionesIdeas.cuentaId, generacionesIdeas.id] }),
  uniqueIndex("ideas_cuenta_id_idx").on(t.cuentaId, t.id),
  uniqueIndex("ideas_generacion_posicion_idx").on(t.generacionId, t.posicion),
  index("ideas_cuenta_fecha_idx").on(t.cuentaId, t.generadaEn.desc(), t.id.desc()),
  index("ideas_cuenta_estado_idx").on(t.cuentaId, t.estado, t.generadaEn.desc(), t.id.desc()),
  check("ideas_formato_estado_validos", sql`${t.formato} IN ('reel','carrusel','imagen','historia','otro')
    AND ${t.estado} IN ('nueva','en_revision','aprobada','descartada') AND ${t.posicion} BETWEEN 1 AND 10`),
]);

export const reservasIdeas = pgTable("reservas_ideas", {
  cuentaId: uuid("cuenta_id").notNull().references(() => cuentas.id),
  clave: uuid("clave").notNull(),
  huella: text("huella").notNull(),
  creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
  venceEn: timestamp("vence_en", { withTimezone: true }).notNull(),
  finalizadaEn: timestamp("finalizada_en", { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.cuentaId, t.clave] }),
  index("reservas_ideas_cuenta_fecha_idx").on(t.cuentaId, t.creadaEn.desc()),
]);


export const evaluacionesIdeas = pgTable("evaluaciones_ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull(),
  ideaId: uuid("idea_id").notNull(),
  version: integer("version").notNull(),
  calificacion: integer("calificacion").notNull(),
  comentario: text("comentario"),
  motivo: text("motivo").$type<keyof typeof motivosEvaluacion>(),
  categorias: jsonb("categorias").$type<CategoriasEvaluacion>().notNull(),
  estadoIdea: text("estado_idea", { enum: estadosIdea }).notNull(),
  tituloIdea: text("titulo_idea").notNull(),
  formatoIdea: text("formato_idea", { enum: formatosIdea }).notNull(),
  evaluadaEn: timestamp("evaluada_en", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "evaluaciones_idea_fk", columns: [t.cuentaId, t.ideaId],
    foreignColumns: [ideasContenido.cuentaId, ideasContenido.id] }),
  uniqueIndex("evaluaciones_cuenta_idea_version_idx").on(t.cuentaId, t.ideaId, t.version.desc()),
  index("evaluaciones_cuenta_fecha_idx").on(t.cuentaId, t.evaluadaEn.desc()),
  check("evaluaciones_datos_validos", sql`${t.calificacion} BETWEEN 1 AND 5 AND ${t.version} > 0
    AND char_length(${t.comentario}) <= 1000 AND jsonb_typeof(${t.categorias}) = 'object'`),
]);

export const evidenciasIdeas = pgTable("evidencias_ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  cuentaId: uuid("cuenta_id").notNull(),
  ideaId: uuid("idea_id").notNull(),
  posicion: integer("posicion").notNull(),
  tipo: text("tipo", { enum: ["publicacion_propia","publicacion_competidor","tendencia","perfil","enriquecimiento"] }).notNull(),
  postId: uuid("post_id").references(() => posts.id),
  postCompetidorId: uuid("post_competidor_id").references(() => postsCompetidor.id),
  tendenciaId: uuid("tendencia_id").references(() => resultadosTendencias.id),
  perfilId: uuid("perfil_id").references(() => perfilesMarca.id),
  campoPerfil: text("campo_perfil"),
  enriquecimientoId: uuid("enriquecimiento_id").references(() => enriquecimientos.id),
  relevancia: text("relevancia").notNull(),
  url: text("url"),
  consultadaEn: timestamp("consultada_en", { withTimezone: true }).defaultNow().notNull(),
  datos: jsonb("datos").$type<Record<string, unknown>>().notNull(),
}, (t) => [
  foreignKey({ name: "evidencias_idea_fk", columns: [t.cuentaId, t.ideaId], foreignColumns: [ideasContenido.cuentaId, ideasContenido.id] }),
  uniqueIndex("evidencias_idea_posicion_idx").on(t.ideaId, t.posicion),
  check("evidencias_referencia_valida", sql`
    num_nonnulls(${t.postId},${t.postCompetidorId},${t.tendenciaId},${t.perfilId},${t.enriquecimientoId}) = 1
    AND ((${t.tipo} = 'publicacion_propia' AND ${t.postId} IS NOT NULL)
      OR (${t.tipo} = 'publicacion_competidor' AND ${t.postCompetidorId} IS NOT NULL)
      OR (${t.tipo} = 'tendencia' AND ${t.tendenciaId} IS NOT NULL)
      OR (${t.tipo} = 'perfil' AND ${t.perfilId} IS NOT NULL)
      OR (${t.tipo} = 'enriquecimiento' AND ${t.enriquecimientoId} IS NOT NULL))
    AND (${t.tipo} = 'perfil') = (${t.campoPerfil} IS NOT NULL)
    AND ${t.posicion} BETWEEN 1 AND 8 AND (${t.url} IS NULL OR ${t.url} LIKE 'https://%')`),
]);
