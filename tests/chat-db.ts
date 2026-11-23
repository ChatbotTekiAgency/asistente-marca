import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { cuentas } from "../src/db/schema.ts";

export async function crearBaseDePruebas() {
  const client = new PGlite();
  // Esquema efímero del harness. No usa el migrador ni archivos de drizzle/.
  await client.exec(`
    CREATE TABLE cuentas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ig_user_id text UNIQUE NOT NULL, username text NOT NULL,
      access_token_cifrado text, token_expira_en timestamptz, apify_reservada_hasta timestamptz, perfil_marca jsonb,
      creada_en timestamptz NOT NULL DEFAULT now(), actualizada_en timestamptz NOT NULL DEFAULT now()
    );
    CREATE TYPE rol_mensaje AS ENUM ('user', 'assistant', 'system');
    CREATE TABLE conversaciones (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cuenta_id uuid NOT NULL REFERENCES cuentas(id), titulo text NOT NULL,
      creada_en timestamptz NOT NULL DEFAULT now(), actualizada_en timestamptz NOT NULL DEFAULT now(),
      intento_activo uuid, reserva_hasta timestamptz, CHECK ((intento_activo IS NULL) = (reserva_hasta IS NULL))
    );
    CREATE TABLE mensajes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversacion_id uuid REFERENCES conversaciones(id) NOT NULL,
      solicitud_id uuid, rol rol_mensaje NOT NULL, partes jsonb NOT NULL, orden bigserial NOT NULL,
      creado_en timestamptz NOT NULL DEFAULT now(), uso jsonb,
      UNIQUE (conversacion_id, solicitud_id, rol), UNIQUE (conversacion_id, orden),
      CHECK (rol = 'system' OR solicitud_id IS NOT NULL)
    );
    CREATE TABLE cuotas_chat (
      cuenta_id uuid REFERENCES cuentas(id) NOT NULL, dia date NOT NULL,
      solicitudes integer NOT NULL CHECK (solicitudes > 0), PRIMARY KEY (cuenta_id, dia)
    );
    CREATE TYPE tipo_post AS ENUM ('carrusel', 'video', 'imagen');
    CREATE TABLE posts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cuenta_id uuid REFERENCES cuentas(id) NOT NULL,
      instagram_id text NOT NULL, shortcode text NOT NULL, tipo tipo_post NOT NULL, caption text, hashtags text[] NOT NULL DEFAULT '{}',
      url text NOT NULL, publicada_en timestamptz NOT NULL, imagen_origen_url text, imagen_persistida text,
      creada_en timestamptz NOT NULL DEFAULT now(), actualizada_en timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE metricas_post (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid REFERENCES posts(id) NOT NULL, ingesta_id uuid NOT NULL,
      likes bigint, comentarios bigint, reproducciones bigint, capturada_en timestamptz NOT NULL
    );
  `);
  const db = drizzle(client);
  const cuenta = async (username: string) => {
    const [fila] = await db.insert(cuentas).values({ username, igUserId: username }).returning({ id: cuentas.id });
    return fila.id;
  };
  return { client, db, cuenta };
}
