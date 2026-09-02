// Asistencia a eventos de MIND: un clic crea el evento y su enlace público,
// la gente se registra desde el celular (nombre + matrícula) y el panel admin
// filtra por evento / persona y arma el ranking de asistencia.
// Datos en el disco persistente de Railway (DATA_DIR), como cuentas.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface Evento {
  id: string;
  tipo: TipoId;
  titulo: string;
  fecha: string;        // YYYY-MM-DD
  abierto: boolean;
  creado: string;       // ISO
}
export interface Asistencia {
  evento: string;       // id del evento
  nombre: string;
  matricula: string;    // normalizada en mayúsculas
  ts: string;           // ISO
}

export const TIPOS = {
  happy:       { nombre: "Happy Midweek", color: "#F5C518", tinta: "#4a3a00", emoji: "🎉" },
  stand:       { nombre: "Stand",         color: "#29A3C7", tinta: "#0b3140", emoji: "🛍️" },
  neurart:     { nombre: "NeurArt",       color: "#EC4899", tinta: "#4a0f2b", emoji: "🎨" },
  neurocharla: { nombre: "NeuroCharla",   color: "#8BC53F", tinta: "#23400a", emoji: "🧠" },
} as const;
export type TipoId = keyof typeof TIPOS;
export const esTipo = (t: string): t is TipoId => t in TIPOS;

const DIR = process.env.DATA_DIR ?? "/data";
const F_EV = path.join(DIR, "eventos.json");
const F_AS = path.join(DIR, "asistencias.json");

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

export function crearEvento(tipo: TipoId, titulo: string, fecha: string): Evento {
  const evs = leerEventos();
  let id = "";
  do { id = crypto.randomBytes(4).toString("base64url").slice(0, 6).toLowerCase(); }
  while (evs.some((e) => e.id === id));
  const ev: Evento = {
    id, tipo, fecha, abierto: true, creado: new Date().toISOString(),
    titulo: titulo.trim() || `${TIPOS[tipo].nombre} · ${fechaBonita(fecha)}`,
  };
  evs.push(ev);
  escribirJSON(F_EV, evs);
  return ev;
}

export function alternarEvento(id: string): Evento | null {
  const evs = leerEventos();
  const ev = evs.find((e) => e.id === id);
  if (!ev) return null;
  ev.abierto = !ev.abierto;
  escribirJSON(F_EV, evs);
  return ev;
}

export function buscarEvento(id: string): Evento | undefined {
  return leerEventos().find((e) => e.id === id);
}

/** Registra asistencia. Devuelve 'ok' | 'duplicado' | 'cerrado' | 'no-existe'. */
export function registrar(eventoId: string, nombre: string, matricula: string) {
  const ev = buscarEvento(eventoId);
  if (!ev) return "no-existe" as const;
  if (!ev.abierto) return "cerrado" as const;
  const mat = normMatricula(matricula);
  const lista = leerAsistencias();
  if (lista.some((a) => a.evento === eventoId && a.matricula === mat)) return "duplicado" as const;
  lista.push({ evento: eventoId, nombre: limpiar(nombre), matricula: mat,
               ts: new Date().toISOString() });
  escribirJSON(F_AS, lista);
  return "ok" as const;
}

export const normMatricula = (m: string) =>
  m.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
const limpiar = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);

export function fechaBonita(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${meses[(m ?? 1) - 1]} ${y}`;
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

const badge = (t: TipoId) =>
  `<span class="tipo" style="background:${TIPOS[t].color};color:${TIPOS[t].tinta}">${TIPOS[t].emoji} ${TIPOS[t].nombre}</span>`;

// ---------------- formulario público ----------------
export function renderFormulario(ev: Evento, error?: string): string {
  const t = TIPOS[ev.tipo];
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ev.titulo)} · MIND</title>${FUENTE}<style>${CSS_BASE}
header { background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93); }
main { max-width:460px; }
form { display:grid; gap:14px; }
.err { background:#FDE8E8; border:1px solid #F0B8B8; color:#8A2626; border-radius:10px; padding:10px 14px; font-size:13px; }
</style></head><body>
<header><p>${t.emoji} ${esc(t.nombre)} · ${esc(fechaBonita(ev.fecha))}</p><h1>${esc(ev.titulo)}</h1>
<p>Registra tu asistencia — toma 10 segundos</p></header>
<main><div class="tarjeta">
${error ? `<div class="err" style="margin-bottom:12px">${esc(error)}</div>` : ""}
<form method="post" action="/asistencia/${esc(ev.id)}" autocomplete="on">
  <div><label for="nombre">Nombre completo</label>
    <input id="nombre" name="nombre" required maxlength="80" placeholder="Nombre y apellidos" autocomplete="name"></div>
  <div><label for="matricula">Matrícula</label>
    <input id="matricula" name="matricula" required maxlength="12" placeholder="A0XXXXXXX"
      style="text-transform:uppercase" autocapitalize="characters" autocomplete="off"></div>
  <input type="text" name="sitio" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button class="btn" type="submit">Registrar mi asistencia</button>
</form></div>${PUNTOS}
<p style="text-align:center;font-size:11.5px;color:#8A8FB5;margin-top:14px">MIND · LiFE Grupos Estudiantiles · @mindmty</p>
</main></body></html>`;
}

export function renderResultado(ev: Evento, tipo: "ok" | "duplicado" | "cerrado", nombre: string): string {
  const t = TIPOS[ev.tipo];
  const msg = tipo === "ok"
    ? { h: "¡Registrado! 🎉", p: `Gracias por venir a <b>${esc(ev.titulo)}</b>, ${esc(nombre.split(" ")[0] || "")}.` }
    : tipo === "duplicado"
    ? { h: "Ya estabas en la lista ✓", p: `Tu matrícula ya aparece en <b>${esc(ev.titulo)}</b>. ¡Gracias!` }
    : { h: "Registro cerrado", p: `<b>${esc(ev.titulo)}</b> ya cerró su lista de asistencia.` };
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${msg.h} · MIND</title>${FUENTE}
<style>${CSS_BASE} header{background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93)} main{max-width:460px;text-align:center}
.grande{font-size:26px;font-weight:800;margin:6px 0 10px}</style></head><body>
<header><p>${t.emoji} ${esc(t.nombre)}</p><h1>${esc(ev.titulo)}</h1></header>
<main><div class="tarjeta"><div class="grande">${msg.h}</div><p>${msg.p}</p>
<p style="margin-top:14px;font-size:13px;color:#6A6F98">Síguenos: <a href="https://quique2.github.io/mind/" style="color:#2E4BC6;font-weight:600">enlaces de MIND</a></p></div>${PUNTOS}</main></body></html>`;
}

// ---------------- panel admin ----------------
export function renderAdmin(evs: Evento[], asis: Asistencia[], clave: string,
                            base: string, aviso?: string): string {
  const conteo = new Map<string, number>();
  for (const a of asis) conteo.set(a.evento, (conteo.get(a.evento) ?? 0) + 1);
  const evOrden = [...evs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const personas = new Set(asis.map((a) => a.matricula)).size;
  const q = `?clave=${encodeURIComponent(clave)}`;
  const filasEv = evOrden.map((e) => {
    const url = `${base}/asistencia/${e.id}`;
    const wa = `https://wa.me/?text=${encodeURIComponent(`${TIPOS[e.tipo].emoji} ${e.titulo}\nRegistra tu asistencia aquí 👉 ${url}`)}`;
    return `<tr data-id="${esc(e.id)}"><td>${esc(fechaBonita(e.fecha))}</td><td>${badge(e.tipo)}</td>
<td><b>${esc(e.titulo)}</b><div class="det"><code>${esc(url)}</code></div></td>
<td class="num">${conteo.get(e.id) ?? 0}</td>
<td>${e.abierto ? '<span class="est abierto">abierto</span>' : '<span class="est cerrado">cerrado</span>'}</td>
<td class="acc"><a class="btn sec" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>
<button class="btn sec" type="button" onclick="copiar('${esc(url)}',this)">Copiar</button>
<a class="btn sec" href="/asistencia/${esc(e.id)}/qr" target="_blank">QR</a>
<form method="post" action="/eventos/alternar${q}" style="display:inline"><input type="hidden" name="id" value="${esc(e.id)}">
<button class="btn sec" type="submit">${e.abierto ? "Cerrar" : "Reabrir"}</button></form></td></tr>`;
  }).join("");
  const datos = asis.map((a) => {
    const e = evs.find((x) => x.id === a.evento);
    return { ts: a.ts, nombre: a.nombre, mat: a.matricula, ev: a.evento,
             titulo: e?.titulo ?? "(evento borrado)", tipo: e?.tipo ?? "", fecha: e?.fecha ?? "" };
  });
  const hoy = new Date().toLocaleDateString("sv-SE");
  const botonesTipo = (Object.keys(TIPOS) as TipoId[]).map((t) =>
    `<button class="crear" type="submit" name="tipo" value="${t}" style="background:${TIPOS[t].color};color:${TIPOS[t].tinta}">${TIPOS[t].emoji} ${TIPOS[t].nombre}</button>`).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Eventos MIND</title>${FUENTE}
<style>${CSS_BASE}
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:16px 0; }
.stat { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:12px 14px; }
.stat small { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#6A6F98; }
.stat b { display:block; font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; }
.crear-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:10px; }
button.crear { font:inherit; font-weight:800; font-size:14px; border:none; border-radius:14px; padding:16px 10px; min-height:56px; cursor:pointer; box-shadow:0 3px 10px rgba(28,34,96,.12); }
button.crear:hover { filter:brightness(.95); transform:translateY(-1px); }
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
.tabla-scroll { overflow-x:auto; }
.rank td:first-child { font-weight:800; color:#2E4BC6; width:34px; }
.filtros { display:grid; grid-template-columns:2fr 1fr 1.6fr; gap:10px; margin-bottom:10px; }
@media (max-width:640px){ .filtros { grid-template-columns:1fr; } }
.vacio { color:#8A8FB5; font-size:13px; padding:12px; }
</style></head><body>
<header><h1>Eventos MIND</h1><p>Crea el evento, comparte el enlace, y la asistencia se registra sola</p></header>
<main>
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<div class="stats">
  <div class="stat"><small>Eventos</small><b>${evs.length}</b></div>
  <div class="stat"><small>Asistencias</small><b>${asis.length}</b></div>
  <div class="stat"><small>Personas distintas</small><b>${personas}</b></div>
</div>

<h2>Crear evento</h2>
<form class="tarjeta" method="post" action="/eventos/nuevo${q}">
  <div class="fila">
    <div><label for="titulo">Título (opcional)</label><input id="titulo" name="titulo" maxlength="80" placeholder="p. ej. NeuroCharla: TDAH en la uni"></div>
    <div><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${hoy}" required></div>
  </div>
  <label style="margin-top:12px">Un toque en el tipo y listo</label>
  <div class="crear-grid">${botonesTipo}</div>
</form>

<h2>Eventos</h2>
<div class="tabla-scroll"><table>
<tr><th>Fecha</th><th>Tipo</th><th>Evento · enlace</th><th class="num">Asist.</th><th>Estado</th><th></th></tr>
${filasEv || '<tr><td colspan="6" class="vacio">Todavía no hay eventos — crea el primero arriba.</td></tr>'}
</table></div>

<h2>Asistencia</h2>
<div class="filtros">
  <input id="fq" placeholder="Buscar por nombre o matrícula…">
  <select id="ftipo"><option value="">Todos los tipos</option>
    ${(Object.keys(TIPOS) as TipoId[]).map((t) => `<option value="${t}">${TIPOS[t].emoji} ${TIPOS[t].nombre}</option>`).join("")}</select>
  <select id="fev"><option value="">Todos los eventos</option>
    ${evOrden.map((e) => `<option value="${esc(e.id)}">${esc(fechaBonita(e.fecha))} · ${esc(e.titulo)}</option>`).join("")}</select>
</div>
<div class="tabla-scroll"><table class="rank" id="ranking"><tr><th>#</th><th>Persona</th><th>Matrícula</th><th class="num">Eventos</th><th>Tipos</th></tr></table></div>
<p style="font-size:12px;color:#8A8FB5;margin:6px 0 14px">Ranking según los filtros de arriba · <a id="csv" href="/eventos.csv${q}" style="color:#2E4BC6;font-weight:600">descargar CSV</a></p>
<div class="tabla-scroll"><table id="lista"><tr><th>Cuándo</th><th>Nombre</th><th>Matrícula</th><th>Evento</th><th>Tipo</th></tr></table></div>
${PUNTOS}
</main>
<script>
const TIPOS = ${jsonSeguro(TIPOS)};
const DATOS = ${jsonSeguro(datos)};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function copiar(url, btn) {
  navigator.clipboard.writeText(url).then(() => { btn.textContent = '✓ copiado'; setTimeout(() => btn.textContent = 'Copiar', 1500); });
}
function pinta() {
  const q = document.getElementById('fq').value.trim().toLowerCase();
  const t = document.getElementById('ftipo').value;
  const ev = document.getElementById('fev').value;
  const rows = DATOS.filter((d) => (!q || d.nombre.toLowerCase().includes(q) || d.mat.toLowerCase().includes(q))
    && (!t || d.tipo === t) && (!ev || d.ev === ev));
  const por = new Map();
  for (const d of rows) {
    const p = por.get(d.mat) ?? { nombre: d.nombre, mat: d.mat, evs: new Set(), tipos: new Set() };
    p.evs.add(d.ev); if (d.tipo) p.tipos.add(d.tipo); p.nombre = d.nombre; por.set(d.mat, p);
  }
  const rank = [...por.values()].sort((a, b) => b.evs.size - a.evs.size || a.nombre.localeCompare(b.nombre));
  const rk = document.getElementById('ranking');
  rk.querySelectorAll('tr:not(:first-child)').forEach((r) => r.remove());
  if (!rank.length) rk.insertAdjacentHTML('beforeend', '<tr><td colspan="5" class="vacio">Sin asistencias con estos filtros.</td></tr>');
  rank.slice(0, 15).forEach((p, i) => rk.insertAdjacentHTML('beforeend',
    '<tr><td>' + (i + 1) + '</td><td>' + esc(p.nombre) + '</td><td>' + esc(p.mat) + '</td><td class="num">' + p.evs.size + '</td><td>' +
    [...p.tipos].map((x) => TIPOS[x] ? '<span class="tipo" style="background:' + TIPOS[x].color + ';color:' + TIPOS[x].tinta + '">' + TIPOS[x].emoji + ' ' + TIPOS[x].nombre + '</span> ' : '').join('') + '</td></tr>'));
  const li = document.getElementById('lista');
  li.querySelectorAll('tr:not(:first-child)').forEach((r) => r.remove());
  rows.sort((a, b) => (a.ts < b.ts ? 1 : -1)).forEach((d) => li.insertAdjacentHTML('beforeend',
    '<tr><td>' + esc(new Date(d.ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })) + '</td><td>' + esc(d.nombre) + '</td><td>' + esc(d.mat) + '</td><td>' + esc(d.titulo) + '</td><td>' +
    (TIPOS[d.tipo] ? '<span class="tipo" style="background:' + TIPOS[d.tipo].color + ';color:' + TIPOS[d.tipo].tinta + '">' + TIPOS[d.tipo].emoji + ' ' + TIPOS[d.tipo].nombre + '</span>' : '') + '</td></tr>'));
}
for (const id of ['fq', 'ftipo', 'fev']) document.getElementById(id).addEventListener('input', pinta);
pinta();
</script></body></html>`;
}

export function renderCSV(evs: Evento[], asis: Asistencia[]): string {
  const enc = (s: string) => (/[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const idx = new Map(evs.map((e) => [e.id, e]));
  return ["fecha_registro,nombre,matricula,evento,tipo,fecha_evento,evento_id",
    ...asis.map((a) => {
      const e = idx.get(a.evento);
      return [a.ts, enc(a.nombre), a.matricula, enc(e?.titulo ?? ""),
              e ? TIPOS[e.tipo].nombre : "", e?.fecha ?? "", a.evento].join(",");
    })].join("\n");
}

export function renderQR(ev: Evento, svg: string, url: string): string {
  const t = TIPOS[ev.tipo];
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>QR · ${esc(ev.titulo)}</title>${FUENTE}
<style>${CSS_BASE} header{background:linear-gradient(140deg,${t.color},#2E4BC6 70%,#232D93)} main{max-width:520px;text-align:center}
.qr{background:#fff;border-radius:18px;padding:18px;display:inline-block;border:1px solid #E4E1D2} .qr svg{width:min(78vw,380px);height:auto;display:block}
.grande{font-size:22px;font-weight:800;margin:14px 0 4px}</style></head><body>
<header><p>${t.emoji} ${esc(t.nombre)} · ${esc(fechaBonita(ev.fecha))}</p><h1>${esc(ev.titulo)}</h1></header>
<main><div class="grande">Escanea y registra tu asistencia</div>
<p style="color:#6A6F98;font-size:13px;margin-bottom:14px">nombre + matrícula · 10 segundos</p>
<div class="qr">${svg}</div>
<p style="margin-top:12px;font-size:12px;color:#8A8FB5;word-break:break-all">${esc(url)}</p>${PUNTOS}</main></body></html>`;
}
