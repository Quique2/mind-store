// Asistencia a eventos de MIND: un clic crea el evento y su enlace público,
// la gente se registra desde el celular (nombre + matrícula) y el panel admin
// filtra por evento / persona y arma el ranking de asistencia.
// Cada evento puede además abrir PRERREGISTRO (apartar lugar antes del día).
// Las JUNTAS de staff usan el mismo motor (tipo "junta") pero viven en su propia
// pestaña y todo el que se registra en una junta cuenta como staff.
// Datos en el disco persistente de Railway (DATA_DIR), como cuentas.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { NAV_CSS, TABS_CSS, navAdmin, tabsEventos, conClave, yClave } from "./ui";
import { staffActivo, esStaffActivo } from "./staff";

export interface Evento {
  id: string;
  tipo: TipoId;
  titulo: string;
  fecha: string;        // YYYY-MM-DD
  abierto: boolean;
  creado: string;       // ISO
  tipoNombre?: string;  // nombre propio cuando tipo === "otro"
  hora?: string;        // HH:MM (opcional)
  lugar?: string;       // opcional
  nota?: string;        // ponente, detalles… (opcional)
  prereg?: boolean;     // ¿acepta prerregistros? (ausente = no)
}
export interface Asistencia {
  evento: string;       // id del evento
  nombre: string;
  matricula: string;    // normalizada en mayúsculas
  ts: string;           // ISO
  staff?: boolean;      // ausente = asistente normal (registros anteriores al campo)
}
export interface Preregistro {
  evento: string;
  nombre: string;
  matricula: string;
  correo?: string;
  ts: string;
}
export const esStaff = (a: Asistencia) => a.staff === true;

export const TIPOS = {
  happy:       { nombre: "Happy Midweek", color: "#F5C518", tinta: "#4a3a00", emoji: "🎉" },
  stand:       { nombre: "Stand",         color: "#29A3C7", tinta: "#0b3140", emoji: "🛍️" },
  neurart:     { nombre: "NeurArt",       color: "#EC4899", tinta: "#4a0f2b", emoji: "🎨" },
  neurocharla: { nombre: "NeuroCharla",   color: "#8BC53F", tinta: "#23400a", emoji: "🧠" },
  otro:        { nombre: "Otro",          color: "#C026D3", tinta: "#ffffff", emoji: "✨" },
  junta:       { nombre: "Junta",         color: "#1C2260", tinta: "#ffffff", emoji: "📋" },
} as const;
export type TipoId = keyof typeof TIPOS;
export const esTipo = (t: string): t is TipoId => t in TIPOS;
/** Tipos que se ofrecen en la pestaña Eventos (las juntas tienen su pestaña). */
export const TIPOS_EVENTO = (Object.keys(TIPOS) as TipoId[]).filter((t) => t !== "junta");
export const TIPOS_FIJOS = TIPOS_EVENTO.filter((t) => t !== "otro");
export const esJunta = (e: Evento) => e.tipo === "junta";
/** Nombre visible del tipo: los "otro" traen el suyo. */
export const nombreTipo = (e: Evento) => (e.tipo === "otro" && e.tipoNombre?.trim()) || TIPOS[e.tipo].nombre;
/** Clave para agrupar/filtrar: cada "otro: X" es su propia categoría. */
export const claveTipo = (e: Evento) => (e.tipo === "otro" ? `otro:${nombreTipo(e)}` : e.tipo);

const DIR = process.env.DATA_DIR ?? "/data";
const F_EV = path.join(DIR, "eventos.json");
const F_AS = path.join(DIR, "asistencias.json");
const F_PRE = path.join(DIR, "preregistros.json");

function leerJSON<T>(f: string): T[] {
  try { return JSON.parse(fs.readFileSync(f, "utf8")) as T[]; } catch { return []; }
}
function escribirJSON(f: string, data: unknown): void {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, f);
}
export const leerEventos = () => leerJSON<Evento>(F_EV);
export const leerAsistencias = () => leerJSON<Asistencia>(F_AS);
export const leerPreregistros = () => leerJSON<Preregistro>(F_PRE);

export interface NuevoEvento {
  tipo: TipoId; titulo: string; fecha: string;
  tipoNombre?: string; hora?: string; lugar?: string; nota?: string; prereg?: boolean;
}
export function crearEvento(d: NuevoEvento): { evento: Evento; repetido: boolean } {
  const evs = leerEventos();
  const tipoNombre = d.tipo === "otro" ? (d.tipoNombre ?? "").trim().slice(0, 40) || "Otro" : undefined;
  const etiqueta = tipoNombre ?? TIPOS[d.tipo].nombre;
  const nombre = d.titulo.trim() || `${etiqueta} · ${fechaBonita(d.fecha)}`;
  // doble clic o doble envío: si hace un momento se creó uno idéntico, se devuelve ese
  const igual = evs.find((e) => e.tipo === d.tipo && e.fecha === d.fecha && e.titulo === nombre
                               && Date.now() - Date.parse(e.creado) < 2 * 60 * 1000);
  if (igual) return { evento: igual, repetido: true };
  let id = "";
  // solo letras y números: enlaces limpios (sin guiones al inicio) y fáciles de dictar
  do { id = crypto.randomBytes(4).toString("base64url").slice(0, 6).toLowerCase(); }
  while (/[^a-z0-9]/.test(id) || evs.some((e) => e.id === id));
  const ev: Evento = {
    id, tipo: d.tipo, fecha: d.fecha, abierto: true, creado: new Date().toISOString(), titulo: nombre,
    ...(tipoNombre ? { tipoNombre } : {}),
    ...(d.hora?.trim() ? { hora: d.hora.trim().slice(0, 5) } : {}),
    ...(d.lugar?.trim() ? { lugar: limpiar(d.lugar) } : {}),
    ...(d.nota?.trim() ? { nota: limpiar(d.nota) } : {}),
    ...(d.prereg ? { prereg: true } : {}),
  };
  evs.push(ev);
  escribirJSON(F_EV, evs);
  return { evento: ev, repetido: false };
}

/** Borra el evento, sus asistencias y sus prerregistros. */
export function borrarEvento(id: string): { evento: Evento; asistencias: number; prereg: number } | null {
  const evs = leerEventos();
  const i = evs.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const [evento] = evs.splice(i, 1);
  const asis = leerAsistencias();
  const quedan = asis.filter((a) => a.evento !== id);
  const pre = leerPreregistros();
  const quedanPre = pre.filter((p) => p.evento !== id);
  escribirJSON(F_EV, evs);
  escribirJSON(F_AS, quedan);
  if (pre.length !== quedanPre.length) escribirJSON(F_PRE, quedanPre);
  return { evento, asistencias: asis.length - quedan.length, prereg: pre.length - quedanPre.length };
}

export function alternarEvento(id: string): Evento | null {
  const evs = leerEventos();
  const ev = evs.find((e) => e.id === id);
  if (!ev) return null;
  ev.abierto = !ev.abierto;
  escribirJSON(F_EV, evs);
  return ev;
}

/** Abre o cierra el prerregistro del evento. */
export function alternarPrereg(id: string): Evento | null {
  const evs = leerEventos();
  const ev = evs.find((e) => e.id === id);
  if (!ev) return null;
  ev.prereg = !ev.prereg;
  escribirJSON(F_EV, evs);
  return ev;
}

export function buscarEvento(id: string): Evento | undefined {
  return leerEventos().find((e) => e.id === id);
}

/** Registra asistencia. Devuelve 'ok' | 'duplicado' | 'cerrado' | 'no-existe'. */
export function registrar(eventoId: string, nombre: string, matricula: string, staff = false,
                          forzar = false) {
  const ev = buscarEvento(eventoId);
  if (!ev) return "no-existe" as const;
  if (!ev.abierto && !forzar) return "cerrado" as const;   // forzar = captura desde el panel
  const mat = normMatricula(matricula);
  const lista = leerAsistencias();
  if (lista.some((a) => a.evento === eventoId && a.matricula === mat)) return "duplicado" as const;
  lista.push({ evento: eventoId, nombre: limpiar(nombre), matricula: mat,
               ts: new Date().toISOString(), staff: esJunta(ev) || esStaffActivo(mat) ? true : staff });
  escribirJSON(F_AS, lista);
  return "ok" as const;
}

/** Aparta lugar antes del evento. 'ok' | 'duplicado' | 'cerrado' | 'no-existe'. */
export function preregistrar(eventoId: string, nombre: string, matricula: string, correo = "") {
  const ev = buscarEvento(eventoId);
  if (!ev) return "no-existe" as const;
  if (!ev.prereg) return "cerrado" as const;
  const mat = normMatricula(matricula);
  const lista = leerPreregistros();
  if (lista.some((p) => p.evento === eventoId && p.matricula === mat)) return "duplicado" as const;
  const c = correo.trim().slice(0, 80);
  lista.push({ evento: eventoId, nombre: limpiar(nombre), matricula: mat,
               ...(c ? { correo: c } : {}), ts: new Date().toISOString() });
  escribirJSON(F_PRE, lista);
  return "ok" as const;
}

export function quitarPrereg(eventoId: string, matricula: string): Preregistro | null {
  const mat = normMatricula(matricula);
  const lista = leerPreregistros();
  const i = lista.findIndex((p) => p.evento === eventoId && p.matricula === mat);
  if (i < 0) return null;
  const [quitado] = lista.splice(i, 1);
  escribirJSON(F_PRE, lista);
  return quitado;
}

/** Quita un registro concreto (evento + matrícula). */
export function quitarAsistencia(eventoId: string, matricula: string): Asistencia | null {
  const mat = normMatricula(matricula);
  const lista = leerAsistencias();
  const i = lista.findIndex((a) => a.evento === eventoId && a.matricula === mat);
  if (i < 0) return null;
  const [quitada] = lista.splice(i, 1);
  escribirJSON(F_AS, lista);
  return quitada;
}

/** Marca o desmarca como staff a una persona en TODOS sus registros. */
export function cambiarStaff(matricula: string, staff: boolean): { nombre: string; n: number } | null {
  const mat = normMatricula(matricula);
  const lista = leerAsistencias();
  const suyos = lista.filter((a) => a.matricula === mat);
  if (!suyos.length) return null;
  for (const a of suyos) a.staff = staff;
  escribirJSON(F_AS, lista);
  return { nombre: suyos[suyos.length - 1].nombre, n: suyos.length };
}

/** Personas conocidas (derivadas de los registros): nombre más reciente por matrícula
 *  y si son staff (algún registro como staff). Sin registros, la persona desaparece. */
export function listaPersonas(asis: Asistencia[]): { nombre: string; matricula: string; staff: boolean }[] {
  const m = new Map<string, { nombre: string; matricula: string; staff: boolean; ts: string }>();
  for (const a of asis) {
    const p = m.get(a.matricula);
    if (!p) m.set(a.matricula, { nombre: a.nombre, matricula: a.matricula, staff: esStaff(a), ts: a.ts });
    else {
      p.staff = p.staff || esStaff(a);
      if (a.ts > p.ts) { p.nombre = a.nombre; p.ts = a.ts; }
    }
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map(({ nombre, matricula, staff }) => ({ nombre, matricula, staff }));
}

export const normMatricula = (m: string) =>
  m.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
const limpiar = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto",
               "septiembre","octubre","noviembre","diciembre"];
export function fechaBonita(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const cortos = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${cortos[(m ?? 1) - 1]} ${y}`;
}
export function fechaLarga(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  const dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
export const horaBonita = (h?: string) => (h && /^\d{1,2}:\d{2}$/.test(h) ? `${h} h` : "");

/** Enlace para agregar el evento a Google Calendar (funciona en celular y PC). */
export function calendarioURL(ev: Evento): string {
  const dia = ev.fecha.replace(/-/g, "");
  let fechas: string;
  if (ev.hora && /^\d{1,2}:\d{2}$/.test(ev.hora)) {
    const [h, m] = ev.hora.split(":").map(Number);
    const dos = (n: number) => String(n).padStart(2, "0");
    fechas = `${dia}T${dos(h)}${dos(m)}00/${dia}T${dos((h + 1) % 24)}${dos(m)}00`;
  } else {
    const sig = new Date(ev.fecha + "T12:00:00Z");
    sig.setUTCDate(sig.getUTCDate() + 1);
    fechas = `${dia}/${sig.toISOString().slice(0, 10).replace(/-/g, "")}`;
  }
  const p = new URLSearchParams({ action: "TEMPLATE", text: ev.titulo, dates: fechas,
                                  ctz: "America/Monterrey" });
  if (ev.nota) p.set("details", ev.nota);
  if (ev.lugar) p.set("location", ev.lugar);
  return "https://calendar.google.com/calendar/render?" + p.toString();
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const jsonSeguro = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

const CSS_BASE = `
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#F7F5EC; color:#1C2260; font-family:'Poppins','Segoe UI',system-ui,sans-serif; }
header { background:linear-gradient(140deg,#29A3C7,#2E4BC6 60%,#232D93); color:#fff; padding:28px 22px; }
header h1 { font-size:24px; font-weight:800; }
header p { font-size:12.5px; color:#CFE4F5; margin-top:2px; }
main { max-width:820px; margin:0 auto; padding:20px 18px 60px; }
h2 { font-size:16px; font-weight:800; margin:26px 0 10px; }
.tarjeta { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:16px; }
.tipo { font-size:11px; font-weight:700; border-radius:999px; padding:3px 10px; white-space:nowrap; }
input, select { width:100%; font:inherit; font-size:15px; padding:11px 12px; border:1.5px solid #DDD9C6; border-radius:10px; background:#FCFBF5; color:#1C2260; min-height:44px; }
input:focus, select:focus { outline:2px solid #2E4BC6; outline-offset:1px; border-color:#2E4BC6; }
label { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; display:block; margin-bottom:4px; }
.btn { font:inherit; font-weight:800; font-size:15px; color:#fff; background:#2E4BC6; border:none; border-radius:999px; padding:13px 20px; min-height:46px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
.btn:hover { background:#232D93; }
.btn.sec { background:#EFEDDF; color:#1C2260; border:1.5px solid #DDD9C6; font-weight:600; font-size:13px; padding:9px 14px; min-height:40px; }
.btn.sec:hover { background:#E2DFCB; }
.ok-aviso { background:#E8F3D9; border:1px solid #BEDD97; border-radius:10px; padding:10px 14px; font-size:13px; margin:12px 0; color:#3F6B10; font-weight:600; }
.puntos { display:flex; gap:8px; justify-content:center; margin-top:18px; }
.puntos i { width:9px; height:9px; border-radius:50%; display:block; }
`;
const FUENTE = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">`;
const PUNTOS = `<div class="puntos"><i style="background:#8BC53F"></i><i style="background:#F5C518"></i><i style="background:#EC4899"></i><i style="background:#C026D3"></i><i style="background:#22B8CF"></i></div>`;
const CSS_FORM = `
main { max-width:460px; }
form { display:grid; gap:14px; }
.err { background:#FDE8E8; border:1px solid #F0B8B8; color:#8A2626; border-radius:10px; padding:10px 14px; font-size:13px; }
.datos { display:grid; gap:6px; font-size:13.5px; margin-bottom:14px; }
.datos div { display:flex; gap:8px; align-items:flex-start; }
.datos b { font-weight:600; }
.seg { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.seg input { position:absolute; opacity:0; width:0; height:0; min-height:0; }
.seg label { text-transform:none; letter-spacing:0; font-size:14px; font-weight:600; color:#1C2260; background:#FCFBF5; border:1.5px solid #DDD9C6; border-radius:10px; padding:10px 8px; min-height:44px; margin:0; display:flex; align-items:center; justify-content:center; text-align:center; cursor:pointer; }
.seg input:checked + label { background:#1C2260; color:#fff; border-color:#1C2260; }
.seg input:focus-visible + label { outline:2px solid #2E4BC6; outline-offset:1px; }
`;

const badgeEv = (e: Evento) =>
  `<span class="tipo" style="background:${TIPOS[e.tipo].color};color:${TIPOS[e.tipo].tinta}">${TIPOS[e.tipo].emoji} ${esc(nombreTipo(e))}</span>`;
/** Fecha · hora · lugar del evento, para las páginas públicas. */
const detallesEv = (ev: Evento) => `<div class="datos">
  <div><span>📅</span><b>${esc(fechaLarga(ev.fecha))}${ev.hora ? ` · ${esc(horaBonita(ev.hora))}` : ""}</b></div>
  ${ev.lugar ? `<div><span>📍</span><b>${esc(ev.lugar)}</b></div>` : ""}
  ${ev.nota ? `<div><span>ℹ️</span><span>${esc(ev.nota)}</span></div>` : ""}
</div>`;

// ---------------- formulario público de asistencia ----------------
export function renderFormulario(ev: Evento, error?: string): string {
  const t = TIPOS[ev.tipo];
  const junta = esJunta(ev);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ev.titulo)} · MIND</title>${FUENTE}<style>${CSS_BASE}
header { background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93); }
${CSS_FORM}</style></head><body>
<header><p>${t.emoji} ${esc(nombreTipo(ev))} · ${esc(fechaBonita(ev.fecha))}</p><h1>${esc(ev.titulo)}</h1>
<p>${junta ? "Registra tu asistencia a la junta" : "Registra tu asistencia"} — toma 10 segundos</p></header>
<main><div class="tarjeta">
${error ? `<div class="err" style="margin-bottom:12px">${esc(error)}</div>` : ""}
<form method="post" action="/asistencia/${esc(ev.id)}" autocomplete="on">
  <div><label for="nombre">Nombre completo</label>
    <input id="nombre" name="nombre" required maxlength="80" placeholder="Nombre y apellidos" autocomplete="name"></div>
  <div><label for="matricula">Matrícula</label>
    <input id="matricula" name="matricula" required maxlength="12" placeholder="A0XXXXXXX"
      style="text-transform:uppercase" autocapitalize="characters" autocomplete="off"></div>
  ${junta ? '<input type="hidden" name="staff" value="si">' : `<div><label>¿Eres parte del staff de MIND?</label>
    <div class="seg">
      <input type="radio" id="st-no" name="staff" value="no" checked><label for="st-no">No, vengo al evento</label>
      <input type="radio" id="st-si" name="staff" value="si"><label for="st-si">Sí, soy staff</label>
    </div></div>`}
  <input type="text" name="sitio" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button class="btn" type="submit">Registrar mi asistencia</button>
</form></div>${PUNTOS}
<p style="text-align:center;font-size:11.5px;color:#8A8FB5;margin-top:14px">MIND · LiFE Grupos Estudiantiles · @mindmty</p>
</main></body></html>`;
}

export function renderResultado(ev: Evento, tipo: "ok" | "duplicado" | "cerrado", nombre: string,
                                staff = false): string {
  const t = TIPOS[ev.tipo];
  const pila = esc(nombre.split(" ")[0] || "");
  const msg = tipo === "ok" && (staff || esJunta(ev))
    ? { h: "¡Registrado, staff! 💪", p: `Gracias por hacer posible <b>${esc(ev.titulo)}</b>, ${pila}.` }
    : tipo === "ok"
    ? { h: "¡Registrado! 🎉", p: `Gracias por venir a <b>${esc(ev.titulo)}</b>, ${pila}.` }
    : tipo === "duplicado"
    ? { h: "Ya estabas en la lista ✓", p: `Tu matrícula ya aparece en <b>${esc(ev.titulo)}</b>. ¡Gracias!` }
    : { h: "Registro cerrado", p: `<b>${esc(ev.titulo)}</b> ya cerró su lista de asistencia.` };
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${msg.h} · MIND</title>${FUENTE}
<style>${CSS_BASE} header{background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93)} main{max-width:460px;text-align:center}
.grande{font-size:26px;font-weight:800;margin:6px 0 10px}</style></head><body>
<header><p>${t.emoji} ${esc(nombreTipo(ev))}</p><h1>${esc(ev.titulo)}</h1></header>
<main><div class="tarjeta"><div class="grande">${msg.h}</div><p>${msg.p}</p>
<p style="margin-top:14px;font-size:13px;color:#6A6F98">Síguenos: <a href="https://quique2.github.io/mind/" style="color:#2E4BC6;font-weight:600">enlaces de MIND</a></p></div>${PUNTOS}</main></body></html>`;
}

// ---------------- prerregistro público ----------------
export function renderPreregistro(ev: Evento, error?: string): string {
  const t = TIPOS[ev.tipo];
  if (!ev.prereg) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Prerregistro cerrado · MIND</title>${FUENTE}
<style>${CSS_BASE} header{background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93)} ${CSS_FORM} main{text-align:center}</style></head><body>
<header><p>${t.emoji} ${esc(nombreTipo(ev))}</p><h1>${esc(ev.titulo)}</h1></header>
<main><div class="tarjeta"><div style="font-size:22px;font-weight:800;margin-bottom:8px">Prerregistro cerrado</div>
<p style="font-size:13.5px;color:#6A6F98">Ya no se están apartando lugares para este evento. ¡Te esperamos!</p>
${detallesEv(ev)}</div>${PUNTOS}</main></body></html>`;
  }
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aparta tu lugar · ${esc(ev.titulo)} · MIND</title>
<meta property="og:title" content="${esc(ev.titulo)} · MIND"><meta property="og:description" content="Aparta tu lugar: ${esc(fechaLarga(ev.fecha))}${ev.hora ? " · " + esc(horaBonita(ev.hora)) : ""}">
${FUENTE}<style>${CSS_BASE}
header { background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93); }
${CSS_FORM}</style></head><body>
<header><p>${t.emoji} ${esc(nombreTipo(ev))} · prerregistro</p><h1>${esc(ev.titulo)}</h1>
<p>Aparta tu lugar — te esperamos</p></header>
<main><div class="tarjeta">
${detallesEv(ev)}
${error ? `<div class="err" style="margin-bottom:12px">${esc(error)}</div>` : ""}
<form method="post" action="/preregistro/${esc(ev.id)}" autocomplete="on">
  <div><label for="nombre">Nombre completo</label>
    <input id="nombre" name="nombre" required maxlength="80" placeholder="Nombre y apellidos" autocomplete="name"></div>
  <div><label for="matricula">Matrícula</label>
    <input id="matricula" name="matricula" required maxlength="12" placeholder="A0XXXXXXX"
      style="text-transform:uppercase" autocapitalize="characters" autocomplete="off"></div>
  <div><label for="correo">Correo (opcional, para recordarte)</label>
    <input id="correo" name="correo" type="email" maxlength="80" placeholder="a0XXXXXXX@tec.mx" autocomplete="email"></div>
  <input type="text" name="sitio" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button class="btn" type="submit">Apartar mi lugar</button>
</form></div>${PUNTOS}
<p style="text-align:center;font-size:11.5px;color:#8A8FB5;margin-top:14px">MIND · LiFE Grupos Estudiantiles · @mindmty</p>
</main></body></html>`;
}

export function renderResultadoPre(ev: Evento, tipo: "ok" | "duplicado", nombre: string): string {
  const t = TIPOS[ev.tipo];
  const pila = esc(nombre.split(" ")[0] || "");
  const msg = tipo === "ok"
    ? { h: "¡Tu lugar está apartado! ✨", p: `Nos vemos en <b>${esc(ev.titulo)}</b>, ${pila}.` }
    : { h: "Ya tenías tu lugar ✓", p: `Tu matrícula ya está en la lista de <b>${esc(ev.titulo)}</b>.` };
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${msg.h} · MIND</title>${FUENTE}
<style>${CSS_BASE} header{background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93)} ${CSS_FORM} main{text-align:center}
.grande{font-size:24px;font-weight:800;margin:6px 0 10px} .datos{text-align:left;margin:14px 0}</style></head><body>
<header><p>${t.emoji} ${esc(nombreTipo(ev))}</p><h1>${esc(ev.titulo)}</h1></header>
<main><div class="tarjeta"><div class="grande">${msg.h}</div><p>${msg.p}</p>
${detallesEv(ev)}
<a class="btn" href="${esc(calendarioURL(ev))}" target="_blank" rel="noopener">📅 Agregar a mi calendario</a>
<p style="margin-top:14px;font-size:13px;color:#6A6F98">El día del evento te pediremos tu matrícula otra vez para registrar tu asistencia.<br>
Síguenos: <a href="https://quique2.github.io/mind/" style="color:#2E4BC6;font-weight:600">enlaces de MIND</a></p></div>${PUNTOS}</main></body></html>`;
}

// ---------------- panel admin (pestañas Eventos y Juntas) ----------------
export function renderAdmin(todosEv: Evento[], todasAsis: Asistencia[], todosPre: Preregistro[],
                            clave: string, base: string, aviso?: string,
                            modo: "eventos" | "juntas" = "eventos"): string {
  const juntas = modo === "juntas";
  // la pestaña Eventos ve solo eventos; la pestaña Juntas solo juntas (mismo motor)
  const evs = todosEv.filter((e) => esJunta(e) === juntas);
  const ids = new Set(evs.map((e) => e.id));
  const asis = todasAsis.filter((a) => ids.has(a.evento));
  const pre = todosPre.filter((p) => ids.has(p.evento));
  const conteo = new Map<string, number>();
  const conteoStaff = new Map<string, number>();
  for (const a of asis) {
    const m = esStaff(a) ? conteoStaff : conteo;
    m.set(a.evento, (m.get(a.evento) ?? 0) + 1);
  }
  const conteoPre = new Map<string, number>();
  for (const p of pre) conteoPre.set(p.evento, (conteoPre.get(p.evento) ?? 0) + 1);
  const cuenta = (id: string) => (conteo.get(id) ?? 0) + (juntas ? (conteoStaff.get(id) ?? 0) : 0);
  const evOrden = [...evs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const publico = juntas ? asis : asis.filter((a) => !esStaff(a));
  const personas = new Set(publico.map((a) => a.matricula)).size;
  // la pestaña Juntas regresa a /juntas después de cada acción
  const q = `${conClave(clave)}${juntas ? "&volver=juntas" : ""}`;
  // el staff de MIND sale de la lista del portal (Equipo); si aún no existe, de los registros
  const oficial = staffActivo();
  const staffRoster = oficial.length
    ? oficial.map((p) => ({ nombre: p.nombre, matricula: p.matricula, staff: true }))
    : listaPersonas(todasAsis).filter((p) => p.staff);
  const primerAbierto = evOrden.find((e) => e.abierto)?.id;
  const opcionesEv = evOrden.map((e) =>
    `<option value="${esc(e.id)}"${e.id === primerAbierto ? " selected" : ""}>${esc(fechaBonita(e.fecha))} · ${esc(e.titulo)}${e.abierto ? "" : " (cerrado)"}</option>`).join("");
  const wa = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`;
  const filasEv = evOrden.map((e) => {
    const url = `${base}/asistencia/${e.id}`;
    const nPre = conteoPre.get(e.id) ?? 0;
    return `<tr data-id="${esc(e.id)}"><td>${esc(fechaBonita(e.fecha))}${e.hora ? `<div class="det">${esc(horaBonita(e.hora))}</div>` : ""}</td><td>${badgeEv(e)}</td>
<td><b>${esc(e.titulo)}</b>${e.lugar ? `<div class="det">📍 ${esc(e.lugar)}</div>` : ""}<div class="det"><code>${esc(url)}</code></div></td>
<td class="num">${cuenta(e.id)}${!juntas && conteoStaff.get(e.id) ? `<div class="det">+${conteoStaff.get(e.id)} staff</div>` : ""}${nPre ? `<div class="det">${nPre} prerreg.</div>` : ""}</td>
<td>${e.abierto ? '<span class="est abierto">abierto</span>' : '<span class="est cerrado">cerrado</span>'}${e.prereg ? '<div style="margin-top:3px"><span class="est prereg">prerreg.</span></div>' : ""}</td>
<td class="acc"><a class="btn sec" href="${wa(`${TIPOS[e.tipo].emoji} ${e.titulo}\nRegistra tu asistencia aquí 👉 ${url}`)}" target="_blank" rel="noopener">WhatsApp</a>
<button class="btn sec" type="button" onclick="copiar('${esc(url)}',this)">Copiar</button>
<a class="btn sec" href="/asistencia/${esc(e.id)}/qr" target="_blank">QR</a>
${juntas ? "" : `<a class="btn sec" href="/galeria?evento=${esc(e.id)}${yClave(clave)}" title="Fotos y videos de este evento">Fotos</a>
<form method="post" action="/eventos/prereg${q}" style="display:inline"><input type="hidden" name="id" value="${esc(e.id)}">
<button class="btn sec" type="submit" title="Apartar lugares antes del evento">${e.prereg ? "Cerrar prerreg." : "Abrir prerreg."}</button></form>`}
<form method="post" action="/eventos/alternar${q}" style="display:inline"><input type="hidden" name="id" value="${esc(e.id)}">
<button class="btn sec" type="submit">${e.abierto ? "Cerrar" : "Reabrir"}</button></form>
<a class="btn sec peligro" href="/eventos/borrar${q}&id=${esc(e.id)}" title="Borrar (pide confirmación)">Borrar</a></td></tr>`;
  }).join("");
  const datos = asis.map((a) => {
    const e = evs.find((x) => x.id === a.evento);
    return { ts: a.ts, nombre: a.nombre, mat: a.matricula, ev: a.evento, staff: esStaff(a),
             titulo: e?.titulo ?? "(evento borrado)", tipo: e?.tipo ?? "",
             tipoNombre: e ? nombreTipo(e) : "", fecha: e?.fecha ?? "" };
  });
  const datosPre = pre.map((p) => ({ ev: p.evento, nombre: p.nombre, mat: p.matricula }));
  const hoy = new Date().toLocaleDateString("sv-SE");
  const botonesTipo = juntas
    ? `<button class="crear" type="submit" name="tipo" value="junta" style="background:${TIPOS.junta.color};color:${TIPOS.junta.tinta}">📋 Nueva junta</button>`
    : TIPOS_FIJOS.map((t) =>
      `<button class="crear" type="submit" name="tipo" value="${t}" style="background:${TIPOS[t].color};color:${TIPOS[t].tinta}">${TIPOS[t].emoji} ${TIPOS[t].nombre}</button>`).join("") +
      `<div class="otro-caja"><input id="tipoNombre" name="tipoNombre" maxlength="40" placeholder="Nombre del tipo">
<button class="crear" type="submit" name="tipo" value="otro" onclick="return pideNombre()" style="background:${TIPOS.otro.color};color:${TIPOS.otro.tinta}">✨ Otro…</button></div>`;
  const cosa = juntas ? "junta" : "evento";
  // tipos presentes para el filtro (los "otro" entran con su propio nombre)
  const tiposFiltro = [...TIPOS_FIJOS.map((t) => ({ v: t, txt: `${TIPOS[t].emoji} ${TIPOS[t].nombre}` })),
    ...[...new Set(evs.filter((e) => e.tipo === "otro").map((e) => nombreTipo(e)))]
      .map((n) => ({ v: `otro:${n}`, txt: `✨ ${n}` }))];
  // prerregistro: tarjetas para compartir + lista de apartados
  const abiertos = evOrden.filter((e) => e.prereg);
  const yaAsistio = new Set(asis.map((a) => a.evento + "|" + a.matricula));
  const tarjetasPre = abiertos.map((e) => {
    const url = `${base}/preregistro/${e.id}`;
    const texto = `${TIPOS[e.tipo].emoji} ${e.titulo}\n📅 ${fechaLarga(e.fecha)}${e.hora ? ` · ${horaBonita(e.hora)}` : ""}${e.lugar ? `\n📍 ${e.lugar}` : ""}${e.nota ? `\n${e.nota}` : ""}\n\nAparta tu lugar aquí 👉 ${url}`;
    return `<div class="tarjeta pre-card">
  <div>${badgeEv(e)} <b style="margin-left:6px">${esc(e.titulo)}</b>
    <div class="det" style="margin-top:4px">📅 ${esc(fechaLarga(e.fecha))}${e.hora ? ` · ${esc(horaBonita(e.hora))}` : ""}${e.lugar ? ` · 📍 ${esc(e.lugar)}` : ""}</div>
    <div class="det"><code>${esc(url)}</code></div></div>
  <div class="pre-num"><b>${conteoPre.get(e.id) ?? 0}</b><small>apartados</small></div>
  <div class="acc"><a class="btn sec" href="${wa(texto)}" target="_blank" rel="noopener">WhatsApp</a>
    <button class="btn sec" type="button" onclick="copiar('${esc(url)}',this)">Copiar</button>
    <a class="btn sec" href="/preregistro/${esc(e.id)}/qr" target="_blank">QR</a></div>
</div>`;
  }).join("\n");
  const filasPre = [...pre].sort((a, b) => (a.ts < b.ts ? 1 : -1)).map((p) => {
    const e = evs.find((x) => x.id === p.evento);
    const vino = yaAsistio.has(p.evento + "|" + p.matricula);
    return `<tr><td>${esc(new Date(p.ts).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }))}</td>
<td>${esc(p.nombre)}</td><td>${esc(p.matricula)}${p.correo ? `<div class="det">${esc(p.correo)}</div>` : ""}</td>
<td>${esc(e?.titulo ?? "(evento borrado)")}</td>
<td>${vino ? '<span class="est abierto">asistió</span>' : '<span class="est cerrado">pendiente</span>'}</td>
<td class="acciones"><form method="post" action="/preregistro/quitar${q}" data-confirmar="¿Quitar el prerregistro de ${esc(p.nombre)}?">
<input type="hidden" name="evento" value="${esc(p.evento)}"><input type="hidden" name="matricula" value="${esc(p.matricula)}">
<button class="btn sec mini peligro" type="submit">Quitar</button></form></td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${juntas ? "Juntas de staff" : "Eventos"} MIND</title>${FUENTE}
<style>${CSS_BASE}${NAV_CSS}${TABS_CSS}
${juntas ? "header { background:linear-gradient(140deg,#1C2260,#2E4BC6 60%,#232D93); }" : ""}
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:16px 0; }
.stat { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:12px 14px; }
.stat small { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#6A6F98; }
.stat b { display:block; font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; }
.crear-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:10px; }
button.crear { font:inherit; font-weight:800; font-size:14px; border:none; border-radius:14px; padding:16px 10px; min-height:56px; cursor:pointer; box-shadow:0 3px 10px rgba(28,34,96,.12); width:100%; }
button.crear:hover { filter:brightness(.95); transform:translateY(-1px); }
.otro-caja { display:grid; gap:6px; }
.otro-caja input { min-height:36px; font-size:13.5px; padding:7px 10px; }
.fila { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; }
table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E4E1D2; border-radius:14px; overflow:hidden; font-size:13.5px; }
th, td { padding:9px 10px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:top; }
th { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; }
tr:last-child td { border-bottom:none; }
.num { text-align:right; font-variant-numeric:tabular-nums; }
.det { font-size:11px; color:#8A8FB5; word-break:break-all; }
.det code { font-family:'IBM Plex Mono',ui-monospace,monospace; }
.acc { white-space:nowrap; } .acc .btn { margin:2px 2px 2px 0; }
.est { font-size:11px; font-weight:700; border-radius:999px; padding:2px 9px; }
.est.abierto { background:#E8F3D9; color:#3F6B10; } .est.cerrado { background:#EEECE3; color:#6A6F98; }
.est.prereg { background:#F6E4FB; color:#8B21A8; }
.tabla-scroll { overflow-x:auto; }
.rank td:first-child { font-weight:800; color:#2E4BC6; width:34px; }
.filtros { display:grid; grid-template-columns:${juntas ? "2fr 1.6fr" : "2fr 1fr 1.6fr 1fr"}; gap:10px; margin-bottom:10px; }
@media (max-width:640px){ .filtros { grid-template-columns:1fr; } }
.vacio { color:#8A8FB5; font-size:13px; padding:12px; }
.btn.peligro { color:#A03434; background:#FBECEC; border-color:#F0CFCF; } .btn.peligro:hover { background:#F5D9D9; }
.staff { font-size:10px; font-weight:800; letter-spacing:.05em; background:#1C2260; color:#fff; border-radius:999px; padding:2px 7px; margin-left:6px; vertical-align:middle; }
.roster { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:6px; margin-top:6px; }
.persona { text-transform:none; letter-spacing:0; font-size:13.5px; font-weight:600; color:#1C2260; display:flex; align-items:center; gap:10px; background:#FCFBF5; border:1.5px solid #DDD9C6; border-radius:10px; padding:8px 10px; cursor:pointer; margin:0; }
.persona input { width:18px; height:18px; min-height:0; flex:none; }
.persona small { display:block; font-size:11px; color:#8A8FB5; font-weight:500; }
.persona.ya { opacity:.6; cursor:default; } .persona.ya small::after { content:" · ya registrado"; color:#3F6B10; font-weight:700; }
.persona.pre { background:#FBF4FE; border-color:#E9C7F5; }
.check label { text-transform:none; letter-spacing:0; font-size:13.5px; font-weight:600; color:#1C2260; display:flex; align-items:center; gap:8px; min-height:44px; margin:0; }
.check input { width:18px; height:18px; min-height:0; }
.mini { font-size:11.5px; padding:5px 10px; min-height:30px; }
td.acciones { white-space:nowrap; } td.acciones form { display:inline; }
.pct { font-size:11px; color:#6A6F98; }
.pre-card { display:grid; grid-template-columns:1fr auto; gap:10px 14px; align-items:start; margin-bottom:10px; }
.pre-card .pre-num { text-align:right; } .pre-card .pre-num b { font-size:22px; font-weight:800; display:block; }
.pre-card .pre-num small { font-size:10.5px; color:#6A6F98; text-transform:uppercase; letter-spacing:.06em; }
.pre-card .acc { grid-column:1 / -1; }
</style></head><body>
<header>${navAdmin(clave, "eventos")}<h1>${juntas ? "Juntas de staff" : "Eventos MIND"}</h1><p>${juntas
  ? "Crea la junta, palomea a quienes estuvieron o comparte el enlace, y el historial de asistencia del staff se arma solo"
  : "Crea el evento, comparte el enlace, y la asistencia se registra sola"}</p>${tabsEventos(clave, juntas ? "juntas" : "eventos")}</header>
<main>
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<div class="stats">
  <div class="stat"><small>${juntas ? "Juntas" : "Eventos"}</small><b>${evs.length}</b></div>
  <div class="stat"><small>Asistencias</small><b>${publico.length}</b></div>
  <div class="stat"><small>${juntas ? "Staff que ha asistido" : "Personas distintas"}</small><b>${personas}</b></div>
  ${juntas
    ? `<div class="stat"><small>Staff de MIND</small><b>${staffRoster.length}</b></div>`
    : `<div class="stat"><small>Registros de staff</small><b>${asis.length - publico.length}</b></div>
  <div class="stat"><small>Prerregistros</small><b>${pre.length}</b></div>`}
</div>

<h2>${juntas ? "Nueva junta" : "Crear evento"}</h2>
<form class="tarjeta" method="post" action="/eventos/nuevo${q}"
  onsubmit="if (this.dataset.enviando) return false; this.dataset.enviando = '1'; setTimeout(() => this.querySelectorAll('button').forEach((b) => { b.disabled = true; b.style.opacity = .55; }), 0);">
  <div class="fila">
    <div><label for="titulo">Título (opcional)</label><input id="titulo" name="titulo" maxlength="80" placeholder="${juntas ? "p. ej. Junta semanal · planeación NeurArt" : "p. ej. NeuroCharla de Naturaleza"}"></div>
    <div><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${hoy}" required></div>
    <div><label for="hora">Hora (opcional)</label><input id="hora" name="hora" type="time"></div>
  </div>
  ${juntas ? "" : `<div class="fila" style="margin-top:10px">
    <div><label for="lugar">Lugar (opcional)</label><input id="lugar" name="lugar" maxlength="80" placeholder="p. ej. Ágora de las Artes"></div>
    <div><label for="nota">Nota / ponente (opcional)</label><input id="nota" name="nota" maxlength="80" placeholder="p. ej. Con Florencia Garza"></div>
    <div class="check"><label><input type="checkbox" name="prereg"> Abrir prerregistro</label></div>
  </div>`}
  <label style="margin-top:12px">${juntas ? "Un toque y queda creada con su enlace y QR" : "Un toque en el tipo y listo"}</label>
  <div class="crear-grid">${botonesTipo}</div>
</form>

<h2>${juntas ? "Juntas" : "Eventos"}</h2>
<div class="tabla-scroll"><table>
<tr><th>Fecha</th><th>Tipo</th><th>${juntas ? "Junta" : "Evento"} · enlace</th><th class="num">Asist.</th><th>Estado</th><th></th></tr>
${filasEv || `<tr><td colspan="6" class="vacio">Todavía no hay ${juntas ? "juntas" : "eventos"} — crea ${juntas ? "la primera" : "el primero"} arriba.</td></tr>`}
</table></div>

${juntas ? "" : `<h2>Prerregistro</h2>
${abiertos.length ? tarjetasPre : '<p class="vacio">Ningún evento tiene prerregistro abierto. Ábrelo con el botón «Abrir prerreg.» del evento y comparte el enlace para que aparten su lugar.</p>'}
${pre.length ? `<div class="tabla-scroll" style="margin-top:10px"><table>
<tr><th>Cuándo</th><th>Nombre</th><th>Matrícula</th><th>Evento</th><th>Estado</th><th></th></tr>${filasPre}</table></div>
<p style="font-size:12px;color:#8A8FB5;margin:6px 0 14px">«Asistió» se marca solo cuando la persona se registra el día del evento · <a href="/preregistros.csv${conClave(clave)}" style="color:#2E4BC6;font-weight:600">descargar CSV</a></p>` : ""}`}

<h2>${juntas ? "Pasar lista" : "Registrar asistencia desde aquí"}</h2>
${evs.length ? `<form class="tarjeta" method="post" action="/asistencia/manual${q}" id="manual">
  <div class="fila">
    <div><label for="mev">Agregar asistencia a la ${cosa}:</label><select id="mev" name="evento" required>${opcionesEv}</select></div>
  </div>
  <label style="margin-top:14px">Staff de MIND${juntas ? " · palomea a quienes están" : ""}</label>
  ${staffRoster.length
    ? `<div class="roster">${staffRoster.map((p) =>
        `<label class="persona"><input type="checkbox" name="matriculas" value="${esc(p.matricula)}"><span>${esc(p.nombre)}<small>${esc(p.matricula)}</small></span></label>`).join("")}</div>`
    : '<p class="vacio">Todavía nadie está marcado como staff. Cuando alguien se registre como staff, o lo marques abajo con «Hacer staff», aparecerá aquí para palomearlo.</p>'}
  ${juntas ? "" : `<label style="margin-top:14px">Prerregistrados a este evento</label>
  <div class="roster" id="pre-roster"></div>`}
  <label style="margin-top:14px">${juntas ? "Alguien nuevo en el staff (opcional)" : "Otra persona (opcional)"}</label>
  <div class="fila">
    <div><input name="nombre" maxlength="80" placeholder="Nombre completo" autocomplete="off"></div>
    <div><input name="matricula" maxlength="12" placeholder="Matrícula" style="text-transform:uppercase" autocomplete="off"></div>
    ${juntas ? '<input type="hidden" name="otroStaff" value="on">' : '<div class="check"><label><input type="checkbox" name="otroStaff"> Es staff</label></div>'}
  </div>
  <div style="margin-top:14px"><button class="btn" type="submit">Registrar asistencia</button>
    <span class="det" style="display:inline;margin-left:10px">Funciona aunque ${juntas ? "la junta esté cerrada" : "el evento esté cerrado"} · una matrícula cuenta una vez por ${cosa}</span></div>
</form>` : `<p class="vacio">Crea ${juntas ? "una junta" : "un evento"} primero.</p>`}

<h2>Asistencia</h2>
<div class="filtros">
  <input id="fq" placeholder="Buscar por nombre o matrícula…">
  <select id="ftipo"${juntas ? " hidden" : ""}><option value="">Todos los tipos</option>
    ${tiposFiltro.map((t) => `<option value="${esc(t.v)}">${esc(t.txt)}</option>`).join("")}</select>
  <select id="fev"><option value="">${juntas ? "Todas las juntas" : "Todos los eventos"}</option>
    ${evOrden.map((e) => `<option value="${esc(e.id)}">${esc(fechaBonita(e.fecha))} · ${esc(e.titulo)}</option>`).join("")}</select>
  <select id="fstaff"${juntas ? " hidden" : ""}>${juntas ? '<option value="" selected>Todos</option>' : '<option value="no">Solo asistentes</option><option value="si">Solo staff</option><option value="">Asistentes y staff</option>'}</select>
</div>
<div class="tabla-scroll"><table class="rank" id="ranking"><thead><tr><th>#</th><th>Persona</th><th>Matrícula</th><th class="num">${juntas ? "Juntas" : "Eventos"}</th><th>${juntas ? "Asistencia" : "Tipos"}</th><th></th></tr></thead><tbody></tbody></table></div>
<p style="font-size:12px;color:#8A8FB5;margin:6px 0 14px">Ranking completo según los filtros de arriba (<b id="nrank">0 personas</b>)${juntas ? "" : " · «Hacer staff» / «Quitar de staff» cambia a la persona en todos sus registros"} · <a id="csv" href="/eventos.csv${conClave(clave)}${juntas ? "&solo=juntas" : ""}" style="color:#2E4BC6;font-weight:600">descargar CSV</a></p>
<div class="tabla-scroll"><table id="lista"><thead><tr><th>Cuándo</th><th>Nombre</th><th>Matrícula</th><th>${juntas ? "Junta" : "Evento"}</th><th>Tipo</th><th></th></tr></thead><tbody></tbody></table></div>
<p style="font-size:12px;color:#8A8FB5;margin:6px 0 14px">«Quitar» borra ese registro; si a la persona no le queda ninguno, desaparece del historial.</p>
${PUNTOS}
</main>
<script>
const TIPOS = ${jsonSeguro(TIPOS)};
const DATOS = ${jsonSeguro(datos)};
const PRE = ${jsonSeguro(datosPre)};
const Q = ${jsonSeguro(q)};
const STAFF = ${jsonSeguro(staffRoster.map((p) => ({ mat: p.matricula, nombre: p.nombre })))};
const JUNTAS = ${juntas ? "true" : "false"};
const TOTAL_EV = ${evs.length};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// confirmación antes de quitar un registro (el texto viene en data-confirmar)
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.dataset && f.dataset.confirmar && !confirm(f.dataset.confirmar)) e.preventDefault();
});
function pideNombre() {
  const i = document.getElementById('tipoNombre');
  if (i && !i.value.trim()) { i.focus(); alert('Escribe el nombre del tipo de evento (p. ej. NeuroCharla de Naturaleza).'); return false; }
  return true;
}
function copiar(url, btn) {
  navigator.clipboard.writeText(url).then(() => { btn.textContent = '✓ copiado'; setTimeout(() => btn.textContent = 'Copiar', 1500); });
}
// en el formulario de captura: los prerregistrados del evento elegido salen como
// casillas y quien ya está registrado aparece palomeado y bloqueado
function pintaRoster() {
  const sel = document.getElementById('mev');
  if (!sel) return;
  const cont = document.getElementById('pre-roster');
  if (cont) {
    const lista = PRE.filter((p) => p.ev === sel.value);
    cont.innerHTML = lista.length ? lista.map((p) =>
      '<label class="persona pre"><input type="checkbox" name="matriculas" value="' + esc(p.mat) + '"><span>' +
      esc(p.nombre) + '<small>' + esc(p.mat) + '</small></span></label>').join('')
      : '<p class="vacio" style="grid-column:1/-1">Nadie apartó lugar para este evento.</p>';
  }
  const en = new Set(DATOS.filter((d) => d.ev === sel.value).map((d) => d.mat));
  document.querySelectorAll('.persona').forEach((l) => {
    const c = l.querySelector('input'); const ya = en.has(c.value);
    c.disabled = ya; c.checked = ya; l.classList.toggle('ya', ya);
  });
}
function pinta() {
  const q = document.getElementById('fq').value.trim().toLowerCase();
  const t = document.getElementById('ftipo').value;
  const ev = document.getElementById('fev').value;
  const st = document.getElementById('fstaff').value;
  const coincideTipo = (d) => !t || (t.slice(0, 5) === 'otro:' ? (d.tipo === 'otro' && d.tipoNombre === t.slice(5)) : d.tipo === t);
  const rows = DATOS.filter((d) => (!q || d.nombre.toLowerCase().includes(q) || d.mat.toLowerCase().includes(q))
    && coincideTipo(d) && (!ev || d.ev === ev) && (st === '' || (st === 'si') === d.staff));
  const por = new Map();
  for (const d of rows) {
    const p = por.get(d.mat) ?? { nombre: d.nombre, mat: d.mat, evs: new Set(), tipos: new Map(), staff: false };
    p.evs.add(d.ev);
    if (d.tipo) p.tipos.set(d.tipo + '|' + d.tipoNombre, { tipo: d.tipo, nombre: d.tipoNombre });
    p.nombre = d.nombre; p.staff = p.staff || d.staff; por.set(d.mat, p);
  }
  // el staff sale completo aunque tenga cero, para saber quién no ha ido
  if (JUNTAS || st !== 'no') for (const s of STAFF) {
    if (por.has(s.mat)) continue;
    if (q && !s.nombre.toLowerCase().includes(q) && !s.mat.toLowerCase().includes(q)) continue;
    por.set(s.mat, { nombre: s.nombre, mat: s.mat, evs: new Set(), tipos: new Map(), staff: true });
  }
  const sello = (s) => s && !JUNTAS ? '<span class="staff">STAFF</span>' : '';
  const tipoHTML = (tipo, nombre) => TIPOS[tipo]
    ? '<span class="tipo" style="background:' + TIPOS[tipo].color + ';color:' + TIPOS[tipo].tinta + '">' + TIPOS[tipo].emoji + ' ' + esc(nombre || TIPOS[tipo].nombre) + '</span> ' : '';
  const btnStaff = (p) => '<form method="post" action="/asistencia/staff' + Q + '"><input type="hidden" name="matricula" value="' + esc(p.mat) + '">' +
    '<input type="hidden" name="staff" value="' + (p.staff ? 'no' : 'si') + '"><button class="btn sec mini" type="submit">' + (p.staff ? 'Quitar de staff' : 'Hacer staff') + '</button></form>';
  const btnQuitar = (d) => '<form method="post" action="/asistencia/quitar' + Q + '" data-confirmar="' + esc('¿Quitar la asistencia de ' + d.nombre + ' a «' + d.titulo + '»?') + '">' +
    '<input type="hidden" name="evento" value="' + esc(d.ev) + '"><input type="hidden" name="matricula" value="' + esc(d.mat) + '"><button class="btn sec mini peligro" type="submit">Quitar</button></form>';
  const pct = (p) => TOTAL_EV ? Math.round(100 * p.evs.size / TOTAL_EV) : 0;
  const rank = [...por.values()].sort((a, b) => b.evs.size - a.evs.size || a.nombre.localeCompare(b.nombre));
  // las filas van SIEMPRE dentro del <tbody>: insertarlas en <table> crea un tbody por fila y se duplican
  const tb = document.querySelector('#ranking tbody');
  tb.innerHTML = rank.length ? '' : '<tr><td colspan="6" class="vacio">Sin asistencias con estos filtros.</td></tr>';
  document.getElementById('nrank').textContent = rank.length + (rank.length === 1 ? ' persona' : ' personas');
  rank.forEach((p, i) => tb.insertAdjacentHTML('beforeend',
    '<tr><td>' + (i + 1) + '</td><td>' + esc(p.nombre) + sello(p.staff) + '</td><td>' + esc(p.mat) + '</td><td class="num">' + p.evs.size + '</td><td>' +
    (JUNTAS ? '<b>' + pct(p) + '%</b> <span class="pct">de ' + TOTAL_EV + ' junta' + (TOTAL_EV === 1 ? '' : 's') + '</span>'
            : [...p.tipos.values()].map((x) => tipoHTML(x.tipo, x.nombre)).join('')) +
    '</td><td class="acciones">' + (JUNTAS ? '' : btnStaff(p)) + '</td></tr>'));
  const lb = document.querySelector('#lista tbody');
  lb.innerHTML = '';
  rows.sort((a, b) => (a.ts < b.ts ? 1 : -1)).forEach((d) => lb.insertAdjacentHTML('beforeend',
    '<tr><td>' + esc(new Date(d.ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })) + '</td><td>' + esc(d.nombre) + sello(d.staff) + '</td><td>' + esc(d.mat) + '</td><td>' + esc(d.titulo) + '</td><td>' +
    tipoHTML(d.tipo, d.tipoNombre) + '</td><td class="acciones">' + btnQuitar(d) + '</td></tr>'));
}
for (const id of ['fq', 'ftipo', 'fev', 'fstaff']) document.getElementById(id).addEventListener('input', pinta);
pinta();
const mev = document.getElementById('mev');
if (mev) { mev.addEventListener('change', pintaRoster); pintaRoster(); }
</script></body></html>`;
}

export function renderCSV(evs: Evento[], asis: Asistencia[]): string {
  const enc = (s: string) => (/[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const idx = new Map(evs.map((e) => [e.id, e]));
  return ["fecha_registro,nombre,matricula,evento,tipo,fecha_evento,evento_id,staff",
    ...asis.map((a) => {
      const e = idx.get(a.evento);
      return [a.ts, enc(a.nombre), a.matricula, enc(e?.titulo ?? ""),
              enc(e ? nombreTipo(e) : ""), e?.fecha ?? "", a.evento, esStaff(a) ? "si" : "no"].join(",");
    })].join("\n");
}

export function renderCSVPre(evs: Evento[], pre: Preregistro[], asis: Asistencia[]): string {
  const enc = (s: string) => (/[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const idx = new Map(evs.map((e) => [e.id, e]));
  const vino = new Set(asis.map((a) => a.evento + "|" + a.matricula));
  return ["fecha_prerregistro,nombre,matricula,correo,evento,tipo,fecha_evento,evento_id,asistio",
    ...pre.map((p) => {
      const e = idx.get(p.evento);
      return [p.ts, enc(p.nombre), p.matricula, enc(p.correo ?? ""), enc(e?.titulo ?? ""),
              enc(e ? nombreTipo(e) : ""), e?.fecha ?? "", p.evento,
              vino.has(p.evento + "|" + p.matricula) ? "si" : "no"].join(",");
    })].join("\n");
}

// pantalla "¿estás seguro?" antes de borrar un evento o junta y sus asistencias
export function renderConfirmarBorrado(ev: Evento, nAsis: number, nStaff: number, nPre: number,
                                       clave: string): string {
  const junta = esJunta(ev);
  const q = `${conClave(clave)}${junta ? "&volver=juntas" : ""}`;
  const cosa = junta ? "la junta" : "el evento";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>¿Borrar ${cosa}? · MIND</title>${FUENTE}
<style>${CSS_BASE}${NAV_CSS} header{background:linear-gradient(140deg,#A03434,#5B2A6E 60%,#232D93)} main{max-width:540px}
.grande{font-size:22px;font-weight:800;margin-bottom:6px} .btn.peligro{background:#A03434} .btn.peligro:hover{background:#7E2626}
.acciones{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px} ul{margin:12px 0 0 18px;font-size:13.5px;line-height:1.7}
code{font-family:ui-monospace,monospace;font-size:12px;background:#F3F1E6;padding:1px 5px;border-radius:5px}</style></head><body>
<header>${navAdmin(clave, "eventos")}<h1>¿Estás seguro?</h1><p>Borrar ${cosa} no se puede deshacer</p></header>
<main><div class="tarjeta"><div class="grande">Borrar «${esc(ev.titulo)}»</div>
<p>${badgeEv(ev)} &nbsp;${esc(fechaBonita(ev.fecha))} · registro ${ev.abierto ? "abierto" : "cerrado"}</p>
<ul>
  <li>Se borra ${cosa} y su enlace <code>/asistencia/${esc(ev.id)}</code> deja de funcionar (y su QR también).</li>
  <li>Se borran sus <b>${nAsis}</b> registro(s) de asistencia${nStaff && !junta ? ` (incluye ${nStaff} de staff)` : ""}. No se recuperan.</li>
  ${nPre ? `<li>Se borran también sus <b>${nPre}</b> prerregistro(s).</li>` : ""}
  <li>Si solo quieres que nadie más se registre, mejor usa <b>Cerrar</b> en la lista.</li>
</ul>
<form method="post" action="/eventos/borrar${q}" class="acciones">
  <input type="hidden" name="id" value="${esc(ev.id)}"><input type="hidden" name="confirmar" value="si">
  <a class="btn sec" href="${junta ? "/juntas" : "/eventos"}${conClave(clave)}">Cancelar</a>
  <button class="btn peligro" type="submit">Sí, borrar ${cosa}</button>
</form></div>${PUNTOS}</main></body></html>`;
}

export function renderQR(ev: Evento, svg: string, url: string,
                         modo: "registro" | "prerregistro" = "registro"): string {
  const t = TIPOS[ev.tipo];
  const pre = modo === "prerregistro";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>QR · ${esc(ev.titulo)}</title>${FUENTE}
<style>${CSS_BASE} header{background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93)} main{max-width:520px;text-align:center}
.qr{background:#fff;border-radius:18px;padding:18px;display:inline-block;border:1px solid #E4E1D2} .qr svg{width:min(78vw,380px);height:auto;display:block}
.grande{font-size:22px;font-weight:800;margin:14px 0 4px}</style></head><body>
<header><p>${t.emoji} ${esc(nombreTipo(ev))} · ${esc(fechaBonita(ev.fecha))}${ev.hora ? ` · ${esc(horaBonita(ev.hora))}` : ""}</p><h1>${esc(ev.titulo)}</h1></header>
<main><div class="grande">${pre ? "Escanea y aparta tu lugar" : "Escanea y registra tu asistencia"}</div>
<p style="color:#6A6F98;font-size:13px;margin-bottom:14px">${pre ? "nombre + matrícula · apartas tu lugar en 10 segundos" : "nombre + matrícula · 10 segundos"}${ev.lugar ? ` · 📍 ${esc(ev.lugar)}` : ""}</p>
<div class="qr">${svg}</div>
<p style="margin-top:12px;font-size:12px;color:#8A8FB5;word-break:break-all">${esc(url)}</p>${PUNTOS}</main></body></html>`;
}
