import { z } from "zod";

export const CANTIDAD_TENDENCIAS = 4;
export const formatosTendencia = ["reel", "carrusel", "imagen", "historia", "otro"] as const;
export const nivelesRelevancia = ["alto", "medio", "bajo"] as const;

const texto = (maximo: number) => z.string().trim().min(1).max(maximo).refine((valor) => !valor.includes("\0"));
const urlFuente = z.url({ protocol: /^https$/ }).max(2048).transform((valor) => new URL(valor))
  .refine((url) => !url.username && !url.password)
  .transform((url) => url.href).pipe(z.string().max(2048));

export const fuenteTendencia = z.strictObject({
  titulo: texto(200), url: urlFuente,
  sitio: texto(120).optional(),
  publicadaEl: z.iso.date().refine((valor) => !valor.startsWith("0000")).optional(),
});

const propuesta = {
  titulo: texto(150),
  descripcion: texto(700),
  relevanciaMarca: texto(600),
  ejemploAplicacion: texto(700),
  formato: z.enum(formatosTendencia),
  publicoObjetivo: texto(300),
  relevancia: z.enum(nivelesRelevancia),
};
export const propuestasConReferencias = z.strictObject({
  propuestas: z.array(z.strictObject({
    ...propuesta, referencias: z.array(z.number().int().min(1).max(40)).min(1).max(5),
  })).length(CANTIDAD_TENDENCIAS),
});
const unicaPor = <T>(valores: T[], clave: (valor: T) => string) => new Set(valores.map(clave)).size === valores.length;

export const respuestaTendencias = z.strictObject({
  tendencias: z.array(z.strictObject({
    ...propuesta, id: z.uuid(), investigadaEn: z.iso.datetime(),
    fuentes: z.array(fuenteTendencia).min(1).max(5).refine((fuentes) => unicaPor(fuentes, ({ url }) => url)),
  })).length(CANTIDAD_TENDENCIAS).refine((tendencias) =>
    unicaPor(tendencias, ({ id }) => id) && unicaPor(tendencias, ({ titulo }) => titulo.toLowerCase())),
});

export const usoTendencias = z.strictObject({
  tokensEntrada: z.number().int().min(0).max(2_147_483_647).optional(),
  tokensSalida: z.number().int().min(0).max(2_147_483_647).optional(),
  costoEstimadoUsd: z.number().min(0).max(999_999).optional(),
  busquedasWeb: z.number().int().min(0).max(2_147_483_647).optional(),
});

export const salidaProveedorTendencias = z.strictObject({
  propuestas: z.array(z.strictObject({
    ...propuesta, urlsFuentes: z.array(urlFuente).min(1).max(5).refine((urls) => unicaPor(urls, (url) => url)),
  })).length(CANTIDAD_TENDENCIAS).refine((filas) => unicaPor(filas, ({ titulo }) => titulo.toLowerCase())),
  evidencias: z.array(fuenteTendencia).min(1).max(40).refine((fuentes) => unicaPor(fuentes, ({ url }) => url)),
  uso: usoTendencias.optional(),
});

export const proveedorTendencias = z.strictObject({ proveedor: z.enum(["mock", "anthropic"]), modelo: texto(120) });
export const claveInvestigacion = z.uuid();
export const limiteHistorial = z.number().int().min(1).max(20);
const criterios = {
  tema: texto(160).optional(),
  mercado: texto(100).optional(),
};
export const criteriosTendencias = z.strictObject(criterios);
export const confirmacionTendencias = z.strictObject({
  ...criterios, clave: claveInvestigacion, confirmada: z.literal(true), huella: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RespuestaTendencias = z.infer<typeof respuestaTendencias>;
export type UsoTendencias = z.infer<typeof usoTendencias>;
export type IdentidadProveedorTendencias = z.infer<typeof proveedorTendencias>;

export class ErrorMotorTendencias extends Error {
  readonly codigo: "presupuesto" | "cuota" | "acceso" | "busqueda" | "sin_evidencia" | "respuesta_invalida" | "tiempo" | "proveedor";

  readonly uso?: UsoTendencias;
  readonly fase?: "busqueda" | "estructuracion";
  readonly detalle?: Record<string, string | number | boolean | string[] | undefined>;

  constructor(codigo: ErrorMotorTendencias["codigo"], uso?: UsoTendencias, fase?: ErrorMotorTendencias["fase"],
    detalle?: ErrorMotorTendencias["detalle"]) {
    super(codigo);
    this.codigo = codigo;
    this.uso = uso;
    this.fase = fase;
    this.detalle = detalle;
  }
}
