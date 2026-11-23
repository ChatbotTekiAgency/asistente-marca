CREATE TABLE "perfiles_marca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"sector" text DEFAULT '' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"productos_servicios" text DEFAULT '' NOT NULL,
	"propuesta_valor" text DEFAULT '' NOT NULL,
	"publico_objetivo" text DEFAULT '' NOT NULL,
	"necesidades" text DEFAULT '' NOT NULL,
	"intereses" text DEFAULT '' NOT NULL,
	"problemas" text DEFAULT '' NOT NULL,
	"personalidad" text DEFAULT '' NOT NULL,
	"tono" text DEFAULT '' NOT NULL,
	"valores" text DEFAULT '' NOT NULL,
	"expresiones_preferidas" text DEFAULT '' NOT NULL,
	"expresiones_evitar" text DEFAULT '' NOT NULL,
	"objetivos" text DEFAULT '' NOT NULL,
	"diferenciadores" text DEFAULT '' NOT NULL,
	"pilares" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfiles_marca_cuenta_id_unique" UNIQUE("cuenta_id"),
	CONSTRAINT "perfiles_marca_pilares_array" CHECK (jsonb_typeof("perfiles_marca"."pilares") = 'array')
);
--> statement-breakpoint
ALTER TABLE "perfiles_marca" ADD CONSTRAINT "perfiles_marca_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;