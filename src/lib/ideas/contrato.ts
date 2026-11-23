import { z } from "zod";
import { camposMarca } from "../marca/validacion.ts";
import { usoTendencias } from "../tendencias/contrato.ts";

export const estadosIdea = ["nueva", "en_revision", "aprobada", "descartada"] as const;
export const formatosIdea = ["reel", "carrusel", "imagen", "historia", "otro"] as const;
export const erroresGeneracionIdeas = ["proveedor", "respuesta_invalida", "tiempo", "presupuesto", "limite_entrada", "limite_salida"] as const;
const texto = (max: number) => z.string().trim().min(1).max(max).refine((v) => !v.includes("\0"));
const referencia = { id: z.uuid(), relevancia: texto(500) };
export const camposIdeaPerfil = z.enum([...camposMarca, "pilares", "identidadVisual"]);
export const evidenciaIdea = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("publicacion_propia"), ...referencia }),
  z.strictObject({ tipo: z.literal("publicacion_competidor"), ...referencia }),
  z.strictObject({ tipo: z.literal("tendencia"), ...referencia }),
  z.strictObject({ tipo: z.literal("perfil"), ...referencia, campo: camposIdeaPerfil }),
  z.strictObject({ tipo: z.literal("enriquecimiento"), ...referencia }),
]);
export type ReferenciaIdea = z.infer<typeof evidenciaIdea>;

export const ideaContenido = z.strictObject({
  titulo: texto(160), concepto: texto(1000), objetivo: texto(500), publico: texto(300), pilar: texto(160),
  formato: z.enum(formatosIdea), gancho: texto(500), desarrollo: texto(2400), cta: texto(500), justificacion: texto(1200),
  advertencias: z.array(texto(300)).max(8).default([]),
  evidencias: z.array(evidenciaIdea).max(8).default([]).refine((filas) =>
    new Set(filas.map((fila) => [fila.tipo, fila.id, fila.tipo === "perfil" ? fila.campo : ""].join(":"))).size === filas.length),
});
const generacion = {
  clave: z.uuid(), solicitud: texto(2500), proveedor: z.enum(["mock", "anthropic"]),
  modelo: texto(128).optional(), uso: usoTendencias.omit({ busquedasWeb: true }).optional(),
  parametros: z.strictObject({
    cantidad: z.number().int().min(1).max(10), tema: texto(160).optional(),
    formato: z.enum(formatosIdea).optional(), mercado: texto(120).optional(),
    objetivo: texto(500).optional(), publico: texto(300).optional(), pilar: texto(160).optional(),
    intervalo: z.strictObject({ desde: z.iso.date(), hasta: z.iso.date() }).optional(),
  }),
};
export const generacionIdeas = z.discriminatedUnion("estado", [
  z.strictObject({ ...generacion, estado: z.literal("completada"), ideas: z.array(ideaContenido).min(1).max(10) }),
  z.strictObject({ ...generacion, estado: z.literal("fallida"), error: z.enum(erroresGeneracionIdeas) }),
]).refine((fila) => (fila.proveedor === "mock" || !!fila.modelo)
  && (fila.estado === "fallida" || fila.ideas.length <= fila.parametros.cantidad));

export const cambioEstadoIdea = z.strictObject({ id: z.uuid(), revision: z.uuid(), estado: z.enum(estadosIdea) });
export const editarIdea = z.strictObject({
  id: z.uuid(), revision: z.uuid(), datos: ideaContenido.omit({ evidencias: true, advertencias: true }),
});
export const filtrosIdeas = z.strictObject({
  estado: z.enum(estadosIdea).optional(), pagina: z.number().int().min(1).max(10_000).default(1),
  titulo: texto(160).optional(), orden: z.enum(["recientes", "antiguas"]).default("recientes"),
  generacionId: z.uuid().optional(),
});
