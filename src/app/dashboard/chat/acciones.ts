"use server";

import { redirect } from "next/navigation";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { leerChat } from "@/lib/chat/neon";

export async function nuevaConversacion(): Promise<string> {
  let id: string;
  try {
    const cuenta = await getCuentaActiva();
    if (!cuenta) return "Selecciona una cuenta activa para crear una conversación.";
    id = await leerChat.crear(cuenta.id);
  } catch {
    return "No se pudo crear la conversación. Intenta de nuevo.";
  }
  redirect(`/dashboard/chat?conversacion=${id}`);
}
