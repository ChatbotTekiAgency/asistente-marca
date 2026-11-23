import { parseArgs } from "node:util";
import { contextoMarcaParaPrompt } from "../src/lib/marca/contexto.ts";
import { ErrorMotorTendencias, salidaProveedorTendencias } from "../src/lib/tendencias/contrato.ts";
import { configurarMotorTendencias } from "../src/lib/tendencias/proveedor.ts";

async function main() {
  const { values } = parseArgs({ options: {
    "autorizar-costo": { type: "boolean" },
    sector: { type: "string" },
  } });
  const motor = configurarMotorTendencias();
  if (motor.proveedor === "anthropic" && !values["autorizar-costo"]) {
    console.error("La prueba real requiere --autorizar-costo.");
    process.exitCode = 1;
    return;
  }
  if (values["autorizar-costo"] && motor.proveedor !== "anthropic") {
    console.error("Configura TRENDS_PROVIDER=anthropic para la prueba real.");
    process.exitCode = 1;
    return;
  }

  const resultado = salidaProveedorTendencias.parse(await motor.investigar({
    instrucciones: "Investiga tendencias recientes y accionables y responde en español.",
    referenciaMarca: contextoMarcaParaPrompt(values.sector ? { sector: values.sector } : null),
  }, AbortSignal.timeout(85_000)));
  for (const { titulo, urlsFuentes } of resultado.propuestas) {
    console.log(JSON.stringify({ titulo, urlsFuentes }));
  }
  console.log(JSON.stringify({ proveedor: motor.proveedor, modelo: motor.modelo, uso: resultado.uso }));
}

main().catch((error: unknown) => {
  const codigo = error instanceof ErrorMotorTendencias ? error.codigo : "configuracion_o_respuesta_invalida";
  console.error(`La prueba no pudo completarse (${codigo}).`);
  process.exitCode = 1;
});
