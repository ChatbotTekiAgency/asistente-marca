"use server";

import { revalidatePath } from "next/cache";
import { tendenciasDeCuentaActiva } from "@/lib/tendencias/servidor";
import { mensajeLecturaTendencias, operarTendencias, type ResultadoOperacion } from "./operacion";

export async function gestionarTendencias(cuentaEsperada: string, entrada: unknown): Promise<ResultadoOperacion> {
  try {
    const resultado = await operarTendencias(entrada, () => tendenciasDeCuentaActiva(undefined, cuentaEsperada));
    if (resultado.tipo === "investigacion") revalidatePath("/dashboard/tendencias");
    return resultado;
  } catch (error) {
    return { tipo: "error", mensaje: mensajeLecturaTendencias(error) };
  }
}
