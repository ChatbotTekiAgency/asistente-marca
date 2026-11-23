import { createHash } from "node:crypto";
import { usoTendencias } from "../tendencias/contrato.ts";
import type { ReferenciaIdea } from "./contrato.ts";
import type { ContextoIdeas } from "./contexto-contrato.ts";
import { ErrorGeneradorIdeas, type MotorIdeas, type UsoIdeas } from "./proveedor-ideas.ts";
import { claveReferenciaIdea, ErrorEvidenciaIdea, type DetallesEvidenciasIdeas } from "./repositorio.ts";
import type { crearRepositorioEvaluaciones } from "./evaluaciones.ts";
import { PLAZO_IDEAS_MS, type crearReservasIdeas } from "./reservas.ts";
import { salidaIdeas, solicitarIdeas, type SalidaIdeas } from "./solicitud.ts";

function catalogo(contexto: ContextoIdeas) {
  const referencias = new Map<string, Omit<ReferenciaIdea, "relevancia"> & { campo?: string }>();
  function registrar(fila: { id: string; tipo: ReferenciaIdea["tipo"]; campo?: string }) {
    const codigo = `E${referencias.size + 1}`;
    referencias.set(codigo, fila);
    return codigo;
  }
  const marca = contexto.marca.map(({ id, tipo, campo, dato }) => ({ codigo: registrar({ id, tipo, campo }), campo, dato }));
  const propias = contexto.propias.map(({ id, tipo, semantica, url, ...datos }) => ({
    codigo: registrar({ id, tipo }), ...datos,
    permiteEnlace: url !== null,
    ...(semantica && { semantica: {
      codigo: registrar({ id: semantica.id, tipo: semantica.tipo }),
      tema: semantica.tema, intencion: semantica.intencion, gancho: semantica.gancho,
    } }),
  }));
  const competidoras = contexto.competidoras.map(({ id, tipo, url, ...datos }) => ({
    codigo: registrar({ id, tipo }), ...datos, permiteEnlace: url !== null,
  }));
  const tendencias = contexto.tendencias.map(({ id, tipo, fuentes, ...datos }) => ({
    codigo: registrar({ id, tipo }), ...datos, fuentes: fuentes.map(({ titulo, sitio, publicadaEl }) => ({ titulo, sitio, publicadaEl })),
  }));
  return {
    referencias, datos: {
      intervalo: contexto.intervalo, marca, propias, competidoras, tendencias, rendimientoPropio: contexto.rendimientoPropio,
      competencia: contexto.competencia.map(({ fuente, formatos, publicacionesPorMes, publicaciones, conInteracciones }) =>
        ({ fuente, formatos, publicacionesPorMes, publicaciones, conInteracciones })),
      formatosPropios: contexto.formatosPropios, limitaciones: contexto.limitaciones,
    },
  };
}

const usoValido = usoTendencias.omit({ busquedasWeb: true }).optional();
const normalizarIdea = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function similares(ideas: SalidaIdeas["ideas"]) {
  const titulos = ideas.map((idea) => normalizarIdea(idea.titulo));
  const conceptos = ideas.map((idea) => new Set(normalizarIdea(idea.concepto).split(" ")));
  return new Set(titulos).size !== ideas.length || conceptos.some((a, i) => conceptos.slice(i + 1).some((b) =>
    [...a].filter((palabra) => b.has(palabra)).length / new Set([...a, ...b]).size >= 0.85));
}

export function crearGeneradorIdeas(
  reservas: ReturnType<typeof crearReservasIdeas>, motor: MotorIdeas, limiteDiario: number,
  cargarContexto: (intervalo?: unknown) => Promise<ContextoIdeas>,
  cargarPreferencias?: ReturnType<typeof crearRepositorioEvaluaciones>["preferenciasEditoriales"],
) {
  return async (entrada: unknown) => {
    const solicitud = solicitarIdeas.parse(entrada);
    const { clave, ...parametros } = solicitud;
    const identidad = { proveedor: motor.proveedor, modelo: motor.modelo };
    const firma = createHash("sha256").update(JSON.stringify({ parametros, identidad })).digest("hex");
    const reserva = await reservas.reservar(clave, firma, limiteDiario);
    if (reserva.estado !== "reservada") return reserva;

    const base = { clave, ...identidad, parametros, solicitud: parametros.tema ?? parametros.objetivo };
    const plazo = AbortSignal.timeout(PLAZO_IDEAS_MS - 5000);
    let uso: UsoIdeas | undefined;
    let ideas;
    let detalles: DetallesEvidenciasIdeas | undefined;
    try {
      const [contexto, preferenciasEditoriales] = await Promise.all([
        cargarContexto(parametros.intervalo),
        motor.proveedor === "anthropic" ? cargarPreferencias?.() : undefined,
      ]);
      plazo.throwIfAborted();
      base.parametros.intervalo = contexto.intervalo;
      detalles = new Map<string, DetallesEvidenciasIdeas extends ReadonlyMap<string, infer Detalle> ? Detalle : never>([
        ...contexto.propias.map((fila) => [claveReferenciaIdea(fila), {
          muestra: fila.observacion.muestra, desdeDias: fila.observacion.desdeDias, hastaDias: fila.observacion.hastaDias,
          limitaciones: fila.limitaciones,
        }] as const),
        ...contexto.competidoras.map((fila) => [claveReferenciaIdea(fila), {
          muestra: contexto.competencia.find(({ fuente }) => fuente === fila.fuente)?.conInteracciones,
          limitaciones: fila.limitaciones,
        }] as const),
        ...contexto.tendencias.map((fila) => [claveReferenciaIdea(fila), { limitaciones: fila.limitaciones }] as const),
      ]);
      const { referencias, datos } = catalogo(contexto);
      const entradaModelo = JSON.stringify({ ...datos, ...(preferenciasEditoriales && { preferenciasEditoriales }) });
      const salida = await motor.generar(solicitud, entradaModelo, plazo);
      uso = usoValido.safeParse(salida.uso).data;
      plazo.throwIfAborted();
      const validada = salidaIdeas.safeParse(salida.resultado);
      if (!validada.success || validada.data.ideas.length !== solicitud.cantidad || similares(validada.data.ideas)) {
        throw new ErrorGeneradorIdeas("respuesta_invalida");
      }
      ideas = validada.data.ideas.map(({ referencias: usadas, advertencias, ...idea }) => {
        if (Object.values(idea).some((valor) => /https?:\/\//i.test(valor))
          || new Set(usadas.map(({ codigo }) => codigo)).size !== usadas.length
          || (motor.proveedor === "mock" && usadas.length)) throw new ErrorGeneradorIdeas("respuesta_invalida");
        const evidencias = usadas.map(({ codigo, relevancia }) => {
          const referencia = referencias.get(codigo);
          if (!referencia) throw new ErrorGeneradorIdeas("respuesta_invalida");
          return { ...referencia, relevancia };
        });
        if (motor.proveedor === "anthropic" && !evidencias.length) {
          advertencias = ["Propuesta exploratoria sin evidencia específica citada.", ...advertencias].slice(0, 8);
        }
        return { ...idea, evidencias, advertencias };
      });
    } catch (error) {
      const codigo = plazo.aborted ? "tiempo" : error instanceof ErrorGeneradorIdeas ? error.codigo : "proveedor";
      const consumo = error instanceof ErrorGeneradorIdeas ? usoValido.safeParse(error.uso).data ?? uso : uso;
      return reservas.finalizar(clave, firma, { ...base, estado: "fallida", error: codigo, uso: consumo });
    }
    try {
      return await reservas.finalizar(clave, firma, { ...base, estado: "completada", ideas, uso }, detalles);
    } catch (error) {
      // Una fuente pudo desaparecer después de generar. La primera escritura se revierte.
      if (!(error instanceof ErrorEvidenciaIdea)) throw error;
      return reservas.finalizar(clave, firma, { ...base, estado: "fallida", error: "respuesta_invalida", uso });
    }
  };
}
