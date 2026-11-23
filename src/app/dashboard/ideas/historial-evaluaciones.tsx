import type { crearRepositorioEvaluaciones } from "@/lib/ideas/evaluaciones";
import { motivosEvaluacion } from "@/lib/ideas/evaluacion-contrato";
import { estadosVisibles } from "./operacion";
import { fecha } from "./tarjeta";

type Historial = Awaited<ReturnType<ReturnType<typeof crearRepositorioEvaluaciones>["historial"]>>;

export function HistorialEvaluaciones({ historial }: { historial: Historial }) {
  const { mejores, descartadas, motivos, evolucion, revisiones } = historial;
  return <section aria-labelledby="historial-evaluaciones" className="space-y-4">
    <h2 id="historial-evaluaciones" className="text-xl font-semibold">Historial de evaluaciones</h2>
    {revisiones.length === 0 && <p className="text-muted-foreground">Aún no hay evaluaciones en esta cuenta.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2 rounded-md border p-3">
        <h3 className="font-medium">Ideas mejor evaluadas</h3>
        {mejores.length ? <ol className="list-decimal space-y-1 break-words pl-5 text-sm">
          {mejores.map(({ ideaId, titulo, calificacion }) => <li key={ideaId}>{titulo} · {calificacion}/5</li>)}
        </ol> : <p className="text-sm text-muted-foreground">Sin calificaciones todavía.</p>}
      </div>
      <div className="min-w-0 space-y-2 rounded-md border p-3">
        <h3 className="font-medium">Ideas descartadas recientes</h3>
        {descartadas.length ? <ul className="space-y-1 break-words text-sm">
          {descartadas.map(({ ideaId, titulo, calificacion, motivo, estadoEvaluado }) => <li key={ideaId}>{titulo}
            {calificacion !== null && ` · ${calificacion}/5`}{motivo && estadoEvaluado === "descartada" && ` · ${motivosEvaluacion[motivo]}`}
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">Sin ideas descartadas.</p>}
      </div>
      <div className="space-y-2 rounded-md border p-3">
        <h3 className="font-medium">Motivos registrados</h3>
        {motivos.length ? <ul className="space-y-1 text-sm">
          {motivos.map(({ motivo, estado, cantidad }) => motivo && <li key={`${estado}-${motivo}`}>
            {estadosVisibles[estado]} · {motivosEvaluacion[motivo]} · {cantidad}
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">Sin motivos de aprobación o descarte.</p>}
      </div>
      <div className="space-y-2 rounded-md border p-3">
        <h3 className="font-medium">Evolución mensual</h3>
        {evolucion.length ? <>
          <p className="text-sm text-muted-foreground">Promedio y número de evaluaciones, incluidas las revisiones.</p>
          <ul className="space-y-1 text-sm">{evolucion.map(({ mes, cantidad, promedio }) =>
            <li key={mes}>{mes} · {promedio}/5 · {cantidad} {cantidad === 1 ? "evaluación" : "evaluaciones"}</li>)}</ul>
        </> : <p className="text-sm text-muted-foreground">Sin historial mensual.</p>}
      </div>
    </div>
    {revisiones.length > 0 && <details className="space-y-2">
      <summary className="cursor-pointer font-medium">Últimas evaluaciones y revisiones</summary>
      <ul className="space-y-2">{revisiones.map((fila) => <li key={fila.id} className="break-words rounded-md border p-3 text-sm">
        <p>{fila.tituloIdea} · {fila.calificacion}/5 · {fecha(fila.evaluadaEn)} · Revisión {fila.version}</p>
        {fila.motivo && <p>{estadosVisibles[fila.estadoIdea]} · {motivosEvaluacion[fila.motivo]}</p>}
        {fila.comentario && <p className="whitespace-pre-line">{fila.comentario}</p>}
      </li>)}</ul>
    </details>}
  </section>;
}
