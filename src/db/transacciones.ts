import "server-only";

import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { env } from "@/env";

export async function conBaseTransaccional<T>(operacion: (db: NeonDatabase) => Promise<T>) {
  const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5_000 });
  try {
    return await operacion(drizzle(pool));
  } finally {
    await pool.end();
  }
}
