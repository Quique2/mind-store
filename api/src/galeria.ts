// Galería de MIND: fotos y videos de los eventos, subidos desde PC o celular al
// disco persistente (/data/galeria), más enlaces de YouTube / Google Drive.
// Ver es público (para compartir); subir y borrar requieren la clave.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { TIPOS, fechaBonita, type Evento } from "./eventos";
import { NAV_CSS, TABS_CSS, navAdmin, tabsEventos } from "./ui";

export interface Item {
  id: string;
  tipo: "foto" | "video" | "enlace";
  evento: string;        // id del evento o "" (sin evento)
  titulo: string;        // pie de foto (opcional)
  archivo?: string;      // nombre en /data/galeria (foto/video)
  miniatura?: string;    // nombre de la miniatura (jpg) o URL externa (enlaces)
  url?: string;          // enlace original (YouTube / Drive / otro)
  embed?: string;        // URL para <iframe> (YouTube / Drive)
  mime?: string;
  bytes?: number;
  creado: string;        // ISO
}

const DIR = process.env.DATA_DIR ?? "/data";
export const DIR_GALERIA = path.join(DIR, "galeria");
const F_GAL = path.join(DIR, "galeria.json");

export const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};
export const LIMITE_MB = 80;

export function leerGaleria(): Item[] {
  try { return JSON.parse(fs.readFileSync(F_GAL, "utf8")) as Item[]; } catch { return []; }
}
function escribir(lista: Item[]): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(F_GAL + ".tmp", JSON.stringify(lista, null, 1));
  fs.renameSync(F_GAL + ".tmp", F_GAL);
}
export const nuevoId = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
export const nombreSeguro = (n: string) => /^[a-z0-9]+(_t)?\.[a-z0-9]{2,5}$/.test(n);

export function agregarItem(item: Item): void {
  const lista = leerGaleria();
  lista.push(item);
  escribir(lista);
}

export function borrarItem(id: string): Item | null {
  const lista = leerGaleria();
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [item] = lista.splice(i, 1);
  escribir(lista);
  for (const n of [item.archivo, item.tipo === "enlace" ? undefined : item.miniatura]) {
    if (n && nombreSeguro(n)) { try { fs.unlinkSync(path.join(DIR_GALERIA, n)); } catch { /* ya no está */ } }
  }
  return item;
}

/** YouTube y Google Drive se pueden incrustar y tienen miniatura; el resto solo abre en pestaña nueva. */
export function infoEnlace(url: string): { embed?: string; miniatura?: string; proveedor: string } {
  const yt = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{6,})/);
  if (yt) {
    return { proveedor: "YouTube", embed: `https://www.youtube.com/embed/${yt[1]}`,
             miniatura: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` };
  }
  const carpeta = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/);
  if (carpeta) return { proveedor: "Carpeta de Drive" };
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([A-Za-z0-9_-]+)/) ??
                url.match(/drive\.google\.com\/.*[?&]id=([A-Za-z0-9_-]+)/);
  if (drive) {
    return { proveedor: "Google Drive", embed: `https://drive.google.com/file/d/${drive[1]}/preview`,
             miniatura: `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w480` };
  }
  return { proveedor: "Enlace" };
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const jsonSeguro = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

const CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#F7F5EC; color:#1C2260; font-family:'Poppins','Segoe UI',system-ui,sans-serif; }
header { background:linear-gradient(140deg,#EC4899,#2E4BC6 60%,#232D93); color:#fff; padding:28px 22px; }
header h1 { font-size:24px; font-weight:800; }
header p { font-size:12.5px; color:#F5D6E6; margin-top:2px; }
main { max-width:1040px; margin:0 auto; padding:20px 18px 70px; }
h2 { font-size:16px; font-weight:800; margin:22px 0 10px; }
.tarjeta { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:16px; }
label { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; display:block; margin-bottom:4px; }
input, select { width:100%; font:inherit; font-size:15px; padding:10px 12px; border:1.5px solid #DDD9C6; border-radius:10px; background:#FCFBF5; color:#1C2260; min-height:44px; }
input:focus, select:focus { outline:2px solid #2E4BC6; outline-offset:1px; border-color:#2E4BC6; }
.fila { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }
.btn { font:inherit; font-weight:800; font-size:14px; color:#fff; background:#2E4BC6; border:none; border-radius:999px; padding:12px 20px; min-height:46px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
.btn:hover { background:#232D93; } .btn:disabled { opacity:.6; cursor:default; }
.btn.sec { background:#EFEDDF; color:#1C2260; border:1.5px solid #DDD9C6; font-weight:600; font-size:13px; padding:9px 14px; min-height:40px; }
.btn.sec:hover { background:#E2DFCB; }
.ok-aviso { background:#E8F3D9; border:1px solid #BEDD97; border-radius:10px; padding:10px 14px; font-size:13px; margin:0 0 14px; color:#3F6B10; font-weight:600; }
.zona { border:2px dashed #29A3C7; border-radius:14px; padding:22px 16px; text-align:center; background:#F4FBFD; cursor:pointer; margin-top:10px; }
.zona.arrastrando { background:#DDF1F8; }
.zona b { display:block; font-size:15px; } .zona span { font-size:12.5px; color:#6A6F98; }
.zona input { display:none; }
#progreso { display:grid; gap:6px; margin-top:10px; font-size:12.5px; }
.barra { height:8px; background:#EFEDE0; border-radius:999px; overflow:hidden; }
.barra i { display:block; height:100%; background:linear-gradient(90deg,#29A3C7,#2E4BC6); width:0; transition:width .2s; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 6px; }
.chips a { font-size:12.5px; font-weight:600; color:#1C2260; background:#fff; border:1.5px solid #DDD9C6; border-radius:999px; padding:7px 13px; text-decoration:none; }
.chips a.actual { background:#1C2260; color:#fff; border-color:#1C2260; }
.cuenta { font-size:12.5px; color:#6A6F98; margin-bottom:10px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
@media (max-width:480px) { .grid { grid-template-columns:repeat(2,1fr); gap:6px; } }
.item { position:relative; background:#fff; border:1px solid #E4E1D2; border-radius:12px; overflow:hidden; cursor:pointer; }
.item .mini { aspect-ratio:1; width:100%; object-fit:cover; display:block; background:#EFEDE0; }
.item .mini.sin { display:flex; align-items:center; justify-content:center; font-size:42px; }
.item .pie { padding:7px 9px 9px; font-size:12px; line-height:1.35; }
.item .pie b { display:block; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.item .pie small { color:#8A8FB5; font-size:11px; }
.item .tipo { position:absolute; top:7px; left:7px; font-size:11px; font-weight:800; background:rgba(28,34,96,.85); color:#fff; border-radius:999px; padding:2px 8px; }
.item .del { position:absolute; top:6px; right:6px; }
.item .del button { font:inherit; font-size:13px; line-height:1; color:#A03434; background:#FBECEC; border:1px solid #F0CFCF; border-radius:8px; width:28px; height:28px; cursor:pointer; }
.vacio { color:#8A8FB5; font-size:13px; padding:30px 10px; text-align:center; background:#fff; border:1px dashed #DDD9C6; border-radius:14px; }
#luz { position:fixed; inset:0; background:rgba(12,14,40,.94); display:none; align-items:center; justify-content:center; z-index:50; flex-direction:column; }
#luz.abierta { display:flex; }
#luz .marco { max-width:96vw; max-height:82vh; display:flex; align-items:center; justify-content:center; }
#luz img, #luz video { max-width:96vw; max-height:82vh; border-radius:8px; }
#luz iframe { width:min(96vw,960px); height:min(82vh,540px); border:0; border-radius:8px; background:#000; }
#luz .pie { color:#fff; font-size:14px; margin-top:12px; text-align:center; max-width:90vw; }
#luz .pie small { color:#B9C4E8; display:block; font-size:12px; margin-top:2px; }
#luz .pie a { color:#8BC53F; font-weight:700; }
#luz button { position:absolute; font:inherit; font-size:26px; color:#fff; background:rgba(255,255,255,.14); border:none; border-radius:50%; width:46px; height:46px; cursor:pointer; }
#luz .cerrar { top:14px; right:14px; } #luz .ant { left:10px; top:50%; } #luz .sig { right:10px; top:50%; }
.puntos { display:flex; gap:8px; justify-content:center; margin-top:28px; }
.puntos i { width:9px; height:9px; border-radius:50%; display:block; }
footer { font-size:11.5px; color:#8A8FB5; margin-top:14px; text-align:center; }
${NAV_CSS}${TABS_CSS}`;

export function renderGaleria(items: Item[], eventos: Evento[], clave: string | null,
                              filtro: string, base: string, aviso?: string): string {
  const admin = clave !== null;
  const q = admin ? `?clave=${encodeURIComponent(clave)}` : "";
  const evIdx = new Map(eventos.map((e) => [e.id, e]));
  const evOrden = [...eventos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const visibles = items.filter((it) => filtro === "" || (filtro === "sin" ? !it.evento : it.evento === filtro))
                        .sort((a, b) => (a.creado < b.creado ? 1 : -1));
  const conItems = new Set(items.map((it) => it.evento));
  const src = (it: Item) => it.tipo === "enlace" ? (it.embed ?? it.url ?? "") : `/galeria/archivo/${it.archivo}`;
  const mini = (it: Item) => {
    if (it.tipo === "enlace") return it.miniatura ? `<img class="mini" src="${esc(it.miniatura)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;mini sin&quot;>🔗</div>'">` : '<div class="mini sin">🔗</div>';
    if (it.miniatura) return `<img class="mini" src="/galeria/archivo/${esc(it.miniatura)}" alt="" loading="lazy">`;
    return it.tipo === "foto" ? `<img class="mini" src="/galeria/archivo/${esc(it.archivo ?? "")}" alt="" loading="lazy">` : '<div class="mini sin">🎬</div>';
  };
  const chip = (valor: string, texto: string) =>
    `<a href="/galeria?${valor ? `evento=${encodeURIComponent(valor)}&` : ""}${admin ? `clave=${encodeURIComponent(clave)}` : ""}"${filtro === valor ? ' class="actual"' : ""}>${texto}</a>`;
  const chips = [chip("", "Todo"),
    ...evOrden.filter((e) => conItems.has(e.id)).map((e) => chip(e.id, `${TIPOS[e.tipo].emoji} ${esc(e.titulo)}`)),
    ...(conItems.has("") ? [chip("sin", "Sin evento")] : [])].join("");
  const tarjetas = visibles.map((it, i) => {
    const e = evIdx.get(it.evento);
    return `<figure class="item" data-i="${i}" onclick="abrir(${i})">
  ${mini(it)}
  <span class="tipo">${it.tipo === "foto" ? "📷" : it.tipo === "video" ? "🎬" : "🔗"}</span>
  ${admin ? `<form class="del" method="post" action="/galeria/borrar${q}" onclick="event.stopPropagation()" onsubmit="return confirm('¿Borrar este elemento de la galería?')"><input type="hidden" name="id" value="${esc(it.id)}"><button type="submit" title="Borrar">✕</button></form>` : ""}
  <figcaption class="pie"><b>${esc(it.titulo || (e ? e.titulo : it.tipo === "enlace" ? "Enlace" : "Sin título"))}</b><small>${e ? esc(fechaBonita(e.fecha)) : esc(fechaBonita(it.creado.slice(0, 10)))}</small></figcaption>
</figure>`;
  }).join("\n");
  const datos = visibles.map((it) => ({
    tipo: it.tipo, src: src(it), url: it.url ?? "", embed: Boolean(it.embed), titulo: it.titulo,
    evento: evIdx.get(it.evento)?.titulo ?? "", fecha: fechaBonita((evIdx.get(it.evento)?.fecha ?? it.creado).slice(0, 10)),
  }));
  const opcionesEv = (sel: string) => `<option value=""${sel === "" ? " selected" : ""}>Sin evento</option>` +
    evOrden.map((e) => `<option value="${esc(e.id)}"${e.id === sel ? " selected" : ""}>${esc(fechaBonita(e.fecha))} · ${esc(e.titulo)}</option>`).join("");
  const preSel = filtro && filtro !== "sin" ? filtro : (evOrden[0]?.id ?? "");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Galería MIND</title>
<meta property="og:title" content="Galería MIND"><meta property="og:description" content="Fotos y videos de los eventos de MIND">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">
<style>${CSS}</style></head><body>
<header>${admin ? navAdmin(clave, "eventos") : ""}<h1>Galería MIND</h1><p>Fotos y videos de nuestros eventos · ${items.length} elemento${items.length === 1 ? "" : "s"}</p>${tabsEventos(clave, "galeria")}</header>
<main>
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
${admin ? `<h2>Subir fotos y videos</h2>
<div class="tarjeta" id="subir">
  <div class="fila">
    <div><label for="ev-subir">Evento</label><select id="ev-subir">${opcionesEv(preSel)}</select></div>
    <div><label for="titulo-subir">Pie de foto (opcional)</label><input id="titulo-subir" maxlength="80" placeholder="p. ej. Stand en el patio"></div>
  </div>
  <label class="zona" id="zona"><b>📷 Toca para elegir fotos o videos</b><span>o arrástralos aquí · varios a la vez · las fotos se comprimen en tu dispositivo antes de subir · videos hasta ${LIMITE_MB} MB</span>
    <input type="file" id="archivos" multiple accept="image/*,video/*"></label>
  <div id="progreso"></div>
</div>
<div class="tarjeta" style="margin-top:10px">
  <form method="post" action="/galeria/enlace${q}" class="fila" style="align-items:end">
    <div style="grid-column:span 2"><label for="url">Enlace de YouTube o Google Drive (videos largos o carpetas)</label><input id="url" name="url" type="url" required placeholder="https://youtu.be/… o https://drive.google.com/…"></div>
    <div><label>Evento</label><select name="evento">${opcionesEv(preSel)}</select></div>
    <div><label for="turl">Título (opcional)</label><input id="turl" name="titulo" maxlength="80" placeholder="p. ej. Video resumen"></div>
    <div><button class="btn" type="submit" style="width:100%">Agregar enlace</button></div>
  </form>
  <p class="cuenta" style="margin:8px 0 0">Para Drive, el archivo o carpeta debe estar compartido como «Cualquiera con el enlace».</p>
</div>` : ""}
<div class="chips">${chips}</div>
<p class="cuenta">${visibles.length} elemento${visibles.length === 1 ? "" : "s"}${admin ? ` · enlace público para compartir: <a href="${esc(base)}/galeria${filtro ? `?evento=${encodeURIComponent(filtro)}` : ""}" style="color:#2E4BC6;font-weight:600">${esc(base)}/galeria${filtro ? `?evento=${esc(filtro)}` : ""}</a>` : ""}</p>
${visibles.length ? `<div class="grid">${tarjetas}</div>` : `<div class="vacio">Todavía no hay fotos aquí.${admin ? " Súbelas arriba desde tu celular o computadora." : ""}</div>`}
<div class="puntos"><i style="background:#8BC53F"></i><i style="background:#F5C518"></i><i style="background:#EC4899"></i><i style="background:#C026D3"></i><i style="background:#22B8CF"></i></div>
<footer>MIND · LiFE Grupos Estudiantiles · @mindmty</footer>
</main>
<div id="luz" role="dialog" aria-modal="true"><button class="cerrar" onclick="cerrar()" aria-label="Cerrar">✕</button><button class="ant" onclick="mover(-1)" aria-label="Anterior">‹</button><button class="sig" onclick="mover(1)" aria-label="Siguiente">›</button><div class="marco" id="marco"></div><div class="pie" id="luz-pie"></div></div>
<script>
const D = ${jsonSeguro(datos)};
const CLAVE = ${jsonSeguro(clave ?? "")};
const LIMITE = ${LIMITE_MB} * 1024 * 1024;
let actual = -1;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function abrir(i) {
  const it = D[i]; if (!it) return;
  if (it.tipo === 'enlace' && !it.embed) { window.open(it.url, '_blank', 'noopener'); return; }
  actual = i;
  const m = document.getElementById('marco');
  m.innerHTML = it.tipo === 'foto' ? '<img src="' + esc(it.src) + '" alt="">'
    : it.tipo === 'video' ? '<video src="' + esc(it.src) + '" controls autoplay playsinline></video>'
    : '<iframe src="' + esc(it.src) + '" allow="autoplay; fullscreen" allowfullscreen></iframe>';
  document.getElementById('luz-pie').innerHTML = esc(it.titulo || it.evento || '') + '<small>' + esc(it.evento ? it.evento + ' · ' : '') + esc(it.fecha) +
    (it.tipo !== 'enlace' ? ' · <a href="' + esc(it.src) + '" download target="_blank" rel="noopener">descargar original</a>' : ' · <a href="' + esc(it.url) + '" target="_blank" rel="noopener">abrir enlace</a>') + '</small>';
  document.getElementById('luz').classList.add('abierta');
  document.body.style.overflow = 'hidden';
}
function cerrar() { document.getElementById('luz').classList.remove('abierta'); document.getElementById('marco').innerHTML = ''; document.body.style.overflow = ''; actual = -1; }
function mover(d) { if (actual < 0) return; let i = actual; for (let k = 0; k < D.length; k++) { i = (i + d + D.length) % D.length; if (D[i].tipo !== 'enlace' || D[i].embed) { abrir(i); return; } } }
document.addEventListener('keydown', (e) => { if (actual < 0) return; if (e.key === 'Escape') cerrar(); if (e.key === 'ArrowRight') mover(1); if (e.key === 'ArrowLeft') mover(-1); });
document.getElementById('luz').addEventListener('click', (e) => { if (e.target.id === 'luz') cerrar(); });

// ---- subida (solo con clave): las fotos se comprimen aquí, los videos van tal cual con miniatura ----
async function aBlob(canvas, calidad) { return new Promise((r) => canvas.toBlob(r, 'image/jpeg', calidad)); }
function escalar(w, h, max) { const f = Math.min(1, max / Math.max(w, h)); return [Math.round(w * f), Math.round(h * f)]; }
async function comprimirFoto(file, max, calidad) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const [w, h] = escalar(bmp.width, bmp.height, max);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  return aBlob(c, calidad);
}
function posterVideo(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'metadata';
    const url = URL.createObjectURL(file);
    const fin = (b) => { URL.revokeObjectURL(url); resolve(b); };
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (e) { fin(null); } };
    v.onseeked = async () => { try { const [w, h] = escalar(v.videoWidth, v.videoHeight, 480); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h); fin(await aBlob(c, .8)); } catch (e) { fin(null); } };
    v.onerror = () => fin(null);
    v.src = url;
  });
}
function enviar(fd, onProgreso) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/galeria/subir?clave=' + encodeURIComponent(CLAVE));
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgreso(e.loaded / e.total); };
    x.onload = () => { try { const r = JSON.parse(x.responseText); r.ok ? resolve(r) : reject(new Error(r.error || 'error')); } catch (e) { reject(new Error('respuesta inválida (' + x.status + ')')); } };
    x.onerror = () => reject(new Error('sin conexión'));
    x.send(fd);
  });
}
async function subirTodo(files) {
  const prog = document.getElementById('progreso');
  const evento = document.getElementById('ev-subir').value;
  const titulo = document.getElementById('titulo-subir').value;
  let ok = 0;
  for (const file of files) {
    const fila = document.createElement('div');
    fila.innerHTML = '<div>' + esc(file.name) + ' <span class="est">preparando…</span></div><div class="barra"><i></i></div>';
    prog.appendChild(fila);
    const est = fila.querySelector('.est'), barra = fila.querySelector('i');
    try {
      const fd = new FormData();
      fd.append('evento', evento); fd.append('titulo', titulo);
      if (file.type.startsWith('image/')) {
        let grande = null;
        try { grande = await comprimirFoto(file, 1920, .86); } catch (e) { grande = null; }
        const mini = grande ? await comprimirFoto(file, 480, .8) : null;
        fd.append('archivo', grande || file, grande ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name);
        if (mini) fd.append('miniatura', mini, 'mini.jpg');
      } else if (file.type.startsWith('video/')) {
        if (file.size > LIMITE) throw new Error('pasa de ' + (LIMITE / 1048576) + ' MB: súbelo a Drive o YouTube y pega el enlace');
        const mini = await posterVideo(file);
        fd.append('archivo', file, file.name);
        if (mini) fd.append('miniatura', mini, 'mini.jpg');
      } else throw new Error('solo fotos o videos');
      est.textContent = 'subiendo…';
      await enviar(fd, (p) => { barra.style.width = Math.round(p * 100) + '%'; });
      barra.style.width = '100%'; est.textContent = '✓ listo'; ok++;
    } catch (e) { est.textContent = '✗ ' + e.message; est.style.color = '#A03434'; }
  }
  if (ok) setTimeout(() => { location.href = '/galeria?clave=' + encodeURIComponent(CLAVE) + (evento ? '&evento=' + encodeURIComponent(evento) : '') + '&ok=' + encodeURIComponent('✓ ' + ok + ' archivo' + (ok === 1 ? '' : 's') + ' subido' + (ok === 1 ? '' : 's')); }, 600);
}
const inp = document.getElementById('archivos');
if (inp) {
  inp.addEventListener('change', () => { if (inp.files.length) subirTodo([...inp.files]); inp.value = ''; });
  const zona = document.getElementById('zona');
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastrando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastrando'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('arrastrando'); if (e.dataTransfer.files.length) subirTodo([...e.dataTransfer.files]); });
}
</script></body></html>`;
}
