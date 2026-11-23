import { env } from "@/env";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { ErrorChat, leerTurno } from "@/lib/chat/contrato";
import { responderClaude } from "@/lib/chat/claude";
import { escribirChat } from "@/lib/chat/neon";
import { responderMock } from "@/lib/chat/proveedor";
import { transmitirTurno } from "@/lib/chat/respuesta";

export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta) throw new ErrorChat(401, "Inicia sesión y selecciona una cuenta activa.");
    const turno = await leerTurno(request);
    const reserva = await escribirChat((repo) => repo.reservar(cuenta.id, turno, env.AI_DAILY_REQUEST_LIMIT));
    return transmitirTurno({
      cuentaId: cuenta.id,
      turno,
      reserva,
      generar: env.AI_PROVIDER === "anthropic" ? responderClaude(cuenta) : responderMock,
      signal: request.signal,
      completar: (...args) => escribirChat((repo) => repo.completar(...args)),
      liberar: (...args) => escribirChat((repo) => repo.liberar(...args)),
    });
  } catch (error) {
    const status = error instanceof ErrorChat ? error.status : 500;
    return Response.json({
      error: error instanceof ErrorChat ? error.message : "No se pudo iniciar el chat. Intenta de nuevo.",
    }, { status });
  }
}
