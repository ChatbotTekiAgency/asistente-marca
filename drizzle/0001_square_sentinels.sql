CREATE TYPE "public"."estado_ingesta" AS ENUM('completada', 'parcial', 'fallida');--> statement-breakpoint
CREATE TYPE "public"."tipo_post" AS ENUM('carrusel', 'video', 'imagen');--> statement-breakpoint
CREATE TABLE "ingestas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"proveedor" text NOT NULL,
	"apify_run_id" text,
	"clave_origen" text NOT NULL,
	"estado" "estado_ingesta" NOT NULL,
	"procesadas" integer DEFAULT 0 NOT NULL,
	"errores" integer DEFAULT 0 NOT NULL,
	"iniciada_en" timestamp with time zone NOT NULL,
	"finalizada_en" timestamp with time zone NOT NULL,
	"mensaje_error" text
);
--> statement-breakpoint
CREATE TABLE "metricas_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"ingesta_id" uuid NOT NULL,
	"likes" bigint,
	"comentarios" bigint,
	"reproducciones" bigint,
	"capturada_en" timestamp with time zone NOT NULL,
	CONSTRAINT "metricas_no_negativas" CHECK ("metricas_post"."likes" >= 0 AND "metricas_post"."comentarios" >= 0 AND "metricas_post"."reproducciones" >= 0)
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"instagram_id" text NOT NULL,
	"shortcode" text NOT NULL,
	"tipo" "tipo_post" NOT NULL,
	"caption" text,
	"hashtags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"url" text NOT NULL,
	"publicada_en" timestamp with time zone NOT NULL,
	"imagen_origen_url" text,
	"imagen_persistida" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuentas" ADD COLUMN "apify_reservada_hasta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ingestas" ADD CONSTRAINT "ingestas_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metricas_post" ADD CONSTRAINT "metricas_post_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metricas_post" ADD CONSTRAINT "metricas_post_ingesta_id_ingestas_id_fk" FOREIGN KEY ("ingesta_id") REFERENCES "public"."ingestas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestas_cuenta_origen_idx" ON "ingestas" USING btree ("cuenta_id","proveedor","clave_origen");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestas_cuenta_apify_run_idx" ON "ingestas" USING btree ("cuenta_id","apify_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metricas_post_ingesta_idx" ON "metricas_post" USING btree ("post_id","ingesta_id");--> statement-breakpoint
CREATE INDEX "metricas_ingesta_idx" ON "metricas_post" USING btree ("ingesta_id");--> statement-breakpoint
CREATE INDEX "metricas_post_capturada_idx" ON "metricas_post" USING btree ("post_id","capturada_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "posts_cuenta_shortcode_idx" ON "posts" USING btree ("cuenta_id","shortcode");--> statement-breakpoint
CREATE INDEX "posts_cuenta_publicada_idx" ON "posts" USING btree ("cuenta_id","publicada_en" DESC NULLS LAST);