import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { competidores, cuentas, ingestasCompetidor } from "../../db/schema.ts";
import { MAX_COMPETIDORES, type EstadoCompetidor, type MutacionCompetidor } from "./contrato.ts";

export function crearRepositorioCompetencia<T extends PgQueryResultHKT>(db: PgDatabase<T>, cuentaId: string) {
  const cuenta = eq(competidores.cuentaId, cuentaId);
  return {
    listar() {
      return db.select({
        id: competidores.id, username: competidores.username, url: competidores.url, nombre: competidores.nombre,
        descripcion: competidores.descripcion, activo: competidores.activo, revision: competidores.revision,
      }).from(competidores).where(cuenta).orderBy(desc(competidores.activo), desc(competidores.actualizadoEn), competidores.id);
    },
    guardar(m: MutacionCompetidor, limite: number): Promise<EstadoCompetidor> {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        // Todas las mutaciones de una cuenta toman el mismo bloqueo antes de leer los cupos.
        const [propia] = await tx.select({ username: cuentas.username }).from(cuentas)
          .where(eq(cuentas.id, cuentaId)).for("update");
        if (!propia) return "sin_cuenta";
        const filtro = m.accion === "crear" ? undefined
          : and(cuenta, eq(competidores.id, m.id), eq(competidores.revision, m.revision));
        const [previo] = filtro
          ? await tx.select({ id: competidores.id, cupo: competidores.cupo, username: competidores.username })
            .from(competidores).where(filtro).for("update") : [];
        if (m.accion !== "crear" && !previo) return "conflicto";
        const actualizacion = { revision: sql`gen_random_uuid()`, actualizadoEn: sql`clock_timestamp()` };
        if (m.accion === "desactivar") {
          await tx.update(competidores).set({ activo: false, cupo: null, ...actualizacion }).where(filtro);
          return "guardado";
        }

        const { perfil: username, nombre, descripcion, activo } = m.datos;
        if (username === propia.username.trim().replace(/^@/, "").toLowerCase()) return "propia";
        if (previo && previo.username !== username) {
          const [ingesta] = await tx.select({ id: ingestasCompetidor.id }).from(ingestasCompetidor)
            .where(eq(ingestasCompetidor.competidorId, previo.id)).limit(1);
          if (ingesta) return "username_fijo";
        }
        const [duplicado] = await tx.select({ id: competidores.id }).from(competidores)
          .where(and(cuenta, eq(competidores.username, username)));
        if (duplicado && duplicado.id !== previo?.id) return "duplicado";

        let cupo = activo ? previo?.cupo ?? null : null;
        if (activo && cupo === null) {
          const ocupados = await tx.select({ cupo: competidores.cupo }).from(competidores)
            .where(and(cuenta, eq(competidores.activo, true)));
          if (ocupados.length >= limite) return "limite";
          const disponibles = Array.from({ length: MAX_COMPETIDORES }, (_, i) => i + 1);
          cupo = disponibles.find((slot) => !ocupados.some((fila) => fila.cupo === slot)) ?? null;
          if (cupo === null) return "limite";
        }

        const datos = { username, nombre, descripcion, activo, cupo };
        if (m.accion === "crear") await tx.insert(competidores).values({ ...datos, cuentaId });
        else await tx.update(competidores).set({ ...datos, ...actualizacion }).where(filtro);
        return "guardado";
      });
    },
  };
}
