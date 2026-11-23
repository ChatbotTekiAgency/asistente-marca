import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { conversaciones, cuotasChat, mensajes } from "../src/db/schema.ts";
import { ErrorChat, leerTurno, MAX_MENSAJES, MAX_TURNO_BYTES, turnoSchema } from "../src/lib/chat/contrato.ts";
import { responderMock } from "../src/lib/chat/proveedor.ts";
import { crearRepositorioChat } from "../src/lib/chat/repositorio.ts";
import { transmitirTurno } from "../src/lib/chat/respuesta.ts";
import { crearBaseDePruebas } from "./chat-db.ts";

function mensaje(conversacionId = crypto.randomUUID(), texto = "Una consulta") {
  return { conversacionId, texto, solicitudId: crypto.randomUUID() };
}

test("valida IDs y contenido, rechaza historial falso y limita el cuerpo por bytes", async () => {
  const turno = mensaje();
  const request = (body: string) => new Request("http://test/api/chat", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  });
  assert.deepEqual(await leerTurno(request(JSON.stringify(turno))), turno);
  for (const body of [
    { ...turno, cuentaId: crypto.randomUUID() }, { ...turno, messages: [] },
    { ...turno, texto: "   " }, { ...turno, texto: "a".repeat(2001) },
    { ...turno, texto: "nulo\0" }, { ...turno, solicitudId: "otro" },
  ]) assert.equal(turnoSchema.safeParse(body).success, false);
  await assert.rejects(leerTurno(request("no-json")), { status: 400 });
  await assert.rejects(leerTurno(request("ñ".repeat(MAX_TURNO_BYTES / 2 + 1))), { status: 413 });
});

test("crea, persiste, aísla cuentas y reproduce el turno guardado sin cargar cuota otra vez", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  const [marca, otra] = await Promise.all([cuenta("marca"), cuenta("otra")]);
  const repo = crearRepositorioChat(db);
  const id = await repo.crear(marca);
  const idOtra = await repo.crear(otra);
  const turno = mensaje(id);
  assert.deepEqual((await repo.listar(marca)).map((fila) => fila.id), [id]);
  assert.deepEqual((await repo.listar(otra)).map((fila) => fila.id), [idOtra]);
  await assert.rejects(repo.reservar(otra, turno, 1), { status: 404 });

  const transmitir = async () => transmitirTurno({
    cuentaId: marca, turno, reserva: await repo.reservar(marca, turno, 1), generar: responderMock,
    signal: new AbortController().signal, completar: repo.completar, liberar: repo.liberar,
  });
  const primera = await transmitir();
  assert.equal(primera.headers.get("x-vercel-ai-ui-message-stream"), "v1");
  assert.match(await primera.text(), /Respuesta de prueba/);
  const historial = await repo.historial(marca, id);
  assert.deepEqual(historial.map((fila) => fila.role), ["user", "assistant"]);
  assert.equal(historial[0].id, turno.solicitudId);
  assert.equal((await repo.listar(marca))[0].titulo, turno.texto);
  assert.deepEqual(await repo.historial(otra, id), []);

  assert.match(await (await transmitir()).text(), new RegExp(historial[1].id));
  assert.equal((await repo.historial(marca, id)).length, 2);
  assert.equal((await db.select().from(cuotasChat))[0].solicitudes, 1);
  await assert.rejects(repo.reservar(marca, { ...turno, texto: "Distinto" }, 1), { status: 409 });
  await assert.rejects(repo.reservar(marca, mensaje(id), 1), { status: 429 });
});

test("cuota compartida, exclusión del turno activo y reintento tras error sin duplicar el mensaje", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  const [marca, otra] = await Promise.all([cuenta("marca"), cuenta("otra")]);
  const repo = crearRepositorioChat(db);
  const [id, paralelo, idOtra] = await Promise.all([repo.crear(marca), repo.crear(marca), repo.crear(otra)]);
  const turno = mensaje(id);
  const reserva = await repo.reservar(marca, turno, 2);
  assert.equal(reserva.tipo, "nueva");
  await assert.rejects(repo.reservar(marca, turno, 2), { status: 409 });

  const fallida = transmitirTurno({
    cuentaId: marca, turno, reserva,
    generar: async (_contexto, _signal, emitir) => {
      emitir("Fragmento parcial.");
      throw new Error("interno-que-no-debe-salir");
    },
    signal: new AbortController().signal, completar: repo.completar, liberar: repo.liberar,
  });
  const error = await fallida.text();
  assert.match(error, /"type":"error"/);
  assert.doesNotMatch(error, /interno-que-no-debe-salir/);
  assert.deepEqual((await repo.historial(marca, id)).map((fila) => fila.role), ["user"]);

  const competicion = await Promise.allSettled([
    repo.reservar(marca, turno, 2), repo.reservar(marca, mensaje(paralelo), 2),
  ]);
  assert.equal(competicion.filter((resultado) => resultado.status === "fulfilled").length, 1);
  const negada = competicion.find((resultado) => resultado.status === "rejected");
  assert.ok(negada?.reason instanceof ErrorChat);
  assert.equal(negada.reason.status, 429);
  assert.equal((await repo.reservar(otra, mensaje(idOtra), 2)).tipo, "nueva");
  assert.equal((await db.select().from(cuotasChat).where(eq(cuotasChat.cuentaId, marca)))[0].solicitudes, 2);
  assert.equal((await db.select().from(mensajes).where(eq(mensajes.solicitudId, turno.solicitudId))).length, 1);
});

test("limita mensajes y usa la reserva vigente para completar un reintento", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  const marca = await cuenta("marca");
  const repo = crearRepositorioChat(db);
  const id = await repo.crear(marca);
  const turno = mensaje(id);
  const inicial = await repo.reservar(marca, turno, 4);
  assert.equal(inicial.tipo, "nueva");
  await db.update(conversaciones).set({ reservaHasta: new Date(0) }).where(eq(conversaciones.id, id));
  const vigente = await repo.reservar(marca, turno, 4);
  assert.equal(vigente.tipo, "nueva");
  const respuesta = { id: crypto.randomUUID(), partes: [{ type: "text" as const, text: "Prueba" }],
    uso: { inputTokens: 12, outputTokens: 7 } };
  await assert.rejects(repo.completar(marca, turno, inicial.intento, respuesta), { status: 409 });
  await repo.completar(marca, turno, vigente.intento, respuesta);
  const [persistida] = await db.select({ uso: mensajes.uso }).from(mensajes).where(eq(mensajes.id, respuesta.id));
  assert.deepEqual(persistida.uso, respuesta.uso);
  await db.insert(mensajes).values(Array.from({ length: MAX_MENSAJES - 2 }, () => ({
    conversacionId: id, solicitudId: crypto.randomUUID(), rol: "user" as const,
    partes: [{ type: "text" as const, text: "Turno histórico" }],
  })));
  await assert.rejects(repo.reservar(marca, mensaje(id), 4), { status: 409, message: /alcanzó su límite/ });
  assert.equal((await db.select().from(cuotasChat))[0].solicitudes, 2);
});
