import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { cuentas } from "../src/db/schema.ts";
import { crearHerramientasCompetencia } from "../src/lib/chat/herramientas-competencia.ts";
import { usuarioInstagram } from "../src/lib/instagram/usuario.ts";

async function main() {
  const [username, rivalSolicitado] = process.argv.slice(2);
  const usuario = usuarioInstagram.parse(username?.replace(/^@/, ""));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta configuración.");
  const db = drizzle({ client: neon(url) });
  const [cuenta] = await db.select({ id: cuentas.id, username: cuentas.username })
    .from(cuentas).where(eq(cuentas.username, usuario)).limit(1);
  if (!cuenta) throw new Error("Cuenta no disponible.");

  const tools = crearHerramientasCompetencia(db, cuenta);
  const comparacion = await tools.comparar_con_competencia.execute({ competidores: rivalSolicitado ? [rivalSolicitado] : undefined });
  const rival = "cuentas" in comparacion ? comparacion.cuentas.find(({ propia }) => !propia)?.usuario : undefined;
  const formatos = await tools.formatos_por_cuenta.execute({ cuenta: rival ?? "propia" });
  const destacadas = rival
    ? await tools.posts_destacados_competencia.execute({ competidor: rival, cantidad: 3 })
    : { estado: "sin_competidor" };
  const resumen = "publicaciones" in destacadas
    ? { ...destacadas, publicaciones: destacadas.publicaciones.map(({ captionNoConfiable, ...datos }) => ({
      ...datos, caracteresDeCaption: captionNoConfiable ? Array.from(captionNoConfiable).length : 0,
    })) } : destacadas;
  console.log(JSON.stringify({ comparacion, formatos, destacadas: resumen }, null, 2));
  if ([comparacion.estado, formatos.estado, destacadas.estado].some((estado) => !["ok", "sin_datos", "sin_competidor"].includes(estado))) {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("No se pudo probar. Verifica DATABASE_URL y usa un username de una cuenta propia registrada.");
  process.exitCode = 1;
});
