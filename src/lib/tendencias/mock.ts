import type { MotorTendencias } from "./servicio.ts";

export const motorTendenciasMock: MotorTendencias = {
  proveedor: "mock",
  modelo: "tendencias-mock-v1",
  async investigar(_contexto, signal) {
    signal.throwIfAborted();
    const ejemplos = [
      ["Demostración en tres escenas", "reel"], ["Guía de criterios visuales", "carrusel"],
      ["Pregunta de diagnóstico", "historia"], ["Ficha de proceso", "imagen"],
    ] as const;
    const url = "https://tendencias.example.test/fixture";
    return {
      propuestas: ejemplos.map(([nombre, formato]) => ({
        titulo: `Simulación · ${nombre}`,
        descripcion: "Ejemplo ficticio para comprobar el flujo. No representa una tendencia investigada.",
        relevanciaMarca: "Relevancia hipotética para una audiencia de prueba.",
        ejemploAplicacion: `Crear una demostración de ${nombre.toLowerCase()} y revisar el formato con el equipo.`,
        publicoObjetivo: "Audiencia de prueba", formato, relevancia: "medio", urlsFuentes: [url],
      })),
      evidencias: [{ titulo: "Fuente ficticia de prueba", url, sitio: "Simulación local" }],
      uso: { costoEstimadoUsd: 0 },
    };
  },
};
