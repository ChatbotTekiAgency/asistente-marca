CREATE TYPE "public"."rol_mensaje" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TABLE "conversaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"intento_activo" uuid,
	"reserva_hasta" timestamp with time zone,
	CONSTRAINT "conversaciones_reserva_completa" CHECK (("conversaciones"."intento_activo" IS NULL) = ("conversaciones"."reserva_hasta" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "cuotas_chat" (
	"cuenta_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"solicitudes" integer NOT NULL,
	CONSTRAINT "cuotas_chat_cuenta_id_dia_pk" PRIMARY KEY("cuenta_id","dia"),
	CONSTRAINT "cuotas_chat_solicitudes_positivas" CHECK ("cuotas_chat"."solicitudes" > 0)
);
--> statement-breakpoint
CREATE TABLE "mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversacion_id" uuid NOT NULL,
	"solicitud_id" uuid,
	"rol" "rol_mensaje" NOT NULL,
	"partes" jsonb NOT NULL,
	"orden" bigserial NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"uso" jsonb,
	CONSTRAINT "mensajes_solicitud_requerida" CHECK ("mensajes"."rol" = 'system' OR "mensajes"."solicitud_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuotas_chat" ADD CONSTRAINT "cuotas_chat_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacion_id_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversaciones_cuenta_actualizada_idx" ON "conversaciones" USING btree ("cuenta_id","actualizada_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "mensajes_solicitud_rol_idx" ON "mensajes" USING btree ("conversacion_id","solicitud_id","rol");--> statement-breakpoint
CREATE UNIQUE INDEX "mensajes_conversacion_orden_idx" ON "mensajes" USING btree ("conversacion_id","orden");