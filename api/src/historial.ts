// Historial de tableros: una foto del tablero por semana, para poder volver a verla.
// Se guarda sola al cerrar la semana, y los tableros viejos se cargan a mano.
import fs from "node:fs";
import path from "node:path";
import { areaDe, iniciales, leerAreas, nombreCorto, puedeAsignar, staffActivo, leerStaff,
         dirigeArea, esPresidencia, type Area, type Persona } from "./staff";
import { esAbierta, esc, jsonSeguro, paginaPortal, leerTareas, quienes, rangoSemana,
         semanaActual, lunesDe, ESTADOS, type Tarea } from "./tareas";
import { navPortal, CSS_PANEL, CSS_CAL, CSS_KANBAN } from "./portal";
import type { EventoLite } from "./portal";

export interface TareaFoto {
  titulo: string;
  area: string;              // id de área, "" si no tenía
  quienes: string[];         // matrículas
  estado: "pendiente" | "curso" | "hecha" | "vencida";
  detalle?: string;
  vigencia?: { tipo: "fechas" | "transversal" | "evento"; inicio?: string; fin?: string; evento?: string };
}
export interface Tablero {
  semana: string;            // lunes de esa semana
  guardado: string;          // ISO
  origen: "cierre" | "cargado";
  nota?: string;
  editadoPor?: string;       // matricula de quien la retoco a mano
  editadoEl?: string;        // ISO
  tareas: TareaFoto[];
}

const DIR = process.env.DATA_DIR ?? "/data";
const F_HIST = path.join(DIR, "tableros.json");

export function leerTableros(): Tablero[] {
  try {
    return (JSON.parse(fs.readFileSync(F_HIST, "utf8")) as Tablero[])
      .sort((a, b) => (a.semana < b.semana ? 1 : -1));
  } catch { return []; }
}
function guardar(l: Tablero[]): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(F_HIST + ".tmp", JSON.stringify(l, null, 1));
  fs.renameSync(F_HIST + ".tmp", F_HIST);
}
/** Guarda (o reemplaza) la foto de una semana. */
export function guardarTablero(t: Tablero): void {
  const l = leerTableros().filter((x) => x.semana !== t.semana);
  l.push(t);
  guardar(l);
}
/** Foto del tablero tal como está ahora mismo. */
export function fotoActual(origen: Tablero["origen"] = "cierre", semana = semanaActual()): Tablero {
  return {
    semana, guardado: new Date().toISOString(), origen,
    tareas: leerTareas().map((t) => ({
      titulo: t.titulo, area: t.area, quienes: [...t.asignados], estado: t.estado,
      ...(t.detalle ? { detalle: t.detalle } : {}),
      vigencia: { ...t.vigencia },
    })),
  };
}

/** Normaliza un título para comparar entre semanas: sin acentos, sin paréntesis, sin ruido. */
export const clave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
   .toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9 ]/g, " ")
   .replace(/\s+/g, " ").trim();

export interface Arrastre { titulo: string; semanas: string[]; area: string; viva: boolean }
/** Tareas que aparecen en varias semanas seguidas: lo que se está atorando. */
export function arrastres(tableros: Tablero[], vivas: Tarea[]): Arrastre[] {
  const mapa = new Map<string, Arrastre>();
  for (const tb of [...tableros].sort((a, b) => (a.semana < b.semana ? -1 : 1))) {
    for (const t of tb.tareas) {
      const k = clave(t.titulo);
      if (!k) continue;
      const a = mapa.get(k) ?? { titulo: t.titulo, semanas: [], area: t.area, viva: false };
      if (!a.semanas.includes(tb.semana)) a.semanas.push(tb.semana);
      a.titulo = t.titulo;
      if (t.area) a.area = t.area;
      mapa.set(k, a);
    }
  }
  const vivasK = new Set(vivas.filter(esAbierta).map((t) => clave(t.titulo)));
  for (const [k, a] of mapa) a.viva = vivasK.has(k);
  return [...mapa.values()].filter((a) => a.semanas.length > 1)
    .sort((a, b) => b.semanas.length - a.semanas.length || a.titulo.localeCompare(b.titulo));
}

/** Cuántas tareas cerró cada quien según los tableros: si estaba en una semana
 *  y ya no en la siguiente, se dio por cerrada. Es lo único que dicen las láminas. */
export function cierresHistoricos(tableros: Tablero[], desde = "0000-00-00"): Map<string, number> {
  const orden = [...tableros].sort((a, b) => (a.semana < b.semana ? -1 : 1));
  const out = new Map<string, number>();
  for (let i = 0; i < orden.length - 1; i++) {
    if (orden[i + 1].semana < desde) continue;    // se cerró antes del periodo que se está mirando
    const siguientes = new Set(orden[i + 1].tareas.map((t) => clave(t.titulo)));
    for (const t of orden[i].tareas) {
      if (siguientes.has(clave(t.titulo))) continue;    // sigue viva: no se cerró
      for (const m of t.quienes) out.set(m, (out.get(m) ?? 0) + 1);
    }
  }
  return out;
}

/** Los cierres de las láminas viejas, contando también lo que ya salió del tablero de hoy. */
export function cierresConActual(desde?: string): Map<string, number> {
  const hoy = fotoActual("cierre");
  return cierresHistoricos([hoy, ...leerTableros().filter((t) => t.semana !== hoy.semana)], desde);
}

// ---------------- página ----------------
export function renderHistorial(p: Persona, tableros: Tablero[], sel?: string, aviso?: string): string {
  const areas = leerAreas();
  const staff = leerStaff();
  const vivas = leerTareas();
  const nombre = (m: string) => {
    const s = staff.find((x) => x.matricula === m);
    return s ? nombreCorto(s) : m;
  };
  const actual: Tablero = { ...fotoActual("cierre"), nota: "En curso" };
  const todos = [actual, ...tableros.filter((t) => t.semana !== actual.semana)];
  const elegido = todos.find((t) => t.semana === sel) ?? todos[0];
  const arr = arrastres(todos, vivas);
  const cierres = cierresHistoricos(todos);   // incluye la semana en curso para cerrar la cadena

  const chips = todos.map((t) => {
    const abiertas = t.tareas.filter((x) => x.estado === "pendiente" || x.estado === "curso").length;
    return `<a href="/tareas/historial?semana=${esc(t.semana)}"${t.semana === elegido.semana ? ' class="actual"' : ""}>
      ${esc(rangoSemana(t.semana).replace(/ de \d{4}$/, ""))}<small>${t.tareas.length} tareas${t.semana === actual.semana ? " · en curso" : ""}</small></a>`;
  }).join("");

  const porArea = areas.map((a) => ({
    a, suyas: elegido.tareas.filter((t) => t.area === a.id),
  })).filter((x) => x.suyas.length);
  const sinArea = elegido.tareas.filter((t) => !areas.some((a) => a.id === t.area));
  const bloque = (a: Area | null, suyas: TareaFoto[]) => `<section class="bloque">
    <h3><span class="punto" style="background:${a ? a.color : "#6A6F98"}"></span>${a ? esc(a.emoji + " " + a.nombre) : "Sin área"} <small>${suyas.length}</small></h3>
    ${suyas.map((t) => `<div class="linea-h estado-${t.estado}">
      <span class="tic">${t.estado === "hecha" ? "✓" : t.estado === "vencida" ? "✕" : "•"}</span>
      <span class="txt">${esc(t.titulo)}${t.quienes.length ? ` <i>(${esc(t.quienes.map(nombre).join(", "))})</i>` : ' <i>(TODOS)</i>'}</span>
    </div>`).join("")}
  </section>`;

  const cuentaEstados = (e: string) => elegido.tareas.filter((t) => t.estado === e).length;
  const tablaCierres = [...cierres.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => {
    const s = staff.find((x) => x.matricula === m);
    return `<tr><td>${s ? `<span class="ava" style="--c:${areaDe(s, areas).color}">${esc(iniciales(s))}</span> ${esc(s.nombre)}` : esc(m)}</td>
      <td class="num"><b>${n}</b></td></tr>`;
  }).join("");

  const cuerpo = `
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<div class="vistas">
  <a class="actual" href="/tareas/historial?semana=${esc(elegido.semana)}">👁️ Vista bonita</a>
  ${elegido.semana === actual.semana
    ? `<a href="/tareas">✏️ Editar en el tablero</a>`
    : `<a href="/tareas/historial?semana=${esc(elegido.semana)}&modo=editar">✏️ Editar</a>`}
</div>
<div class="semanas">${chips}</div>

<div class="cab-tablero">
  <div><h2 style="margin:0">Semana del ${esc(rangoSemana(elegido.semana))}</h2>
    <p class="det">${elegido.tareas.length} tareas · ${cuentaEstados("hecha")} hechas · ${cuentaEstados("vencida")} vencidas${elegido.origen === "cargado" ? " · cargado de la lámina de esa semana" : elegido.semana === actual.semana ? " · así va ahora mismo" : " · foto tomada al cerrar la semana"}${elegido.editadoPor ? ` · retocada por ${esc(nombre(elegido.editadoPor))}` : ""}</p></div>
  <button class="btn sec" type="button" onclick="descargar()">⬇ Descargar imagen</button>
</div>
<div class="tablero-h">
  ${porArea.map((x) => bloque(x.a, x.suyas)).join("")}
  ${sinArea.length ? bloque(null, sinArea) : ""}
</div>

${arr.length ? `<h2>Lo que se está arrastrando <small>aparece en más de una semana</small></h2>
<div class="scroll"><table class="arr">
<tr><th>Tarea</th><th class="num">Semanas</th><th>Desde</th><th>Hoy</th></tr>
${arr.slice(0, 25).map((a) => {
  const ar = areas.find((x) => x.id === a.area);
  return `<tr><td>${ar ? `<span class="chip" style="background:${ar.color};color:${ar.tinta}">${ar.emoji}</span> ` : ""}${esc(a.titulo)}</td>
    <td class="num"><b>${a.semanas.length}</b></td>
    <td>${esc(rangoSemana(a.semanas[0]).replace(/ de \d{4}$/, ""))}</td>
    <td>${a.viva ? '<span class="chip viva">sigue abierta</span>' : '<span class="chip cerrada">ya cerró</span>'}</td></tr>`;
}).join("")}
</table></div>` : ""}

${tablaCierres ? `<h2>Tareas cerradas según las láminas <small>de las semanas cargadas</small></h2>
<div class="scroll"><table class="arr"><tr><th>Persona</th><th class="num">Cerradas</th></tr>${tablaCierres}</table></div>
<p class="det">Se cuenta cuando una tarea aparece en una lámina y ya no en la siguiente. Las que no traían nombre no se le acreditan a nadie.</p>` : ""}

<canvas id="lienzo" hidden></canvas>
<script>
const T = ${jsonSeguro({
  semana: rangoSemana(elegido.semana),
  areas: [...porArea.map((x) => ({ nombre: x.a.nombre.toUpperCase(), color: x.a.color,
            tareas: x.suyas.map((t) => ({ texto: t.titulo, quien: t.quienes.map(nombre).join(", ") || "TODOS", estado: t.estado })) })),
          ...(sinArea.length ? [{ nombre: "SIN ÁREA", color: "#6A6F98",
            tareas: sinArea.map((t) => ({ texto: t.titulo, quien: t.quienes.map(nombre).join(", ") || "TODOS", estado: t.estado })) }] : [])],
})};
function dibuja() {
  const c = document.getElementById('lienzo'), x = c.getContext('2d');
  const A = 1400, M = 70, COLS = 2, anchoCol = (A - M * 2 - 50) / COLS;
  const medir = (txt, fuente, ancho) => {
    x.font = fuente;
    const out = []; let linea = '';
    for (const p of txt.split(' ')) {
      const t = linea ? linea + ' ' + p : p;
      if (x.measureText(t).width > ancho && linea) { out.push(linea); linea = p; } else linea = t;
    }
    if (linea) out.push(linea);
    return out;
  };
  const bloques = T.areas.map((g) => {
    const items = g.tareas.map((t) => ({ lineas: medir((t.estado === 'hecha' ? '✓  ' : '•  ') + t.texto + '  (' + t.quien + ')', '400 25px Poppins, sans-serif', anchoCol - 16), estado: t.estado }));
    return { g, items, alto: 58 + items.reduce((s, i) => s + i.lineas.length * 34 + 12, 0) + 26 };
  });
  const cols = Array.from({ length: COLS }, () => ({ alto: 0, bloques: [] }));
  for (const b of bloques.sort((p, q) => q.alto - p.alto)) {
    const menor = cols.reduce((a, b2) => (a.alto <= b2.alto ? a : b2));
    menor.bloques.push(b); menor.alto += b.alto;
  }
  const ALTO = 190 + Math.max(...cols.map((c2) => c2.alto), 100) + 80;
  c.width = A; c.height = ALTO;
  x.fillStyle = '#fff'; x.fillRect(0, 0, A, ALTO);
  x.fillStyle = '#111'; x.font = '800 70px Poppins, sans-serif';
  x.fillText('TAREAS', M, 98);
  x.font = '600 26px Poppins, sans-serif'; x.fillStyle = '#6A6F98';
  x.fillText('MIND · semana del ' + T.semana, M, 138);
  x.strokeStyle = '#E4E1D2'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(M, 163); x.lineTo(A - M, 163); x.stroke();
  cols.forEach((col, i) => {
    let y = 215; const x0 = M + i * (anchoCol + 50);
    for (const b of col.bloques) {
      x.fillStyle = b.g.color; x.fillRect(x0, y - 26, 16, 16);
      x.fillStyle = '#111'; x.font = '800 32px Poppins, sans-serif';
      x.fillText(b.g.nombre, x0 + 26, y - 12); y += 30;
      for (const it of b.items) {
        x.font = '400 25px Poppins, sans-serif';
        x.fillStyle = it.estado === 'hecha' ? '#8A8FB5' : '#1C2260';
        for (let k = 0; k < it.lineas.length; k++) { x.fillText(it.lineas[k], x0 + (k ? 24 : 0), y); y += 34; }
        y += 12;
      }
      y += 26;
    }
  });
  x.fillStyle = '#8A8FB5'; x.font = '600 22px Poppins, sans-serif';
  x.fillText('MIND · LiFE Grupos Estudiantiles · @mindmty', M, ALTO - 40);
}
function descargar() {
  dibuja();
  const a = document.createElement('a');
  a.download = 'tablero-mind-' + ${jsonSeguro(elegido.semana)} + '.png';
  a.href = document.getElementById('lienzo').toDataURL('image/png');
  a.click();
}
</script>`;
  return paginaPortal("Historial de tableros · MIND",
    `${navPortal(p, "historial", puedeAsignar(p))}<h1>📚 Historial de tableros</h1>
<p>Cómo se veía el tablero cada semana, y qué se ha ido arrastrando</p>`, cuerpo, CSS_PANEL + CSS_HIST);
}

// ---------------- comparar lo editado contra lo guardado ----------------
export interface CambioFoto {
  tipo: "alta" | "baja" | "cambio";
  ref: number;                 // fila del tablero guardado; -1 si es nueva
  antes?: TareaFoto;
  ahora?: TareaFoto;
}
const mismaGente = (a: string[], b: string[]) =>
  [...a].sort().join(",") === [...b].sort().join(",");
/** La vigencia en una sola cadena, para comparar sin depender del orden de las llaves. */
export const vigTexto = (v?: TareaFoto["vigencia"]) =>
  !v ? "" : [v.tipo, v.inicio ?? "", v.fin ?? "", v.evento ?? ""].join("|");

/** Qué cambió entre el tablero guardado y lo que manda el editor. */
export function diffTablero(viejo: Tablero, nuevas: (TareaFoto & { ref: number })[]): CambioFoto[] {
  const out: CambioFoto[] = [];
  const vistos = new Set<number>();
  for (const n of nuevas) {
    if (n.ref < 0 || n.ref >= viejo.tareas.length) { out.push({ tipo: "alta", ref: -1, ahora: n }); continue; }
    vistos.add(n.ref);
    const v = viejo.tareas[n.ref];
    if (v.titulo !== n.titulo || v.area !== n.area || v.estado !== n.estado
        || (v.detalle ?? "") !== (n.detalle ?? "")
        || vigTexto(v.vigencia) !== vigTexto(n.vigencia)
        || !mismaGente(v.quienes, n.quienes)) {
      out.push({ tipo: "cambio", ref: n.ref, antes: v, ahora: n });
    }
  }
  viejo.tareas.forEach((v, i) => { if (!vistos.has(i)) out.push({ tipo: "baja", ref: i, antes: v }); });
  return out;
}
/** Las áreas que toca un cambio: hay que poder mandar en todas para guardarlo. */
export const areasDelCambio = (c: CambioFoto): string[] =>
  [...new Set([c.antes?.area, c.ahora?.area].filter((a): a is string => typeof a === "string"))];

// ---------------- vista de edición, igualita al tablero ----------------
export function renderHistorialEditor(p: Persona, tb: Tablero, eventos: EventoLite[]): string {
  const areas = leerAreas();
  const staff = staffActivo();
  const puedeTodo = esPresidencia(p);
  const datos = {
    semana: tb.semana,
    yo: { presidencia: puedeTodo, areas: areas.filter((a) => dirigeArea(p, a.id, areas)).map((a) => a.id) },
    areas: areas.map((a) => ({ id: a.id, nombre: a.nombre, color: a.color, tinta: a.tinta, emoji: a.emoji })),
    staff: [...staff].sort((a, b) => nombreCorto(a).localeCompare(nombreCorto(b), "es"))
      .map((s) => ({ mat: s.matricula, apodo: nombreCorto(s), ini: iniciales(s), color: areaDe(s, areas).color })),
    eventos: eventos.map((e) => ({ id: e.id, titulo: e.titulo, fecha: e.fecha })),
    estados: ESTADOS,
    creditos: Object.fromEntries(cierresConActual()),
    tareas: tb.tareas.map((t, i) => ({
      ref: i, titulo: t.titulo, detalle: t.detalle ?? "", area: t.area,
      quienes: [...t.quienes], estado: t.estado,
      vigencia: t.vigencia ? { ...t.vigencia } : { tipo: "fechas" as const },
    })),
  };
  const cuerpo = `
<div class="vistas">
  <a href="/tareas/historial?semana=${esc(tb.semana)}">👁️ Vista bonita</a>
  <a class="actual" href="/tareas/historial?semana=${esc(tb.semana)}&modo=editar">✏️ Editar</a>
</div>
<div class="barra-edit" id="barra-edit">
  <span id="cuenta-cambios">Sin cambios todavía</span>
  <button type="button" class="btn sec mini" id="btn-descartar" disabled>Descartar</button>
  <button type="button" class="btn mini" id="btn-guardar" disabled>Guardar cambios</button>
</div>
<div class="pool" id="pool"></div>
<p class="ayuda" id="ayuda">Arrastra una persona a una tarea para dársela. En celular: toca la persona y luego la tarea. Toca la tarjeta para editarla completa.</p>
<div class="zona-edit">
  <div class="tablero" id="tablero"></div>
  <aside class="resumen-edit" id="resumen-edit"></aside>
</div>
<div id="hoja" class="hoja" hidden><div class="hoja-caja"><button class="cerrar" type="button" onclick="cerrarHoja()">✕</button><div id="hoja-cuerpo"></div></div></div>
<div id="aviso-flotante" class="flotante" hidden></div>
<script>
const E = ${jsonSeguro(datos)};
let ORIG = JSON.parse(JSON.stringify(E.tareas));
let sel = null;
let arrastrando = null;
let saliendo = false;
let siguienteNueva = -1;          // las nuevas llevan ref negativo para distinguirlas
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const persona = (m) => E.staff.find((s) => s.mat === m);
const area = (id) => E.areas.find((a) => a.id === id);
const puedo = (areaId) => E.yo.presidencia || E.yo.areas.includes(areaId);
const nom = (m) => { const s = persona(m); return s ? s.apodo : m; };
const gente = (l) => (l.length ? l.map(nom).join(', ') : 'nadie');
const areaN = (id) => { const a = area(id); return a ? a.nombre : 'sin área'; };
const fechaCorta = (f) => { const [, m, d] = f.split('-').map(Number); return d + ' ' + ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1]; };
function cuando(t) {
  const v = t.vigencia || { tipo: 'fechas' };
  if (v.tipo === 'transversal') return 'Transversal';
  if (v.tipo === 'evento') { const e = E.eventos.find((x) => x.id === v.evento); return e ? 'Para ' + e.titulo : 'Para un evento'; }
  if (v.inicio && v.fin) return fechaCorta(v.inicio) + ' → ' + fechaCorta(v.fin);
  if (v.fin) return 'Hasta ' + fechaCorta(v.fin);
  if (v.inicio) return 'Desde ' + fechaCorta(v.inicio);
  return 'Sin fecha';
}
function avisa(txt, mal) {
  const a = $('#aviso-flotante'); a.textContent = txt; a.className = 'flotante' + (mal ? ' mal' : ''); a.hidden = false;
  clearTimeout(avisa.t); avisa.t = setTimeout(() => { a.hidden = true; }, 3000);
}
// ---- qué cambió ----
const vig = (v) => (v ? [v.tipo, v.inicio || '', v.fin || '', v.evento || ''].join('|') : '');
function cambios() {
  const out = []; const vistos = new Set();
  for (const t of E.tareas) {
    if (t.ref < 0) { out.push({ tipo: 'alta', ahora: t }); continue; }
    vistos.add(t.ref);
    const v = ORIG.find((x) => x.ref === t.ref); if (!v) continue;
    const igualGente = [...v.quienes].sort().join(',') === [...t.quienes].sort().join(',');
    if (v.titulo !== t.titulo || v.area !== t.area || v.estado !== t.estado
        || (v.detalle || '') !== (t.detalle || '') || vig(v.vigencia) !== vig(t.vigencia) || !igualGente)
      out.push({ tipo: 'cambio', antes: v, ahora: t });
  }
  ORIG.forEach((v) => { if (!vistos.has(v.ref)) out.push({ tipo: 'baja', antes: v }); });
  return out;
}
function describe(c) {
  if (c.tipo === 'alta') return ['➕ Se agrega', esc(c.ahora.titulo) + ' · ' + esc(areaN(c.ahora.area)) + ' · ' + esc(gente(c.ahora.quienes))];
  if (c.tipo === 'baja') return ['🗑️ Se quita', esc(c.antes.titulo) + ' · ' + esc(areaN(c.antes.area))];
  const partes = [];
  if (c.antes.titulo !== c.ahora.titulo) partes.push('nombre: «' + esc(c.antes.titulo) + '» → «' + esc(c.ahora.titulo) + '»');
  if (c.antes.area !== c.ahora.area) partes.push('área: ' + esc(areaN(c.antes.area)) + ' → ' + esc(areaN(c.ahora.area)));
  if (c.antes.estado !== c.ahora.estado) partes.push('estado: ' + esc(E.estados[c.antes.estado].nombre) + ' → ' + esc(E.estados[c.ahora.estado].nombre));
  if (vig(c.antes.vigencia) !== vig(c.ahora.vigencia)) partes.push('cuándo: ' + esc(cuando(c.antes)) + ' → ' + esc(cuando(c.ahora)));
  if ((c.antes.detalle || '') !== (c.ahora.detalle || '')) partes.push('cambia el detalle');
  if ([...c.antes.quienes].sort().join(',') !== [...c.ahora.quienes].sort().join(','))
    partes.push('quién la hace: ' + esc(gente(c.antes.quienes)) + ' → ' + esc(gente(c.ahora.quienes)));
  return ['✏️ ' + esc(c.ahora.titulo), partes.join(' · ')];
}
function refrescaBarra() {
  const n = cambios().length;
  $('#cuenta-cambios').textContent = n ? (n === 1 ? '1 cambio sin guardar' : n + ' cambios sin guardar') : 'Sin cambios todavía';
  $('#barra-edit').classList.toggle('viva', n > 0);
  $('#btn-guardar').disabled = !n;
  $('#btn-descartar').disabled = !n;
}
window.addEventListener('beforeunload', (e) => { if (!saliendo && cambios().length) { e.preventDefault(); e.returnValue = ''; } });

// ---- resumen vivo: cómo va quedando el reparto ----
function pintaResumen() {
  const cuenta = new Map();
  let sinNombre = 0, hechas = 0;
  for (const t of E.tareas) {
    if (t.estado === 'hecha') hechas++;
    if (!t.quienes.length) { sinNombre++; continue; }
    for (const m of t.quienes) {
      const c = cuenta.get(m) || { trae: 0, hechas: 0 };
      c.trae++; if (t.estado === 'hecha') c.hechas++;
      cuenta.set(m, c);
    }
  }
  const filas = [...cuenta.entries()].sort((a, b) => b[1].trae - a[1].trae || nom(a[0]).localeCompare(nom(b[0]), 'es'));
  $('#resumen-edit').innerHTML =
    '<h3>Cómo va quedando</h3>' +
    '<p class="rr-tot"><b>' + E.tareas.length + '</b> tareas · <b>' + hechas + '</b> hechas' + (sinNombre ? ' · <b>' + sinNombre + '</b> sin nombre' : '') + '</p>' +
    (filas.length ? '<ul class="rr">' + filas.map(([m, c]) => {
      const s = persona(m); const cred = E.creditos[m] || 0;
      return '<li><span class="ava chica" style="--c:' + (s ? s.color : '#6A6F98') + '">' + esc(s ? s.ini : '??') + '</span>' +
        '<span class="rr-n">' + esc(nom(m)) + '<i>' + cred + ' acreditadas en el historial</i></span>' +
        '<span class="rr-c"><b>' + c.trae + '</b><small>' + c.hechas + ' hechas</small></span></li>';
    }).join('') + '</ul>' : '<p class="rr-vacio">Nadie tiene tareas en esta lámina todavía.</p>') +
    '<p class="rr-pie">Lo de arriba es esta lámina. «Acreditadas» son las cerradas que ya te cuentan en los Awards, y se actualiza al guardar.</p>';
}
// ---- pool de personas ----
function pintaPool() {
  $('#pool').innerHTML = E.staff.map((s) => '<button type="button" class="ficha' + (sel === s.mat ? ' sel' : '') + '" draggable="true" data-mat="' + esc(s.mat) + '" style="--c:' + s.color + '"><span class="ava">' + esc(s.ini) + '</span><span>' + esc(s.apodo) + '</span></button>').join('');
  $('#pool').querySelectorAll('.ficha').forEach((f) => {
    f.addEventListener('click', () => { sel = sel === f.dataset.mat ? null : f.dataset.mat; pintaPool(); pinta();
      $('#ayuda').textContent = sel ? 'Toca una tarea para dársela a ' + persona(sel).apodo + '. Toca otra vez la ficha para soltar.' : 'Arrastra una persona a una tarea para dársela. Toca la tarjeta para editarla completa.'; });
    f.addEventListener('dragstart', (e) => { arrastrando = 'mat'; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', 'mat:' + f.dataset.mat); });
    f.addEventListener('dragend', () => { arrastrando = null; });
  });
}
// ---- tablero ----
const clave = (t) => (t.ref < 0 ? 'n' : 'v') + Math.abs(t.ref);
const busca = (k) => E.tareas.find((x) => clave(x) === k);
function tarjetaHTML(t) {
  const g = t.quienes.map(persona).filter(Boolean);
  const dim = sel && !t.quienes.includes(sel);
  const mio = puedo(t.area);
  const avatares = t.quienes.length
    ? g.map((s) => '<span class="ava chica" style="--c:' + s.color + '" title="' + esc(s.apodo) + (mio ? ' · toca para quitar' : '') + '" data-quitar="' + esc(s.mat) + '">' + esc(s.ini) + '</span>').join('')
    : '<span class="todos">SIN NOMBRE</span>';
  return '<article class="card est-' + t.estado + (dim ? ' dim' : '') + (sel && t.quienes.includes(sel) ? ' foco' : '') + (t.ref < 0 ? ' nueva' : '') + '" data-k="' + clave(t) + '" draggable="' + (mio ? 'true' : 'false') + '">' +
    '<div class="card-tit">' + esc(t.titulo) + '</div>' +
    '<div class="card-meta"><span class="dot" title="' + esc(E.estados[t.estado].nombre) + '"></span><span>' + esc(E.estados[t.estado].nombre) + '</span><span>· ' + esc(cuando(t)) + '</span>' +
      (t.detalle ? '<span title="' + esc(t.detalle) + '">📝</span>' : '') + (t.ref < 0 ? '<span>nueva</span>' : '') + '</div>' +
    '<div class="card-gente">' + avatares + '</div>' +
    (mio ? '<button type="button" class="mas" data-abrir="' + clave(t) + '" title="Editar">···</button>' : '') + '</article>';
}
function refresca() { pinta(); pintaResumen(); refrescaBarra(); }
function pinta() {
  const cols = [...E.areas, { id: '', nombre: 'Sin área', color: '#6A6F98', emoji: '•' }];
  $('#tablero').innerHTML = cols.map((a) => {
    const suyas = E.tareas.filter((t) => (t.area || '') === a.id);
    if (!a.id && !suyas.length) return '';
    const hechas = suyas.filter((t) => t.estado === 'hecha').length;
    return '<section class="col" data-area="' + esc(a.id) + '"><h3><span class="punto" style="background:' + a.color + '"></span>' + esc(a.emoji + ' ' + a.nombre) + ' <small>' + suyas.length + (hechas ? ' · ' + hechas + ' ✓' : '') + '</small></h3>' +
      '<div class="cards">' + suyas.map(tarjetaHTML).join('') + '</div>' +
      (puedo(a.id) && a.id ? '<form class="rapida" data-area="' + esc(a.id) + '"><input name="titulo" placeholder="+ agregar a la lámina" maxlength="160" autocomplete="off"></form>' : '') +
      '</section>';
  }).join('');
  document.querySelectorAll('.rapida').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = f.querySelector('input'); const titulo = inp.value.trim();
    if (titulo.length < 3) { avisa('Escribe al menos tres letras.', true); return; }
    E.tareas.push({ ref: siguienteNueva--, titulo, detalle: '', area: f.dataset.area, quienes: [], estado: 'pendiente', vigencia: { tipo: 'fechas' } });
    inp.value = ''; refresca();
    const n = document.querySelector('.rapida[data-area="' + f.dataset.area + '"] input'); if (n) n.focus();
  }));
  document.querySelectorAll('.card').forEach((c) => {
    const k = c.dataset.k;
    c.addEventListener('click', (e) => {
      const t = busca(k); if (!t) return;
      const q = e.target.closest('[data-quitar]');
      if (q) { e.stopPropagation(); if (!puedo(t.area)) return; t.quienes = t.quienes.filter((m) => m !== q.dataset.quitar); refresca(); return; }
      if (e.target.closest('[data-abrir]')) { e.stopPropagation(); abrirDetalle(k); return; }
      if (sel) { da(k, sel); return; }
      if (puedo(t.area)) abrirDetalle(k);
    });
    c.addEventListener('dragstart', (e) => { arrastrando = 'tarea'; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'tarea:' + k); c.classList.add('llevando'); });
    c.addEventListener('dragend', () => { arrastrando = null; c.classList.remove('llevando'); });
    c.addEventListener('dragover', (e) => { if (arrastrando === 'mat') { e.preventDefault(); c.classList.add('sobre'); } });
    c.addEventListener('dragleave', () => c.classList.remove('sobre'));
    c.addEventListener('drop', (e) => { e.preventDefault(); c.classList.remove('sobre'); const d = e.dataTransfer.getData('text/plain') || ''; if (d.startsWith('mat:')) { e.stopPropagation(); da(k, d.slice(4)); } });
  });
  document.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { if (arrastrando === 'tarea') { e.preventDefault(); col.classList.add('sobre'); } });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('sobre'); });
    col.addEventListener('drop', (e) => {
      const d = e.dataTransfer.getData('text/plain') || ''; col.classList.remove('sobre');
      if (!d.startsWith('tarea:')) return;
      e.preventDefault();
      const t = busca(d.slice(6)); const destino = col.dataset.area;
      if (!t || t.area === destino) return;
      if (!destino) { avisa('Suéltala en un área con nombre.', true); return; }
      if (!puedo(t.area) || !puedo(destino)) { avisa('No puedes mover tareas entre esas áreas.', true); return; }
      t.area = destino; refresca(); avisa('Movida a ' + areaN(destino));
    });
  });
}
function da(k, mat) {
  const t = busca(k); if (!t) return;
  if (!puedo(t.area)) { avisa('No puedes tocar tareas de ' + areaN(t.area) + '.', true); return; }
  if (t.quienes.includes(mat)) { avisa(nom(mat) + ' ya está en esa tarea.'); return; }
  t.quienes.push(mat); refresca(); avisa('✓ ' + nom(mat) + ' → ' + t.titulo);
}
// ---- hoja de detalle: los mismos campos que el tablero ----
function abrirDetalle(k) {
  const t = busca(k); if (!t || !puedo(t.area)) return;
  const v = t.vigencia || { tipo: 'fechas' };
  const est = (x) => '<button type="button" class="btn ' + (x === 'hecha' ? 'ok' : x === 'vencida' ? 'sec peligro' : 'sec') + ' mini" data-est="' + x + '"' + (t.estado === x ? ' disabled' : '') + '>' + esc(E.estados[x].nombre) + '</button>';
  abrirHoja('<div class="hoja-item"><b>' + esc(t.titulo) + '</b>' +
    '<div class="meta"><span class="chip" style="background:' + (area(t.area) ? area(t.area).color : '#6A6F98') + ';color:' + (area(t.area) ? area(t.area).tinta : '#fff') + '">' + esc(area(t.area) ? area(t.area).emoji + ' ' + area(t.area).nombre : 'Sin área') + '</span> ' +
      '<span class="chip" style="background:' + E.estados[t.estado].color + ';color:' + E.estados[t.estado].tinta + '">' + esc(E.estados[t.estado].nombre) + '</span> <span>' + esc(cuando(t)) + '</span></div>' +
    '<div class="acc">' + ['pendiente', 'curso', 'hecha', 'vencida'].map(est).join('') + '</div>' +
    '<form class="fila" id="f-foto" style="margin-top:12px">' +
    '<div style="grid-column:1/-1"><label>Tarea</label><input name="titulo" value="' + esc(t.titulo) + '" maxlength="160" required></div>' +
    '<div style="grid-column:1/-1"><label>Detalle</label><input name="detalle" value="' + esc(t.detalle || '') + '" maxlength="300"></div>' +
    '<div><label>Cuándo</label><select name="tipo"><option value="fechas"' + (v.tipo === 'fechas' ? ' selected' : '') + '>Con fechas</option><option value="transversal"' + (v.tipo === 'transversal' ? ' selected' : '') + '>Transversal</option><option value="evento"' + (v.tipo === 'evento' ? ' selected' : '') + '>Para un evento</option></select></div>' +
    '<div><label>Área</label><select name="area">' + E.areas.filter((x) => puedo(x.id)).map((x) => '<option value="' + x.id + '"' + (x.id === t.area ? ' selected' : '') + '>' + esc(x.emoji + ' ' + x.nombre) + '</option>').join('') + '</select></div>' +
    '<div><label>Del</label><input type="date" name="inicio" value="' + esc(v.inicio || '') + '"></div>' +
    '<div><label>Al</label><input type="date" name="fin" value="' + esc(v.fin || '') + '"></div>' +
    '<div style="grid-column:1/-1"><label>Evento</label><select name="evento"><option value="">(ninguno)</option>' + E.eventos.map((e) => '<option value="' + esc(e.id) + '"' + (e.id === v.evento ? ' selected' : '') + '>' + esc(e.titulo + ' · ' + fechaCorta(e.fecha)) + '</option>').join('') + '</select></div>' +
    '</form>' +
    '<div class="gente-lista" style="margin-top:10px">' + (t.quienes.length ? t.quienes.map(persona).filter(Boolean).map((s) => '<span class="ficha mini-f" style="--c:' + s.color + '"><span class="ava">' + esc(s.ini) + '</span>' + esc(s.apodo) + ' <i data-quitar="' + esc(s.mat) + '">✕</i></span>').join('') : '<span class="todos">SIN NOMBRE</span>') + '</div>' +
    '<p class="det" style="margin-top:8px">Quien aparezca aquí es a quien se le acredita esta tarea en los Awards.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" type="button" id="b-ok">Aplicar</button>' +
    '<button class="btn sec peligro" type="button" id="b-quitar">Quitar de la lámina</button></div></div>');
  const h = $('#hoja-cuerpo');
  h.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', () => { aplica(k); t.estado = b.dataset.est; refresca(); abrirDetalle(k); }));
  h.querySelectorAll('[data-quitar]').forEach((i) => i.addEventListener('click', () => { aplica(k); t.quienes = t.quienes.filter((m) => m !== i.dataset.quitar); refresca(); abrirDetalle(k); }));
  $('#b-ok').addEventListener('click', () => { if (aplica(k)) { refresca(); cerrarHoja(); } });
  $('#b-quitar').addEventListener('click', () => {
    E.tareas = E.tareas.filter((x) => clave(x) !== k);
    refresca(); cerrarHoja(); avisa('Quitada de la lámina (aún sin guardar)');
  });
}
/** Pasa lo que está escrito en la hoja a la tarea, sin guardar en el servidor. */
function aplica(k) {
  const t = busca(k); const f = $('#f-foto'); if (!t || !f) return false;
  const d = new FormData(f);
  const titulo = String(d.get('titulo') || '').trim();
  if (titulo.length < 3) { avisa('El nombre necesita al menos tres letras.', true); return false; }
  t.titulo = titulo;
  t.detalle = String(d.get('detalle') || '').trim();
  t.area = d.get('area');
  const tipo = d.get('tipo');
  const nueva = { tipo };
  if (tipo === 'fechas') { if (d.get('inicio')) nueva.inicio = d.get('inicio'); if (d.get('fin')) nueva.fin = d.get('fin'); }
  if (tipo === 'evento') { if (d.get('evento')) nueva.evento = d.get('evento'); }
  t.vigencia = nueva;
  return true;
}
// ---- el seguro antes de guardar ----
function confirmar() {
  const l = cambios();
  if (!l.length) return;
  abrirHoja('<div class="hoja-item"><b>¿Seguro que quieres guardar?</b>' +
    '<p class="det">Vas a cambiar la lámina de la semana. Esto mueve también a quién se le acreditan las tareas cerradas en los Awards.</p>' +
    '<ul class="cambios">' + l.map((c) => { const [t, d] = describe(c); return '<li><b>' + t + '</b>' + (d ? '<span>' + d + '</span>' : '') + '</li>'; }).join('') + '</ul>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
    '<button class="btn" type="button" id="b-si">Sí, guardar los ' + l.length + ' cambios</button>' +
    '<button class="btn sec" type="button" id="b-no">No, seguir editando</button></div></div>');
  $('#b-no').addEventListener('click', cerrarHoja);
  $('#b-si').addEventListener('click', async () => {
    const b = $('#b-si'); b.disabled = true; b.textContent = 'Guardando…';
    try {
      const r = await fetch('/api/historial/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semana: E.semana, tareas: E.tareas }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('error ' + r.status));
      // se queda en la página: se renumera lo guardado y se refrescan los créditos
      E.tareas = E.tareas.map((t, i) => ({ ...t, ref: i }));
      ORIG = JSON.parse(JSON.stringify(E.tareas));
      siguienteNueva = -1;
      if (j.creditos) E.creditos = j.creditos;
      cerrarHoja(); refresca(); avisa(j.aviso || '✓ Guardado');
    } catch (e) { b.disabled = false; b.textContent = 'Sí, guardar'; avisa(e.message, true); }
  });
}
function abrirHoja(html) { $('#hoja-cuerpo').innerHTML = html; $('#hoja').hidden = false; document.body.style.overflow = 'hidden'; }
function cerrarHoja() { $('#hoja').hidden = true; document.body.style.overflow = ''; }
$('#hoja').addEventListener('click', (e) => { if (e.target.id === 'hoja') cerrarHoja(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarHoja(); if (sel) { sel = null; pintaPool(); pinta(); } } });
$('#btn-guardar').addEventListener('click', confirmar);
$('#btn-descartar').addEventListener('click', () => { if (confirm('¿Descartar todos los cambios sin guardar?')) { saliendo = true; location.reload(); } });
pintaPool(); refresca();
</script>`;
  return paginaPortal("Editar lámina · MIND",
    `${navPortal(p, "historial", puedeAsignar(p))}<h1>✏️ Editar la lámina</h1>
<p>Semana del ${esc(rangoSemana(tb.semana))} · ${tb.tareas.length} tareas</p>`,
    cuerpo, CSS_PANEL + CSS_CAL + CSS_KANBAN + CSS_EDIT);
}

const CSS_EDIT = `
.barra-edit { display:flex; align-items:center; gap:9px; flex-wrap:wrap; background:#fff; border:1px solid #E4E1D2; border-radius:12px; padding:9px 13px; margin-bottom:12px; position:sticky; top:0; z-index:6; }
.barra-edit span { flex:1; min-width:140px; font-size:12.5px; font-weight:700; color:#8A8FB5; }
.barra-edit.viva { border-color:#F5C518; background:#FFFBEA; }
.barra-edit.viva span { color:#8A6A10; }
.card.nueva { border-style:dashed; border-color:#8BC53F; }
.acc { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
.zona-edit { display:grid; grid-template-columns:minmax(0,1fr) 262px; gap:14px; align-items:start; }
@media (max-width:1050px) { .zona-edit { grid-template-columns:minmax(0,1fr); } }
.resumen-edit { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:12px 13px; position:sticky; top:64px; }
.resumen-edit h3 { font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; margin:0 0 8px; }
.rr-tot { font-size:12.5px; color:#6A6F98; margin:0 0 10px; }
.rr-tot b { color:#1C2260; }
ul.rr { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; max-height:46vh; overflow-y:auto; }
ul.rr li { display:flex; align-items:center; gap:8px; }
ul.rr .rr-n { flex:1; min-width:0; font-size:12.5px; font-weight:700; color:#1C2260; }
ul.rr .rr-n i { display:block; font-style:normal; font-size:10.5px; font-weight:600; color:#A0A5C2; }
ul.rr .rr-c { flex:none; text-align:right; }
ul.rr .rr-c b { display:block; font-size:15px; font-weight:800; line-height:1; }
ul.rr .rr-c small { font-size:10px; color:#A0A5C2; }
.rr-vacio, .rr-pie { font-size:11px; color:#8A8FB5; margin:8px 0 0; line-height:1.4; }
ul.cambios { list-style:none; margin:12px 0 0; padding:0; display:flex; flex-direction:column; gap:7px; max-height:44vh; overflow-y:auto; }
ul.cambios li { background:#F7F5EC; border:1px solid #E4E1D2; border-radius:10px; padding:8px 11px; font-size:13px; line-height:1.4; }
ul.cambios li b { display:block; font-size:13px; }
ul.cambios li span { display:block; font-size:12px; color:#6A6F98; margin-top:2px; overflow-wrap:anywhere; }
`;

const CSS_HIST = `
main { max-width:1100px; }
.semanas { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px; }
.semanas a { font-size:12.5px; font-weight:700; color:#1C2260; background:#fff; border:1.5px solid #DDD9C6; border-radius:12px; padding:8px 14px; text-decoration:none; text-align:center; }
.semanas a small { display:block; font-size:10.5px; font-weight:500; color:#8A8FB5; margin-top:2px; }
.semanas a.actual { background:#1C2260; color:#fff; border-color:#1C2260; }
.semanas a.actual small { color:#B9C4E8; }
.cab-tablero { display:flex; justify-content:space-between; align-items:end; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
.tablero-h { columns:2; column-gap:22px; }
@media (max-width:760px) { .tablero-h { columns:1; } }
.bloque { break-inside:avoid; background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:13px 15px; margin-bottom:12px; }
.bloque h3 { font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; display:flex; align-items:center; gap:8px; margin-bottom:9px; }
.bloque h3 small { color:#8A8FB5; margin-left:auto; }
.punto { width:10px; height:10px; border-radius:50%; display:inline-block; }
.linea-h { display:flex; gap:8px; font-size:13.5px; line-height:1.45; padding:3px 0; }
.linea-h .tic { color:#8A8FB5; font-weight:800; flex:none; width:12px; }
.linea-h i { font-style:normal; color:#8A8FB5; font-size:12px; }
.linea-h.estado-hecha { color:#8A8FB5; text-decoration:line-through; }
.linea-h.estado-hecha .tic { color:#8BC53F; }
.linea-h.estado-vencida { color:#A9AECC; }
.linea-h.estado-vencida .tic { color:#A03434; }
.linea-h.estado-curso .tic { color:#29A3C7; }
table.arr { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E4E1D2; border-radius:14px; overflow:hidden; font-size:13.5px; }
table.arr th, table.arr td { padding:9px 11px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:middle; }
table.arr th { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:#8A8FB5; }
table.arr tr:last-child td { border-bottom:none; }
table.arr .num { text-align:right; }
.chip.viva { background:#FDF3D7; color:#8A6A10; }
.chip.cerrada { background:#E8F3D9; color:#3F6B10; }
.scroll { overflow-x:auto; }
.ava { width:26px; height:26px; font-size:10px; margin-right:6px; vertical-align:middle; }
`;
