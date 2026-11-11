
export default function DashboardPage() {
  return (
    <div className="space-y-10">

      {/* Encabezado */}
      <section>
        <p className="text-sm font-semibold tracking-[0.2em] text-violet-400">
          TEKIAGENCY
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
          Dashboard
        </h1>

        <p className="mt-2 text-sm text-zinc-400">
          Bienvenido a tu panel de administración.
        </p>
      </section>

      {/* Indicadores */}
      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

        <article className="rounded-xl border border-white/10 bg-zinc-900 p-6 transition hover:border-violet-500/40">
          <p className="text-sm font-medium text-zinc-400">
            Estado
          </p>

          <div className="mt-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <p className="text-2xl font-semibold text-green-400">
              Activo
            </p>
          </div>
        </article>

        <article className="rounded-xl border border-white/10 bg-zinc-900 p-6 transition hover:border-violet-500/40">
          <p className="text-sm font-medium text-zinc-400">
            Sesión
          </p>

          <p className="mt-4 text-2xl font-semibold text-white">
            Iniciada
          </p>
        </article>

        <article className="rounded-xl border border-white/10 bg-zinc-900 p-6 transition hover:border-violet-500/40">
          <p className="text-sm font-medium text-zinc-400">
            Versión
          </p>

          <p className="mt-4 text-2xl font-semibold text-white">
            0.1.0
          </p>
        </article>

      </section>

      {/* Bienvenida */}
      <section className="rounded-xl border border-white/10 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold text-white">
          Bienvenido
        </h2>

        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
          Este es el panel principal de TekiAgency.
          Desde aquí podrás gestionar las herramientas
          y funcionalidades de tu asistente.
        </p>
      </section>

    </div>
  );
}
