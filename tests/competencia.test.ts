import assert from "node:assert/strict";
import { test } from "node:test";
import { competidores } from "../src/db/schema.ts";
import { mutacionCompetidor, perfilInstagram } from "../src/lib/competencia/contrato.ts";
import { ejecutarMutacionCompetidor } from "../src/lib/competencia/operacion.ts";
import { crearRepositorioCompetencia } from "../src/lib/competencia/repositorio.ts";
import { crearBaseDePruebas } from "./chat-db.ts";

const alta = (perfil: string, activo = true) => mutacionCompetidor.parse({ accion: "crear", datos: { perfil, activo } });

test("normaliza usernames y URLs de perfil y rechaza enlaces ajenos o de contenido", () => {
  for (const entrada of [" @MaRcA.1 ", " HTTPS://WWW.INSTAGRAM.COM/MaRcA.1/?igsh=123 ", "instagram.com/marca.1#perfil"]) {
    assert.equal(perfilInstagram.parse(entrada), "marca.1");
  }
  for (const invalida of [
    "https://instagram.com.ejemplo.test/marca", "https://www.instagram.com@otro.test/marca",
    "https://instagram.com:8080/marca", "https://instagram.com/p/ABC", "https://instagram.com/reel/",
    "https://instagram.com/a/../b", "..", "https://instagram.com/%2e%2e", "javascript:alert(1)",
  ]) assert.equal(perfilInstagram.safeParse(invalida).success, false);
});

test("la mutación exige sesión, vínculo con la cuenta activa y un payload sin IDs de cuenta", async () => {
  let llamadas = 0;
  const escribir = async (id: string) => { assert.equal(id, "activa"); llamadas++; return "guardado" as const; };
  const entrada = { accion: "crear", datos: { perfil: "rival", activo: true } };
  assert.equal(await ejecutarMutacionCompetidor(entrada, "activa", async () => null, escribir), "sin_cuenta");
  const cuenta = async () => ({ id: "activa" });
  assert.equal(await ejecutarMutacionCompetidor(entrada, "otra", cuenta, escribir), "sin_cuenta");
  assert.equal(await ejecutarMutacionCompetidor({ ...entrada, cuentaId: "otra" }, "activa", cuenta, escribir), "invalido");
  assert.equal(llamadas, 0);
  assert.equal(await ejecutarMutacionCompetidor(entrada, "activa", cuenta, escribir), "guardado");
  assert.equal(llamadas, 1);
});

test("registra, aísla, edita y desactiva competidores con cupos y revisiones", async (t) => {
  const { client, db, cuenta } = await crearBaseDePruebas();
  t.after(() => client.close());
  await client.exec(`
    CREATE TABLE competidores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cuenta_id uuid NOT NULL REFERENCES cuentas(id), username text NOT NULL,
      url text GENERATED ALWAYS AS ('https://www.instagram.com/' || username || '/') STORED NOT NULL,
      nombre text, descripcion text, activo boolean NOT NULL DEFAULT false, cupo int,
      revision uuid NOT NULL DEFAULT gen_random_uuid(), creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      UNIQUE(cuenta_id, username), UNIQUE(cuenta_id, cupo),
      CHECK (username ~ '^[a-z0-9._]{1,30}$'),
      CHECK ((activo = (cupo IS NOT NULL)) AND (cupo BETWEEN 1 AND 5 OR cupo IS NULL))
    )
  `);
  const [marca, otra] = await Promise.all([cuenta("Marca"), cuenta("Otra")]);
  const repo = crearRepositorioCompetencia(db, marca);
  const aislado = crearRepositorioCompetencia(db, otra);
  assert.deepEqual(await repo.listar(), []);
  assert.equal(await repo.guardar(alta("https://instagram.com/MARCA/"), 5), "propia");
  assert.equal(await repo.guardar(alta("@Rival"), 5), "guardado");
  assert.equal(await repo.guardar(alta("https://instagram.com/rival/", false), 5), "duplicado");
  assert.equal(await aislado.guardar(alta("rival"), 1), "guardado");
  assert.equal(await aislado.guardar(alta("otro_rival"), 1), "limite");
  const [rival] = await repo.listar();
  assert.equal(rival.url, "https://www.instagram.com/rival/");

  const editar = mutacionCompetidor.parse({ accion: "editar", id: rival.id, revision: rival.revision,
    datos: { perfil: "rival", nombre: "  Rival visible ", descripcion: "Seguimiento", activo: true } });
  assert.equal(await aislado.guardar(editar, 5), "conflicto");
  assert.equal(await repo.guardar(editar, 5), "guardado");
  assert.equal(await repo.guardar(editar, 5), "conflicto");
  const [actual] = await repo.listar();
  assert.equal(actual.nombre, "Rival visible");
  assert.equal((await aislado.listar())[0].nombre, null);

  for (const perfil of ["rival2", "rival3", "rival4"]) assert.equal(await repo.guardar(alta(perfil), 5), "guardado");
  const simultaneas = await Promise.all([repo.guardar(alta("rival5"), 5), repo.guardar(alta("rival6"), 5)]);
  assert.deepEqual([...simultaneas].sort(), ["guardado", "limite"]);
  assert.equal((await repo.listar()).filter((item) => item.activo).length, 5);
  await assert.rejects(db.insert(competidores).values({ cuentaId: marca, username: "salto", activo: true, cupo: 6 }));
  await assert.rejects(db.insert(competidores).values({ cuentaId: marca, username: "salto", activo: true, cupo: 1 }));
  assert.equal(await repo.guardar(alta("en_espera", false), 5), "guardado");
  assert.equal(await repo.guardar({ accion: "desactivar", id: actual.id, revision: actual.revision }, 5), "guardado");
  assert.equal((await repo.listar()).find((item) => item.id === actual.id)?.activo, false);
  assert.equal(await repo.guardar(alta("nuevo"), 5), "guardado");
});
