import { type UIMessage } from "ai";

export type GenerarRespuesta = (
  contexto: UIMessage[], signal: AbortSignal, emitir: (texto: string) => void,
) => Promise<{ inputTokens?: number; outputTokens?: number } | undefined>;

export const responderMock: GenerarRespuesta = async (_contexto, signal, emitir) => {
  signal.throwIfAborted();
  emitir("**Respuesta de prueba.** El modo simulado recibió tu mensaje.");
  emitir(" En esta sesión puedes comprobar el historial del chat sin consultar datos de Instagram.");
  return undefined;
};
