// MIND Awards: quién hace cuántas tareas, cuántas cumple y qué tanto se aparece.
// Sale de lo que ya existe: tareas del portal + asistencia a eventos y juntas.
import { areaDe, iniciales, leerAreas, nombreCorto, ROLES, staffActivo, type Persona } from "./staff";
import { leerTareas, esAbierta, esc, jsonSeguro, paginaPortal, fechaCorta, hoyISO, sumarDias,
         semanaActual, type Tarea } from "./tareas";
import { leerAsistencias, leerEventos, esJunta } from "./eventos";
import { navPortal } from "./portal";
import { puedeAsignar } from "./staff";

export type Periodo = "todo" | "mes" | "semana";
const NOMBRE_PERIODO: Record<Periodo, string> = {
  todo: "todo el semestre", mes: "este mes", semana: "esta semana",
};

export interface FilaAward {
  matricula: string; nombre: string; apodo: string; ini: string;
  area: string; color: string; rol: string;
  asignadas: number; hechas: number; pct: number; aTiempo: number;
  juntas: number; eventos: number; puntos: number;
  medallas: string[];
}

/** Fecha que "cuenta" para una tarea: cuándo se cerró, o cuándo nació. */
const fechaDe = (t: Tarea) => (t.hechaEl ?? t.creada).slice(0, 10);

/** ¿La tarea se entregó antes de su límite? Con evento, antes del evento. */
function aTiempo(t: Tarea, fechaEvento?: string): boolean {
  if (t.estado !== "hecha" || !t.hechaEl) return false;
  const limite = t.vigencia.tipo === "fechas" ? t.vigencia.fin
    : t.vigencia.tipo === "evento" ? fechaEvento : undefined;
  return !limite || t.hechaEl.slice(0, 10) <= limite;
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
  const asis = leerAsistencias().filter((a) => a.ts.slice(0, 10) >= desde);
  const evIdx = new Map(eventos.map((e) => [e.id, e]));

  const filas: FilaAward[] = staff.map((p) => {
    const suyas = tareas.filter((t) => t.asignados.includes(p.matricula) && fechaDe(t) >= desde);
    const hechas = suyas.filter((t) => t.estado === "hecha");
    const puntual = hechas.filter((t) => aTiempo(t, fechaEv.get(t.vigencia.evento ?? ""))).length;
    const mias = asis.filter((a) => a.matricula === p.matricula);
    const juntas = mias.filter((a) => { const e = evIdx.get(a.evento); return e && esJunta(e); }).length;
    const evs = mias.length - juntas;
    return {
      matricula: p.matricula, nombre: p.nombre, apodo: nombreCorto(p), ini: iniciales(p),
      area: areaDe(p, areas).nombre, color: areaDe(p, areas).color, rol: ROLES[p.rol].nombre,
      asignadas: suyas.length, hechas: hechas.length,
      pct: suyas.length ? Math.round(100 * hechas.length / suyas.length) : 0,
      aTiempo: puntual, juntas, eventos: evs,
      puntos: hechas.length * 10 + puntual * 3 + juntas * 5 + evs * 8,
      medallas: [],
    };
  });

  // reconocimientos: solo se dan si de verdad hay algo que reconocer
  const mejorEn = (f: (x: FilaAward) => number, etiqueta: string) => {
    const tope = Math.max(0, ...filas.map(f));
    if (tope <= 0) return;
    for (const x of filas) if (f(x) === tope) x.medallas.push(etiqueta);
  };
  mejorEn((x) => x.hechas, "🏆 Más tareas hechas");
  mejorEn((x) => x.juntas, "📋 Más juntas");
  mejorEn((x) => x.eventos, "🎟️ Más eventos");
  mejorEn((x) => (x.asignadas >= 3 ? x.pct : 0), "🎯 Mejor cumplimiento");
  mejorEn((x) => x.aTiempo, "⏱️ Más puntual");

  filas.sort((a, b) => b.puntos - a.puntos || b.hechas - a.hechas || a.nombre.localeCompare(b.nombre));
  const totales = {
    tareas: tareas.length,
    hechas: tareas.filter((t) => t.estado === "hecha").length,
    abiertas: tareas.filter(esAbierta).length,
    juntas: eventos.filter(esJunta).length,
    eventos: eventos.filter((e) => !esJunta(e)).length,
  };
  return { filas, totales, desde, periodo, etiqueta: NOMBRE_PERIODO[periodo] };
}

const MEDALLA = ["🥇", "🥈", "🥉"];

export function renderAwards(p: Persona, periodo: Periodo): string {
  const r = calcularAwards(periodo);
  const conPuntos = r.filas.filter((x) => x.puntos > 0);
  const podio = conPuntos.slice(0, 3);
  const tarjetaPodio = (x: FilaAward, i: number) => `
    <div class="podio-uno lugar-${i + 1}">
      <div class="medalla">${MEDALLA[i]}</div>
      <span class="ava grande" style="--c:${x.color}">${esc(x.ini)}</span>
      <b>${esc(x.apodo)}</b>
      <small>${esc(x.area)}</small>
      <div class="pts">${x.puntos} pts</div>
      <div class="mini-datos">${x.hechas} tarea${x.hechas === 1 ? "" : "s"} · ${x.juntas} junta${x.juntas === 1 ? "" : "s"} · ${x.eventos} evento${x.eventos === 1 ? "" : "s"}</div>
    </div>`;
  const filas = r.filas.map((x, i) => `
    <tr${x.matricula === p.matricula ? ' class="yo"' : ""}>
      <td class="pos">${x.puntos > 0 && i < 3 ? MEDALLA[i] : i + 1}</td>
      <td><div class="quien"><span class="ava" style="--c:${x.color}">${esc(x.ini)}</span>
        <div><b>${esc(x.apodo)}</b><small>${esc(x.nombre)} · ${esc(x.rol)} de ${esc(x.area)}</small></div></div>
        ${x.medallas.length ? `<div class="medallitas">${x.medallas.map((m) => `<span>${m}</span>`).join("")}</div>` : ""}</td>
      <td class="num">${x.hechas}<small>de ${x.asignadas}</small></td>
      <td class="num"><div class="barra" title="${x.pct}%"><i style="width:${x.pct}%;background:${x.color}"></i></div><b>${x.pct}%</b></td>
      <td class="num">${x.aTiempo}</td>
      <td class="num">${x.juntas}</td>
      <td class="num">${x.eventos}</td>
      <td class="num pt"><b>${x.puntos}</b></td>
    </tr>`).join("");
  const chip = (v: Periodo, txt: string) =>
    `<a href="/tareas/awards?periodo=${v}"${v === periodo ? ' class="actual"' : ""}>${txt}</a>`;
  const datosImg = { podio: podio.map((x) => ({ apodo: x.apodo, ini: x.ini, color: x.color, puntos: x.puntos, hechas: x.hechas })),
                     tabla: r.filas.filter((x) => x.puntos > 0).map((x) => ({ apodo: x.apodo, ini: x.ini, color: x.color, puntos: x.puntos, hechas: x.hechas, juntas: x.juntas, eventos: x.eventos })),
                     etiqueta: r.etiqueta };
  const cuerpo = `
<div class="vistas">${chip("todo", "Todo el semestre")}${chip("mes", "Este mes")}${chip("semana", "Esta semana")}
  <button class="btn sec" type="button" onclick="descargar()" style="margin-left:auto">⬇ Descargar imagen</button></div>

${podio.length ? `<div class="podio">${podio.map(tarjetaPodio).join("")}</div>` : '<div class="vacio">Todavía no hay nada que contar en este periodo. En cuanto se marquen tareas como hechas o se pase lista, aparece aquí.</div>'}

<h2>Tabla completa <small>${esc(r.etiqueta)}</small></h2>
<div class="scroll"><table class="awards">
  <tr><th></th><th>Persona</th><th class="num">Tareas</th><th class="num">Cumple</th><th class="num" title="Cerradas antes de su fecha o del evento">A tiempo</th><th class="num">Juntas</th><th class="num">Eventos</th><th class="num">Puntos</th></tr>
  ${filas}
</table></div>

<div class="tarjeta como" style="margin-top:14px">
  <b>Cómo se cuentan los puntos</b>
  <ul>
    <li><b>10 puntos</b> por cada tarea marcada como hecha.</li>
    <li><b>3 puntos extra</b> si se cerró antes de su fecha límite o antes del evento al que pertenece.</li>
    <li><b>5 puntos</b> por cada junta a la que asistió.</li>
    <li><b>8 puntos</b> por cada evento de MIND al que se apareció.</li>
  </ul>
  <p class="det">Las tareas asignadas a TODOS no se le cuentan a nadie en particular, para que nadie sume por algo que no hizo. Nada resta puntos: esto es para reconocer, no para regañar.</p>
</div>
<canvas id="lienzo" hidden></canvas>
<script>
const A = ${jsonSeguro(datosImg)};
function dibuja() {
  const c = document.getElementById('lienzo');
  const x = c.getContext('2d');
  const AN = 1200, filas = A.tabla.length;
  const ALTO = 300 + (A.podio.length ? 260 : 0) + filas * 54 + 90;
  c.width = AN; c.height = ALTO;
  x.fillStyle = '#F7F5EC'; x.fillRect(0, 0, AN, ALTO);
  const g = x.createLinearGradient(0, 0, AN, 190);
  g.addColorStop(0, '#29A3C7'); g.addColorStop(.6, '#2E4BC6'); g.addColorStop(1, '#232D93');
  x.fillStyle = g; x.fillRect(0, 0, AN, 190);
  x.fillStyle = '#fff'; x.textAlign = 'center';
  x.font = '800 62px Poppins, sans-serif'; x.fillText('MIND AWARDS', AN / 2, 92);
  x.font = '600 25px Poppins, sans-serif'; x.fillStyle = '#CFE4F5';
  x.fillText(A.etiqueta.charAt(0).toUpperCase() + A.etiqueta.slice(1), AN / 2, 132);
  let y = 250;
  if (A.podio.length) {
    const anchos = [0, -300, 300];
    const medallas = ['🥇', '🥈', '🥉'];
    A.podio.forEach((p, i) => {
      const cx = AN / 2 + (anchos[i] || 0);
      const cy = y + (i === 0 ? 0 : 30);
      x.font = '52px Poppins, sans-serif'; x.fillText(medallas[i], cx, cy);
      x.beginPath(); x.arc(cx, cy + 68, 44, 0, 7); x.fillStyle = p.color; x.fill();
      x.fillStyle = '#fff'; x.font = '800 30px Poppins, sans-serif'; x.fillText(p.ini, cx, cy + 80);
      x.fillStyle = '#1C2260'; x.font = '800 27px Poppins, sans-serif'; x.fillText(p.apodo, cx, cy + 142);
      x.fillStyle = '#6A6F98'; x.font = '600 21px Poppins, sans-serif';
      x.fillText(p.puntos + ' pts · ' + p.hechas + ' tareas', cx, cy + 172);
    });
    y += 260;
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
    x.fillStyle = '#8A8FB5'; x.font = '500 19px Poppins, sans-serif';
    x.fillText(p.hechas + ' tareas · ' + p.juntas + ' juntas · ' + p.eventos + ' eventos', 470, fy);
    x.fillStyle = '#2E4BC6'; x.font = '800 24px Poppins, sans-serif'; x.textAlign = 'right';
    x.fillText(p.puntos + ' pts', AN - 92, fy); x.textAlign = 'left';
  });
  x.fillStyle = '#8A8FB5'; x.font = '600 20px Poppins, sans-serif';
  x.fillText('MIND · LiFE Grupos Estudiantiles · @mindmty', 70, ALTO - 40);
  const paleta = ['#8BC53F','#F5C518','#EC4899','#C026D3','#22B8CF'];
  paleta.forEach((p2, i) => { x.fillStyle = p2; x.beginPath(); x.arc(AN - 70 - (4 - i) * 26, ALTO - 47, 8, 0, 7); x.fill(); });
}
function descargar() {
  dibuja();
  const a = document.createElement('a');
  a.download = 'mind-awards.png';
  a.href = document.getElementById('lienzo').toDataURL('image/png');
  a.click();
}
</script>`;
  return paginaPortal("MIND Awards", `${navPortal(p, "awards", puedeAsignar(p))}<h1>🏆 MIND Awards</h1>
<p>Quién hace cuántas tareas, cuántas cumple y qué tanto se aparece</p>`, cuerpo, CSS_AWARDS);
}

const CSS_AWARDS = `
.podio { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; align-items:end; margin-bottom:22px; }
@media (max-width:640px) { .podio { grid-template-columns:1fr; } }
.podio-uno { background:#fff; border:1px solid #E4E1D2; border-radius:16px; padding:16px 12px; text-align:center; }
.podio-uno.lugar-1 { border-color:#F5C518; box-shadow:0 6px 20px rgba(245,197,24,.25); padding-top:22px; padding-bottom:22px; }
.podio-uno .medalla { font-size:32px; }
.podio-uno b { display:block; font-size:17px; margin-top:8px; }
.podio-uno small { font-size:11.5px; color:#8A8FB5; }
.podio-uno .pts { font-size:24px; font-weight:800; color:#2E4BC6; margin-top:6px; }
.podio-uno .mini-datos { font-size:11.5px; color:#6A6F98; margin-top:2px; }
.ava.grande { width:62px; height:62px; font-size:22px; margin:8px auto 0; }
table.awards { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E4E1D2; border-radius:14px; overflow:hidden; font-size:13.5px; }
table.awards th, table.awards td { padding:9px 10px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:middle; }
table.awards th { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; }
table.awards tr:last-child td { border-bottom:none; }
table.awards tr.yo { background:#F4FBFD; }
table.awards .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
table.awards .num small { display:block; font-size:10.5px; color:#8A8FB5; font-weight:500; }
table.awards .pos { font-size:16px; font-weight:800; color:#6A6F98; width:38px; text-align:center; }
table.awards .pt b { font-size:16px; color:#2E4BC6; }
.quien { display:flex; align-items:center; gap:9px; }
.quien b { font-size:14px; } .quien small { display:block; font-size:11px; color:#8A8FB5; }
.medallitas { display:flex; gap:5px; flex-wrap:wrap; margin-top:5px; }
.medallitas span { font-size:10.5px; font-weight:700; background:#FDF6DC; color:#7A5C00; border:1px solid #F0E2AE; border-radius:999px; padding:2px 8px; }
.barra { width:64px; height:7px; background:#EFEDE0; border-radius:999px; overflow:hidden; display:inline-block; vertical-align:middle; margin-right:6px; }
.barra i { display:block; height:100%; border-radius:999px; }
.scroll { overflow-x:auto; }
.como ul { margin:8px 0 8px 18px; font-size:13.5px; line-height:1.8; }
.como > b { font-size:14px; }
.vistas a.actual { background:#1C2260; color:#fff; border-color:#1C2260; }
`;
