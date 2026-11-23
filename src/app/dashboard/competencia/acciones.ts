"use server";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { revalidatePath } from "next/cache";
import { env } from "@/env";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { ejecutarMutacionCompetidor } from "@/lib/competencia/operacion";
import { crearRepositorioCompetencia } from "@/lib/competencia/repositorio";

export async function guardarCompetidor(cuentaEsperada: string, entrada: unknown) {
  const resultado = await ejecutarMutacionCompetidor(entrada, cuentaEsperada, getCuentaActiva, async (cuentaId, mutacion) => {
    const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5_000 });
    try {
      return await crearRepositorioCompetencia(drizzle(pool), cuentaId).guardar(mutacion, env.COMPETIDORES_MAX_ACTIVOS);
    } finally {
      await pool.end();
    }
  });
  if (resultado === "guardado") revalidatePath("/dashboard/competencia");
  return resultado;
}
