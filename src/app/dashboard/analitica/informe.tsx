import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PUBLICACIONES_POR_PAGINA, type InformeInstagram, type PublicacionAnalitica } from "@/lib/instagram/analitica";
import type { FiltrosAnalitica } from "@/lib/instagram/filtros-analitica";
import { Distribucion, PublicacionesPorMes } from "./graficos";
import { fechaCaptura, fechaPublicacion, formatos, numero, periodo } from "./presentacion";

function Bloque({ titulo, detalle, children }: { titulo: string; detalle?: string; children: ReactNode }) {
  return (
    <Card className="min-w-0 border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
      <CardHeader>
        <h2 className="text-base font-semibold">{titulo}</h2>
        {detalle && <p className="max-w-3xl text-sm text-zinc-400">{detalle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Tabla({ nombre, columnas, children }: { nombre: string; columnas: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md focus-visible:ring-2 focus-visible:ring-violet-400"
      tabIndex={0} role="region" aria-label={nombre}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{nombre}</caption>
        <thead className="border-b border-white/10 text-xs text-zinc-400">
          <tr>{columnas.map((columna) => (
            <th key={columna} scope="col" className="whitespace-nowrap px-3 py-2.5 font-medium">{columna}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-white/10 tabular-nums [&_td]:px-3 [&_td]:py-3">{children}</tbody>
      </table>
    </div>
  );
}

function Publicacion({ post }: { post: PublicacionAnalitica }) {
  const titulo = post.caption?.trim() || post.shortcode;
  return (
    <a className="inline-flex max-w-full items-start gap-1 text-violet-200 underline-offset-4 hover:underline"
      href={post.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir en Instagram: ${titulo}`}>
      <span className="line-clamp-2 break-words">{titulo}</span><ArrowUpRight aria-hidden className="mt-0.5 size-3.5 shrink-0" />
    </a>
  );
}

function multiplicador(valor: number | null) {
  return valor === null ? numero(null) : `${numero(valor)}×`;
}

function urlPagina(filtros: FiltrosAnalitica, pagina: number) {
  const params = new URLSearchParams({ orden: filtros.orden, pagina: String(pagina) });
  if (filtros.formato) params.set("formato", filtros.formato);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  return `/dashboard/analitica?${params}`;
}

export function PanelAnalitica({ informe, filtros }: { informe: InformeInstagram; filtros: FiltrosAnalitica }) {
  const { resumen, formatos: porFormato, meses, ranking, publicaciones, pagina, medianaCuenta } = informe;
  const hayFiltros = filtros.formato || filtros.desde || filtros.hasta;
  if (!resumen.publicaciones) return (
    <Bloque titulo={hayFiltros ? "Sin resultados para estos filtros" : "Aún no hay publicaciones"}>
      <p className="text-sm text-zinc-400">
        {hayFiltros ? "Cambia el formato o las fechas para consultar más publicaciones." : "Cuando esta cuenta tenga publicaciones importadas, aparecerán aquí."}
      </p>
    </Bloque>
  );

  const totalPaginas = Math.ceil(resumen.publicaciones / PUBLICACIONES_POR_PAGINA);
  const indicadores = [
    { titulo: "Publicaciones", valor: resumen.publicaciones, nota: `${numero(resumen.frecuenciaMensual)} por mes en promedio` },
    { titulo: "Likes conocidos", valor: resumen.likes, nota: `Datos en ${numero(resumen.conLikes)} de ${numero(resumen.publicaciones)} publicaciones` },
    { titulo: "Comentarios conocidos", valor: resumen.comentarios, nota: `Datos en ${numero(resumen.conComentarios)} de ${numero(resumen.publicaciones)} publicaciones` },
    { titulo: "Reproducciones conocidas", valor: resumen.reproducciones, nota: `Datos en ${numero(resumen.conReproducciones)} de ${numero(resumen.publicaciones)} publicaciones` },
    { titulo: "Mediana de interacciones", valor: resumen.mediana, nota: `Datos completos en ${numero(resumen.conInteracciones)} de ${numero(resumen.publicaciones)} publicaciones` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {indicadores.map(({ titulo, valor, nota }) => (
          <Card key={titulo} className="gap-2 border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
            <CardHeader><h2 className="text-sm font-medium text-zinc-300">{titulo}</h2></CardHeader>
            <CardContent>
              <p className="break-words text-2xl font-semibold tracking-tight tabular-nums">{numero(valor)}</p>
              <p className="mt-1 text-xs text-zinc-400">{nota}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <dl className="flex flex-wrap gap-x-7 gap-y-2 text-sm">
        <div><dt className="text-zinc-400">Primera publicación</dt><dd>{fechaPublicacion(resumen.primeraPublicacion)}</dd></div>
        <div><dt className="text-zinc-400">Última publicación</dt><dd>{fechaPublicacion(resumen.ultimaPublicacion)}</dd></div>
        <div><dt className="text-zinc-400">Última captura</dt><dd>{fechaCaptura(resumen.ultimaCaptura)}</dd></div>
      </dl>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Bloque titulo="Distribución por formato"><Distribucion datos={porFormato} /></Bloque>
        <Bloque titulo="Publicaciones por mes"
          detalle="Cada publicación se agrupa por su fecha de publicación. Las interacciones corresponden a su última captura disponible.">
          <PublicacionesPorMes datos={meses} />
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-violet-200">Ver datos mensuales</summary>
            <div className="mt-2">
              <Tabla nombre="Datos mensuales" columnas={["Mes", "Publicaciones", "Carruseles", "Videos", "Imágenes", "Mediana", "Con interacciones"]}>
                {meses.map((fila) => (
                  <tr key={fila.mes}>
                    <td className="whitespace-nowrap">{periodo(fila.mes)}</td><td>{numero(fila.publicaciones)}</td>
                    <td>{numero(fila.carrusel)}</td><td>{numero(fila.video)}</td><td>{numero(fila.imagen)}</td>
                    <td>{numero(fila.mediana)}</td><td>{numero(fila.conInteracciones)} / {numero(fila.publicaciones)}</td>
                  </tr>
                ))}
              </Tabla>
            </div>
          </details>
        </Bloque>
      </div>
      <Bloque titulo="Rendimiento por formato"
        detalle="Se calculan interacciones cuando hay likes y comentarios. Las reproducciones se muestran por separado.">
        <Tabla nombre="Comparación de rendimiento por formato"
          columnas={["Formato", "Publicaciones", "Mediana", "Promedio", "Total interacciones", "Cobertura interacciones", "Reproducciones", "Cobertura reproducciones"]}>
          {porFormato.map((fila) => (
            <tr key={fila.tipo}>
              <td className="whitespace-nowrap">{formatos[fila.tipo].nombre}</td><td>{numero(fila.publicaciones)}</td>
              <td>{numero(fila.mediana)}</td><td>{numero(fila.promedio)}</td><td>{numero(fila.totalInteracciones)}</td>
              <td>{numero(fila.conInteracciones)} / {numero(fila.publicaciones)}</td><td>{numero(fila.reproducciones)}</td>
              <td>{numero(fila.conReproducciones)} / {numero(fila.publicaciones)}</td>
            </tr>
          ))}
        </Tabla>
      </Bloque>
      <Bloque titulo="Mejores publicaciones" detalle={`Mediana de toda la cuenta: ${numero(medianaCuenta)} interacciones. Es la referencia del múltiplo.`}>
        {ranking.length ? (
          <Tabla nombre="Ranking por interacciones" columnas={["Publicación", "Formato", "Interacciones", "Frente a la mediana"]}>
            {ranking.map((post) => (
              <tr key={post.id}>
                <td className="min-w-52 max-w-md"><Publicacion post={post} /></td>
                <td className="whitespace-nowrap">{formatos[post.tipo].nombre}</td>
                <td>{numero(post.interacciones)}</td><td>{multiplicador(post.multiplo)}</td>
              </tr>
            ))}
          </Tabla>
        ) : <p className="text-sm text-zinc-400">No hay publicaciones con likes y comentarios disponibles en la selección.</p>}
      </Bloque>
      <Bloque titulo="Publicaciones">
        <Tabla nombre="Publicaciones filtradas"
          columnas={["Publicación", "Formato", "Fecha", "Likes", "Comentarios", "Reproducciones", "Interacciones", "Múltiplo", "Última captura"]}>
          {publicaciones.map((post) => (
            <tr key={post.id}>
              <td className="min-w-52 max-w-xs"><Publicacion post={post} /></td>
              <td className="whitespace-nowrap">{formatos[post.tipo].nombre}</td>
              <td className="whitespace-nowrap">{fechaPublicacion(post.publicadaEn)}</td>
              <td className="whitespace-nowrap">{numero(post.likes)}</td><td className="whitespace-nowrap">{numero(post.comentarios)}</td>
              <td className="whitespace-nowrap">{numero(post.reproducciones)}</td><td className="whitespace-nowrap">{numero(post.interacciones)}</td>
              <td className="whitespace-nowrap">{multiplicador(post.multiplo)}</td>
              <td className="whitespace-nowrap">{fechaCaptura(post.capturadaEn)}</td>
            </tr>
          ))}
        </Tabla>
        {totalPaginas > 1 && (
          <nav aria-label="Páginas de publicaciones" className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm">
            <span className="mr-auto text-zinc-400">Página {numero(pagina)} de {numero(totalPaginas)}</span>
            {pagina > 1 && <Button asChild variant="outline"><Link href={urlPagina(filtros, pagina - 1)}>Anterior</Link></Button>}
            {pagina < totalPaginas && <Button asChild variant="outline"><Link href={urlPagina(filtros, pagina + 1)}>Siguiente</Link></Button>}
          </nav>
        )}
      </Bloque>
    </div>
  );
}
