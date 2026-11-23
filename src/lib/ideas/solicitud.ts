import { z } from "zod";
import { formatosIdea, ideaContenido } from "./contrato.ts";
import { intervaloIdeas } from "./contexto-contrato.ts";

const breve = (max: number) => z.string().trim().min(1).max(max).refine((texto) => !texto.includes("\0"));
export const solicitarIdeas = z.strictObject({
  clave: z.uuid(), cantidad: z.number().int().min(1).max(5).default(3),
  tema: breve(160).optional(), objetivo: breve(500).default("Educar y aportar valor a la audiencia"),
  publico: breve(300).optional(), formato: z.enum(formatosIdea).optional(), pilar: breve(160).optional(),
  intervalo: intervaloIdeas.optional(),
});
export type SolicitudIdeas = z.output<typeof solicitarIdeas>;

export const salidaIdeas = z.strictObject({
  ideas: z.array(ideaContenido.omit({ evidencias: true }).extend({
    referencias: z.array(z.strictObject({
      codigo: z.string().regex(/^E[1-9]\d{0,2}$/), relevancia: breve(500),
    })).max(8),
  })).min(1).max(5),
});
export type SalidaIdeas = z.output<typeof salidaIdeas>;
