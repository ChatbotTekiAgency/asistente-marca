CREATE TABLE "evidencias_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"idea_id" uuid NOT NULL,
	"posicion" integer NOT NULL,
	"tipo" text NOT NULL,
	"post_id" uuid,
	"post_competidor_id" uuid,
	"tendencia_id" uuid,
	"perfil_id" uuid,
	"campo_perfil" text,
	"enriquecimiento_id" uuid,
	"relevancia" text NOT NULL,
	"url" text,
	"consultada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"datos" jsonb NOT NULL,
	CONSTRAINT "evidencias_referencia_valida" CHECK (
    num_nonnulls("evidencias_ideas"."post_id","evidencias_ideas"."post_competidor_id","evidencias_ideas"."tendencia_id","evidencias_ideas"."perfil_id","evidencias_ideas"."enriquecimiento_id") = 1
    AND (("evidencias_ideas"."tipo" = 'publicacion_propia' AND "evidencias_ideas"."post_id" IS NOT NULL)
      OR ("evidencias_ideas"."tipo" = 'publicacion_competidor' AND "evidencias_ideas"."post_competidor_id" IS NOT NULL)
      OR ("evidencias_ideas"."tipo" = 'tendencia' AND "evidencias_ideas"."tendencia_id" IS NOT NULL)
      OR ("evidencias_ideas"."tipo" = 'perfil' AND "evidencias_ideas"."perfil_id" IS NOT NULL)
      OR ("evidencias_ideas"."tipo" = 'enriquecimiento' AND "evidencias_ideas"."enriquecimiento_id" IS NOT NULL))
    AND ("evidencias_ideas"."tipo" = 'perfil') = ("evidencias_ideas"."campo_perfil" IS NOT NULL)
    AND "evidencias_ideas"."posicion" BETWEEN 1 AND 8 AND ("evidencias_ideas"."url" IS NULL OR "evidencias_ideas"."url" LIKE 'https://%'))
);
--> statement-breakpoint
CREATE TABLE "generaciones_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"clave" uuid NOT NULL,
	"huella" text NOT NULL,
	"solicitud" text NOT NULL,
	"parametros" jsonb NOT NULL,
	"estado" text NOT NULL,
	"proveedor" text NOT NULL,
	"modelo" text,
	"cantidad" integer NOT NULL,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"costo_estimado_usd" numeric(14, 8),
	"error" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generaciones_ideas_coherente" CHECK (
    "generaciones_ideas"."proveedor" IN ('mock','anthropic') AND ("generaciones_ideas"."proveedor" = 'mock' OR "generaciones_ideas"."modelo" IS NOT NULL)
    AND (("generaciones_ideas"."estado" = 'completada' AND "generaciones_ideas"."cantidad" BETWEEN 1 AND 10 AND "generaciones_ideas"."error" IS NULL)
      OR ("generaciones_ideas"."estado" = 'fallida' AND "generaciones_ideas"."cantidad" = 0 AND "generaciones_ideas"."error" IS NOT NULL AND "generaciones_ideas"."error" IN ('proveedor','respuesta_invalida','tiempo')))
    AND "generaciones_ideas"."tokens_entrada" >= 0 AND "generaciones_ideas"."tokens_salida" >= 0 AND "generaciones_ideas"."costo_estimado_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ideas_contenido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"generacion_id" uuid NOT NULL,
	"posicion" integer NOT NULL,
	"titulo" text NOT NULL,
	"concepto" text NOT NULL,
	"objetivo" text NOT NULL,
	"publico" text NOT NULL,
	"pilar" text NOT NULL,
	"formato" text NOT NULL,
	"gancho" text NOT NULL,
	"desarrollo" text NOT NULL,
	"cta" text NOT NULL,
	"justificacion" text NOT NULL,
	"estado" text DEFAULT 'nueva' NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"generada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ideas_formato_estado_validos" CHECK ("ideas_contenido"."formato" IN ('reel','carrusel','imagen','historia','otro')
    AND "ideas_contenido"."estado" IN ('nueva','en_revision','aprobada','descartada') AND "ideas_contenido"."posicion" BETWEEN 1 AND 10)
);
--> statement-breakpoint
ALTER TABLE "evidencias_ideas" ADD CONSTRAINT "evidencias_ideas_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias_ideas" ADD CONSTRAINT "evidencias_ideas_post_competidor_id_posts_competidor_id_fk" FOREIGN KEY ("post_competidor_id") REFERENCES "public"."posts_competidor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias_ideas" ADD CONSTRAINT "evidencias_ideas_tendencia_id_resultados_tendencias_id_fk" FOREIGN KEY ("tendencia_id") REFERENCES "public"."resultados_tendencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias_ideas" ADD CONSTRAINT "evidencias_ideas_perfil_id_perfiles_marca_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles_marca"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias_ideas" ADD CONSTRAINT "evidencias_ideas_enriquecimiento_id_enriquecimientos_post_id_fk" FOREIGN KEY ("enriquecimiento_id") REFERENCES "public"."enriquecimientos_post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generaciones_ideas_ambito_idx" ON "generaciones_ideas" USING btree ("cuenta_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ideas_cuenta_id_idx" ON "ideas_contenido" USING btree ("cuenta_id","id");--> statement-breakpoint
ALTER TABLE "evidencias_ideas" ADD CONSTRAINT "evidencias_idea_fk" FOREIGN KEY ("cuenta_id","idea_id") REFERENCES "public"."ideas_contenido"("cuenta_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generaciones_ideas" ADD CONSTRAINT "generaciones_ideas_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas_contenido" ADD CONSTRAINT "ideas_generacion_fk" FOREIGN KEY ("cuenta_id","generacion_id") REFERENCES "public"."generaciones_ideas"("cuenta_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidencias_idea_posicion_idx" ON "evidencias_ideas" USING btree ("idea_id","posicion");--> statement-breakpoint
CREATE UNIQUE INDEX "generaciones_ideas_cuenta_clave_idx" ON "generaciones_ideas" USING btree ("cuenta_id","clave");--> statement-breakpoint
CREATE INDEX "generaciones_ideas_historial_idx" ON "generaciones_ideas" USING btree ("cuenta_id","creada_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ideas_generacion_posicion_idx" ON "ideas_contenido" USING btree ("generacion_id","posicion");--> statement-breakpoint
CREATE INDEX "ideas_cuenta_fecha_idx" ON "ideas_contenido" USING btree ("cuenta_id","generada_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ideas_cuenta_estado_idx" ON "ideas_contenido" USING btree ("cuenta_id","estado","generada_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION public.validar_ambito_evidencia_idea() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
    (NEW.tipo = 'publicacion_propia' AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = NEW.post_id AND p.cuenta_id = NEW.cuenta_id))
    OR (NEW.tipo = 'publicacion_competidor' AND EXISTS (
      SELECT 1 FROM public.posts_competidor p JOIN public.competidores c ON c.id = p.competidor_id
      WHERE p.id = NEW.post_competidor_id AND c.cuenta_id = NEW.cuenta_id))
    OR (NEW.tipo = 'tendencia' AND EXISTS (
      SELECT 1 FROM public.resultados_tendencias r JOIN public.solicitudes_tendencias s ON s.id = r.solicitud_id
      WHERE r.id = NEW.tendencia_id AND s.cuenta_id = NEW.cuenta_id AND s.estado = 'completada' AND s.proveedor = 'anthropic'))
    OR (NEW.tipo = 'perfil' AND EXISTS (
      SELECT 1 FROM public.perfiles_marca p WHERE p.id = NEW.perfil_id AND p.cuenta_id = NEW.cuenta_id))
    OR (NEW.tipo = 'enriquecimiento' AND EXISTS (
      SELECT 1 FROM public.enriquecimientos_post e JOIN public.posts p ON p.id = e.post_id
      WHERE e.id = NEW.enriquecimiento_id AND p.cuenta_id = NEW.cuenta_id AND e.estado = 'completado' AND e.proveedor = 'anthropic'))
  ) THEN
    RAISE EXCEPTION 'Evidencia fuera del ámbito de la cuenta' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER validar_ambito_evidencia_idea BEFORE INSERT OR UPDATE ON public.evidencias_ideas
FOR EACH ROW EXECUTE FUNCTION public.validar_ambito_evidencia_idea();
