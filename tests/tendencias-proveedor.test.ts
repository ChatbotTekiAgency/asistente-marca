import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as esperar } from "node:timers/promises";
import { crearMotorTendenciasAnthropic } from "../src/lib/tendencias/anthropic.ts";
import { leerConfiguracionTendencias } from "../src/lib/tendencias/configuracion.ts";
import { salidaProveedorTendencias } from "../src/lib/tendencias/contrato.ts";
import { configurarMotorTendencias } from "../src/lib/tendencias/proveedor.ts";

const variables = {
  TRENDS_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "clave-ficticia", ANTHROPIC_MODEL: "claude-haiku-5-5",
  TRENDS_MAX_COST_USD: "0.05", TRENDS_INPUT_USD_PER_MTOK: "0.10", TRENDS_OUTPUT_USD_PER_MTOK: "0.50",
  TRENDS_MAX_SEARCHES: "2", TRENDS_MARKET: "Colombia",
};
const cargada = leerConfiguracionTendencias(variables);
assert.equal(cargada.proveedor, "anthropic");
const config = cargada;
const contexto = { instrucciones: "Investiga tendencias.", referenciaMarca: "Marca del sector editorial" };
const fuente = "https://fuentes.example.test/noticia";
const bloqueBusqueda = {
  type: "web_search_tool_result", tool_use_id: "srvtoolu_demo",
  content: [{ type: "web_search_result", title: "Publicación de prueba", url: fuente, encrypted_content: "encriptado", page_age: "hace 2 días" }],
};
const cita = {
  type: "web_search_result_location", cited_text: "Pasaje real simulado.",
  url: fuente, title: "Título de la cita", encrypted_index: "cita-encriptada",
};
const texto = { type: "text", text: "Informe breve.", citations: [cita] };
const llamada = { type: "server_tool_use", name: "web_search", id: "srvtoolu_demo", input: { query: "tendencias mock" } };
const propuestas = Array.from({ length: 4 }, (_, i) => ({
  titulo: `Propuesta ${i + 1}`, descripcion: "Descripción.", relevanciaMarca: "Contexto.",
  ejemploAplicacion: "Muestra de aplicación.", formato: "reel", publicoObjetivo: "Audiencia", relevancia: "medio", referencias: [1],
}));
const respuesta = (content: unknown[], input = 1700, stop = "end_turn") => Response.json({
  id: "msg_demo", type: "message", model: "claude-haiku-5-5", role: "assistant",
  content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: input, output_tokens: 100 },
});

function transporteSimulado({
  hallazgos = [llamada, bloqueBusqueda, texto], estructura = propuestas,
  tokens = 350, entradaInvestigacion = 1700, finInvestigacion = "end_turn", finEstructura = "end_turn",
}: { hallazgos?: unknown[]; estructura?: unknown; tokens?: number; entradaInvestigacion?: number;
  finInvestigacion?: string; finEstructura?: string } = {}) {
  const llamadas: string[] = [];
  const transporte: typeof fetch = async (url, init) => {
    const { pathname } = new URL(String(url));
    const cuerpo = JSON.parse(String(init?.body));
    llamadas.push(pathname);
    assert.equal(cuerpo.model, config.TRENDS_ANTHROPIC_MODEL);
    if (pathname.endsWith("/count_tokens")) return Response.json({ input_tokens: tokens });
    assert.equal(pathname, "/v1/messages");
    assert.equal(cuerpo.max_tokens, config.TRENDS_MAX_OUTPUT_TOKENS);
    if (cuerpo.tools) {
      assert.deepEqual(cuerpo.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }]);
      assert.equal(cuerpo.output_config?.format, undefined);
      assert.equal(cuerpo.thinking?.type, "disabled");
      assert.match(JSON.stringify(cuerpo.system), /como máximo 2 búsquedas web/);
      assert.match(JSON.stringify(cuerpo.system), /cita nativa inmediatamente/);
      assert.match(JSON.stringify(cuerpo.messages), /Colombia.*sector editorial/);
      return respuesta(hallazgos, entradaInvestigacion, finInvestigacion);
    }
    assert.equal(cuerpo.output_config.format.type, "json_schema");
    assert.equal(cuerpo.thinking?.type, "disabled");
    assert.match(JSON.stringify(cuerpo.messages), /Pasaje real simulado/);
    return respuesta([{ type: "text", text: JSON.stringify({ propuestas: estructura }) }], 1700, finEstructura);
  };
  return { transporte, llamadas };
}

test("mock devuelve cuatro propuestas marcadas y la configuración real valida el modelo y los límites", async () => {
  const motor = configurarMotorTendencias({ ANTHROPIC_MODEL: "sin-claves" });
  assert.equal(motor.proveedor, "mock");
  const resultado = salidaProveedorTendencias.parse(await motor.investigar(contexto, new AbortController().signal));
  assert.equal(resultado.propuestas.length, 4);
  assert.ok(resultado.propuestas.every(({ titulo }) => titulo.startsWith("Simulación")));
  assert.equal(resultado.uso?.costoEstimadoUsd, 0);
  assert.throws(() => leerConfiguracionTendencias({ ...variables, ANTHROPIC_MODEL: "claude-3-haiku-20240307" }));
  assert.throws(() => leerConfiguracionTendencias({ ...variables, TRENDS_MAX_SEARCHES: "6" }));
  assert.throws(() => leerConfiguracionTendencias({ ...variables, TRENDS_TIMEOUT_MS: "90000" }));
});

test("Anthropic conserva citas recuperadas y estructura sin volver a buscar", async () => {
  const { llamadas, transporte } = transporteSimulado();
  const motor = crearMotorTendenciasAnthropic(config, transporte);
  const resultado = salidaProveedorTendencias.parse(await motor.investigar(contexto, new AbortController().signal));
  assert.equal(resultado.propuestas.length, 4);
  assert.ok(resultado.propuestas.every(({ urlsFuentes }) => urlsFuentes[0] === fuente));
  assert.deepEqual(resultado.evidencias, [{ titulo: "Publicación de prueba", url: fuente, sitio: "fuentes.example.test" }]);
  assert.deepEqual(llamadas, ["/v1/messages/count_tokens", "/v1/messages", "/v1/messages/count_tokens", "/v1/messages"]);
  assert.equal(resultado.uso?.tokensEntrada, 3400);
  assert.equal(resultado.uso?.tokensSalida, 200);
  assert.equal(resultado.uso?.busquedasWeb, 1);
  assert.ok(Math.abs(resultado.uso!.costoEstimadoUsd! - 0.01044) < 1e-10);
});

test("rechaza citas sin resultado recuperado y resultados con URLs inválidas o errores de búsqueda", async () => {
  for (const [hallazgos, codigo] of [
    [[texto], "sin_evidencia"],
    [[llamada, bloqueBusqueda, { ...texto, citations: [] }], "sin_evidencia"],
    [[llamada, bloqueBusqueda, { ...texto, citations: [{ ...cita, url: "https://inventada.example.test/" }] }], "sin_evidencia"],
    [[llamada, { ...bloqueBusqueda, content: [{ ...bloqueBusqueda.content[0], url: "http://insegura.example.test/" }] },
      { ...texto, citations: [{ ...cita, url: "http://insegura.example.test/" }] }], "sin_evidencia"],
    [[llamada, { ...bloqueBusqueda, content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }, texto], "busqueda"],
    [[llamada, { ...bloqueBusqueda, content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } }, texto], "cuota"],
  ] as const) {
    const { llamadas, transporte } = transporteSimulado({ hallazgos: [...hallazgos] });
    const motor = crearMotorTendenciasAnthropic(config, transporte);
    await assert.rejects(motor.investigar(contexto, new AbortController().signal), { codigo });
    assert.equal(llamadas.length, 2);
  }
});

test("diagnostica por qué faltó evidencia y acepta un título respaldado por la cita", async () => {
  const signal = new AbortController().signal;
  for (const [citas, motivo, campos] of [
    [[], "respuesta_sin_citas", { citasSdk: 0, citasApi: 0 }],
    [[{ ...cita, cited_text: " " }], "citas_sin_evidencia_util", { sinPasaje: 1 }],
    [[{ ...cita, url: "https://otra.example.test/" }], "citas_sin_evidencia_util", { sinResultado: 1 }],
  ] as const) {
    const { transporte } = transporteSimulado({ hallazgos: [llamada, bloqueBusqueda, { ...texto, citations: citas }] });
    await assert.rejects(crearMotorTendenciasAnthropic(config, transporte).investigar(contexto, signal), (error: {
      codigo: string; detalle: Record<string, unknown>;
    }) => {
      assert.equal(error.codigo, "sin_evidencia");
      assert.equal(error.detalle.motivo, motivo);
      assert.equal(error.detalle.urlsRecuperadas, 1);
      for (const [campo, valor] of Object.entries(campos)) assert.equal(error.detalle[campo], valor);
      assert.doesNotMatch(JSON.stringify(error.detalle), /example\.test|encriptado|Pasaje real/);
      return true;
    });
  }
  const { transporte } = transporteSimulado({ hallazgos: [
    llamada, { ...bloqueBusqueda, content: [{ ...bloqueBusqueda.content[0], title: null }] }, texto,
  ] });
  const resultado = salidaProveedorTendencias.parse(await crearMotorTendenciasAnthropic(config, transporte).investigar(contexto, signal));
  assert.equal(resultado.evidencias[0].titulo, cita.title);
});

test("rechaza salida incompleta y referencias inexistentes", async () => {
  for (const [estructura, codigo] of [
    [propuestas.slice(0, 3), "respuesta_invalida"],
    [[...propuestas, propuestas[0]], "respuesta_invalida"],
    [[{ ...propuestas[0], referencias: [2] }, ...propuestas.slice(1)], "sin_evidencia"],
  ] as const) {
    const { llamadas, transporte } = transporteSimulado({ estructura: [...estructura] });
    await assert.rejects(crearMotorTendenciasAnthropic(config, transporte).investigar(contexto, new AbortController().signal), { codigo });
    assert.equal(llamadas.length, 4);
  }
});

test("reutiliza los resultados citados cuando Anthropic bloquea una búsqueda adicional por max_uses", async () => {
  const extra = "srvtoolu_extra";
  const { llamadas, transporte } = transporteSimulado({ hallazgos: [
    llamada, bloqueBusqueda,
    { ...llamada, id: "srvtoolu_segunda" }, { ...bloqueBusqueda, tool_use_id: "srvtoolu_segunda" },
    { ...llamada, id: extra }, { ...bloqueBusqueda, tool_use_id: extra,
      content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }, texto,
  ] });
  const motor = crearMotorTendenciasAnthropic(config, transporte);
  const resultado = salidaProveedorTendencias.parse(await motor.investigar(contexto, new AbortController().signal));
  assert.equal(resultado.propuestas.length, 4);
  assert.equal(resultado.uso?.busquedasWeb, 2);
  assert.equal(llamadas.length, 4);
});

test("usa las citas de una búsqueda truncada y rechaza una estructuración truncada", async () => {
  const busqueda = transporteSimulado({ finInvestigacion: "max_tokens" });
  const signal = new AbortController().signal;
  const resultado = salidaProveedorTendencias.parse(await crearMotorTendenciasAnthropic(config, busqueda.transporte).investigar(contexto, signal));
  assert.equal(resultado.propuestas.length, 4);
  const estructura = transporteSimulado({ finEstructura: "max_tokens" });
  await assert.rejects(crearMotorTendenciasAnthropic(config, estructura.transporte).investigar(contexto, signal), {
    codigo: "respuesta_invalida", fase: "estructuracion",
  });
});

test("el motor corta por presupuesto antes de pagar, antes de estructurar y al abortar", async () => {
  const previo = transporteSimulado();
  const signal = new AbortController().signal;
  await assert.rejects(crearMotorTendenciasAnthropic({ ...config, TRENDS_MAX_COST_USD: 0.001 }, previo.transporte)
    .investigar(contexto, signal), { codigo: "presupuesto" });
  assert.deepEqual(previo.llamadas, []);
  const caro = transporteSimulado({ tokens: 80_000 });
  await assert.rejects(crearMotorTendenciasAnthropic(config, caro.transporte).investigar(contexto, signal), { codigo: "presupuesto" });
  assert.deepEqual(caro.llamadas, ["/v1/messages/count_tokens"]);
  const muchaBusqueda = transporteSimulado({ entradaInvestigacion: 50_000 });
  await assert.rejects(crearMotorTendenciasAnthropic(config, muchaBusqueda.transporte).investigar(contexto, signal), { codigo: "presupuesto" });
  assert.equal(muchaBusqueda.llamadas.length, 2);

  const controlador = new AbortController();
  const abortar: typeof fetch = async (_url, init) => {
    controlador.abort();
    init?.signal?.throwIfAborted();
    throw new Error("Se esperaba una señal abortada.");
  };
  await assert.rejects(crearMotorTendenciasAnthropic(config, abortar).investigar(contexto, controlador.signal), { codigo: "tiempo" });
  const lento: typeof fetch = async (_url, init) => {
    await esperar(1000, undefined, { signal: init?.signal ?? undefined });
    return Response.json({ input_tokens: 100 });
  };
  await assert.rejects(crearMotorTendenciasAnthropic({ ...config, TRENDS_TIMEOUT_MS: 5 }, lento).investigar(contexto, signal),
    { codigo: "tiempo" });
});

test("rechaza más búsquedas que el máximo y un error HTTP de cuota sin reintentar", async () => {
  const hallazgos = ["a", "b", "c"].flatMap((id) => [
    { ...llamada, id }, { ...bloqueBusqueda, tool_use_id: id },
  ]);
  const exceso = transporteSimulado({ hallazgos: [...hallazgos, texto] });
  const signal = new AbortController().signal;
  await assert.rejects(crearMotorTendenciasAnthropic(config, exceso.transporte).investigar(contexto, signal), { codigo: "busqueda" });
  assert.equal(exceso.llamadas.length, 2);

  let llamadas = 0;
  const cuota: typeof fetch = async (url) => {
    llamadas += 1;
    if (String(url).endsWith("/count_tokens")) return Response.json({ input_tokens: 100 });
    return Response.json({ type: "error", error: { type: "rate_limit_error", message: "Cuota simulada" } }, { status: 429 });
  };
  await assert.rejects(crearMotorTendenciasAnthropic(config, cuota).investigar(contexto, signal), { codigo: "cuota" });
  assert.equal(llamadas, 2);
});
