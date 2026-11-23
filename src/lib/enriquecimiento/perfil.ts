import "server-only";

import { db } from "@/db";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { obtenerContextoMarca } from "@/lib/marca/servidor";
import { COBERTURA_MINIMA, consultarDistribucionEnriquecida } from "./resumen";
import { origenImagenEnriquecimiento } from "./configuracion";

export async function obtenerPerfilEnriquecido(cuentaId: string) {
  const activa = await getCuentaActiva();
  if (!activa || activa.id !== cuentaId) return null;
  const perfil = await obtenerContextoMarca(activa.id);
  const origenImagen = origenImagenEnriquecimiento.safeParse(process.env.ENRICHMENT_IMAGE_ORIGIN).data;
  const categorias = await consultarDistribucionEnriquecida(db, activa.id, { marca: perfil, origenImagen });
  return {
    perfil,
    temas: categorias.filter(({ dimension }) => dimension === "tema"),
    intenciones: categorias.filter(({ dimension }) => dimension === "intencion"),
    tonos: categorias.filter(({ dimension }) => dimension === "tono"),
    ganchos: categorias.filter(({ dimension }) => dimension === "gancho"),
    minimoParaMediana: COBERTURA_MINIMA,
    alcance: "Distribuciones descriptivas del último análisis real vigente por publicación. Las medianas utilizan la última captura con likes y comentarios conocidos. No permiten atribuir causalidad.",
  };
}
