import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { competidores, cuentas, ingestasCompetidor, metricasPostCompetidor, posts } from "../src/db/schema.ts";
import { crearHerramientasCompetencia } from "../src/lib/chat/herramientas-competencia.ts";
import { consultarComparacionCompetitiva } from "../src/lib/competencia/comparacion.ts";
import { leerDatasetCompetidor, MAX_BYTES_JSON, MAX_FILAS_JSON } from "../src/lib/competencia/contrato-ingesta.ts";
import { gestionarCorrida, iniciarCorrida, type ClienteCorridas } from "../src/lib/competencia/corridas.ts";
import { crearIngestasCompetidor } from "../src/lib/competencia/ingestas.ts";
import { ejecutarMutacionCompetidor } from "../src/lib/competencia/operacion.ts";
import { crearRepositorioCompetencia } from "../src/lib/competencia/repositorio.ts";
import { crearBaseDePruebas } from "./chat-db.ts";

const datos = leerDatasetCompetidor(readFileSync(new URL("./fixtures/competidor-apify.json", import.meta.url)));

function causaPostgres(codigo: string, restriccion: string) {
  return (error: unknown) => {
    const causa = error instanceof Error ? error.cause : undefined;
    return !!causa && typeof causa === "object" && "code" in causa && causa.code === codigo
      && "constraint" in causa && causa.constraint === restriccion;
  };
}

test("recorre registro, ingesta, comparación y herramientas sobre el esquema migrado, con rollback e integridad por competidor", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });

  const [marca, otra] = await db.insert(cuentas).values([
    { igUserId: "1", username: "marca_e2e" }, { igUserId: "2", username: "otra_e2e" },
  ]).returning({ id: cuentas.id, username: cuentas.username });
  const propias = await db.insert(posts).values(Array.from({ length: 47 }, (_, i): typeof posts.$inferInsert => ({
    cuentaId: marca.id, instagramId: String(i), shortcode: `Propia_${i}`,
    url: `https://www.instagram.com/p/Propia_${i}/`, publicadaEn: new Date("2026-02-17T12:00:00Z"), tipo: "imagen",
  }))).returning();
  const alta = { accion: "crear", datos: { perfil: "@Rival_Prueba", activo: true } };
  const escribir = (id: string, operacion: Parameters<ReturnType<typeof crearRepositorioCompetencia>["guardar"]>[0]) =>
    crearRepositorioCompetencia(db, id).guardar(operacion, 5);
  assert.equal(await ejecutarMutacionCompetidor(alta, marca.id, async () => otra, escribir), "sin_cuenta");
  assert.equal(await ejecutarMutacionCompetidor(alta, marca.id, async () => marca, escribir), "guardado");
  assert.equal(await ejecutarMutacionCompetidor(alta, otra.id, async () => otra, escribir), "guardado");
  const [rival] = await crearRepositorioCompetencia(db, marca.id).listar();
  const [ajeno] = await crearRepositorioCompetencia(db, otra.id).listar();
  assert.notEqual(rival.id, ajeno.id);
  const ingesta = crearIngestasCompetidor(db, marca.id, rival.id);
  const lote = await ingesta.importar(datos);
  assert.equal(lote?.insertadas, 2);
  assert.equal((await crearIngestasCompetidor(db, marca.id, ajeno.id).consultar()).total, 0);
  const loteAjeno = await crearIngestasCompetidor(db, otra.id, ajeno.id).importar(datos);
  const [captura] = await db.select().from(metricasPostCompetidor).where(eq(metricasPostCompetidor.competidorId, rival.id));
  assert.ok(loteAjeno);
  await assert.rejects(db.insert(metricasPostCompetidor).values({
    postId: captura.postId, competidorId: rival.id, ingestaId: loteAjeno.id, capturadaEn: new Date(),
  }), causaPostgres("23503", "metricas_competidor_fk_ingesta"));

  // Falla la escritura de métricas después del upsert de posts para comprobar el rollback.
  await client.exec("ALTER TABLE metricas_post_competidor ADD CONSTRAINT fallo_controlado CHECK (likes <> 777)");
  const nuevo = [
    { ...(datos[0] as object), caption: "Cambio que se debe revertir", likesCount: 777 },
    { ...(datos[1] as object), id: "103", shortCode: "Rival_3", url: "https://www.instagram.com/p/Rival_3/" },
  ];
  await assert.rejects(ingesta.importar(nuevo), causaPostgres("23514", "fallo_controlado"));
  const sinCambios = await ingesta.consultar();
  assert.equal(sinCambios.total, 2);
  assert.equal(sinCambios.historial.length, 1);
  assert.equal(sinCambios.listado.find(({ shortcode }) => shortcode === "Rival_1")?.caption, "Publicación sintética");
  assert.equal((await db.select({ total: count() }).from(metricasPostCompetidor))[0].total, 4);
  await client.exec("ALTER TABLE metricas_post_competidor DROP CONSTRAINT fallo_controlado");
  assert.equal((await ingesta.importar(nuevo))?.insertadas, 1);

  const informe = await consultarComparacionCompetitiva(db, marca.id, { rivales: [rival.id, ajeno.id], pagina: 1 });
  assert.deepEqual(informe.cuentas.map(({ publicaciones }) => publicaciones), [47, 3]);
  const tools = crearHerramientasCompetencia(db, marca);
  const top = await tools.posts_destacados_competencia.execute({ competidor: rival.username, cantidad: 1, metrica: "me_gusta" });
  assert.ok("publicaciones" in top);
  assert.equal(top.publicaciones[0].meGusta, "777");
  assert.equal(top.publicaciones[0].interacciones, "777");
  const [activo] = await db.select().from(competidores).where(eq(competidores.id, rival.id));
  assert.equal(await escribir(marca.id, { accion: "desactivar", id: activo.id, revision: activo.revision }), "guardado");
  const comparacion = await tools.comparar_con_competencia.execute({});
  assert.ok("cuentas" in comparacion);
  assert.equal(comparacion.cuentas.length, 1);
  assert.deepEqual(await db.select().from(posts).where(eq(posts.cuentaId, marca.id)).orderBy(posts.id),
    propias.sort((a, b) => a.id.localeCompare(b.id)));
});

test("limita el tamaño y valida un arreglo JSON UTF-8", () => {
  assert.equal(MAX_BYTES_JSON, 600 * 1024);
  const alLimite = Buffer.from("[]".padEnd(MAX_BYTES_JSON));
  assert.deepEqual(leerDatasetCompetidor(alLimite), []);
  assert.throws(() => leerDatasetCompetidor(Buffer.concat([alLimite, Buffer.from(" ")])), /600 KiB/);
  assert.throws(() => leerDatasetCompetidor(Buffer.from("{}")), /arreglo/);
  assert.throws(() => leerDatasetCompetidor(Buffer.from([255])), /UTF-8/);
  assert.throws(() => leerDatasetCompetidor(Buffer.from(JSON.stringify(Array(MAX_FILAS_JSON + 1).fill(null)))), /250/);
  assert.deepEqual(leerDatasetCompetidor(Buffer.from("\uFEFF[]")), []);
});

test("aísla la ingesta, conserva NULL e historial, reutiliza datasets y soporta corridas manuales simuladas", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  await client.exec(`
    CREATE TABLE competidores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cuenta_id uuid NOT NULL REFERENCES cuentas(id),
      username text NOT NULL, activo boolean NOT NULL);
  `);
  await client.exec(readFileSync(new URL("../drizzle/0007_ingesta_competidores.sql", import.meta.url), "utf8"));
  const [marca, ajena] = await Promise.all([cuenta("marca_prueba"), cuenta("otra_prueba")]);
  const { rows: [rival, rivalAjeno] } = await client.query<{ id: string }>(
    "INSERT INTO competidores(cuenta_id,username,activo) VALUES ($1,'rival_prueba',true),($2,'rival_prueba',true) RETURNING id",
    [marca, ajena]);
  await db.insert(posts).values(Array.from({ length: 47 }, (_, i) => ({
    cuentaId: marca, instagramId: String(i), shortcode: `Propia_${i}`, url: `https://www.instagram.com/p/Propia_${i}/`,
    tipo: "imagen" as const, publicadaEn: new Date(),
  })));
  const repo = crearIngestasCompetidor(db, marca, rival.id);
  const fuera = crearIngestasCompetidor(db, marca, rivalAjeno.id);
  assert.equal(await fuera.importar(datos), null);
  assert.equal(await fuera.reservar(20), null);
  assert.equal((await fuera.consultar()).total, 0);
  const otroAutor = { ...(datos[0] as object), ownerUsername: "marca_prueba" };
  const incorrecta = await repo.importar([otroAutor]);
  assert.equal(incorrecta?.estado, "fallida");
  assert.equal(incorrecta?.rechazadas, 1);
  const vacia = await repo.importar([]);
  assert.equal(vacia?.estado, "fallida");
  assert.equal((await repo.importar([]))?.id, vacia?.id);
  const mixto = [...datos, otroAutor, null];
  const [a, b] = await Promise.all([repo.importar(mixto), repo.importar(mixto)]);
  assert.equal(a?.id, b?.id);
  assert.deepEqual([a?.repetida, b?.repetida].sort(), [false, true]);
  assert.equal(a?.estado, "parcial");
  assert.equal(a?.rechazadas, 2);
  const lista = await repo.consultar();
  assert.equal(lista.total, 2);
  const primera = lista.listado.find((p) => p.shortcode === "Rival_1");
  assert.equal(primera?.likes, null);
  assert.equal(primera?.comentarios, 0);
  assert.ok(!JSON.stringify(lista).includes("Texto sintético que debe descartarse"));
  const nuevo = [{ ...(datos[0] as object), likesCount: 12 }, { ...(datos[1] as object),
    id: "103", shortCode: "Rival_3", url: "https://www.instagram.com/p/Rival_3/" }];
  const actualizado = await repo.importar(nuevo);
  assert.deepEqual([actualizado?.insertadas, actualizado?.actualizadas], [1, 1]);
  assert.equal((await repo.consultar()).total, 3);
  assert.equal((await db.select({ total: count() }).from(metricasPostCompetidor))[0].total, 4);
  const segundaCuenta = crearIngestasCompetidor(db, ajena, rivalAjeno.id);
  assert.equal((await segundaCuenta.importar(datos))?.insertadas, 2);
  assert.equal((await segundaCuenta.consultar()).total, 2);
  assert.equal((await db.select({ total: count() }).from(posts).where(eq(posts.cuentaId, marca)))[0].total, 47);

  let inicios = 0;
  let estado = "RUNNING";
  const proveedor: ClienteCorridas = {
    async iniciar(username, limite, costo) {
      assert.deepEqual([username, limite, costo], ["rival_prueba", 20, 0.05]);
      return { id: `run-${++inicios}` };
    },
    async consultar(id) { return { id, status: estado, defaultDatasetId: "dataset-mock" }; },
    async cancelar(id) { return { id, status: "ABORTED", defaultDatasetId: "dataset-mock" }; },
    async dataset(id, limite) { assert.deepEqual([id, limite], ["dataset-mock", 20]); return nuevo; },
  };
  const arranques = await Promise.all([iniciarCorrida(repo, proveedor, 20, 0.05), iniciarCorrida(repo, proveedor, 20, 0.05)]);
  assert.equal(arranques.filter((r) => r.ok).length, 1);
  assert.equal(inicios, 1);
  const id = (await repo.consultar()).corrida?.id;
  assert.ok(id);
  assert.equal((await gestionarCorrida(fuera, proveedor, id, false)).ok, false);
  assert.match((await gestionarCorrida(repo, proveedor, id, false)).mensaje, /sigue en curso/);
  estado = "SUCCEEDED";
  assert.equal((await gestionarCorrida(repo, proveedor, id, false)).resultado?.repetida, true);
  assert.equal((await repo.consultar()).corrida, null);
  assert.equal((await iniciarCorrida(repo, proveedor, 20, 0.05)).ok, true);
  const idCancelar = (await repo.consultar()).corrida?.id;
  assert.ok(idCancelar);
  assert.equal((await gestionarCorrida(repo, proveedor, idCancelar, true)).ok, true);
  assert.equal((await db.select().from(ingestasCompetidor).where(eq(ingestasCompetidor.id, idCancelar)))[0].estado, "cancelada");
  assert.equal((await repo.consultar()).corrida, null);
  await iniciarCorrida(repo, { ...proveedor, iniciar: async () => { throw new Error("Timeout de inicio simulado"); } }, 20, 0.05);
  assert.equal((await iniciarCorrida(repo, proveedor, 20, 0.05)).ok, false);
  assert.match((await repo.consultar()).historial[0].mensaje ?? "", /reserva sigue activa/);
});
