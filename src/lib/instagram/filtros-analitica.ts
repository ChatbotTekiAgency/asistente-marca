import { z } from "zod";

export const formatosInstagram = ["carrusel", "video", "imagen"] as const;
export type FormatoInstagram = typeof formatosInstagram[number];

const fecha = z.preprocess((valor) => valor === "" ? undefined : valor,
  z.iso.date().refine((valor) => !valor.startsWith("0000")).optional());

export const filtrosAnalitica = z.object({
  formato: z.preprocess((valor) => valor === "" ? undefined : valor, z.enum(formatosInstagram).optional()),
  desde: fecha,
  hasta: fecha,
  orden: z.enum(["fecha", "interacciones"]).default("fecha"),
  pagina: z.string().regex(/^[1-9]\d{0,5}$/).transform(Number).default(1),
}).refine(({ desde, hasta }) => !desde || !hasta || desde <= hasta, {
  path: ["hasta"], message: "La fecha final debe ser igual o posterior a la inicial.",
});

export type FiltrosAnalitica = z.infer<typeof filtrosAnalitica>;
