ALTER TABLE "solicitudes_tendencias" ADD COLUMN "huella_cache" text;--> statement-breakpoint
ALTER TABLE "solicitudes_tendencias" ADD COLUMN "tema" text;--> statement-breakpoint
ALTER TABLE "solicitudes_tendencias" ADD COLUMN "mercado" text;--> statement-breakpoint
ALTER TABLE "solicitudes_tendencias" ADD COLUMN "reserva_estimada_usd" numeric(14, 8);--> statement-breakpoint
ALTER TABLE "solicitudes_tendencias" ADD COLUMN "busquedas_web" integer;--> statement-breakpoint
CREATE INDEX "tendencias_cache_vigencia_idx" ON "solicitudes_tendencias" USING btree ("cuenta_id","huella_cache","expira_cache_en" DESC NULLS LAST) WHERE "solicitudes_tendencias"."estado" = 'completada';--> statement-breakpoint
CREATE UNIQUE INDEX "tendencias_cache_en_curso_idx" ON "solicitudes_tendencias" USING btree ("cuenta_id","huella_cache") WHERE "solicitudes_tendencias"."estado" = 'en_curso' AND "solicitudes_tendencias"."huella_cache" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "solicitudes_tendencias" ADD CONSTRAINT "tendencias_cache_metadatos_validos" CHECK (
    ("solicitudes_tendencias"."huella_cache" IS NULL OR "solicitudes_tendencias"."huella_cache" ~ '^[a-f0-9]{64}$') AND
    ("solicitudes_tendencias"."busquedas_web" IS NULL OR "solicitudes_tendencias"."busquedas_web" >= 0) AND
    ("solicitudes_tendencias"."reserva_estimada_usd" IS NULL OR "solicitudes_tendencias"."reserva_estimada_usd" >= 0));