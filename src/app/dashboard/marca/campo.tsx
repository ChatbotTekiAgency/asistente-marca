import type { ReactNode } from "react";

export function Campo({ id, etiqueta, error, children }: { id: string; etiqueta: string; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-200">{etiqueta}</label>
      {children}
      {error && <p id={`${id}-error`} className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

export function atributoError(id: string, error?: string) {
  return { id, "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : undefined };
}
