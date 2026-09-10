// Quién trae qué encima. Sirve para ver de un vistazo si alguien está sobrecargado
// y para abrir el perfil de cada persona o de cada área con sus tareas.
import { areaDe, iniciales, nombreCorto, puedeAsignar, ROLES, staffActivo, leerAreas,
         type Area, type Persona } from "./staff";
import { esAbierta, esc, esRecurrente, hechaTarde, paginaPortal, leerTareas, atrasada,
         cuando, type Tarea } from "./tareas";
import { navPortal } from "./portal";
import type { EventoLite } from "./portal";

export interface CargaPersona {
  p: Persona;
  area: Area;
  abiertas: number;      // pendientes + en curso
  curso: number;
  hechas: number;
  atrasadas: number;
  transversales: number;
  tareas: Tarea[];
}
export interface CargaArea {
  a: Area;
  abiertas: number;
  hechas: number;
  atrasadas: number;
  gente: number;
  sinDueno: number;      // tareas del área que no traen a nadie
  tareas: Tarea[];
}

/** El reparto tal como está hoy: una fila por persona y una por área. */
export function calcularCarga(tareas = leerTareas(), areas = leerAreas(), staff = staffActivo()) {
  const personas: CargaPersona[] = staff.map((p) => {
    const suyas = tareas.filter((t) => t.asignados.includes(p.matricula));
    const abiertas = suyas.filter(esAbierta);
    return {
      p, area: areaDe(p, areas),
      abiertas: abiertas.length,
      curso: suyas.filter((t) => t.estado === "curso").length,
      hechas: suyas.filter((t) => t.estado === "hecha").length,
      atrasadas: abiertas.filter(atrasada).length,
      transversales: suyas.filter(esRecurrente).length,
      tareas: [...suyas].sort((a, b) => Number(esAbierta(b)) - Number(esAbierta(a))),
    };
  }).sort((a, b) => b.abiertas - a.abiertas || a.p.nombre.localeCompare(b.p.nombre, "es"));

  const porArea: CargaArea[] = areas.map((a) => {
    const suyas = tareas.filter((t) => t.area === a.id);
    return {
      a,
      abiertas: suyas.filter(esAbierta).length,
      hechas: suyas.filter((t) => t.estado === "hecha").length,
      atrasadas: suyas.filter((t) => esAbierta(t) && atrasada(t)).length,
      gente: staff.filter((s) => areaDe(s, areas).id === a.id).length,
      sinDueno: suyas.filter((t) => esAbierta(t) && !t.asignados.length).length,
      tareas: [...suyas].sort((x, y) => Number(esAbierta(y)) - Number(esAbierta(x))),
    };
  }).sort((x, y) => y.abiertas - x.abiertas);

  const conAlgo = personas.filter((x) => x.abiertas > 0);
  const promedio = conAlgo.length
    ? personas.reduce((n, x) => n + x.abiertas, 0) / personas.length : 0;
  const tope = Math.max(1, ...personas.map((x) => x.abiertas));
  return { personas, porArea, promedio, tope, sinNadie: tareas.filter((t) => esAbierta(t) && !t.asignados.length).length };
}

/** Alguien va cargado si trae bastante más que el promedio del equipo. */
export const vaCargado = (x: CargaPersona, promedio: number) =>
  x.abiertas >= 3 && x.abiertas >= promedio * 1.5;
/** Y va suelto si no trae nada abierto habiendo trabajo repartido. */
export const vaSuelto = (x: CargaPersona, promedio: number) => x.abiertas === 0 && promedio >= 1;

export function renderCarga(p: Persona, eventos: EventoLite[]): string {
  const { personas, porArea, promedio, tope, sinNadie } = calcularCarga();
  const areas = leerAreas();

  const barra = (n: number, color: string, max = tope) =>
    `<div class="barra" title="${n} abiertas"><i style="width:${Math.round(100 * n / Math.max(1, max))}%;background:${color}"></i></div>`;

  const listaTareas = (l: Tarea[]) => l.length
    ? `<ul class="tl">${l.slice(0, 40).map((t) => {
        const a = areas.find((x) => x.id === t.area);
        const tarde = t.estado === "hecha" && hechaTarde(t, eventos.find((e) => e.id === t.vigencia.evento)?.fecha);
        return `<li class="est-${t.estado}${esAbierta(t) && atrasada(t) ? " roja" : ""}">
          <span class="tic">${t.estado === "hecha" ? "✓" : t.estado === "vencida" ? "✕" : t.estado === "curso" ? "▶" : "•"}</span>
          <span class="tt">${esc(t.titulo)}
            <i>${a ? esc(a.emoji + " " + a.nombre) + " · " : ""}${esc(cuando(t, eventos))}${esRecurrente(t) ? " · transversal" : ""}${tarde ? " · hecha tarde" : ""}</i></span></li>`;
      }).join("")}</ul>${l.length > 40 ? `<p class="det">y ${l.length - 40} más…</p>` : ""}`
    : '<p class="det">Nada por aquí todavía.</p>';

  const cuerpo = `
<div class="resumen-tot">
  <span><b>${Math.round(promedio * 10) / 10}</b> tareas abiertas por persona, en promedio</span>
  <span><b>${personas.filter((x) => vaCargado(x, promedio)).length}</b> con más carga de la cuenta</span>
  <span><b>${personas.filter((x) => vaSuelto(x, promedio)).length}</b> sin nada abierto</span>
  ${sinNadie ? `<span><b>${sinNadie}</b> tareas abiertas sin dueño</span>` : ""}
</div>

<h2>🧩 Por área</h2>
<div class="areas-carga">
${porArea.map((x) => `<details class="tarj-area">
  <summary>
    <span class="punto" style="background:${x.a.color}"></span>
    <span class="nom"><b>${esc(x.a.emoji + " " + x.a.nombre)}</b>
      <small>${x.gente} persona${x.gente === 1 ? "" : "s"} · ${x.hechas} hecha${x.hechas === 1 ? "" : "s"}${x.sinDueno ? ` · ${x.sinDueno} sin dueño` : ""}</small></span>
    <span class="cuenta"><b>${x.abiertas}</b><small>abiertas</small></span>
  </summary>
  ${barra(x.abiertas, x.a.color, Math.max(1, ...porArea.map((y) => y.abiertas)))}
  ${x.atrasadas ? `<p class="alerta">⏰ ${x.atrasadas} ya pasó${x.atrasadas === 1 ? "" : "n"} de fecha</p>` : ""}
  ${listaTareas(x.tareas)}
</details>`).join("")}
</div>

<h2>🙋 Por persona <small>de más cargada a menos</small></h2>
<div class="gente-carga">
${personas.map((x) => {
  const cargado = vaCargado(x, promedio);
  const suelto = vaSuelto(x, promedio);
  return `<details class="tarj-p${cargado ? " alta" : ""}"${x.p.matricula === p.matricula ? " open" : ""}>
    <summary>
      <span class="ava" style="--c:${x.area.color}">${esc(iniciales(x.p))}</span>
      <span class="nom"><b>${esc(nombreCorto(x.p))}</b>
        <small>${esc(ROLES[x.p.rol].nombre === x.area.nombre ? x.area.nombre : ROLES[x.p.rol].nombre + " de " + x.area.nombre)}</small></span>
      <span class="tags">
        ${cargado ? '<span class="tag mal">cargada</span>' : ""}
        ${suelto ? '<span class="tag libre">sin nada</span>' : ""}
        ${x.atrasadas ? `<span class="tag tarde">${x.atrasadas} fuera de fecha</span>` : ""}
      </span>
      <span class="cuenta"><b>${x.abiertas}</b><small>abiertas</small></span>
    </summary>
    ${barra(x.abiertas, x.area.color)}
    <p class="det">${x.curso} en curso · ${x.hechas} hecha${x.hechas === 1 ? "" : "s"}${x.transversales ? ` · ${x.transversales} transversal${x.transversales === 1 ? "" : "es"}` : ""}</p>
    ${listaTareas(x.tareas)}
  </details>`;
}).join("")}
</div>
<p class="det" style="margin-top:16px">Se cuentan solo las tareas abiertas (sin empezar y en curso). Alguien sale como <b>cargada</b> si trae al menos tres y más de vez y media el promedio del equipo.</p>`;

  return paginaPortal("Carga del equipo · MIND",
    `${navPortal(p, "carga", puedeAsignar(p))}<h1>⚖️ Carga del equipo</h1>
<p>Quién trae qué encima, por persona y por área</p>`, cuerpo, CSS_CARGA);
}

const CSS_CARGA = `
h2 { font-size:15px; margin:24px 0 12px; display:flex; align-items:center; gap:8px; }
h2 small { font-weight:600; font-size:12px; color:#8A8FB5; }
.resumen-tot { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:6px; }
.resumen-tot span { font-size:12px; color:#6A6F98; background:#fff; border:1px solid #E4E1D2; border-radius:999px; padding:6px 13px; }
.resumen-tot b { color:#1C2260; font-size:13px; }
.areas-carga, .gente-carga { display:flex; flex-direction:column; gap:9px; }
details.tarj-area, details.tarj-p { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:12px 15px; }
details.tarj-p.alta { border-color:#F1A9BE; background:#FFF9FB; }
summary { display:flex; align-items:center; gap:11px; cursor:pointer; list-style:none; }
summary::-webkit-details-marker { display:none; }
summary::after { content:"›"; margin-left:2px; color:#A8ADC9; font-weight:800; transform:rotate(90deg); flex:none; }
details[open] summary::after { transform:rotate(-90deg); }
summary .nom { flex:1; min-width:0; }
summary .nom b { display:block; font-size:14px; }
summary .nom small { display:block; font-size:11.5px; color:#8A8FB5; }
summary .cuenta { flex:none; text-align:right; }
summary .cuenta b { display:block; font-size:19px; font-weight:800; line-height:1; }
summary .cuenta small { font-size:10px; color:#8A8FB5; text-transform:uppercase; letter-spacing:.05em; }
summary .tags { display:flex; gap:4px; flex-wrap:wrap; flex:none; }
.tag { font-size:10.5px; font-weight:700; border-radius:999px; padding:3px 8px; background:#EFEDE2; color:#6A6F98; }
.tag.mal { background:#FDE7EC; color:#C2255C; }
.tag.tarde { background:#FDF3D7; color:#8A6A10; }
.tag.libre { background:#E8F3D9; color:#3F6B10; }
.ava { width:34px; height:34px; flex:none; font-size:12px; }
.punto { width:12px; height:12px; border-radius:50%; flex:none; }
.barra { height:7px; background:#EFEDE2; border-radius:99px; overflow:hidden; margin:11px 0 8px; }
.barra i { display:block; height:100%; border-radius:99px; }
.alerta { font-size:12px; font-weight:700; color:#C2255C; margin:0 0 8px; }
.det { font-size:12.5px; color:#6A6F98; margin:0 0 8px; }
ul.tl { list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:2px; }
ul.tl li { display:flex; gap:8px; font-size:13px; line-height:1.4; padding:3px 0; border-top:1px solid #F4F2E7; }
ul.tl .tic { color:#8A8FB5; font-weight:800; flex:none; width:12px; }
ul.tl .tt { min-width:0; }
ul.tl i { display:block; font-style:normal; font-size:11.5px; color:#A0A5C2; }
ul.tl li.est-hecha .tt { color:#A0A5C2; text-decoration:line-through; }
ul.tl li.est-hecha .tic { color:#8BC53F; }
ul.tl li.est-curso .tic { color:#29A3C7; }
ul.tl li.est-vencida { color:#A9AECC; }
ul.tl li.roja .tic { color:#C2255C; }
`;
