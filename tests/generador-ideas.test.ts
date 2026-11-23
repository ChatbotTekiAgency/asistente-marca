import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { cuentas, perfilesMarca } from "../src/db/schema.ts";
import { construirContextoIdeas } from "../src/lib/ideas/contexto.ts";
import { crearGeneradorIdeas } from "../src/lib/ideas/generador.ts";
import { configurarIdeas, ErrorGeneradorIdeas, motorIdeasMock, type MotorIdeas } from "../src/lib/ideas/proveedor-ideas.ts";
import { crearRepositorioIdeas } from "../src/lib/ideas/repositorio.ts";
import { crearReservasIdeas } from "../src/lib/ideas/reservas.ts";
import { salidaIdeas, solicitarIdeas } from "../src/lib/ideas/solicitud.ts";

test("genera 1, 3 y 5 ideas simuladas y comprueba referencias, cuota e idempotencia", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });
  const [marca, otra] = await db.insert(cuentas).values([{ igUserId: "1", username: "marca" }, { igUserId: "2", username: "otra" }]).returning();
  const [perfil] = await db.insert(perfilesMarca).values({ cuentaId: marca.id, tono: "Directo" }).returning();
  const construir = (cuentaId: string) => construirContextoIdeas(db, cuentaId, undefined, { ahora: new Date("2026-11-23T12:00:00Z") });
  const contexto = await construir(marca.id);
  assert.deepEqual([contexto.tendencias, contexto.competencia], [[], []]);
  const reservas = crearReservasIdeas(db, marca.id);
  let llamadas = 0;
  const mock: MotorIdeas = { ...motorIdeasMock, async generar(...args) {
    llamadas++;
    return motorIdeasMock.generar(...args);
  } };
  const generar = crearGeneradorIdeas(reservas, mock, 3, () => construir(marca.id));
  const peticion = { clave: crypto.randomUUID(), cantidad: 1 };
  const [primera, simultanea] = await Promise.all([generar(peticion), generar(peticion)]);
  const guardada = [primera, simultanea].find(({ estado }) => estado === "guardada");
  assert.ok(guardada && "ideas" in guardada && guardada.ideas);
  assert.equal(guardada.ideas.length, 1);
  assert.equal(llamadas, 1);
  assert.equal((await generar(peticion)).estado, "repetida");
  assert.equal((await generar({ ...peticion, cantidad: 2 })).estado, "conflicto");
  for (const cantidad of [3, 5]) {
    const respuesta = await generar({ clave: crypto.randomUUID(), cantidad });
    assert.ok("ideas" in respuesta && respuesta.ideas);
    assert.equal(respuesta.ideas.length, cantidad);
    assert.ok(respuesta.ideas.every(({ titulo }) => titulo.startsWith("Simulación")));
  }
  assert.equal((await generar({ clave: crypto.randomUUID() })).estado, "cuota");
  const repo = crearRepositorioIdeas(db, marca.id);
  assert.deepEqual((await repo.obtener(guardada.ideas[0].id))?.evidencias, []);
  const otro = crearGeneradorIdeas(crearReservasIdeas(db, otra.id), mock, 3, () => construir(otra.id));
  assert.equal((await otro(peticion)).estado, "guardada");
  assert.equal(await crearRepositorioIdeas(db, otra.id).obtener(guardada.ideas[0].id), null);
  await assert.rejects(generar({ clave: crypto.randomUUID(), cantidad: 6 }));

  const base = salidaIdeas.parse((await mock.generar(solicitarIdeas.parse(peticion), "", new AbortController().signal)).resultado);
  const preferencias = { muestra: 2, patrones: [{ estado: "descartada", formato: "reel" as const, cantidad: 2,
    motivo: "Repetición de una propuesta", ejemplos: ["Enfoque descartado"] }] };
  for (const [referencia, errorEsperado] of [["E1", null], ["E99", "respuesta_invalida"], ["error", "tiempo"]] as const) {
    const real: MotorIdeas = { proveedor: "anthropic", modelo: "fixture", async generar(_solicitud, json) {
      assert.match(json, /"codigo":"E1"/);
      assert.doesNotMatch(json, new RegExp(perfil.id));
      assert.deepEqual(JSON.parse(json).preferenciasEditoriales, preferencias);
      if (referencia === "error") throw new ErrorGeneradorIdeas("tiempo", { tokensEntrada: 90 });
      return { resultado: { ideas: [{ ...base.ideas[0], referencias: [{ codigo: referencia, relevancia: "Respeta el tono" }] }] },
        uso: { tokensEntrada: 90, tokensSalida: 20 } };
    } };
    const salida = await crearGeneradorIdeas(reservas, real, 10, async () => contexto, async () => preferencias)({
      clave: crypto.randomUUID(), cantidad: 1,
    });
    assert.ok("generacion" in salida && salida.generacion);
    assert.equal(salida.generacion.error, errorEsperado);
    assert.equal(salida.generacion.tokensEntrada, 90);
    if (errorEsperado === null) {
      assert.ok("ideas" in salida && salida.ideas);
      assert.equal((await repo.obtener(salida.ideas[0].id))?.evidencias[0].perfilId, perfil.id);
    } else assert.equal(salida.generacion.cantidad, 0);
  }
  const incompleta = await crearGeneradorIdeas(reservas, {
    proveedor: "anthropic", modelo: "fixture", async generar() { return { resultado: { ideas: [] } }; },
  }, 10, async () => contexto)({ clave: crypto.randomUUID(), cantidad: 1 });
  assert.ok("generacion" in incompleta && incompleta.generacion?.error === "respuesta_invalida");
});

test("el cliente Anthropic genera JSON con transporte simulado, sin herramientas y con conteo previo", async () => {
  const solicitud = solicitarIdeas.parse({ clave: crypto.randomUUID(), cantidad: 1 });
  const signal = new AbortController().signal;
  const idea = (await motorIdeasMock.generar(solicitud, "", signal)).resultado;
  const llamadas: string[] = [];
  let entrada = 150;
  let truncada = false;
  const configurar = () => configurarIdeas({
    IDEAS_PROVIDER: "anthropic", IDEAS_ANTHROPIC_MODEL: "claude-haiku-5-5", ANTHROPIC_API_KEY: "ficticia",
    IDEAS_MAX_COST_USD: "0.01", IDEAS_INPUT_USD_PER_MTOK: "0.10", IDEAS_OUTPUT_USD_PER_MTOK: "0.50",
  }, async (url, init) => {
    const ruta = new URL(String(url)).pathname;
    llamadas.push(ruta);
    const cuerpo = JSON.parse(String(init?.body));
    assert.equal(cuerpo.tools, undefined);
    assert.equal(cuerpo.output_config.format.type, "json_schema");
    if (ruta.endsWith("/count_tokens")) return Response.json({ input_tokens: entrada });
    assert.equal(cuerpo.max_tokens, 2000);
    return Response.json({
      id: "msg_ideas", type: "message", role: "assistant", model: "claude-haiku-5-5",
      content: [{ type: "text", text: truncada ? '{"ideas":[' : JSON.stringify(idea) }],
      stop_reason: truncada ? "max_tokens" : "end_turn", stop_sequence: null,
      usage: { input_tokens: 150, output_tokens: 75 },
    });
  }).motor;
  const salida = await configurar().generar(solicitud, "datos", signal);
  assert.equal(salidaIdeas.parse(salida.resultado).ideas.length, 1);
  assert.equal(salida.uso?.tokensSalida, 75);
  assert.deepEqual(llamadas, ["/v1/messages/count_tokens", "/v1/messages"]);
  entrada = 60000;
  llamadas.length = 0;
  await assert.rejects(configurar().generar(solicitud, "datos", signal), { codigo: "limite_entrada" });
  assert.deepEqual(llamadas, ["/v1/messages/count_tokens"]);
  entrada = 150;
  truncada = true;
  await assert.rejects(configurar().generar(solicitud, "datos", signal),
    { codigo: "limite_salida", uso: { tokensEntrada: 150, tokensSalida: 75, costoEstimadoUsd: 0.0000525 } });
});

test("el presupuesto corta antes de generar y se respetan las variables de límites", async () => {
  const configuracion = configurarIdeas({ IDEAS_MAX_PER_REQUEST: "2", IDEAS_MAX_DAILY_GENERATIONS: "4", IDEAS_DAILY_LIMIT: "9" });
  assert.equal(configuracion.maxPorSolicitud, 2);
  assert.equal(configuracion.limiteDiario, 4);
  assert.equal(configurarIdeas({ IDEAS_DAILY_LIMIT: "9" }).limiteDiario, 9);
  assert.throws(() => configurarIdeas({ IDEAS_MAX_PER_REQUEST: "6" }));
  const rutas: string[] = [];
  const { motor } = configurarIdeas({
    IDEAS_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "fixture", IDEAS_ANTHROPIC_MODEL: "claude-haiku-5-5",
    IDEAS_MAX_COST_USD: "0.001", IDEAS_INPUT_USD_PER_MTOK: "0.1", IDEAS_OUTPUT_USD_PER_MTOK: "0.5",
  }, async (url) => {
    rutas.push(new URL(String(url)).pathname);
    return Response.json({ input_tokens: 150 });
  });
  await assert.rejects(motor.generar(solicitarIdeas.parse({ clave: crypto.randomUUID() }), "datos", new AbortController().signal),
    { codigo: "presupuesto" });
  assert.deepEqual(rutas, ["/v1/messages/count_tokens"]);
});
