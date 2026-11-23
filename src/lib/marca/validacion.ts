import { z } from "zod";
import { identidadVisualSchema } from "./identidad-visual.ts";

export const limitesMarca = {
  nombre: 120,
  sector: 120,
  descripcion: 1200,
  productosServicios: 1200,
  propuestaValor: 800,
  publicoObjetivo: 800,
  necesidades: 800,
  intereses: 800,
  problemas: 800,
  personalidad: 600,
  tono: 600,
  valores: 600,
  expresionesPreferidas: 600,
  expresionesEvitar: 600,
  objetivos: 1000,
  diferenciadores: 1000,
} as const;

export const camposMarca = Object.keys(limitesMarca) as (keyof typeof limitesMarca)[];
export type CampoMarca = typeof camposMarca[number];

export const limitesPilar = { cantidad: 8, nombre: 100, descripcion: 600, objetivo: 600, temas: 6, tema: 160 };

function texto(maximo: number) {
  return z.string().trim().max(maximo, `Máximo ${maximo} caracteres.`)
    .refine((valor) => !valor.includes("\0"), "Quita los caracteres no válidos.");
}

const camposSchema = Object.fromEntries(camposMarca.map((campo) => [
  campo, texto(limitesMarca[campo]).default(""),
])) as Record<CampoMarca, z.ZodDefault<z.ZodString>>;

export const pilarSchema = z.strictObject({
  nombre: texto(limitesPilar.nombre).min(1, "Escribe un nombre para el pilar."),
  descripcion: texto(limitesPilar.descripcion).default(""),
  objetivo: texto(limitesPilar.objetivo).default(""),
  temas: z.array(texto(limitesPilar.tema).min(1))
    .max(limitesPilar.temas, `Máximo ${limitesPilar.temas} temas por pilar.`).default([]),
});

export const perfilMarcaSchema = z.strictObject({
  ...camposSchema,
  identidadVisual: identidadVisualSchema.prefault({}),
  pilares: z.array(pilarSchema).max(limitesPilar.cantidad, `Máximo ${limitesPilar.cantidad} pilares.`).default([]),
});

export const guardarPerfilSchema = z.strictObject({
  revision: z.uuid().nullable(),
  datos: perfilMarcaSchema.extend({ identidadVisual: identidadVisualSchema.optional() }),
});

export type DatosPerfilMarca = z.output<typeof perfilMarcaSchema>;
export type PilarMarca = z.output<typeof pilarSchema>;

export type ResultadoGuardarPerfil =
  | { estado: "guardado"; revision: string; actualizadaEn: string }
  | { estado: "invalido"; errores: Record<string, string> }
  | { estado: "conflicto" | "cuenta" | "error" };

export function erroresDePerfil(error: z.ZodError) {
  const errores: Record<string, string> = {};
  for (const issue of error.issues) {
    const ruta = issue.path.join(".");
    if (!Object.hasOwn(errores, ruta)) errores[ruta] = issue.message;
  }
  return errores;
}
