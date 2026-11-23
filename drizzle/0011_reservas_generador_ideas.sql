CREATE TABLE "reservas_ideas" (
	"cuenta_id" uuid NOT NULL,
	"clave" uuid NOT NULL,
	"huella" text NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"finalizada_en" timestamp with time zone,
	CONSTRAINT "reservas_ideas_cuenta_id_clave_pk" PRIMARY KEY("cuenta_id","clave")
);
--> statement-breakpoint
ALTER TABLE "ideas_contenido" ADD COLUMN "advertencias" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas_ideas" ADD CONSTRAINT "reservas_ideas_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservas_ideas_cuenta_fecha_idx" ON "reservas_ideas" USING btree ("cuenta_id","creada_en" DESC NULLS LAST);