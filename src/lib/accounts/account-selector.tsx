
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seleccionarCuenta } from "@/lib/accounts/actions";

interface Cuenta {
  id: string;
  username: string;
}

interface AccountSelectorProps {
  cuentas: Cuenta[];
  cuentaActivaId: string | null;
}

export default function AccountSelector({
  cuentas,
  cuentaActivaId,
}: AccountSelectorProps) {
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(cuentaId: string) {
    if (!cuentaId || cuentaId === cuentaActivaId) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        await seleccionarCuenta(cuentaId);
        router.refresh();
      } catch {
        setError("No se pudo cambiar la cuenta.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="account-selector"
        className="text-xs font-medium text-zinc-400"
      >
        Cuenta activa
      </label>

      <select
        id="account-selector"
        value={cuentaActivaId ?? ""}
        onChange={(event) => handleChange(event.target.value)}
        disabled={isPending || cuentas.length === 0}
        className="
          h-10 w-full rounded-lg
          border border-white/10
          bg-zinc-900 px-3
          text-sm text-white
          outline-none transition
          hover:border-white/20
          focus:border-violet-500
          focus:ring-2 focus:ring-violet-500/20
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        <option value="" disabled className="bg-zinc-900 text-zinc-400">
          {cuentas.length === 0
            ? "No hay cuentas disponibles"
            : "Selecciona una cuenta"}
        </option>

        {cuentas.map((cuenta) => (
          <option
            key={cuenta.id}
            value={cuenta.id}
            className="bg-zinc-900 text-white"
          >
            @{cuenta.username}
          </option>
        ))}
      </select>

      {isPending && (
        <span className="text-xs text-zinc-400">
          Actualizando cuenta...
        </span>
      )}

      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}
