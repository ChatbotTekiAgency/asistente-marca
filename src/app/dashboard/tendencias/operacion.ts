import { DrizzleQueryError } from "drizzle-orm";
import { z } from "zod";
import { claveInvestigacion, confirmacionTendencias, criteriosTendencias, type RespuestaTendencias } from "../../../lib/tendencias/contrato.ts";
import type { RepositorioTendencias } from "../../../lib/tendencias/repositorio.ts";
import type { crearServicioTendencias, EstimacionTendencias } from "../../../lib/tendencias/servicio.ts";

const operacion = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("consultar"), datos: criteriosTendencias }),
  z.strictObject({ tipo: z.literal("confirmar"), datos: confirmacionTendencias }),
  z.strictObject({ tipo: z.literal("estado"), id: claveInvestigacion }),
]);

export type OperacionTendencias = z.input<typeof operacion>;
type Servicio = ReturnType<typeof crearServicioTendencias>;
type Solicitud = Awaited<ReturnType<RepositorioTendencias["historial"]>>[number];

export function mostrarSolicitud(solicitud: Solicitud) {
  return {
    id: solicitud.id, tema: solicitud.tema, mercado: solicitud.mercado, estado: solicitud.estado,
    proveedor: solicitud.proveedor, error: solicitud.error, creadaEn: solicitud.creadaEn.toISOString(),
    finalizadaEn: solicitud.finalizadaEn?.toISOString() ?? null,
    expiraCacheEn: solicitud.expiraCacheEn?.toISOString() ?? null, cacheVencida: solicitud.cacheVencida,
    costoEstimadoUsd: solicitud.costoEstimadoUsd,
  };
}

export type SolicitudVisible = ReturnType<typeof mostrarSolicitud>;
export type InvestigacionVisible = SolicitudVisible & { tendencias: RespuestaTendencias["tendencias"] };

export function mostrarInvestigacion(investigacion: NonNullable<Awaited<ReturnType<RepositorioTendencias["obtener"]>>>): InvestigacionVisible {
  return { ...mostrarSolicitud({ ...investigacion.solicitud, cacheVencida: investigacion.cacheVencida }),
    tendencias: investigacion.resultado?.tendencias ?? [] };
}

export type ResultadoOperacion =
  | { tipo: "investigacion"; investigacion: InvestigacionVisible; mensaje?: string }
  | { tipo: "confirmacion"; huella: string; estimacion: EstimacionTendencias }
  | { tipo: "error"; mensaje: string };

const mensajesDiagnostico = {
  sin_evidencia: "Las fuentes recuperadas fueron insuficientes para respaldar cuatro tendencias.",
  respuesta_invalida: "La investigación no produjo cuatro tendencias completas con fuentes suficientes.",
  presupuesto: "La investigación superó el presupuesto estimado.",
  cuota: "El proveedor alcanzó su cuota de uso. Intenta más tarde.",
  acceso: "El proveedor no está disponible para esta configuración.",
  busqueda: "El proveedor no pudo completar la búsqueda web.",
  tiempo: "La investigación superó el tiempo disponible.",
  proveedor: "El proveedor no pudo completar la investigación.",
};

export function mensajeLecturaTendencias(error: unknown) {
  const causa = error instanceof DrizzleQueryError ? error.cause : error;
  if (causa && typeof causa === "object" && "code" in causa && (causa.code === "42P01" || causa.code === "42703")) {
    return "El historial de tendencias aún no está disponible. Verifica las migraciones 0008 y 0009 en la base conectada.";
  }
  return "No se pudieron cargar las tendencias. Intenta de nuevo.";
}

export async function operarTendencias(entrada: unknown, resolver: () => Promise<Servicio | null>): Promise<ResultadoOperacion> {
  const validada = operacion.safeParse(entrada);
  if (!validada.success) return { tipo: "error", mensaje: "Revisa el tema, el mercado y la confirmación." };
  const servicio = await resolver();
  if (!servicio) return { tipo: "error", mensaje: "Verifica tu sesión y vuelve a seleccionar la cuenta activa." };

  const { data } = validada;
  if (data.tipo === "estado") {
    const investigacion = await servicio.obtener(data.id);
    return investigacion
      ? { tipo: "investigacion", investigacion: mostrarInvestigacion(investigacion) }
      : { tipo: "error", mensaje: "La investigación no está disponible para la cuenta activa." };
  }

  const resultado = data.tipo === "consultar" ? await servicio.consultar(data.datos) : await servicio.investigar(data.datos);
  if (resultado.estado === "requiere_confirmacion") return {
    tipo: "confirmacion", huella: resultado.huella, estimacion: resultado.estimacion,
  };
  if (resultado.estado === "fuera_presupuesto") return { tipo: "error", mensaje: "Presupuesto insuficiente para iniciar una investigación." };
  if (resultado.estado === "cuota") return { tipo: "error", mensaje: "Se agotó la cuota diaria de investigaciones de esta cuenta." };
  if (resultado.estado === "conflicto") return { tipo: "error", mensaje: "La solicitud corresponde a otros criterios. Vuelve a consultar la caché." };
  if ("investigacion" in resultado && resultado.investigacion) return {
    tipo: "investigacion", investigacion: mostrarInvestigacion(resultado.investigacion),
    ...("diagnostico" in resultado && resultado.diagnostico ? { mensaje: mensajesDiagnostico[resultado.diagnostico] } : {}),
  };
  return { tipo: "error", mensaje: "No se pudo recuperar la investigación." };
}
