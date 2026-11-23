import { z } from "zod";

export const VERSION_CLASIFICACION = 1;
export const VERSION_PROMPT = 1;
export const MAX_LOTE = 4;
export const intenciones = ["educativa", "informativa", "comercial", "entretenimiento", "inspiracional", "otra"] as const;
export const ganchos = ["pregunta", "afirmacion", "problema", "dato", "historia", "otro", "sin_evidencia"] as const;

export const clasificacionSchema = z.strictObject({
  temaPrincipal: z.string().min(1).max(80),
  temasSecundarios: z.array(z.string().min(1).max(60)).max(5),
  intencion: z.enum(intenciones),
  tono: z.string().min(1).max(60),
  gancho: z.enum(ganchos),
  explicacionGancho: z.string().min(1).max(280).nullable(),
  resumen: z.string().min(1).max(420),
  descripcionVisual: z.string().min(1).max(420).nullable(),
});
export type Clasificacion = z.infer<typeof clasificacionSchema>;
export type Proveedor = "mock" | "anthropic";
export type Modalidad = "texto" | "visual";
export type Uso = { inputTokens?: number; outputTokens?: number };

const seleccion = {
  ids: z.array(z.uuid()).min(1).max(MAX_LOTE).refine((ids) => new Set(ids).size === ids.length),
  modalidad: z.enum(["texto", "visual"]),
};
export const solicitudSchema = z.discriminatedUnion("accion", [
  z.strictObject({ ...seleccion, accion: z.literal("previsualizar") }),
  z.strictObject({ ...seleccion, accion: z.literal("ejecutar"), confirmada: z.literal(true), huella: z.string().regex(/^[a-f0-9]{64}$/) }),
]);

export type FilaPlan = { id: string; shortcode: string; estado: "lista" | "duplicada" | "ocupada" | "sin_imagen" };
export type VistaPrevia = {
  huella: string; proveedor: Proveedor; modelo: string; filas: FilaPlan[];
  procesables: number; costoUsd: number; presupuestoUsd: number; permitido: boolean;
};
export type Evento = { id: string; estado: "guardado" | "omitido" | "fallido"; mensaje?: string };
