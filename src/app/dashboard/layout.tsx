
import { Suspense } from "react";
import type { ReactNode } from "react";
import { connection } from "next/server";

import AccountSelector from "@/lib/accounts/account-selector";
import { getCuentas } from "@/lib/accounts/get-accounts";
import { getCuentaActiva } from "@/lib/accounts/active-account";

async function DashboardAccountSelector() {
  await connection();

  const [cuentas, cuentaActiva] = await Promise.all([
    getCuentas(),
    getCuentaActiva(),
  ]);

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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5">
          <h1 className="text-lg font-semibold text-white">
            Asistente de marca
          </h1>

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
