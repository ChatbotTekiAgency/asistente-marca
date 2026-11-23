import "server-only";

import { db } from "@/db";
import { conBaseTransaccional } from "@/db/transacciones";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { crearRepositorioIdeas } from "./repositorio";
import { construirContextoIdeas } from "./contexto";
import { origenImagenEnriquecimiento } from "@/lib/enriquecimiento/configuracion";
import { configurarIdeas } from "./proveedor-ideas";
import { crearGeneradorIdeas } from "./generador";
import { crearReservasIdeas } from "./reservas";
import { crearRepositorioEvaluaciones } from "./evaluaciones";
import { solicitarIdeas } from "./solicitud";

export async function contextoIdeasDeCuentaActiva(intervalo?: unknown) {
  const cuenta = await getCuentaActiva();
  if (!cuenta) return null;
  return contextoIdeasDeCuenta(cuenta.id, intervalo);
}

function contextoIdeasDeCuenta(cuentaId: string, intervalo?: unknown) {
  const variables = process.env;
  return construirContextoIdeas(db, cuentaId, intervalo, {
    origenImagen: origenImagenEnriquecimiento.safeParse(variables.ENRICHMENT_IMAGE_ORIGIN).data,
    limites: Object.fromEntries(Object.entries({
      propias: variables.IDEAS_CONTEXT_MAX_OWN, competidoras: variables.IDEAS_CONTEXT_MAX_COMPETITORS,
      tendencias: variables.IDEAS_CONTEXT_MAX_TRENDS, caption: variables.IDEAS_CONTEXT_MAX_CAPTION,
      bytes: variables.IDEAS_CONTEXT_MAX_BYTES,
    }).filter(([, valor]) => valor !== undefined).map(([campo, valor]) => [campo, Number(valor)])),
  });
}

export async function generarIdeasDeCuentaActiva(entrada: unknown, cuentaEsperada?: string) {
  const cuenta = await getCuentaActiva();
  if (!cuenta || (cuentaEsperada !== undefined && cuenta.id !== cuentaEsperada)) return { estado: "sin_cuenta" as const };
  const { motor, limiteDiario, maxPorSolicitud } = configurarIdeas(process.env);
  const solicitud = solicitarIdeas.parse(entrada);
  if (solicitud.cantidad > maxPorSolicitud) return { estado: "limite_cantidad" as const, maxPorSolicitud };
  return crearGeneradorIdeas({
    reservar: (...args) => conBaseTransaccional((tx) => crearReservasIdeas(tx, cuenta.id).reservar(...args)),
    finalizar: (...args) => conBaseTransaccional((tx) => crearReservasIdeas(tx, cuenta.id).finalizar(...args)),
  }, motor, limiteDiario, (intervalo) => contextoIdeasDeCuenta(cuenta.id, intervalo),
  crearRepositorioEvaluaciones(db, cuenta.id).preferenciasEditoriales)(solicitud);
}

export async function bancoIdeasDeCuentaActiva() {
  const cuenta = await getCuentaActiva();
  if (!cuenta) return null;
  return {
    ...crearRepositorioIdeas(db, cuenta.id),
    guardarGeneracion: (entrada: unknown) => conBaseTransaccional((tx) =>
      crearRepositorioIdeas(tx, cuenta.id).guardarGeneracion(entrada)),
  };
}
