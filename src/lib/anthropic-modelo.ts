import { z } from "zod";

export const modeloAnthropic = z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
