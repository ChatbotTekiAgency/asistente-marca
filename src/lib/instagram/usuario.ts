import { z } from "zod";

export const usuarioInstagram = z.string().regex(/^[a-z0-9._]{1,30}$/i)
  .transform((usuario) => usuario.toLowerCase());
