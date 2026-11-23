import "server-only";

import { db } from "@/db";
import { conBaseTransaccional } from "@/db/transacciones";
import { crearRepositorioChat } from "./repositorio";

export const leerChat = crearRepositorioChat(db);
type RepositorioChat = ReturnType<typeof crearRepositorioChat>;

export async function escribirChat<T>(operacion: (repositorio: RepositorioChat) => Promise<T>) {
  return conBaseTransaccional((db) => operacion(crearRepositorioChat(db)));
}
