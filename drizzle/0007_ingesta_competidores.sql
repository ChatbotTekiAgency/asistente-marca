CREATE TYPE "public"."estado_ingesta_competidor" AS ENUM('iniciando', 'en_curso', 'completada', 'parcial', 'fallida', 'cancelada', 'expirada');--> statement-breakpoint
CREATE TABLE "ingestas_competidor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competidor_id" uuid NOT NULL,
	"username" text NOT NULL,
	"origen" text NOT NULL,
	"hash_dataset" text,
	"apify_run_id" text,
	"limite" integer,
	"estado" "estado_ingesta_competidor" NOT NULL,
	"procesadas" integer DEFAULT 0 NOT NULL,
	"errores" integer DEFAULT 0 NOT NULL,
	"iniciada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizada_en" timestamp with time zone,
	"reserva_hasta" timestamp with time zone,
	"mensaje_error" text,
	CONSTRAINT "ingestas_competidor_origen_valido" CHECK ("ingestas_competidor"."origen" IN ('archivo', 'apify'))
);
--> statement-breakpoint
CREATE TABLE "metricas_post_competidor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competidor_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"ingesta_id" uuid NOT NULL,
	"likes" bigint,
	"comentarios" bigint,
	"reproducciones" bigint,
	"capturada_en" timestamp with time zone NOT NULL,
	CONSTRAINT "metricas_competidor_no_negativas" CHECK ("metricas_post_competidor"."likes" >= 0 AND "metricas_post_competidor"."comentarios" >= 0 AND "metricas_post_competidor"."reproducciones" >= 0)
);
--> statement-breakpoint
CREATE TABLE "posts_competidor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competidor_id" uuid NOT NULL,
	"instagram_id" text NOT NULL,
	"shortcode" text NOT NULL,
	"tipo" "tipo_post" NOT NULL,
	"caption" text,
	"hashtags" text[] NOT NULL,
	"url" text NOT NULL,
	"publicada_en" timestamp with time zone NOT NULL,
	"imagen_origen_url" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestas_competidor" ADD CONSTRAINT "ingestas_competidor_competidor_id_competidores_id_fk" FOREIGN KEY ("competidor_id") REFERENCES "public"."competidores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts_competidor" ADD CONSTRAINT "posts_competidor_competidor_id_competidores_id_fk" FOREIGN KEY ("competidor_id") REFERENCES "public"."competidores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestas_competidor_ambito_idx" ON "ingestas_competidor" USING btree ("competidor_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestas_competidor_dataset_idx" ON "ingestas_competidor" USING btree ("competidor_id","hash_dataset");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestas_competidor_run_idx" ON "ingestas_competidor" USING btree ("apify_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestas_competidor_pendiente_idx" ON "ingestas_competidor" USING btree ("competidor_id") WHERE "ingestas_competidor"."estado" IN ('iniciando', 'en_curso');--> statement-breakpoint
CREATE INDEX "ingestas_competidor_fecha_idx" ON "ingestas_competidor" USING btree ("competidor_id","iniciada_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "metricas_competidor_post_ingesta_idx" ON "metricas_post_competidor" USING btree ("post_id","ingesta_id");--> statement-breakpoint
CREATE INDEX "metricas_competidor_ingesta_idx" ON "metricas_post_competidor" USING btree ("competidor_id","ingesta_id");--> statement-breakpoint
CREATE INDEX "metricas_competidor_capturada_idx" ON "metricas_post_competidor" USING btree ("post_id","capturada_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "posts_competidor_shortcode_idx" ON "posts_competidor" USING btree ("competidor_id","shortcode");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_competidor_ambito_idx" ON "posts_competidor" USING btree ("competidor_id","id");--> statement-breakpoint
CREATE INDEX "posts_competidor_fecha_idx" ON "posts_competidor" USING btree ("competidor_id","publicada_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "metricas_post_competidor" ADD CONSTRAINT "metricas_competidor_fk_post" FOREIGN KEY ("competidor_id","post_id") REFERENCES "public"."posts_competidor"("competidor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metricas_post_competidor" ADD CONSTRAINT "metricas_competidor_fk_ingesta" FOREIGN KEY ("competidor_id","ingesta_id") REFERENCES "public"."ingestas_competidor"("competidor_id","id") ON DELETE no action ON UPDATE no action;
