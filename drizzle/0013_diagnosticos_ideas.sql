ALTER TABLE "generaciones_ideas" DROP CONSTRAINT "generaciones_ideas_coherente";--> statement-breakpoint
ALTER TABLE "generaciones_ideas" ADD CONSTRAINT "generaciones_ideas_coherente" CHECK (
    "generaciones_ideas"."proveedor" IN ('mock','anthropic') AND ("generaciones_ideas"."proveedor" = 'mock' OR "generaciones_ideas"."modelo" IS NOT NULL)
    AND (("generaciones_ideas"."estado" = 'completada' AND "generaciones_ideas"."cantidad" BETWEEN 1 AND 10 AND "generaciones_ideas"."error" IS NULL)
      OR ("generaciones_ideas"."estado" = 'fallida' AND "generaciones_ideas"."cantidad" = 0 AND "generaciones_ideas"."error" IS NOT NULL
        AND "generaciones_ideas"."error" IN ('proveedor','respuesta_invalida','tiempo','presupuesto','limite_entrada','limite_salida')))
    AND "generaciones_ideas"."tokens_entrada" >= 0 AND "generaciones_ideas"."tokens_salida" >= 0 AND "generaciones_ideas"."costo_estimado_usd" >= 0);