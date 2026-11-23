import { z } from "zod";

export const motivosEvaluacion = {
  alineacion_marca: "Alineación con la marca",
  originalidad: "Originalidad",
  viabilidad: "Viabilidad de producción",
  claridad: "Claridad",
  potencial_interaccion: "Potencial de interacción",
  repeticion: "Repetición de una propuesta",
  otro: "Otro motivo",
};

export const categoriasEvaluacion = {
  originalidad: "Originalidad",
  relevancia: "Relevancia para la marca",
  viabilidad: "Viabilidad de producción",
  claridad: "Claridad",
  potencialInteraccion: "Potencial de interacción",
};

export const puntuacion = z.number().int().min(1).max(5);
export const motivoEvaluacion = z.enum(Object.keys(motivosEvaluacion) as [
  keyof typeof motivosEvaluacion, ...(keyof typeof motivosEvaluacion)[],
]);
export const editarEvaluacion = z.strictObject({
  ideaId: z.uuid(),
  revisionIdea: z.uuid(),
  anterior: z.uuid().nullable(),
  calificacion: puntuacion,
  comentario: z.string().trim().max(1000).refine((valor) => !valor.includes("\0")).optional(),
  motivo: motivoEvaluacion.optional(),
  categorias: z.strictObject({
    originalidad: puntuacion.optional(),
    relevancia: puntuacion.optional(),
    viabilidad: puntuacion.optional(),
    claridad: puntuacion.optional(),
    potencialInteraccion: puntuacion.optional(),
  }).default({}),
});
export type DatosEvaluacion = z.input<typeof editarEvaluacion>;
export type CategoriasEvaluacion = z.output<typeof editarEvaluacion>["categorias"];
