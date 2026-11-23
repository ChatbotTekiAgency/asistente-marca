import { z } from "zod";
import { usuarioInstagram } from "../instagram/usuario.ts";

export const MAX_COMPETIDORES = 5;
const rutasInstagram = new Set(["accounts", "about", "api", "direct", "explore", "p", "reel", "reels", "stories", "tv", "web"]);
const perfilUrl = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-z0-9._]{1,30})\/?(?:[?#][^\s]*)?$/i;
export const perfilInstagram = z.string().trim().max(512).transform((entrada) =>
  perfilUrl.exec(entrada)?.[1] ?? entrada.replace(/^@/, ""),
).pipe(usuarioInstagram).refine(
  (username) => !rutasInstagram.has(username) && /[a-z0-9_]/.test(username),
  "Escribe el usuario o la URL de un perfil de Instagram.",
);

const opcional = (maximo: number) => z.string().trim().max(maximo).refine((valor) => !valor.includes("\0"))
  .optional().transform((valor) => valor || null);

export const datosCompetidor = z.strictObject({
  perfil: perfilInstagram, nombre: opcional(100), descripcion: opcional(500), activo: z.boolean(),
});

export const mutacionCompetidor = z.discriminatedUnion("accion", [
  z.strictObject({ accion: z.literal("crear"), datos: datosCompetidor }),
  z.strictObject({ accion: z.literal("editar"), id: z.uuid(), revision: z.uuid(), datos: datosCompetidor }),
  z.strictObject({ accion: z.literal("desactivar"), id: z.uuid(), revision: z.uuid() }),
]);

export type MutacionCompetidor = z.output<typeof mutacionCompetidor>;
export type EstadoCompetidor = "guardado" | "invalido" | "sin_cuenta" | "duplicado" | "propia" | "limite" | "conflicto" | "username_fijo" | "error";

export const mensajesCompetidor: Record<EstadoCompetidor, string> = {
  guardado: "Competidor guardado.",
  invalido: "Revisa el perfil de Instagram, el nombre y la descripción.",
  sin_cuenta: "Selecciona la cuenta correcta y verifica tu sesión.",
  duplicado: "Esta cuenta ya tiene registrado ese competidor.",
  propia: "La cuenta activa no puede registrarse como su propio competidor.",
  limite: "Se alcanzó el límite de competidores activos. Desactiva uno para liberar un cupo.",
  conflicto: "El registro no está disponible o cambió. Recarga la página antes de editarlo.",
  username_fijo: "Este competidor ya tiene ingestas. Registra el nuevo usuario por separado para conservar el historial.",
  error: "No se pudo guardar el competidor. Intenta de nuevo.",
};
