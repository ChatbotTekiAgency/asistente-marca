CREATE TABLE "competidores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"username" text NOT NULL,
	"url" text GENERATED ALWAYS AS ('https://www.instagram.com/' || "username" || '/') STORED NOT NULL,
	"nombre" text,
	"descripcion" text,
	"activo" boolean DEFAULT false NOT NULL,
	"cupo" integer,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competidores_username_normalizado" CHECK ("competidores"."username" ~ '^[a-z0-9._]{1,30}$'),
	CONSTRAINT "competidores_estado_cupo" CHECK (("competidores"."activo" = ("competidores"."cupo" IS NOT NULL)) AND ("competidores"."cupo" BETWEEN 1 AND 5 OR "competidores"."cupo" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "competidores" ADD CONSTRAINT "competidores_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competidores_cuenta_username_idx" ON "competidores" USING btree ("cuenta_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "competidores_cuenta_cupo_idx" ON "competidores" USING btree ("cuenta_id","cupo");