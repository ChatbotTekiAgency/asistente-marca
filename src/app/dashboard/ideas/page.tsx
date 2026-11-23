import { Suspense } from "react";
import Link from "next/link";
import Form from "next/form";
import { z } from "zod";
import { db } from "@/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { filtrosIdeas } from "@/lib/ideas/contrato";
import { crearRepositorioIdeas } from "@/lib/ideas/repositorio";
import { configurarIdeas } from "@/lib/ideas/proveedor-ideas";
import { Generador } from "./formularios";
import { erroresVisibles, estadosVisibles } from "./operacion";
import { fecha, TarjetaIdea } from "./tarjeta";
import { crearRepositorioEvaluaciones } from "@/lib/ideas/evaluaciones";
import { HistorialEvaluaciones } from "./historial-evaluaciones";

export const maxDuration = 110;
type Busqueda = Promise<Record<string, string | string[] | undefined>>;

async function cargar(searchParams: Busqueda) {
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta) return null;
    const params = await searchParams;
    const filtros = filtrosIdeas.parse({
      estado: filtrosIdeas.shape.estado.safeParse(params.estado).data,
      titulo: filtrosIdeas.shape.titulo.safeParse(params.titulo).data,
      orden: filtrosIdeas.shape.orden.safeParse(params.orden).data,
      generacionId: z.uuid().safeParse(params.generacion).data,
      pagina: typeof params.pagina === "string" && /^[1-9]\d{0,3}$/.test(params.pagina) ? Number(params.pagina) : 1,
    });
    const banco = crearRepositorioIdeas(db, cuenta.id);
    const [ideas, historial] = await Promise.all([banco.listarConEvidencias(filtros), banco.historial()]);
    const evaluaciones = crearRepositorioEvaluaciones(db, cuenta.id);
    const calificaciones = await Promise.all([
      evaluaciones.actuales(ideas.map(({ idea }) => idea.id)), evaluaciones.historial(),
    ]).catch(() => null);
    return { cuenta, filtros, ideas, historial, calificaciones, generacionSolicitada: params.generacion !== undefined };
  } catch (error) {
    const causa = error instanceof Error ? error.cause : undefined;
    const codigo = causa && typeof causa === "object" && "code" in causa ? causa.code : undefined;
    return { error: codigo === "42P01" || codigo === "42703"
      ? "El banco aún no está disponible en esta base. Comprueba las migraciones 0010 y 0011."
      : "No se pudo cargar el banco de ideas." };
  }
}

function proveedor() {
  try {
    const config = configurarIdeas(process.env);
    return { modo: config.motor.proveedor, presupuesto: config.estimacionMaximaUsd, maxPorSolicitud: config.maxPorSolicitud };
  } catch {
    return null;
  }
}

const estadosGeneracion = { completada: "Completada", fallida: "Fallida", ejecutando: "En curso" };
const select = "h-9 w-full rounded-md border bg-background px-3 text-sm";

async function ContenidoIdeas({ searchParams }: { searchParams: Busqueda }) {
  const datos = await cargar(searchParams);
  if (!datos) return <p>Selecciona una cuenta para acceder a su banco de ideas.</p>;
  if ("error" in datos) return <p role="alert">{datos.error}</p>;
  const { cuenta, filtros, ideas, historial, calificaciones } = datos;
  const evaluaciones = new Map(calificaciones?.[0].map((fila) => [fila.ideaId, fila]));
  const configuracion = proveedor();
  function enlacePagina(pagina: number) {
    const consulta = new URLSearchParams({ pagina: String(pagina), orden: filtros.orden });
    if (filtros.estado) consulta.set("estado", filtros.estado);
    if (filtros.titulo) consulta.set("titulo", filtros.titulo);
    if (filtros.generacionId) consulta.set("generacion", filtros.generacionId);
    return `/dashboard/ideas?${consulta}#banco`;
  }

  return <>
    <p className="text-sm text-muted-foreground">Cuenta activa · @{cuenta.username}</p>
    <section aria-labelledby="generador" className="space-y-4 rounded-lg border p-4">
      <h2 id="generador" className="text-xl font-semibold">Generador</h2>
      {configuracion ? <Generador key={cuenta.id} cuenta={cuenta.id} {...configuracion} /> :
        <p role="alert">Revisa la configuración del proveedor para generar ideas.</p>}
    </section>
    <section id="banco" aria-labelledby="titulo-banco" className="space-y-4">
      <h2 id="titulo-banco" className="text-xl font-semibold">Banco de ideas</h2>
      <Form key={JSON.stringify(filtros)} action="/dashboard/ideas" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">Buscar por título<Input name="titulo" maxLength={160} defaultValue={filtros.titulo} /></label>
        <label className="grid gap-1 text-sm">Estado<select name="estado" className={select} defaultValue={filtros.estado ?? ""}>
          <option value="">Todos</option>
          {Object.entries(estadosVisibles).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Orden<select name="orden" className={select} defaultValue={filtros.orden}>
          <option value="recientes">Más recientes</option><option value="antiguas">Más antiguas</option>
        </select></label>
        {filtros.generacionId && <input type="hidden" name="generacion" value={filtros.generacionId} />}
        <Button type="submit" variant="outline">Aplicar filtros</Button>
      </Form>
      {datos.generacionSolicitada && <Link href="/dashboard/ideas#banco" className="inline-block underline">Ver todas las generaciones</Link>}
      {ideas.length ? <div className="grid items-start gap-4 lg:grid-cols-2">
        {ideas.map((fila) => <TarjetaIdea key={fila.idea.id} fila={fila} cuenta={cuenta.id}
          evaluacion={evaluaciones.get(fila.idea.id)} evaluacionesDisponibles={calificaciones !== null} />)}
      </div> : <p className="text-muted-foreground">{datos.generacionSolicitada ? "No hay ideas disponibles para esta generación y estos filtros."
        : historial.length ? "No hay ideas que coincidan con los filtros." : "Aún no hay ideas guardadas. Usa el generador para empezar."}</p>}
      {(filtros.pagina > 1 || ideas.length === 20) && <nav aria-label="Páginas del banco" className="flex gap-4 text-sm">
        {filtros.pagina > 1 && <Link className="underline" href={enlacePagina(filtros.pagina - 1)}>Anterior</Link>}
        <span>Página {filtros.pagina}</span>
        {ideas.length === 20 && filtros.pagina < 9999 && <Link className="underline" href={enlacePagina(filtros.pagina + 1)}>Siguiente</Link>}
      </nav>}
    </section>
    {calificaciones ? <HistorialEvaluaciones historial={calificaciones[1]} /> :
      <p role="alert">No se pudo cargar la sección de evaluaciones. Comprueba la migración 0012.</p>}
    <section aria-labelledby="historial-ideas" className="space-y-3">
      <h2 id="historial-ideas" className="text-xl font-semibold">Historial de generaciones</h2>
      {historial.length ? <ul className="space-y-2">
        {historial.map((fila) => <li key={fila.id} className="grid gap-1 rounded-lg border p-3 text-sm">
          <p>{fecha(fila.creadaEn)} · {fila.proveedor === "mock" ? "Mock" : "Anthropic"} · {estadosGeneracion[fila.estado]}</p>
          <p className="break-words">{fila.solicitud}</p>
          {fila.error && <p>{erroresVisibles[fila.error]}</p>}
          {fila.costoEstimadoUsd !== null && <p>Costo estimado US$ {fila.costoEstimadoUsd.toFixed(5)}</p>}
          {fila.estado === "completada" && <Link className="underline" href={`/dashboard/ideas?generacion=${fila.id}#banco`}>Ver ideas ({fila.cantidad})</Link>}
        </li>)}
      </ul> : <p className="text-muted-foreground">Aún no hay generaciones en el historial.</p>}
    </section>
  </>;
}

export default function IdeasPage({ searchParams }: { searchParams: Busqueda }) {
  return <section className="space-y-5" aria-labelledby="titulo-ideas">
    <h1 id="titulo-ideas" className="text-3xl font-bold tracking-tight">Ideas de contenido</h1>
    <Suspense fallback={<p role="status">Cargando banco de ideas…</p>}>
      <ContenidoIdeas searchParams={searchParams} />
    </Suspense>
  </section>;
}
