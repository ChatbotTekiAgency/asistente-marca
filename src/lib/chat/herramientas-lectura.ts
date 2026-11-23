import { zodSchema } from "ai";
import type { z } from "zod";

type ErrorConsulta = { estado: "parametros_invalidos" | "limite_de_consultas" | "consulta_no_disponible" };

export function crearHerramientaLectura() {
  let restantes = 4;
  return function lectura<I, R>(descripcion: string, schema: z.ZodType<I>, consultar: (args: I) => Promise<R>) {
    return {
      description: descripcion, inputSchema: zodSchema(schema),
      async execute(entrada: unknown): Promise<R | ErrorConsulta> {
        const validada = schema.safeParse(entrada);
        if (!validada.success) return { estado: "parametros_invalidos" };
        if (restantes === 0) return { estado: "limite_de_consultas" };
        restantes -= 1;
        try {
          return await consultar(validada.data);
        } catch {
          return { estado: "consulta_no_disponible" };
        }
      },
    };
  };
}
