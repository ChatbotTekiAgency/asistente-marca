
/*import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

export function safeCompare(
  received: string,
  expected: string
): boolean {
  const receivedHash = createHash("sha256")
    .update(received)
    .digest();

  const expectedHash = createHash("sha256")
    .update(expected)
    .digest();

  return timingSafeEqual(receivedHash, expectedHash);
}*/

import "server-only";

import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { cookies } from "next/headers";
import { env } from "@/env";
import { z } from "zod";

// =====================================================
// CONFIGURACIÓN
// =====================================================

const COOKIE_NAME = "asistente_marca_session";

const SESSION_DURATION = 60 * 60 * 24 * 30; // 30 días

// =====================================================
// VALIDACIÓN DEL PAYLOAD
// =====================================================

const sessionSchema = z.object({
  authenticated: z.literal(true),
  expiresAt: z.number().int().positive(),
}).strict();

export type SessionPayload = z.infer<typeof sessionSchema>;

// =====================================================
// COMPARACIÓN SEGURA DE CLAVES
// =====================================================

export function safeCompare(
  received: string,
  expected: string
): boolean {
  if (
    typeof received !== "string" ||
    typeof expected !== "string"
  ) {
    return false;
  }

  const receivedHash = createHash("sha256")
    .update(received, "utf8")
    .digest();

  const expectedHash = createHash("sha256")
    .update(expected, "utf8")
    .digest();

  return timingSafeEqual(receivedHash, expectedHash);
}

// =====================================================
// FIRMA HMAC-SHA256
// =====================================================

function sign(payload: string): Buffer {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(payload, "utf8")
    .digest();
}

// =====================================================
// CREAR SESIÓN
// =====================================================

export async function createSession(): Promise<void> {
  const cookieStore = await cookies();

  const payload: SessionPayload = {
    authenticated: true,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION,
  };

  // Convertimos el payload a Base64URL
  const encodedPayload = Buffer
    .from(JSON.stringify(payload))
    .toString("base64url");

  // Generamos la firma del contenido
  const signature = sign(encodedPayload).toString("base64url");

  // Construimos el token
  const token = `${encodedPayload}.${signature}`;

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

// =====================================================
// VERIFICAR SESIÓN
// =====================================================

export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();

  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, encodedSignature] = parts;

    // Validar formato Base64URL
    if (
      !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
      !/^[A-Za-z0-9_-]{43}$/.test(encodedSignature)
    ) {
      return null;
    }

    const receivedSignature = Buffer.from(
      encodedSignature,
      "base64url"
    );

    if (
      receivedSignature.length !== 32 ||
      receivedSignature.toString("base64url") !== encodedSignature
    ) {
      return null;
    }

    // Verificar firma antes de confiar en el payload
    const expectedSignature = sign(encodedPayload);

    if (!timingSafeEqual(receivedSignature, expectedSignature)) {
      return null;
    }

    // Decodificar y validar payload
    const decodedPayload = Buffer.from(
      encodedPayload,
      "base64url"
    );

    if (decodedPayload.toString("base64url") !== encodedPayload) {
      return null;
    }

    const parsedJSON: unknown = JSON.parse(
      decodedPayload.toString("utf8")
    );

    const result = sessionSchema.safeParse(parsedJSON);

    if (!result.success) {
      return null;
    }

    // Comprobar expiración
    const now = Math.floor(Date.now() / 1000);

    if (result.data.expiresAt <= now) {
      return null;
    }

    return result.data;

  } catch {
    return null;
  }
}

// =====================================================
// ELIMINAR SESIÓN
// =====================================================

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(COOKIE_NAME);
}

