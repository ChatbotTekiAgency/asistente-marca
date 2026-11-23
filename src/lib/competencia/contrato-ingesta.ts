import { z } from "zod";

export const MAX_KIB_JSON = 600;
export const MAX_BYTES_JSON = MAX_KIB_JSON * 1024;
export const MENSAJE_ARCHIVO_JSON = `Selecciona un archivo .json de hasta ${MAX_KIB_JSON} KiB.`;
export const MAX_FILAS_JSON = 250;
export const MAX_RESULTADOS_APIFY = 100;

export function leerDatasetCompetidor(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_BYTES_JSON) throw new Error(`El archivo supera ${MAX_KIB_JSON} KiB.`);
  let datos: unknown;
  try {
    datos = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("El archivo debe ser un JSON UTF-8 válido.");
  }
  const resultado = z.array(z.unknown()).max(MAX_FILAS_JSON).safeParse(datos);
  if (!resultado.success) throw new Error("El JSON debe contener un arreglo de hasta 250 registros.");
  return resultado.data;
}

export type ResultadoIngesta = {
  id: string; repetida: boolean; estado: "completada" | "parcial" | "fallida";
  procesadas: number; actualizadas: number; insertadas: number; rechazadas: number;
  detalle: { fila: number; motivo: string }[];
};
