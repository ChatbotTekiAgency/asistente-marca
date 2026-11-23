import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { env } from "@/env";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { crearRepositorioCompetencia } from "@/lib/competencia/repositorio";
import { guardarCompetidor } from "./acciones";
import { PanelCompetencia } from "./panel";
import { PanelIngesta } from "./panel-ingesta";
import { Comparacion } from "./comparacion";
import { crearIngestasCompetidor } from "@/lib/competencia/ingestas";
import { configuracionApifyCompetidores } from "@/lib/competencia/apify";
import { importarArchivoCompetidor, operarApifyCompetidor } from "./acciones-ingesta";

type Busqueda = Promise<Record<string, string | string[] | undefined>>;

async function Contenido({ searchParams }: { searchParams: Busqueda }) {
  await connection();
  const cuenta = await getCuentaActiva().catch(() => undefined);
  if (cuenta === undefined) {
    return <p role="alert" className="text-sm text-red-300">No se pudo consultar la cuenta activa. Recarga para reintentar.</p>;
  }
  if (!cuenta) return <p className="text-sm text-zinc-400">Selecciona una cuenta para gestionar sus competidores.</p>;
  const registros = await crearRepositorioCompetencia(db, cuenta.id).listar().catch(() => null);
  if (!registros) return <p role="alert" className="text-sm text-red-300">No se pudieron cargar los competidores. Recarga para reintentar.</p>;
  const parametros = await searchParams;
  if (parametros.vista === "comparar") return <Comparacion cuentaId={cuenta.id} registros={registros} parametros={parametros} />;
  const { competidor, pagina: entradaPagina } = parametros;
  const id = z.uuid().safeParse(competidor);
  const pagina = typeof entradaPagina === "string" && /^[1-9]\d{0,4}$/.test(entradaPagina) ? Number(entradaPagina) : 1;
  const seleccionado = id.success ? registros.find((rival) => rival.id === id.data) : undefined;
  if (seleccionado) {
    const resumen = await crearIngestasCompetidor(db, cuenta.id, seleccionado.id).consultar(pagina).catch(() => null);
    return <>
      <Link href="/dashboard/competencia" className="text-sm text-violet-200 hover:underline">Volver a competidores</Link>
      {resumen ? <PanelIngesta key={seleccionado.id} competidor={seleccionado} resumen={resumen} pagina={pagina}
        configurar={configuracionApifyCompetidores()}
        importarAction={importarArchivoCompetidor.bind(null, cuenta.id, seleccionado.id)}
        apifyAction={operarApifyCompetidor.bind(null, cuenta.id, seleccionado.id)} />
        : <p role="alert" className="text-sm text-red-300">No se pudo cargar la ingesta. Recarga para reintentar.</p>}
    </>;
  }
  return <>
    {competidor !== undefined && <p role="alert" className="text-sm text-red-300">El competidor no está disponible para la cuenta activa.</p>}
    <p className="text-sm text-zinc-400">Cuenta activa · @{cuenta.username}</p>
    <Link href="/dashboard/competencia?vista=comparar" className="inline-block rounded-md bg-violet-200 px-4 py-2 text-sm font-medium text-zinc-950">Comparar rendimiento</Link>
    <PanelCompetencia key={cuenta.id} registros={registros} limite={env.COMPETIDORES_MAX_ACTIVOS}
      guardarAction={guardarCompetidor.bind(null, cuenta.id)} />
  </>;
}

export default function CompetenciaPage({ searchParams }: { searchParams: Busqueda }) {
  return (
    <section className="space-y-4" aria-labelledby="competencia-titulo">
      <h1 id="competencia-titulo" className="text-3xl font-bold tracking-tight">Competencia</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Cargando competidores…</p>}><Contenido searchParams={searchParams} /></Suspense>
    </section>
  );
}
