CREATE TABLE "evaluaciones_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"idea_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"calificacion" integer NOT NULL,
	"comentario" text,
	"motivo" text,
	"categorias" jsonb NOT NULL,
	"estado_idea" text NOT NULL,
	"titulo_idea" text NOT NULL,
	"formato_idea" text NOT NULL,
	"evaluada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluaciones_datos_validos" CHECK ("evaluaciones_ideas"."calificacion" BETWEEN 1 AND 5 AND "evaluaciones_ideas"."version" > 0
    AND char_length("evaluaciones_ideas"."comentario") <= 1000 AND jsonb_typeof("evaluaciones_ideas"."categorias") = 'object')
);
--> statement-breakpoint
ALTER TABLE "evaluaciones_ideas" ADD CONSTRAINT "evaluaciones_idea_fk" FOREIGN KEY ("cuenta_id","idea_id") REFERENCES "public"."ideas_contenido"("cuenta_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluaciones_cuenta_idea_version_idx" ON "evaluaciones_ideas" USING btree ("cuenta_id","idea_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "evaluaciones_cuenta_fecha_idx" ON "evaluaciones_ideas" USING btree ("cuenta_id","evaluada_en" DESC NULLS LAST);