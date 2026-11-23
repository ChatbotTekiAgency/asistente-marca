import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { cuentas, competidores, fuentesTendencias, ingestas, metricasPost, posts, perfilesMarca, enriquecimientos,
  resultadosTendencias, solicitudesTendencias } from "../src/db/schema.ts";
import { construirContextoIdeas } from "../src/lib/ideas/contexto.ts";
import { crearIngestasCompetidor } from "../src/lib/competencia/ingestas.ts";
import { construirContextoMarca } from "../src/lib/marca/contexto.ts";
import { crearRepositorioMarca } from "../src/lib/marca/repositorio.ts";
import { perfilMarcaSchema } from "../src/lib/marca/validacion.ts";
import { huella, prepararContenido } from "../src/lib/enriquecimiento/motor.ts";
import { VERSION_CLASIFICACION, VERSION_PROMPT } from "../src/lib/enriquecimiento/contrato.ts";

test("compone contexto reproducible y aislado con ventanas de observación, semántica y fuentes vigentes", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });
  const [marca, otra] = await db.insert(cuentas).values([{ igUserId: "1", username: "marca" }, { igUserId: "2", username: "ajena" }]).returning();
  const [perfil] = await db.insert(perfilesMarca).values({
    cuentaId: marca.id, ...perfilMarcaSchema.parse({
      nombre: "Marca", publicoObjetivo: "Agencias", tono: "Directo", expresionesEvitar: "Promesas",
      pilares: [{ nombre: "Diseño", temas: ["Marca"] }],
      identidadVisual: { paleta: [{ hex: "#112233", funcion: "primario" }] },
    }),
  }).returning();
  const publicadaEn = new Date("2026-02-01T12:00:00Z");
  const filas = await db.insert(posts).values(Array.from({ length: 9 }, (_, i) => ({
    cuentaId: i === 8 ? otra.id : marca.id, instagramId: String(i), tipo: "imagen" as const,
    shortcode: String(i), url: `https://www.instagram.com/p/${i}/`, publicadaEn, caption: "Contenido ".repeat(50),
  }))).returning();
  const [lote] = await db.insert(ingestas).values({
    cuentaId: marca.id, proveedor: "archivo", claveOrigen: "probar", estado: "completada", iniciadaEn: publicadaEn, finalizadaEn: publicadaEn,
  }).returning();
  await db.insert(metricasPost).values(filas.slice(0, 8).map(({ id }, i) => ({
    postId: id, ingestaId: lote.id, likes: i < 5 ? (i + 1) * 10 : i === 7 ? null : 0, comentarios: 0,
    capturadaEn: new Date(i === 5 ? "2026-02-03T12:00:00Z" : i === 6 ? "2026-04-01T12:00:00Z" : "2026-02-08T12:00:00Z"),
  })));
  const perfilLeido = await crearRepositorioMarca(db).obtener(marca.id);
  assert.ok(perfilLeido);
  const [clasificacion] = await db.insert(enriquecimientos).values({
    postId: filas[4].id, proveedor: "anthropic", modelo: "fixture", modalidad: "texto", estado: "completado", intento: crypto.randomUUID(),
    versionEsquema: VERSION_CLASIFICACION, versionPrompt: VERSION_PROMPT, venceEn: publicadaEn, analizadoEn: publicadaEn,
    hashContenido: huella(prepararContenido(filas[4], construirContextoMarca(perfilLeido.datos), null)),
    clasificacion: { temaPrincipal: "Diseño", temasSecundarios: [], intencion: "educativa", tono: "Directo", gancho: "pregunta",
      explicacionGancho: null, resumen: "Resumen", descripcionVisual: null },
  }).returning();
  const [rival] = await db.insert(competidores).values({ cuentaId: marca.id, username: "rival", activo: true, cupo: 1 }).returning();
  await crearIngestasCompetidor(db, marca.id, rival.id).importar([{
    id: "99", shortCode: "rival", type: "Image", url: "https://www.instagram.com/p/rival/", timestamp: "2026-02-15T00:00:00Z",
    ownerUsername: "rival", caption: "Una publicación del rival", likesCount: 9, commentsCount: 1,
  }]);
  for (const [i, expira] of ["2026-03-03", "2026-03-01", "2026-03-03", "2026-03-03"].entries()) {
    const [solicitud] = await db.insert(solicitudesTendencias).values({
      cuentaId: i === 3 ? otra.id : marca.id, clave: crypto.randomUUID(), estado: "completada", proveedor: i === 2 ? "mock" : "anthropic",
      modelo: "fixture", expiraCacheEn: new Date(expira), venceEn: publicadaEn, finalizadaEn: publicadaEn,
    }).returning();
    const tendencias = await db.insert(resultadosTendencias).values(Array.from({ length: 4 }, (_, j) => ({
      id: crypto.randomUUID(), solicitudId: solicitud.id, posicion: j + 1, titulo: `Evidencia ${i}-${j}`, descripcion: "Descripción",
      relevanciaMarca: "Relevante", ejemploAplicacion: "Ejemplo", formato: "reel" as const, publicoObjetivo: "Agencias",
      relevancia: "alto" as const, investigadaEn: publicadaEn,
    }))).returning();
    await db.insert(fuentesTendencias).values(tendencias.map(({ id }) => ({
      tendenciaId: id, titulo: "Fuente", url: "https://fuente.example.test/noticia", posicion: 1,
    })));
  }

  const ahora = new Date("2026-03-02T12:00:00Z");
  const fechas = { desde: "2026-02-01", hasta: "2026-02-28" };
  const opciones = { ahora, limites: { caption: 30 } };
  const contexto = await construirContextoIdeas(db, marca.id, fechas, opciones);
  assert.deepEqual(await construirContextoIdeas(db, marca.id, fechas, opciones), contexto);
  assert.equal(contexto.marca.find(({ campo }) => campo === "tono")?.id, perfil.id);
  assert.ok(contexto.marca.some(({ campo }) => campo === "identidadVisual"));
  assert.deepEqual(contexto.propias.map(({ id, posicion }) => [id, posicion]), [[filas[4].id, "superior"], [filas[0].id, "inferior"]]);
  assert.equal(contexto.propias[0].observacion.muestra, 5);
  assert.equal(contexto.propias[0].observacion.mediana, 30);
  assert.equal(contexto.propias[0].semantica?.id, clasificacion.id);
  assert.equal(contexto.propias[0].metricas.reproducciones, null);
  assert.ok(contexto.propias.every(({ captionNoConfiable }) => captionNoConfiable!.length <= 30));
  assert.equal(contexto.competencia[0].diferenciaMensualFrenteAPropia, -7);
  assert.equal(contexto.competidoras[0].metricas.interacciones, "10");
  assert.equal(contexto.tendencias.length, 4);
  assert.ok(contexto.tendencias.every(({ titulo }) => titulo.startsWith("Evidencia 0-")));
  assert.match(contexto.limitaciones.join(" "), /Faltan métricas|muestra pequeña/i);
  const vacio = await construirContextoIdeas(db, otra.id, fechas, { ahora: new Date("2026-03-04") });
  assert.deepEqual(vacio.propias, []);
  assert.deepEqual(vacio.competencia, []);
  assert.deepEqual(vacio.tendencias, []);
  assert.match(vacio.limitaciones.join(" "), /Sin enriquecimientos.*Sin competidores.*Sin investigaciones/i);
  const compacto = await construirContextoIdeas(db, marca.id, fechas, { ahora, limites: { bytes: 4096, propias: 1, competidoras: 0, tendencias: 1 } });
  assert.ok(Buffer.byteLength(JSON.stringify(compacto)) <= 4096);
  assert.ok(compacto.propias.length <= 1 && compacto.tendencias.length <= 1);
  assert.deepEqual(compacto.competidoras, []);
  await assert.rejects(construirContextoIdeas(db, marca.id, { desde: "2026-03-01", hasta: "2026-01-01" }, { ahora }));
});
