CREATE TABLE "enriquecimientos_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"version_esquema" integer NOT NULL,
	"version_prompt" integer NOT NULL,
	"proveedor" text NOT NULL,
	"modelo" text NOT NULL,
	"modalidad" text NOT NULL,
	"hash_contenido" text NOT NULL,
	"estado" text NOT NULL,
	"intento" uuid NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"clasificacion" jsonb,
	"uso" jsonb,
	"analizado_en" timestamp with time zone,
	CONSTRAINT "enriquecimientos_proveedor_valido" CHECK ("enriquecimientos_post"."proveedor" IN ('mock','anthropic')),
	CONSTRAINT "enriquecimientos_modalidad_valida" CHECK ("enriquecimientos_post"."modalidad" IN ('texto','visual')),
	CONSTRAINT "enriquecimientos_estado_valido" CHECK ("enriquecimientos_post"."estado" IN ('en_curso','completado','fallido'))
);
--> statement-breakpoint
ALTER TABLE "enriquecimientos_post" ADD CONSTRAINT "enriquecimientos_post_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enriquecimientos_identidad_idx" ON "enriquecimientos_post" USING btree ("post_id","version_esquema","version_prompt","proveedor","modelo","modalidad","hash_contenido");--> statement-breakpoint
CREATE INDEX "enriquecimientos_post_fecha_idx" ON "enriquecimientos_post" USING btree ("post_id","analizado_en" DESC NULLS LAST);