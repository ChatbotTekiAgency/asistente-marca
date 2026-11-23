"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { MAX_TEXTO } from "@/lib/chat/contrato";
import { nuevaConversacion } from "./acciones";

export function NuevaConversacion() {
  const [error, action, pendiente] = useActionState(nuevaConversacion, "");
  return (
    <form action={action} className="space-y-2">
      <Button className="w-full" variant="outline" disabled={pendiente}>
        {pendiente ? "Creando…" : "Nueva conversación"}
      </Button>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </form>
  );
}

function textoDe(mensaje: UIMessage) {
  return mensaje.parts.filter(isTextUIPart).map(({ text }) => text).join("");
}

function mensajeError(error: Error) {
  try {
    const payload: unknown = JSON.parse(error.message);
    if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    // Los errores del stream y de red no tienen cuerpo JSON.
  }
  return "No se pudo completar la respuesta. Puedes reintentar el mensaje.";
}

export function Chat({ id, titulo, iniciales, esPrueba }: {
  id: string; titulo: string; iniciales: UIMessage[]; esPrueba: boolean;
}) {
  const router = useRouter();
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ id, messages }) => {
      const usuario = messages.findLast((mensaje) => mensaje.role === "user");
      return { body: { conversacionId: id, solicitudId: usuario?.id, texto: usuario && textoDe(usuario) } };
    },
  }), []);
  const { messages, status, error, sendMessage } = useChat({
    id, messages: iniciales, transport, generateId: () => crypto.randomUUID(),
    onFinish: ({ isAbort, isDisconnect, isError }) => {
      if (!isAbort && !isDisconnect && !isError) router.refresh();
    },
  });
  const scroll = useRef<HTMLDivElement>(null);
  const [borrador, setBorrador] = useState("");
  const ocupado = status === "submitted" || status === "streaming";
  const ultimoUsuario = messages.findLast((mensaje) => mensaje.role === "user");
  const reintento = !ocupado && ultimoUsuario && (error || messages.at(-1)?.role === "user") ? ultimoUsuario : null;

  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const texto = borrador.trim();
    if (ocupado || !texto || texto.length > MAX_TEXTO) return;
    setBorrador("");
    void sendMessage({ text: texto });
  }

  return (
    <Card className="min-w-0 gap-0 border border-white/10 bg-zinc-900 text-zinc-100">
      <CardHeader className="border-b border-white/10 pb-4">
        <h2 className="break-words font-semibold">
          {titulo === "Nueva conversación" && messages[0]?.role === "user"
            ? [...textoDe(messages[0]).replace(/\s+/g, " ")].slice(0, 60).join("") : titulo}
        </h2>
        {esPrueba && <p className="text-xs text-violet-300">Modo de prueba</p>}
      </CardHeader>
      <CardContent className="px-0">
        <div ref={scroll} role="log" aria-label="Historial de mensajes" aria-live="off"
          className="h-[min(54vh,34rem)] min-h-48 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {!messages.length && <p className="text-center text-zinc-400">Escribe un mensaje para empezar.</p>}
          {messages.map((mensaje) => {
            const usuario = mensaje.role === "user";
            const texto = textoDe(mensaje);
            if (!texto) return null;
            return (
              <article key={mensaje.id} className={`w-fit max-w-[92%] break-words rounded-xl border p-3.5 sm:max-w-[85%] ${
                usuario ? "ml-auto border-violet-400/20 bg-violet-500/15" : "border-white/10 bg-zinc-800"
              }`}>
                <p className="mb-1.5 text-xs font-semibold text-zinc-300">{usuario ? "Tú" : "Asistente"}</p>
                {usuario ? <p className="whitespace-pre-wrap">{texto}</p> : (
                  <div className="space-y-2 [&_a]:text-violet-300 [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-zinc-950 [&_pre]:p-2 [&_ul]:list-disc">
                    <Markdown skipHtml
                      allowedElements={["p", "strong", "em", "ul", "ol", "li", "blockquote", "code", "pre", "a", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "br"]}
                      urlTransform={(url) => /^https?:\/\//i.test(url) ? url : ""}
                      components={{ a: ({ href, children }) => href
                        ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                        : <span>{children}</span> }}>
                      {texto}
                    </Markdown>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="block space-y-3 bg-transparent py-4">
        {ocupado && <p role="status" className="text-sm text-zinc-400">El asistente está respondiendo…</p>}
        {error && <p role="alert" className="text-sm text-red-300">{mensajeError(error)}</p>}
        {reintento && (
          <Button variant="outline" size="sm" onClick={() => {
            void sendMessage({ text: textoDe(reintento), messageId: reintento.id });
          }}>
            Reintentar último mensaje
          </Button>
        )}
        <form onSubmit={enviar} className="flex items-end gap-2">
          <label htmlFor="chat-mensaje" className="sr-only">Mensaje</label>
          <textarea id="chat-mensaje" rows={2} maxLength={MAX_TEXTO} value={borrador}
            onChange={(event) => setBorrador(event.target.value)} placeholder="Escribe tu mensaje…"
            className="min-w-0 flex-1 resize-y rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-violet-400" />
          <Button type="submit" size="lg" disabled={ocupado || !borrador.trim()}>Enviar</Button>
        </form>
      </CardFooter>
    </Card>
  );
}
