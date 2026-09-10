// Linktree de MIND servido desde aquí, para poder poner y quitar enlaces sin tocar código.
// La página pública vive en /enlaces y se administra desde /admin/enlaces.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { esc } from "./tareas";
import { conClave, navAdmin, NAV_CSS, INSTAGRAM, WHATSAPP_GRUPO } from "./ui";

export interface Enlace {
  id: string;
  titulo: string;
  sub?: string;          // renglón chico debajo del título
  url: string;
  emoji?: string;
  activo: boolean;
  creado: string;
}

const DIR = process.env.DATA_DIR ?? "/data";
const F_ENLACES = path.join(DIR, "enlaces.json");
const nuevoId = () => "e" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex");

/** Con lo que arranca el linktree la primera vez. Después manda lo que haya en disco. */
const SEMILLA: Omit<Enlace, "id" | "creado">[] = [
  { emoji: "🛍️", titulo: "Tienda MIND", sub: "Llaveros, fidgets y piezas impresas en 3D", url: "/", activo: true },
  { emoji: "🎨", titulo: "Convocatoria NeurArt", sub: "Registra tu obra para la expo", activo: true,
    url: "https://docs.google.com/forms/d/e/1FAIpQLSdcKatMhEEiM5lwC_jbRrH8hP-WmdERbMYkd21yLzOcvEaYAQ/viewform?usp=header" },
  { emoji: "🌿", titulo: "Preregistro NeuroCharla", sub: "Jueves 1 de octubre · aparta tu lugar", url: "/preregistro/8jxjtw", activo: true },
  { emoji: "🤝", titulo: "Convocatoria de coordis", sub: "Únete al staff de MIND", activo: true,
    url: "https://docs.google.com/forms/d/e/1FAIpQLSci7gfSSj63oFVL7nTmquaEUrxI3BfOweBkTp9widVYwOcoZg/viewform?usp=header" },
  { emoji: "💬", titulo: "Comunidad de WhatsApp", sub: "Entérate de todo lo que hacemos", url: WHATSAPP_GRUPO, activo: true },
  { emoji: "📸", titulo: "Instagram", sub: "@mindmty", url: INSTAGRAM, activo: true },
];

export function leerEnlaces(): Enlace[] {
  try { return JSON.parse(fs.readFileSync(F_ENLACES, "utf8")) as Enlace[]; } catch { /* aún no hay */ }
  return SEMILLA.map((e) => ({ ...e, id: nuevoId(), creado: new Date().toISOString() }));
}
export function guardarEnlaces(l: Enlace[]): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(F_ENLACES + ".tmp", JSON.stringify(l, null, 1));
  fs.renameSync(F_ENLACES + ".tmp", F_ENLACES);
}

/** Solo http(s) o rutas de la misma página: nada de javascript: ni data:. */
export const urlSegura = (u: string) => /^https?:\/\/\S+$/i.test(u) || /^\/[^\s]*$/.test(u);

export function crearEnlace(d: { titulo: string; sub?: string; url: string; emoji?: string }): Enlace {
  const l = leerEnlaces();
  const e: Enlace = { id: nuevoId(), titulo: d.titulo, url: d.url, activo: true,
                      ...(d.sub ? { sub: d.sub } : {}), ...(d.emoji ? { emoji: d.emoji } : {}),
                      creado: new Date().toISOString() };
  l.push(e);
  guardarEnlaces(l);
  return e;
}
export function editarEnlace(id: string, d: { titulo: string; sub?: string; url: string; emoji?: string }): Enlace | null {
  const l = leerEnlaces();
  const e = l.find((x) => x.id === id);
  if (!e) return null;
  e.titulo = d.titulo; e.url = d.url;
  if (d.sub) e.sub = d.sub; else delete e.sub;
  if (d.emoji) e.emoji = d.emoji; else delete e.emoji;
  guardarEnlaces(l);
  return e;
}
export function alternarEnlace(id: string): Enlace | null {
  const l = leerEnlaces();
  const e = l.find((x) => x.id === id);
  if (!e) return null;
  e.activo = !e.activo;
  guardarEnlaces(l);
  return e;
}
/** Lo sube o lo baja un lugar; el orden de la lista es el orden de la página. */
export function moverEnlace(id: string, dir: -1 | 1): Enlace | null {
  const l = leerEnlaces();
  const i = l.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const j = i + dir;
  if (j < 0 || j >= l.length) { guardarEnlaces(l); return l[i]; }
  [l[i], l[j]] = [l[j], l[i]];
  guardarEnlaces(l);
  return l[j];
}
export function borrarEnlace(id: string): Enlace | null {
  const l = leerEnlaces();
  const i = l.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [e] = l.splice(i, 1);
  guardarEnlaces(l);
  return e;
}

// ---------------- página pública ----------------
const CSS_PUBLICO = `
* { box-sizing:border-box; }
body { margin:0; min-height:100vh; font-family:Poppins,system-ui,-apple-system,sans-serif; color:#1C2260;
  background:linear-gradient(160deg,#29A3C7 0%,#2E4BC6 52%,#232D93 100%); padding:38px 18px 46px;
  display:flex; flex-direction:column; align-items:center; }
.marca { text-align:center; color:#fff; margin-bottom:6px; }
.marca h1 { margin:0; font-size:52px; font-weight:800; letter-spacing:5px; }
.marca p { margin:6px 0 0; font-size:14.5px; font-weight:600; opacity:.92; }
.marca small { display:block; margin-top:5px; font-size:12px; opacity:.75; letter-spacing:.4px; }
.puntos { display:flex; gap:7px; justify-content:center; margin:15px 0 26px; }
.puntos i { width:9px; height:9px; border-radius:50%; }
.lista { width:100%; max-width:430px; display:flex; flex-direction:column; gap:11px; }
.enlace { display:flex; align-items:center; gap:13px; background:#fff; border-radius:16px; padding:15px 17px;
  text-decoration:none; color:#1C2260; box-shadow:0 6px 18px rgba(16,22,66,.16); transition:transform .12s, box-shadow .12s; }
.enlace:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(16,22,66,.24); }
.enlace .emo { font-size:24px; line-height:1; flex:none; }
.enlace .txt { flex:1; min-width:0; }
.enlace b { display:block; font-size:15px; font-weight:700; }
.enlace span { display:block; font-size:12.5px; color:#6A6F98; margin-top:2px; }
.enlace .flecha { color:#A8ADC9; font-weight:700; flex:none; }
.vacio { background:rgba(255,255,255,.16); border:1px dashed rgba(255,255,255,.5); color:#fff;
  border-radius:16px; padding:22px; text-align:center; font-size:13.5px; }
footer { margin-top:30px; text-align:center; color:#fff; font-size:12px; opacity:.8; }
footer a { color:#fff; font-weight:700; }
`;
const DOTS = ["#8BC53F", "#F5C518", "#EC4899", "#C026D3", "#22B8CF"];

export function renderEnlacesPublico(l: Enlace[]): string {
  const vivos = l.filter((e) => e.activo);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>MIND · enlaces</title>
<meta name="description" content="Todo lo de MIND en un solo lugar: tienda, convocatorias, eventos y comunidad.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">
<style>${CSS_PUBLICO}</style></head><body>
<div class="marca">
  <h1>MIND</h1>
  <p>Celebramos la neurodiversidad</p>
  <small>LiFE Grupos Estudiantiles · Tec de Monterrey</small>
</div>
<div class="puntos">${DOTS.map((c) => `<i style="background:${c}"></i>`).join("")}</div>
${vivos.length ? `<div class="lista">${vivos.map((e) => {
  const fuera = /^https?:/i.test(e.url);
  return `<a class="enlace" href="${esc(e.url)}"${fuera ? ' target="_blank" rel="noopener"' : ""}>
    ${e.emoji ? `<span class="emo">${esc(e.emoji)}</span>` : ""}
    <span class="txt"><b>${esc(e.titulo)}</b>${e.sub ? `<span>${esc(e.sub)}</span>` : ""}</span>
    <span class="flecha">›</span></a>`;
}).join("")}</div>` : '<div class="vacio">Todavía no hay enlaces publicados.</div>'}
<footer>Hecho por MIND · <a href="${INSTAGRAM}" target="_blank" rel="noopener">@mindmty</a></footer>
</body></html>`;
}

// ---------------- página de administración ----------------
const CSS_ADMIN = `
* { box-sizing:border-box; }
body { margin:0; font-family:Poppins,system-ui,sans-serif; color:#1C2260; background:#F7F5EC; }
header { background:linear-gradient(135deg,#29A3C7,#2E4BC6 55%,#232D93); color:#fff; padding:20px 22px 26px; }
header h1 { margin:0; font-size:23px; font-weight:800; }
header p { margin:5px 0 0; font-size:13px; opacity:.9; }
main { max-width:900px; margin:-14px auto 40px; padding:0 18px; }
.caja { background:#fff; border:1px solid #E4E1D2; border-radius:16px; padding:18px 20px; margin-bottom:16px; }
h2 { font-size:15px; margin:0 0 12px; }
h2 small { font-weight:600; color:#6A6F98; font-size:12px; }
.fila-e { display:flex; align-items:center; gap:12px; padding:11px 0; border-bottom:1px solid #F0EDE0; }
.fila-e:last-child { border-bottom:0; }
.fila-e .emo { font-size:21px; flex:none; width:26px; text-align:center; }
.fila-e .txt { flex:1; min-width:0; }
.fila-e b { font-size:14px; }
.fila-e small { display:block; color:#6A6F98; font-size:12px; }
.fila-e code { display:block; font-size:11px; color:#8A8FB0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
.fila-e.off { opacity:.5; }
.acc-e { display:flex; gap:5px; flex:none; flex-wrap:wrap; justify-content:flex-end; }
.btn { font:inherit; font-size:12px; font-weight:700; border-radius:9px; padding:6px 11px; border:0; cursor:pointer;
  background:#2E4BC6; color:#fff; text-decoration:none; display:inline-block; }
.btn.sec { background:#EFEDE2; color:#1C2260; }
.btn.peligro { background:#FDE7EC; color:#C2255C; }
.btn.mini { padding:5px 8px; font-size:12px; }
form.rejilla { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:11px; }
label { display:block; font-size:11px; font-weight:700; color:#6A6F98; margin-bottom:4px; text-transform:uppercase; letter-spacing:.4px; }
input { width:100%; font:inherit; font-size:14px; padding:9px 11px; border:1.5px solid #DDD9C6; border-radius:10px; background:#FCFBF5; color:#1C2260; }
input:focus { outline:none; border-color:#2E4BC6; }
.ancho { grid-column:1/-1; }
.ok-aviso { background:#E9F7DF; border:1px solid #8BC53F; color:#33691E; border-radius:12px; padding:10px 14px; font-size:13px; font-weight:600; margin-bottom:14px; }
.mal-aviso { background:#FDE7EC; border:1px solid #F1A9BE; color:#C2255C; border-radius:12px; padding:10px 14px; font-size:13px; font-weight:600; margin-bottom:14px; }
.det { font-size:12.5px; color:#6A6F98; }
.det a { color:#2E4BC6; font-weight:700; }
`;

export function renderEnlacesAdmin(l: Enlace[], clave: string, aviso?: string, error?: string, editando?: Enlace): string {
  const q = conClave(clave);
  const campo = (n: string, et: string, v = "", extra = "") =>
    `<div${extra}><label>${et}</label><input name="${n}" value="${esc(v)}" ${n === "url" ? 'placeholder="https://… o /preregistro/xxxx"' : ""} ${n === "titulo" || n === "url" ? "required" : ""} maxlength="${n === "url" ? 400 : 80}"></div>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Enlaces · MIND</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">
<style>${CSS_ADMIN}${NAV_CSS}</style></head><body>
<header>${navAdmin(clave, "enlaces")}<h1>🔗 Enlaces de MIND</h1>
<p>Lo que sale en el linktree. Lo que muevas aquí se ve al instante en la página pública.</p></header>
<main>
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
${error ? `<div class="mal-aviso">${esc(error)}</div>` : ""}

<div class="caja">
  <h2>${editando ? "✏️ Editar enlace" : "➕ Agregar enlace"}</h2>
  <form class="rejilla" method="post" action="/admin/enlaces/${editando ? "editar" : "nuevo"}${q}">
    ${editando ? `<input type="hidden" name="id" value="${esc(editando.id)}">` : ""}
    <div style="max-width:110px"><label>Emoji</label><input name="emoji" value="${esc(editando?.emoji ?? "")}" maxlength="4" placeholder="🎨"></div>
    ${campo("titulo", "Título", editando?.titulo ?? "")}
    ${campo("sub", "Renglón chico", editando?.sub ?? "", ' class="ancho"')}
    ${campo("url", "Enlace", editando?.url ?? "", ' class="ancho"')}
    <div class="ancho" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" type="submit">${editando ? "Guardar cambios" : "Agregar"}</button>
      ${editando ? `<a class="btn sec" href="/admin/enlaces${q}">Cancelar</a>` : ""}
    </div>
  </form>
</div>

<div class="caja">
  <h2>En el linktree <small>${l.filter((e) => e.activo).length} visibles de ${l.length}</small></h2>
  ${l.length ? l.map((e, i) => `<div class="fila-e${e.activo ? "" : " off"}">
    <span class="emo">${esc(e.emoji ?? "🔗")}</span>
    <span class="txt"><b>${esc(e.titulo)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ""}<code>${esc(e.url)}</code></span>
    <span class="acc-e">
      <form method="post" action="/admin/enlaces/mover${q}" style="display:inline"><input type="hidden" name="id" value="${esc(e.id)}"><input type="hidden" name="dir" value="-1"><button class="btn sec mini" type="submit"${i === 0 ? " disabled" : ""} title="Subir">↑</button></form>
      <form method="post" action="/admin/enlaces/mover${q}" style="display:inline"><input type="hidden" name="id" value="${esc(e.id)}"><input type="hidden" name="dir" value="1"><button class="btn sec mini" type="submit"${i === l.length - 1 ? " disabled" : ""} title="Bajar">↓</button></form>
      <form method="post" action="/admin/enlaces/alternar${q}" style="display:inline"><input type="hidden" name="id" value="${esc(e.id)}"><button class="btn sec mini" type="submit">${e.activo ? "Ocultar" : "Mostrar"}</button></form>
      <a class="btn sec mini" href="/admin/enlaces${q}&editar=${esc(e.id)}">Editar</a>
      <a class="btn peligro mini" href="/admin/enlaces/borrar${q}&id=${esc(e.id)}">Borrar</a>
    </span></div>`).join("") : '<p class="det">Todavía no hay enlaces.</p>'}
  <p class="det" style="margin-top:14px">Así se ve: <a href="/enlaces" target="_blank" rel="noopener">/enlaces ↗</a></p>
</div>
</main></body></html>`;
}

export function renderBorrarEnlace(e: Enlace, clave: string): string {
  const q = conClave(clave);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>¿Borrar enlace?</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">
<style>${CSS_ADMIN}</style></head><body>
<header><h1>¿Estás seguro?</h1><p>Vas a quitar este enlace del linktree.</p></header>
<main><div class="caja">
  <div class="fila-e"><span class="emo">${esc(e.emoji ?? "🔗")}</span>
    <span class="txt"><b>${esc(e.titulo)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ""}<code>${esc(e.url)}</code></span></div>
  <p class="det">Si nada más quieres esconderlo un rato, mejor usa <b>Ocultar</b>: así lo puedes volver a prender después.</p>
  <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
    <form method="post" action="/admin/enlaces/borrar${q}"><input type="hidden" name="id" value="${esc(e.id)}">
      <button class="btn peligro" type="submit">Sí, borrarlo</button></form>
    <a class="btn sec" href="/admin/enlaces${q}">No, regresar</a>
  </div>
</div></main></body></html>`;
}
