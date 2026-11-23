import type { VistaPrevia, FilaPlan, Modalidad, Proveedor } from "./contrato.ts";
import { huella, reservaUsd, type Entrada } from "./motor.ts";
import type { IdentidadAnalisis } from "./repositorio.ts";

export function generarVistaPrevia(filas: (FilaPlan & { identidad: IdentidadAnalisis })[], config: {
  proveedor: Proveedor; modelo: string; presupuesto: number; tarifaEntrada: number; tarifaSalida: number;
  maxEntrada: number; maxSalida: number;
}): VistaPrevia {
  const procesables = filas.filter((fila) => fila.estado === "lista").length;
  const costoUsd = procesables * reservaUsd(config.maxEntrada, config.maxSalida, config.tarifaEntrada, config.tarifaSalida);
  return {
    huella: huella([filas, config.proveedor, config.modelo, config.presupuesto, config.maxEntrada, config.maxSalida,
      config.tarifaEntrada, config.tarifaSalida]),
    proveedor: config.proveedor, modelo: config.modelo, filas: filas.map(({ id, shortcode, estado }) => ({ id, shortcode, estado })),
    procesables, costoUsd, presupuestoUsd: config.presupuesto, permitido: procesables > 0 && costoUsd <= config.presupuesto,
  };
}

export function identidadDePost(id: string, entrada: Entrada, modalidad: Modalidad, proveedor: Proveedor, modelo: string) {
  return { postId: id, proveedor, modelo, modalidad, hashContenido: huella(entrada) } satisfies IdentidadAnalisis;
}
