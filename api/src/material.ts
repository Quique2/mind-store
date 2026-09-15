// Material de las juntas: el PPT de Canva, la minuta, el documento que se compartió.
// Va detrás de la clave, no en la galería, porque la galería sí es pública.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface Material {
  id: string;
  evento: string;        // id de la junta
  titulo: string;
  url: string;
  por: string;           // matrícula de quien lo puso; "" si entró con la clave
  ts: string;            // ISO
}

const DIR = process.env.DATA_DIR ?? "/data";
const F_MAT = path.join(DIR, "material.json");
const nuevoId = () => "m" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex");

export function leerMaterial(): Material[] {
  try { return JSON.parse(fs.readFileSync(F_MAT, "utf8")) as Material[]; } catch { return []; }
}
function guardar(l: Material[]): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(F_MAT + ".tmp", JSON.stringify(l, null, 1));
  fs.renameSync(F_MAT + ".tmp", F_MAT);
}

/** Solo enlaces http(s): nada de javascript: ni data:. */
export const urlMaterialOk = (u: string) => /^https?:\/\/\S+$/i.test(u);

/** Lo de una junta, de lo más nuevo a lo más viejo. */
export const materialDe = (evento: string, l = leerMaterial()): Material[] =>
  l.filter((m) => m.evento === evento).sort((a, b) => (a.ts < b.ts ? 1 : -1));

export function agregarMaterial(d: { evento: string; titulo: string; url: string; por: string }): Material {
  const l = leerMaterial();
  const m: Material = {
    id: nuevoId(), evento: d.evento, url: d.url.slice(0, 500), por: d.por,
    titulo: d.titulo.replace(/\s+/g, " ").trim().slice(0, 80) || "Material",
    ts: new Date().toISOString(),
  };
  l.push(m);
  guardar(l);
  return m;
}
export function quitarMaterial(id: string): Material | null {
  const l = leerMaterial();
  const i = l.findIndex((m) => m.id === id);
  if (i < 0) return null;
  const [m] = l.splice(i, 1);
  guardar(l);
  return m;
}
/** Al borrar una junta se va también su material. */
export function borrarMaterialDe(evento: string): number {
  const l = leerMaterial();
  const quedan = l.filter((m) => m.evento !== evento);
  if (quedan.length === l.length) return 0;
  guardar(quedan);
  return l.length - quedan.length;
}
