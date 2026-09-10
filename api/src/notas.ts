// Notas del tablero: pendientes sueltos que todavía no son tareas de nadie.
// Hay un montón general que ve todo el staff y el montón privado de cada quien.
// De aquí salen tareas de verdad arrastrando la nota a una columna del tablero.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type Ambito = "general" | "mia";
export interface Nota {
  id: string;
  texto: string;
  ambito: Ambito;
  de: string;             // matrícula de quien la escribió
  area?: string;          // si ya se sabe de qué área es
  creada: string;
  usada?: string;         // ISO del momento en que se volvió tarea
  tareaId?: string;
}

const DIR = process.env.DATA_DIR ?? "/data";
const F_NOTAS = path.join(DIR, "notas.json");

export function leerNotas(): Nota[] {
  try { return JSON.parse(fs.readFileSync(F_NOTAS, "utf8")) as Nota[]; } catch { return []; }
}
function guardar(l: Nota[]): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(F_NOTAS + ".tmp", JSON.stringify(l, null, 1));
  fs.renameSync(F_NOTAS + ".tmp", F_NOTAS);
}
const nuevoId = () => "n" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex");

/** Las que le tocan a alguien: el montón general más las suyas, sin las que ya son tarea. */
export const notasDe = (matricula: string, l = leerNotas()): Nota[] =>
  l.filter((n) => !n.usada && (n.ambito === "general" || n.de === matricula))
   .sort((a, b) => (a.creada < b.creada ? 1 : -1));

export const notaConId = (id: string, l = leerNotas()) => l.find((n) => n.id === id);

/** Las tuyas siempre; las del montón general, cualquiera de presidencia. */
export const puedeTocarNota = (n: Nota, matricula: string, presidencia: boolean) =>
  n.de === matricula || (n.ambito === "general" && presidencia);

export function crearNota(d: { texto: string; ambito: Ambito; de: string; area?: string }): Nota {
  const l = leerNotas();
  const n: Nota = {
    id: nuevoId(), texto: d.texto, ambito: d.ambito, de: d.de,
    ...(d.area ? { area: d.area } : {}),
    creada: new Date().toISOString(),
  };
  l.push(n);
  guardar(l);
  return n;
}
export function actualizarNota(id: string, cambio: (n: Nota) => void): Nota | null {
  const l = leerNotas();
  const n = l.find((x) => x.id === id);
  if (!n) return null;
  cambio(n);
  guardar(l);
  return n;
}
export function borrarNota(id: string): Nota | null {
  const l = leerNotas();
  const i = l.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [n] = l.splice(i, 1);
  guardar(l);
  return n;
}

/** Título y detalle para la tarea que nace de una nota (el título tiene tope de 120). */
export function comoTarea(n: Nota): { titulo: string; detalle: string } {
  const texto = n.texto.trim();
  return texto.length <= 120
    ? { titulo: texto, detalle: "" }
    : { titulo: texto.slice(0, 117).trimEnd() + "…", detalle: texto };
}
