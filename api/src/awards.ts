// MIND Awards: quién hace cuántas tareas, cuántas cumple y qué tanto se aparece.
// Sale de lo que ya existe: tareas del portal + asistencia a eventos y juntas.
import { areaDe, iniciales, leerAreas, nombreCorto, puedeAsignar, ROLES, staffActivo,
         type Persona } from "./staff";
import { leerTareas, esAbierta, esc, jsonSeguro, paginaPortal, hoyISO, semanaActual,
         esRecurrente, cumplidaEstaSemana, type Tarea } from "./tareas";
import { leerAsistencias, leerEventos, esJunta } from "./eventos";
import { navPortal } from "./portal";

export type Periodo = "todo" | "mes" | "semana";
const PERIODOS: Record<Periodo, string> = {
  todo: "todo el semestre", mes: "este mes", semana: "esta semana",
};

export type Orden = "puntos" | "tareas" | "cumple" | "tiempo" | "juntas" | "eventos";
/** Tareas mínimas para competir en Cumplimiento: sin esto, 1 de 1 sería un 100%. */
const MIN_CUMPLE = 2;

export interface FilaAward {
  matricula: string; nombre: string; apodo: string; ini: string;
  area: string; color: string; rol: string;
  asignadas: number; hechas: number; pct: number; aTiempo: number;
  vueltas: number;   // veces que cumplió una tarea transversal (una por semana)
  juntas: number; eventos: number; puntos: number;
  medallas: string[];
}

interface Categoria {
  nombre: string; emoji: string; explica: string;
  valor: (x: FilaAward) => number;
  grande: (x: FilaAward) => string;
  chico: (x: FilaAward) => string;
}
export const CATEGORIAS: Record<Orden, Categoria> = {
  puntos: {
    nombre: "Puntos totales", emoji: "🏆", explica: "Todo junto: tareas, puntualidad y asistencia",
    valor: (x) => x.puntos, grande: (x) => `${x.puntos} pts`,
    chico: (x) => `${x.hechas} tarea${x.hechas === 1 ? "" : "s"} · ${x.juntas} junta${x.juntas === 1 ? "" : "s"} · ${x.eventos} evento${x.eventos === 1 ? "" : "s"}`,
  },
  tareas: {
    nombre: "Tareas hechas", emoji: "✅",
    explica: "Cuántas cerró · las transversales cuentan una vez por cada semana que las cumplió",
    valor: (x) => x.hechas, grande: (x) => `${x.hechas}`,
    chico: (x) => `${x.asignadas} asignada${x.asignadas === 1 ? "" : "s"}${x.vueltas ? ` · ${x.vueltas} vuelta${x.vueltas === 1 ? "" : "s"} de transversales` : ""}`,
  },
  cumple: {
    nombre: "Cumplimiento", emoji: "🎯",
    explica: "Qué porcentaje de lo suyo terminó · para el podio pedimos al menos dos tareas asignadas, para que una sola tarea no valga un 100%",
    valor: (x) => (x.asignadas >= MIN_CUMPLE ? x.pct : -1),
    grande: (x) => (x.asignadas >= MIN_CUMPLE ? `${x.pct}%` : "—"),
    chico: (x) => (x.asignadas >= MIN_CUMPLE ? `${x.hechas} de ${x.asignadas}`
      : x.asignadas ? `solo ${x.asignadas} tarea asignada` : "sin tareas asignadas"),
  },
  tiempo: {
    nombre: "Puntualidad", emoji: "⏱️", explica: "Tareas cerradas antes de su fecha o de su evento",
    valor: (x) => x.aTiempo, grande: (x) => `${x.aTiempo}`,
    chico: (x) => `de ${x.hechas} cerrada${x.hechas === 1 ? "" : "s"} · solo cuentan las que tenían fecha`,
  },
  juntas: {
    nombre: "Juntas", emoji: "📋", explica: "A cuántas juntas de staff asistió",
    valor: (x) => x.juntas, grande: (x) => `${x.juntas}`,
    chico: (x) => `junta${x.juntas === 1 ? "" : "s"} asistida${x.juntas === 1 ? "" : "s"}`,
  },
  eventos: {
    nombre: "Eventos", emoji: "🎟️", explica: "A cuántos eventos de MIND se apareció",
    valor: (x) => x.eventos, grande: (x) => `${x.eventos}`,
    chico: (x) => `evento${x.eventos === 1 ? "" : "s"} apoyado${x.eventos === 1 ? "" : "s"}`,
  },
};

/** Fecha que "cuenta" para una tarea: cuándo se cerró, o cuándo nació. */
const fechaDe = (t: Tarea) => (t.hechaEl ?? t.creada).slice(0, 10);

/** ¿La tarea se entregó antes de su límite? Con evento, antes del evento. */
function aTiempo(t: Tarea, fechaEvento?: string): boolean {
  if (t.estado !== "hecha" || !t.hechaEl) return false;
  const limite = t.vigencia.tipo === "fechas" ? t.vigencia.fin
    : t.vigencia.tipo === "evento" ? fechaEvento : undefined;
  return Boolean(limite) && t.hechaEl.slice(0, 10) <= limite!;
}

export function calcularAwards(periodo: Periodo) {
  const desde = periodo === "todo" ? "0000-00-00"
    : periodo === "mes" ? hoyISO().slice(0, 7) + "-01"
    : semanaActual();
  const staff = staffActivo();
  const areas = leerAreas();
  const tareas = leerTareas();
  const eventos = leerEventos();
  const fechaEv = new Map(eventos.map((e) => [e.id, e.fecha]));
  const evIdx = new Map(eventos.map((e) => [e.id, e]));
  const asis = leerAsistencias().filter((a) => a.ts.slice(0, 10) >= desde);

  const filas: FilaAward[] = staff.map((p) => {
    const suyas = tareas.filter((t) => t.asignados.includes(p.matricula)
      && (esRecurrente(t) || fechaDe(t) >= desde));
    // una transversal cuenta una vez por CADA semana cumplida; el resto, una sola vez
    const rec = suyas.filter(esRecurrente);
    const noRec = suyas.filter((t) => !esRecurrente(t));
    const vueltas = rec.reduce((n, t) =>
      n + (t.vueltas ?? []).filter((v) => v.semana >= desde && v.por === p.matricula).length, 0);
    const hechasNoRec = noRec.filter((t) => t.estado === "hecha");
    const cerradas = hechasNoRec.length + vueltas;
    // el porcentaje mira el ahora: de lo que tienes, cuánto está cerrado
    const pctNum = hechasNoRec.length + rec.filter(cumplidaEstaSemana).length;
    const puntual = hechasNoRec.filter((t) => aTiempo(t, fechaEv.get(t.vigencia.evento ?? ""))).length;
    const mias = asis.filter((a) => a.matricula === p.matricula);
    const juntas = mias.filter((a) => { const e = evIdx.get(a.evento); return e && esJunta(e); }).length;
    const evs = mias.length - juntas;
    const a = areaDe(p, areas);
    return {
      matricula: p.matricula, nombre: p.nombre, apodo: nombreCorto(p), ini: iniciales(p),
      area: a.nombre, color: a.color, rol: ROLES[p.rol].nombre,
      asignadas: suyas.length, hechas: cerradas, vueltas,
      pct: suyas.length ? Math.round(100 * pctNum / suyas.length) : 0,
      aTiempo: puntual, juntas, eventos: evs,
      puntos: cerradas * 10 + puntual * 3 + juntas * 5 + evs * 8,
      medallas: [],
    };
  });

  // una medalla por categoría; los empates la comparten
  for (const [k, c] of Object.entries(CATEGORIAS) as [Orden, Categoria][]) {
    if (k === "puntos") continue;
    const tope = Math.max(0, ...filas.map(c.valor));
    if (tope <= 0) continue;
    for (const x of filas) if (c.valor(x) === tope) x.medallas.push(`${c.emoji} ${c.nombre}`);
  }

  const totales = {
    tareas: tareas.length,
    hechas: tareas.filter((t) => t.estado === "hecha").length,
    abiertas: tareas.filter(esAbierta).length,
    juntas: eventos.filter(esJunta).length,
    eventos: eventos.filter((e) => !esJunta(e)).length,
  };
  return { filas, totales, desde, periodo, etiqueta: PERIODOS[periodo] };
}

const MEDALLA = ["🥇", "🥈", "🥉"];

export function renderAwards(p: Persona, periodo: Periodo, orden: Orden): string {
  const r = calcularAwards(periodo);
  const cat = CATEGORIAS[orden];
  const filas = [...r.filas].sort((a, b) =>
    cat.valor(b) - cat.valor(a) || b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));
  const conAlgo = filas.filter((x) => cat.valor(x) > 0);
  const podio = conAlgo.slice(0, 3);
  // el podio se muestra 2-1-3 para que el primero quede al centro y más alto
  const ordenVisual = [1, 0, 2].filter((i) => podio[i]);

  const tarjetaPodio = (i: number) => {
    const x = podio[i];
    return `<div class="podio-uno lugar-${i + 1}">
      <div class="cinta">${MEDALLA[i]}</div>
      <span class="ava grande" style="--c:${x.color}">${esc(x.ini)}</span>
      <b>${esc(x.apodo)}</b>
      <span class="area-chip" style="--c:${x.color}">${esc(x.area)}</span>
      <div class="pts">${esc(cat.grande(x))}</div>
      <div class="mini-datos">${esc(cat.chico(x))}</div>
      ${orden !== "puntos" ? `<div class="mini-datos suave">${x.puntos} pts en total</div>` : ""}
    </div>`;
  };

  const cel = (activo: boolean, contenido: string) =>
    `<td class="num${activo ? " activa" : ""}">${contenido}</td>`;
  const cuerpoTabla = filas.map((x, i) => {
    const rank = cat.valor(x) > 0 ? i + 1 : "";
    return `<tr${x.matricula === p.matricula ? ' class="yo"' : ""}>
      <td class="pos">${cat.valor(x) > 0 && i < 3 ? MEDALLA[i] : rank}</td>
      <td><div class="quien"><span class="ava" style="--c:${x.color}">${esc(x.ini)}</span>
        <div><b>${esc(x.apodo)}</b><small>${esc(x.nombre)}</small>
        <span class="area-chip chico" style="--c:${x.color}">${esc(x.rol)} de ${esc(x.area)}</span></div></div>
        ${x.medallas.length ? `<div class="medallitas">${x.medallas.map((m) => `<span>${esc(m)}</span>`).join("")}</div>` : ""}</td>
      ${cel(orden === "tareas", `${x.hechas}<small>${x.asignadas ? "de " + x.asignadas : "sin asignar"}${x.vueltas ? " · " + x.vueltas + " de transversales" : ""}</small>`)}
      ${cel(orden === "cumple", x.asignadas
        ? `<div class="barra"><i style="width:${x.pct}%;background:${x.color}"></i></div><b>${x.pct}%</b>${x.asignadas < MIN_CUMPLE ? '<small>fuera del podio</small>' : ""}`
        : '<span class="guion">—</span>')}
      ${cel(orden === "tiempo", String(x.aTiempo))}
      ${cel(orden === "juntas", String(x.juntas))}
      ${cel(orden === "eventos", String(x.eventos))}
      ${cel(orden === "puntos", `<b class="pt">${x.puntos}</b>`)}
    </tr>`;
  }).join("");

  const chipP = (v: Periodo) =>
    `<a href="/tareas/awards?periodo=${v}&orden=${orden}"${v === periodo ? ' class="actual"' : ""}>${esc(PERIODOS[v].replace("todo el ", "").replace("este ", "").replace("esta ", ""))}</a>`;
  const chipC = (v: Orden) =>
    `<a href="/tareas/awards?periodo=${periodo}&orden=${v}"${v === orden ? ' class="actual"' : ""}>${CATEGORIAS[v].emoji} ${esc(CATEGORIAS[v].nombre)}</a>`;
  const th = (v: Orden, txt: string) =>
    `<th class="num${orden === v ? " activa" : ""}"><a href="/tareas/awards?periodo=${periodo}&orden=${v}">${esc(txt)}</a></th>`;

  const datosImg = {
    titulo: cat.nombre, etiqueta: r.etiqueta, emoji: cat.emoji,
    podio: podio.map((x) => ({ apodo: x.apodo, ini: x.ini, color: x.color, grande: cat.grande(x), chico: cat.chico(x) })),
    tabla: conAlgo.map((x) => ({ apodo: x.apodo, ini: x.ini, color: x.color, grande: cat.grande(x), chico: cat.chico(x) })),
  };

  const cuerpo = `
<div class="filtros-awards">
  <div class="grupo-chips"><span class="et">Periodo</span><div class="chips">${chipP("todo")}${chipP("mes")}${chipP("semana")}</div></div>
  <div class="grupo-chips"><span class="et">Categoría</span><div class="chips">${(Object.keys(CATEGORIAS) as Orden[]).map(chipC).join("")}</div></div>
</div>
<p class="explica">${cat.emoji} <b>${esc(cat.nombre)}</b> · ${esc(cat.explica)} · ${esc(r.etiqueta)}</p>

${podio.length
  ? `<div class="podio">${ordenVisual.map(tarjetaPodio).join("")}</div>`
  : `<div class="vacio">Todavía no hay nada que contar en <b>${esc(cat.nombre.toLowerCase())}</b> durante ${esc(r.etiqueta)}. En cuanto se marquen tareas como hechas o se pase lista, aparece aquí.</div>`}

<div class="resumen-tot">
  <span><b>${r.totales.hechas}</b> de ${r.totales.tareas} tareas hechas</span>
  <span><b>${r.totales.juntas}</b> juntas</span>
  <span><b>${r.totales.eventos}</b> eventos</span>
  <span><b>${r.filas.length}</b> personas en el staff</span>
</div>

<h2>Tabla completa <small>ordenada por ${esc(cat.nombre.toLowerCase())} · ${esc(r.etiqueta)}</small>
  <button class="btn sec" type="button" onclick="descargar()" style="margin-left:auto">⬇ Descargar imagen</button></h2>
<div class="scroll"><table class="awards">
  <tr><th></th><th>Persona</th>${th("tareas", "Tareas")}${th("cumple", "Cumple")}${th("tiempo", "A tiempo")}${th("juntas", "Juntas")}${th("eventos", "Eventos")}${th("puntos", "Puntos")}</tr>
  ${cuerpoTabla}
</table></div>
<p class="det" style="margin-top:6px">Toca el título de una columna para ordenar por esa categoría.</p>

<div class="tarjeta como">
  <b>Cómo se cuentan los puntos</b>
  <ul>
    <li><b>10 puntos</b> por cada tarea marcada como hecha. Las transversales no se acaban: cuentan otra vez cada semana que se cumplen.</li>
    <li><b>3 puntos extra</b> si se cerró antes de su fecha límite o antes de su evento.</li>
    <li><b>5 puntos</b> por cada junta a la que asistió.</li>
    <li><b>8 puntos</b> por cada evento de MIND al que se apareció.</li>
  </ul>
  <p class="det">En <b>Cumplimiento</b> compiten quienes tienen al menos dos tareas asignadas, para que una sola tarea hecha no valga un 100% y desplace a quien lleva más carga.</p>
  <p class="det">Las tareas asignadas a TODOS no se le cuentan a nadie en particular, para que nadie sume por algo que no hizo. Nada resta puntos: esto es para reconocer, no para regañar. Si alguien aparece con guion en Cumplimiento es porque no tiene tareas asignadas todavía.</p>
</div>
<canvas id="lienzo" hidden></canvas>
<script>
const A = ${jsonSeguro(datosImg)};
function dibuja() {
  const c = document.getElementById('lienzo');
  const x = c.getContext('2d');
  const AN = 1200, filas = A.tabla.length;
  const ALTO = 300 + (A.podio.length ? 280 : 0) + filas * 54 + 90;
  c.width = AN; c.height = ALTO;
  x.fillStyle = '#F7F5EC'; x.fillRect(0, 0, AN, ALTO);
  const g = x.createLinearGradient(0, 0, AN, 200);
  g.addColorStop(0, '#29A3C7'); g.addColorStop(.6, '#2E4BC6'); g.addColorStop(1, '#232D93');
  x.fillStyle = g; x.fillRect(0, 0, AN, 200);
  x.fillStyle = '#fff'; x.textAlign = 'center';
  x.font = '800 60px Poppins, sans-serif'; x.fillText('MIND AWARDS', AN / 2, 88);
  x.font = '700 30px Poppins, sans-serif';
  x.fillText(A.emoji + '  ' + A.titulo, AN / 2, 134);
  x.font = '600 22px Poppins, sans-serif'; x.fillStyle = '#CFE4F5';
  x.fillText(A.etiqueta.charAt(0).toUpperCase() + A.etiqueta.slice(1), AN / 2, 168);
  let y = 268;
  if (A.podio.length) {
    const pos = [0, -300, 300], subir = [0, 34, 34];
    const medallas = ['🥇', '🥈', '🥉'];
    A.podio.forEach((p, i) => {
      const cx = AN / 2 + (pos[i] || 0), cy = y + subir[i];
      x.font = '54px Poppins, sans-serif'; x.fillText(medallas[i], cx, cy);
      x.beginPath(); x.arc(cx, cy + 70, 46, 0, 7); x.fillStyle = p.color; x.fill();
      x.fillStyle = '#fff'; x.font = '800 31px Poppins, sans-serif'; x.fillText(p.ini, cx, cy + 82);
      x.fillStyle = '#1C2260'; x.font = '800 28px Poppins, sans-serif'; x.fillText(p.apodo, cx, cy + 148);
      x.fillStyle = '#2E4BC6'; x.font = '800 34px Poppins, sans-serif'; x.fillText(p.grande, cx, cy + 190);
      x.fillStyle = '#8A8FB5'; x.font = '500 19px Poppins, sans-serif'; x.fillText(p.chico, cx, cy + 216);
    });
    y += 280;
  }
  x.textAlign = 'left';
  A.tabla.forEach((p, i) => {
    const fy = y + i * 54;
    if (i % 2 === 0) { x.fillStyle = '#fff'; x.fillRect(70, fy - 30, AN - 140, 48); }
    x.fillStyle = '#6A6F98'; x.font = '800 22px Poppins, sans-serif'; x.fillText(String(i + 1), 92, fy);
    x.beginPath(); x.arc(155, fy - 7, 18, 0, 7); x.fillStyle = p.color; x.fill();
    x.fillStyle = '#fff'; x.font = '800 14px Poppins, sans-serif'; x.textAlign = 'center';
    x.fillText(p.ini, 155, fy - 2); x.textAlign = 'left';
    x.fillStyle = '#1C2260'; x.font = '600 23px Poppins, sans-serif'; x.fillText(p.apodo, 186, fy);
    x.fillStyle = '#8A8FB5'; x.font = '500 19px Poppins, sans-serif'; x.fillText(p.chico, 470, fy);
    x.fillStyle = '#2E4BC6'; x.font = '800 24px Poppins, sans-serif'; x.textAlign = 'right';
    x.fillText(p.grande, AN - 92, fy); x.textAlign = 'left';
  });
  x.fillStyle = '#8A8FB5'; x.font = '600 20px Poppins, sans-serif';
  x.fillText('MIND · LiFE Grupos Estudiantiles · @mindmty', 70, ALTO - 40);
  const paleta = ['#8BC53F','#F5C518','#EC4899','#C026D3','#22B8CF'];
  paleta.forEach((p2, i) => { x.fillStyle = p2; x.beginPath(); x.arc(AN - 70 - (4 - i) * 26, ALTO - 47, 8, 0, 7); x.fill(); });
}
function descargar() {
  dibuja();
  const a = document.createElement('a');
  a.download = 'mind-awards-' + ${jsonSeguro(orden)} + '.png';
  a.href = document.getElementById('lienzo').toDataURL('image/png');
  a.click();
}
</script>`;
  return paginaPortal("MIND Awards", `${navPortal(p, "awards", puedeAsignar(p))}<h1>🏆 MIND Awards</h1>
<p>Quién hace cuántas tareas, cuántas cumple y qué tanto se aparece</p>`, cuerpo, CSS_AWARDS);
}

const CSS_AWARDS = `
main { max-width:1040px; }
.filtros-awards { display:grid; gap:10px; margin-bottom:14px; }
.grupo-chips { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.grupo-chips .et { font-size:10.5px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#8A8FB5; width:66px; flex:none; }
.chips { display:flex; gap:6px; flex-wrap:wrap; }
.chips a { font-size:12.5px; font-weight:700; color:#1C2260; background:#fff; border:1.5px solid #DDD9C6; border-radius:999px; padding:7px 13px; text-decoration:none; white-space:nowrap; }
.chips a:hover { border-color:#2E4BC6; }
.chips a.actual { background:#1C2260; color:#fff; border-color:#1C2260; }
.explica { font-size:12.5px; color:#6A6F98; background:#fff; border:1px solid #E4E1D2; border-radius:10px; padding:9px 13px; margin-bottom:18px; }
.explica b { color:#1C2260; }
.podio { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; align-items:end; margin-bottom:18px; }
@media (max-width:640px) { .podio { grid-template-columns:1fr; } .podio-uno.lugar-1 { order:-1; } }
.podio-uno { background:#fff; border:1px solid #E4E1D2; border-radius:18px; padding:14px 12px 18px; text-align:center; position:relative; }
.podio-uno .cinta { font-size:30px; line-height:1; }
.podio-uno.lugar-1 { border:2px solid #F5C518; box-shadow:0 10px 28px rgba(245,197,24,.28); padding-top:20px; padding-bottom:26px; }
.podio-uno.lugar-1 .cinta { font-size:38px; }
.podio-uno.lugar-1 .pts { font-size:32px; }
.podio-uno b { display:block; font-size:18px; margin-top:8px; }
.podio-uno .pts { font-size:26px; font-weight:800; color:#2E4BC6; margin-top:8px; line-height:1.1; }
.podio-uno .mini-datos { font-size:11.5px; color:#6A6F98; margin-top:3px; }
.podio-uno .mini-datos.suave { color:#A9AECC; font-size:11px; }
.ava.grande { width:66px; height:66px; font-size:23px; margin:6px auto 0; }
.area-chip { display:inline-block; font-size:10.5px; font-weight:700; color:var(--c); background:color-mix(in srgb, var(--c) 14%, #fff); border:1px solid color-mix(in srgb, var(--c) 35%, #fff); border-radius:999px; padding:2px 9px; margin-top:5px; }
.area-chip.chico { font-size:9.5px; padding:1px 7px; margin-top:3px; }
.resumen-tot { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
.resumen-tot span { font-size:12px; color:#6A6F98; background:#fff; border:1px solid #E4E1D2; border-radius:999px; padding:6px 13px; }
.resumen-tot b { color:#1C2260; font-size:14px; }
h2 { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
table.awards { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E4E1D2; border-radius:14px; overflow:hidden; font-size:13.5px; }
table.awards th, table.awards td { padding:10px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:middle; }
table.awards th { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:#8A8FB5; }
table.awards th a { color:inherit; text-decoration:none; }
table.awards th a:hover { color:#2E4BC6; }
table.awards th.activa { color:#2E4BC6; }
table.awards td.activa { background:#F4F6FE; }
table.awards th.activa { background:#EEF1FC; }
table.awards tr:last-child td { border-bottom:none; }
table.awards tr.yo { background:#F4FBFD; }
table.awards tr.yo td.activa { background:#E8F3FA; }
table.awards .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
table.awards .num small { display:block; font-size:10px; color:#A9AECC; font-weight:500; }
table.awards .pos { font-size:17px; font-weight:800; color:#8A8FB5; width:42px; text-align:center; }
table.awards .pt { font-size:16px; color:#2E4BC6; }
table.awards .guion { color:#C9CCE0; }
.quien { display:flex; align-items:center; gap:10px; }
.quien b { font-size:14.5px; display:block; } .quien small { display:block; font-size:10.5px; color:#A9AECC; }
.medallitas { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; }
.medallitas span { font-size:10.5px; font-weight:700; background:#FDF6DC; color:#7A5C00; border:1px solid #F0E2AE; border-radius:999px; padding:2px 9px; }
.barra { width:58px; height:7px; background:#EFEDE0; border-radius:999px; overflow:hidden; display:inline-block; vertical-align:middle; margin-right:7px; }
.barra i { display:block; height:100%; border-radius:999px; }
.scroll { overflow-x:auto; }
.como { margin-top:16px; }
.como ul { margin:8px 0 8px 18px; font-size:13.5px; line-height:1.8; }
.como > b { font-size:14px; }
.vacio { color:#8A8FB5; font-size:13.5px; padding:26px 16px; text-align:center; background:#fff; border:1px dashed #DDD9C6; border-radius:16px; margin-bottom:18px; }
`;
