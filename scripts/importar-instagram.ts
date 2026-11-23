import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { parseArgs } from "node:util";
import { Pool } from "@neondatabase/serverless";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { z } from "zod";
import { cuentas, ingestas, metricasPost, posts } from "../src/db/schema.ts";
import { normalizarApify, usuarioInstagram } from "../src/lib/instagram/normalizar-apify.ts";
import { actualizarPostImportado, guardarLotesInstagram, resultadoDataset } from "../src/lib/instagram/guardar-lote.ts";
import { crearIngestasCompetidor } from "../src/lib/competencia/ingestas.ts";
import { leerDatasetCompetidor, MAX_BYTES_JSON, type ResultadoIngesta } from "../src/lib/competencia/contrato-ingesta.ts";

const uso = "Usa --archivo <ruta> --cuenta <UUID> [--competidor <UUID>] o --archivo <ruta> --validar --usuario <username>.";

function mostrar(resumen: ResultadoIngesta) {
  const { detalle, ...conteos } = resumen;
  console.log(conteos);
  if (detalle.length) console.table(detalle);
  if (resumen.estado === "fallida") process.exitCode = 1;
}

async function main() {
  const { values } = parseArgs({
    options: {
      archivo: { type: "string" },
      cuenta: { type: "string" },
      competidor: { type: "string" },
      usuario: { type: "string" },
      validar: { type: "boolean" },
    },
  });
  if (!values.archivo || (values.validar ? !values.usuario || values.cuenta || values.competidor !== undefined : !values.cuenta || values.usuario)) {
    throw new Error(uso);
  }

  if (values.competidor !== undefined) {
    const cuentaId = z.uuid().parse(values.cuenta);
    const competidorId = z.uuid().parse(values.competidor);
    const partes: Buffer[] = [];
    for await (const parte of createReadStream(values.archivo, { end: MAX_BYTES_JSON })) partes.push(parte);
    let dataset;
    try { dataset = leerDatasetCompetidor(Buffer.concat(partes)); } catch (error) {
      console.error(error instanceof Error ? error.message : "Archivo inválido.");
      process.exitCode = 1;
      return;
    }
    const pool = new Pool({ connectionString: z.string().min(1).parse(process.env.DATABASE_URL), connectionTimeoutMillis: 10_000 });
    try {
      const resumen = await crearIngestasCompetidor(drizzle(pool), cuentaId, competidorId).importar(dataset);
      if (resumen) mostrar(resumen);
      else {
        console.error("El competidor no está disponible para la cuenta indicada.");
        process.exitCode = 1;
      }
    } catch {
      console.error("No se pudo guardar la ingesta del competidor.");
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
    return;
  }

  const iniciadaEn = new Date();
  const archivo = await readFile(values.archivo);
  const dataset: unknown = JSON.parse(archivo.toString("utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(dataset)) throw new Error("El archivo debe contener un arreglo JSON.");

  if (values.validar) {
    const usuario = usuarioInstagram.parse(values.usuario);
    const { publicaciones, rechazados } = normalizarApify(dataset, usuario);
    const tipos = Object.groupBy(publicaciones, ({ post }) => post.tipo);
    console.log({
      procesadas: publicaciones.length,
      carruseles: tipos.carrusel?.length ?? 0,
      videos: tipos.video?.length ?? 0,
      imagenes: tipos.imagen?.length ?? 0,
      rechazadas: rechazados.length,
    });
    if (rechazados.length) console.table(rechazados);
    if (!publicaciones.length || rechazados.length) process.exitCode = 1;
    return;
  }

  const cuentaId = z.uuid().parse(values.cuenta);
  const connectionString = z.string().min(1).parse(process.env.DATABASE_URL);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000 });
  const db = drizzle(pool);
  const origen = {
    cuentaId,
    proveedor: "apify",
    claveOrigen: `archivo:${createHash("sha256").update(JSON.stringify(dataset)).digest("hex")}`,
  };
  const mismaIngesta = and(
    eq(ingestas.cuentaId, cuentaId),
    eq(ingestas.proveedor, origen.proveedor),
    eq(ingestas.claveOrigen, origen.claveOrigen),
  );
  let cuentaEncontrada = false;
  try {
    const resumen = await db.transaction(async (tx) => {
      const [cuenta] = await tx.select({ username: cuentas.username })
        .from(cuentas).where(eq(cuentas.id, cuentaId)).for("update");
      if (!cuenta) return null;
      cuentaEncontrada = true;
      const [previa] = await tx.select().from(ingestas).where(mismaIngesta);
      if (previa && previa.estado !== "fallida") {
        return { id: previa.id, repetida: true, estado: previa.estado, procesadas: previa.procesadas,
          insertadas: 0, actualizadas: 0, rechazadas: previa.errores, detalle: [] };
      }

      const { publicaciones, rechazados, estado, mensajeError } = resultadoDataset(dataset, cuenta.username);
      const capturadaEn = new Date();
      const resultado = {
        estado,
        procesadas: publicaciones.length,
        errores: rechazados.length,
        iniciadaEn,
        finalizadaEn: iniciadaEn,
        mensajeError,
      } as const;
      const [{ id }] = await tx.insert(ingestas).values({ ...origen, ...resultado })
        .onConflictDoUpdate({
          target: [ingestas.cuentaId, ingestas.proveedor, ingestas.claveOrigen],
          set: resultado,
        }).returning({ id: ingestas.id });

      const conteos = await guardarLotesInstagram(publicaciones, {
        contarExistentes: async (shortcodes) => (await tx.select({ id: posts.id }).from(posts)
          .where(and(eq(posts.cuentaId, cuentaId), inArray(posts.shortcode, shortcodes)))).length,
        guardarPosts: async (lote) => tx.insert(posts).values(lote.map((post) => ({ ...post, cuentaId })))
          .onConflictDoUpdate({ target: [posts.cuentaId, posts.shortcode], set: actualizarPostImportado })
          .returning({ id: posts.id, shortcode: posts.shortcode }),
        guardarMetricas: async (lote) => tx.insert(metricasPost).values(lote.map((fila) => ({ ...fila, ingestaId: id, capturadaEn }))),
      });
      await tx.update(ingestas).set({ finalizadaEn: sql`clock_timestamp()` }).where(eq(ingestas.id, id));
      return { id, repetida: false, estado, procesadas: publicaciones.length,
        ...conteos,
        rechazadas: rechazados.length, detalle: rechazados };
    });

    if (!resumen) {
      console.error("No existe una cuenta con el UUID indicado.");
      process.exitCode = 1;
      return;
    }
    mostrar(resumen);
  } catch {
    console.error("No se pudo guardar la ingesta. Verifica la conexión y que las migraciones estén aplicadas.");
    if (cuentaEncontrada) {
      try {
        await db.insert(ingestas).values({
          ...origen, estado: "fallida", errores: 1, iniciadaEn, finalizadaEn: new Date(),
          mensajeError: "Falló la escritura del lote en la base de datos.",
        }).onConflictDoNothing();
      } catch {
        console.error("Tampoco se pudo registrar el fallo en ingestas.");
      }
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error(`Verifica el archivo JSON y los argumentos. ${uso}`);
  process.exitCode = 1;
});
