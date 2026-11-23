import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { ErrorChat, MAX_GENERACION_MS, type Turno } from "./contrato.ts";
import type { GenerarRespuesta } from "./proveedor.ts";
import type { crearRepositorioChat } from "./repositorio.ts";

type Repositorio = ReturnType<typeof crearRepositorioChat>;

export function transmitirTurno({
  cuentaId, turno, reserva, generar, signal, completar, liberar,
}: {
  cuentaId: string;
  turno: Turno;
  reserva: Awaited<ReturnType<Repositorio["reservar"]>>;
  generar: GenerarRespuesta;
  signal: AbortSignal;
  completar: Repositorio["completar"];
  liberar: Repositorio["liberar"];
}) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      onError: (error) => error instanceof ErrorChat
        ? error.message : "No se pudo completar la respuesta. Puedes reintentar el mensaje.",
      async execute({ writer }) {
        const id = reserva.tipo === "repetida" ? reserva.mensaje.id : crypto.randomUUID();
        writer.write({ type: "start", messageId: id });
        writer.write({ type: "text-start", id });
        const emitir = (texto: string) => writer.write({ type: "text-delta", id, delta: texto });
        if (reserva.tipo === "repetida") {
          for (const parte of reserva.mensaje.parts) {
            if (parte.type === "text") emitir(parte.text);
          }
        } else {
          const plazo = AbortSignal.timeout(MAX_GENERACION_MS);
          try {
            let texto = "";
            const timeout = AbortSignal.any([signal, plazo]);
            timeout.throwIfAborted();
            const uso = await generar(reserva.contexto, timeout, (fragmento) => {
              texto += fragmento;
              emitir(fragmento);
            });
            timeout.throwIfAborted();
            if (!texto.trim()) throw new Error("Respuesta vacía.");
            await completar(cuentaId, turno, reserva.intento, {
              id, partes: [{ type: "text", text: texto, state: "done" }], uso,
            });
          } catch (error) {
            await liberar(cuentaId, turno.conversacionId, reserva.intento).catch(() => undefined);
            if (plazo.aborted && !signal.aborted && error === plazo.reason) {
              throw new ErrorChat(504, "La consulta superó el tiempo disponible. Reintenta con un intervalo más corto o menos competidores.");
            }
            throw error;
          }
        }
        writer.write({ type: "text-end", id });
        writer.write({ type: "finish" });
      },
    }),
  });
}
