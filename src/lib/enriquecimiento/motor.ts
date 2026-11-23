import { createHash } from "node:crypto";
import type { ContextoMarca } from "../marca/contexto.ts";
import { clasificacionSchema, type Evento, type Modalidad, type Uso, type Clasificacion } from "./contrato.ts";

export type Entrada = {
  caption: string | null; tipo: string; hashtags: string[];
  marca: ContextoMarca | null; imagen: string | null;
};

export function prepararContenido(post: { caption: string | null; tipo: string; hashtags: string[] },
  marca: ContextoMarca | null, imagen: string | null): Entrada {
  return { caption: post.caption?.slice(0, 3000) ?? null, tipo: post.tipo,
    hashtags: post.hashtags.slice(0, 20).map((tag) => tag.slice(0, 80)), marca, imagen };
}

export function huella(valor: unknown) {
  return createHash("sha256").update(JSON.stringify(valor)).digest("hex");
}

export function identificarImagen(referencia: string | null, origen?: string) {
  if (!referencia || !origen) return null;
  try {
    const url = new URL(referencia, `${origen}/`);
    return url.origin === origen && !url.username && !url.password && !url.search && !url.hash
      && url.pathname !== "/" ? url.href : null;
  } catch { return null; }
}

export const clasificarMock: Clasificar = async () => ({
  resultado: {
    temaPrincipal: "Tema simulado", temasSecundarios: ["Prueba"], intencion: "otra", tono: "Simulado",
    gancho: "sin_evidencia", explicacionGancho: null, descripcionVisual: null,
    resumen: "Resultado de prueba. No representa una clasificación de la publicación.",
  },
});

export type Clasificar = (entrada: Entrada, signal: AbortSignal) => Promise<{ resultado: unknown; uso?: Uso }>;
export class ErrorClasificacion extends Error {
  readonly uso?: Uso;

  constructor(mensaje: string, uso?: Uso) {
    super(mensaje);
    this.uso = uso;
  }
}

export function reservaUsd(entrada: number, salida: number, tarifaEntrada: number, tarifaSalida: number) {
  return (entrada * tarifaEntrada + salida * tarifaSalida) / 1_000_000;
}

export async function ejecutarLote(
  plan: { id: string; entrada: Entrada }[], modalidad: Modalidad, clasificar: Clasificar,
  callbacks: {
    reclamar: (id: string) => Promise<string | null>;
    terminar: (id: string, intento: string, resultado: Clasificacion | null, uso?: Uso) => Promise<boolean>;
    emitir: (evento: Evento) => void;
  }, signal: AbortSignal,
) {
  for (const { id, entrada } of plan) {
    if (signal.aborted) break;
    let intento: string | null = null;
    let uso: Uso | undefined;
    try {
      intento = await callbacks.reclamar(id);
      if (!intento) {
        callbacks.emitir({ id, estado: "omitido", mensaje: "Ya se analizó o está en curso." });
        continue;
      }
      const salida = await clasificar(entrada, signal);
      uso = salida.uso;
      const resultado = clasificacionSchema.parse(salida.resultado);
      if (modalidad !== "visual" || !entrada.imagen) resultado.descripcionVisual = null;
      if (resultado.gancho === "sin_evidencia") resultado.explicacionGancho = null;
      if (!await callbacks.terminar(id, intento, resultado, uso)) throw new Error("Reserva vencida");
      callbacks.emitir({ id, estado: "guardado" });
    } catch (error) {
      if (intento) await callbacks.terminar(id, intento, null, uso ?? (error instanceof ErrorClasificacion ? error.uso : undefined))
        .catch(() => undefined);
      callbacks.emitir({ id, estado: "fallido", mensaje: error instanceof ErrorClasificacion
        ? error.message : "No se pudo completar el análisis. Puedes reintentarlo." });
    }
  }
}
