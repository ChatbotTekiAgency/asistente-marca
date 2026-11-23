"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { mensajesCompetidor, perfilInstagram, type EstadoCompetidor } from "@/lib/competencia/contrato";

type Registro = { id: string; username: string; url: string; nombre: string | null; descripcion: string | null;
  activo: boolean; revision: string };

export function PanelCompetencia({ registros, limite, guardarAction }: {
  registros: Registro[]; limite: number; guardarAction: (entrada: unknown) => Promise<EstadoCompetidor>;
}) {
  const [editor, setEditor] = useState<Registro | "nuevo" | null>(null);
  const [resultado, setResultado] = useState<EstadoCompetidor>();
  const [pendiente, iniciar] = useTransition();
  const activos = registros.filter(({ activo }) => activo).length;
  const registro = editor && editor !== "nuevo" ? editor : null;

  function enviar(entrada: unknown) {
    if (pendiente) return;
    setResultado(undefined);
    iniciar(async () => {
      try {
        const estado = await guardarAction(entrada);
        setResultado(estado);
        if (estado === "guardado") setEditor(null);
      } catch {
        setResultado("error");
      }
    });
  }

  function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const perfil = form.get("perfil");
    if (!perfilInstagram.safeParse(perfil).success) {
      setResultado("invalido");
      return;
    }
    const datos = { perfil, nombre: form.get("nombre"), descripcion: form.get("descripcion"), activo: form.has("activo") };
    enviar(registro ? { accion: "editar", id: registro.id, revision: registro.revision, datos } : { accion: "crear", datos });
  }

  function abrir(seleccion: Registro | "nuevo" | null) {
    setResultado(undefined);
    setEditor(seleccion);
  }

  return <div className="space-y-4">
    <Card className="border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Competidores registrados</h2>
          <p className="mt-1 text-sm text-zinc-400" aria-live="polite">{activos}/{limite} activos</p>
        </div>
        <Button onClick={() => abrir("nuevo")} disabled={pendiente || editor === "nuevo"}><Plus aria-hidden /> Agregar competidor</Button>
      </CardHeader>
      {resultado && <CardContent>
        <p role={resultado === "guardado" ? "status" : "alert"} className={resultado === "guardado" ? "text-emerald-300" : "text-red-300"}>
          {mensajesCompetidor[resultado]}
        </p>
      </CardContent>}
    </Card>
    {editor && <Card className="border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
      <CardHeader><h2 className="font-semibold">{registro ? "Editar competidor" : "Agregar competidor"}</h2></CardHeader>
      <CardContent>
        <form onSubmit={guardar} key={registro?.id ?? "nuevo"}>
          <fieldset disabled={pendiente} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Usuario o URL de Instagram
              <Input name="perfil" defaultValue={registro?.username} maxLength={512} required placeholder="@marca" />
            </label>
            <label className="grid gap-1 text-sm">Nombre visible (opcional)
              <Input name="nombre" defaultValue={registro?.nombre ?? ""} maxLength={100} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">Motivo de seguimiento (opcional)
              <Textarea name="descripcion" rows={3} defaultValue={registro?.descripcion ?? ""} maxLength={500} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="activo" defaultChecked={registro?.activo ?? activos < limite} /> Activo
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit">{pendiente ? "Guardando…" : "Guardar competidor"}</Button>
              <Button type="button" variant="ghost" onClick={() => abrir(null)}>Cancelar</Button>
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>}
    {registros.length === 0 ? <p className="rounded-lg border border-white/10 p-4 text-sm text-zinc-400">
      Aún no hay competidores para esta cuenta. Agrega un perfil de Instagram para empezar.
    </p> : <ul className="grid gap-3 md:grid-cols-2">
      {registros.map((item) => <li key={item.id}>
        <Card className="h-full border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words font-semibold">{item.nombre || `@${item.username}`}</h3>
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 break-all text-sm text-violet-200 hover:underline">
                  @{item.username}<ArrowUpRight aria-hidden className="size-3.5" />
                </a>
              </div>
              <span className={item.activo ? "text-xs text-emerald-300" : "text-xs text-zinc-400"}>{item.activo ? "Activo" : "Inactivo"}</span>
            </div>
            {item.descripcion && <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{item.descripcion}</p>}
            <p className="text-xs text-zinc-400">Perfil sin verificar</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm"><Link href={`/dashboard/competencia?competidor=${item.id}`}>Publicaciones</Link></Button>
              <Button variant="outline" size="sm" disabled={pendiente} onClick={() => abrir(item)}>Editar</Button>
              {item.activo && <Button size="sm" variant="ghost" disabled={pendiente} onClick={() =>
                enviar({ accion: "desactivar", id: item.id, revision: item.revision })}>Desactivar</Button>}
            </div>
          </CardContent>
        </Card>
      </li>)}
    </ul>}
  </div>;
}
