import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/db";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { crearRepositorioTendencias } from "@/lib/tendencias/repositorio";
import { gestionarTendencias } from "./acciones";
import { mensajeLecturaTendencias, mostrarInvestigacion, mostrarSolicitud } from "./operacion";
import { PanelTendencias } from "./panel";

export const maxDuration = 110;
type Busqueda = Promise<{ investigacion?: string | string[] }>;

async function cargarTendencias(searchParams: Busqueda) {
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta) return null;
    const { investigacion } = await searchParams;
    const repo = crearRepositorioTendencias(db, cuenta.id);
    const historial = await repo.historial(10);
    const id = z.uuid().safeParse(investigacion).data;
    const elegida = investigacion === undefined ? historial[0]?.id : id;
    const datos = elegida ? await repo.obtener(elegida) : null;

    return { cuenta, id, investigacionSolicitada: investigacion !== undefined, datos, historial };
  } catch (error) {
    return { error: mensajeLecturaTendencias(error) };
  }
}

async function ContenidoTendencias({ searchParams }: { searchParams: Busqueda }) {
  const contexto = await cargarTendencias(searchParams);
  if (!contexto) return <p className="text-sm text-zinc-400">Selecciona una cuenta para consultar sus tendencias.</p>;
  if ("error" in contexto) return <p role="alert" className="text-sm text-red-200">{contexto.error}</p>;
  const { cuenta, id, investigacionSolicitada, datos, historial } = contexto;
  return <>
    <p className="text-sm text-zinc-400">Cuenta activa · @{cuenta.username}</p>
    {investigacionSolicitada && !datos && <p role="alert" className="text-sm text-red-200">La investigación no está disponible para la cuenta activa.</p>}
    <PanelTendencias key={`${cuenta.id}-${id ?? ""}`} inicial={datos ? mostrarInvestigacion(datos) : null}
      historial={historial.map(mostrarSolicitud)} mercadoDefecto={process.env.TRENDS_MARKET?.trim()}
      mock={(process.env.TRENDS_PROVIDER ?? "mock") === "mock"} gestionar={gestionarTendencias.bind(null, cuenta.id)} />
  </>;
}

export default function TendenciasPage({ searchParams }: { searchParams: Busqueda }) {
  return <section className="space-y-5" aria-labelledby="titulo-tendencias">
    <h1 id="titulo-tendencias" className="text-3xl font-bold tracking-tight">Tendencias</h1>
    <Suspense fallback={<p role="status" className="text-sm text-zinc-400">Cargando historial…</p>}>
      <ContenidoTendencias searchParams={searchParams} />
    </Suspense>
  </section>;
}
