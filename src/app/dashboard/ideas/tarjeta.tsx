import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { crearRepositorioIdeas } from "@/lib/ideas/repositorio";
import { fuenteTendencia } from "@/lib/tendencias/contrato";
import { ControlesIdea } from "./formularios";
import { camposIdea, estadosVisibles } from "./operacion";
import { EvaluacionForm, type Evaluacion } from "./evaluacion-form";

type Fila = Awaited<ReturnType<ReturnType<typeof crearRepositorioIdeas>["listarConEvidencias"]>>[number];
const evidenciaVisible = z.object({
  titulo: z.string().optional(), usuario: z.string().optional(), caption: z.string().nullable().optional(),
  capturadaEn: z.string().nullable().optional(), publicadaEn: z.string().nullable().optional(),
  investigadaEn: z.string().optional(),
  likes: z.number().nullish(), comentarios: z.number().nullish(), reproducciones: z.number().nullish(),
  contexto: z.object({ muestra: z.number().optional(), desdeDias: z.number().optional(), hastaDias: z.number().optional(),
    limitaciones: z.array(z.string()) }).optional(),
});
const nombres = { publicacion_propia: "Publicación propia", publicacion_competidor: "Publicación competidora",
  tendencia: "Tendencia", perfil: "Perfil de marca", enriquecimiento: "Enriquecimiento semántico" };

export function fecha(valor: Date | string) {
  const instante = new Date(valor);
  return Number.isFinite(instante.getTime())
    ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(instante)
    : "Fecha desconocida";
}

function Fuente({ url, titulo }: { url: unknown; titulo: string }) {
  const segura = fuenteTendencia.shape.url.safeParse(url).data;
  return segura ? <a href={segura} target="_blank" rel="noopener noreferrer" className="break-words underline">{titulo}</a> : null;
}

function Evidencia({ evidencia }: { evidencia: Fila["evidencias"][number] }) {
  const datos = evidenciaVisible.safeParse(evidencia.datos).data;
  const publicacion = evidencia.tipo === "publicacion_propia" || evidencia.tipo === "publicacion_competidor";
  const fuentes = z.object({ fuentes: z.array(z.object({ titulo: z.string(), url: fuenteTendencia.shape.url })) })
    .safeParse(evidencia.datos).data?.fuentes ?? [];
  return <li className="space-y-1 rounded-md border p-3 text-sm">
    <p className="font-medium">{nombres[evidencia.tipo]}{datos?.usuario && ` · @${datos.usuario}`}{datos?.titulo && ` · ${datos.titulo}`}</p>
    <p>{evidencia.relevancia}</p>
    {datos?.caption && <p className="break-words text-muted-foreground">{datos.caption}</p>}
    {publicacion && <p>Me gusta {datos?.likes ?? "sin dato"} · Comentarios {datos?.comentarios ?? "sin dato"} · Reproducciones {datos?.reproducciones ?? "sin dato"}</p>}
    {publicacion && <p>{datos?.contexto?.muestra === undefined ? "Tamaño de muestra no registrado" : `Tamaño de muestra ${datos.contexto.muestra}`}</p>}
    {datos?.contexto?.desdeDias !== undefined && datos.contexto.hastaDias !== undefined && <p>Ventana de observación de {datos.contexto.desdeDias} a {datos.contexto.hastaDias} días</p>}
    {datos?.capturadaEn && <p>Captura del {fecha(datos.capturadaEn)}</p>}
    {datos?.publicadaEn && <p>Publicada el {fecha(datos.publicadaEn)}</p>}
    {datos?.investigadaEn && <p>Investigada el {fecha(datos.investigadaEn)}</p>}
    <p className="text-muted-foreground">Evidencia consultada el {fecha(evidencia.consultadaEn)}</p>
    {datos?.contexto?.limitaciones.map((texto, i) => <p key={i} className="text-muted-foreground">{texto}</p>)}
    {fuentes.length > 0 ? <ul className="list-disc space-y-1 pl-5">{fuentes.map((fuente, i) =>
      <li key={i}><Fuente url={fuente.url} titulo={fuente.titulo} /></li>)}</ul> :
      <Fuente url={evidencia.url} titulo={evidencia.tipo === "tendencia" ? "Fuente original" : "Abrir publicación original"} />}
  </li>;
}

export function TarjetaIdea({ fila, cuenta, evaluacion, evaluacionesDisponibles }: {
  fila: Fila; cuenta: string; evaluacion?: Evaluacion; evaluacionesDisponibles: boolean;
}) {
  const { idea, proveedor, evidencias, costoEstimadoUsd } = fila;
  return <Card className="min-w-0 break-words">
    <CardHeader>
      <CardTitle>{idea.titulo}</CardTitle>
      <p className="text-sm text-muted-foreground">{proveedor === "mock" ? "Idea simulada (mock)" : "Generada con Anthropic"} · {estadosVisibles[idea.estado]} · {fecha(idea.generadaEn)}</p>
      {costoEstimadoUsd !== null && <p className="text-sm text-muted-foreground">Costo estimado de la generación US$ {costoEstimadoUsd.toFixed(5)}</p>}
    </CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid gap-3">
        <div><dt className="font-medium">Formato</dt><dd className="capitalize">{idea.formato}</dd></div>
        {camposIdea.filter(([campo]) => campo !== "titulo").map(([campo, etiqueta]) =>
          <div key={campo}><dt className="font-medium">{etiqueta}</dt><dd className="whitespace-pre-line text-sm">{idea[campo]}</dd></div>)}
      </dl>
      {idea.advertencias.length > 0 && <div className="text-sm"><p className="font-medium">Advertencias</p>
        <ul className="list-disc pl-5">{idea.advertencias.map((nota, i) => <li key={i}>{nota}</li>)}</ul></div>}
      <details className="space-y-3">
        <summary className="cursor-pointer font-medium">¿Por qué recomendamos esta idea?</summary>
        {evidencias.length ? <ul className="space-y-2">{evidencias.map((evidencia) => <Evidencia key={evidencia.id} evidencia={evidencia} />)}</ul> :
          <p className="text-sm text-muted-foreground">Esta idea no tiene evidencias registradas.</p>}
      </details>
      <ControlesIdea cuenta={cuenta} idea={idea} />
      {evaluacion && <p className="text-sm text-muted-foreground">Evaluada el {fecha(evaluacion.evaluadaEn)}</p>}
      {evaluacionesDisponibles && <EvaluacionForm cuenta={cuenta} ideaId={idea.id} revisionIdea={idea.revision}
        evaluacion={evaluacion} motivoRequerido={idea.estado === "aprobada" || idea.estado === "descartada"} />}
    </CardContent>
  </Card>;
}
