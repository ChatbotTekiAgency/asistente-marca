"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { categoriasEvaluacion, editarEvaluacion, motivosEvaluacion } from "@/lib/ideas/evaluacion-contrato";
import type { evaluacionesIdeas } from "@/db/schema";
import { guardarEvaluacion } from "./acciones";
import type { ResultadoIdeas } from "./operacion";

export type Evaluacion = typeof evaluacionesIdeas.$inferSelect;
const estiloSelect = "h-9 w-full rounded-md border bg-background px-3 text-sm";

function Nota({ nombre, valor, requerida }: { nombre: string; valor?: number; requerida?: boolean }) {
  return <select name={nombre} className={estiloSelect} defaultValue={valor ?? ""} required={requerida}>
    <option value="">{requerida ? "Elige una calificación" : "Sin calificación"}</option>
    {[1, 2, 3, 4, 5].map((nota) => <option key={nota} value={nota}>{nota}</option>)}
  </select>;
}

export function EvaluacionForm({ cuenta, ideaId, revisionIdea, evaluacion, motivoRequerido }: {
  cuenta: string; ideaId: string; revisionIdea: string; evaluacion?: Evaluacion; motivoRequerido: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [resultado, informar] = useState<ResultadoIdeas>();
  return <details className="space-y-3 border-t pt-4">
    <summary className="cursor-pointer font-medium">{evaluacion ? `Editar evaluación · ${evaluacion.calificacion}/5` : "Evaluar idea"}</summary>
    <form key={evaluacion?.id} onSubmit={(evento) => {
      evento.preventDefault();
      if (pendiente) return;
      const form = new FormData(evento.currentTarget);
      const categorias = Object.fromEntries(Object.keys(categoriasEvaluacion).flatMap((nombre) => {
        const valor = form.get(nombre);
        return valor ? [[nombre, Number(valor)]] : [];
      }));
      const datos = editarEvaluacion.safeParse({ ideaId, revisionIdea, anterior: evaluacion?.id ?? null,
        calificacion: Number(form.get("calificacion")), comentario: form.get("comentario"),
        motivo: form.get("motivo") || undefined, categorias });
      if (!datos.success) {
        informar({ ok: false, mensaje: "Elige una calificación de 1 a 5 y revisa el comentario." });
        return;
      }
      informar(undefined);
      iniciar(async () => {
        try {
          informar(await guardarEvaluacion(cuenta, datos.data));
        } catch {
          informar({ ok: false, mensaje: "No se recibió respuesta al guardar. Comprueba la evaluación antes de reintentar." });
        }
      });
    }}>
      <fieldset disabled={pendiente} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Calificación general<Nota nombre="calificacion" valor={evaluacion?.calificacion} requerida /></label>
          <label className="grid gap-1 text-sm">Motivo de aprobación o descarte
            <select name="motivo" className={estiloSelect} defaultValue={evaluacion?.motivo ?? ""} required={motivoRequerido}>
              <option value="">Sin motivo</option>
              {Object.entries(motivosEvaluacion).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
            </select>
          </label>
          {Object.entries(categoriasEvaluacion).map(([clave, etiqueta]) => {
            const nombre = clave as keyof typeof categoriasEvaluacion;
            return <label key={nombre} className="grid gap-1 text-sm">{etiqueta} (opcional)
              <Nota nombre={nombre} valor={evaluacion?.categorias[nombre]} />
            </label>;
          })}
        </div>
        <label className="grid gap-1 text-sm">Comentario (opcional)
          <Textarea name="comentario" maxLength={1000} defaultValue={evaluacion?.comentario ?? ""} />
        </label>
        <Button type="submit">{pendiente ? "Guardando evaluación…" : "Guardar evaluación"}</Button>
      </fieldset>
    </form>
    {resultado && <p role={resultado.ok ? "status" : "alert"}>{resultado.mensaje}</p>}
  </details>;
}
