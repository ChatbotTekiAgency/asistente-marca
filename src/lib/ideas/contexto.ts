import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { competidores, posts } from "../../db/schema.ts";
import { consultarComparacionCompetitiva, intervaloCompetencia } from "../competencia/comparacion.ts";
import { consultarDestacadosCompetidor } from "../competencia/destacados.ts";
import { COBERTURA_MINIMA, consultarEnriquecimientosVigentes } from "../enriquecimiento/resumen.ts";
import { consultarAnaliticaInstagram } from "../instagram/analitica.ts";
import { filtrosAnalitica } from "../instagram/filtros-analitica.ts";
import { construirContextoMarca } from "../marca/contexto.ts";
import { crearRepositorioMarca } from "../marca/repositorio.ts";
import { fuenteTendencia } from "../tendencias/contrato.ts";
import { crearRepositorioTendencias } from "../tendencias/repositorio.ts";
import { contextoIdeasSchema, intervaloIdeas, limitesContextoIdeas, type ContextoIdeas } from "./contexto-contrato.ts";
import { camposIdeaPerfil } from "./contrato.ts";
import { consultarExtremosPropios } from "./rendimiento.ts";

const DIA_MS = 86_400_000;
const fechaBogota = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", dateStyle: "short" });
const texto = (valor: string, limite: number) => valor.replace(/[\s\p{Cc}\p{Cf}]+/gu, " ").trim().slice(0, limite);
const link = (url: string) => fuenteTendencia.shape.url.safeParse(url).data ?? null;
const tamano = (valor: unknown) => Buffer.byteLength(JSON.stringify(valor), "utf8");
const avisoRecorte = "Se omitieron evidencias para respetar el límite de tamaño.";

function intercalar<T>(grupos: T[][]) {
  const filas: T[] = [];
  for (let i = 0; i < Math.max(0, ...grupos.map((grupo) => grupo.length)); i++) {
    for (const grupo of grupos) if (i < grupo.length) filas.push(grupo[i]);
  }
  return filas;
}

function agregarConLimite<T>(contexto: ContextoIdeas, destino: T[], fila: T, tope: number) {
  destino.push(fila);
  if (tamano(contexto) <= tope) return true;
  destino.pop();
  return false;
}

export async function construirContextoIdeas<T extends PgQueryResultHKT>(
  db: PgDatabase<T>, cuentaId: string, entrada?: unknown,
  { ahora = new Date(), limites: valores = {}, origenImagen }: { ahora?: Date; limites?: unknown; origenImagen?: string } = {},
) {
  const hasta = fechaBogota.format(ahora);
  const intervalo = intervaloIdeas.parse(entrada ?? {
    desde: new Date(Date.parse(hasta) - 89 * DIA_MS).toISOString().slice(0, 10), hasta,
  });
  const limites = limitesContextoIdeas.parse(valores);
  const consultadoEn = ahora.toISOString();
  const tendenciasRepo = crearRepositorioTendencias(db, cuentaId);
  const [perfil, analitica, extremos, rivales, investigaciones] = await Promise.all([
    crearRepositorioMarca(db).obtener(cuentaId),
    consultarAnaliticaInstagram(db, cuentaId, filtrosAnalitica.parse(intervalo), { soloResumen: true }),
    limites.propias ? consultarExtremosPropios(db, cuentaId, intervalo, limites.caption) : [],
    db.select({ id: competidores.id, usuario: competidores.username }).from(competidores)
      .where(and(eq(competidores.cuentaId, cuentaId), eq(competidores.activo, true)))
      .orderBy(asc(competidores.username), asc(competidores.id)).limit(5),
    tendenciasRepo.vigentesReales(ahora, limites.tendencias || 1),
  ]);
  const marca = perfil && construirContextoMarca(perfil.datos);
  const [semantica, comparacion, destacados, estudios] = await Promise.all([
    consultarEnriquecimientosVigentes(db, cuentaId, { marca, origenImagen }, intervaloCompetencia(posts.publicadaEn, intervalo)),
    rivales.length ? consultarComparacionCompetitiva(db, cuentaId, {
      ...intervalo, rivales: rivales.map(({ id }) => id), pagina: 1,
    }, { soloResumen: true }) : null,
    limites.competidoras ? Promise.all(rivales.map(async ({ id, usuario }) => {
      const filas = await consultarDestacadosCompetidor(db, cuentaId, id, {
        ...intervalo, cantidad: limites.competidoras, metrica: "interacciones",
      });
      return filas.map((fila): ContextoIdeas["competidoras"][number] => ({
        id: fila.id, tipo: "publicacion_competidor", fuente: `@${usuario}`, url: link(fila.url),
        publicadaEn: fila.publicadaEn.toISOString(), capturadaEn: fila.capturadaEn?.toISOString() ?? null,
        formato: fila.formato, captionNoConfiable: fila.fragmento && texto(fila.fragmento, limites.caption) || null,
        metricas: { likes: fila.meGusta, comentarios: fila.comentarios, interacciones: fila.interacciones, reproducciones: fila.reproducciones },
        limitaciones: ["Ranking descriptivo de la última captura. Las ventanas de observación pueden diferir entre cuentas."],
      }));
    })) : [],
    limites.tendencias ? Promise.all(investigaciones.map(({ id }) => tendenciasRepo.obtener(id))) : [],
  ]);

  const limitaciones = [
    "Interacciones = Me gusta + comentarios conocidos. Los valores nulos son desconocidos.",
    "Las diferencias de rendimiento son descriptivas. Las métricas públicas y las ventanas de observación pueden variar.",
  ];
  const { resumen } = analitica;
  if (resumen.conInteracciones < COBERTURA_MINIMA) limitaciones.push("Muestra pequeña de publicaciones propias con interacciones conocidas.");
  if (resumen.conInteracciones < resumen.publicaciones) limitaciones.push("Faltan métricas en parte de las publicaciones propias.");
  if (!extremos.length && limites.propias) limitaciones.push("No hay extremos comparables por formato y edad de captura.");
  if (!semantica.publicaciones.length) limitaciones.push("Sin enriquecimientos propios vigentes en el intervalo.");
  if (!rivales.length) limitaciones.push("Sin competidores activos registrados.");
  else limitaciones.push("No hay clasificaciones semánticas de competidores disponibles.");
  if (comparacion?.cuentas.some((fila) => !fila.propia && fila.conInteracciones < COBERTURA_MINIMA)) {
    limitaciones.push("Algún competidor tiene una muestra pequeña de interacciones conocidas.");
  }
  if (comparacion?.cuentas.some((fila) => !fila.propia && fila.conInteracciones < fila.publicaciones)) {
    limitaciones.push("Faltan métricas en parte de las publicaciones competidoras.");
  }
  if (!investigaciones.length) limitaciones.push("Sin investigaciones de tendencias reales vigentes.");

  const formatoPropio = new Map(analitica.formatos.map((fila) => [fila.tipo, fila]));
  const clasificaciones = new Map(semantica.publicaciones.map((fila) => [fila.postId, fila]));
  const propias = intercalar([extremos.filter((fila) => fila.posicion === "superior"), extremos.filter((fila) => fila.posicion === "inferior")])
    .slice(0, limites.propias).map((fila): ContextoIdeas["propias"][number] => {
      const clasificacion = clasificaciones.get(fila.id);
      const formato = formatoPropio.get(fila.formato);
      return {
        id: fila.id, tipo: "publicacion_propia", fuente: "instagram_propio", url: link(fila.url), posicion: fila.posicion,
        publicadaEn: fila.publicadaEn, capturadaEn: fila.capturadaEn, formato: fila.formato,
        captionNoConfiable: fila.caption && texto(fila.caption, limites.caption) || null,
        observacion: { desdeDias: fila.desdeDias, hastaDias: fila.desdeDias + 6, muestra: fila.muestra, mediana: fila.mediana },
        medianaFormato: formato && formato.conInteracciones >= COBERTURA_MINIMA ? formato.mediana : null,
        metricas: { likes: fila.likes, comentarios: fila.comentarios, interacciones: fila.interacciones, reproducciones: fila.reproducciones },
        limitaciones: ["Extremo relativo a su formato y a la edad de la publicación al capturar métricas."],
        ...(clasificacion && { semantica: {
          id: clasificacion.enriquecimientoId, tipo: "enriquecimiento", analizadaEn: clasificacion.analizadoEn,
          tema: clasificacion.clasificacion.temaPrincipal, intencion: clasificacion.clasificacion.intencion,
          gancho: clasificacion.clasificacion.gancho,
        } }),
      };
    });
  const ritmoPropio = comparacion?.cuentas.find(({ propia }) => propia)?.ritmo;
  const competencia = rivales.flatMap(({ id, usuario }): ContextoIdeas["competencia"] => {
    const fila = comparacion?.cuentas.find((cuenta) => cuenta.id === id);
    if (!fila) return [];
    return [{
      id, fuente: `@${usuario}`, publicaciones: fila.publicaciones, conInteracciones: fila.conInteracciones,
      publicacionesPorMes: fila.ritmo, diferenciaMensualFrenteAPropia: fila.ritmo === null || ritmoPropio == null ? null : fila.ritmo - ritmoPropio,
      formatos: (comparacion?.formatos ?? []).filter(({ cuentaId }) => cuentaId === id)
        .sort((a, b) => b.publicaciones - a.publicaciones || a.tipo.localeCompare(b.tipo))
        .map(({ tipo, publicaciones, conInteracciones, mediana }) => ({
          tipo, publicaciones, conInteracciones, mediana: conInteracciones >= COBERTURA_MINIMA ? mediana : null,
        })),
      temas: [],
    }];
  });
  const tendencias = intercalar(estudios.map((estudio): ContextoIdeas["tendencias"] => {
    const expira = estudio?.solicitud.expiraCacheEn;
    if (!expira || expira <= ahora || !estudio?.resultado) return [];
    return estudio.resultado.tendencias.map(({ id, titulo, descripcion, relevancia, relevanciaMarca, investigadaEn, fuentes }) => ({
      id, tipo: "tendencia", fuente: "investigacion_web_guardada", titulo, descripcion: texto(descripcion, 280),
      relevanciaMarca: texto(relevanciaMarca, 240), relevancia, investigadaEn, expiraEn: expira.toISOString(),
      fuentes: fuentes.slice(0, 2), limitaciones: ["Evidencia de una investigación guardada con caducidad."],
    }));
  })).slice(0, limites.tendencias);
  const entradasMarca: ContextoIdeas["marca"] = [];
  if (marca && perfil) {
    for (const campo of ["nombre", "sector", "publicoObjetivo", "objetivos", "tono", "propuestaValor",
      "productosServicios", "expresionesEvitar", "pilares", "identidadVisual"] as const) {
      const dato = marca[campo];
      if (dato !== undefined) entradasMarca.push({
        id: perfil.id, tipo: "perfil", fuente: "perfil_de_marca", campo: camposIdeaPerfil.parse(campo),
        consultadaEn: consultadoEn, dato: JSON.parse(JSON.stringify(dato)),
      });
    }
  }

  const contexto: ContextoIdeas = {
    consultadoEn, intervalo, contenidoExternoNoConfiable: true, limitaciones: [...limitaciones, avisoRecorte],
    rendimientoPropio: { publicaciones: resumen.publicaciones, conInteracciones: resumen.conInteracciones,
      mediana: resumen.conInteracciones >= COBERTURA_MINIMA ? resumen.mediana : null },
    formatosPropios: analitica.formatos.map(({ tipo, publicaciones, conInteracciones, mediana }) => ({
      tipo, publicaciones, conInteracciones, mediana: conInteracciones >= COBERTURA_MINIMA ? mediana : null,
    })),
    marca: [], propias: [], competencia: [], competidoras: [], tendencias: [],
  };
  const competidoras = intercalar(destacados).slice(0, limites.competidoras);
  const familias = [
    entradasMarca.map((fila) => () => agregarConLimite(contexto, contexto.marca, fila, limites.bytes)),
    propias.map((fila) => () => agregarConLimite(contexto, contexto.propias, fila, limites.bytes)),
    competencia.map((fila) => () => agregarConLimite(contexto, contexto.competencia, fila, limites.bytes)),
    competidoras.map((fila) => () => agregarConLimite(contexto, contexto.competidoras, fila, limites.bytes)),
    tendencias.map((fila) => () => agregarConLimite(contexto, contexto.tendencias, fila, limites.bytes)),
  ];
  if (intercalar(familias).map((agregar) => agregar()).every(Boolean)) contexto.limitaciones.pop();
  return contextoIdeasSchema.parse(contexto);
}
