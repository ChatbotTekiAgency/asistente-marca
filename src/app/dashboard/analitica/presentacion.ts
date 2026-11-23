import type { FormatoInstagram } from "@/lib/instagram/filtros-analitica";

export const formatos = {
  carrusel: { nombre: "Carrusel", color: "#a78bfa" },
  video: { nombre: "Video / Reel", color: "#2dd4bf" },
  imagen: { nombre: "Imagen", color: "#fbbf24" },
} satisfies Record<FormatoInstagram, { nombre: string; color: string }>;

const cantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });
const momento = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota",
});
const mes = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric", timeZone: "UTC" });

export function numero(valor: string | number | null) {
  if (valor === null) return "Sin datos";
  return cantidad.format(typeof valor === "string" ? BigInt(valor) : valor);
}

export function fechaPublicacion(valor: string | null) {
  return valor ? fecha.format(new Date(valor)) : "Sin datos";
}

export function fechaCaptura(valor: string | null) {
  return valor ? momento.format(new Date(valor)) : "Sin datos";
}

export function periodo(valor: string) {
  return mes.format(new Date(`${valor}-01T00:00:00Z`));
}
