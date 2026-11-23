"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_BYTES_JSON, MAX_KIB_JSON, MENSAJE_ARCHIVO_JSON } from "@/lib/competencia/contrato-ingesta";
import type { RespuestaIngesta } from "@/lib/competencia/corridas";
import type { crearIngestasCompetidor } from "@/lib/competencia/ingestas";

const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });
const moneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD" });

export function PanelIngesta({ competidor, resumen, pagina, configurar, importarAction, apifyAction }: {
  competidor: { id: string; username: string; nombre: string | null; activo: boolean };
  resumen: Awaited<ReturnType<ReturnType<typeof crearIngestasCompetidor>["consultar"]>>;
  pagina: number; configurar: { limite: number; maxUsd: number } | null;
  importarAction: (form: FormData) => Promise<RespuestaIngesta>;
  apifyAction: (entrada: unknown) => Promise<RespuestaIngesta>;
}) {
  const [pendiente, iniciar] = useTransition();
  const [confirmada, confirmar] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaIngesta>();
  function ejecutar(operacion: () => Promise<RespuestaIngesta>) {
    if (pendiente) return;
    setRespuesta(undefined);
    iniciar(async () => {
      try { setRespuesta(await operacion()); }
      catch { setRespuesta({ ok: false, mensaje: "No se pudo completar la operación." }); }
      finally { confirmar(false); }
    });
  }
  function archivo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const seleccionado = form.get("archivo");
    if (!(seleccionado instanceof File) || !seleccionado.size || seleccionado.size > MAX_BYTES_JSON) {
      setRespuesta({ ok: false, mensaje: MENSAJE_ARCHIVO_JSON });
      return;
    }
    ejecutar(() => importarAction(form));
  }
  const corrida = resumen.corrida;
  const ultima = resumen.historial.find(({ finalizadaEn }) => finalizadaEn)?.finalizadaEn;
  const conteos = respuesta?.resultado;
  const enlace = (n: number) => `?competidor=${competidor.id}&pagina=${n}`;

  return <div className="space-y-4">
    <header className="space-y-1">
      <h2 className="text-xl font-semibold">{competidor.nombre || `@${competidor.username}`}</h2>
      <p className="text-sm text-zinc-400">{resumen.total} publicaciones · {ultima ? `Última ingesta finalizada el ${fecha.format(ultima)}` : "Sin ingestas finalizadas"}</p>
    </header>
    <div className="grid gap-3 md:grid-cols-2">
      <Card className="border border-white/10 bg-zinc-900 text-zinc-100">
        <CardHeader><h3 className="font-semibold">Importar archivo existente</h3></CardHeader>
        <CardContent>
          <form onSubmit={archivo} className="space-y-3">
            <label className="grid gap-1 text-sm">JSON de Apify (máximo {MAX_KIB_JSON} KiB)
              <Input name="archivo" type="file" accept=".json,application/json" required disabled={pendiente} />
            </label>
            <Button type="submit" disabled={pendiente}>Importar JSON</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="border border-white/10 bg-zinc-900 text-zinc-100">
        <CardHeader><h3 className="font-semibold">Nueva corrida de Apify</h3></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {corrida && <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pendiente} onClick={() => ejecutar(() => apifyAction({ tipo: "consultar", id: corrida.id }))}>Consultar estado</Button>
            {corrida.tieneRun && <Button variant="ghost" disabled={pendiente} onClick={() => ejecutar(() => apifyAction({ tipo: "cancelar", id: corrida.id }))}>Cancelar corrida</Button>}
          </div>}
          {configurar && competidor.activo && !corrida ? <>
            <p className="text-zinc-300">Hasta {configurar.limite} resultados. Tope solicitado a Apify de {moneda.format(configurar.maxUsd)}.</p>
            <label className="flex items-start gap-2"><input type="checkbox" checked={confirmada} disabled={pendiente}
              onChange={(e) => confirmar(e.target.checked)} /> Autorizo iniciar una corrida para @{competidor.username} con estos límites.</label>
            <Button type="button" disabled={!confirmada || pendiente} onClick={() => ejecutar(() =>
              apifyAction({ tipo: "iniciar", confirmada, ...configurar }))}>Iniciar corrida</Button>
          </> : !corrida && <p className="text-zinc-400">{competidor.activo ? "La ejecución manual no está habilitada en el servidor." : "Activa el competidor para iniciar una corrida."}</p>}
        </CardContent>
      </Card>
    </div>
    {pendiente && <p role="status" className="text-sm text-zinc-300">Procesando…</p>}
    {respuesta && <div role={respuesta.ok ? "status" : "alert"} className={respuesta.ok ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
      <p>{respuesta.mensaje}</p>
      {conteos && <>
        <p>{conteos.repetida ? "Ingesta reutilizada · " : ""}{conteos.insertadas} nuevas · {conteos.actualizadas} actualizadas · {conteos.rechazadas} rechazadas.</p>
        {!!conteos.detalle.length && <details className="mt-1">
          <summary>Ver filas rechazadas</summary>
          <ul>{conteos.detalle.map((fila) => <li key={fila.fila}>Fila {fila.fila} · {fila.motivo}</li>)}</ul>
        </details>}
      </>}
    </div>}
    <Card className="border border-white/10 bg-zinc-900 text-zinc-100">
      <CardHeader><h3 className="font-semibold">Últimas ingestas</h3></CardHeader>
      <CardContent>
        {resumen.historial.length ? <ul className="space-y-2 text-sm">{resumen.historial.map((item) => <li key={item.id}>
          <p>{fecha.format(item.iniciadaEn)} · {item.origen === "archivo" ? "Archivo" : "Apify"} · {item.estado.replace("_", " ")}</p>
          <p className="text-zinc-400">{item.procesadas} procesadas · {item.errores} errores{item.mensaje && ` · ${item.mensaje}`}</p>
        </li>)}</ul> : <p className="text-sm text-zinc-400">Aún no hay ingestas.</p>}
      </CardContent>
    </Card>
    <Card className="border border-white/10 bg-zinc-900 text-zinc-100">
      <CardHeader><h3 className="font-semibold">Publicaciones importadas</h3></CardHeader>
      <CardContent className="space-y-3">
        {resumen.listado.length ? <ul className="divide-y divide-white/10 text-sm">{resumen.listado.map((post) => <li key={post.id} className="space-y-1 py-2">
          <p><a href={post.url} target="_blank" rel="noopener noreferrer" className="text-violet-200 underline">{post.shortcode}</a> · {post.tipo} · {fecha.format(post.fecha)}</p>
          <p className="break-words text-zinc-300">{post.caption}</p>
          <p className="text-zinc-400">Likes {post.likes ?? "Sin datos"} · Comentarios {post.comentarios ?? "Sin datos"} · Reproducciones {post.reproducciones ?? "Sin datos"}</p>
        </li>)}</ul> : <p className="text-sm text-zinc-400">No hay publicaciones en esta página.</p>}
        <nav aria-label="Páginas de publicaciones" className="flex gap-3 text-sm text-violet-200">
          {pagina > 1 && <Link href={enlace(pagina - 1)}>Anterior</Link>}
          {pagina * 20 < resumen.total && <Link href={enlace(pagina + 1)}>Siguiente</Link>}
        </nav>
      </CardContent>
    </Card>
  </div>;
}
