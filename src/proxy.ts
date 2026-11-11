
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const session = await verifySession();

  const isAccessPage = request.nextUrl.pathname === "/acceso";

  // Sin sesión: redirigir a /acceso
  if (!session && !isAccessPage) {
    return NextResponse.redirect(
      new URL("/acceso", request.url)
    );
  }

  // Con sesión: evitar volver a /acceso
  if (session && isAccessPage) {
    return NextResponse.redirect(
      new URL("/dashboard", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
