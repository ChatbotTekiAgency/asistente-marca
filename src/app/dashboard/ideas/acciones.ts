"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { crearRepositorioIdeas } from "@/lib/ideas/repositorio";
import { configurarIdeas } from "@/lib/ideas/proveedor-ideas";
import { generarIdeasDeCuentaActiva } from "@/lib/ideas/servidor";
import { operarIdeas, type ResultadoIdeas } from "./operacion";
import { conBaseTransaccional } from "@/db/transacciones";
import { editarEvaluacion } from "@/lib/ideas/evaluacion-contrato";
import { crearRepositorioEvaluaciones } from "@/lib/ideas/evaluaciones";

export async function guardarEvaluacion(cuentaEsperada: string, entrada: unknown): Promise<ResultadoIdeas> {
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta || cuenta.id !== cuentaEsperada) return { ok: false, mensaje: "Verifica tu sesión y la cuenta activa." };
    const datos = editarEvaluacion.safeParse(entrada);
    if (!datos.success) return { ok: false, mensaje: "Revisa las calificaciones y el comentario." };
    const evaluacion = await conBaseTransaccional((tx) => crearRepositorioEvaluaciones(tx, cuenta.id).guardar(datos.data));
    if (evaluacion === "motivo_requerido") return { ok: false, mensaje: "Indica el motivo de aprobación o descarte." };
    if (!evaluacion) return { ok: false, mensaje: "La idea o su evaluación cambió. Recarga la página antes de guardar." };
    revalidatePath("/dashboard/ideas");
    return { ok: true, mensaje: "Evaluación guardada." };
  } catch {
    return { ok: false, mensaje: "No se pudo guardar la evaluación." };
  }
}

export async function gestionarIdeas(cuentaEsperada: string, entrada: unknown): Promise<ResultadoIdeas> {
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta || cuenta.id !== cuentaEsperada) return { ok: false, mensaje: "Verifica tu sesión y la cuenta activa." };
    const resultado = await operarIdeas(entrada, crearRepositorioIdeas(db, cuenta.id),
      () => configurarIdeas(process.env).motor.proveedor, (datos) => generarIdeasDeCuentaActiva(datos, cuenta.id));
    revalidatePath("/dashboard/ideas");
    return resultado;
  } catch {
    return { ok: false, mensaje: "No se pudo completar la operación. Revisa la conexión y la configuración de ideas." };
  }
}
