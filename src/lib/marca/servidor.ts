import "server-only";

import { db } from "@/db";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { construirContextoMarca } from "./contexto";
import { crearRepositorioMarca } from "./repositorio";

export const repositorioMarca = crearRepositorioMarca(db);

export async function obtenerContextoMarca(cuentaId: string) {
  const activa = await getCuentaActiva();
  if (!activa || activa.id !== cuentaId) return null;
  const perfil = await repositorioMarca.obtener(activa.id);
  return perfil ? construirContextoMarca(perfil.datos) : null;
}

export { contextoMarcaParaPrompt } from "./contexto";
