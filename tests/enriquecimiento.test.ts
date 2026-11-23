import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { enriquecimientos, metricasPost, posts } from "../src/db/schema.ts";
import { crearGeneradorConHerramientas } from "../src/lib/chat/generar-con-herramientas.ts";
import { crearHerramientasSemanticas } from "../src/lib/chat/herramientas-semanticas.ts";
import { clasificacionSchema, solicitudSchema, VERSION_CLASIFICACION, VERSION_PROMPT, type Evento } from "../src/lib/enriquecimiento/contrato.ts";
import { clasificarMock, ejecutarLote, huella, identificarImagen, prepararContenido } from "../src/lib/enriquecimiento/motor.ts";
import { generarVistaPrevia, identidadDePost } from "../src/lib/enriquecimiento/plan.ts";
import { crearRepositorioEnriquecimiento } from "../src/lib/enriquecimiento/repositorio.ts";
import { consultarDistribucionEnriquecida } from "../src/lib/enriquecimiento/resumen.ts";
import { crearClasificador } from "../src/lib/enriquecimiento/anthropic.ts";
import { diagnosticoConfiguracion, leerConfiguracionEnriquecimiento } from "../src/lib/enriquecimiento/configuracion.ts";
import { crearBaseDePruebas } from "./chat-db.ts";

const entrada = prepararContenido({ caption: "Hola", tipo: "imagen", hashtags: ["marca"] }, null, null);
const signal = new AbortController().signal;

test("configura Anthropic solo para enriquecimiento y diagnostica claves sin mostrar valores", () => {
  assert.equal(leerConfiguracionEnriquecimiento({}).proveedor, "mock");
  assert.equal(leerConfiguracionEnriquecimiento({ AI_PROVIDER: "anthropic" }).proveedor, "mock");
  const config = {
    AI_PROVIDER: "mock", ENRICHMENT_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "clave-ficticia",
    ANTHROPIC_MODEL: "claude-haiku-5-5", ENRICHMENT_MAX_BATCH_POSTS: "1", ENRICHMENT_MAX_BATCH_USD: "0.002",
    ENRICHMENT_INPUT_USD_PER_MTOK: "0.10", ENRICHMENT_OUTPUT_USD_PER_MTOK: "0.50",
  };
  const activa = leerConfiguracionEnriquecimiento(config);
  assert.equal(activa.proveedor, "anthropic");
  assert.equal(activa.ENRICHMENT_MAX_BATCH_POSTS, 1);
  assert.throws(() => leerConfiguracionEnriquecimiento({ ...config, ENRICHMENT_MAX_BATCH_POSTS: "5" }));
  assert.throws(() => leerConfiguracionEnriquecimiento({ ...config, ENRICHMENT_MAX_BATCH_USD: "0" }));
  assert.throws(() => leerConfiguracionEnriquecimiento({
    ...config, ANTHROPIC_MODEL: undefined, ENRICHMENT_OUTPUT_USD_PER_MTOK: "valor-privado",
  }), (error: unknown) => {
    const mensaje = diagnosticoConfiguracion(error);
    assert.match(mensaje, /ANTHROPIC_MODEL/);
    assert.match(mensaje, /ENRICHMENT_OUTPUT_USD_PER_MTOK/);
    assert.doesNotMatch(mensaje, /valor-privado|clave-ficticia/);
    return true;
  });
});

test("AI SDK usa transporte simulado, cuenta tokens antes de generar y corta sobre el límite", async () => {
  const modelo = "claude-haiku-5-5";
  const llamadas: string[] = [];
  let tokens = 200;
  let truncar = false;
  const clasificacion = {
    temaPrincipal: "Diseño", temasSecundarios: [], intencion: "educativa", tono: "Cercano",
    gancho: "sin_evidencia", explicacionGancho: null, resumen: "Clasificación ficticia.", descripcionVisual: null,
  };
  const transporte: typeof fetch = async (url, init) => {
    llamadas.push(new URL(String(url)).pathname);
    const cuerpo = JSON.parse(String(init?.body));
    assert.equal(cuerpo.model, modelo);
    assert.equal(cuerpo.thinking?.type, "disabled");
    assert.equal(cuerpo.tools?.[0]?.name, "json");
    assert.ok(["any", "tool"].includes(cuerpo.tool_choice?.type));
    if (String(url).endsWith("/count_tokens")) {
      assert.ok(cuerpo.messages.length);
      return Response.json({ input_tokens: tokens });
    }
    assert.equal(cuerpo.max_tokens, 600);
    return Response.json({
      id: "msg_test", type: "message", model: modelo, role: "assistant",
      content: truncar ? [{ type: "text", text: '{"temaPrincipal":' }]
        : [{ type: "tool_use", id: "tool_test", name: "json", input: clasificacion }],
      stop_reason: truncar ? "max_tokens" : "tool_use", stop_sequence: null,
      usage: { input_tokens: 200, output_tokens: 55 },
    });
  };
  const clasificar = crearClasificador("clave-ficticia", modelo, 1000, 600, transporte);
  const salida = await clasificar(entrada, signal);
  assert.deepEqual(salida.resultado, clasificacion);
  assert.deepEqual(salida.uso, { inputTokens: 200, outputTokens: 55 });
  assert.deepEqual(llamadas, ["/v1/messages/count_tokens", "/v1/messages"]);
  llamadas.length = 0;
  tokens = 900;
  await assert.rejects(clasificar(entrada, signal), /No se inició la generación/);
  assert.deepEqual(llamadas, ["/v1/messages/count_tokens"]);
  tokens = 200;
  truncar = true;
  await assert.rejects(clasificar(entrada, signal), /límite de 600 tokens de salida/);
  const rechazada = crearClasificador("clave-ficticia", modelo, 1000, 600, async () =>
    Response.json({ error: { message: "dato interno" } }, { status: 401 }));
  await assert.rejects(rechazada(entrada, signal), (error: Error) => {
    assert.match(error.message, /conteo de tokens \(HTTP 401\)/);
    assert.doesNotMatch(error.message, /dato interno|clave-ficticia/);
    return true;
  });
});

test("valida solicitudes, clasificación y huella del contenido efectivo", async () => {
  const id = crypto.randomUUID();
  assert.equal(solicitudSchema.safeParse({ accion: "previsualizar", ids: [id, id], modalidad: "texto" }).success, false);
  assert.equal(solicitudSchema.safeParse({ accion: "ejecutar", ids: [id], modalidad: "texto", huella: "0".repeat(64) }).success, false);
  assert.equal(solicitudSchema.safeParse({ accion: "previsualizar", cuentaId: id, ids: [id], modalidad: "texto" }).success, false);
  const mock = clasificacionSchema.parse((await clasificarMock(entrada, signal)).resultado);
  assert.match(mock.resumen, /Resultado de prueba/);
  assert.equal(mock.descripcionVisual, null);
  assert.equal(clasificacionSchema.safeParse({ ...mock, intencion: "inventada" }).success, false);
  const origen = "https://prueba.public.blob.vercel-storage.com";
  assert.equal(identificarImagen(null, origen), null);
  assert.equal(identificarImagen("/visual.png"), null);
  assert.equal(identificarImagen("https://ajeno.test/visual.png", origen), null);
  assert.equal(identificarImagen("/visual.png", origen), `${origen}/visual.png`);
  assert.equal(huella(entrada), huella({ ...entrada }));
  for (const cambio of [{ caption: "Otro" }, { hashtags: [] }, { imagen: "https://ejemplo.test/visual.png" }, { marca: { tono: "Editorial" } }]) {
    assert.notEqual(huella(entrada), huella({ ...entrada, ...cambio }));
  }
});

test("calcula reserva con tarifas configuradas y excluye duplicados e imágenes ausentes", () => {
  const id = crypto.randomUUID();
  const identidad = identidadDePost(id, entrada, "visual", "anthropic", "modelo-prueba");
  const config = { proveedor: "anthropic" as const, modelo: "modelo-prueba", tarifaEntrada: 2, tarifaSalida: 6,
    maxEntrada: 10_000, maxSalida: 1000, presupuesto: 0.03 };
  const filas = [
    { id, shortcode: "A", estado: "lista" as const, identidad },
    { id: "B", shortcode: "B", estado: "duplicada" as const, identidad },
    { id: "C", shortcode: "C", estado: "sin_imagen" as const, identidad },
  ];
  const previa = generarVistaPrevia(filas, config);
  assert.equal(previa.procesables, 1);
  assert.equal(previa.costoUsd, 0.026);
  assert.equal(previa.permitido, true);
  const bloqueada = generarVistaPrevia(filas, { ...config, presupuesto: 0.02 });
  assert.equal(bloqueada.permitido, false);
  assert.notEqual(bloqueada.huella, previa.huella);
  assert.equal(generarVistaPrevia(filas.slice(1), config).permitido, false);
});

test("reserva una vez, mantiene lotes parciales, aísla cuentas y excluye simulaciones de las estadísticas", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  await client.exec(`
    CREATE TABLE enriquecimientos_post (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid NOT NULL REFERENCES posts(id),
      version_esquema int NOT NULL, version_prompt int NOT NULL, proveedor text NOT NULL, modelo text NOT NULL,
      modalidad text NOT NULL, hash_contenido text NOT NULL, estado text NOT NULL, intento uuid NOT NULL,
      vence_en timestamptz NOT NULL, clasificacion jsonb, uso jsonb, analizado_en timestamptz,
      UNIQUE(post_id,version_esquema,version_prompt,proveedor,modelo,modalidad,hash_contenido)
    )
  `);
  const [marca, otra] = await Promise.all([cuenta("marca"), cuenta("otra")]);
  const [uno, dos, ajeno] = await db.insert(posts).values([marca, marca, otra].map((cuentaId, i) => ({
    cuentaId, instagramId: String(i), shortcode: String(i), url: `https://www.instagram.com/p/${i}/`,
    tipo: "imagen" as const, publicadaEn: new Date(), caption: entrada.caption, hashtags: entrada.hashtags,
  }))).returning({ id: posts.id });
  const repo = crearRepositorioEnriquecimiento(db, marca);
  const foraneo = crearRepositorioEnriquecimiento(db, otra);
  assert.deepEqual((await repo.seleccion([uno.id, ajeno.id])).map(({ id }) => id), [uno.id]);
  const identidad = (id: string) => identidadDePost(id, entrada, "texto", "mock", "mock-v1");
  assert.equal(await repo.reclamar(identidad(ajeno.id)), null);
  const reserva = await Promise.all([repo.reclamar(identidad(uno.id)), repo.reclamar(identidad(uno.id))]);
  assert.equal(reserva.filter(Boolean).length, 1);
  const intento = reserva.find(Boolean)!;
  assert.equal(await foraneo.terminar(uno.id, intento, null), false);
  assert.equal(await repo.terminar(uno.id, intento, null), true);
  const eventos: Evento[] = [];
  let llamadas = 0;
  await ejecutarLote([uno, dos].map(({ id }) => ({ id, entrada })), "texto", async () => {
    if (++llamadas === 1) throw new Error("Fallo simulado");
    return { resultado: { ...((await clasificarMock(entrada, signal)).resultado as object), descripcionVisual: "No corresponde" },
      uso: { inputTokens: 20, outputTokens: 7 } };
  }, { reclamar: (id) => repo.reclamar(identidad(id)), terminar: repo.terminar, emitir: (evento) => eventos.push(evento) }, signal);
  assert.deepEqual(eventos.map(({ estado }) => estado), ["fallido", "guardado"]);
  assert.equal(await repo.reclamar(identidad(dos.id)), null);
  assert.equal((await repo.listar()).find(({ id }) => id === dos.id)?.resultado?.clasificacion?.descripcionVisual, null);
  assert.deepEqual(await consultarDistribucionEnriquecida(db, marca, { marca: null }), []);
  const real = identidadDePost(dos.id, entrada, "texto", "anthropic", "modelo-prueba");
  const realIntento = await repo.reclamar(real);
  assert.ok(realIntento);
  const realClasificacion = clasificacionSchema.parse({ ...(await clasificarMock(entrada, signal)).resultado as object,
    temaPrincipal: "Diseño", intencion: "educativa", tono: "Profesional" });
  assert.equal(await repo.terminar(dos.id, realIntento, realClasificacion), true);
  assert.deepEqual(await consultarDistribucionEnriquecida(db, otra, { marca: null }), []);
  const distribucion = await consultarDistribucionEnriquecida(db, marca, { marca: null });
  assert.equal(distribucion.find(({ dimension }) => dimension === "tema")?.categoria, "diseño");
  assert.ok(distribucion.every(({ mediana }) => mediana === null));
});

test("lee solo enriquecimientos vigentes, distingue evidencia visual y transmite resultados semánticos", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  await client.exec(readFileSync(new URL("../drizzle/0005_enriquecimientos_post.sql", import.meta.url), "utf8"));
  const [propia, ajena] = await Promise.all([cuenta("marca"), cuenta("ajena")]);
  const fecha = new Date("2026-05-01T12:00:00Z");
  const origenImagen = "https://prueba.public.blob.vercel-storage.com";
  const marca = { tono: "Claro" };
  const filas = await db.insert(posts).values(Array.from({ length: 12 }, (_, i) => ({
    cuentaId: i === 11 ? ajena : propia, instagramId: String(i), shortcode: `Post_${i}`,
    url: `https://www.instagram.com/p/Post_${i}/`, publicadaEn: new Date(fecha.getTime() + i * 1000), tipo: "imagen" as const,
    caption: `Caption ${i}`, imagenPersistida: i === 5 ? "/foto.png" : null,
  }))).returning();
  const texto = clasificacionSchema.parse({
    temaPrincipal: "Diseño", temasSecundarios: ["Marca"], intencion: "educativa", tono: " Profesional ",
    gancho: "pregunta", explicacionGancho: null, resumen: "Texto externo inesperado", descripcionVisual: "Excluir si solo fue textual",
  });
  function analisis(indice: number, cambio: Partial<typeof enriquecimientos.$inferInsert> = {}): typeof enriquecimientos.$inferInsert {
    const fila = filas[indice];
    const imagen = identificarImagen(fila.imagenPersistida, origenImagen);
    return {
      postId: fila.id, hashContenido: huella(prepararContenido(fila, marca, imagen)),
      modalidad: imagen ? "visual" : "texto", proveedor: "anthropic", modelo: "modelo-prueba", estado: "completado",
      versionEsquema: VERSION_CLASIFICACION, versionPrompt: VERSION_PROMPT,
      intento: crypto.randomUUID(), venceEn: fecha, analizadoEn: fecha, clasificacion: texto, ...cambio,
    };
  }
  await db.insert(enriquecimientos).values([
    ...Array.from({ length: 6 }, (_, i) => analisis(i)),
    analisis(0, { modelo: "otro-modelo", analizadoEn: new Date("2026-07-01"), hashContenido: "a".repeat(64) }),
    analisis(6, { proveedor: "mock" }), analisis(7, { versionEsquema: VERSION_CLASIFICACION - 1 }),
    analisis(8, { versionPrompt: VERSION_PROMPT - 1 }),
    analisis(9, { estado: "fallido", clasificacion: null }),
    analisis(11, { clasificacion: { ...texto, temaPrincipal: "Ajeno" } }),
  ]);
  await db.insert(metricasPost).values([
    ...filas.slice(0, 5).map(({ id }, i) => ({ postId: id, capturadaEn: fecha, likes: i * 10, comentarios: 0 })),
    { postId: filas[0].id, capturadaEn: new Date("2026-04-01"), likes: 999, comentarios: 999 },
    { postId: filas[5].id, capturadaEn: fecha, likes: null, comentarios: 100 },
  ].map((fila) => ({ ...fila, ingestaId: crypto.randomUUID() })));
  const referencia = { marca, origenImagen };
  const herramientas = crearHerramientasSemanticas(db, propia, referencia);
  assert.equal((await herramientas.buscarPublicacionesPorTema.execute({ tema: "marca", cantidad: 6 })).estado, "parametros_invalidos");
  assert.equal((await herramientas.consultarDistribucionTonos.execute({ cuentaId: ajena })).estado, "parametros_invalidos");
  const comparacion = await herramientas.compararRendimientoPorCategoriaSemantica.execute({ dimension: "tema" });
  assert.ok("categorias" in comparacion);
  assert.deepEqual(comparacion.cobertura, {
    publicacionesImportadas: 11, publicacionesEnriquecidas: 6, conDescripcionVisual: 1, enriquecidasConInteracciones: 5,
  });
  assert.deepEqual(comparacion.categorias, [{ dimension: "tema", categoria: "diseño", publicaciones: 6, conInteracciones: 5, mediana: 20 }]);
  const busqueda = await herramientas.buscarPublicacionesPorTema.execute({ tema: "MARCA", cantidad: 5 });
  assert.ok("publicaciones" in busqueda);
  assert.equal(busqueda.coincidencias, 6);
  assert.equal(busqueda.publicaciones.length, 5);
  assert.equal(busqueda.publicaciones[0].evidenciaVisual, "descripcion_guardada");
  assert.equal(busqueda.publicaciones[0].interacciones, null);
  assert.ok(busqueda.publicaciones.filter((p) => p.modalidad === "texto").every((p) => p.descripcionVisualNoConfiable === null));
  const visual = await herramientas.buscarPublicacionesPorTema.execute({ tema: "diseño" });
  assert.ok("publicaciones" in visual);
  assert.ok(!visual.publicaciones.some(({ shortcode }) => shortcode === "Post_11"));
  assert.equal((await herramientas.buscarPublicacionesPorTema.execute({ tema: "No coincide" })).estado, "sin_datos");
  assert.equal((await herramientas.identificarGanchosFrecuentes.execute({})).estado, "limite_de_consultas");
  const distribuciones = crearHerramientasSemanticas(db, propia, referencia);
  for (const [herramienta, categoria] of [
    [distribuciones.consultarDistribucionTemas, "diseño"], [distribuciones.consultarDistribucionIntenciones, "educativa"],
    [distribuciones.consultarDistribucionTonos, "profesional"], [distribuciones.identificarGanchosFrecuentes, "pregunta"],
  ] as const) {
    const salida = await herramienta.execute({});
    assert.ok("categorias" in salida);
    assert.deepEqual(salida.categorias, [{ categoria, publicaciones: 6 }]);
  }
  assert.equal((await crearHerramientasSemanticas(db, propia, { marca: null, origenImagen }).consultarDistribucionTemas.execute({})).estado, "sin_datos");

  const fin = (unified: "tool-calls" | "stop") => ({
    type: "finish" as const, finishReason: { unified, raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
  });
  const modelo = new MockLanguageModelV4({ doStream: [
    { stream: simulateReadableStream({ chunks: [{
      type: "tool-call", toolCallId: "temas", toolName: "consultarDistribucionTemas", input: "{}",
    }, fin("tool-calls")] }) },
    { stream: simulateReadableStream({ chunks: [
      { type: "text-start", id: "1" }, { type: "text-delta", id: "1", delta: "Seis de once publicaciones." },
      { type: "text-end", id: "1" }, fin("stop"),
    ] }) },
  ] });
  const respuesta: string[] = [];
  await crearGeneradorConHerramientas(modelo, crearHerramientasSemanticas(db, propia, referencia))(
    [{ id: "p", role: "user", parts: [{ type: "text", text: "¿Qué temas publico?" }] }], signal, (texto) => respuesta.push(texto),
  );
  assert.equal(respuesta.join(""), "Seis de once publicaciones.");
  assert.match(JSON.stringify(modelo.doStreamCalls[1].prompt.filter(({ role }) => role === "tool")), /publicacionesEnriquecidas.*6/);
});
