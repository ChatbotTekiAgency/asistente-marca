import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { cuentas, posts, perfilesMarca, competidores, postsCompetidor, enriquecimientos, evidenciasIdeas, evaluacionesIdeas } from "../src/db/schema.ts";
import { crearRepositorioEvaluaciones } from "../src/lib/ideas/evaluaciones.ts";
import type { DatosEvaluacion } from "../src/lib/ideas/evaluacion-contrato.ts";
import { crearRepositorioIdeas, ErrorEvidenciaIdea } from "../src/lib/ideas/repositorio.ts";
import { crearRepositorioTendencias } from "../src/lib/tendencias/repositorio.ts";
import { crearServicioTendencias } from "../src/lib/tendencias/servicio.ts";
import { motorTendenciasMock } from "../src/lib/tendencias/mock.ts";
import { operarIdeas } from "../src/app/dashboard/ideas/operacion.ts";

test("la operación real exige confirmación y rechaza parámetros inválidos antes de generar", async () => {
  const inesperada = async () => assert.fail("No se esperaba una escritura");
  let llamadas = 0;
  const banco = { editar: inesperada, cambiarEstado: inesperada };
  const generar = async () => {
    llamadas += 1;
    return { estado: "sin_cuenta" as const };
  };
  const operacion = { tipo: "generar", modo: "anthropic", confirmada: false, datos: { clave: crypto.randomUUID(), cantidad: 3 } };
  assert.equal((await operarIdeas(operacion, banco, () => "anthropic", generar)).ok, false);
  assert.equal((await operarIdeas({ ...operacion, confirmada: true }, banco, () => "mock", generar)).ok, false);
  assert.equal((await operarIdeas({ ...operacion, datos: { ...operacion.datos, cantidad: 6 } }, banco, () => "anthropic", generar)).ok, false);
  assert.equal(llamadas, 0);
  await operarIdeas({ ...operacion, confirmada: true }, banco, () => "anthropic", generar);
  await operarIdeas({ ...operacion, modo: "mock" }, banco, () => "mock", generar);
  assert.equal(llamadas, 2);
});

test("migra sin alterar datos, guarda ideas y evidencia por cuenta y protege reintentos", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  const migraciones = readMigrationFiles({ migrationsFolder: "drizzle" });
  for (const m of migraciones.slice(0, 10)) await client.exec(m.sql.join("\n"));
  const [marca, otra] = await db.insert(cuentas).values([{ username: "marca", igUserId: "1" }, { username: "otra", igUserId: "2" }]).returning();
  const fecha = new Date("2026-11-01T12:00:00Z");
  const [post, ajeno] = await db.insert(posts).values([marca, otra].map(({ id }, i) => ({
    cuentaId: id, instagramId: String(i), shortcode: `Post_${i}`, url: `https://www.instagram.com/p/Post_${i}/`,
    publicadaEn: fecha, tipo: "imagen" as const, caption: "Mucho que contar",
  }))).returning();
  await client.exec(migraciones[10].sql.join("\n"));
  await client.exec(migraciones[11].sql.join("\n"));
  assert.deepEqual((await db.select().from(posts)).sort((a, b) => a.instagramId.localeCompare(b.instagramId)), [post, ajeno]);
  const [perfil] = await db.insert(perfilesMarca).values({ cuentaId: marca.id, tono: "Claro" }).returning();
  const [rival] = await db.insert(competidores).values({ cuentaId: marca.id, username: "rival" }).returning();
  const [rivalPost] = await db.insert(postsCompetidor).values({ competidorId: rival.id, instagramId: "rival", shortcode: "Rival",
    tipo: "imagen", hashtags: [], url: "https://www.instagram.com/p/Rival/", publicadaEn: fecha }).returning();
  const [enriquecimiento] = await db.insert(enriquecimientos).values({
    postId: post.id, versionEsquema: 1, versionPrompt: 1, proveedor: "anthropic", modelo: "fixture",
    modalidad: "texto", hashContenido: "a".repeat(64), estado: "completado", intento: crypto.randomUUID(), venceEn: fecha,
    analizadoEn: fecha, clasificacion: { temaPrincipal: "Marca", temasSecundarios: [], intencion: "educativa", tono: "Claro",
      gancho: "pregunta", explicacionGancho: null, resumen: "Resumen de prueba", descripcionVisual: null },
  }).returning();
  const tendenciaServicio = crearServicioTendencias(crearRepositorioTendencias(db, marca.id), {
    ...motorTendenciasMock, proveedor: "anthropic", estimacion: { reservaUsd: 0, maximoUsd: 1, maxBusquedas: 1, maxEntrada: 100, maxSalidaPorPaso: 10 },
  }, async () => null, { cuentaId: marca.id });
  const previa = await tendenciaServicio.consultar();
  assert.equal(previa.estado, "requiere_confirmacion");
  const trend = await tendenciaServicio.investigar({ clave: crypto.randomUUID(), confirmada: true, huella: previa.huella });
  assert.ok("investigacion" in trend && trend.investigacion?.resultado);
  const tendencia = trend.investigacion.resultado.tendencias[0];
  const idea = {
    titulo: "Guía de marca", concepto: "Mostrar el proceso", objetivo: "Educar", publico: "Agencias", pilar: "Diseño", formato: "reel",
    gancho: "¿Qué hace memorable una marca?", desarrollo: "Muestra tres pasos", cta: "Guarda la guía", justificacion: "Aporta claridad",
    evidencias: [
      { tipo: "publicacion_propia", id: post.id }, { tipo: "publicacion_competidor", id: rivalPost.id },
      { tipo: "tendencia", id: tendencia.id }, { tipo: "perfil", id: perfil.id, campo: "tono" },
      { tipo: "enriquecimiento", id: enriquecimiento.id },
    ].map((fila) => ({ ...fila, relevancia: "Ilustra el tema" })),
  };
  const repo = crearRepositorioIdeas(db, marca.id);
  const externo = crearRepositorioIdeas(db, otra.id);
  const datos = { clave: crypto.randomUUID(), solicitud: "Crear una idea", proveedor: "mock", parametros: { cantidad: 1 },
    estado: "completada", ideas: [idea] };
  const ambas = await Promise.all([repo.guardarGeneracion(datos), repo.guardarGeneracion(datos)]);
  assert.deepEqual(ambas.map(({ estado }) => estado).sort(), ["guardada", "repetida"]);
  const creada = ambas[0].ideas?.[0];
  assert.ok(creada);
  assert.equal(creada.estado, "nueva");
  assert.equal((await repo.listar())[0].proveedor, "mock");
  const detalle = await repo.obtener(creada.id);
  assert.equal(detalle?.evidencias.length, 5);
  assert.equal(detalle?.evidencias[0].url, post.url);
  assert.equal(detalle?.evidencias[0].datos.likes, null);
  assert.equal((await externo.listar()).length, 0);
  assert.equal(await externo.obtener(creada.id), null);
  const cambio = { id: creada.id, revision: creada.revision, estado: "aprobada" };
  assert.equal(await externo.cambiarEstado(cambio), null);
  const aprobada = await repo.cambiarEstado(cambio);
  assert.equal(aprobada?.estado, "aprobada");
  assert.ok(aprobada);
  assert.equal(await repo.cambiarEstado(cambio), null);
  assert.equal((await repo.listar({ estado: "aprobada" })).length, 1);
  const { evidencias: referencias, ...contenido } = idea;
  assert.equal(referencias.length, 5);
  const edicion = { id: creada.id, revision: aprobada.revision, datos: { ...contenido, titulo: "Guía EDITADA %_" } };
  assert.equal(await externo.editar(edicion), null);
  const ediciones = await Promise.all([repo.editar(edicion), repo.editar(edicion)]);
  assert.equal(ediciones.filter(Boolean).length, 1);
  const filtradas = await repo.listarConEvidencias({ titulo: "editada %_", estado: "aprobada", generacionId: creada.generacionId });
  assert.equal(filtradas[0]?.idea.titulo, "Guía EDITADA %_");
  assert.equal(filtradas[0]?.evidencias[0]?.url, post.url);
  assert.equal((await externo.listarConEvidencias({ generacionId: creada.generacionId })).length, 0);
  assert.equal((await repo.listar({ titulo: "%%" })).length, 0);
  assert.equal((await repo.guardarGeneracion({ ...datos, solicitud: "Otra solicitud" })).estado, "conflicto");
  await assert.rejects(repo.guardarGeneracion({ ...datos, clave: crypto.randomUUID(), ideas: [{
    ...idea, evidencias: [{ tipo: "publicacion_propia", id: ajeno.id, relevancia: "Ajena" }],
  }] }), ErrorEvidenciaIdea);
  await assert.rejects(db.insert(evidenciasIdeas).values({ cuentaId: marca.id, ideaId: creada.id, posicion: 7,
    tipo: "publicacion_propia", postId: ajeno.id, relevancia: "Ajena", datos: {} }));
  assert.equal((await repo.historial()).length, 1);
  const fallida = await repo.guardarGeneracion({ clave: crypto.randomUUID(), solicitud: "Otro intento", proveedor: "mock",
    parametros: { cantidad: 1 }, estado: "fallida", error: "proveedor", uso: { tokensEntrada: 100 } });
  assert.equal(fallida.generacion?.cantidad, 0);
  assert.equal(fallida.generacion?.tokensEntrada, 100);
});

test("conserva ideas anteriores y guarda revisiones de evaluación aisladas con preferencias recurrentes", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  const migraciones = readMigrationFiles({ migrationsFolder: "drizzle" });
  for (const m of migraciones.slice(0, 12)) await client.exec(m.sql.join("\n"));
  const [marca, otra] = await db.insert(cuentas).values([{ username: "marca", igUserId: "1" }, { username: "otra", igUserId: "2" }]).returning();
  const banco = crearRepositorioIdeas(db, marca.id);
  const idea = { titulo: "Marco editorial", concepto: "Marco", objetivo: "Educar", publico: "Agencias", pilar: "Estrategia",
    formato: "reel", gancho: "¿Cómo?", desarrollo: "Tres pasos", cta: "Guarda", justificacion: "Valor" };
  const generacion = { clave: crypto.randomUUID(), solicitud: "Generar", parametros: { cantidad: 2 }, proveedor: "anthropic",
    modelo: "fixture", estado: "completada", ideas: [idea, { ...idea, titulo: "Otro enfoque" }] };
  const guardada = await banco.guardarGeneracion(generacion);
  assert.ok(guardada.ideas);
  await client.exec(migraciones[12].sql.join("\n"));
  assert.equal((await banco.listar()).length, 2);
  const repo = crearRepositorioEvaluaciones(db, marca.id);
  const externo = crearRepositorioEvaluaciones(db, otra.id);
  assert.equal(await repo.preferenciasEditoriales(), null);
  assert.deepEqual((await repo.historial()).mejores, []);
  const datos = { ideaId: guardada.ideas[0].id, revisionIdea: guardada.ideas[0].revision, anterior: null, calificacion: 5 };
  await assert.rejects(repo.guardar({ ...datos, calificacion: 0 }));
  await assert.rejects(repo.guardar({ ...datos, categorias: { claridad: 6 } }));
  assert.equal(await externo.guardar(datos), null);
  const primeras = await Promise.all([repo.guardar(datos), repo.guardar(datos)]);
  const primera = primeras.find((fila) => fila && typeof fila !== "string");
  assert.ok(primera && typeof primera !== "string");
  assert.equal(primeras.filter(Boolean).length, 1);
  for (const fila of guardada.ideas) {
    const descartada = await banco.cambiarEstado({ id: fila.id, revision: fila.revision, estado: "descartada" });
    assert.ok(descartada);
    const entrada: DatosEvaluacion = { ideaId: fila.id, revisionIdea: descartada.revision, anterior: fila.id === datos.ideaId ? primera.id : null,
      calificacion: 2, categorias: { claridad: 3 }, comentario: "Comentario privado" };
    assert.equal(await repo.guardar(entrada), "motivo_requerido");
    const revision = await repo.guardar({ ...entrada, motivo: "repeticion" });
    assert.ok(revision && typeof revision !== "string");
    assert.equal(revision.version, entrada.anterior ? 2 : 1);
    assert.equal(revision.categorias.claridad, 3);
    assert.equal(await repo.guardar({ ...entrada, motivo: "repeticion" }), null);
    if (entrada.anterior) assert.equal(await repo.preferenciasEditoriales(), null);
  }
  assert.equal((await repo.actuales([datos.ideaId]))[0].calificacion, 2);
  assert.deepEqual(await externo.actuales([datos.ideaId]), []);
  const historial = await repo.historial();
  assert.equal(historial.revisiones.length, 3);
  assert.equal(historial.evolucion[0].promedio, 3);
  assert.equal(historial.motivos[0].cantidad, 2);
  assert.equal(historial.descartadas.length, 2);
  assert.equal(historial.mejores[0].calificacion, 2);
  assert.deepEqual((await externo.historial()).revisiones, []);
  const preferencias = await repo.preferenciasEditoriales();
  assert.equal(preferencias?.patrones[0].cantidad, 2);
  assert.equal(preferencias?.patrones[0].ejemplos.length, 2);
  assert.doesNotMatch(JSON.stringify(preferencias), /Comentario privado/);
  assert.equal(await externo.preferenciasEditoriales(), null);
  await assert.rejects(db.insert(evaluacionesIdeas).values({
    cuentaId: otra.id, ideaId: datos.ideaId, version: 3, calificacion: 3, estadoIdea: "nueva",
    tituloIdea: "Ajena", formatoIdea: "reel", categorias: {},
  }));
});
