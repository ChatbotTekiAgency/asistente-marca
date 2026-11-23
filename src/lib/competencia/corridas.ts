import type { crearIngestasCompetidor } from "./ingestas.ts";
import type { ResultadoIngesta } from "./contrato-ingesta.ts";

type Repo = Pick<ReturnType<typeof crearIngestasCompetidor>, "reservar" | "corrida" | "confirmarInicio" | "anotar" | "importar">;
type Run = { id: string; status: string; defaultDatasetId: string };
export type ClienteCorridas = {
  iniciar: (username: string, limite: number, maxUsd: number) => Promise<{ id: string }>;
  consultar: (runId: string) => Promise<Run | undefined>;
  cancelar: (runId: string) => Promise<Run>;
  dataset: (datasetId: string, limite: number) => Promise<unknown[]>;
};
export type RespuestaIngesta = { ok: boolean; mensaje: string; resultado?: ResultadoIngesta };

export async function iniciarCorrida(repo: Repo, cliente: ClienteCorridas, limite: number, maxUsd: number): Promise<RespuestaIngesta> {
  const reserva = await repo.reservar(limite);
  if (!reserva) return { ok: false, mensaje: "El competidor no está activo o ya tiene una corrida pendiente." };
  try {
    const { id } = await cliente.iniciar(reserva.username, limite, maxUsd);
    if (!await repo.confirmarInicio(reserva.id, id)) throw new Error("No se guardó el inicio.");
    return { ok: true, mensaje: "Corrida iniciada. Usa Consultar estado para importar cuando termine." };
  } catch {
    const mensaje = "No se pudo confirmar el inicio. La reserva sigue activa para evitar otro cargo. Revisa el historial de Apify.";
    await repo.anotar(reserva.id, mensaje);
    return { ok: false, mensaje };
  }
}

export async function gestionarCorrida(repo: Repo, cliente: ClienteCorridas, id: string, cancelar: boolean): Promise<RespuestaIngesta> {
  const corrida = await repo.corrida(id);
  if (!corrida) return { ok: false, mensaje: "La corrida ya terminó o no está disponible para esta cuenta." };
  if (!corrida.apifyRunId || !corrida.limite) {
    const vencida = corrida.reservaHasta && corrida.reservaHasta.getTime() <= Date.now();
    const mensaje = vencida
      ? "Venció el plazo para confirmar el inicio. La corrida queda reservada hasta reconciliarla en Apify."
      : "El inicio aún no está confirmado. Revisa el historial de Apify.";
    if (vencida) await repo.anotar(id, mensaje);
    return { ok: false, mensaje };
  }
  try {
    const remota = cancelar ? await cliente.cancelar(corrida.apifyRunId) : await cliente.consultar(corrida.apifyRunId);
    if (remota?.status === "SUCCEEDED") {
      if (cancelar) return { ok: true, mensaje: "La corrida ya terminó. Usa Consultar estado para importar sus resultados." };
      const dataset = await cliente.dataset(remota.defaultDatasetId, corrida.limite);
      const resultado = await repo.importar(dataset, id);
      if (!resultado) return { ok: false, mensaje: "La corrida ya fue procesada o quedó fuera de alcance." };
      return { ok: resultado.estado !== "fallida", mensaje: "Consulta completada.", resultado };
    }
    if (remota?.status === "ABORTED" || remota?.status === "FAILED" || remota?.status === "TIMED-OUT") {
      const estado = remota.status === "ABORTED" ? "cancelada" : remota.status === "TIMED-OUT" ? "expirada" : "fallida";
      const mensaje = estado === "cancelada" ? "Apify confirmó la cancelación."
        : estado === "expirada" ? "El actor agotó el tiempo permitido." : "Apify informó que la corrida falló.";
      await repo.anotar(id, mensaje, estado);
      return { ok: estado === "cancelada", mensaje };
    }
    const mensaje = cancelar ? "Cancelación solicitada. Consulta de nuevo para confirmar el estado final."
      : remota ? "La corrida sigue en curso. Consulta el estado de nuevo más tarde." : "Apify aún no devolvió el estado de esta corrida.";
    if (cancelar || !remota) await repo.anotar(id, mensaje);
    return { ok: !!remota, mensaje };
  } catch {
    const mensaje = "No se pudo consultar Apify o guardar sus resultados. Puedes volver a consultar el estado.";
    await repo.anotar(id, mensaje);
    return { ok: false, mensaje };
  }
}
