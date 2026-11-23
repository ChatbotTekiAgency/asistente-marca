export interface ProveedorDatos {
  obtenerPublicaciones(opciones: {
    cuentaId: string;
    limite?: number;
    ejecucionAutorizada: boolean;
  }): Promise<{ idEjecucion: string; registros: unknown[] }>;
}
