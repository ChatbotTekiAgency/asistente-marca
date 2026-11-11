
import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import {
  safeCompare,
  createSession,
} from "@/lib/auth/session";

import { z } from "zod";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Solicitud inválida" },
        { status: 400 }
      );
    }

    const isValid = safeCompare(
      parsed.data.password,
      env.ACCESS_KEY
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    await createSession();

    return NextResponse.json({
      success: true,
      message: "Sesión iniciada correctamente",
    });

  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
