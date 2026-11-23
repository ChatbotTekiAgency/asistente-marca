"use client";

import {
  Bar, CartesianGrid, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatosInstagram } from "@/lib/instagram/filtros-analitica";
import type { FormatoAnalitica, MesAnalitica } from "@/lib/instagram/analitica";
import { formatos, numero, periodo } from "./presentacion";

const tooltip = { backgroundColor: "#18181b", borderColor: "#3f3f46", borderRadius: 8 };
const colorMediana = "#e4e4e7";

export function Distribucion({ datos }: { datos: FormatoAnalitica[] }) {
  const series = formatosInstagram.map((tipo) => ({
    nombre: formatos[tipo].nombre,
    cantidad: datos.find((fila) => fila.tipo === tipo)?.publicaciones ?? 0,
    fill: formatos[tipo].color,
  }));

  return (
    <>
      <div className="h-48 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart aria-label="Distribución de publicaciones por formato">
            <Pie data={series} dataKey="cantidad" nameKey="nombre" innerRadius="60%" outerRadius="88%"
              stroke="none" isAnimationActive={false} />
            <Tooltip contentStyle={tooltip} labelStyle={{ color: "#f4f4f5" }}
              formatter={(valor) => [numero(Number(valor)), "Publicaciones"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid gap-2">
        {series.map(({ nombre, cantidad, fill }) => (
          <li key={nombre} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-zinc-300">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: fill }} />{nombre}
            </span>
            <span className="tabular-nums text-white">{numero(cantidad)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function PublicacionesPorMes({ datos }: { datos: MesAnalitica[] }) {
  const hayMediana = datos.some(({ mediana }) => mediana !== null);
  return (
    <>
      <div className="h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={datos} aria-label="Publicaciones por mes y mediana de interacciones">
            <CartesianGrid stroke="#3f3f46" vertical={false} />
            <XAxis dataKey="mes" tickFormatter={periodo} tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} width={33} tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickLine={false} axisLine={false} />
            {hayMediana && (
              <YAxis yAxisId="interacciones" orientation="right" width="auto"
                tick={{ fill: colorMediana, fontSize: 11 }} tickLine={false} axisLine={false} />
            )}
            <Tooltip contentStyle={tooltip} labelStyle={{ color: "#f4f4f5" }}
              labelFormatter={(valor) => periodo(String(valor))}
              cursor={{ fill: "#ffffff0d" }} />
            {formatosInstagram.map((tipo) => (
              <Bar key={tipo} dataKey={tipo} name={formatos[tipo].nombre} stackId="formatos" maxBarSize={36}
                fill={formatos[tipo].color} isAnimationActive={false} />
            ))}
            {hayMediana && (
              <Line yAxisId="interacciones" dataKey="mediana" name="Mediana de interacciones"
                stroke={colorMediana} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-zinc-400">
        Barras: publicaciones por formato{hayMediana ? ". Línea, eje derecho: mediana de interacciones" : ""}.
      </p>
    </>
  );
}
