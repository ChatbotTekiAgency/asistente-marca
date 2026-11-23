import { Suspense } from "react";
import Link from "next/link";
import { DrizzleQueryError } from "drizzle-orm";
import { z } from "zod";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { leerChat } from "@/lib/chat/neon";
import { env } from "@/env";
import { Chat, NuevaConversacion } from "./panel";

type Busqueda = Promise<{ conversacion?: string | string[] }>;

async function cargarConversaciones(cuentaId: string, conversacion?: string | string[]) {
  try {
    const seleccion = z.uuid().safeParse(conversacion);
    const lista = await leerChat.listar(cuentaId);
    const activa = conversacion === undefined ? lista[0] : lista.find((fila) => fila.id === seleccion.data);
    const historial = activa ? await leerChat.historial(cuentaId, activa.id) : [];
    return { datos: { lista, activa, historial } };
  } catch (error) {
    const causa = error instanceof DrizzleQueryError ? error.cause : error;
    const tablaAusente = causa instanceof Error && "code" in causa && causa.code === "42P01";
    return {
      mensaje: tablaAusente
        ? "Faltan las tablas del chat en la base de datos conectada. Verifica que la migración 0002_chat esté aplicada en Neon dev."
        : "No se pudieron cargar las conversaciones. Intenta de nuevo.",
    };
  }
}

async function ContenidoChat({ searchParams }: { searchParams: Busqueda }) {
  const cuenta = await getCuentaActiva();
  if (!cuenta) return <p className="text-zinc-400">Selecciona una cuenta para abrir el chat.</p>;

  const { conversacion } = await searchParams;
  const resultado = await cargarConversaciones(cuenta.id, conversacion);
  if (!resultado.datos) return <p role="alert" className="text-red-300">{resultado.mensaje}</p>;
  const { lista, activa, historial } = resultado.datos;

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="min-w-0 self-start border border-white/10 bg-zinc-900 text-zinc-100">
        <CardHeader>
          <h2 className="font-semibold">Conversaciones</h2>
          <p className="truncate text-xs text-zinc-400">@{cuenta.username}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <NuevaConversacion key={cuenta.id} />
          {lista.length > 0 && (
            <nav aria-label="Conversaciones" className="max-h-52 overflow-y-auto md:max-h-[60vh]">
              <ul className="space-y-1">
                {lista.map((fila) => (
                  <li key={fila.id}>
                    <Link href={`/dashboard/chat?conversacion=${fila.id}`} prefetch={false}
                      aria-current={activa?.id === fila.id ? "page" : undefined}
                      className="block truncate rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 aria-[current=page]:bg-violet-500/15 aria-[current=page]:text-violet-200">
                      {fila.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </CardContent>
      </Card>
      {activa ? (
        <Chat key={`${cuenta.id}:${activa.id}`} id={activa.id} titulo={activa.titulo}
          iniciales={historial} esPrueba={env.AI_PROVIDER === "mock"} />
      ) : (
        <Card className="min-w-0 border border-white/10 bg-zinc-900 text-zinc-100">
          <CardContent className="py-10 text-center text-zinc-400">
            {conversacion ? "Esta conversación no está disponible para la cuenta activa." : "Crea una conversación para empezar."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ChatPage({ searchParams }: { searchParams: Busqueda }) {
  return (
    <section aria-labelledby="chat-titulo" className="space-y-5">
      <h1 id="chat-titulo" className="text-3xl font-bold tracking-tight text-white">Chat de marca</h1>
      <Suspense fallback={<p className="text-sm text-zinc-400">Cargando conversaciones…</p>}>
        <ContenidoChat searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
