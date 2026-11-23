import { mutacionCompetidor, type EstadoCompetidor, type MutacionCompetidor } from "./contrato.ts";

export async function ejecutarMutacionCompetidor(
  operacion: unknown,
  cuentaEsperada: string,
  resolverCuenta: () => Promise<{ id: string } | null>,
  escribir: (cuentaId: string, mutacion: MutacionCompetidor) => Promise<EstadoCompetidor>,
): Promise<EstadoCompetidor> {
  try {
    const cuenta = await resolverCuenta();
    if (!cuenta || cuenta.id !== cuentaEsperada) return "sin_cuenta";
    const entrada = mutacionCompetidor.safeParse(operacion);
    if (!entrada.success) return "invalido";
    return await escribir(cuenta.id, entrada.data);
  } catch {
    return "error";
  }
}
