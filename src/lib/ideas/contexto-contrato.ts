import { z } from "zod";
import { formatosInstagram } from "../instagram/filtros-analitica.ts";
import { fuenteTendencia } from "../tendencias/contrato.ts";
import { camposIdeaPerfil } from "./contrato.ts";

const fecha = z.iso.date().refine((dia) => !dia.startsWith("0000"));
const instante = z.iso.datetime({ offset: true });
const cantidad = z.number().int().nonnegative();
const metrica = z.string().regex(/^\d+$/).nullable();
export const intervaloIdeas = z.strictObject({ desde: fecha, hasta: fecha }).refine(({ desde, hasta }) =>
  desde <= hasta && Date.parse(hasta) - Date.parse(desde) <= 366 * 86_400_000);
export const limitesContextoIdeas = z.strictObject({
  propias: z.number().int().min(0).max(12).default(8),
  competidoras: z.number().int().min(0).max(10).default(5),
  tendencias: z.number().int().min(0).max(8).default(4),
  caption: z.number().int().min(0).max(400).default(140),
  bytes: z.number().int().min(4096).max(32_768).default(12_288),
});
const muestra = z.strictObject({
  publicaciones: cantidad, conInteracciones: cantidad, mediana: z.number().nullable(),
});
const formato = muestra.extend({ tipo: z.enum(formatosInstagram) });
const post = z.strictObject({
  id: z.uuid(), fuente: z.string().max(80), url: fuenteTendencia.shape.url.nullable(),
  publicadaEn: instante, capturadaEn: instante.nullable(), formato: z.enum(formatosInstagram),
  captionNoConfiable: z.string().max(400).nullable(),
  metricas: z.strictObject({ likes: metrica, comentarios: metrica, interacciones: metrica, reproducciones: metrica }),
  limitaciones: z.array(z.string()),
});
export const contextoIdeasSchema = z.strictObject({
  consultadoEn: instante,
  intervalo: intervaloIdeas,
  contenidoExternoNoConfiable: z.literal(true),
  marca: z.array(z.strictObject({ id: z.uuid(), tipo: z.literal("perfil"), fuente: z.literal("perfil_de_marca"),
    campo: camposIdeaPerfil, consultadaEn: instante, dato: z.json() })),
  rendimientoPropio: muestra,
  formatosPropios: z.array(formato),
  propias: z.array(post.extend({
    tipo: z.literal("publicacion_propia"), posicion: z.enum(["superior", "inferior"]),
    observacion: z.strictObject({ desdeDias: cantidad, hastaDias: cantidad, muestra: cantidad, mediana: z.number() }),
    medianaFormato: z.number().nullable(),
    semantica: z.strictObject({ id: z.uuid(), tipo: z.literal("enriquecimiento"), analizadaEn: instante,
      tema: z.string(), intencion: z.string(), gancho: z.string() }).optional(),
  })),
  competencia: z.array(z.strictObject({
    id: z.uuid(), fuente: z.string().max(80), publicaciones: cantidad, conInteracciones: cantidad,
    publicacionesPorMes: z.number().nullable(), diferenciaMensualFrenteAPropia: z.number().nullable(),
    formatos: z.array(formato), temas: z.array(z.string()).length(0),
  })),
  competidoras: z.array(post.extend({ tipo: z.literal("publicacion_competidor") })),
  tendencias: z.array(z.strictObject({
    id: z.uuid(), tipo: z.literal("tendencia"), fuente: z.literal("investigacion_web_guardada"),
    titulo: z.string(), descripcion: z.string(), relevanciaMarca: z.string(), relevancia: z.enum(["alto", "medio", "bajo"]),
    investigadaEn: instante, expiraEn: instante, fuentes: z.array(fuenteTendencia).min(1), limitaciones: z.array(z.string()),
  })),
  limitaciones: z.array(z.string()),
});
export type ContextoIdeas = z.infer<typeof contextoIdeasSchema>;
