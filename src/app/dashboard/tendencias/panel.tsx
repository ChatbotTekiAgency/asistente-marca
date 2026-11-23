"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fechaCaptura } from "../analitica/presentacion";
import type { InvestigacionVisible, OperacionTendencias, ResultadoOperacion, SolicitudVisible } from "./operacion";
import { TarjetasTendencias } from "./tarjetas";

const mercados = ["Colombia", "México", "Argentina", "Brasil", "Chile", "Ecuador", "Perú", "Estados Unidos", "España", "Latinoamérica", "Global"];
const moneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 5 });
const erroresGuardados = {
  respuesta_invalida: "No se obtuvieron cuatro propuestas completas con fuentes suficientes.",
  proveedor: "El proveedor no pudo completar la investigación.",
  vencida: "La investigación superó el tiempo disponible.",
};
type Criterios = { tema?: string; mercado?: string };
type Cotizacion = Extract<ResultadoOperacion, { tipo: "confirmacion" }> & { datos: Criterios; clave: string };

function etiqueta(solicitud: SolicitudVisible, vencida = solicitud.cacheVencida) {
  if (solicitud.estado === "en_curso") return "En curso";
  if (solicitud.estado === "fallida") return "Fallida";
  return vencida ? "Vencida" : "Vigente";
}

export function PanelTendencias({ inicial, historial, mercadoDefecto, mock, gestionar }: {
  inicial: InvestigacionVisible | null; historial: SolicitudVisible[]; mercadoDefecto?: string; mock: boolean;
  gestionar: (entrada: OperacionTendencias) => Promise<ResultadoOperacion>;
}) {
  const [tema, setTema] = useState(inicial?.tema ?? "");
  const [mercado, setMercado] = useState(inicial?.mercado ?? "");
  const [seleccion, setSeleccion] = useState<InvestigacionVisible | null>(inicial);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [operacion, setOperacion] = useState<OperacionTendencias["tipo"]>("consultar");
  const [pendiente, iniciar] = useTransition();
  const [expiracionLocal, setExpiracionLocal] = useState<string | null>(null);
  const fechaExpiracion = seleccion?.expiraCacheEn ?? null;
  const vencida = Boolean(seleccion?.cacheVencida || (fechaExpiracion && fechaExpiracion === expiracionLocal));

  useEffect(() => {
    if (!fechaExpiracion) return;
    const timer = window.setTimeout(() => setExpiracionLocal(fechaExpiracion), Math.max(0, Date.parse(fechaExpiracion) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [fechaExpiracion]);

  function enviar(entrada: OperacionTendencias) {
    setMensaje("");
    setOperacion(entrada.tipo);
    iniciar(async () => {
      try {
        const respuesta = await gestionar(entrada);
        if (respuesta.tipo === "error") {
          setCotizacion(null);
          setMensaje(respuesta.mensaje);
        } else if (respuesta.tipo === "confirmacion" && entrada.tipo !== "estado") {
          const datos = { tema: entrada.datos.tema, mercado: entrada.datos.mercado };
          setCotizacion({ ...respuesta, datos, clave: crypto.randomUUID() });
        } else if (respuesta.tipo === "investigacion") {
          setCotizacion(null);
          setSeleccion(respuesta.investigacion);
          setMensaje(respuesta.mensaje ?? "");
        }
      } catch {
        setMensaje("No se pudo completar la solicitud. Comprueba el historial antes de volver a intentarlo.");
      }
    });
  }

  function consultar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    enviar({ tipo: "consultar", datos: { tema: tema.trim() || undefined, mercado: mercado || undefined } });
  }

  function actualizar() {
    if (!seleccion || !vencida) return;
    const datos = { tema: seleccion.tema ?? undefined, mercado: seleccion.mercado ?? undefined };
    setTema(datos.tema ?? "");
    setMercado(datos.mercado ?? "");
    enviar({ tipo: "consultar", datos });
  }

  const opciones = mercados.map((nombre) => ({ nombre, valor: nombre.toLowerCase() }));
  if (mercado && !opciones.some(({ valor }) => valor === mercado)) opciones.push({ nombre: mercado, valor: mercado });

  return <>
    <Card>
      <CardContent>
        <form onSubmit={consultar}>
          <fieldset disabled={pendiente} className="grid items-end gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
            <label className="space-y-1 text-sm font-medium">
              Tema de investigación (opcional)
              <Input name="tema" value={tema} maxLength={160} onChange={(event) => { setTema(event.target.value); setCotizacion(null); }} />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Mercado o país
              <select name="mercado" value={mercado} onChange={(event) => { setMercado(event.target.value); setCotizacion(null); }}
                className="h-8 w-full rounded-lg border border-input bg-zinc-950 px-2 text-sm focus-visible:outline focus-visible:outline-violet-400">
                <option value="">{mercadoDefecto ? `Predeterminado · ${mercadoDefecto}` : "Sin preferencia"}</option>
                {opciones.map(({ nombre, valor }) => <option key={valor} value={valor}>{nombre}</option>)}
              </select>
            </label>
            <Button type="submit">Buscar tendencias</Button>
          </fieldset>
        </form>
      </CardContent>
    </Card>

    {pendiente && <p role="status" className="text-sm text-violet-200">
      {operacion === "confirmar" ? "Investigación en progreso…" : "Consultando investigaciones guardadas…"}
    </p>}
    {mensaje && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{mensaje}</p>}
    {cotizacion && <section aria-labelledby="confirmar-tendencias" className="space-y-3 rounded-lg border border-violet-400/30 bg-violet-950/20 p-4">
      <h2 id="confirmar-tendencias" className="font-semibold">Confirmar nueva investigación</h2>
      <p className="text-sm text-zinc-300">No hay resultados vigentes para estos criterios.</p>
      {mock ? <p className="text-sm text-violet-200">Modo de prueba · Sin costo</p> : <>
        <p className="text-sm">Reserva estimada de <strong>{moneda.format(cotizacion.estimacion.reservaUsd)}</strong> para hasta {cotizacion.estimacion.maxBusquedas} búsquedas.</p>
        <p className="text-sm text-zinc-400">El importe es aproximado. Confirma para iniciar la búsqueda.</p>
      </>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pendiente} onClick={() => enviar({
          tipo: "confirmar", datos: { ...cotizacion.datos, clave: cotizacion.clave, huella: cotizacion.huella, confirmada: true },
        })}>Confirmar investigación</Button>
        <Button type="button" variant="outline" disabled={pendiente} onClick={() => setCotizacion(null)}>Cancelar</Button>
      </div>
    </section>}

    {seleccion ? <section className="space-y-4" aria-labelledby="resultados-tendencias">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="resultados-tendencias" className="text-xl font-semibold">Resultados</h2>
          <p className="break-words text-sm text-zinc-300">
            {seleccion.tema ?? "Investigación general"}{seleccion.mercado && ` · ${seleccion.mercado}`} · {etiqueta(seleccion, vencida)}
          </p>
          {seleccion.proveedor === "mock" && <p className="text-sm font-medium text-violet-200">Investigación simulada</p>}
          {seleccion.estado === "completada" && <dl className="space-y-1 text-sm text-zinc-400">
            <div><dt className="inline">Última actualización · </dt><dd className="inline">{fechaCaptura(seleccion.finalizadaEn)}</dd></div>
            <div><dt className="inline">Expiración · </dt><dd className="inline">{fechaCaptura(seleccion.expiraCacheEn)}</dd></div>
            {seleccion.costoEstimadoUsd !== null && <div><dt className="inline">Costo estimado · </dt>
              <dd className="inline">{moneda.format(seleccion.costoEstimadoUsd)}</dd></div>}
          </dl>}
        </div>
        {seleccion.estado === "completada" && <Button type="button" variant="outline" onClick={actualizar} disabled={pendiente || !vencida}>
          Actualizar investigación
        </Button>}
        {seleccion.estado === "en_curso" && <Button type="button" variant="outline" disabled={pendiente}
          onClick={() => enviar({ tipo: "estado", id: seleccion.id })}>Consultar estado</Button>}
      </div>
      {vencida && <p className="rounded-lg border border-amber-500/40 p-3 text-sm text-amber-200">
        Investigación vencida. Estas propuestas se muestran como referencia histórica.
      </p>}
      {seleccion.estado === "en_curso" && <p role="status" className="text-sm text-violet-200">Investigación en progreso.</p>}
      {seleccion.estado === "fallida" && !mensaje && <p role="alert" className="text-sm text-red-200">
        {erroresGuardados[seleccion.error ?? "proveedor"]}
      </p>}
      <TarjetasTendencias tendencias={seleccion.tendencias} />
    </section> : !historial.length && <p className="text-sm text-zinc-400">Esta cuenta aún no tiene investigaciones de tendencias.</p>}

    <section aria-labelledby="historial-tendencias" className="space-y-3">
      <h2 id="historial-tendencias" className="text-xl font-semibold">Historial de investigaciones</h2>
      {historial.length ? <ul className="divide-y divide-white/10 rounded-lg border">
        {historial.map((fila) => <li key={fila.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <Link href={`/dashboard/tendencias?investigacion=${fila.id}`} aria-current={seleccion?.id === fila.id ? "page" : undefined}
            className="min-w-0 break-words text-violet-300 underline underline-offset-2">{fila.tema ?? "Investigación general"}</Link>
          <span className="text-zinc-400">{fechaCaptura(fila.creadaEn)} · {etiqueta(fila, (fila.id === seleccion?.id && vencida) || fila.cacheVencida)}
            {fila.proveedor === "mock" && " · Simulada"}</span>
        </li>)}
      </ul> : <p className="text-sm text-zinc-400">Las investigaciones guardadas aparecerán aquí.</p>}
    </section>
  </>;
}
