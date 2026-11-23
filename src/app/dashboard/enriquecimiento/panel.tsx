"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MAX_LOTE, type Clasificacion, type Evento, type Modalidad, type VistaPrevia } from "@/lib/enriquecimiento/contrato";

type Publicacion = {
  id: string; shortcode: string; caption: string | null; conImagen: boolean;
  resultado: { proveedor: string | null; modalidad: string | null; analizadoEn: Date | null; clasificacion: Clasificacion | null } | null;
};
const estados = { lista: "Lista para analizar", duplicada: "Análisis idéntico guardado", ocupada: "Análisis en curso", sin_imagen: "Sin imagen autorizada" };
const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

export function PanelEnriquecimiento({ publicaciones, disponible, maxPublicaciones = MAX_LOTE }: {
  publicaciones: Publicacion[]; disponible: boolean; maxPublicaciones?: number;
}) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [modalidad, setModalidad] = useState<Modalidad>("texto");
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [confirmada, setConfirmada] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [error, setError] = useState<string>();

  function reiniciarPrevia() { setPrevia(null); setConfirmada(false); setError(undefined); setEventos([]); }

  async function solicitud(ejecutar: boolean) {
    if (procesando || (ejecutar && (!previa?.permitido || !confirmada))) return;
    setProcesando(true);
    setError(undefined);
    setEventos([]);
    try {
      const respuesta = await fetch("/api/enriquecimiento", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ejecutar
          ? { accion: "ejecutar", ids, modalidad, confirmada, huella: previa?.huella }
          : { accion: "previsualizar", ids, modalidad }),
      });
      if (!respuesta.ok) {
        const fallo = await respuesta.json().catch(() => ({}));
        throw new Error(typeof fallo.error === "string" ? fallo.error : "No se pudo completar la solicitud.");
      }
      if (!ejecutar) {
        setPrevia(await respuesta.json());
        setConfirmada(false);
        return;
      }
      if (!respuesta.body) throw new Error("El servidor no devolvió progreso.");
      const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      let finalizado = false;
      try {
        while (true) {
          const { value, done } = await lector.read();
          if (done) break;
          const lineas = (resto + value).split("\n");
          resto = lineas.pop() ?? "";
          for (const linea of lineas) {
            const evento = JSON.parse(linea) as Evento | { estado: "fin" };
            if (evento.estado === "fin") finalizado = true;
            else setEventos((anteriores) => [...anteriores, evento]);
          }
        }
      } finally { lector.releaseLock(); }
      if (!finalizado) throw new Error("Se interrumpió el progreso. Consulta los resultados guardados.");
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo completar la solicitud.");
    } finally {
      if (ejecutar) {
        setPrevia(null);
        setConfirmada(false);
        router.refresh();
      }
      setProcesando(false);
    }
  }

  if (!publicaciones.length) return <p className="text-sm text-zinc-400">No hay publicaciones en esta página.</p>;
  return (
    <div className="space-y-4">
      <Card className="border border-white/10 bg-zinc-900 text-zinc-100">
        <CardHeader><h2 className="font-semibold">Lote manual</h2></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">Modalidad
              <select value={modalidad} disabled={procesando} onChange={(event) => {
                setModalidad(event.target.value === "visual" ? "visual" : "texto"); reiniciarPrevia();
              }} className="h-8 rounded-lg border border-input bg-zinc-950 px-2">
                <option value="texto">Solo texto</option><option value="visual">Texto e imagen persistida</option>
              </select>
            </label>
            <Button onClick={() => void solicitud(false)} disabled={!ids.length || procesando || !disponible}>Previsualizar lote</Button>
            <span className="text-sm text-zinc-400">{ids.length} de {maxPublicaciones} seleccionadas</span>
          </div>
          {previa && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <p>{previa.procesables} publicaciones para procesar · {previa.proveedor === "mock" ? "Prueba sin costo" : `Reserva aproximada ${usd.format(previa.costoUsd)} de ${usd.format(previa.presupuestoUsd)}`}</p>
              {previa.proveedor === "anthropic" && <p className="text-sm text-zinc-400">La reserva usa los límites de tokens y las tarifas configuradas. El costo facturado puede variar.</p>}
              <ul className="text-sm text-zinc-300">{previa.filas.map((fila) => <li key={fila.id}>{fila.shortcode} · {estados[fila.estado]}</li>)}</ul>
              {previa.procesables > 0 && !previa.permitido && <p role="alert" className="text-sm text-red-300">El lote supera el presupuesto configurado.</p>}
              {previa.permitido && <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmada} disabled={procesando}
                  onChange={(event) => setConfirmada(event.target.checked)} /> Confirmo la modalidad, las publicaciones y la reserva indicada.</label>
                <Button onClick={() => void solicitud(true)} disabled={!confirmada || procesando}>Ejecutar lote</Button>
              </>}
            </div>
          )}
          {procesando && <p role="status">Procesando… {eventos.length} resultados recibidos.</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          {!!eventos.length && <ul aria-live="polite" className="space-y-1 text-sm">
            {eventos.map((evento) => <li key={evento.id}>{publicaciones.find(({ id }) => id === evento.id)?.shortcode} · {evento.estado}{evento.mensaje && ` · ${evento.mensaje}`}</li>)}
          </ul>}
        </CardContent>
      </Card>
      <ul className="grid gap-3 md:grid-cols-2">
        {publicaciones.map((post) => {
          const r = post.resultado;
          const c = r?.clasificacion;
          const marcado = ids.includes(post.id);
          return <li key={post.id}>
            <Card className="h-full border border-white/10 bg-zinc-900 text-zinc-100">
              <CardContent className="space-y-2">
                <label className="flex items-start gap-2 font-medium">
                  <input type="checkbox" className="mt-1" checked={marcado} disabled={procesando || (!marcado && ids.length >= maxPublicaciones)}
                    onChange={() => { setIds(marcado ? ids.filter((id) => id !== post.id) : [...ids, post.id]); reiniciarPrevia(); }} />
                  {post.shortcode}
                </label>
                <p className="line-clamp-3 break-words text-sm text-zinc-300">{post.caption || "Sin descripción"}</p>
                <p className="text-xs text-zinc-400">{post.conImagen ? "Con referencia de imagen" : "Sin imagen persistida"} · {r?.proveedor === "mock" ? "Prueba simulada" : c ? "Analizada" : "Pendiente"}</p>
                {c && <details className="break-words text-sm">
                  <summary className="cursor-pointer text-violet-200">Ver clasificación {r?.proveedor === "mock" && "de prueba"}</summary>
                  <dl className="mt-2 space-y-1">
                    <div><dt className="inline font-medium">Tema · </dt><dd className="inline">{c.temaPrincipal}{c.temasSecundarios.length > 0 && ` · ${c.temasSecundarios.join(", ")}`}</dd></div>
                    <div><dt className="inline font-medium">Intención y tono · </dt><dd className="inline">{c.intencion} · {c.tono}</dd></div>
                    <div><dt className="inline font-medium">Gancho · </dt><dd className="inline">{c.gancho.replaceAll("_", " ")}{c.explicacionGancho && ` · ${c.explicacionGancho}`}</dd></div>
                    <div><dt className="inline font-medium">Resumen · </dt><dd className="inline">{c.resumen}</dd></div>
                    <div><dt className="inline font-medium">Visual · </dt><dd className="inline">{c.descripcionVisual ?? "Sin análisis visual"}</dd></div>
                  </dl>
                  {r?.analizadoEn && <p className="mt-2 text-xs text-zinc-400">{fecha.format(r.analizadoEn)}</p>}
                </details>}
              </CardContent>
            </Card>
          </li>;
        })}
      </ul>
    </div>
  );
}
