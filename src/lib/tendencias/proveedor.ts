import { crearMotorTendenciasAnthropic } from "./anthropic.ts";
import { leerConfiguracionTendencias } from "./configuracion.ts";
import { motorTendenciasMock } from "./mock.ts";

export function configurarMotorTendencias(variables: Record<string, string | undefined> = process.env) {
  const config = leerConfiguracionTendencias(variables);
  return config.proveedor === "mock" ? motorTendenciasMock : crearMotorTendenciasAnthropic(config);
}
