// Historial de tableros: una foto del tablero por semana, para poder volver a verla.
// Se guarda sola al cerrar la semana, y los tableros viejos se cargan a mano.
import fs from "node:fs";
import path from "node:path";
import { areaDe, iniciales, leerAreas, nombreCorto, puedeAsignar, staffActivo, leerStaff,
         type Area, type Persona } from "./staff";
import { esAbierta, esc, jsonSeguro, paginaPortal, leerTareas, quienes, rangoSemana,
         semanaActual, lunesDe, type Tarea } from "./tareas";
import { navPortal } from "./portal";

export interface TareaFoto {
  titulo: string;
  area: string;              // id de área, "" si no tenía
  quienes: string[];         // matrículas
  estado: "pendiente" | "curso" | "hecha" | "vencida";
}
export interface Tablero {
  semana: string;            // lunes de esa semana
  guardado: string;          // ISO
  origen: "cierre" | "cargado";
  nota?: string;
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
export function renderHistorial(p: Persona, tableros: Tablero[], sel?: string): string {
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
<div class="semanas">${chips}</div>

<div class="cab-tablero">
  <div><h2 style="margin:0">Semana del ${esc(rangoSemana(elegido.semana))}</h2>
    <p class="det">${elegido.tareas.length} tareas · ${cuentaEstados("hecha")} hechas · ${cuentaEstados("vencida")} vencidas${elegido.origen === "cargado" ? " · cargado de la lámina de esa semana" : elegido.semana === actual.semana ? " · así va ahora mismo" : " · foto tomada al cerrar la semana"}</p></div>
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
<p>Cómo se veía el tablero cada semana, y qué se ha ido arrastrando</p>`, cuerpo, CSS_HIST);
}

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
