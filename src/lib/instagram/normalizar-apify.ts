import { z } from "zod";
import { usuarioInstagram } from "./usuario.ts";

export { usuarioInstagram };

const tipos = {
  Sidecar: "carrusel",
  Video: "video",
  Image: "imagen",
} as const;

const metrica = z.number().int().nonnegative();
const urlHttps = z.url({ protocol: /^https$/ });
const texto = z.string().refine((valor) => !valor.includes("\0"));
const publicacion = z.object({
  id: z.string().trim().min(1).pipe(texto),
  shortCode: z.string().regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["Sidecar", "Video", "Image"]),
  caption: texto.nullish(),
  hashtags: z.array(texto).nullish(),
  url: urlHttps,
  timestamp: z.iso.datetime({ offset: true })
    .transform((valor) => new Date(valor))
    .refine((fecha) => Number.isFinite(fecha.getTime())),
  displayUrl: urlHttps.transform((url) => new URL(url).href).nullable().catch(null).optional(),
  ownerUsername: usuarioInstagram,
  likesCount: metrica.nullable().catch(null).optional(),
  commentsCount: metrica.nullable().catch(null).optional(),
  videoPlayCount: metrica.nullable().catch(null).optional(),
}).refine(({ url, shortCode }) => {
  const enlace = new URL(url);
  return ["www.instagram.com", "instagram.com"].includes(enlace.host)
    && !enlace.username && !enlace.password
    && ["p", "reel", "tv"].some((seccion) =>
      [`/${seccion}/${shortCode}/`, `/${seccion}/${shortCode}`].includes(enlace.pathname));
}, { path: ["url"] });

export function normalizarApify(dataset: unknown, username: string) {
  const usuario = usuarioInstagram.parse(username);
  const registros = z.array(z.unknown()).parse(dataset);
  const rechazados: { fila: number; motivo: string }[] = [];
  const vistos = new Set<string>();
  const publicaciones = registros.flatMap((registro, indice) => {
    const resultado = publicacion.safeParse(registro);
    const fila = indice + 1;
    if (!resultado.success) {
      const campos = [...new Set(resultado.error.issues.map(({ path }) => path.join(".")))];
      rechazados.push({ fila, motivo: `Campos inválidos: ${campos.join(", ")}` });
      return [];
    }

    const dato = resultado.data;
    if (dato.ownerUsername !== usuario) {
      rechazados.push({ fila, motivo: "El propietario no coincide con la cuenta" });
      return [];
    }
    if (vistos.has(dato.shortCode)) {
      rechazados.push({ fila, motivo: "Shortcode repetido en el dataset" });
      return [];
    }

    vistos.add(dato.shortCode);
    const enlace = new URL(dato.url);
    return [{
      post: {
        instagramId: dato.id,
        shortcode: dato.shortCode,
        tipo: tipos[dato.type],
        caption: dato.caption ?? null,
        hashtags: dato.hashtags ?? [],
        url: enlace.origin + enlace.pathname,
        publicadaEn: dato.timestamp,
        imagenOrigenUrl: dato.displayUrl ?? null,
      },
      metricas: {
        likes: dato.likesCount ?? null,
        comentarios: dato.commentsCount ?? null,
        reproducciones: dato.videoPlayCount ?? null,
      },
    }];
  });
  return { publicaciones, rechazados };
}
