// Pantallas del portal de tareas de MIND: entrada, calendario de cada quien,
// tablero visual por área, lámina semanal, cierre de semana y equipo.
import { ROLES, areaDe, esPresidencia, dirigeArea, nombreCorto, puedeAsignar, iniciales,
         type Area, type Persona, type RolId } from "./staff";
import { ESTADOS, atrasada, badgeArea, badgeEstado, cuando, esAbierta, esc, fechaCorta, hoyISO,
         jsonSeguro, paginaPortal, quienes, rangoSemana, semanaActual, sumarDias, lunesDe,
         tocaA, enSemana, hechaTarde, esRecurrente, type Tarea } from "./tareas";

export interface EventoLite {
  id: string; titulo: string; fecha: string;
  tipo?: string; tipoNombre?: string; color?: string; tinta?: string; emoji?: string;
  junta?: boolean; hora?: string; lugar?: string; abierto?: boolean; prereg?: boolean;
}

// ---------------- navegación ----------------
/** Barra del portal. Quien tiene nivel de presidencia también ve las pestañas de administración. */
export function navPortal(p: Persona, actual: string, puede: boolean): string {
  const t: [string, string, string][] = [["yo", "/portal", "🙋 Mis tareas"]];
  if (puede) t.push(["tablero", "/tareas", "🗂️ Tablero"], ["semana", "/tareas/semana", "🖼️ Lámina"]);
  t.push(["awards", "/tareas/awards", "🏆 Awards"]);
  if (esPresidencia(p)) t.push(["equipo", "/tareas/equipo", "👥 Equipo"]);
  const admin = esPresidencia(p)
    ? `<span class="sep"></span><a href="/admin?via=portal">📊 Panel</a><a href="/cuentas?via=portal">💰 Cuentas</a><a href="/eventos?via=portal">🎟️ Eventos</a><a href="/galeria?via=portal">🖼️ Galería</a>`
    : "";
  return `<nav class="nav-portal">${t.map(([k, href, txt]) =>
    `<a href="${href}"${k === actual ? ' class="actual"' : ""}>${txt}</a>`).join("")}${admin}
    <a href="/portal/salir" class="salir">Salir</a></nav>`;
}
const cabecera = (p: Persona, actual: string, titulo: string, sub: string) =>
  `${navPortal(p, actual, puedeAsignar(p))}<h1>${esc(titulo)}</h1><p>${esc(sub)}</p>`;

// ---------------- entrar ----------------
const CSS_ENTRADA = `
* { margin:0; padding:0; box-sizing:border-box; }
body { min-height:100vh; color:#1C2260; font-family:'Poppins','Segoe UI',system-ui,sans-serif; display:flex; align-items:center; justify-content:center; padding:20px; }
.caja { background:#F7F5EC; border-radius:20px; padding:30px 26px; width:100%; max-width:390px; box-shadow:0 20px 50px rgba(12,14,40,.3); }
h1 { font-size:24px; font-weight:800; }
p.sub { font-size:13px; color:#6A6F98; margin:4px 0 20px; line-height:1.5; }
label { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; display:block; margin-bottom:4px; }
input { width:100%; font:inherit; font-size:17px; padding:12px 14px; border:1.5px solid #DDD9C6; border-radius:12px; background:#fff; color:#1C2260; min-height:50px; }
input:focus { outline:2px solid #2E4BC6; outline-offset:1px; border-color:#2E4BC6; }
form { display:grid; gap:14px; }
button { font:inherit; font-weight:800; font-size:16px; color:#fff; background:#2E4BC6; border:none; border-radius:999px; padding:14px; min-height:50px; cursor:pointer; }
button:hover { filter:brightness(.92); }
.err { background:#FDE8E8; border:1px solid #F0B8B8; color:#8A2626; border-radius:10px; padding:10px 14px; font-size:13px; margin-bottom:14px; }
.puntos { display:flex; gap:8px; justify-content:center; margin-top:22px; }
.puntos i { width:9px; height:9px; border-radius:50%; display:block; }
.pie { text-align:center; font-size:11.5px; color:#8A8FB5; margin-top:12px; }
`;
const PUNTITOS = `<div class="puntos"><i style="background:#8BC53F"></i><i style="background:#F5C518"></i><i style="background:#EC4899"></i><i style="background:#C026D3"></i><i style="background:#22B8CF"></i></div>`;
const FUENTE_LINK = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">`;

export function renderEntrar(error?: string, matricula = ""): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Portal MIND</title>${FUENTE_LINK}
<style>${CSS_ENTRADA} body { background:linear-gradient(150deg,#29A3C7,#2E4BC6 55%,#232D93); }</style></head><body>
<div class="caja">
  <h1>Portal MIND</h1>
  <p class="sub">Entra con tu matrícula y tu PIN. Si es tu primera vez, usa el PIN que te compartió Alexa y enseguida eliges el tuyo.</p>
  ${error ? `<div class="err">${esc(error)}</div>` : ""}
  <form method="post" action="/portal/entrar" autocomplete="on">
    <div><label for="m">Matrícula</label>
      <input id="m" name="matricula" required maxlength="12" placeholder="A0XXXXXXX" value="${esc(matricula)}"
        style="text-transform:uppercase" autocapitalize="characters" autocomplete="username"></div>
    <div><label for="p">PIN</label>
      <input id="p" name="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4"
        placeholder="4 dígitos" autocomplete="current-password"></div>
    <button type="submit">Entrar</button>
  </form>
  ${PUNTITOS}<p class="pie">MIND · LiFE Grupos Estudiantiles</p>
</div></body></html>`;
}

export function renderElegirPin(p: Persona, error?: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Elige tu PIN · MIND</title>${FUENTE_LINK}
<style>${CSS_ENTRADA} body { background:linear-gradient(150deg,#8BC53F,#2E4BC6 55%,#232D93); } button { background:#3F6B10; }</style></head><body>
<div class="caja">
  <h1>Hola, ${esc(nombreCorto(p))} 👋</h1>
  <p class="sub">Elige un PIN de cuatro dígitos que solo tú sepas. Con ese vas a entrar de ahora en adelante.</p>
  ${error ? `<div class="err">${esc(error)}</div>` : ""}
  <form method="post" action="/portal/pin">
    <div><label for="p1">Tu nuevo PIN</label>
      <input id="p1" name="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="4 dígitos" autocomplete="new-password"></div>
    <div><label for="p2">Repítelo</label>
      <input id="p2" name="pin2" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="4 dígitos" autocomplete="new-password"></div>
    <button type="submit">Guardar y entrar</button>
  </form>
</div></body></html>`;
}

// ---------------- piezas compartidas ----------------
const avatar = (p: Persona, areas: Area[], extra = "") =>
  `<span class="ava" style="--c:${areaDe(p, areas).color}" title="${esc(p.nombre)}"${extra}>${esc(iniciales(p))}</span>`;

/** Tarjeta de lista (la usan Mis tareas en vista de lista y el tablero en vista de lista). */
function tarjeta(t: Tarea, yo: Persona, areas: Area[], staff: Persona[], eventos: EventoLite[],
                 opciones: { editable: boolean; volver: string; otras?: Tarea[] }): string {
  const a = areas.find((x) => x.id === t.area) ?? { id: "", nombre: "Sin área", color: "#6A6F98", tinta: "#fff", emoji: "•", orden: 99 };
  const mio = tocaA(t, yo.matricula);
  const puedeMarcar = mio || dirigeArea(yo, t.area, areas);
  const atras = atrasada(t);
  const fechaEv = eventos.find((x) => x.id === t.vigencia.evento)?.fecha;
  const tarde = hechaTarde(t, fechaEv);
  const otras = (opciones.otras ?? []).filter((x) => x.id !== t.id);
  const evi = t.evidencia.map((e, i) => {
    const quien = staff.find((x) => x.matricula === e.por);
    const puedeQuitar = e.por === yo.matricula || dirigeArea(yo, t.area, areas);
    const oculto = `<input type="hidden" name="id" value="${esc(t.id)}"><input type="hidden" name="i" value="${i}"><input type="hidden" name="volver" value="${esc(opciones.volver)}">`;
    const enlace = e.tipo === "enlace"
      ? `<a href="${esc(e.url ?? "")}" target="_blank" rel="noopener">🔗 ${esc(e.nombre)}</a>`
      : `<a href="/tareas/evidencia/${esc(e.archivo ?? "")}" target="_blank">📎 ${esc(e.nombre)}</a>`;
    return `<div class="evi-uno">${enlace}
      <small>${quien ? esc(nombreCorto(quien)) : ""} · ${esc(fechaCorta(e.ts.slice(0, 10)))}</small>
      ${puedeQuitar ? `<form method="post" action="/tareas/evidencia/quitar" onsubmit="return confirm('¿Quitar «${esc(e.nombre)}» de esta tarea?')">${oculto}<button class="x" type="submit" title="Quitar">✕</button></form>${otras.length ? `<form method="post" action="/tareas/evidencia/mover" class="mover">${oculto}<select name="destinoId" onchange="if(this.value)this.form.submit()"><option value="">mover a…</option>${otras.slice(0, 40).map((x) => `<option value="${esc(x.id)}">${esc(x.titulo.slice(0, 60))}</option>`).join("")}</select></form>` : ""}` : ""}
    </div>`;
  }).join("");
  const oculto = `<input type="hidden" name="id" value="${esc(t.id)}"><input type="hidden" name="volver" value="${esc(opciones.volver)}">`;
  const acciones: string[] = [];
  if (puedeMarcar && esAbierta(t)) {
    if (t.estado === "pendiente") acciones.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="curso"><button class="btn sec mini" type="submit">▶ Empezar</button></form>`);
    acciones.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="hecha"><button class="btn ok mini" type="submit">${esRecurrente(t) ? "✓ Ya la hice esta semana" : "✓ Marcar hecha"}</button></form>`);
    acciones.push(`<form method="post" action="/tareas/posponer">${oculto}<button class="btn sec mini" type="submit">→ Posponer</button></form>`);
  }
  if (puedeMarcar && !esAbierta(t)) {
    acciones.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="pendiente"><button class="btn sec mini" type="submit">↺ Reabrir</button></form>`);
  }
  if (puedeMarcar) acciones.push(`<button class="btn sec mini" type="button" onclick="toggle('ev-${esc(t.id)}')">📎 Evidencia</button>`);
  if (opciones.editable) {
    acciones.push(`<button class="btn sec mini" type="button" onclick="toggle('ed-${esc(t.id)}')">✎ Editar</button>`);
    if (esAbierta(t)) acciones.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="vencida"><button class="btn sec mini peligro" type="submit">Dar por vencida</button></form>`);
    acciones.push(`<form method="post" action="/tareas/borrar" onsubmit="return confirm('¿Borrar «${esc(t.titulo)}»? No se puede deshacer.')">${oculto}<button class="btn sec mini peligro" type="submit">Borrar</button></form>`);
  }
  const opcionesPersonas = staff.filter((s) => s.activo).map((s) =>
    `<option value="${esc(s.matricula)}"${t.asignados.includes(s.matricula) ? " selected" : ""}>${esc(nombreCorto(s))} · ${esc(areaDe(s, areas).nombre)}</option>`).join("");
  const formEditar = opciones.editable ? `<div id="ed-${esc(t.id)}" class="panel" hidden>
  <form method="post" action="/tareas/editar" class="fila">
    ${oculto}
    <div style="grid-column:1/-1"><label>Título</label><input name="titulo" value="${esc(t.titulo)}" required maxlength="120"></div>
    <div style="grid-column:1/-1"><label>Detalle</label><input name="detalle" value="${esc(t.detalle ?? "")}" maxlength="300"></div>
    <div><label>Área</label><select name="area">${areas.map((x) => `<option value="${esc(x.id)}"${x.id === t.area ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select></div>
    <div><label>Vigencia</label><select name="vigencia">
      <option value="fechas"${t.vigencia.tipo === "fechas" ? " selected" : ""}>Con fechas</option>
      <option value="transversal"${t.vigencia.tipo === "transversal" ? " selected" : ""}>Transversal</option>
      <option value="evento"${t.vigencia.tipo === "evento" ? " selected" : ""}>Para un evento</option></select></div>
    <div><label>Del</label><input type="date" name="inicio" value="${esc(t.vigencia.inicio ?? "")}"></div>
    <div><label>Al</label><input type="date" name="fin" value="${esc(t.vigencia.fin ?? "")}"></div>
    <div><label>Evento</label><select name="evento"><option value="">(ninguno)</option>${eventos.map((e) =>
      `<option value="${esc(e.id)}"${e.id === t.vigencia.evento ? " selected" : ""}>${esc(e.titulo)}</option>`).join("")}</select></div>
    <div style="grid-column:1/-1"><label>Responsables (vacío = TODOS)</label>
      <select name="asignados" multiple size="5">${opcionesPersonas}</select></div>
    <div style="grid-column:1/-1"><button class="btn" type="submit">Guardar cambios</button></div>
  </form></div>` : "";
  const formEvidencia = puedeMarcar ? `<div id="ev-${esc(t.id)}" class="panel" hidden>
  <form method="post" action="/tareas/evidencia" enctype="multipart/form-data" class="fila">
    ${oculto}
    <div><label>Subir archivo o foto</label><input type="file" name="archivo" accept="image/*,application/pdf,video/*"></div>
    <div><label>O pegar un enlace</label><input name="url" type="url" placeholder="https://drive.google.com/…"></div>
    <div><label>Nombre (opcional)</label><input name="nombre" maxlength="60" placeholder="p. ej. Captura del post"></div>
    <div style="align-self:end"><button class="btn" type="submit">Adjuntar</button></div>
  </form></div>` : "";
  return `<article class="tarea${atras ? " atrasada" : ""}${esAbierta(t) ? "" : " hecha"}" id="t-${esc(t.id)}">
  <h3>${esc(t.titulo)}</h3>
  ${t.detalle ? `<div class="det">${esc(t.detalle)}</div>` : ""}
  <div class="meta">${badgeArea(a)} ${badgeEstado(t)} <span>${esc(cuando(t, eventos))}</span>
    ${atras ? '<span class="tag mal">atrasada</span>' : ""}
    ${tarde ? '<span class="tag tarde">hecha tarde</span>' : ""}
    ${esRecurrente(t) && t.estado === "hecha" ? '<span class="tag repite">✓ esta semana · vuelve el lunes</span>' : ""}
    ${esRecurrente(t) && t.vueltas?.length ? `<span>· ${t.vueltas.length} semana${t.vueltas.length === 1 ? "" : "s"} cumplida${t.vueltas.length === 1 ? "" : "s"}</span>` : ""}
    <span>· ${esc(quienes(t, staff))}</span>
    ${t.hechaEl ? `<span>· ${esRecurrente(t) ? "cumplida" : "hecha"} el ${esc(fechaCorta(t.hechaEl.slice(0, 10)))}</span>` : ""}</div>
  ${evi ? `<div class="evid">${evi}</div>` : ""}
  ${acciones.length ? `<div class="acc">${acciones.join("")}</div>` : ""}
  ${formEvidencia}${formEditar}
</article>`;
}

const JS_TOGGLE = `<script>function toggle(id) { const e = document.getElementById(id); if (e) e.hidden = !e.hidden; }</script>`;
const CSS_PANEL = `
.panel { background:#F4FBFD; border:1px solid #DDF1F8; border-radius:12px; padding:12px; margin-top:10px; }
.panel input, .panel select { min-height:40px; font-size:14px; padding:8px 10px; }
.panel select[multiple] { min-height:120px; }
.grupo { margin-bottom:22px; }
.grupo > h3 { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#6A6F98; margin-bottom:8px; }
.ava { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; background:var(--c,#6A6F98); color:#fff; font-size:11px; font-weight:800; letter-spacing:.02em; flex:none; }
.vistas { display:flex; gap:6px; margin:4px 0 14px; flex-wrap:wrap; }
.vistas a { font-size:12.5px; font-weight:700; color:#1C2260; background:#EFEDDF; border:1.5px solid #DDD9C6; border-radius:999px; padding:7px 13px; text-decoration:none; }
.vistas a.actual { background:#1C2260; color:#fff; border-color:#1C2260; }
`;

// ---------------- mis tareas: calendario + lista ----------------
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function diasVisibles(t: Tarea, eventos: EventoLite[]): { ini: string; fin: string } | null {
  const v = t.vigencia;
  if (v.tipo === "evento") {
    const e = eventos.find((x) => x.id === v.evento);
    return e ? { ini: e.fecha, fin: e.fecha } : null;
  }
  if (v.tipo !== "fechas" || (!v.inicio && !v.fin)) return null;
  return { ini: v.inicio ?? v.fin!, fin: v.fin ?? v.inicio! };
}

export function renderYo(p: Persona, todas: Tarea[], areas: Area[], staff: Persona[],
                         eventos: EventoLite[], aviso?: string, mes?: string): string {
  const mias = todas.filter((t) => tocaA(t, p.matricula));
  const abiertas = mias.filter(esAbierta);
  const hoy = hoyISO();
  const mesActual = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : hoy.slice(0, 7);
  const [anio, mesNum] = mesActual.split("-").map(Number);
  const primero = `${mesActual}-01`;
  const inicioGrid = lunesDe(primero);
  const ultimoDia = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate();
  const ultimo = `${mesActual}-${String(ultimoDia).padStart(2, "0")}`;
  const mesAnt = new Date(Date.UTC(anio, mesNum - 2, 1)).toISOString().slice(0, 7);
  const mesSig = new Date(Date.UTC(anio, mesNum, 1)).toISOString().slice(0, 7);

  // qué tarea cae en qué día (solo las mías, abiertas o cerradas hace poco)
  const recientes = mias.filter((t) => esAbierta(t) || (t.hechaEl ?? t.creada) >= sumarDias(hoy, -45));
  const porDia = new Map<string, { t: Tarea; pos: "ini" | "mid" | "fin" | "solo" }[]>();
  const transversales = recientes.filter((t) => !diasVisibles(t, eventos));
  for (const t of recientes) {
    const r = diasVisibles(t, eventos);
    if (!r) continue;
    for (let d = r.ini; d <= r.fin && d <= sumarDias(ultimo, 6); d = sumarDias(d, 1)) {
      if (d < inicioGrid) continue;
      const pos = r.ini === r.fin ? "solo" : d === r.ini ? "ini" : d === r.fin ? "fin" : "mid";
      (porDia.get(d) ?? porDia.set(d, []).get(d)!).push({ t, pos });
    }
  }
  const areaDeT = (t: Tarea) => areas.find((a) => a.id === t.area);
  const chip = (t: Tarea, pos: string) => {
    const a = areaDeT(t);
    return `<button type="button" class="chip-cal ${pos} est-${t.estado}" style="--c:${a?.color ?? "#6A6F98"}" data-t="${esc(t.id)}" title="${esc(t.titulo)}">${pos === "mid" || pos === "fin" ? "" : esc(t.titulo)}</button>`;
  };
  // eventos y juntas del mes que se está viendo (más los que tocan sus orillas)
  const desde = inicioGrid, hasta = sumarDias(ultimo, 6);
  const evMes = eventos.filter((e) => e.fecha >= desde && e.fecha <= hasta)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const porEvento = new Map<string, Tarea[]>();
  for (const t of todas) {
    if (t.vigencia.tipo !== "evento" || !t.vigencia.evento) continue;
    const l = porEvento.get(t.vigencia.evento) ?? [];
    l.push(t);
    porEvento.set(t.vigencia.evento, l);
  }
  const datosEv = evMes.map((e) => {
    const suyas = porEvento.get(e.id) ?? [];
    return {
      id: e.id, titulo: e.titulo, fecha: e.fecha, hora: e.hora ?? "", lugar: e.lugar ?? "",
      tipo: e.tipoNombre ?? "", emoji: e.emoji ?? "📅", color: e.color ?? "#6A6F98", tinta: e.tinta ?? "#fff",
      junta: Boolean(e.junta), abierto: e.abierto !== false, prereg: Boolean(e.prereg),
      tareas: suyas.map((t) => ({
        id: t.id, titulo: t.titulo, estado: t.estado, mia: tocaA(t, p.matricula),
        area: areas.find((a) => a.id === t.area)?.nombre ?? "Sin área",
        areaColor: areas.find((a) => a.id === t.area)?.color ?? "#6A6F98",
        gente: t.asignados.map((m) => {
          const s = staff.find((x) => x.matricula === m);
          return s ? { ini: iniciales(s), nombre: s.nombre, apodo: nombreCorto(s), color: areaDe(s, areas).color } : null;
        }).filter(Boolean),
      })),
    };
  });
  const evPorDia = new Map<string, typeof datosEv>();
  for (const e of datosEv) {
    const l = evPorDia.get(e.fecha) ?? [];
    l.push(e);
    evPorDia.set(e.fecha, l);
  }
  const franja = (e: typeof datosEv[number]) =>
    `<button type="button" class="ev${e.abierto ? "" : " cerrado"}" style="--c:${e.color};--t:${e.tinta}" data-ev="${esc(e.id)}"
      title="${esc(e.emoji + " " + e.titulo)}">${e.emoji} <span>${esc(e.titulo)}</span>${e.tareas.length ? `<i>${e.tareas.length}</i>` : ""}</button>`;
  let celdas = "";
  for (let d = inicioGrid, i = 0; (d <= ultimo || i % 7 !== 0) && i < 42; d = sumarDias(d, 1), i++) {
    const otroMes = !d.startsWith(mesActual);
    const lista = porDia.get(d) ?? [];
    const evs = evPorDia.get(d) ?? [];
    celdas += `<div class="dia${otroMes ? " otro" : ""}${d === hoy ? " hoy" : ""}${evs.length ? " conev" : ""}" data-d="${d}">
      <span class="num">${Number(d.slice(8))}</span>${evs.map(franja).join("")}${lista.map((x) => chip(x.t, x.pos)).join("")}</div>`;
  }
  const editable = puedeAsignar(p, areas);
  const plantilla = (t: Tarea) => {
    const a = areaDeT(t);
    const oculto = `<input type="hidden" name="id" value="${esc(t.id)}"><input type="hidden" name="volver" value="/portal?mes=${mesActual}">`;
    const acc: string[] = [];
    if (esAbierta(t)) {
      if (t.estado === "pendiente") acc.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="curso"><button class="btn sec mini">▶ Empezar</button></form>`);
      acc.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="hecha"><button class="btn ok mini">✓ Hecha</button></form>`);
      acc.push(`<form method="post" action="/tareas/posponer">${oculto}<button class="btn sec mini">→ Posponer</button></form>`);
    } else {
      acc.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="pendiente"><button class="btn sec mini">↺ Reabrir</button></form>`);
    }
    acc.push(`<a class="btn sec mini" href="#t-${esc(t.id)}" onclick="cerrarHoja();document.getElementById('v-lista').click()">📎 Evidencia y detalle</a>`);
    return `<template id="tpl-${esc(t.id)}"><div class="hoja-item">
      <b>${esc(t.titulo)}</b>
      <div class="meta">${a ? badgeArea(a) : ""} ${badgeEstado(t)} <span>${esc(cuando(t, eventos))}</span> <span>· ${esc(quienes(t, staff))}</span></div>
      ${t.detalle ? `<div class="det">${esc(t.detalle)}</div>` : ""}
      <div class="acc">${acc.join("")}</div></div></template>`;
  };
  const pinta = (l: Tarea[]) => l.map((t) => tarjeta(t, p, areas, staff, eventos,
    { editable: editable && dirigeArea(p, t.area, areas), volver: "/portal", otras: mias })).join("");
  const hechas = mias.filter((t) => !esAbierta(t)).sort((a, b) => (b.hechaEl ?? "").localeCompare(a.hechaEl ?? "")).slice(0, 12);
  const a = areaDe(p, areas);
  const cuerpo = `
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<div class="vistas"><a href="#" id="v-cal" class="actual" onclick="vista('cal');return false">📅 Calendario</a><a href="#" id="v-lista" onclick="vista('lista');return false">📋 Lista</a></div>
<section id="sec-cal">
  <div class="cal-nav"><a class="btn sec" href="/portal?mes=${mesAnt}">‹</a><b>${MESES[mesNum - 1]} ${anio}</b><a class="btn sec" href="/portal?mes=${mesSig}">›</a>
    ${mesActual !== hoy.slice(0, 7) ? `<a class="btn sec mini" href="/portal">Hoy</a>` : ""}</div>
  ${transversales.length ? `<div class="banda"><span class="et">Siempre</span>${transversales.map((t) => chip(t, "solo")).join("")}</div>` : ""}
  <div class="cal-cab">${["L","M","X","J","V","S","D"].map((d) => `<span>${d}</span>`).join("")}</div>
  <div class="cal">${celdas}</div>
  ${evMes.length ? `<div class="leyenda">${[...new Map(evMes.map((e) => [e.tipoNombre ?? "", e])).values()]
    .map((e) => `<span><i style="background:${e.color}"></i>${esc(e.emoji ?? "")} ${esc(e.tipoNombre ?? "")}</span>`).join("")}</div>` : ""}
  <p class="det" style="margin-top:8px">Las franjas de color son eventos y juntas: tócalas para ver sus tareas y quién las lleva. Toca una tarea para abrirla, o un día para ver todo lo de ese día.</p>
</section>
<section id="sec-lista" hidden>
  <h2>Pendientes <small>${abiertas.length}</small></h2>
  ${abiertas.length ? pinta(abiertas) : '<div class="vacio">Nada pendiente ahora mismo. 🎉</div>'}
  ${hechas.length ? `<h2>Cerradas hace poco <small>${hechas.length}</small></h2>${pinta(hechas)}` : ""}
</section>
<h2>Tu cuenta</h2>
<div class="tarjeta">
  <p style="font-size:13.5px">Eres <b>${esc(ROLES[p.rol].nombre)}</b> de <b>${esc(a.nombre)}</b>${p.admin ? " · con permiso de administración" : ""}.</p>
  <form method="post" action="/portal/pin-cambiar" class="fila" style="margin-top:12px">
    <div><label>PIN actual</label><input name="actual" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4"></div>
    <div><label>PIN nuevo</label><input name="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4"></div>
    <div style="align-self:end"><button class="btn sec" type="submit">Cambiar mi PIN</button></div>
  </form>
</div>
${recientes.map(plantilla).join("")}
<div id="hoja" class="hoja" hidden><div class="hoja-caja"><button class="cerrar" type="button" onclick="cerrarHoja()">✕</button><div id="hoja-cuerpo"></div></div></div>
${JS_TOGGLE}
<script>
function vista(v) {
  document.getElementById('sec-cal').hidden = v !== 'cal';
  document.getElementById('sec-lista').hidden = v !== 'lista';
  document.getElementById('v-cal').classList.toggle('actual', v === 'cal');
  document.getElementById('v-lista').classList.toggle('actual', v === 'lista');
  try { localStorage.setItem('mind-vista', v); } catch (e) {}
}
try { if (localStorage.getItem('mind-vista') === 'lista' || location.hash.startsWith('#t-')) vista('lista'); } catch (e) {}
const NOMBRE_DIA = ${jsonSeguro(MESES)};
const EVENTOS = ${jsonSeguro(datosEv)};
const YO = ${jsonSeguro(p.matricula)};
const ESTADOS = ${jsonSeguro(ESTADOS)};
const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hojaEvento(id) {
  const e = EVENTOS.find((x) => x.id === id);
  if (!e) return '';
  const f = e.fecha.split('-');
  const cuando = Number(f[2]) + ' de ' + NOMBRE_DIA[Number(f[1]) - 1] + (e.hora ? ' · ' + e.hora + ' h' : '');
  const filas = e.tareas.map((t) => {
    const gente = t.gente.length
      ? t.gente.map((g) => '<span class="ficha mini-f" style="--c:' + g.color + '"><span class="ava">' + escH(g.ini) + '</span>' + escH(g.apodo) + '</span>').join('')
      : '<span class="todos">TODOS</span>';
    return '<div class="ev-tarea' + (t.mia ? ' mia' : '') + '" style="--a:' + t.areaColor + '">' +
      '<div class="ev-tit"><b>' + escH(t.titulo) + '</b>' + (t.mia ? '<span class="tuya">tuya</span>' : '') + '</div>' +
      '<div class="meta"><span class="chip" style="background:' + ESTADOS[t.estado].color + ';color:' + ESTADOS[t.estado].tinta + '">' + ESTADOS[t.estado].nombre + '</span><span>' + escH(t.area) + '</span></div>' +
      '<div class="gente-lista">' + gente + '</div></div>';
  }).join('');
  const hechas = e.tareas.filter((t) => t.estado === 'hecha').length;
  return '<div class="ev-cab" style="--c:' + e.color + ';--t:' + e.tinta + '">' +
      '<div class="ev-emoji">' + e.emoji + '</div>' +
      '<div><b>' + escH(e.titulo) + '</b><small>' + escH(e.tipo) + ' · ' + escH(cuando) + (e.lugar ? ' · 📍 ' + escH(e.lugar) : '') + '</small></div></div>' +
    (e.tareas.length
      ? '<p class="det" style="margin:10px 2px">' + e.tareas.length + ' tarea' + (e.tareas.length === 1 ? '' : 's') + ' de este evento · ' + hechas + ' hecha' + (hechas === 1 ? '' : 's') + '</p>' + filas
      : '<p class="vacio" style="margin-top:10px">Todavía no hay tareas ligadas a este evento. En el tablero puedes crear una y elegir «Para un evento».</p>') +
    '<div class="acc" style="margin-top:12px">' +
      (e.junta ? '' : '<a class="btn sec mini" href="/galeria?evento=' + encodeURIComponent(e.id) + '" target="_blank">🖼️ Fotos</a>') +
      '<a class="btn sec mini" href="/asistencia/' + encodeURIComponent(e.id) + '" target="_blank">📝 Registro</a>' +
      (e.prereg ? '<a class="btn sec mini" href="/preregistro/' + encodeURIComponent(e.id) + '" target="_blank">✨ Prerregistro</a>' : '') +
    '</div>';
}
function abrirHoja(html) { document.getElementById('hoja-cuerpo').innerHTML = html; document.getElementById('hoja').hidden = false; document.body.style.overflow = 'hidden'; }
function cerrarHoja() { document.getElementById('hoja').hidden = true; document.body.style.overflow = ''; }
function tpl(id) { const t = document.getElementById('tpl-' + id); return t ? t.innerHTML : ''; }
document.querySelectorAll('.chip-cal').forEach((c) => c.addEventListener('click', (e) => { e.stopPropagation(); abrirHoja(tpl(c.dataset.t)); }));
document.querySelectorAll('.ev').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); abrirHoja(hojaEvento(b.dataset.ev)); }));
document.querySelectorAll('.dia').forEach((d) => d.addEventListener('click', () => {
  const ids = [...new Set([...d.querySelectorAll('.chip-cal')].map((c) => c.dataset.t))];
  const evs = [...d.querySelectorAll('.ev')].map((b) => b.dataset.ev);
  const f = d.dataset.d.split('-');
  const titulo = '<h3 style="margin-bottom:10px">' + Number(f[2]) + ' de ' + NOMBRE_DIA[Number(f[1]) - 1] + '</h3>';
  const cuerpo = evs.map(hojaEvento).join('') + ids.map(tpl).join('');
  abrirHoja(titulo + (cuerpo || '<p class="det">Nada para este día.</p>'));
}));
document.getElementById('hoja').addEventListener('click', (e) => { if (e.target.id === 'hoja') cerrarHoja(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });
</script>`;
  return paginaPortal("Mis tareas · MIND",
    cabecera(p, "yo", `Hola, ${nombreCorto(p)}`, `${abiertas.length} pendiente${abiertas.length === 1 ? "" : "s"} · semana del ${rangoSemana(semanaActual())}`),
    cuerpo, CSS_PANEL + CSS_CAL);
}
const CSS_CAL = `
.cal-nav { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.cal-nav b { font-size:17px; font-weight:800; text-transform:capitalize; flex:1; text-align:center; }
.cal-nav .btn { min-width:44px; }
.banda { display:flex; flex-wrap:wrap; gap:6px; align-items:center; background:#fff; border:1px solid #E4E1D2; border-radius:12px; padding:8px 10px; margin-bottom:8px; }
.banda .et { font-size:10.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; margin-right:4px; }
.cal-cab { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); font-size:11px; font-weight:700; color:#6A6F98; text-align:center; margin-bottom:4px; }
.cal { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:3px; }
.dia { background:#fff; border:1px solid #E4E1D2; border-radius:10px; min-height:88px; padding:24px 3px 4px; position:relative; cursor:pointer; display:flex; flex-direction:column; gap:2px; min-width:0; overflow:hidden; }
.dia.otro { opacity:.45; }
.dia.hoy { border-color:#2E4BC6; box-shadow:inset 0 0 0 1px #2E4BC6; }
.dia .num { position:absolute; top:5px; left:7px; font-size:11.5px; font-weight:700; color:#6A6F98; }
.dia.hoy .num { background:#2E4BC6; color:#fff; border-radius:999px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; left:4px; top:3px; }
.chip-cal { min-width:0; max-width:100%; font:inherit; font-size:11px; font-weight:600; color:#fff; background:var(--c); border:none; border-radius:6px; padding:3px 6px; text-align:left; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-height:20px; }
.chip-cal.ini { border-radius:6px 0 0 6px; margin-right:-4px; }
.chip-cal.mid { border-radius:0; margin:0 -4px; }
.chip-cal.fin { border-radius:0 6px 6px 0; margin-left:-4px; }
.chip-cal.est-hecha, .chip-cal.est-vencida { opacity:.45; text-decoration:line-through; }
.chip-cal.est-curso { box-shadow:inset 0 0 0 2px rgba(255,255,255,.55); }
.banda .chip-cal { border-radius:999px; }
.dia.conev { background:#FFFDF6; }
.ev { min-width:0; max-width:100%; font:inherit; font-size:10.5px; font-weight:800; color:var(--t); background:var(--c); border:none; border-radius:5px; padding:3px 5px; text-align:left; cursor:pointer; display:flex; align-items:center; gap:3px; min-height:19px; letter-spacing:.01em; }
.ev span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.ev i { font-style:normal; background:rgba(255,255,255,.35); border-radius:999px; padding:0 5px; font-size:9.5px; }
.ev.cerrado { opacity:.6; }
.leyenda { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; font-size:11.5px; color:#6A6F98; font-weight:600; }
.leyenda span { display:inline-flex; align-items:center; gap:5px; }
.leyenda i { width:10px; height:10px; border-radius:3px; display:inline-block; }
.ev-cab { display:flex; gap:11px; align-items:center; background:var(--c); color:var(--t); border-radius:12px; padding:12px 14px; }
.ev-cab .ev-emoji { font-size:26px; }
.ev-cab b { font-size:16px; display:block; }
.ev-cab small { font-size:11.5px; opacity:.85; }
.ev-tarea { background:#fff; border:1px solid #E4E1D2; border-left:4px solid var(--a); border-radius:11px; padding:10px 12px; margin-bottom:7px; }
.ev-tarea.mia { background:#F4FBFD; border-color:#BEE3F0; }
.ev-tit { display:flex; align-items:center; gap:8px; }
.ev-tit b { font-size:14px; font-weight:600; }
.tuya { font-size:9.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; background:#2E4BC6; color:#fff; border-radius:999px; padding:2px 7px; }
.ev-tarea .meta { display:flex; gap:7px; align-items:center; font-size:11px; color:#8A8FB5; margin-top:5px; flex-wrap:wrap; }
.ev-tarea .gente-lista { margin-top:7px; }
.ficha.mini-f { font-size:11.5px; padding:2px 9px 2px 2px; }
.ficha.mini-f .ava { width:20px; height:20px; font-size:9px; }
@media (max-width:640px) {
  .ev { font-size:0; min-height:12px; padding:0 3px; gap:0; }
  .ev span { display:none; } .ev i { display:none; }
}
@media (max-width:640px) {
  .dia { min-height:58px; padding:22px 3px 3px; }
  .dia .chip-cal { font-size:0; min-height:8px; height:8px; padding:0; border-radius:4px; }
  .banda .chip-cal { font-size:11px; min-height:20px; height:auto; padding:3px 8px; }
}
.hoja { position:fixed; inset:0; background:rgba(12,14,40,.55); z-index:40; display:flex; align-items:flex-end; justify-content:center; }
.hoja-caja { background:#F7F5EC; border-radius:18px 18px 0 0; padding:18px 18px 28px; width:100%; max-width:640px; max-height:80vh; overflow:auto; position:relative; }
.hoja .cerrar { position:absolute; top:10px; right:12px; font:inherit; font-size:16px; background:#EFEDDF; border:none; border-radius:50%; width:32px; height:32px; cursor:pointer; }
.hoja-item { background:#fff; border:1px solid #E4E1D2; border-radius:12px; padding:12px; margin-bottom:8px; }
.hoja-item b { font-size:15px; display:block; margin-bottom:4px; }
.hoja-item .meta { display:flex; gap:6px; flex-wrap:wrap; font-size:11.5px; color:#8A8FB5; align-items:center; }
.hoja-item .acc { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; } .hoja-item .acc form { display:inline; }
`;

// ---------------- tablero visual (kanban por área) ----------------
export function renderTablero(p: Persona, todas: Tarea[], areas: Area[], staff: Persona[],
                              eventos: EventoLite[], aviso?: string): string {
  const puedeTodo = esPresidencia(p);
  const manejables = areas.filter((a) => dirigeArea(p, a.id, areas)).map((a) => a.id);
  const datos = {
    yo: { matricula: p.matricula, presidencia: puedeTodo, areas: manejables },
    areas: areas.map((a) => ({ id: a.id, nombre: a.nombre, color: a.color, tinta: a.tinta, emoji: a.emoji })),
    staff: staff.filter((s) => s.activo).sort((a, b) => nombreCorto(a).localeCompare(nombreCorto(b), "es"))
      .map((s) => ({ mat: s.matricula, nombre: s.nombre, apodo: nombreCorto(s), ini: iniciales(s), area: s.area,
                     color: areaDe(s, areas).color })),
    eventos: eventos.map((e) => ({ id: e.id, titulo: e.titulo, fecha: e.fecha })),
    tareas: todas.map((t) => ({ id: t.id, titulo: t.titulo, detalle: t.detalle ?? "", area: t.area, asignados: t.asignados,
                                vigencia: t.vigencia, estado: t.estado, evidencia: t.evidencia.length,
                                atrasada: atrasada(t) })),
    estados: ESTADOS, hoy: hoyISO(), finSemana: sumarDias(semanaActual(), 6),
  };
  const cuerpo = `
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<div class="vistas"><a class="actual" href="/tareas">🗂️ Tablero</a><a href="/tareas/lista">📋 Lista</a>${puedeTodo ? `<a href="/tareas/cerrar-semana">🗓️ Cerrar la semana</a>` : ""}<label class="cambio"><input type="checkbox" id="ver-hechas"> ver hechas</label></div>
<div class="pool" id="pool"></div>
<p class="ayuda" id="ayuda">Arrastra una persona a una tarea para asignarla. En celular: toca la persona y luego la tarea. Toca de nuevo para soltar.</p>
<div class="tablero" id="tablero"></div>
<div id="hoja" class="hoja" hidden><div class="hoja-caja"><button class="cerrar" type="button" onclick="cerrarHoja()">✕</button><div id="hoja-cuerpo"></div></div></div>
<div id="aviso-flotante" class="flotante" hidden></div>
<script>
const S = ${jsonSeguro(datos)};
let sel = null;            // persona seleccionada (para asignar tocando)
let arrastrando = null;    // { tipo:'mat'|'tarea', valor }
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const persona = (m) => S.staff.find((s) => s.mat === m);
const area = (id) => S.areas.find((a) => a.id === id);
const puedo = (areaId) => S.yo.presidencia || S.yo.areas.includes(areaId);
const toca = (t) => !t.asignados.length || t.asignados.includes(S.yo.matricula);
const fechaCorta = (f) => { const [, m, d] = f.split('-').map(Number); return d + ' ' + ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1]; };
function cuando(t) {
  const v = t.vigencia;
  if (v.tipo === 'transversal') return 'Transversal';
  if (v.tipo === 'evento') { const e = S.eventos.find((x) => x.id === v.evento); return e ? 'Para ' + e.titulo : 'Para un evento'; }
  if (v.inicio && v.fin) return fechaCorta(v.inicio) + ' → ' + fechaCorta(v.fin);
  if (v.fin) return 'Hasta ' + fechaCorta(v.fin);
  if (v.inicio) return 'Desde ' + fechaCorta(v.inicio);
  return 'Sin fecha';
}
function avisa(txt, mal) {
  const a = $('#aviso-flotante'); a.textContent = txt; a.className = 'flotante' + (mal ? ' mal' : ''); a.hidden = false;
  clearTimeout(avisa.t); avisa.t = setTimeout(() => { a.hidden = true; }, 2600);
}
async function api(metodo, ruta, cuerpo) {
  const r = await fetch(ruta, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('error ' + r.status));
  return j;
}
function actualizaLocal(t) { const i = S.tareas.findIndex((x) => x.id === t.id); if (i >= 0) S.tareas[i] = t; else S.tareas.push(t); }
async function cambia(id, cambios, mensaje) {
  try { const t = await api('PATCH', '/api/tareas/' + id, cambios); actualizaLocal(t); pinta(); if (mensaje) avisa(mensaje); }
  catch (e) { avisa(e.message, true); }
}
// ---- pool de personas ----
function pintaPool() {
  const pool = $('#pool');
  pool.innerHTML = S.staff.map((s) => '<button type="button" class="ficha' + (sel === s.mat ? ' sel' : '') + '" draggable="true" data-mat="' + esc(s.mat) + '" style="--c:' + s.color + '"><span class="ava">' + esc(s.ini) + '</span><span>' + esc(s.apodo) + '</span></button>').join('');
  pool.querySelectorAll('.ficha').forEach((f) => {
    f.addEventListener('click', () => { sel = sel === f.dataset.mat ? null : f.dataset.mat; pintaPool(); pinta();
      $('#ayuda').textContent = sel ? 'Toca una tarea para asignársela a ' + persona(sel).apodo + '. Toca otra vez la ficha para soltar.' : 'Arrastra una persona a una tarea para asignarla. En celular: toca la persona y luego la tarea.'; });
    f.addEventListener('dragstart', (e) => { arrastrando = { tipo: 'mat', valor: f.dataset.mat }; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', 'mat:' + f.dataset.mat); });
    f.addEventListener('dragend', () => { arrastrando = null; });
  });
}
// ---- tablero ----
function tarjetaHTML(t) {
  const a = area(t.area);
  const gente = t.asignados.map(persona).filter(Boolean);
  const dim = sel && !t.asignados.includes(sel);
  const avatares = t.asignados.length
    ? gente.map((s) => '<span class="ava chica" style="--c:' + s.color + '" title="' + esc(s.nombre) + (puedo(t.area) ? ' · toca para quitar' : '') + '" data-quitar="' + esc(s.mat) + '">' + esc(s.ini) + '</span>').join('')
    : '<span class="todos">TODOS</span>';
  return '<article class="card est-' + t.estado + (t.atrasada ? ' atrasada' : '') + (dim ? ' dim' : '') + (sel && t.asignados.includes(sel) ? ' foco' : '') + '" data-id="' + esc(t.id) + '" draggable="' + (puedo(t.area) ? 'true' : 'false') + '">' +
    '<div class="card-tit">' + esc(t.titulo) + '</div>' +
    '<div class="card-meta"><span class="dot" title="' + S.estados[t.estado].nombre + '"></span><span>' + esc(cuando(t)) + '</span>' + (t.evidencia ? '<span>📎' + t.evidencia + '</span>' : '') + '</div>' +
    '<div class="card-gente">' + avatares + '</div>' +
    '<button type="button" class="mas" data-abrir="' + esc(t.id) + '" title="Detalles">···</button></article>';
}
function pinta() {
  const verHechas = $('#ver-hechas').checked;
  const cols = [...S.areas, { id: '', nombre: 'Sin área', color: '#6A6F98', emoji: '•' }];
  $('#tablero').innerHTML = cols.map((a) => {
    const suyas = S.tareas.filter((t) => (t.area || '') === a.id && (verHechas || (t.estado === 'pendiente' || t.estado === 'curso')));
    if (!a.id && !suyas.length) return '';
    return '<section class="col" data-area="' + esc(a.id) + '"><h3><span class="punto" style="background:' + a.color + '"></span>' + esc(a.emoji + ' ' + a.nombre) + ' <small>' + suyas.length + '</small></h3>' +
      '<div class="cards">' + suyas.map(tarjetaHTML).join('') + '</div>' +
      (puedo(a.id) && a.id ? '<form class="rapida" data-area="' + esc(a.id) + '"><input name="titulo" placeholder="+ nueva tarea" maxlength="120" autocomplete="off"></form>' : '') +
      '</section>';
  }).join('');
  // alta rápida
  document.querySelectorAll('.rapida').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = f.querySelector('input'); const titulo = inp.value.trim();
    if (titulo.length < 3) { avisa('Escribe al menos tres letras.', true); return; }
    try { const t = await api('POST', '/api/tareas', { titulo, area: f.dataset.area }); S.tareas.push(t); pinta(); avisa('✓ Creada: ' + t.titulo); const n = document.querySelector('.rapida[data-area="' + f.dataset.area + '"] input'); if (n) n.focus(); }
    catch (err) { avisa(err.message, true); }
  }));
  // tarjetas: tocar para asignar, quitar persona, abrir detalles, arrastrar
  document.querySelectorAll('.card').forEach((c) => {
    const id = c.dataset.id;
    c.addEventListener('click', (e) => {
      const q = e.target.closest('[data-quitar]');
      if (q) { e.stopPropagation(); const t = S.tareas.find((x) => x.id === id); if (!puedo(t.area)) return; cambia(id, { asignados: t.asignados.filter((m) => m !== q.dataset.quitar) }, 'Quitado ' + persona(q.dataset.quitar).apodo); return; }
      if (e.target.closest('[data-abrir]')) { e.stopPropagation(); abrirDetalle(id); return; }
      if (sel) { asigna(id, sel); return; }
      abrirDetalle(id);
    });
    c.addEventListener('dragstart', (e) => { arrastrando = { tipo: 'tarea', valor: id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'tarea:' + id); c.classList.add('llevando'); });
    c.addEventListener('dragend', () => { arrastrando = null; c.classList.remove('llevando'); });
    c.addEventListener('dragover', (e) => { if (arrastrando && arrastrando.tipo === 'mat') { e.preventDefault(); c.classList.add('sobre'); } });
    c.addEventListener('dragleave', () => c.classList.remove('sobre'));
    c.addEventListener('drop', (e) => { e.preventDefault(); c.classList.remove('sobre'); const d = (e.dataTransfer.getData('text/plain') || ''); if (d.startsWith('mat:')) { e.stopPropagation(); asigna(id, d.slice(4)); } });
  });
  // columnas: soltar tarjeta = cambiar de área
  document.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { if (arrastrando && arrastrando.tipo === 'tarea') { e.preventDefault(); col.classList.add('sobre'); } });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('sobre'); });
    col.addEventListener('drop', (e) => { const d = (e.dataTransfer.getData('text/plain') || ''); col.classList.remove('sobre'); if (!d.startsWith('tarea:')) return; e.preventDefault();
      const id = d.slice(6); const t = S.tareas.find((x) => x.id === id); const destino = col.dataset.area;
      if (!t || t.area === destino) return; if (!destino) { avisa('Arrastra a un área con nombre.', true); return; }
      cambia(id, { area: destino }, 'Movida a ' + area(destino).nombre); });
  });
}
function asigna(id, mat) {
  const t = S.tareas.find((x) => x.id === id);
  if (!puedo(t.area)) { avisa('No puedes asignar en ' + (area(t.area) ? area(t.area).nombre : 'esa área') + '.', true); return; }
  if (t.asignados.includes(mat)) { avisa(persona(mat).apodo + ' ya está en esa tarea.'); return; }
  cambia(id, { asignados: [...t.asignados, mat] }, '✓ ' + persona(mat).apodo + ' → ' + t.titulo);
}
// ---- hoja de detalle ----
function abrirDetalle(id) {
  const t = S.tareas.find((x) => x.id === id); if (!t) return;
  const a = area(t.area); const gestiona = puedo(t.area); const mia = toca(t);
  const est = (v, txt, cls) => '<button type="button" class="btn ' + (cls || 'sec') + ' mini" data-est="' + v + '"' + (t.estado === v ? ' disabled' : '') + '>' + txt + '</button>';
  const v = t.vigencia;
  const html = '<div class="hoja-item"><b>' + esc(t.titulo) + '</b>' +
    '<div class="meta">' + (a ? '<span class="chip" style="background:' + a.color + ';color:' + a.tinta + '">' + esc(a.emoji + ' ' + a.nombre) + '</span>' : '') + ' <span class="chip" style="background:' + S.estados[t.estado].color + ';color:' + S.estados[t.estado].tinta + '">' + S.estados[t.estado].nombre + '</span> <span>' + esc(cuando(t)) + '</span></div>' +
    (t.detalle ? '<div class="det">' + esc(t.detalle) + '</div>' : '') +
    '<div class="gente-lista">' + (t.asignados.length ? t.asignados.map(persona).filter(Boolean).map((s) => '<span class="ficha mini-f" style="--c:' + s.color + '"><span class="ava">' + esc(s.ini) + '</span>' + esc(s.apodo) + (gestiona ? ' <i data-quitar="' + esc(s.mat) + '">✕</i>' : '') + '</span>').join('') : '<span class="todos">TODOS</span>') + '</div>' +
    ((mia || gestiona) ? '<div class="acc" id="acc-est">' + est('pendiente', 'Sin empezar') + est('curso', '▶ En curso') + est('hecha', '✓ Hecha', 'ok') + (gestiona ? est('vencida', 'Vencida', 'sec peligro') : '') + '<button type="button" class="btn sec mini" id="btn-pos">→ Posponer</button></div>' : '') +
    (gestiona ? '<form class="fila" id="f-edit" style="margin-top:12px">' +
      '<div style="grid-column:1/-1"><label>Título</label><input name="titulo" value="' + esc(t.titulo) + '" maxlength="120" required></div>' +
      '<div style="grid-column:1/-1"><label>Detalle</label><input name="detalle" value="' + esc(t.detalle) + '" maxlength="300"></div>' +
      '<div><label>Vigencia</label><select name="tipo"><option value="fechas"' + (v.tipo === 'fechas' ? ' selected' : '') + '>Con fechas</option><option value="transversal"' + (v.tipo === 'transversal' ? ' selected' : '') + '>Transversal</option><option value="evento"' + (v.tipo === 'evento' ? ' selected' : '') + '>Para un evento</option></select></div>' +
      '<div><label>Área</label><select name="area">' + S.areas.filter((x) => puedo(x.id)).map((x) => '<option value="' + x.id + '"' + (x.id === t.area ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') + '</select></div>' +
      '<div><label>Del</label><input type="date" name="inicio" value="' + (v.inicio || '') + '"></div><div><label>Al</label><input type="date" name="fin" value="' + (v.fin || '') + '"></div>' +
      '<div style="grid-column:1/-1"><label>Evento</label><select name="evento"><option value="">(ninguno)</option>' + S.eventos.map((e) => '<option value="' + e.id + '"' + (e.id === v.evento ? ' selected' : '') + '>' + esc(e.titulo + ' · ' + fechaCorta(e.fecha)) + '</option>').join('') + '</select></div>' +
      '<div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit">Guardar</button><a class="btn sec" href="/tareas/lista#t-' + esc(t.id) + '">📎 Evidencia</a><button type="button" class="btn sec peligro" id="btn-borrar">Borrar</button></div></form>' : '<p class="det" style="margin-top:8px"><a href="/tareas/lista#t-' + esc(t.id) + '">📎 Evidencia y detalle</a></p>') +
    '</div>';
  abrirHoja(html);
  const h = $('#hoja-cuerpo');
  h.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', async () => { await cambia(id, { estado: b.dataset.est }, S.estados[b.dataset.est].nombre + ': ' + t.titulo); cerrarHoja(); }));
  const pos = $('#btn-pos'); if (pos) pos.addEventListener('click', async () => { await cambia(id, { posponer: true }, '→ Se movió a la próxima semana'); cerrarHoja(); });
  h.querySelectorAll('[data-quitar]').forEach((i) => i.addEventListener('click', () => { cambia(id, { asignados: t.asignados.filter((m) => m !== i.dataset.quitar) }); abrirDetalle(id); }));
  const f = $('#f-edit'); if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); const d = new FormData(f);
    const vig = { tipo: d.get('tipo') }; if (vig.tipo === 'fechas') { vig.inicio = d.get('inicio') || undefined; vig.fin = d.get('fin') || undefined; } if (vig.tipo === 'evento') vig.evento = d.get('evento') || undefined;
    await cambia(id, { titulo: d.get('titulo'), detalle: d.get('detalle'), area: d.get('area'), vigencia: vig }, '✓ Guardada'); cerrarHoja(); });
  const bb = $('#btn-borrar'); if (bb) bb.addEventListener('click', async () => { if (!confirm('¿Borrar «' + t.titulo + '»? No se puede deshacer.')) return; try { await api('DELETE', '/api/tareas/' + id); S.tareas = S.tareas.filter((x) => x.id !== id); pinta(); cerrarHoja(); avisa('Borrada'); } catch (err) { avisa(err.message, true); } });
}
function abrirHoja(html) { $('#hoja-cuerpo').innerHTML = html; $('#hoja').hidden = false; document.body.style.overflow = 'hidden'; }
function cerrarHoja() { $('#hoja').hidden = true; document.body.style.overflow = ''; }
$('#hoja').addEventListener('click', (e) => { if (e.target.id === 'hoja') cerrarHoja(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarHoja(); if (sel) { sel = null; pintaPool(); pinta(); } } });
$('#ver-hechas').addEventListener('change', pinta);
pintaPool(); pinta();
</script>`;
  return paginaPortal("Tablero · MIND",
    cabecera(p, "tablero", "Tablero de tareas", `${todas.filter(esAbierta).length} abiertas · semana del ${rangoSemana(semanaActual())}`),
    cuerpo, CSS_PANEL + CSS_CAL + CSS_KANBAN);
}
const CSS_KANBAN = `
main { max-width:1400px; }
.cambio { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#6A6F98; margin-left:auto; text-transform:none; letter-spacing:0; }
.cambio input { width:16px; height:16px; min-height:0; }
.pool { display:flex; flex-wrap:wrap; gap:6px; background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:10px; position:sticky; top:0; z-index:5; }
.ficha { font:inherit; font-size:12.5px; font-weight:600; color:#1C2260; background:#FCFBF5; border:1.5px solid #DDD9C6; border-radius:999px; padding:3px 10px 3px 3px; display:inline-flex; align-items:center; gap:7px; cursor:grab; user-select:none; }
.ficha:hover { border-color:var(--c); }
.ficha.sel { background:var(--c); color:#fff; border-color:var(--c); }
.ficha.sel .ava { background:#fff; color:var(--c); }
.ficha .ava { width:24px; height:24px; font-size:10px; }
.ficha.mini-f { cursor:default; margin:2px 4px 2px 0; } .ficha.mini-f i { font-style:normal; cursor:pointer; color:#A03434; margin-left:2px; }
.ayuda { font-size:12px; color:#6A6F98; margin:8px 2px 12px; }
.tablero { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(230px,1fr); gap:10px; overflow-x:auto; padding-bottom:12px; align-items:start; }
@media (max-width:760px) { .tablero { grid-auto-columns:82vw; scroll-snap-type:x mandatory; } .col { scroll-snap-align:start; } }
.col { background:#EFEDE2; border-radius:14px; padding:10px; min-height:120px; }
.col.sobre { outline:2px dashed #2E4BC6; outline-offset:-2px; }
.col h3 { font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; display:flex; align-items:center; gap:7px; margin-bottom:8px; }
.col h3 small { color:#6A6F98; font-weight:700; margin-left:auto; }
.punto { width:10px; height:10px; border-radius:50%; display:inline-block; }
.cards { display:grid; gap:7px; }
.card { background:#fff; border:1px solid #E4E1D2; border-radius:11px; padding:9px 30px 9px 11px; position:relative; cursor:pointer; border-left:5px solid #DDD9C6; transition:transform .12s, opacity .12s; }
.card.est-curso { border-left-color:#29A3C7; } .card.est-hecha { border-left-color:#8BC53F; opacity:.6; } .card.est-vencida { border-left-color:#A03434; opacity:.6; }
.card.atrasada { border-left-color:#A03434; }
.card.dim { opacity:.4; } .card.foco { box-shadow:0 0 0 2px #2E4BC6; }
.card.sobre { box-shadow:0 0 0 3px #29A3C7; transform:scale(1.02); }
.card.llevando { opacity:.4; }
.card-tit { font-size:13.5px; font-weight:600; line-height:1.3; }
.card-meta { display:flex; gap:8px; align-items:center; font-size:11px; color:#8A8FB5; margin-top:4px; }
.card .dot { width:8px; height:8px; border-radius:50%; background:#DDD9C6; display:inline-block; }
.card.est-curso .dot { background:#29A3C7; } .card.est-hecha .dot { background:#8BC53F; } .card.est-vencida .dot { background:#A03434; }
.card-gente { display:flex; gap:3px; margin-top:7px; flex-wrap:wrap; }
.ava.chica { width:24px; height:24px; font-size:10px; cursor:pointer; }
.todos { font-size:10px; font-weight:800; letter-spacing:.06em; color:#6A6F98; background:#EFEDDF; border-radius:999px; padding:3px 8px; }
.card .mas { position:absolute; top:6px; right:6px; font:inherit; font-size:14px; font-weight:800; color:#8A8FB5; background:none; border:none; cursor:pointer; padding:2px 6px; border-radius:6px; }
.card .mas:hover { background:#EFEDDF; color:#1C2260; }
.rapida { margin-top:8px; }
.rapida input { min-height:38px; font-size:13.5px; padding:8px 10px; background:#fff; border-style:dashed; }
.gente-lista { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.flotante { position:fixed; bottom:18px; left:50%; transform:translateX(-50%); background:#1C2260; color:#fff; font-size:13px; font-weight:600; padding:10px 16px; border-radius:999px; z-index:60; box-shadow:0 8px 24px rgba(12,14,40,.3); }
.flotante.mal { background:#A03434; }
`;

/** Vista de lista del tablero (la anterior), con los formularios completos. */
export function renderTableroLista(p: Persona, todas: Tarea[], areas: Area[], staff: Persona[],
                                   eventos: EventoLite[], aviso?: string, filtro = ""): string {
  const puedeTodo = esPresidencia(p);
  const visibles = todas.filter((t) => !filtro || t.area === filtro);
  const abiertas = visibles.filter(esAbierta);
  const cerradas = visibles.filter((t) => !esAbierta(t))
    .sort((a, b) => (b.hechaEl ?? b.creada).localeCompare(a.hechaEl ?? a.creada)).slice(0, 20);
  const grupos = areas.filter((a) => !filtro || a.id === filtro).map((a) => {
    const suyas = abiertas.filter((t) => t.area === a.id);
    if (!suyas.length) return "";
    return `<div class="grupo"><h3>${a.emoji} ${esc(a.nombre)} · ${suyas.length}</h3>${
      suyas.map((t) => tarjeta(t, p, areas, staff, eventos, { editable: dirigeArea(p, t.area, areas), volver: "/tareas/lista", otras: visibles })).join("")}</div>`;
  }).join("");
  const sinArea = abiertas.filter((t) => !areas.some((a) => a.id === t.area));
  const cuerpo = `
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<div class="vistas"><a href="/tareas">🗂️ Tablero</a><a class="actual" href="/tareas/lista">📋 Lista</a>${puedeTodo ? `<a href="/tareas/cerrar-semana">🗓️ Cerrar la semana</a>` : ""}</div>
<div class="vistas" style="margin-top:-6px"><a class="btn sec mini" href="/tareas/lista">Todas</a>${areas.map((a) => `<a class="btn sec mini" href="/tareas/lista?area=${esc(a.id)}"${filtro === a.id ? ' style="background:#1C2260;color:#fff"' : ""}>${a.emoji} ${esc(a.nombre)}</a>`).join("")}</div>
<h2>Abiertas <small>${abiertas.length} de ${visibles.length}</small></h2>
${grupos || '<div class="vacio">No hay tareas abiertas con este filtro.</div>'}
${sinArea.length ? `<div class="grupo"><h3>Sin área · ${sinArea.length}</h3>${sinArea.map((t) => tarjeta(t, p, areas, staff, eventos, { editable: puedeTodo, volver: "/tareas/lista" })).join("")}</div>` : ""}
${cerradas.length ? `<h2>Cerradas hace poco</h2>${cerradas.map((t) => tarjeta(t, p, areas, staff, eventos, { editable: dirigeArea(p, t.area, areas), volver: "/tareas/lista" })).join("")}` : ""}
${JS_TOGGLE}`;
  return paginaPortal("Lista de tareas · MIND",
    cabecera(p, "tablero", "Lista de tareas", `${abiertas.length} abiertas · semana del ${rangoSemana(semanaActual())}`),
    cuerpo, CSS_PANEL);
}

// ---------------- cerrar semana ----------------
export function renderCerrarSemana(p: Persona, todas: Tarea[], areas: Area[], staff: Persona[]): string {
  const lunes = semanaActual();
  const abiertas = todas.filter(esAbierta).filter((t) => enSemana(t, lunes));
  const filas = abiertas.map((t) => {
    const a = areas.find((x) => x.id === t.area);
    return `<label class="linea">
      <input type="checkbox" name="arrastrar" value="${esc(t.id)}" checked>
      <span><b>${esc(t.titulo)}</b><small>${a ? a.emoji + " " + esc(a.nombre) : ""} · ${esc(quienes(t, staff))}${atrasada(t) ? " · <b style='color:#A03434'>atrasada</b>" : ""}</small></span>
    </label>`;
  }).join("");
  const cuerpo = `
<h2>Semana del ${esc(rangoSemana(lunes))}</h2>
<div class="tarjeta">
  <p style="font-size:13.5px;color:#6A6F98;margin-bottom:14px">Quedan <b>${abiertas.length}</b> tareas abiertas. Las que dejes palomeadas se pasan a la próxima semana. Las que desmarques quedan como vencidas, sin borrarse: seguirán en el archivo.</p>
  <form method="post" action="/tareas/cerrar-semana">
    ${filas || '<p class="vacio">No quedó nada abierto esta semana. 🎉</p>'}
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" type="submit">Cerrar la semana</button>
      <a class="btn sec" href="/tareas">Cancelar</a>
      <button class="btn sec" type="button" onclick="todas(true)">Palomear todas</button>
      <button class="btn sec" type="button" onclick="todas(false)">Ninguna</button>
    </div>
  </form>
</div>
<script>function todas(v) { document.querySelectorAll('input[name=arrastrar]').forEach(c => c.checked = v); }</script>`;
  return paginaPortal("Cerrar la semana · MIND",
    cabecera(p, "tablero", "Cerrar la semana", "Decide qué se arrastra y qué queda vencido"),
    cuerpo, `.linea { display:flex; gap:11px; align-items:flex-start; padding:9px 0; border-bottom:1px solid #EFEDE0; cursor:pointer; }
.linea:last-of-type { border-bottom:none; }
.linea input { width:19px; height:19px; min-height:0; margin-top:2px; flex:none; }
.linea b { font-size:14px; font-weight:600; display:block; }
.linea small { font-size:11.5px; color:#8A8FB5; }`);
}

// ---------------- lámina semanal ----------------
export function renderLamina(p: Persona, todas: Tarea[], areas: Area[], staff: Persona[], lunes: string): string {
  const abiertas = todas.filter(esAbierta).filter((t) => enSemana(t, lunes));
  const datos = areas.map((a) => ({
    nombre: a.nombre.toUpperCase(), color: a.color,
    tareas: abiertas.filter((t) => t.area === a.id).map((t) => ({ texto: t.titulo, quien: quienes(t, staff) })),
  })).filter((g) => g.tareas.length);
  const sinArea = abiertas.filter((t) => !areas.some((a) => a.id === t.area));
  if (sinArea.length) datos.push({ nombre: "OTROS", color: "#6A6F98", tareas: sinArea.map((t) => ({ texto: t.titulo, quien: quienes(t, staff) })) });
  const cuerpo = `
<div class="barra">
  <form method="get" action="/tareas/semana" class="fila" style="align-items:end;gap:8px">
    <div><label>Semana</label><input type="date" name="lunes" value="${esc(lunes)}"></div>
    <div><button class="btn sec" type="submit">Ver</button></div>
  </form>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" type="button" onclick="descargar()">⬇ Descargar imagen</button>
    <a class="btn sec" href="/tareas">Volver al tablero</a>
  </div>
</div>
<div class="marco"><canvas id="lienzo"></canvas></div>
<p class="det" style="text-align:center;margin-top:10px">${abiertas.length} tareas abiertas en esta semana. Se arma sola con lo que está en el tablero.</p>
<script>
const AREAS = ${jsonSeguro(datos)};
const RANGO = ${jsonSeguro(rangoSemana(lunes))};
const A = 1400, MARGEN = 70, COLS = 2;
function dibuja() {
  const c = document.getElementById('lienzo');
  const x = c.getContext('2d');
  const anchoCol = (A - MARGEN * 2 - 50) / COLS;
  const medir = (txt, fuente, ancho) => {
    x.font = fuente;
    const palabras = txt.split(' ');
    const lineas = []; let linea = '';
    for (const p of palabras) {
      const prueba = linea ? linea + ' ' + p : p;
      if (x.measureText(prueba).width > ancho && linea) { lineas.push(linea); linea = p; }
      else linea = prueba;
    }
    if (linea) lineas.push(linea);
    return lineas;
  };
  const bloques = AREAS.map((g) => {
    const items = g.tareas.map((t) => medir('•  ' + t.texto + (t.quien ? '  (' + t.quien + ')' : ''), '400 25px Poppins, sans-serif', anchoCol - 16));
    const alto = 58 + items.reduce((s, l) => s + l.length * 34 + 12, 0) + 26;
    return { g, items, alto };
  });
  const cols = Array.from({ length: COLS }, () => ({ alto: 0, bloques: [] }));
  for (const b of bloques.sort((p, q) => q.alto - p.alto)) {
    const menor = cols.reduce((a, b2) => (a.alto <= b2.alto ? a : b2));
    menor.bloques.push(b); menor.alto += b.alto;
  }
  const altoCuerpo = Math.max(...cols.map((c2) => c2.alto), 100);
  const ALTO = 190 + altoCuerpo + 80;
  c.width = A; c.height = ALTO;
  c.style.width = '100%'; c.style.height = 'auto';
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, A, ALTO);
  x.fillStyle = '#111111';
  x.font = '800 74px Poppins, sans-serif'; x.textBaseline = 'alphabetic';
  x.fillText('TAREAS', MARGEN, 100);
  x.font = '600 26px Poppins, sans-serif'; x.fillStyle = '#6A6F98';
  x.fillText('MIND · semana del ' + RANGO, MARGEN, 140);
  x.strokeStyle = '#E4E1D2'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(MARGEN, 165); x.lineTo(A - MARGEN, 165); x.stroke();
  cols.forEach((col, i) => {
    let y = 215;
    const x0 = MARGEN + i * (anchoCol + 50);
    for (const b of col.bloques) {
      x.fillStyle = b.g.color;
      x.fillRect(x0, y - 26, 16, 16);
      x.fillStyle = '#111111';
      x.font = '800 32px Poppins, sans-serif';
      x.fillText(b.g.nombre, x0 + 26, y - 12);
      y += 30;
      x.font = '400 25px Poppins, sans-serif'; x.fillStyle = '#1C2260';
      for (const lineas of b.items) {
        for (let k = 0; k < lineas.length; k++) {
          x.fillText(lineas[k], x0 + (k ? 24 : 0), y);
          y += 34;
        }
        y += 12;
      }
      y += 26;
    }
  });
  x.fillStyle = '#8A8FB5'; x.font = '600 22px Poppins, sans-serif';
  x.fillText('MIND · LiFE Grupos Estudiantiles · @mindmty', MARGEN, ALTO - 40);
  const paleta = ['#8BC53F','#F5C518','#EC4899','#C026D3','#22B8CF'];
  paleta.forEach((p2, i) => { x.fillStyle = p2; x.beginPath(); x.arc(A - MARGEN - (4 - i) * 26, ALTO - 47, 8, 0, 7); x.fill(); });
}
function descargar() {
  const a = document.createElement('a');
  a.download = 'tareas-mind-' + ${jsonSeguro(lunes)} + '.png';
  a.href = document.getElementById('lienzo').toDataURL('image/png');
  a.click();
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(dibuja); else window.addEventListener('load', dibuja);
</script>`;
  return paginaPortal("Lámina semanal · MIND",
    cabecera(p, "semana", "Lámina de la semana", "La imagen que se manda al grupo, armada sola"),
    cuerpo, `.marco { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:12px; overflow:hidden; }
.barra { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:end; margin-bottom:14px; }`);
}

// ---------------- equipo (nivel presidencia) ----------------
export function renderEquipo(p: Persona, staff: Persona[], areas: Area[], aviso?: string): string {
  const selArea = (actual: string, nombre = "area") =>
    `<select name="${nombre}"><option value=""${actual ? "" : " selected"}>Sin área</option>${areas.map((a) =>
      `<option value="${esc(a.id)}"${a.id === actual ? " selected" : ""}>${a.emoji} ${esc(a.nombre)}</option>`).join("")}</select>`;
  const selRol = (actual: RolId) =>
    `<select name="rol">${(Object.keys(ROLES) as RolId[]).map((r) =>
      `<option value="${r}"${r === actual ? " selected" : ""}>${ROLES[r].nombre}</option>`).join("")}</select>`;
  const filas = [...staff].sort((a, b) => Number(b.activo) - Number(a.activo) || ROLES[a.rol].orden - ROLES[b.rol].orden || a.nombre.localeCompare(b.nombre))
    .map((s) => {
      const yo = s.matricula === p.matricula;
      const estado = !s.activo ? '<span class="chip" style="background:#EEECE3;color:#6A6F98">de baja</span>'
        : !s.pinHash ? '<span class="chip" style="background:#FBECEC;color:#A03434">sin PIN</span>'
        : s.provisional ? '<span class="chip" style="background:#FDF3D7;color:#8A6A10">PIN provisional</span>'
        : '<span class="chip" style="background:#E8F3D9;color:#3F6B10">activa</span>';
      return `<tr class="${s.activo ? "" : "baja"}"><td>${avatar(s, areas)}</td>
<td><b>${esc(s.nombre)}</b><div class="det">${esc(s.matricula)}${s.apodo ? " · " + esc(s.apodo) : ""}${yo ? " · tú" : ""}</div></td>
<td><form method="post" action="/tareas/equipo/persona" class="edit">
  <input type="hidden" name="matricula" value="${esc(s.matricula)}">
  ${selArea(s.area)} ${selRol(s.rol)}
  <label class="cb"><input type="checkbox" name="admin"${s.admin ? " checked" : ""}${yo ? " disabled" : ""}> admin</label>
  <label class="cb"><input type="checkbox" name="activo"${s.activo ? " checked" : ""}${yo ? " disabled" : ""}> activo</label>
  <button class="btn sec mini" type="submit">Guardar</button></form></td>
<td>${estado}${s.ultimoAcceso ? `<div class="det">entró ${esc(s.ultimoAcceso.slice(0, 10))}</div>` : ""}</td>
<td class="acc"><form method="post" action="/tareas/equipo/pin" onsubmit="return confirm('¿Generar un PIN nuevo para ${esc(s.nombre)}? El anterior deja de servir.')">
<input type="hidden" name="matricula" value="${esc(s.matricula)}"><button class="btn sec mini" type="submit">Nuevo PIN</button></form></td></tr>`;
    }).join("");
  const dirs = areas.map((a) => {
    const dir = staff.find((s) => s.matricula === a.director) ?? staff.find((s) => s.area === a.id && s.rol === "direccion" && s.activo);
    const gente = staff.filter((s) => s.activo && s.area === a.id).map((s) => avatar(s, areas)).join("");
    return `<tr><td>${badgeArea(a)}<div class="gente" style="margin-top:5px">${gente}</div></td><td>${dir ? esc(dir.nombre) : '<span class="det">sin director</span>'}</td>
<td class="acc"><form method="post" action="/tareas/equipo/director" class="edit">
<input type="hidden" name="area" value="${esc(a.id)}">
<select name="matricula"><option value="">(sin director)</option>${staff.filter((s) => s.activo).map((s) =>
  `<option value="${esc(s.matricula)}"${dir && dir.matricula === s.matricula ? " selected" : ""}>${esc(s.nombre)}</option>`).join("")}</select>
<button class="btn sec mini" type="submit">Guardar</button></form>
<form method="post" action="/tareas/equipo/area/borrar" onsubmit="return confirm('¿Borrar el área ${esc(a.nombre)}? Sus tareas y personas quedan sin área, no se pierden.')" style="display:inline"><input type="hidden" name="area" value="${esc(a.id)}"><button class="btn sec mini peligro" type="submit">Borrar</button></form></td></tr>`;
  }).join("");
  const cuerpo = `
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<h2>Personas <small>${staff.filter((s) => s.activo).length} activas</small></h2>
<div class="scroll"><table>
<tr><th></th><th>Persona</th><th>Área y rol</th><th>Cuenta</th><th></th></tr>${filas}</table></div>
<p class="det" style="margin-top:8px">Cambiar área o rol aplica en todos lados al instante: tablero, lámina, pasar lista y Notion. Dar de baja conserva su historial. El PIN nuevo se muestra una sola vez.</p>

<h2>Dar de alta a alguien</h2>
<form class="tarjeta fila" method="post" action="/tareas/equipo/alta">
  <div style="grid-column:span 2"><label>Nombre completo</label><input name="nombre" required minlength="5" maxlength="80" placeholder="Nombre y apellidos"></div>
  <div><label>Apodo</label><input name="apodo" maxlength="20" placeholder="Como le dicen"></div>
  <div><label>Matrícula</label><input name="matricula" required maxlength="12" placeholder="A0XXXXXXX" style="text-transform:uppercase"></div>
  <div><label>Área</label>${selArea(areas[1]?.id ?? "")}</div>
  <div><label>Rol</label>${selRol("coordinacion")}</div>
  <div style="grid-column:1/-1"><button class="btn" type="submit">Dar de alta y generar su PIN</button></div>
</form>

<h2>Áreas <small>${areas.length}</small></h2>
<div class="scroll"><table><tr><th>Área</th><th>Dirige</th><th></th></tr>${dirs}</table></div>
<form class="tarjeta fila" method="post" action="/tareas/equipo/area/nueva" style="margin-top:10px">
  <div style="grid-column:span 2"><label>Nueva área</label><input name="nombre" required minlength="3" maxlength="40" placeholder="p. ej. Vinculación"></div>
  <div><label>Emoji</label><input name="emoji" maxlength="4" placeholder="🤝"></div>
  <div><label>Color</label><input name="color" type="color" value="#C026D3"></div>
  <div style="grid-column:1/-1"><button class="btn sec" type="submit">Crear área</button></div>
</form>`;
  return paginaPortal("Equipo · MIND",
    cabecera(p, "equipo", "Equipo de MIND", "Cuentas, roles y quién dirige cada área"),
    cuerpo, CSS_PANEL + `table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E4E1D2; border-radius:14px; overflow:hidden; font-size:13.5px; }
th, td { padding:9px 11px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:middle; }
th { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; }
tr:last-child td { border-bottom:none; } tr.baja td { opacity:.55; }
.scroll { overflow-x:auto; }
td.acc { white-space:nowrap; }
form.edit { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
form.edit select { min-height:34px; font-size:13px; padding:5px 8px; width:auto; }
.cb { display:inline-flex; align-items:center; gap:4px; text-transform:none; letter-spacing:0; font-size:12px; margin:0; }
.cb input { width:15px; height:15px; min-height:0; }
.gente { display:flex; gap:3px; flex-wrap:wrap; } .gente .ava { width:24px; height:24px; font-size:10px; }
input[type=color] { padding:4px; height:44px; }`);
}
