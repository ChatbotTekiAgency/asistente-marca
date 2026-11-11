
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import * as Label from "@radix-ui/react-label";

export default function AccesoPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        setPassword("");
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      if (response.status === 429) {
        setError("Demasiados intentos. Inténtalo más tarde.");
      } else {
        setError("La clave ingresada no es válida.");
      }
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-8 shadow-2xl">
        <header className="mb-8">
          <p className="mb-3 text-sm font-semibold tracking-[0.2em] text-violet-400">
            TekiAgency
          </p>

          <h1 className="text-2xl font-semibold">
            Bienvenido de nuevo
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Ingresa tu clave de acceso para continuar.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label.Root
              htmlFor="password"
              className="text-sm font-medium text-zinc-200"
            >
              Clave de acceso
            </Label.Root>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              placeholder="Escribe tu clave"
              className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950 px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
            />
          </div>

          {error && (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-zinc-600">
          Acceso privado . TekiAgency
        </p>
      </section>
    </main>
  );
}
