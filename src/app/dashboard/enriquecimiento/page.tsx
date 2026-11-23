import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/db";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { crearRepositorioEnriquecimiento } from "@/lib/enriquecimiento/repositorio";
import { configurarEnriquecimiento } from "@/lib/enriquecimiento/proveedor";
import { diagnosticoConfiguracion } from "@/lib/enriquecimiento/configuracion";
import { PanelEnriquecimiento } from "./panel";

type Busqueda = Promise<{ pagina?: string | string[] }>;

async function Contenido({ searchParams }: { searchParams: Busqueda }) {
  const cuenta = await getCuentaActiva();
  if (!cuenta) return <p className="text-sm text-zinc-400">Selecciona una cuenta para continuar.</p>;
  const { pagina: raw } = await searchParams;
  const pagina = typeof raw === "string" && /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : 1;
  let config;
  let diagnostico;
  try { config = configurarEnriquecimiento(); } catch (error) { diagnostico = diagnosticoConfiguracion(error); }
  const proveedor = config?.proveedor;
  const filas = await crearRepositorioEnriquecimiento(db, cuenta.id).listar(pagina, proveedor).catch(() => null);
  if (!filas) return <p role="alert" className="text-sm text-zinc-300">No se pudo cargar la lista. Comprueba que la migración 0005 esté aplicada.</p>;
  return <>
    <p className="text-sm text-zinc-400">@{cuenta.username} · {proveedor === "mock" ? "Modo de prueba" : proveedor === "anthropic" ? "Anthropic · Ejecución manual" : "Configuración incompleta"}</p>
    {diagnostico && <p role="alert" className="text-sm text-red-300">{diagnostico}</p>}
    <PanelEnriquecimiento key={`${cuenta.id}:${pagina}`} publicaciones={filas.slice(0, 25)} disponible={!!proveedor}
      maxPublicaciones={config?.maxPublicaciones} />
    {(pagina > 1 || filas.length > 25) && (
      <nav aria-label="Páginas" className="flex gap-4 text-sm text-violet-200">
        {pagina > 1 && <Link href={`?pagina=${pagina - 1}`}>Anterior</Link>}
        {filas.length > 25 && <Link href={`?pagina=${pagina + 1}`}>Siguiente</Link>}
      </nav>
    )}
  </>;
}

export default function EnriquecimientoPage({ searchParams }: { searchParams: Busqueda }) {
  return (
    <section className="space-y-4" aria-labelledby="enriquecimiento-titulo">
      <h1 id="enriquecimiento-titulo" className="text-3xl font-bold tracking-tight">Enriquecimiento de publicaciones</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Cargando publicaciones…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
