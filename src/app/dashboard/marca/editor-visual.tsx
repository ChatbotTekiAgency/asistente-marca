import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  camposVisuales, funcionesColor, hexColor, limitesVisuales, moverColor, usosTipografia, type IdentidadVisual,
} from "@/lib/marca/identidad-visual";
import { Campo, atributoError } from "./campo";

const selector = "h-8 w-full rounded-lg border border-input bg-zinc-950 px-2 text-sm focus-visible:outline-2 focus-visible:outline-violet-400 aria-invalid:border-destructive";
const titulos = { logotipo: "Logotipo", estilo: "Estilo gráfico", lineamientos: "Lineamientos generales" };
type Grupo = keyof typeof camposVisuales;
type Color = IdentidadVisual["paleta"][number];
type Tipografia = IdentidadVisual["tipografias"][number];

export function EditorVisual({ identidad, errores, cambiar }: {
  identidad: IdentidadVisual;
  errores: Record<string, string>;
  cambiar: (identidad: IdentidadVisual, cambioDeLista?: boolean) => void;
}) {
  function campo(ruta: string) {
    const id = `visual-${ruta.replaceAll(".", "-")}`;
    const error = errores[`datos.identidadVisual.${ruta}`];
    return { id, error, props: atributoError(id, error) };
  }
  function editarColor(indice: number, valores: Partial<Color>) {
    cambiar({ ...identidad, paleta: identidad.paleta.map((color, i) => i === indice ? { ...color, ...valores } : color) });
  }
  function editarTipografia(indice: number, valores: Partial<Tipografia>) {
    cambiar({ ...identidad, tipografias: identidad.tipografias.map((tipo, i) => i === indice ? { ...tipo, ...valores } : tipo) });
  }
  function campos(grupo: Grupo) {
    const valores: Record<string, string | undefined> = identidad[grupo];
    return (
      <section className="space-y-3">
        <h3 className="font-medium">{titulos[grupo]}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(camposVisuales[grupo]).map(([clave, etiqueta]) => {
            const { id, error, props } = campo(`${grupo}.${clave}`);
            return <Campo key={id} id={id} etiqueta={etiqueta} error={error}>
              <Textarea {...props} rows={2} maxLength={limitesVisuales.campo}
                value={valores[clave] ?? ""} onChange={(e) => cambiar({
                  ...identidad, [grupo]: { ...valores, [clave]: e.target.value },
                })} />
            </Campo>;
          })}
        </div>
      </section>
    );
  }

  return (
    <Card id="identidad-visual" className="scroll-mt-4 border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
      <CardHeader><h2 className="text-lg font-semibold">Identidad visual</h2></CardHeader>
      <CardContent className="space-y-6">
        {campos("logotipo")}
        <section className="space-y-3 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Paleta de colores</h3>
            <Button type="button" variant="outline" disabled={identidad.paleta.length >= limitesVisuales.colores}
              onClick={() => cambiar({ ...identidad, paleta: [...identidad.paleta,
                { nombre: "", hex: "", funcion: "primario", descripcion: "" }] }, true)}>Añadir color</Button>
          </div>
          {campo("paleta").error && <p className="text-sm text-red-300">{campo("paleta").error}</p>}
          {identidad.paleta.some(({ hex }) => hexColor.test(hex.trim())) && (
            <ul aria-label="Vista previa de la paleta" className="flex flex-wrap gap-2">
              {identidad.paleta.map(({ hex, nombre, funcion }, i) => hexColor.test(hex.trim()) && (
                <li key={i} className="flex items-center gap-2 rounded border border-white/10 px-2 py-1 text-xs">
                  <span aria-hidden className="size-5 rounded border border-white/20" style={{ backgroundColor: hex.trim() }} />
                  <span className="break-all">{nombre || funcionesColor[funcion]} · {hex.trim().toUpperCase()}</span>
                </li>
              ))}
            </ul>
          )}
          {identidad.paleta.map((color, i) => {
            const hex = campo(`paleta.${i}.hex`);
            const nombre = campo(`paleta.${i}.nombre`);
            const funcion = campo(`paleta.${i}.funcion`);
            const descripcion = campo(`paleta.${i}.descripcion`);
            return (
              <fieldset key={i} className="grid min-w-0 gap-3 rounded-lg border border-white/10 p-3 sm:grid-cols-2">
                <legend className="px-1 text-sm">Color {i + 1}</legend>
                <Campo id={nombre.id} etiqueta="Nombre" error={nombre.error}>
                  <Input {...nombre.props} value={color.nombre} maxLength={limitesVisuales.nombre}
                    onChange={(e) => editarColor(i, { nombre: e.target.value })} />
                </Campo>
                <Campo id={hex.id} etiqueta="Código HEX" error={hex.error}>
                  <div className="flex gap-2">
                    <input type="color" aria-label={`Selector para el color ${i + 1}`}
                      className="h-8 w-10 shrink-0 rounded border border-input bg-zinc-950"
                      value={hexColor.test(color.hex.trim()) ? color.hex.trim().toLowerCase() : "#000000"}
                      onChange={(e) => editarColor(i, { hex: e.target.value.toUpperCase() })} />
                    <Input {...hex.props} value={color.hex} placeholder="#1A2B3C" maxLength={7}
                      onChange={(e) => editarColor(i, { hex: e.target.value })} />
                  </div>
                </Campo>
                <Campo id={funcion.id} etiqueta="Función del color" error={funcion.error}>
                  <select {...funcion.props} className={selector} value={color.funcion}
                    onChange={(e) => editarColor(i, { funcion: e.target.value as Color["funcion"] })}>
                    {Object.entries(funcionesColor).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                  </select>
                </Campo>
                <Campo id={descripcion.id} etiqueta="Descripción de uso" error={descripcion.error}>
                  <Textarea {...descripcion.props} value={color.descripcion} rows={2} maxLength={limitesVisuales.aplicacion}
                    onChange={(e) => editarColor(i, { descripcion: e.target.value })} />
                </Campo>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="button" variant="outline" size="sm" aria-label={`Subir color ${i + 1}`} disabled={i === 0}
                    onClick={() => cambiar({ ...identidad, paleta: moverColor(identidad.paleta, i, -1) }, true)}>Subir</Button>
                  <Button type="button" variant="outline" size="sm" aria-label={`Bajar color ${i + 1}`} disabled={i === identidad.paleta.length - 1}
                    onClick={() => cambiar({ ...identidad, paleta: moverColor(identidad.paleta, i, 1) }, true)}>Bajar</Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Quitar color ${i + 1}`}
                    onClick={() => cambiar({ ...identidad, paleta: identidad.paleta.filter((_, indice) => indice !== i) }, true)}>Quitar</Button>
                </div>
              </fieldset>
            );
          })}
        </section>
        <section className="space-y-3 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Tipografía</h3>
            <Button type="button" variant="outline" disabled={identidad.tipografias.length >= limitesVisuales.tipografias}
              onClick={() => cambiar({ ...identidad, tipografias: [...identidad.tipografias,
                { nombre: "", uso: "cuerpo", descripcion: "" }] }, true)}>Añadir tipografía</Button>
          </div>
          {identidad.tipografias.length > 0 && <p className="text-xs text-zinc-400">La vista previa usa fuentes disponibles en este dispositivo.</p>}
          {campo("tipografias").error && <p className="text-sm text-red-300">{campo("tipografias").error}</p>}
          {identidad.tipografias.map((tipo, i) => {
            const nombre = campo(`tipografias.${i}.nombre`);
            const uso = campo(`tipografias.${i}.uso`);
            const descripcion = campo(`tipografias.${i}.descripcion`);
            return (
              <fieldset key={i} className="grid min-w-0 gap-3 rounded-lg border border-white/10 p-3 sm:grid-cols-2">
                <legend className="px-1 text-sm">Tipografía {i + 1}</legend>
                <Campo id={nombre.id} etiqueta="Nombre de la tipografía" error={nombre.error}>
                  <Input {...nombre.props} value={tipo.nombre} maxLength={limitesVisuales.nombre}
                    onChange={(e) => editarTipografia(i, { nombre: e.target.value })} />
                </Campo>
                <Campo id={uso.id} etiqueta="Uso" error={uso.error}>
                  <select {...uso.props} className={selector} value={tipo.uso}
                    onChange={(e) => editarTipografia(i, { uso: e.target.value as Tipografia["uso"] })}>
                    {Object.entries(usosTipografia).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                  </select>
                </Campo>
                <Campo id={descripcion.id} etiqueta="Descripción de aplicación" error={descripcion.error}>
                  <Textarea {...descripcion.props} value={tipo.descripcion} rows={2} maxLength={limitesVisuales.aplicacion}
                    onChange={(e) => editarTipografia(i, { descripcion: e.target.value })} />
                </Campo>
                {tipo.nombre.trim() && <p className="self-center break-all text-xl"
                  style={{ fontFamily: `${JSON.stringify(tipo.nombre.trim())}, sans-serif` }}>Aa 123 · {tipo.nombre}</p>}
                <div className="sm:col-span-2">
                  <Button type="button" variant="ghost" size="sm" aria-label={`Quitar tipografía ${i + 1}`}
                    onClick={() => cambiar({ ...identidad, tipografias: identidad.tipografias.filter((_, indice) => indice !== i) }, true)}>Quitar</Button>
                </div>
              </fieldset>
            );
          })}
        </section>
        {campos("estilo")}
        {campos("lineamientos")}
      </CardContent>
    </Card>
  );
}
