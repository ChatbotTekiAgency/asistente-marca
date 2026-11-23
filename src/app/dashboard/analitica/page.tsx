import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { consultarAnaliticaInstagram } from "@/lib/instagram/analitica";
import { filtrosAnalitica, formatosInstagram } from "@/lib/instagram/filtros-analitica";
import { PanelAnalitica } from "./informe";
import { formatos } from "./presentacion";

type Busqueda = Promise<Record<string, string | string[] | undefined>>;
const ruta = "/dashboard/analitica";
const selector = "h-8 w-full rounded-lg border border-input bg-zinc-950 px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-violet-400";

async function Contenido({ searchParams }: { searchParams: Busqueda }) {
  const cuenta = await getCuentaActiva();
  if (!cuenta) return <p className="text-zinc-400">Selecciona una cuenta para ver su analítica.</p>;

  const seleccion = filtrosAnalitica.safeParse(await searchParams);
  const filtros = seleccion.success ? seleccion.data : filtrosAnalitica.parse({});
  const informe = seleccion.success
    ? await consultarAnaliticaInstagram(db, cuenta.id, filtros).catch(() => null)
    : null;

  return (
    <>
      <p className="text-sm text-zinc-400">Métricas públicas de @{cuenta.username} · Horario de Bogotá</p>
      <Card className="border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
        <CardContent>
          <form action={ruta} method="get" aria-label="Filtros de analítica"
            key={JSON.stringify(filtros)}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <label className="space-y-1">
              <span className="block text-xs text-zinc-300">Formato</span>
              <select name="formato" defaultValue={filtros.formato ?? ""} className={selector}>
                <option value="">Todos los formatos</option>
                {formatosInstagram.map((tipo) => <option value={tipo} key={tipo}>{formatos[tipo].nombre}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-zinc-300">Publicadas desde</span>
              <Input type="date" name="desde" defaultValue={filtros.desde} className="min-w-0 bg-zinc-950" />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-zinc-300">Publicadas hasta</span>
              <Input type="date" name="hasta" defaultValue={filtros.hasta} className="min-w-0 bg-zinc-950" />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-zinc-300">Orden de la tabla</span>
              <select name="orden" defaultValue={filtros.orden} className={selector}>
                <option value="fecha">Más recientes</option>
                <option value="interacciones">Más interacciones</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Aplicar</Button>
              <Button asChild variant="ghost"><Link href={ruta}>Limpiar</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {informe ? <PanelAnalitica filtros={filtros} informe={informe} /> : (
        <p role="alert" className="rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-200">
          {seleccion.success
            ? "No se pudo cargar la analítica. Recarga la página para volver a intentarlo."
            : "Revisa el formato, las fechas y el orden. La fecha final debe ser igual o posterior a la inicial."}
        </p>
      )}
    </>
  );
}

export default function AnaliticaPage({ searchParams }: { searchParams: Busqueda }) {
  return (
    <section className="space-y-4" aria-labelledby="titulo-analitica">
      <h1 id="titulo-analitica" className="text-3xl font-bold tracking-tight text-white">Analítica de Instagram</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Cargando analítica…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
