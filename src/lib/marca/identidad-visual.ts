import { z } from "zod";

const texto = (maximo: number) => z.string().trim().max(maximo, `Máximo ${maximo} caracteres.`)
  .refine((valor) => !valor.includes("\0"), "Quita los caracteres no válidos.");

export const camposVisuales = {
  logotipo: {
    descripcion: "Descripción del logotipo", variantes: "Variantes permitidas",
    reglas: "Reglas de uso", restricciones: "Restricciones de uso",
  },
  estilo: {
    general: "Estilo visual general", composicion: "Composición y diagramación",
    formas: "Formas y elementos gráficos", fotografia: "Estilo fotográfico",
    ilustracion: "Estilo de ilustración", tratamiento: "Tratamiento de imágenes",
    referencias: "Referencias visuales", evitar: "Elementos que deben evitarse",
  },
  lineamientos: {
    consistencia: "Principios de consistencia visual", redes: "Reglas para redes sociales",
    restricciones: "Restricciones de identidad visual",
  },
} as const;

export const funcionesColor = { primario: "Primario", secundario: "Secundario", acento: "Acento", fondo: "Fondo", texto: "Texto" } as const;
export const usosTipografia = { titulos: "Títulos", subtitulos: "Subtítulos", cuerpo: "Cuerpo", otros: "Otros" } as const;
export const limitesVisuales = { campo: 800, nombre: 100, aplicacion: 400, colores: 16, tipografias: 8 };
export const hexColor = /^#[0-9a-f]{6}$/i;

function grupo<T extends Record<string, string>>(campos: T) {
  const shape = Object.fromEntries(Object.keys(campos).map((campo) =>
    [campo, texto(limitesVisuales.campo).optional()])) as Record<keyof T, z.ZodOptional<z.ZodString>>;
  return z.strictObject(shape);
}

export const identidadVisualSchema = z.strictObject({
  logotipo: grupo(camposVisuales.logotipo).default({}),
  estilo: grupo(camposVisuales.estilo).default({}),
  lineamientos: grupo(camposVisuales.lineamientos).default({}),
  paleta: z.array(z.strictObject({
    nombre: texto(limitesVisuales.nombre).default(""),
    hex: z.string().trim().regex(hexColor, "Usa un código HEX de seis dígitos, como #1A2B3C.")
      .transform((valor) => valor.toUpperCase()),
    funcion: z.enum(Object.keys(funcionesColor) as (keyof typeof funcionesColor)[]),
    descripcion: texto(limitesVisuales.aplicacion).default(""),
  })).max(limitesVisuales.colores).default([]),
  tipografias: z.array(z.strictObject({
    nombre: texto(limitesVisuales.nombre).min(1, "Escribe el nombre de la tipografía."),
    uso: z.enum(Object.keys(usosTipografia) as (keyof typeof usosTipografia)[]),
    descripcion: texto(limitesVisuales.aplicacion).default(""),
  })).max(limitesVisuales.tipografias).default([]),
});

export type IdentidadVisual = z.output<typeof identidadVisualSchema>;

export function moverColor<T>(lista: T[], indice: number, paso: -1 | 1) {
  const destino = indice + paso;
  if (indice < 0 || indice >= lista.length || destino < 0 || destino >= lista.length) return lista;
  const orden = lista.slice();
  [orden[indice], orden[destino]] = [orden[destino], orden[indice]];
  return orden;
}
