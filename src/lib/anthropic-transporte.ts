import { z } from "zod";

export const URL_API_ANTHROPIC = "https://api.anthropic.com/v1";

export class ErrorConteoAnthropic extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Anthropic rechazó el conteo de tokens.");
    this.status = status;
  }
}

export async function contarTokensAnthropic(
  cuerpo: Record<string, unknown>, headers: HeadersInit | undefined, signal: AbortSignal, transporte: typeof fetch,
) {
  const campos = ["model", "messages", "system", "tools", "tool_choice", "output_config", "thinking"];
  const respuesta = await transporte(`${URL_API_ANTHROPIC}/messages/count_tokens`, {
    method: "POST", headers, signal, redirect: "error",
    body: JSON.stringify(Object.fromEntries(campos.filter((campo) => campo in cuerpo).map((campo) => [campo, cuerpo[campo]]))),
  });
  if (!respuesta.ok) throw new ErrorConteoAnthropic(respuesta.status);
  return z.object({ input_tokens: z.number().int().nonnegative() }).parse(await respuesta.json()).input_tokens;
}
