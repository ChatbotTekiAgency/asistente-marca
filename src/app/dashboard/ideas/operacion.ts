import { z } from "zod";
import { cambioEstadoIdea, editarIdea } from "../../../lib/ideas/contrato.ts";
import { solicitarIdeas } from "../../../lib/ideas/solicitud.ts";
import type { crearRepositorioIdeas } from "../../../lib/ideas/repositorio.ts";

const operacion = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("generar"), modo: z.enum(["mock", "anthropic"]), confirmada: z.boolean(), datos: solicitarIdeas }),
  z.strictObject({ tipo: z.literal("editar"), datos: editarIdea }),
  z.strictObject({ tipo: z.literal("estado"), datos: cambioEstadoIdea }),
]);

export type OperacionIdeas = z.input<typeof operacion>;
export type ResultadoIdeas = { ok: boolean; mensaje: string; generacionId?: string; costo?: number };
type Banco = Pick<ReturnType<typeof crearRepositorioIdeas>, "editar" | "cambiarEstado">;
type Generacion = Awaited<ReturnType<typeof import("../../../lib/ideas/servidor").generarIdeasDeCuentaActiva>>;

export const estadosVisibles = { nueva: "Nueva", en_revision: "En revisión", aprobada: "Aprobada", descartada: "Descartada" };
export const erroresVisibles = {
  respuesta_invalida: "La respuesta fue incompleta o contenía evidencias inválidas.",
  tiempo: "La generación superó el tiempo disponible.",
  presupuesto: "La solicitud supera el presupuesto configurado para ideas.",
  limite_entrada: "El contexto supera el límite de tokens de entrada.",
  limite_salida: "La respuesta alcanzó el límite de salida. Reduce la cantidad de ideas o revisa el límite de tokens.",
  proveedor: "El proveedor no pudo generar ideas.",
};
export const camposIdea = [
  ["titulo", "Título", 160], ["concepto", "Concepto", 1000], ["objetivo", "Objetivo", 500],
  ["publico", "Público", 300], ["pilar", "Pilar", 160], ["gancho", "Gancho", 500],
  ["desarrollo", "Desarrollo", 2400], ["cta", "CTA", 500], ["justificacion", "Justificación", 1200],
] as const;

export async function operarIdeas(entrada: unknown, banco: Banco, configurar: () => "mock" | "anthropic",
  generar: (entrada: unknown) => Promise<Generacion>): Promise<ResultadoIdeas> {
  const validada = operacion.safeParse(entrada);
  if (!validada.success) return { ok: false, mensaje: "Revisa los campos y los límites del formulario." };
  const { data } = validada;
  if (data.tipo !== "generar") {
    const fila = data.tipo === "editar" ? await banco.editar(data.datos) : await banco.cambiarEstado(data.datos);
    return fila ? { ok: true, mensaje: "Idea guardada." }
      : { ok: false, mensaje: "La idea cambió o no pertenece a la cuenta activa. Recarga antes de intentarlo." };
  }
  const modo = configurar();
  if (modo !== data.modo || (modo === "anthropic" && !data.confirmada)) {
    return { ok: false, mensaje: "Confirma la generación con el proveedor actual antes de continuar." };
  }
  const resultado = await generar(data.datos);
  if ("generacion" in resultado && resultado.generacion) {
    const { id, estado, cantidad, error, costoEstimadoUsd } = resultado.generacion;
    if (estado === "completada") return { ok: true, mensaje: `Se guardaron ${cantidad} ${cantidad === 1 ? "idea" : "ideas"} en el banco.`,
      generacionId: id, costo: costoEstimadoUsd ?? undefined };
    const mensaje = erroresVisibles[error ?? "proveedor"];
    return { ok: false, mensaje, costo: costoEstimadoUsd ?? undefined };
  }
  if (resultado.estado === "limite_cantidad") return { ok: false, mensaje: `El máximo configurado por solicitud es ${resultado.maxPorSolicitud}.` };
  const errores: Record<string, string> = {
    cuota: "Se agotó la cuota diaria de ideas de esta cuenta.",
    en_curso: "Esta solicitud ya está en curso. Revisa el historial.",
    vencida: "La solicitud venció. Inicia una nueva generación si quieres intentarlo otra vez.",
    conflicto: "La clave de la solicitud corresponde a otros parámetros.",
    sin_cuenta: "Selecciona de nuevo la cuenta activa.",
  };
  return { ok: false, mensaje: errores[resultado.estado] ?? "No se pudo recuperar la generación." };
}
