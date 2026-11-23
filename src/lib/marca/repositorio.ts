import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { perfilesMarca } from "../../db/schema.ts";
import { camposMarca, guardarPerfilSchema, perfilMarcaSchema } from "./validacion.ts";

const revisionGuardada = { revision: perfilesMarca.revision, actualizadaEn: perfilesMarca.actualizadaEn };

export function crearRepositorioMarca<T extends PgQueryResultHKT>(db: PgDatabase<T>) {
  return {
    async obtener(cuentaId: string) {
      const [fila] = await db.select().from(perfilesMarca).where(eq(perfilesMarca.cuentaId, cuentaId));
      if (!fila) return null;
      const datos = Object.fromEntries(camposMarca.map((campo) => [campo, fila[campo]]));
      return {
        id: fila.id, revision: fila.revision, actualizadaEn: fila.actualizadaEn, creadaEn: fila.creadaEn,
        datos: perfilMarcaSchema.parse({ ...datos, pilares: fila.pilares, identidadVisual: fila.identidadVisual }),
      };
    },

    async guardar(cuentaId: string, entrada: unknown) {
      const { revision, datos } = guardarPerfilSchema.parse(entrada);
      const cuenta = eq(perfilesMarca.cuentaId, cuentaId);
      // Un único INSERT o UPDATE para todo el perfil, incluidos sus pilares.
      const [guardado] = revision === null
        ? await db.insert(perfilesMarca).values({ ...datos, cuentaId })
          .onConflictDoNothing({ target: perfilesMarca.cuentaId }).returning(revisionGuardada)
        : await db.update(perfilesMarca)
          .set({ ...datos, revision: sql`gen_random_uuid()`, actualizadaEn: sql`clock_timestamp()` })
          .where(and(cuenta, eq(perfilesMarca.revision, revision))).returning(revisionGuardada);
      return guardado ?? null;
    },
  };
}
