import Link from "next/link";
import Form from "next/form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { consultarComparacionCompetitiva, DESTACADAS_POR_PAGINA, type InformeComparacion } from "@/lib/competencia/comparacion";
import { filtrosAnalitica } from "@/lib/instagram/filtros-analitica";
import { fechaCaptura, fechaPublicacion, formatos, numero } from "../analitica/presentacion";
import { GraficosComparacion } from "./graficos-comparacion";

function GraficoRendimiento({ cuentas }: {
  cuentas: Pick<InformeComparacion["cuentas"][number], "id" | "nombre" | "mediana" | "conInteracciones" | "publicaciones">[];
}) {
  const escala = Math.max(1, ...cuentas.map(({ mediana }) => mediana ?? 0));

  return <section className="space-y-3 rounded-lg border p-4" aria-labelledby="rendimiento-comparacion">
    <h3 id="rendimiento-comparacion" className="font-semibold">Rendimiento por cuenta</h3>
    <p className="text-sm text-muted-foreground">Mediana de interacciones por publicación en el intervalo seleccionado.</p>
    <ul className="space-y-3">
      {cuentas.map(({ id, nombre, mediana, conInteracciones, publicaciones }) => <li key={id}
        className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
        <span className="break-words text-sm font-medium">{nombre}</span>
        <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-muted">
          {mediana !== null && <div className="h-full rounded-full bg-violet-400"
            style={{ width: `${(mediana / escala) * 100}%` }} />}
        </div>
        <div className="text-sm sm:text-right">
          <strong>{numero(mediana)}</strong>
          <span className="ml-2 text-muted-foreground">{conInteracciones}/{publicaciones} con datos</span>
        </div>
      </li>)}
    </ul>
  </section>;
}

const comparar = "/dashboard/competencia";
type Parametros = Record<string, string | string[] | undefined>;
type Rival = { id: string; username: string; activo: boolean };

export async function Comparacion({ cuentaId, registros, parametros }: {
  cuentaId: string; registros: Rival[]; parametros: Parametros;
}) {
  const solicitados = parametros.rival ?? [];
  const rivales = parametros.seleccion === "manual"
    ? [...new Set(typeof solicitados === "string" ? [solicitados] : solicitados)]
    : registros.filter((rival) => rival.activo).slice(0, 5).map((rival) => rival.id);
  const seleccionValida = z.array(z.uuid()).max(5).safeParse(rivales).success
    && rivales.every((id) => registros.some((rival) => rival.id === id));
  const filtros = filtrosAnalitica.safeParse({ desde: parametros.desde, hasta: parametros.hasta, pagina: parametros.pagina });
  const informe = seleccionValida && filtros.success
    ? await consultarComparacionCompetitiva(db, cuentaId, { ...filtros.data, rivales }).catch(() => null)
    : null;

  function enlacePagina(pagina: number) {
    const consulta = new URLSearchParams({ vista: "comparar", seleccion: "manual", pagina: String(pagina) });
    if (filtros.success) {
      if (filtros.data.desde) consulta.set("desde", filtros.data.desde);
      if (filtros.data.hasta) consulta.set("hasta", filtros.data.hasta);
    }
    for (const id of rivales) consulta.append("rival", id);
    return `${comparar}?${consulta}`;
  }

  const nombres = new Map(informe?.cuentas.map((cuenta) => [cuenta.id, cuenta.nombre]));
  const paginas = Math.max(1, Math.ceil((informe?.totalDestacadas ?? 0) / DESTACADAS_POR_PAGINA));
  return <section className="space-y-5" aria-labelledby="titulo-comparacion">
    <Link href={comparar} className="text-sm text-violet-200 hover:underline">Volver a competidores</Link>
    <h2 id="titulo-comparacion" className="text-2xl font-semibold">Comparación competitiva</h2>
    <p role="note" className="rounded-md border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-100">
      Las métricas mostradas son públicas, pueden estar incompletas y no necesariamente coinciden con las estadísticas internas de Instagram
    </p>
    <Form action={comparar} key={JSON.stringify(parametros)} className="space-y-3 rounded-lg border p-4">
      <input type="hidden" name="vista" value="comparar" />
      <input type="hidden" name="seleccion" value="manual" />
      <fieldset>
        <legend className="font-medium">Competidores (hasta cinco)</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {registros.map((rival) => <label key={rival.id} className="flex items-center gap-2 text-sm">
            <input name="rival" type="checkbox" value={rival.id} defaultChecked={rivales.includes(rival.id)} />
            @{rival.username}{!rival.activo && " (inactivo)"}
          </label>)}
          {!registros.length && <p className="text-sm text-muted-foreground">Todavía no hay competidores registrados.</p>}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">Desde<Input name="desde" type="date" defaultValue={typeof parametros.desde === "string" ? parametros.desde : ""} /></label>
        <label className="space-y-1 text-sm">Hasta<Input name="hasta" type="date" defaultValue={typeof parametros.hasta === "string" ? parametros.hasta : ""} /></label>
        <Button type="submit">Aplicar filtros</Button>
      </div>
    </Form>
    {!seleccionValida && <p role="alert">Selecciona hasta cinco competidores registrados en la cuenta activa.</p>}
    {!filtros.success && <p role="alert">Revisa el intervalo de fechas y la página solicitada.</p>}
    {seleccionValida && filtros.success && !informe && <p role="alert">No se pudo consultar la comparación. Recarga para reintentar.</p>}
    {informe && <>
      <p className="text-sm text-muted-foreground">
        {informe.desde && informe.hasta ? `${informe.desde} a ${informe.hasta} · ${informe.meses} meses calendario incluidos · hora de Bogotá` : "Sin publicaciones en el intervalo seleccionado."}
        {" "}Las interacciones suman Me gusta y comentarios cuando ambos están disponibles.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {informe.cuentas.map((cuenta) => <Card key={cuenta.id}>
          <CardHeader><CardTitle>{cuenta.nombre}{cuenta.propia && " (propia)"}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{numero(cuenta.publicaciones)} publicaciones · {numero(cuenta.ritmo)} por mes</p>
            <p>Última publicación · {fechaPublicacion(cuenta.ultimaPublicacion)}</p>
            <p>Última captura · {fechaCaptura(cuenta.ultimaCaptura)}</p>
            <p>Mediana de interacciones · <strong>{numero(cuenta.mediana)}</strong></p>
            <p>Promedio de interacciones · {numero(cuenta.promedio)}</p>
            <p>Cobertura de interacciones · {cuenta.conInteracciones}/{cuenta.publicaciones}</p>
            <p>Me gusta · {cuenta.conLikes}/{cuenta.publicaciones} · Comentarios · {cuenta.conComentarios}/{cuenta.publicaciones}</p>
            <p>Reproducciones conocidas · {numero(cuenta.reproducciones)}</p>
            <p>Mediana de reproducciones por video · {numero(cuenta.medianaReproducciones)}</p>
            <p>Videos con dato de reproducciones · {cuenta.videosConReproducciones}/{cuenta.videos}</p>
          </CardContent>
        </Card>)}
      </div>
      <GraficoRendimiento cuentas={informe.cuentas} />
      <GraficosComparacion cuentas={informe.cuentas.map(({ id, nombre }) => ({ id, nombre }))} actividad={informe.actividad}
        formatos={informe.formatos.map(({ cuentaId, tipo, publicaciones }) => ({ cuentaId, tipo, publicaciones }))} />
      <h3 className="text-lg font-semibold">Rendimiento por formato</h3>
      {informe.formatos.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_td]:p-2 [&_th]:p-2">
        <thead><tr><th>Cuenta</th><th>Formato</th><th>Publicaciones</th><th>Cobertura</th><th>Mediana</th><th>Promedio</th></tr></thead>
        <tbody>{informe.formatos.map((fila) => <tr key={`${fila.cuentaId}-${fila.tipo}`} className="border-t">
          <td>{nombres.get(fila.cuentaId)}</td><td>{formatos[fila.tipo].nombre}</td><td>{fila.publicaciones}</td>
          <td>{fila.conInteracciones}/{fila.publicaciones}</td><td>{numero(fila.mediana)}</td><td>{numero(fila.promedio)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="text-sm text-muted-foreground">No hay formatos para este intervalo.</p>}
      <h3 className="text-lg font-semibold">Publicaciones destacadas por interacciones</h3>
      {informe.destacadas.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_td]:p-2 [&_th]:p-2">
        <thead><tr><th>Publicación</th><th>Cuenta</th><th>Formato</th><th>Fecha</th><th>Interacciones</th><th>Última captura</th></tr></thead>
        <tbody>{informe.destacadas.map((fila) => <tr key={`${fila.cuentaId}-${fila.id}`} className="border-t">
          <td><a href={`https://www.instagram.com/p/${encodeURIComponent(fila.shortcode)}/`} target="_blank" rel="noreferrer" className="text-violet-200 underline">{fila.shortcode}</a></td>
          <td>{nombres.get(fila.cuentaId)}</td><td>{formatos[fila.tipo].nombre}</td><td>{fechaPublicacion(fila.publicadaEn)}</td>
          <td>{numero(fila.interacciones)}</td><td>{fechaCaptura(fila.capturadaEn)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="text-sm text-muted-foreground">No hay publicaciones con ambas métricas de interacción disponibles.</p>}
      {paginas > 1 && <nav aria-label="Páginas de publicaciones destacadas" className="flex flex-wrap gap-4 text-sm">
        {informe.pagina > 1 && <Link href={enlacePagina(informe.pagina - 1)} className="underline">Anterior</Link>}
        <span>Página {informe.pagina} de {paginas} · {informe.totalDestacadas} publicaciones</span>
        {informe.pagina < paginas && <Link href={enlacePagina(informe.pagina + 1)} className="underline">Siguiente</Link>}
      </nav>}
    </>}
  </section>;
}
