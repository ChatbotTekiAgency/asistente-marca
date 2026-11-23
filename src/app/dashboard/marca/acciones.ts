"use server";

import { getCuentaActiva } from "@/lib/accounts/active-account";
import { repositorioMarca } from "@/lib/marca/servidor";
import { erroresDePerfil, type ResultadoGuardarPerfil } from "@/lib/marca/validacion";
import { ZodError } from "zod";

export async function guardarPerfilMarca(cuentaEsperada: string, entrada: unknown): Promise<ResultadoGuardarPerfil> {
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta || cuenta.id !== cuentaEsperada) return { estado: "cuenta" };
    const guardado = await repositorioMarca.guardar(cuenta.id, entrada);
    if (!guardado) return { estado: "conflicto" };
    return { estado: "guardado", revision: guardado.revision, actualizadaEn: guardado.actualizadaEn.toISOString() };
  } catch (error) {
    if (error instanceof ZodError) return { estado: "invalido", errores: erroresDePerfil(error) };
    return { estado: "error" };
  }
}
