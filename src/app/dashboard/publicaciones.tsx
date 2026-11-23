import { and, desc, eq, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { db } from "@/db";
import { metricasPost, posts } from "@/db/schema";
import { getCuentaActiva } from "@/lib/accounts/active-account";

const tipos = { carrusel: "Carrusel", video: "Video", imagen: "Imagen" };
const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });
const formatoNumero = new Intl.NumberFormat("es-CO");

export async function Publicaciones() {
  const cuenta = await getCuentaActiva();
  if (!cuenta) return <p className="text-zinc-400">Selecciona una cuenta para ver sus publicaciones.</p>;

  const ultimaMetrica = db.select({ id: metricasPost.id }).from(metricasPost)
    .where(eq(metricasPost.postId, posts.id))
    .orderBy(desc(metricasPost.capturadaEn), desc(metricasPost.id)).limit(1);

  const publicaciones = await db.select({
    id: posts.id,
    tipo: posts.tipo,
    fecha: posts.publicadaEn,
    caption: posts.caption,
    url: posts.url,
    likes: metricasPost.likes,
    comentarios: metricasPost.comentarios,
    reproducciones: metricasPost.reproducciones,
  }).from(posts)
    .leftJoin(metricasPost, and(eq(metricasPost.postId, posts.id), eq(metricasPost.id, sql`(${ultimaMetrica})`)))
    .where(eq(posts.cuentaId, cuenta.id))
    .orderBy(desc(posts.publicadaEn), desc(posts.id));

  return (
    <>
      <p className="text-sm text-zinc-400">Cuenta activa · @{cuenta.username}</p>
      {publicaciones.length === 0 && (
        <p className="text-zinc-400">Esta cuenta aún no tiene publicaciones importadas.</p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {publicaciones.map((post) => (
          <li key={post.id}>
            <Card className="h-full border border-white/10 bg-zinc-900 text-white">
              <CardHeader>
                <h3 className="font-semibold">{tipos[post.tipo]}</h3>
                <time className="text-zinc-400" dateTime={post.fecha.toISOString()}>
                  {formatoFecha.format(post.fecha)}
                </time>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="line-clamp-3 break-words text-zinc-300">{post.caption?.trim() || "Sin descripción"}</p>
                <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-2">
                  <div><dt className="text-zinc-400">Likes</dt><dd>{post.likes === null ? "—" : formatoNumero.format(post.likes)}</dd></div>
                  <div><dt className="text-zinc-400">Comentarios</dt><dd>{post.comentarios === null ? "—" : formatoNumero.format(post.comentarios)}</dd></div>
                  {post.reproducciones !== null && (
                    <div><dt className="text-zinc-400">Reproducciones</dt><dd>{formatoNumero.format(post.reproducciones)}</dd></div>
                  )}
                </dl>
                <a className="w-fit text-violet-300 underline underline-offset-4 hover:text-violet-200"
                  href={post.url} target="_blank" rel="noopener noreferrer">
                  Ver en Instagram
                </a>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
