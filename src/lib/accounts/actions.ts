
"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { cuentas } from "@/db/schema";
import { verifySession } from "@/lib/auth/session";

export async function seleccionarCuenta(cuentaId: string) {
  // 1. Verificar autenticación
  const session = await verifySession();

  if (!session) {
    throw new Error("Sesión no válida.");
  }

  // 2. Validar UUID recibido
  const validation = z.string().uuid().safeParse(cuentaId);

  if (!validation.success) {
    throw new Error("UUID inválido.");
  }

  // 3. Verificar que la cuenta exista
  const [cuenta] = await db
    .select({ id: cuentas.id })
    .from(cuentas)
    .where(eq(cuentas.id, validation.data))
    .limit(1);

  if (!cuenta) {
    throw new Error("La cuenta no existe.");
  }

  // 4. Guardar UUID en cookie
  const cookieStore = await cookies();

  cookieStore.set("cuenta_activa", cuenta.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
