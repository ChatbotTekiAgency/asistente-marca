import { db } from "@/db";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { obtenerContextoMarca } from "@/lib/marca/servidor";
import { solicitudSchema, type Evento, type FilaPlan } from "@/lib/enriquecimiento/contrato";
import { configurarEnriquecimiento } from "@/lib/enriquecimiento/proveedor";
import { diagnosticoConfiguracion } from "@/lib/enriquecimiento/configuracion";
import { crearRepositorioEnriquecimiento } from "@/lib/enriquecimiento/repositorio";
import { generarVistaPrevia, identidadDePost } from "@/lib/enriquecimiento/plan";
import { ejecutarLote, identificarImagen, prepararContenido } from "@/lib/enriquecimiento/motor";

export const maxDuration = 180;

export async function POST(request: Request) {
  const error = (mensaje: string, status: number) => Response.json({ error: mensaje }, { status });
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta) return error("Inicia sesión y selecciona una cuenta.", 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return error("Formato inválido.", 400);
    if (Number(request.headers.get("content-length")) > 4096) return error("Selección demasiado grande.", 413);
    const cuerpo = await request.text();
    if (cuerpo.length > 4096) return error("Selección demasiado grande.", 413);
    const datos = solicitudSchema.safeParse(await Promise.resolve().then(() => JSON.parse(cuerpo)).catch(() => null));
    if (!datos.success) return error("Selecciona un lote válido y confirma antes de ejecutarlo.", 400);
    const { ids, modalidad } = datos.data;
    let config;
    try { config = configurarEnriquecimiento(); } catch (fallo) {
      return error(diagnosticoConfiguracion(fallo), 503);
    }
    if (ids.length > config.maxPublicaciones) return error(`El lote admite hasta ${config.maxPublicaciones} publicaciones.`, 400);
    const repo = crearRepositorioEnriquecimiento(db, cuenta.id);
    const filas = await repo.seleccion(ids);
    if (filas.length !== ids.length) return error("La selección contiene publicaciones no disponibles.", 404);
    const marca = await obtenerContextoMarca(cuenta.id);
    const items = filas.sort((a, b) => a.id.localeCompare(b.id)).map((post) => {
      const imagen = modalidad === "visual" ? identificarImagen(post.imagen, config.origen) : null;
      const entrada = prepararContenido(post, marca, imagen);
      return { id: post.id, shortcode: post.shortcode, entrada,
        identidad: identidadDePost(post.id, entrada, modalidad, config.proveedor, config.modelo) };
    });
    const estados = await repo.estados(items.map(({ identidad }) => identidad));
    const plan = items.map((fila) => {
      const estado = estados.find(({ postId }) => postId === fila.id);
      const etiqueta: FilaPlan["estado"] = modalidad === "visual" && !fila.entrada.imagen ? "sin_imagen"
        : estado?.estado === "completado" ? "duplicada"
          : estado?.estado === "en_curso" && estado.ocupado ? "ocupada" : "lista";
      return { ...fila, estado: etiqueta };
    });
    const previa = generarVistaPrevia(plan.map(({ id, shortcode, estado, identidad }) => ({ id, shortcode, estado, identidad })), config);
    if (datos.data.accion === "previsualizar") return Response.json(previa);
    if (previa.huella !== datos.data.huella || !previa.permitido) {
      return error("La selección o su presupuesto cambió. Revisa una nueva vista previa.", 409);
    }
    const ejecutables = plan.filter(({ estado }) => estado === "lista");
    const identidades = new Map(ejecutables.map(({ id, identidad }) => [id, identidad]));
    const abortar = new AbortController();
    const signal = AbortSignal.any([request.signal, abortar.signal]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emitir = (evento: Evento | { estado: "fin" }) => {
          if (!abortar.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(evento) + "\n"));
        };
        await ejecutarLote(ejecutables, modalidad, config.clasificar, {
          reclamar: (id) => repo.reclamar(identidades.get(id)!),
          terminar: repo.terminar,
          emitir,
        }, signal);
        if (!abortar.signal.aborted) {
          emitir({ estado: "fin" });
          controller.close();
        }
      },
      cancel() { abortar.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  } catch {
    return error("No se pudo preparar el lote. Comprueba la migración y la configuración.", 500);
  }
}
