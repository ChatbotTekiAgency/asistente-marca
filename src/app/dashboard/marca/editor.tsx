"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, atributoError } from "./campo";
import { EditorVisual } from "./editor-visual";
import {
  erroresDePerfil, guardarPerfilSchema, limitesMarca, limitesPilar,
  type CampoMarca, type DatosPerfilMarca, type ResultadoGuardarPerfil,
} from "@/lib/marca/validacion";

const secciones: { id: string; titulo: string; campos: [CampoMarca, string][] }[] = [
  { id: "identidad", titulo: "Identidad", campos: [
    ["nombre", "Nombre comercial"], ["sector", "Sector o industria"], ["descripcion", "Descripción de la marca"],
    ["productosServicios", "Productos y servicios"], ["propuestaValor", "Propuesta de valor"],
  ] },
  { id: "audiencia", titulo: "Audiencia", campos: [
    ["publicoObjetivo", "Público objetivo"], ["necesidades", "Necesidades"], ["intereses", "Intereses"],
    ["problemas", "Problemas que busca resolver"],
  ] },
  { id: "comunicacion", titulo: "Comunicación", campos: [
    ["personalidad", "Personalidad de marca"], ["tono", "Tono de comunicación"], ["valores", "Valores de marca"],
    ["expresionesPreferidas", "Expresiones preferidas"], ["expresionesEvitar", "Expresiones que deben evitarse"],
  ] },
  { id: "estrategia", titulo: "Estrategia", campos: [
    ["objetivos", "Objetivos de comunicación"], ["diferenciadores", "Diferenciadores"],
  ] },
];

type BorradorPilar = { clave: string; nombre: string; descripcion: string; objetivo: string; temas: string };
const sinPilar = { nombre: "", descripcion: "", objetivo: "", temas: "" };
const fecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota",
});

export function EditorMarca({ inicial, revisionInicial, fechaInicial, guardarAction }: {
  inicial: DatosPerfilMarca; revisionInicial: string | null; fechaInicial: string | null;
  guardarAction: (entrada: unknown) => Promise<ResultadoGuardarPerfil>;
}) {
  const [revision, setRevision] = useState(revisionInicial);
  const [actualizadaEn, setActualizadaEn] = useState(fechaInicial);
  const [datos, setDatos] = useState(inicial);
  const [pilares, setPilares] = useState<BorradorPilar[]>(() =>
    inicial.pilares.map((pilar, indice) => ({ ...pilar, clave: String(indice), temas: pilar.temas.join("\n") })));
  const [resultado, setResultado] = useState<ResultadoGuardarPerfil | null>(null);
  const [pendiente, iniciarGuardado] = useTransition();
  const errores = resultado?.estado === "invalido" ? resultado.errores : {};
  const conflicto = resultado?.estado === "conflicto" || resultado?.estado === "cuenta";

  const pilaresCompletos = pilares.length > 0 && pilares.every((pilar) =>
    pilar.nombre.trim() && pilar.descripcion.trim() && pilar.objetivo.trim() && pilar.temas.trim());
  const faltantes = secciones.filter(({ id, campos }) => campos.some(([campo]) => !datos[campo].trim())
    || (id === "estrategia" && !pilaresCompletos));

  const visual = datos.identidadVisual;
  const visualPendiente = !Object.values(visual.logotipo).some((valor) => valor?.trim())
    || !visual.paleta.length || !visual.tipografias.length
    || !Object.values(visual.estilo).some((valor) => valor?.trim())
    || !Object.values(visual.lineamientos).some((valor) => valor?.trim());

  function guardarCambios(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendiente || conflicto) return;
    const entrada = guardarPerfilSchema.safeParse({
      revision,
      datos: { ...datos, pilares: pilares.map(({ nombre, descripcion, objetivo, temas }) => ({
        nombre, descripcion, objetivo, temas: temas.split(/\r?\n/).map((tema) => tema.trim()).filter(Boolean),
      })) },
    });
    if (!entrada.success) {
      setResultado({ estado: "invalido", errores: erroresDePerfil(entrada.error) });
      return;
    }
    iniciarGuardado(async () => {
      setResultado(null);
      try {
        const guardado = await guardarAction(entrada.data);
        if (guardado.estado === "guardado") {
          setRevision(guardado.revision);
          setActualizadaEn(guardado.actualizadaEn);
        }
        setResultado(guardado);
      } catch {
        setResultado({ estado: "error" });
      }
    });
  }

  function editarPilar(clave: string, campo: keyof typeof sinPilar, valor: string) {
    setPilares((lista) => lista.map((pilar) => pilar.clave === clave ? { ...pilar, [campo]: valor } : pilar));
  }

  function cambiarLista(lista: BorradorPilar[]) {
    setPilares(lista);
    if (resultado?.estado === "invalido") setResultado(null);
  }

  const mensaje = resultado?.estado === "guardado" ? "Perfil guardado."
    : resultado?.estado === "invalido" ? "Revisa los campos marcados antes de guardar."
    : resultado?.estado === "conflicto" ? "Hay una versión más reciente del perfil. Tus cambios siguen en el formulario."
    : resultado?.estado === "cuenta" ? "Cambió la cuenta activa o venció la sesión. Revisa la cuenta antes de continuar."
    : resultado?.estado === "error" ? "No se pudo guardar el perfil. Intenta de nuevo." : null;

  return (
    <form onSubmit={guardarCambios} className="space-y-4">
      <Card className="border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
        <CardContent className="space-y-2">
          {!revision && <p className="text-sm text-zinc-300">Aún no hay un perfil. Completa lo que conozcas de la marca y guarda un borrador.</p>}
          {faltantes.length || visualPendiente ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-zinc-400">Secciones por completar</span>
              {faltantes.map(({ id, titulo }) => <a key={id} href={`#${id}`} className="rounded-md bg-violet-500/15 px-2 py-1 text-violet-200 hover:underline">{titulo}</a>)}
              {visualPendiente && <a href="#identidad-visual" className="rounded-md bg-violet-500/15 px-2 py-1 text-violet-200 hover:underline">Identidad visual</a>}
            </div>
          ) : <p className="text-sm text-emerald-300">Todas las secciones están completas.</p>}
        </CardContent>
      </Card>
      <fieldset disabled={pendiente} className="min-w-0 space-y-4">
        <legend className="sr-only">Datos del perfil</legend>
        {secciones.map(({ id, titulo, campos }) => (
          <Card key={id} id={id} className="scroll-mt-4 border border-white/10 bg-zinc-900 text-zinc-100 ring-0">
            <CardHeader><h2 className="text-lg font-semibold">{titulo}</h2></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {campos.map(([campo, etiqueta]) => {
                const error = errores[`datos.${campo}`];
                const props = {
                  ...atributoError(campo, error), value: datos[campo], maxLength: limitesMarca[campo],
                  onChange: (event: { target: { value: string } }) =>
                    setDatos({ ...datos, [campo]: event.target.value }),
                };
                return (
                  <Campo key={campo} id={campo} etiqueta={etiqueta} error={error}>
                    {limitesMarca[campo] <= 120 ? <Input {...props} /> : <Textarea {...props} rows={3} />}
                  </Campo>
                );
              })}
              {id === "estrategia" && (
                <div className="space-y-3 border-t border-white/10 pt-4 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">Pilares de contenido</h3>
                    <Button type="button" variant="outline" disabled={pilares.length >= limitesPilar.cantidad}
                      onClick={() => cambiarLista([...pilares, { ...sinPilar, clave: crypto.randomUUID() }])}>
                      <Plus aria-hidden /> Añadir pilar
                    </Button>
                  </div>
                  {errores["datos.pilares"] && <p className="text-sm text-red-300">{errores["datos.pilares"]}</p>}
                  {!pilares.length && <p className="text-sm text-zinc-400">Añade los temas que la marca quiere cubrir de forma recurrente.</p>}
                  {pilares.map((pilar, indice) => (
                    <div key={pilar.clave} className="grid gap-3 rounded-lg border border-white/10 bg-zinc-950/60 p-4 sm:grid-cols-2">
                      <div className="flex items-center justify-between gap-2 sm:col-span-2">
                        <h4 className="break-words font-medium">{pilar.nombre.trim() || "Nuevo pilar"}</h4>
                        <Button type="button" variant="ghost" size="sm" onClick={() => cambiarLista(pilares.filter((item) => item.clave !== pilar.clave))}>
                          Quitar
                        </Button>
                      </div>
                      {([
                        ["nombre", "Nombre"], ["descripcion", "Descripción"], ["objetivo", "Objetivo"],
                        ["temas", "Ejemplos de temas, uno por línea"],
                      ] as const).map(([campo, etiqueta]) => {
                        const id = `pilar-${pilar.clave}-${campo}`;
                        const ruta = `datos.pilares.${indice}.${campo}`;
                        const error = errores[ruta] ?? Object.entries(errores).find(([clave]) => clave.startsWith(`${ruta}.`))?.[1];
                        const props = {
                          ...atributoError(id, error), value: pilar[campo],
                          maxLength: campo === "temas" ? undefined : limitesPilar[campo],
                          onChange: (event: { target: { value: string } }) => editarPilar(pilar.clave, campo, event.target.value),
                        };
                        return <Campo key={id} id={id} etiqueta={etiqueta} error={error}>
                          {campo === "nombre" ? <Input {...props} /> : <Textarea {...props} rows={3} />}
                        </Campo>;
                      })}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        <EditorVisual identidad={visual} errores={errores} cambiar={(identidadVisual, cambioDeLista) => {
          setDatos((actual) => ({ ...actual, identidadVisual }));
          if (cambioDeLista && resultado?.estado === "invalido") setResultado(null);
        }} />
      </fieldset>
      <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border border-white/10 bg-zinc-950/95 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          {actualizadaEn && <p className="text-xs text-zinc-400">Último guardado · {fecha.format(new Date(actualizadaEn))}</p>}
          {mensaje && <p role={resultado?.estado === "guardado" ? "status" : "alert"}
            className={resultado?.estado === "guardado" ? "text-emerald-300" : "text-red-300"}>{mensaje}</p>}
        </div>
        {conflicto ? (
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>Descartar borrador y recargar</Button>
        ) : (
          <Button type="submit" disabled={pendiente}><Save aria-hidden />{pendiente ? "Guardando…" : "Guardar perfil"}</Button>
        )}
      </div>
    </form>
  );
}
