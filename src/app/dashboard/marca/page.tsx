import { Suspense } from "react";
import { DrizzleQueryError } from "drizzle-orm";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { repositorioMarca } from "@/lib/marca/servidor";
import { perfilMarcaSchema } from "@/lib/marca/validacion";
import { guardarPerfilMarca } from "./acciones";
import { EditorMarca } from "./editor";

async function ContenidoMarca() {
  const cuenta = await getCuentaActiva();
  if (!cuenta) return <p className="text-sm text-zinc-400">Selecciona una cuenta para editar su perfil.</p>;

  let perfil;
  try {
    perfil = await repositorioMarca.obtener(cuenta.id);
  } catch (error) {
    const causa = error instanceof DrizzleQueryError ? error.cause : error;
    const faltaTabla = causa instanceof Error && "code" in causa && causa.code === "42P01";
    const faltaIdentidad = causa instanceof Error && "code" in causa && causa.code === "42703";
    return <p role="alert" className="rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-200">
      {faltaTabla
        ? "La tabla del perfil de marca aún no está disponible en la base conectada."
        : faltaIdentidad ? "La base conectada aún no tiene la columna de identidad visual. Verifica la migración 0004."
          : "No se pudo cargar el perfil de marca. Recarga la página para volver a intentarlo."}
    </p>;
  }

  return (
    <>
      <p className="text-sm text-zinc-400">Cuenta activa · @{cuenta.username}</p>
      <EditorMarca key={cuenta.id} inicial={perfil?.datos ?? perfilMarcaSchema.parse({})}
        revisionInicial={perfil?.revision ?? null} fechaInicial={perfil?.actualizadaEn.toISOString() ?? null}
        guardarAction={guardarPerfilMarca.bind(null, cuenta.id)} />
    </>
  );
}

export default function MarcaPage() {
  return (
    <section className="space-y-4" aria-labelledby="marca-titulo">
      <h1 id="marca-titulo" className="text-3xl font-bold tracking-tight text-white">Perfil de marca</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Cargando perfil…</p>}>
        <ContenidoMarca />
      </Suspense>
    </section>
  );
}
