
import "server-only";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { cuentas } from "@/db/schema";
import { verifySession } from "@/lib/auth/session";

// =====================================================
// OBTENER CUENTA ACTIVA
// =====================================================

export async function getCuentaActiva() {
  // 1. Verificar primero la sesión de acceso
  const session = await verifySession();

  if (!session) {
    return null;
  }

  // 2. Leer las cookies
  const cookieStore = await cookies();

  const cuentaId = cookieStore.get("cuenta_activa")?.value;

  if (!cuentaId) {
    return null;
  }

  // 3. Validar que el identificador sea un UUID válido
  const uuidSchema = z.string().uuid();

  const validation = uuidSchema.safeParse(cuentaId);

  if (!validation.success) {
    return null;
  }

  // 4. Consultar la cuenta en Neon mediante Drizzle
  const [cuenta] = await db
    .select()
    .from(cuentas)
    .where(eq(cuentas.id, validation.data))
    .limit(1);

  // 5. Devolver la cuenta o null si no existe
  return cuenta ?? null;
}
