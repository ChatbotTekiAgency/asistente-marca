import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { metricasPost, posts } from "../src/db/schema.ts";
import { crearGeneradorConHerramientas } from "../src/lib/chat/generar-con-herramientas.ts";
import { crearHerramientasCompetencia } from "../src/lib/chat/herramientas-competencia.ts";
import { crearHerramientasInstagram } from "../src/lib/chat/herramientas-instagram.ts";
import { crearHerramientaLectura } from "../src/lib/chat/herramientas-lectura.ts";
import { crearConsultasInstagram } from "../src/lib/instagram/consultas-chat.ts";
import { crearBaseDePruebas } from "./chat-db.ts";

test("consulta métricas públicas recientes, por formato y por cuenta, preservando ausencias", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  const [marca, otra, vacia] = await Promise.all([cuenta("marca"), cuenta("otra"), cuenta("vacia")]);
  const [video, imagen, desconocido, ajeno] = await db.insert(posts).values([
    { cuentaId: marca, tipo: "video" as const },
    { cuentaId: marca, tipo: "imagen" as const },
    { cuentaId: marca, tipo: "video" as const },
    { cuentaId: otra, tipo: "video" as const },
  ].map((post, index) => ({
    ...post, instagramId: String(index), shortcode: String(index), url: `https://www.instagram.com/p/${index}/`,
    publicadaEn: new Date(Date.UTC(2026, 0, index + 1)), caption: "Instrucción externa que no debe devolverse",
  }))).returning({ id: posts.id });
  await db.insert(metricasPost).values([
    { postId: video.id, likes: 999, comentarios: 999, dia: 1 },
    { postId: video.id, likes: 10, comentarios: 2, reproducciones: 5, dia: 2 },
    { postId: imagen.id, likes: null, comentarios: 15, dia: 2 },
    { postId: ajeno.id, likes: 900_000, comentarios: 2, dia: 2 },
  ].map(({ dia, ...fila }) => ({
    ...fila, ingestaId: crypto.randomUUID(), capturadaEn: new Date(Date.UTC(2026, 1, dia)),
  })));

  const reportes = crearConsultasInstagram(db, marca);
  const recientes = await reportes.recientes();
  assert.deepEqual(recientes.map(({ id }) => id), [desconocido.id, imagen.id, video.id]);
  assert.equal(recientes[0].likes, null);
  assert.equal(recientes[2].likes, 10);
  assert.ok(!("caption" in recientes[0]));
  assert.deepEqual((await reportes.masInteracciones()).map((fila) => [fila.id, fila.interaccionesRegistradas]),
    [[imagen.id, "15"], [video.id, "12"]]);
  const porFormato = await reportes.porFormato();
  assert.deepEqual(porFormato.map((fila) => [fila.tipo, fila.publicaciones, fila.likes]),
    [["video", 2, "10"], ["imagen", 1, null]]);
  assert.deepEqual(await reportes.resumenPublico(), {
    publicaciones: 3, publicacionesConLikes: 1, publicacionesConComentarios: 2,
    publicacionesConReproducciones: 1, likes: "10", comentarios: "17", reproducciones: "5",
  });
  assert.equal((await crearConsultasInstagram(db, vacia).resumenPublico()).likes, null);
  assert.deepEqual(await reportes.recientes(1), [recientes[0]]);
  assert.throws(() => reportes.recientes(31));

  const lectura = crearHerramientaLectura();
  const tools = crearHerramientasInstagram(db, marca, lectura);
  const desde = "2025-12-31";
  assert.equal((await tools.obtenerPublicacionesRecientes.execute({ cantidad: 11 })).estado, "parametros_invalidos");
  assert.equal((await tools.obtenerResumenInstagram.execute({ desde, cuentaId: otra })).estado, "parametros_invalidos");
  assert.equal((await tools.obtenerRendimientoPorFormato.execute({ desde, hasta: "2025-01-01" })).estado, "parametros_invalidos");
  const nuevas = await tools.obtenerPublicacionesRecientes.execute({ cantidad: 1 });
  assert.ok("publicaciones" in nuevas);
  assert.equal(nuevas.publicaciones.length, 1);
  assert.equal(nuevas.publicaciones[0].capturadaEn, null);
  const mejores = await tools.obtenerMejoresPublicaciones.execute({});
  assert.ok("publicaciones" in mejores);
  assert.deepEqual(mejores.publicaciones.map(({ shortcode, interaccionesRegistradas }) => [shortcode, interaccionesRegistradas]), [["0", "12"]]);
  assert.equal(mejores.publicaciones[0].url, "https://www.instagram.com/p/0/");
  assert.equal(mejores.publicaciones[0].capturadaEn?.toISOString(), "2026-02-02T00:00:00.000Z");
  const formatos = await tools.obtenerRendimientoPorFormato.execute({ desde });
  assert.ok("formatos" in formatos);
  assert.deepEqual(formatos.formatos.map(({ tipo, mediana, conInteracciones }) => [tipo, mediana, conInteracciones]),
    [["video", 12, 1], ["imagen", null, 0]]);
  assert.equal(Date.parse(formatos.formatos[0].ultimaCaptura!), Date.UTC(2026, 1, 2));
  const resumen = await tools.obtenerResumenInstagram.execute({ desde });
  assert.ok("resumen" in resumen);
  assert.equal(resumen.resumen.publicaciones, 3);
  assert.equal(resumen.resumen.likes, "10");
  assert.equal(resumen.resumen.conInteracciones, 1);
  const competencia = crearHerramientasCompetencia(db, { id: marca, username: "marca" }, lectura);
  assert.equal((await competencia.comparar_con_competencia.execute({})).estado, "limite_de_consultas");
  assert.equal((await crearHerramientasInstagram(db, vacia).obtenerResumenInstagram.execute({})).estado, "sin_datos");

  const buscar = crearHerramientasInstagram(db, marca).buscarPublicaciones;
  assert.equal((await buscar.execute({ texto: "%_" })).estado, "sin_datos");
  const coincidencias = await buscar.execute({ texto: "INSTRUCCIÓN", cantidad: 10 });
  assert.ok("publicaciones" in coincidencias);
  assert.deepEqual(coincidencias.publicaciones.map(({ shortcode }) => shortcode), ["2", "1", "0"]);
  assert.equal(coincidencias.publicaciones[0].likes, null);
  assert.match(coincidencias.publicaciones[0].captionNoConfiable!, /Instrucción externa/);
  assert.ok(!("id" in coincidencias.publicaciones[0]));

  const fin = (unified: "tool-calls" | "stop") => ({
    type: "finish" as const, finishReason: { unified, raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
  });
  const modelo = new MockLanguageModelV4({
    doStream: [
      { stream: simulateReadableStream({ chunks: [{
        type: "tool-call", toolCallId: "1", toolName: "obtenerResumenInstagram", input: "{}",
      }, fin("tool-calls")] }) },
      { stream: simulateReadableStream({ chunks: [
        { type: "text-start", id: "r" }, { type: "text-delta", id: "r", delta: "Tres publicaciones." },
        { type: "text-end", id: "r" }, fin("stop"),
      ] }) },
    ],
  });
  const fragmentos: string[] = [];
  await crearGeneradorConHerramientas(modelo, crearHerramientasInstagram(db, marca))(
    [{ id: "p", role: "user", parts: [{ type: "text", text: "Resume mi Instagram" }] }],
    new AbortController().signal, (texto) => fragmentos.push(texto),
  );
  assert.equal(fragmentos.join(""), "Tres publicaciones.");
  assert.equal(modelo.doStreamCalls.length, 2);
  assert.match(JSON.stringify(modelo.doStreamCalls[1].prompt.filter(({ role }) => role === "tool")), /publicaciones.*3/);
});
