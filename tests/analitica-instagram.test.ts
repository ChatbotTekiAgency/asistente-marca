import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { metricasPost, posts } from "../src/db/schema.ts";
import { consultarAnaliticaInstagram } from "../src/lib/instagram/analitica.ts";
import { filtrosAnalitica } from "../src/lib/instagram/filtros-analitica.ts";
import { crearBaseDePruebas } from "./chat-db.ts";

test("usa la última captura, exige ambos datos y calcula medianas y múltiplos por cuenta", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  const [marca, otra, vacia] = await Promise.all([cuenta("marca"), cuenta("otra"), cuenta("vacia")]);
  const [a, b, c, d, e] = await db.insert(posts).values([
    [marca, "video", "2026-02-01T04:59:59Z"],
    [marca, "video", "2026-02-01T05:00:00Z"],
    [marca, "imagen", "2026-02-02T05:00:00Z"],
    [marca, "carrusel", "2026-04-01T05:00:00Z"],
    [otra, "video", "2026-02-01T05:00:00Z"],
  ].map(([cuentaId, tipo, fecha], i) => ({
    cuentaId, tipo: tipo as "video" | "imagen" | "carrusel", instagramId: String(i), shortcode: String(i),
    url: `https://www.instagram.com/p/${i}/`, publicadaEn: new Date(fecha),
  }))).returning({ id: posts.id });
  const captura = new Date("2026-11-20T21:00:00Z");
  await db.insert(metricasPost).values([
    { postId: a.id, likes: 998, comentarios: 1, capturadaEn: new Date("2026-11-19T21:00:00Z") },
    { id: "00000000-0000-4000-8000-000000000001", postId: a.id, likes: 997, comentarios: 2, capturadaEn: captura },
    { id: "00000000-0000-4000-8000-000000000002", postId: a.id, likes: 10, comentarios: 0, reproducciones: 25, capturadaEn: captura },
    { postId: b.id, likes: 60, comentarios: 10, capturadaEn: captura },
    { postId: c.id, likes: null, comentarios: 99, capturadaEn: captura },
    { postId: e.id, likes: 0, comentarios: 0, reproducciones: 0, capturadaEn: captura },
  ].map((fila) => ({ ...fila, ingestaId: randomUUID() })));

  const informe = await consultarAnaliticaInstagram(db, marca, filtrosAnalitica.parse({ orden: "interacciones" }));
  assert.deepEqual(informe.resumen, {
    publicaciones: 4, conLikes: 2, conComentarios: 3, conReproducciones: 1, conInteracciones: 2,
    likes: "70", comentarios: "109", reproducciones: "25", mediana: 40, frecuenciaMensual: 1,
    primeraPublicacion: "2026-02-01T04:59:59+00:00", ultimaPublicacion: "2026-04-01T05:00:00+00:00",
    ultimaCaptura: "2026-11-20T21:00:00+00:00",
  });
  assert.deepEqual(informe.ranking.map((fila) => [fila.id, fila.interacciones, fila.multiplo]),
    [[b.id, "70", 1.75], [a.id, "10", 0.25]]);
  assert.deepEqual(informe.publicaciones.map((fila) => fila.id), [b.id, a.id, d.id, c.id]);
  assert.equal(informe.publicaciones[2].capturadaEn, null);
  assert.equal(informe.publicaciones[3].interacciones, null);
  assert.deepEqual(informe.formatos.map((fila) =>
    [fila.tipo, fila.publicaciones, fila.conInteracciones, fila.mediana, fila.promedio, fila.totalInteracciones, fila.reproducciones]),
  [["carrusel", 1, 0, null, null, null, null], ["video", 2, 2, 40, 40, "80", "25"], ["imagen", 1, 0, null, null, null, null]]);
  assert.deepEqual(informe.meses.map((fila) => [fila.mes, fila.publicaciones, fila.mediana, fila.video, fila.imagen, fila.carrusel]),
    [["2026-01", 1, 10, 1, 0, 0], ["2026-02", 2, 70, 1, 1, 0], ["2026-03", 0, null, 0, 0, 0], ["2026-04", 1, null, 0, 0, 1]]);

  const filtrada = await consultarAnaliticaInstagram(db, marca, filtrosAnalitica.parse({
    formato: "video", desde: "2026-02-01", hasta: "2026-02-01", pagina: "999",
  }));
  assert.deepEqual(filtrada.publicaciones.map((fila) => fila.id), [b.id]);
  assert.equal(filtrada.pagina, 1);
  assert.equal(filtrada.resumen.mediana, 70);
  assert.equal(filtrada.medianaCuenta, 40);
  assert.equal(filtrada.publicaciones[0].multiplo, 1.75);

  const cero = await consultarAnaliticaInstagram(db, otra, filtrosAnalitica.parse({}));
  assert.equal(cero.medianaCuenta, 0);
  assert.equal(cero.resumen.reproducciones, "0");
  assert.equal(cero.ranking[0].interacciones, "0");
  assert.equal(cero.ranking[0].multiplo, null);

  const sinDatos = await consultarAnaliticaInstagram(db, vacia, filtrosAnalitica.parse({}));
  assert.equal(sinDatos.resumen.publicaciones, 0);
  assert.equal(sinDatos.resumen.likes, null);
  assert.equal(sinDatos.resumen.ultimaCaptura, null);
  assert.equal(sinDatos.medianaCuenta, null);
  assert.deepEqual([sinDatos.formatos, sinDatos.meses, sinDatos.ranking, sinDatos.publicaciones], [[], [], [], []]);
});

test("valida fechas de calendario, rangos, formatos y parámetros repetidos", () => {
  assert.equal(filtrosAnalitica.safeParse({ desde: "2026-02-30" }).success, false);
  assert.equal(filtrosAnalitica.safeParse({ desde: "2026-03-01", hasta: "2026-01-01" }).success, false);
  assert.equal(filtrosAnalitica.safeParse({ formato: "otro" }).success, false);
  assert.equal(filtrosAnalitica.safeParse({ orden: ["fecha", "interacciones"] }).success, false);
  assert.equal(filtrosAnalitica.safeParse({ desde: "", hasta: "", formato: "" }).success, true);
});
