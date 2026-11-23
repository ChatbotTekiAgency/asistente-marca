"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { editarIdea, formatosIdea } from "@/lib/ideas/contrato";
import { solicitarIdeas, type SolicitudIdeas } from "@/lib/ideas/solicitud";
import type { ideasContenido } from "@/db/schema";
import { gestionarIdeas } from "./acciones";
import { camposIdea, estadosVisibles, type OperacionIdeas, type ResultadoIdeas } from "./operacion";

const select = "h-9 w-full rounded-md border bg-background px-3 text-sm";
const campo = "grid gap-1 text-sm";
const rejilla = "grid gap-3 sm:grid-cols-2";

function Formato({ inicial }: { inicial?: string }) {
  return <label className={campo}>Formato
    <select name="formato" defaultValue={inicial ?? ""} className={select}>
      {!inicial && <option value="">Sin preferencia</option>}
      {formatosIdea.map((valor) => <option key={valor} value={valor}>{valor}</option>)}
    </select>
  </label>;
}

function useOperacion(cuenta: string) {
  const [resultado, informar] = useState<ResultadoIdeas>();
  const [pendiente, iniciar] = useTransition();
  const ocupada = useRef(false);
  function ejecutar(entrada: OperacionIdeas, terminar?: () => void) {
    if (ocupada.current) return;
    ocupada.current = true;
    informar(undefined);
    iniciar(async () => {
      try {
        const respuesta = await gestionarIdeas(cuenta, entrada);
        informar(respuesta);
        terminar?.();
      } catch {
        informar({ ok: false, mensaje: "No se recibió respuesta. Puedes reenviar la misma solicitud." });
      } finally {
        ocupada.current = false;
      }
    });
  }
  return { resultado, pendiente, ejecutar, informar };
}

export function Generador({ cuenta, modo, presupuesto, maxPorSolicitud }: {
  cuenta: string; modo: "mock" | "anthropic"; presupuesto: number; maxPorSolicitud: number;
}) {
  const { resultado, pendiente, ejecutar, informar } = useOperacion(cuenta);
  const [solicitud, preparar] = useState<SolicitudIdeas>();
  function generar(datos: SolicitudIdeas, confirmada: boolean) {
    ejecutar({ tipo: "generar", modo, confirmada, datos }, () => preparar(undefined));
  }
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (solicitud || pendiente) return;
    const formulario = new FormData(evento.currentTarget);
    const leer = (nombre: string) => String(formulario.get(nombre) ?? "").trim() || undefined;
    const desde = leer("desde");
    const hasta = leer("hasta");
    const validada = solicitarIdeas.safeParse({ clave: crypto.randomUUID(), tema: leer("tema"), objetivo: leer("objetivo"),
      publico: leer("publico"), pilar: leer("pilar"), formato: formatosIdea.find((formato) => formato === leer("formato")),
      cantidad: Number(formulario.get("cantidad")), intervalo: desde || hasta ? { desde, hasta } : undefined });
    if (!validada.success) {
      informar({ ok: false, mensaje: "Revisa el formulario. Para un período personalizado, indica ambas fechas en orden y con hasta 366 días de diferencia." });
      return;
    }
    const datos = validada.data;
    preparar(datos);
    if (modo === "mock") generar(datos, false);
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{modo === "mock" ? "Proveedor mock · Ideas simuladas sin costo" : `Proveedor Anthropic · Presupuesto máximo estimado de US$ ${presupuesto.toFixed(5)} por generación`}</p>
    <form onSubmit={enviar}>
      <fieldset disabled={pendiente || !!solicitud} className="space-y-4">
        <div className={rejilla}>
          <label className={campo}>Tema (opcional)<Input name="tema" maxLength={160} /></label>
          <label className={campo}>Objetivo comunicativo<Input name="objetivo" maxLength={500} required defaultValue="Educar y aportar valor a la audiencia" /></label>
          <label className={campo}>Público objetivo (opcional)<Input name="publico" maxLength={300} /></label>
          <label className={campo}>Pilar de contenido (opcional)<Input name="pilar" maxLength={160} /></label>
          <Formato />
          <label className={campo}>Cantidad<select className={select} name="cantidad" defaultValue={Math.min(3, maxPorSolicitud)}>
            {Array.from({ length: maxPorSolicitud }, (_, indice) => indice + 1).map((valor) => <option key={valor}>{valor}</option>)}
          </select></label>
          <label className={campo}>Inicio del análisis<Input type="date" name="desde" aria-describedby="intervalo-ideas" /></label>
          <label className={campo}>Fin del análisis<Input type="date" name="hasta" aria-describedby="intervalo-ideas" /></label>
        </div>
        <p id="intervalo-ideas" className="text-sm text-muted-foreground">Si dejas ambas fechas vacías, se usan los últimos 90 días.</p>
        <Button type="submit">Generar ideas</Button>
      </fieldset>
    </form>
    {solicitud && !pendiente && <div className="space-y-2 rounded-md border p-3">
      {modo === "anthropic" && <p>Confirma la generación de {solicitud.cantidad} ideas con Anthropic. Esta solicitud puede consumir créditos.</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => generar(solicitud, modo === "anthropic")}>{modo === "anthropic" ? "Confirmar generación" : "Reenviar solicitud"}</Button>
        <Button variant="outline" onClick={() => preparar(undefined)}>Cancelar</Button>
      </div>
    </div>}
    {pendiente && <p role="status">Generando ideas…</p>}
    {resultado && <p role={resultado.ok ? "status" : "alert"}>{resultado.mensaje}
      {resultado.costo !== undefined && ` Costo estimado US$ ${resultado.costo.toFixed(5)}.`}
      {resultado.generacionId && <> <Link className="underline" href={`/dashboard/ideas?generacion=${resultado.generacionId}`}>Ver generación</Link></>}
    </p>}
  </div>;
}

export function ControlesIdea({ cuenta, idea }: { cuenta: string; idea: typeof ideasContenido.$inferSelect }) {
  const [editar, mostrarEditor] = useState(false);
  const { pendiente, resultado, ejecutar, informar } = useOperacion(cuenta);
  const identificador = { id: idea.id, revision: idea.revision };
  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = editarIdea.safeParse({ ...identificador, datos: Object.fromEntries(new FormData(evento.currentTarget)) });
    if (!datos.success) {
      informar({ ok: false, mensaje: "Completa los campos respetando sus límites." });
      return;
    }
    ejecutar({ tipo: "editar", datos: datos.data });
  }
  return <div className="space-y-3 border-t pt-4">
    <Button variant="outline" disabled={pendiente} onClick={() => mostrarEditor(!editar)}>{editar ? "Cerrar edición" : "Editar idea"}</Button>
    <form onSubmit={(evento) => {
      evento.preventDefault();
      const valor = new FormData(evento.currentTarget).get("estado");
      const estado = Object.keys(estadosVisibles).find((clave) => clave === valor) as keyof typeof estadosVisibles | undefined;
      if (estado && estado !== idea.estado) ejecutar({ tipo: "estado", datos: { ...identificador, estado } });
    }} className="flex flex-wrap items-end gap-2">
      <label className={campo}>Estado
        <select name="estado" key={idea.estado} defaultValue={idea.estado} disabled={pendiente || editar} className={select}>
          {Object.entries(estadosVisibles).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={pendiente || editar}>Guardar estado</Button>
    </form>
    {editar && <form key={idea.revision} onSubmit={guardar}>
      <fieldset disabled={pendiente} className="space-y-3">
        <div className={rejilla}>
          {camposIdea.map(([nombre, etiqueta, max]) => <label key={nombre} className={campo}>{etiqueta}
            {max > 300 ? <Textarea name={nombre} required maxLength={max} defaultValue={idea[nombre]} />
              : <Input name={nombre} required maxLength={max} defaultValue={idea[nombre]} />}
          </label>)}
          <Formato inicial={idea.formato} />
        </div>
        <Button type="submit">Guardar edición</Button>
      </fieldset>
    </form>}
    {pendiente && <p role="status">Guardando…</p>}
    {resultado && <p role={resultado.ok ? "status" : "alert"}>{resultado.mensaje}</p>}
  </div>;
}
