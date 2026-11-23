
import { Suspense } from "react";
import type { ReactNode } from "react";
import { connection } from "next/server";
import Link from "next/link";

import AccountSelector from "@/lib/accounts/account-selector";
import { getCuentas } from "@/lib/accounts/get-accounts";
import { getCuentaActiva } from "@/lib/accounts/active-account";

async function DashboardAccountSelector() {
  await connection();

  const datos = await Promise.all([
    getCuentas(),
    getCuentaActiva(),
  ]).catch(() => null);
  if (!datos) {
    return <p role="alert" className="text-sm text-zinc-400">No se pudieron cargar las cuentas. Recarga para reintentar.</p>;
  }
  const [cuentas, cuentaActiva] = datos;

  return (
    <AccountSelector
      cuentas={cuentas}
      cuentaActivaId={cuentaActiva?.id ?? null}
    />
  );
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 bg-zinc-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">Asistente de marca</p>
            <nav aria-label="Dashboard" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-violet-300">
              <Link href="/dashboard">Panel</Link>
              <Link href="/dashboard/analitica">Analítica</Link>
              <Link href="/dashboard/enriquecimiento">Enriquecimiento</Link>
              <Link href="/dashboard/marca">Marca</Link>
              <Link href="/dashboard/competencia">Competencia</Link>
              <Link href="/dashboard/tendencias">Tendencias</Link>
              <Link href="/dashboard/ideas">Ideas</Link>
              <Link href="/dashboard/chat">Chat</Link>
            </nav>
          </div>

          <div className="w-64">
            <p className="mb-2 text-xs font-medium text-zinc-400">
              Cuenta activa
            </p>

            <Suspense
              fallback={
                <div className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-500">
                  Cargando cuentas...
                </div>
              }
            >
              <DashboardAccountSelector />
            </Suspense>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {children}
      </main>
    </div>
  );
}
