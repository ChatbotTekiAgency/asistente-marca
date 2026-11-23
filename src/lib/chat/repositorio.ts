import type { UIMessage } from "ai";
import { and, asc, count, desc, eq, exists, or, sql } from "drizzle-orm";
import { alias, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { conversaciones, cuotasChat, mensajes } from "../../db/schema.ts";
import { ErrorChat, MAX_MENSAJES, type Turno } from "./contrato.ts";

const tituloInicial = "Nueva conversación";
const mensajePublico = {
  id: mensajes.id,
  solicitudId: mensajes.solicitudId,
  rol: mensajes.rol,
  partes: mensajes.partes,
};
type MensajePublico = Pick<typeof mensajes.$inferSelect, keyof typeof mensajePublico>;

function paraInterfaz(fila: MensajePublico): UIMessage {
  return { id: fila.rol === "user" && fila.solicitudId ? fila.solicitudId : fila.id,
    role: fila.rol, parts: fila.partes };
}

export function crearRepositorioChat<T extends PgQueryResultHKT>(db: PgDatabase<T>) {
  function alcance(cuentaId: string, conversacionId: string) {
    return and(eq(conversaciones.id, conversacionId), eq(conversaciones.cuentaId, cuentaId));
  }

  return {
    async crear(cuentaId: string) {
      const [conversacion] = await db.insert(conversaciones)
        .values({ cuentaId, titulo: tituloInicial }).returning({ id: conversaciones.id });
      return conversacion.id;
    },

    listar(cuentaId: string) {
      return db.select({ id: conversaciones.id, titulo: conversaciones.titulo })
        .from(conversaciones).where(eq(conversaciones.cuentaId, cuentaId))
        .orderBy(desc(conversaciones.actualizadaEn), desc(conversaciones.id));
    },

    async historial(cuentaId: string, conversacionId: string) {
      const filas = await db.select(mensajePublico).from(mensajes)
        .innerJoin(conversaciones, eq(mensajes.conversacionId, conversaciones.id))
        .where(and(alcance(cuentaId, conversacionId), sql`${mensajes.rol} <> 'system'`))
        .orderBy(asc(mensajes.orden)).limit(MAX_MENSAJES);
      return filas.map(paraInterfaz);
    },

    reservar(cuentaId: string, turno: Turno, limite: number) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
        const filtro = alcance(cuentaId, turno.conversacionId);
        const [conversacion] = await tx.select({
          ocupada: sql<boolean>`${conversaciones.reservaHasta} > clock_timestamp()`,
        }).from(conversaciones).where(filtro).for("update");
        if (!conversacion) throw new ErrorChat(404, "Conversación no disponible.");

        const deConversacion = eq(mensajes.conversacionId, turno.conversacionId);
        const existentes = await tx.select(mensajePublico).from(mensajes).where(and(
          deConversacion, eq(mensajes.solicitudId, turno.solicitudId),
        ));
        const usuario = existentes.find((fila) => fila.rol === "user");
        if (usuario && !usuario.partes.some((parte) => parte.type === "text" && parte.text === turno.texto)) {
          throw new ErrorChat(409, "La solicitud ya está asociada a otro mensaje.");
        }
        const respuesta = existentes.find((fila) => fila.rol === "assistant");
        if (respuesta) return { tipo: "repetida", mensaje: paraInterfaz(respuesta) } as const;
        if (conversacion.ocupada) throw new ErrorChat(409, "Ya se está generando una respuesta en esta conversación.");

        if (usuario) {
          const [ultimo] = await tx.select({ id: mensajes.id }).from(mensajes)
            .where(and(deConversacion, eq(mensajes.rol, "user"))).orderBy(desc(mensajes.orden)).limit(1);
          if (ultimo?.id !== usuario.id) throw new ErrorChat(409, "Solo se puede reintentar el último mensaje.");
        }
        const [{ total }] = await tx.select({ total: count() }).from(mensajes).where(deConversacion);
        if (total + (usuario ? 1 : 2) > MAX_MENSAJES) {
          throw new ErrorChat(409, "Esta conversación alcanzó su límite. Abre una nueva conversación.");
        }

        const cuota = await tx.insert(cuotasChat).values({
          cuentaId, dia: sql`(clock_timestamp() AT TIME ZONE 'America/Bogota')::date`, solicitudes: 1,
        }).onConflictDoUpdate({
          target: [cuotasChat.cuentaId, cuotasChat.dia],
          set: { solicitudes: sql`${cuotasChat.solicitudes} + 1` },
          setWhere: sql`${cuotasChat.solicitudes} < ${limite}`,
        }).returning({ solicitudes: cuotasChat.solicitudes });
        if (!cuota.length) throw new ErrorChat(429, "Esta cuenta alcanzó su límite diario de solicitudes.");

        const intento = crypto.randomUUID();
        await tx.update(conversaciones).set({
          intentoActivo: intento,
          reservaHasta: sql`clock_timestamp() + interval '2 minutes'`,
          actualizadaEn: sql`clock_timestamp()`,
          ...(total === 0 ? { titulo: [...turno.texto.replace(/\s+/g, " ")].slice(0, 60).join("") } : {}),
        }).where(filtro);
        if (!usuario) {
          await tx.insert(mensajes).values({
            conversacionId: turno.conversacionId, solicitudId: turno.solicitudId,
            rol: "user", partes: [{ type: "text", text: turno.texto }],
          });
        }

        const respuestas = alias(mensajes, "respuestas_chat");
        const historial = await tx.select(mensajePublico).from(mensajes)
          .where(and(deConversacion, or(
            eq(mensajes.rol, "assistant"),
            and(eq(mensajes.rol, "user"), or(
              eq(mensajes.solicitudId, turno.solicitudId),
              exists(tx.select({ id: respuestas.id }).from(respuestas).where(and(
                eq(respuestas.conversacionId, mensajes.conversacionId),
                eq(respuestas.solicitudId, mensajes.solicitudId), eq(respuestas.rol, "assistant"),
              ))),
            )),
          ))).orderBy(desc(mensajes.orden)).limit(21);
        return { tipo: "nueva", intento, contexto: historial.reverse().map(paraInterfaz) } as const;
      });
    },

    completar(cuentaId: string, turno: Turno, intento: string, respuesta: {
      id: string; partes: UIMessage["parts"]; uso?: typeof mensajes.$inferInsert.uso;
    }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
        const liberada = await tx.update(conversaciones).set({
          intentoActivo: null, reservaHasta: null, actualizadaEn: sql`clock_timestamp()`,
        }).where(and(alcance(cuentaId, turno.conversacionId), eq(conversaciones.intentoActivo, intento)))
          .returning({ id: conversaciones.id });
        if (!liberada.length) throw new ErrorChat(409, "La reserva del mensaje ya no está activa.");
        await tx.insert(mensajes).values({
          id: respuesta.id, conversacionId: turno.conversacionId, solicitudId: turno.solicitudId,
          rol: "assistant", partes: respuesta.partes, uso: respuesta.uso,
        });
      });
    },

    async liberar(cuentaId: string, conversacionId: string, intento: string) {
      await db.update(conversaciones).set({ intentoActivo: null, reservaHasta: null })
        .where(and(alcance(cuentaId, conversacionId), eq(conversaciones.intentoActivo, intento)));
    },
  };
}
