import "server-only";

import { db } from "@/db";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { crearConsultasInstagram, type ConsultasInstagram } from "./consultas-chat";

export async function consultasInstagramDeCuentaActiva(): Promise<ConsultasInstagram | null> {
  const cuenta = await getCuentaActiva();
  return cuenta ? crearConsultasInstagram(db, cuenta.id) : null;
}
