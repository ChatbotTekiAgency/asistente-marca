"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { InformeComparacion } from "@/lib/competencia/comparacion";
import { formatos, periodo } from "../analitica/presentacion";

const colores = ["#a78bfa", "#2dd4bf", "#fbbf24", "#60a5fa", "#f472b6", "#a3e635"];
const estiloTooltip = { background: "#18181b", border: "1px solid #52525b", color: "#fafafa" };

export function GraficosComparacion({ cuentas, actividad, formatos: distribucion }: {
  cuentas: { id: string; nombre: string }[];
  actividad: InformeComparacion["actividad"];
  formatos: Pick<InformeComparacion["formatos"][number], "cuentaId" | "tipo" | "publicaciones">[];
}) {
  if (!actividad.length) return null;

  const meses = new Map<string, Record<string, string | number>>();
  for (const fila of actividad) {
    const mes = meses.get(fila.mes) ?? { etiqueta: periodo(fila.mes) };
    mes[fila.cuentaId] = fila.publicaciones;
    meses.set(fila.mes, mes);
  }
  for (const mes of meses.values()) {
    for (const cuenta of cuentas) mes[cuenta.id] ??= 0;
  }
  const porFormato = new Map(cuentas.map(({ id, nombre }) => [id, { nombre, carrusel: 0, imagen: 0, video: 0 }]));
  for (const fila of distribucion) {
    const cuenta = porFormato.get(fila.cuentaId);
    if (cuenta) cuenta[fila.tipo] = fila.publicaciones;
  }

  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="min-w-0 rounded-lg border p-4" aria-labelledby="frecuencia-comparacion">
      <h3 id="frecuencia-comparacion" className="font-semibold">Publicaciones por mes</h3>
      <p className="text-sm text-muted-foreground">El gráfico muestra los meses con publicaciones en al menos una cuenta.</p>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...meses.values()]}>
            <CartesianGrid vertical={false} stroke="#52525b" strokeDasharray="3 3" />
            <XAxis dataKey="etiqueta" tick={{ fill: "#d4d4d8", fontSize: 11 }} />
            <YAxis width={34} allowDecimals={false} tick={{ fill: "#d4d4d8" }} />
            <Tooltip contentStyle={estiloTooltip} />
            <Legend />
            {cuentas.map((cuenta, indice) => <Bar key={cuenta.id} dataKey={cuenta.id} name={cuenta.nombre} fill={colores[indice]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
    <section className="min-w-0 rounded-lg border p-4" aria-labelledby="formatos-comparacion">
      <h3 id="formatos-comparacion" className="font-semibold">Publicaciones por formato</h3>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...porFormato.values()]}>
            <CartesianGrid vertical={false} stroke="#52525b" strokeDasharray="3 3" />
            <XAxis dataKey="nombre" tick={{ fill: "#d4d4d8", fontSize: 11 }} />
            <YAxis width={34} allowDecimals={false} tick={{ fill: "#d4d4d8" }} />
            <Tooltip contentStyle={estiloTooltip} />
            <Legend />
            {Object.entries(formatos).map(([tipo, formato]) =>
              <Bar key={tipo} dataKey={tipo} name={formato.nombre} fill={formato.color} stackId="formatos" />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  </div>;
}
