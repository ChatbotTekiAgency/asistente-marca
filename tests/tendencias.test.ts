import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { cuentas, fuentesTendencias, posts, resultadosTendencias, solicitudesTendencias } from "../src/db/schema.ts";
import { ErrorMotorTendencias, respuestaTendencias, salidaProveedorTendencias } from "../src/lib/tendencias/contrato.ts";
import { CACHE_TENDENCIAS_MS, crearRepositorioTendencias } from "../src/lib/tendencias/repositorio.ts";
import { crearServicioTendencias } from "../src/lib/tendencias/servicio.ts";
import { mensajeLecturaTendencias, operarTendencias } from "../src/app/dashboard/tendencias/operacion.ts";

const evidencias = [
  { titulo: "Fuente simulada uno", url: "https://investigacion.test/a", sitio: "Sitio simulado", publicadaEl: "2026-11-01" },
  { titulo: "Fuente simulada dos", url: "https://investigacion.test/b" },
];
const propuestas = Array.from({ length: 4 }, (_, i) => ({
  titulo: `Tendencia simulada ${i + 1}`, descripcion: "Descripción para verificar el contrato.",
  relevanciaMarca: "La propuesta se relaciona con la audiencia de prueba.", ejemploAplicacion: "Producir un reel con tres escenas.",
  formato: "reel", publicoObjetivo: "Audiencia de prueba", relevancia: "alto",
  urlsFuentes: i === 0 ? evidencias.map(({ url }) => url) : [evidencias[0].url],
}));
const salida = { propuestas, evidencias, uso: { tokensEntrada: 340, tokensSalida: 200, costoEstimadoUsd: 0.0024 } };

async function confirmar(servicio: ReturnType<typeof crearServicioTendencias>,
  criterios: { tema?: string; mercado?: string } = {}, clave = crypto.randomUUID()) {
  const previa = await servicio.consultar(criterios);
  assert.equal(previa.estado, "requiere_confirmacion");
  assert.ok("huella" in previa);
  return { ...criterios, clave, confirmada: true, huella: previa.huella };
}

test("el contrato exige cuatro resultados completos con fuentes HTTPS y fechas válidas", () => {
  const tendencias = propuestas.map(({ urlsFuentes, ...fila }) => ({
    ...fila, id: crypto.randomUUID(), investigadaEn: "2026-11-21T00:00:00.000Z",
    fuentes: evidencias.filter(({ url }) => urlsFuentes.includes(url)),
  }));
  assert.equal(respuestaTendencias.safeParse({ tendencias }).success, true);
  assert.equal(respuestaTendencias.safeParse({ tendencias: tendencias.slice(1) }).success, false);
  assert.equal(respuestaTendencias.safeParse({ tendencias: [...tendencias, { ...tendencias[0], id: crypto.randomUUID() }] }).success, false);
  for (const fuente of [
    { ...evidencias[0], url: "dominio inválido" },
    { ...evidencias[0], url: "http://investigacion.test/a" },
    { ...evidencias[0], url: "https://usuario:clave@investigacion.test/a" },
    { ...evidencias[0], publicadaEl: "2026-11-31" },
  ]) {
    assert.equal(respuestaTendencias.safeParse({ tendencias: [{ ...tendencias[0], fuentes: [fuente] }, ...tendencias.slice(1)] }).success, false);
  }
  for (const fila of [{ ...tendencias[0], publicoObjetivo: undefined }, { ...tendencias[0], fuentes: [] }]) {
    assert.equal(respuestaTendencias.safeParse({ tendencias: [fila, ...tendencias.slice(1)] }).success, false);
  }
  assert.equal(salidaProveedorTendencias.safeParse(salida).success, true);
});

test("persiste una investigación por clave y cuenta, conserva datos previos y revierte fallos de escritura", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  const migraciones = readMigrationFiles({ migrationsFolder: "drizzle" });
  for (const fila of migraciones.slice(0, 8)) await client.exec(fila.sql.join("\n"));
  const [marca, otra] = await db.insert(cuentas).values([
    { igUserId: "marca_tendencias", username: "marca" }, { igUserId: "otra_tendencias", username: "otra" },
  ]).returning();
  const propias = await db.insert(posts).values(Array.from({ length: 47 }, (_, i) => ({
    cuentaId: marca.id, instagramId: String(i), shortcode: String(i), url: `https://www.instagram.com/p/${i}/`,
    publicadaEn: new Date("2026-11-01"), tipo: "imagen" as const,
  }))).returning();
  for (const fila of migraciones.slice(8, 10)) {
    const migracion = fila.sql.join("\n");
    assert.doesNotMatch(migracion, /\b(?:DROP|TRUNCATE|DELETE FROM|UPDATE)\b(?! no action)/i);
    await client.exec(migracion);
  }
  assert.deepEqual(await db.select().from(cuentas).where(eq(cuentas.id, marca.id)), [marca]);
  assert.deepEqual(await db.select().from(posts).where(eq(posts.cuentaId, marca.id)).orderBy(posts.id),
    propias.sort((a, b) => a.id.localeCompare(b.id)));

  const repo = crearRepositorioTendencias(db, marca.id);
  let llamadas = 0;
  const identidad = { proveedor: "mock", modelo: "fixture-local" } as const;
  let iniciar!: () => void;
  const inicio = new Promise<void>((resolver) => { iniciar = resolver; });
  let continuar!: () => void;
  const espera = new Promise<void>((resolver) => { continuar = resolver; });
  const motor = {
    ...identidad,
    async investigar(contexto: { instrucciones: string; referenciaMarca: string }, signal: AbortSignal) {
      llamadas += 1;
      assert.match(contexto.instrucciones, /cuatro tendencias/);
      assert.doesNotMatch(contexto.instrucciones, /Contenido exclusivo/);
      assert.match(contexto.referenciaMarca, /Contenido exclusivo/);
      assert.equal(signal.aborted, false);
      iniciar();
      await espera;
      return salida;
    },
  };
  const servicio = crearServicioTendencias(repo, motor, async () => ({ nombre: "Contenido exclusivo" }),
    { cuentaId: marca.id, limiteDiario: 10 });
  const clave = crypto.randomUUID();
  const confirmada = await confirmar(servicio, {}, clave);
  assert.equal(llamadas, 0);
  const primera = servicio.investigar(confirmada);
  await inicio;
  const repeticionDurante = await servicio.investigar({ ...confirmada, clave: crypto.randomUUID() });
  assert.equal(repeticionDurante.estado, "en_curso");
  assert.ok("investigacion" in repeticionDurante);
  assert.equal(repeticionDurante.investigacion?.resultado, null);
  continuar();
  const completada = await primera;
  assert.ok("investigacion" in completada);
  const guardada = completada.investigacion;
  assert.equal(guardada?.solicitud.estado, "completada");
  assert.ok(guardada?.resultado);
  assert.equal(guardada.resultado.tendencias.length, 4);
  assert.equal(guardada.resultado.tendencias[0].fuentes.length, 2);
  assert.equal(guardada.resultado.tendencias[0].fuentes[1].publicadaEl, undefined);
  assert.equal(guardada.solicitud.tokensEntrada, 340);
  assert.equal(guardada.solicitud.costoEstimadoUsd, 0.0024);
  assert.equal(guardada.solicitud.expiraCacheEn!.getTime() - guardada.solicitud.finalizadaEn!.getTime(), CACHE_TENDENCIAS_MS);
  assert.deepEqual(await servicio.investigar(confirmada), { estado: "repetida", investigacion: guardada });
  assert.deepEqual(await servicio.investigar({ ...confirmada, clave: crypto.randomUUID() }), { estado: "cache", investigacion: guardada });
  assert.deepEqual(await servicio.obtener(guardada.solicitud.id), guardada);
  assert.equal(llamadas, 1);
  const otroServicio = crearServicioTendencias(crearRepositorioTendencias(db, otra.id),
    { ...identidad, investigar: async () => salida }, async () => null, { cuentaId: otra.id });
  assert.equal(await otroServicio.obtener(guardada.solicitud.id), null);
  assert.deepEqual(await otroServicio.historial(), []);
  assert.equal((await otroServicio.investigar(confirmada)).estado, "requiere_confirmacion");
  const mismaClaveOtraCuenta = await otroServicio.investigar(await confirmar(otroServicio, {}, clave));
  assert.ok("investigacion" in mismaClaveOtraCuenta);
  assert.notEqual(mismaClaveOtraCuenta.investigacion?.solicitud.id, guardada.solicitud.id);
  assert.equal((await servicio.historial()).length, 1);
  assert.throws(() => servicio.historial(21));

  for (const invalida of [
    { ...salida, propuestas: propuestas.slice(1) },
    { ...salida, propuestas: [...propuestas, propuestas[0]] },
    { ...salida, propuestas: [{ ...propuestas[0], urlsFuentes: ["https://investigacion.test/inventada"] }, ...propuestas.slice(1)] },
  ]) {
    const servicioInvalido = crearServicioTendencias(repo, { ...identidad, investigar: async () => invalida }, async () => null,
      { cuentaId: marca.id, limiteDiario: 10 });
    const fallida = await servicioInvalido.investigar(await confirmar(servicioInvalido));
    assert.ok("investigacion" in fallida);
    assert.equal(fallida.investigacion?.solicitud.error, "respuesta_invalida");
    assert.equal(fallida.investigacion?.resultado, null);
  }
  const nueva = await repo.reservar(crypto.randomUUID(), identidad, {
    huellaCache: "a".repeat(64), tema: "reversión", mercado: null, reservaEstimadaUsd: 0, limiteDiario: 10,
  });
  assert.equal(nueva.tipo, "adquirida");
  await client.exec("ALTER TABLE fuentes_tendencias ADD CONSTRAINT fallo_local CHECK (titulo <> 'Fuente forzada')");
  const rota = respuestaTendencias.parse({ tendencias: guardada.resultado.tendencias.map((fila) => ({
    ...fila, id: crypto.randomUUID(), fuentes: [{ ...fila.fuentes[0], titulo: "Fuente forzada" }],
  })) });
  await assert.rejects(repo.completar(nueva.solicitud.id, rota, undefined, new Date()));
  assert.equal((await repo.obtener(nueva.solicitud.id))?.solicitud.estado, "en_curso");
  assert.equal((await db.select({ total: count() }).from(resultadosTendencias))[0].total, 8);
  assert.equal((await db.select({ total: count() }).from(fuentesTendencias))[0].total, 10);
});

test("reutiliza solo caché vigente y exige confirmación, cuota y contexto coincidentes", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  for (const fila of readMigrationFiles({ migrationsFolder: "drizzle" })) await client.exec(fila.sql.join("\n"));
  const [marca] = await db.insert(cuentas).values({ igUserId: "cache_tendencias", username: "marca" }).returning();
  const repo = crearRepositorioTendencias(db, marca.id);
  let perfil = { nombre: "Marca", sector: "Diseño" };
  let llamadas = 0;
  let fallo = false;
  const motor = {
    proveedor: "anthropic" as const, modelo: "fixture",
    estimacion: { reservaUsd: 0.03, maximoUsd: 0.05, maxBusquedas: 2, maxEntrada: 5000, maxSalidaPorPaso: 1500 },
    async investigar() {
      llamadas++;
      if (fallo) throw new ErrorMotorTendencias("busqueda", { busquedasWeb: 1, tokensEntrada: 500, costoEstimadoUsd: 0.011 });
      return salida;
    },
  };
  const opciones = { cuentaId: marca.id, horasCache: 12, limiteDiario: 3, mercadoPorDefecto: "Colombia" };
  const servicio = crearServicioTendencias(repo, motor, async () => perfil, opciones);
  const criterio = { tema: "Diseño   Editorial" };
  const entrada = await confirmar(servicio, criterio);
  await assert.rejects(servicio.investigar({ ...entrada, confirmada: false }));
  assert.equal(llamadas, 0);
  assert.deepEqual(await servicio.historial(), []);
  const original = await servicio.investigar(entrada);
  assert.equal(original.estado, "completada");
  assert.ok("investigacion" in original && original.investigacion);
  const { solicitud } = original.investigacion;
  assert.equal(solicitud.expiraCacheEn!.getTime() - solicitud.finalizadaEn!.getTime(), 12 * 3_600_000);
  assert.equal(solicitud.reservaEstimadaUsd, 0.03);
  assert.deepEqual(await servicio.consultar({ tema: "disen\u0303o editorial", mercado: " COLOMBIA " }),
    { estado: "cache", investigacion: original.investigacion });
  assert.equal((await servicio.consultar({ tema: "Packaging" })).estado, "requiere_confirmacion");
  assert.equal((await servicio.consultar({ ...criterio, mercado: "México" })).estado, "requiere_confirmacion");
  const otroModelo = crearServicioTendencias(repo, { ...motor, modelo: "fixture-dos" }, async () => perfil, opciones);
  assert.equal((await otroModelo.consultar(criterio)).estado, "requiere_confirmacion");
  perfil = { nombre: "Marca", sector: "Arquitectura" };
  assert.equal((await servicio.investigar(entrada)).estado, "requiere_confirmacion");
  perfil = { nombre: "Marca", sector: "Diseño" };
  assert.equal(llamadas, 1);

  await db.update(solicitudesTendencias).set({ finalizadaEn: new Date("2024-01-01"), expiraCacheEn: new Date("2024-01-02") })
    .where(eq(solicitudesTendencias.id, solicitud.id));
  assert.equal((await servicio.obtener(solicitud.id))?.cacheVencida, true);
  assert.equal((await servicio.historial())[0].cacheVencida, true);
  const nueva = await confirmar(servicio, criterio);
  assert.equal(llamadas, 1);
  const bloqueada = await repo.reservar(crypto.randomUUID(), motor, {
    huellaCache: solicitud.huellaCache!, tema: solicitud.tema, mercado: solicitud.mercado, reservaEstimadaUsd: 0.03, limiteDiario: 3,
  });
  assert.equal(bloqueada.tipo, "adquirida");
  await db.update(solicitudesTendencias).set({ venceEn: new Date(0) }).where(eq(solicitudesTendencias.id, bloqueada.solicitud.id));
  fallo = true;
  const fallida = await servicio.investigar(nueva);
  assert.equal(fallida.estado, "fallida");
  assert.ok("investigacion" in fallida);
  assert.equal(fallida.investigacion?.solicitud.busquedasWeb, 1);
  assert.equal(fallida.investigacion?.solicitud.tokensEntrada, 500);
  assert.equal((await servicio.obtener(bloqueada.solicitud.id))?.solicitud.error, "vencida");
  assert.equal((await servicio.investigar(await confirmar(servicio, { tema: "nuevo" }))).estado, "cuota");
  assert.equal(llamadas, 2);

  fallo = false;
  const unCupo = crearServicioTendencias(repo, motor, async () => perfil, { ...opciones, limiteDiario: 4 });
  const [primera, segunda] = await Promise.all([
    confirmar(unCupo, { tema: "tema uno" }), confirmar(unCupo, { tema: "tema dos" }),
  ]);
  const concurrentes = await Promise.all([unCupo.investigar(primera), unCupo.investigar(segunda)]);
  assert.deepEqual(concurrentes.map(({ estado }) => estado).sort(), ["completada", "cuota"]);
  assert.equal(llamadas, 3);

  const caro = crearServicioTendencias(repo, {
    ...motor, estimacion: { ...motor.estimacion, maximoUsd: 0.01 },
  }, async () => perfil, opciones);
  assert.equal((await caro.consultar({ tema: "fuera de presupuesto" })).estado, "fuera_presupuesto");
  assert.equal(llamadas, 3);
});

test("el dashboard exige sesión y confirmación, proyecta cuatro tarjetas y distingue errores de ejecución", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  for (const fila of readMigrationFiles({ migrationsFolder: "drizzle" })) await client.exec(fila.sql.join("\n"));
  const [marca, otra] = await db.insert(cuentas).values([
    { igUserId: "ui_a", username: "marca" }, { igUserId: "ui_b", username: "otra" },
  ]).returning();
  let llamadas = 0;
  let error: "sin_evidencia" | "proveedor" | "presupuesto" | null = null;
  const motor = {
    proveedor: "mock" as const, modelo: "fixture-ui",
    async investigar() {
      llamadas++;
      if (error) throw new ErrorMotorTendencias(error);
      return salida;
    },
  };
  const servicio = crearServicioTendencias(crearRepositorioTendencias(db, marca.id), motor, async () => null,
    { cuentaId: marca.id, limiteDiario: 5 });
  const resolver = async () => servicio;
  const consultar = { tipo: "consultar", datos: { tema: "diseño", mercado: "colombia" } };
  assert.equal((await operarTendencias(consultar, async () => null)).tipo, "error");
  const previa = await operarTendencias(consultar, resolver);
  assert.equal(previa.tipo, "confirmacion");
  assert.equal(llamadas, 0);
  const ejecutar = { tipo: "confirmar", datos: { ...consultar.datos, confirmada: true, clave: crypto.randomUUID(), huella: previa.huella } };
  for (const datos of [{ ...ejecutar.datos, presupuesto: 999 }, { ...ejecutar.datos, confirmada: false }]) {
    assert.equal((await operarTendencias({ ...ejecutar, datos }, resolver)).tipo, "error");
  }
  assert.equal(llamadas, 0);
  const resultado = await operarTendencias(ejecutar, resolver);
  assert.equal(resultado.tipo, "investigacion");
  assert.equal(resultado.investigacion.proveedor, "mock");
  assert.equal(resultado.investigacion.tendencias.length, 4);
  assert.equal(resultado.investigacion.tendencias[0].fuentes[1].url, evidencias[1].url);
  assert.ok(!("cuentaId" in resultado.investigacion));
  assert.ok(!("huellaCache" in resultado.investigacion));
  assert.deepEqual(await operarTendencias(consultar, resolver), resultado);
  assert.equal(llamadas, 1);

  const otro = crearServicioTendencias(crearRepositorioTendencias(db, otra.id), motor, async () => null, { cuentaId: otra.id });
  assert.equal((await operarTendencias({ tipo: "estado", id: resultado.investigacion.id }, async () => otro)).tipo, "error");
  assert.equal((await operarTendencias(consultar, async () => otro)).tipo, "confirmacion");
  assert.equal(llamadas, 1);
  for (const [codigo, mensaje] of [["sin_evidencia", /insuficientes/], ["proveedor", /proveedor/], ["presupuesto", /presupuesto/]] as const) {
    error = codigo;
    const consulta = { tipo: "consultar", datos: { tema: codigo } };
    const cotizacion = await operarTendencias(consulta, resolver);
    assert.equal(cotizacion.tipo, "confirmacion");
    const fallida = await operarTendencias({ tipo: "confirmar", datos: {
      ...consulta.datos, confirmada: true, clave: crypto.randomUUID(), huella: cotizacion.huella,
    } }, resolver);
    assert.equal(fallida.tipo, "investigacion");
    assert.equal(fallida.investigacion.estado, "fallida");
    assert.match(fallida.mensaje ?? "", mensaje);
  }
  assert.match(mensajeLecturaTendencias({ code: "42703", detalle: "privado" }), /0008 y 0009/);
});
