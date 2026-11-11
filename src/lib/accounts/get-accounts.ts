import "server-only";

import { db } from "@/db";
import { cuentas } from "@/db/schema";
import { verifySession } from "@/lib/auth/session";

export async function getCuentas() {
  const session = await verifySession();

  if (!session) return [];

  return await db
    .select({
      id: cuentas.id,
      username: cuentas.username,
    })
    .from(cuentas);
}