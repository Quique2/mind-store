// Tareas de MIND: quién hace qué, para cuándo, y con qué evidencia.
// Modelo y almacenamiento en el disco persistente (DATA_DIR), como todo lo demás.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { leerAreas, leerStaff, nombreCorto, ROLES, type Area, type Persona } from "./staff";

export type EstadoTarea = "pendiente" | "curso" | "hecha" | "vencida";
export const ESTADOS: Record<EstadoTarea, { nombre: string; color: string; tinta: string }> = {
  pendiente: { nombre: "Sin empezar", color: "#EEECE3", tinta: "#6A6F98" },
  curso:     { nombre: "En curso",    color: "#DDF1F8", tinta: "#156F8F" },
  hecha:     { nombre: "Hecha",       color: "#E8F3D9", tinta: "#3F6B10" },
  vencida:   { nombre: "Vencida",     color: "#FBECEC", tinta: "#A03434" },
};
export const esAbierta = (t: Tarea) => t.estado === "pendiente" || t.estado === "curso";

export interface Evidencia {
  tipo: "archivo" | "enlace";
  nombre: string;
  archivo?: string;      // en /data/tareas
  url?: string;
  por: string;           // matrícula
  ts: string;
}
export interface Tarea {
  id: string;
  titulo: string;
  detalle?: string;
  area: string;
  asignados: string[];           // matrículas; vacío = TODOS
  vigencia: { tipo: "fechas" | "transversal" | "evento"; inicio?: string; fin?: string; evento?: string };
  estado: EstadoTarea;
  evidencia: Evidencia[];
  creada: string;
  creadaPor: string;
  hechaEl?: string;
  hechaPor?: string;
  cerradaEn?: string;            // lunes de la semana en que se archivó
  notion?: string;               // página espejo en Notion
  origen?: string;               // fila de Notion de la que se importó
}

const DIR = process.env.DATA_DIR ?? "/data";
export const DIR_EVIDENCIA = path.join(DIR, "tareas");
const F_TAREAS = path.join(DIR, "tareas.json");
const F_SEMANAS = path.join(DIR, "semanas.json");

export interface Semana { lunes: string; cerradaEl: string; por: string; arrastradas: number; vencidas: number; hechas: number }

function leerJSON<T>(f: string): T[] {
  try { return JSON.parse(fs.readFileSync(f, "utf8")) as T[]; } catch { return []; }
}
function escribirJSON(f: string, data: unknown): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(f + ".tmp", JSON.stringify(data, null, 1));
  fs.renameSync(f + ".tmp", f);
}
export const leerTareas = (): Tarea[] => leerJSON<Tarea>(F_TAREAS);
export const guardarTareas = (l: Tarea[]) => escribirJSON(F_TAREAS, l);
export const leerSemanas = (): Semana[] => leerJSON<Semana>(F_SEMANAS);
const guardarSemanas = (l: Semana[]) => escribirJSON(F_SEMANAS, l);
export const nuevoId = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
export const archivoSeguro = (n: string) => /^[a-z0-9]+\.[a-z0-9]{2,5}$/.test(n);

// ---------------- fechas y semanas ----------------
const aDate = (f: string) => new Date(f + "T12:00:00Z");
export const sumarDias = (f: string, n: number) => {
  const d = aDate(f); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
export const lunesDe = (f: string) => sumarDias(f, -((aDate(f).getUTCDay() + 6) % 7));
export const hoyISO = () => new Date().toLocaleDateString("sv-SE");
export const semanaActual = () => lunesDe(hoyISO());
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export function rangoSemana(lunes: string): string {
  const dom = sumarDias(lunes, 6);
  const [, m1, d1] = lunes.split("-").map(Number);
  const [y2, m2, d2] = dom.split("-").map(Number);
  return m1 === m2
    ? `${d1} al ${d2} de ${MESES[m2 - 1]} de ${y2}`
    : `${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${y2}`;
}
export const fechaCorta = (f: string) => {
  const [, m, d] = f.split("-").map(Number);
  const c = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${c[(m ?? 1) - 1]}`;
};

/** ¿La tarea corresponde a esta semana? Transversales y sin fecha siempre entran. */
export function enSemana(t: Tarea, lunes: string): boolean {
  if (t.cerradaEn && t.cerradaEn < lunes) return false;
  const v = t.vigencia;
  if (v.tipo !== "fechas") return true;
  const dom = sumarDias(lunes, 6);
  const ini = v.inicio ?? "0000-00-00";
  const fin = v.fin ?? "9999-99-99";
  return ini <= dom && fin >= lunes;
}
/** Vencida por fecha (no por estado). */
export const atrasada = (t: Tarea) =>
  esAbierta(t) && t.vigencia.tipo === "fechas" && !!t.vigencia.fin && t.vigencia.fin < hoyISO();

export const tocaA = (t: Tarea, matricula: string) =>
  t.asignados.length === 0 || t.asignados.includes(matricula);

// ---------------- operaciones ----------------
export function crearTarea(d: Omit<Tarea, "id" | "estado" | "evidencia" | "creada"> & { estado?: EstadoTarea }): Tarea {
  const l = leerTareas();
  const t: Tarea = { ...d, id: nuevoId(), estado: d.estado ?? "pendiente", evidencia: [],
                     creada: new Date().toISOString() };
  l.push(t);
  guardarTareas(l);
  return t;
}
export function conId(id: string, l = leerTareas()) { return l.find((t) => t.id === id); }

export function actualizar(id: string, cambio: (t: Tarea) => void): Tarea | null {
  const l = leerTareas();
  const t = l.find((x) => x.id === id);
  if (!t) return null;
  cambio(t);
  guardarTareas(l);
  return t;
}
export function borrarTarea(id: string): Tarea | null {
  const l = leerTareas();
  const i = l.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const [t] = l.splice(i, 1);
  guardarTareas(l);
  for (const e of t.evidencia) {
    if (e.archivo && archivoSeguro(e.archivo)) {
      try { fs.unlinkSync(path.join(DIR_EVIDENCIA, e.archivo)); } catch { /* ya no está */ }
    }
  }
  return t;
}
/** Empuja la tarea a la semana siguiente (o le pone fechas si no tenía). */
export function posponer(t: Tarea): void {
  const sig = sumarDias(semanaActual(), 7);
  if (t.vigencia.tipo === "fechas") {
    t.vigencia.inicio = t.vigencia.inicio && t.vigencia.inicio > sig ? t.vigencia.inicio : sig;
    t.vigencia.fin = sumarDias(sig, 6);
  } else {
    t.vigencia = { tipo: "fechas", inicio: sig, fin: sumarDias(sig, 6) };
  }
  t.cerradaEn = undefined;
  if (t.estado === "vencida") t.estado = "pendiente";
}

export function cerrarSemana(arrastrar: string[], vencer: string[], por: string): Semana {
  const l = leerTareas();
  const lunes = semanaActual();
  let a = 0, v = 0;
  for (const t of l) {
    if (arrastrar.includes(t.id)) { posponer(t); a++; }
    else if (vencer.includes(t.id)) { t.estado = "vencida"; t.cerradaEn = lunes; v++; }
  }
  const hechas = l.filter((t) => t.estado === "hecha" && t.hechaEl && lunesDe(t.hechaEl.slice(0, 10)) === lunes).length;
  guardarTareas(l);
  const s: Semana = { lunes, cerradaEl: new Date().toISOString(), por, arrastradas: a, vencidas: v, hechas };
  const ss = leerSemanas().filter((x) => x.lunes !== lunes);
  ss.push(s);
  guardarSemanas(ss);
  return s;
}

// ---------------- ayudas de presentación ----------------
export const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const jsonSeguro = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function quienes(t: Tarea, staff: Persona[]): string {
  if (!t.asignados.length) return "TODOS";
  const nombres = t.asignados.map((m) => {
    const p = staff.find((x) => x.matricula === m);
    return p ? nombreCorto(p) : m;
  });
  return nombres.length > 1
    ? nombres.slice(0, -1).join(", ") + " y " + nombres.at(-1)
    : nombres[0];
}
export const badgeArea = (a: Area) =>
  `<span class="chip" style="background:${a.color};color:${a.tinta}">${a.emoji} ${esc(a.nombre)}</span>`;
export const badgeEstado = (t: Tarea) =>
  `<span class="chip" style="background:${ESTADOS[t.estado].color};color:${ESTADOS[t.estado].tinta}">${ESTADOS[t.estado].nombre}</span>`;
export function cuando(t: Tarea, eventos: { id: string; titulo: string }[]): string {
  const v = t.vigencia;
  if (v.tipo === "transversal") return "Transversal";
  if (v.tipo === "evento") {
    const e = eventos.find((x) => x.id === v.evento);
    return e ? "Para " + e.titulo : "Para un evento";
  }
  if (v.inicio && v.fin) return `${fechaCorta(v.inicio)} → ${fechaCorta(v.fin)}`;
  if (v.fin) return "Hasta " + fechaCorta(v.fin);
  if (v.inicio) return "Desde " + fechaCorta(v.inicio);
  return "Sin fecha";
}

export const CSS_PORTAL = `
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#F7F5EC; color:#1C2260; font-family:'Poppins','Segoe UI',system-ui,sans-serif; }
header { background:linear-gradient(140deg,#29A3C7,#2E4BC6 60%,#232D93); color:#fff; padding:26px 22px; }
header h1 { font-size:23px; font-weight:800; }
header p { font-size:12.5px; color:#CFE4F5; margin-top:2px; }
main { max-width:900px; margin:0 auto; padding:20px 18px 70px; }
h2 { font-size:16px; font-weight:800; margin:26px 0 10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
h2 small { font-size:12px; font-weight:600; color:#6A6F98; }
.tarjeta { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:16px; }
label { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; display:block; margin-bottom:4px; }
input, select, textarea { width:100%; font:inherit; font-size:15px; padding:10px 12px; border:1.5px solid #DDD9C6; border-radius:10px; background:#FCFBF5; color:#1C2260; min-height:44px; }
textarea { min-height:70px; resize:vertical; }
input:focus, select:focus, textarea:focus { outline:2px solid #2E4BC6; outline-offset:1px; border-color:#2E4BC6; }
.fila { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; }
.btn { font:inherit; font-weight:800; font-size:15px; color:#fff; background:#2E4BC6; border:none; border-radius:999px; padding:12px 20px; min-height:46px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
.btn:hover { background:#232D93; }
.btn.sec { background:#EFEDDF; color:#1C2260; border:1.5px solid #DDD9C6; font-weight:600; font-size:13px; padding:8px 13px; min-height:38px; }
.btn.sec:hover { background:#E2DFCB; }
.btn.mini { font-size:11.5px; padding:5px 11px; min-height:30px; }
.btn.ok { background:#3F6B10; } .btn.ok:hover { background:#33580c; }
.btn.peligro { color:#A03434; background:#FBECEC; border-color:#F0CFCF; } .btn.peligro:hover { background:#F5D9D9; }
.chip { font-size:11px; font-weight:700; border-radius:999px; padding:3px 10px; white-space:nowrap; display:inline-block; }
.ok-aviso { background:#E8F3D9; border:1px solid #BEDD97; border-radius:10px; padding:10px 14px; font-size:13px; margin:0 0 14px; color:#3F6B10; font-weight:600; }
.err { background:#FDE8E8; border:1px solid #F0B8B8; color:#8A2626; border-radius:10px; padding:10px 14px; font-size:13px; margin-bottom:12px; }
.vacio { color:#8A8FB5; font-size:13px; padding:16px; text-align:center; background:#fff; border:1px dashed #DDD9C6; border-radius:14px; }
.tarea { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:13px 15px; margin-bottom:9px; border-left:5px solid #DDD9C6; }
.tarea.atrasada { border-left-color:#A03434; }
.tarea.hecha { opacity:.72; }
.tarea h3 { font-size:15px; font-weight:700; margin-bottom:3px; }
.tarea .meta { display:flex; gap:6px; flex-wrap:wrap; align-items:center; font-size:11.5px; color:#8A8FB5; margin-top:5px; }
.tarea .acc { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
.tarea .acc form { display:inline; }
.det { font-size:12px; color:#6A6F98; margin-top:3px; line-height:1.5; }
.evid { font-size:11.5px; margin-top:7px; display:flex; gap:8px; flex-wrap:wrap; }
.evid a { color:#2E4BC6; font-weight:600; text-decoration:none; background:#EEF1FC; border-radius:8px; padding:3px 9px; }
.puntos { display:flex; gap:8px; justify-content:center; margin-top:28px; }
.puntos i { width:9px; height:9px; border-radius:50%; display:block; }
footer { font-size:11.5px; color:#8A8FB5; margin-top:14px; text-align:center; }
`;
export const FUENTE = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">`;
export const PUNTOS = `<div class="puntos"><i style="background:#8BC53F"></i><i style="background:#F5C518"></i><i style="background:#EC4899"></i><i style="background:#C026D3"></i><i style="background:#22B8CF"></i></div>`;

/** Barra de navegación del portal, según lo que la persona puede hacer. */
export function navPortal(p: Persona, actual: string, puede: boolean): string {
  const t: [string, string, string][] = [["yo", "/portal", "🙋 Mis tareas"]];
  if (puede) t.push(["tablero", "/tareas", "🗂️ Tablero"], ["semana", "/tareas/semana", "🖼️ Lámina"]);
  if (p.rol === "presidencia" || p.rol === "vicepresidencia" || p.admin) t.push(["equipo", "/tareas/equipo", "👥 Equipo"]);
  return `<nav class="nav-portal">${t.map(([k, href, txt]) =>
    `<a href="${href}"${k === actual ? ' class="actual"' : ""}>${txt}</a>`).join("")}
    <a href="/portal/salir" class="salir">Salir</a></nav>`;
}
export const NAV_CSS_PORTAL = `
.nav-portal { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; align-items:center; }
.nav-portal a { font-size:12px; font-weight:700; color:#fff; text-decoration:none; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.35); border-radius:999px; padding:5px 12px; }
.nav-portal a:hover { background:rgba(255,255,255,.3); }
.nav-portal a.actual, .nav-portal a.actual:hover { background:#fff; color:#1C2260; }
.nav-portal a.salir { margin-left:auto; background:transparent; border-color:rgba(255,255,255,.25); font-weight:600; }
`;

export const paginaPortal = (titulo: string, cuerpoHeader: string, cuerpo: string, extraCSS = "") =>
  `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo)}</title>${FUENTE}
<style>${CSS_PORTAL}${NAV_CSS_PORTAL}${extraCSS}</style></head><body>
<header>${cuerpoHeader}</header><main>${cuerpo}${PUNTOS}
<footer>MIND · LiFE Grupos Estudiantiles · @mindmty</footer></main></body></html>`;

// ---------------- resumen para el panel ----------------
export function resumenTareas() {
  const l = leerTareas();
  const areas = leerAreas();
  const staff = leerStaff();
  const abiertas = l.filter(esAbierta);
  const porArea = areas.map((a) => {
    const suyas = l.filter((t) => t.area === a.id);
    const hechas = suyas.filter((t) => t.estado === "hecha").length;
    return { label: `${a.emoji} ${a.nombre}`, color: a.color, total: suyas.length, hechas,
             pct: suyas.length ? Math.round(100 * hechas / suyas.length) : 0 };
  }).filter((x) => x.total);
  const porPersona = staff.filter((p) => p.activo).map((p) => {
    const suyas = l.filter((t) => t.asignados.includes(p.matricula));
    const hechas = suyas.filter((t) => t.estado === "hecha").length;
    return { nombre: p.nombre, apodo: nombreCorto(p), rol: ROLES[p.rol].nombre, total: suyas.length, hechas,
             pct: suyas.length ? Math.round(100 * hechas / suyas.length) : 0 };
  }).filter((x) => x.total).sort((a, b) => b.pct - a.pct || b.total - a.total);
  return { total: l.length, abiertas: abiertas.length, atrasadas: l.filter(atrasada).length,
           hechas: l.filter((t) => t.estado === "hecha").length, porArea, porPersona,
           conCuenta: staff.filter((p) => p.pinHash).length,
           activadas: staff.filter((p) => p.pinHash && !p.provisional).length,
           staff: staff.length };
}
