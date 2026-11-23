import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvestigacionVisible } from "./operacion";
import { fechaCaptura } from "../analitica/presentacion";

export function TarjetasTendencias({ tendencias }: { tendencias: InvestigacionVisible["tendencias"] }) {
  return <ul className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
    {tendencias.map((tendencia) => <li key={tendencia.id} className="min-w-0">
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="break-words text-lg">{tendencia.titulo}</CardTitle>
          <p className="text-sm text-zinc-400">Investigada el {fechaCaptura(tendencia.investigadaEn)}</p>
        </CardHeader>
        <CardContent className="space-y-4 break-words text-sm">
          <p>{tendencia.descripcion}</p>
          <dl className="space-y-3">
            <div><dt className="font-semibold">Por qué encaja con la marca</dt><dd className="text-zinc-300">{tendencia.relevanciaMarca}</dd></div>
            <div><dt className="font-semibold">Ejemplo de aplicación</dt><dd className="text-zinc-300">{tendencia.ejemploAplicacion}</dd></div>
            <div><dt className="font-semibold">Público objetivo</dt><dd className="text-zinc-300">{tendencia.publicoObjetivo}</dd></div>
            <div className="grid grid-cols-2 gap-3">
              <div><dt className="font-semibold">Formato</dt><dd className="capitalize text-zinc-300">{tendencia.formato}</dd></div>
              <div><dt className="font-semibold">Relevancia</dt><dd className="capitalize text-zinc-300">{tendencia.relevancia}</dd></div>
            </div>
          </dl>
          <div>
            <p className="font-semibold">Fuentes</p>
            <ul className="mt-1 space-y-1">
              {tendencia.fuentes.map((fuente) => <li key={fuente.url}>
                <a href={fuente.url} target="_blank" rel="noopener noreferrer" className="break-words text-violet-300 underline underline-offset-2">{fuente.titulo}</a>
                {(fuente.sitio || fuente.publicadaEl) && <p className="text-xs text-zinc-400">
                  {[fuente.sitio, fuente.publicadaEl && `Publicada el ${fuente.publicadaEl}`].filter(Boolean).join(" · ")}
                </p>}
              </li>)}
            </ul>
          </div>
        </CardContent>
      </Card>
    </li>)}
  </ul>;
}
