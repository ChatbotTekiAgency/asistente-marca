import { z } from "zod";

export const MAX_TEXTO = 2000;
export const MAX_MENSAJES = 100;
export const MAX_SALIDA = 2000;
export const MAX_GENERACION_MS = 65_000;
export const MAX_TURNO_BYTES = 16 * 1024;

export const turnoSchema = z.strictObject({
  conversacionId: z.uuid(),
  solicitudId: z.uuid(),
  texto: z.string().trim().min(1).max(MAX_TEXTO).refine((texto) => !texto.includes("\0")),
});

export type Turno = z.infer<typeof turnoSchema>;

export class ErrorChat extends Error {
  readonly status: number;

  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

export async function leerTurno(request: Request) {
  const tipo = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (tipo !== "application/json" || !request.body) throw new ErrorChat(400, "Se esperaba un mensaje JSON.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_TURNO_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ErrorChat(413, "El mensaje supera el tamaño permitido.");
      }
      raw += decoder.decode(value, { stream: true });
    }
    const resultado = turnoSchema.safeParse(JSON.parse(raw + decoder.decode()));
    if (resultado.success) return resultado.data;
  } catch (error) {
    if (error instanceof ErrorChat) throw error;
  } finally {
    reader.releaseLock();
  }
  throw new ErrorChat(400, "El mensaje no es válido.");
}
