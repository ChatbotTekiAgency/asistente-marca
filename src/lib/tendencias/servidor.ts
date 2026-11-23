import "server-only";

import { db } from "@/db";
import { conBaseTransaccional } from "@/db/transacciones";
import { getCuentaActiva } from "@/lib/accounts/active-account";
import { obtenerContextoMarca } from "@/lib/marca/servidor";
import { crearRepositorioTendencias } from "./repositorio";
import { crearLecturasTendencias, crearServicioTendencias, type MotorTendencias } from "./servicio";
import { configurarMotorTendencias } from "./proveedor";
import { leerLimitesTendencias } from "./configuracion";

export async function lecturasTendenciasDeCuentaActiva() {
  const cuenta = await getCuentaActiva();
  return cuenta ? crearLecturasTendencias(crearRepositorioTendencias(db, cuenta.id)) : null;
}

export async function tendenciasDeCuentaActiva(motor?: MotorTendencias, cuentaEsperada?: string) {
  const cuenta = await getCuentaActiva();
  if (!cuenta || (cuentaEsperada !== undefined && cuenta.id !== cuentaEsperada)) return null;

  const repo = crearRepositorioTendencias(db, cuenta.id);
  const config = leerLimitesTendencias(process.env);
  return crearServicioTendencias({
    ...repo,
    reservar: (...args) => conBaseTransaccional((transaccional) =>
      crearRepositorioTendencias(transaccional, cuenta.id).reservar(...args)),
    completar: (...args) => conBaseTransaccional((transaccional) =>
      crearRepositorioTendencias(transaccional, cuenta.id).completar(...args)),
  }, motor ?? configurarMotorTendencias(), () => obtenerContextoMarca(cuenta.id), {
    cuentaId: cuenta.id, horasCache: config.TRENDS_CACHE_HOURS,
    limiteDiario: config.TRENDS_DAILY_LIMIT, mercadoPorDefecto: config.TRENDS_MARKET,
  });
}
