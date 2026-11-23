CREATE TABLE "fuentes_tendencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tendencia_id" uuid NOT NULL,
	"posicion" integer NOT NULL,
	"titulo" text NOT NULL,
	"url" text NOT NULL,
	"sitio" text,
	"publicada_el" date,
	CONSTRAINT "tendencias_fuente_valida" CHECK ("fuentes_tendencias"."posicion" BETWEEN 1 AND 5 AND "fuentes_tendencias"."url" LIKE 'https://%')
);
--> statement-breakpoint
CREATE TABLE "resultados_tendencias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"posicion" integer NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text NOT NULL,
	"relevancia_marca" text NOT NULL,
	"ejemplo_aplicacion" text NOT NULL,
	"formato" text NOT NULL,
	"publico_objetivo" text NOT NULL,
	"relevancia" text NOT NULL,
	"investigada_en" timestamp with time zone NOT NULL,
	CONSTRAINT "tendencias_resultado_posicion_valida" CHECK ("resultados_tendencias"."posicion" BETWEEN 1 AND 4),
	CONSTRAINT "tendencias_formato_valido" CHECK ("resultados_tendencias"."formato" IN ('reel', 'carrusel', 'imagen', 'historia', 'otro')),
	CONSTRAINT "tendencias_relevancia_valida" CHECK ("resultados_tendencias"."relevancia" IN ('alto', 'medio', 'bajo'))
);
--> statement-breakpoint
CREATE TABLE "solicitudes_tendencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"clave" uuid NOT NULL,
	"estado" text NOT NULL,
	"proveedor" text NOT NULL,
	"modelo" text NOT NULL,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"costo_estimado_usd" numeric(14, 8),
	"error" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"finalizada_en" timestamp with time zone,
	"expira_cache_en" timestamp with time zone,
	CONSTRAINT "tendencias_proveedor_valido" CHECK ("solicitudes_tendencias"."proveedor" IN ('mock', 'anthropic')),
	CONSTRAINT "tendencias_metadatos_validos" CHECK ("solicitudes_tendencias"."tokens_entrada" >= 0 AND "solicitudes_tendencias"."tokens_salida" >= 0 AND "solicitudes_tendencias"."costo_estimado_usd" >= 0),
	CONSTRAINT "tendencias_estado_coherente" CHECK (
    ("solicitudes_tendencias"."estado" = 'en_curso' AND "solicitudes_tendencias"."finalizada_en" IS NULL AND "solicitudes_tendencias"."expira_cache_en" IS NULL AND "solicitudes_tendencias"."error" IS NULL) OR
    ("solicitudes_tendencias"."estado" = 'completada' AND "solicitudes_tendencias"."finalizada_en" IS NOT NULL AND "solicitudes_tendencias"."expira_cache_en" > "solicitudes_tendencias"."finalizada_en"
      AND "solicitudes_tendencias"."expira_cache_en" IS NOT NULL AND "solicitudes_tendencias"."error" IS NULL) OR
    ("solicitudes_tendencias"."estado" = 'fallida' AND "solicitudes_tendencias"."finalizada_en" IS NOT NULL AND "solicitudes_tendencias"."expira_cache_en" IS NULL
      AND "solicitudes_tendencias"."error" IS NOT NULL AND "solicitudes_tendencias"."error" IN ('respuesta_invalida', 'proveedor', 'vencida'))
  )
);
--> statement-breakpoint
ALTER TABLE "fuentes_tendencias" ADD CONSTRAINT "fuentes_tendencias_tendencia_id_resultados_tendencias_id_fk" FOREIGN KEY ("tendencia_id") REFERENCES "public"."resultados_tendencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resultados_tendencias" ADD CONSTRAINT "resultados_tendencias_solicitud_id_solicitudes_tendencias_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_tendencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_tendencias" ADD CONSTRAINT "solicitudes_tendencias_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tendencias_fuente_posicion_idx" ON "fuentes_tendencias" USING btree ("tendencia_id","posicion");--> statement-breakpoint
CREATE UNIQUE INDEX "tendencias_fuente_url_idx" ON "fuentes_tendencias" USING btree ("tendencia_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "tendencias_resultado_posicion_idx" ON "resultados_tendencias" USING btree ("solicitud_id","posicion");--> statement-breakpoint
CREATE UNIQUE INDEX "tendencias_cuenta_clave_idx" ON "solicitudes_tendencias" USING btree ("cuenta_id","clave");--> statement-breakpoint
CREATE INDEX "tendencias_cuenta_fecha_idx" ON "solicitudes_tendencias" USING btree ("cuenta_id","creada_en" DESC NULLS LAST,"id" DESC NULLS LAST);