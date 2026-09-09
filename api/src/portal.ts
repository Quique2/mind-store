// Pantallas del portal de tareas de MIND.
import { ROLES, areaDe, esPresidencia, dirigeArea, nombreCorto, puedeAsignar,
         type Area, type Persona } from "./staff";
import { ESTADOS, atrasada, badgeArea, badgeEstado, cuando, esAbierta, esc, fechaCorta, hoyISO,
         jsonSeguro, navPortal, paginaPortal, quienes, rangoSemana, semanaActual, sumarDias,
         tocaA, enSemana, type Tarea } from "./tareas";

interface EventoLite { id: string; titulo: string; fecha: string }

const cabecera = (p: Persona, actual: string, titulo: string, sub: string) => {
  const puede = puedeAsignar(p);
  return `${navPortal(p, actual, puede)}<h1>${esc(titulo)}</h1><p>${esc(sub)}</p>`;
};

// ---------------- entrar ----------------
export function renderEntrar(error?: string, matricula = ""): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Portal MIND</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:linear-gradient(150deg,#29A3C7,#2E4BC6 55%,#232D93); min-height:100vh; color:#1C2260;
       font-family:'Poppins','Segoe UI',system-ui,sans-serif; display:flex; align-items:center; justify-content:center; padding:20px; }
.caja { background:#F7F5EC; border-radius:20px; padding:30px 26px; width:100%; max-width:390px; box-shadow:0 20px 50px rgba(12,14,40,.3); }
h1 { font-size:24px; font-weight:800; }
p.sub { font-size:13px; color:#6A6F98; margin:4px 0 20px; line-height:1.5; }
label { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; display:block; margin-bottom:4px; }
input { width:100%; font:inherit; font-size:17px; padding:12px 14px; border:1.5px solid #DDD9C6; border-radius:12px; background:#fff; color:#1C2260; min-height:50px; }
input:focus { outline:2px solid #2E4BC6; outline-offset:1px; border-color:#2E4BC6; }
form { display:grid; gap:14px; }
button { font:inherit; font-weight:800; font-size:16px; color:#fff; background:#2E4BC6; border:none; border-radius:999px; padding:14px; min-height:50px; cursor:pointer; }
button:hover { background:#232D93; }
.err { background:#FDE8E8; border:1px solid #F0B8B8; color:#8A2626; border-radius:10px; padding:10px 14px; font-size:13px; }
.puntos { display:flex; gap:8px; justify-content:center; margin-top:22px; }
.puntos i { width:9px; height:9px; border-radius:50%; display:block; }
.pie { text-align:center; font-size:11.5px; color:#8A8FB5; margin-top:12px; }
</style></head><body>
<div class="caja">
  <h1>Portal MIND</h1>
  <p class="sub">Entra con tu matrícula y tu PIN. Si es tu primera vez, usa el PIN que te compartió Alexa y enseguida eliges el tuyo.</p>
  ${error ? `<div class="err" style="margin-bottom:14px">${esc(error)}</div>` : ""}
  <form method="post" action="/portal/entrar" autocomplete="on">
    <div><label for="m">Matrícula</label>
      <input id="m" name="matricula" required maxlength="12" placeholder="A0XXXXXXX" value="${esc(matricula)}"
        style="text-transform:uppercase" autocapitalize="characters" autocomplete="username"></div>
    <div><label for="p">PIN</label>
      <input id="p" name="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4"
        placeholder="4 dígitos" autocomplete="current-password"></div>
    <button type="submit">Entrar</button>
  </form>
  <div class="puntos"><i style="background:#8BC53F"></i><i style="background:#F5C518"></i><i style="background:#EC4899"></i><i style="background:#C026D3"></i><i style="background:#22B8CF"></i></div>
  <p class="pie">MIND · LiFE Grupos Estudiantiles</p>
</div></body></html>`;
}

export function renderElegirPin(p: Persona, error?: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Elige tu PIN · MIND</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:linear-gradient(150deg,#8BC53F,#2E4BC6 55%,#232D93); min-height:100vh; color:#1C2260;
       font-family:'Poppins','Segoe UI',system-ui,sans-serif; display:flex; align-items:center; justify-content:center; padding:20px; }
.caja { background:#F7F5EC; border-radius:20px; padding:30px 26px; width:100%; max-width:390px; box-shadow:0 20px 50px rgba(12,14,40,.3); }
h1 { font-size:23px; font-weight:800; }
p.sub { font-size:13px; color:#6A6F98; margin:4px 0 20px; line-height:1.5; }
label { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; display:block; margin-bottom:4px; }
input { width:100%; font:inherit; font-size:17px; padding:12px 14px; border:1.5px solid #DDD9C6; border-radius:12px; background:#fff; min-height:50px; }
input:focus { outline:2px solid #2E4BC6; outline-offset:1px; border-color:#2E4BC6; }
form { display:grid; gap:14px; }
button { font:inherit; font-weight:800; font-size:16px; color:#fff; background:#3F6B10; border:none; border-radius:999px; padding:14px; min-height:50px; cursor:pointer; }
.err { background:#FDE8E8; border:1px solid #F0B8B8; color:#8A2626; border-radius:10px; padding:10px 14px; font-size:13px; margin-bottom:12px; }
</style></head><body>
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

// ---------------- tarjeta de tarea ----------------
function tarjeta(t: Tarea, yo: Persona, areas: Area[], staff: Persona[], eventos: EventoLite[],
                 opciones: { editable: boolean; volver: string }): string {
  const a = areas.find((x) => x.id === t.area) ?? areaDe(yo, areas);
  const mio = tocaA(t, yo.matricula);
  const puedeMarcar = mio || dirigeArea(yo, t.area, areas);
  const atras = atrasada(t);
  const ev = t.evidencia.map((e) => e.tipo === "enlace"
    ? `<a href="${esc(e.url ?? "")}" target="_blank" rel="noopener">🔗 ${esc(e.nombre)}</a>`
    : `<a href="/tareas/evidencia/${esc(e.archivo ?? "")}" target="_blank">📎 ${esc(e.nombre)}</a>`).join("");
  const oculto = `<input type="hidden" name="id" value="${esc(t.id)}"><input type="hidden" name="volver" value="${esc(opciones.volver)}">`;
  const acciones: string[] = [];
  if (puedeMarcar && esAbierta(t)) {
    if (t.estado === "pendiente") acciones.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="curso"><button class="btn sec mini" type="submit">▶ Empezar</button></form>`);
    acciones.push(`<form method="post" action="/tareas/estado">${oculto}<input type="hidden" name="estado" value="hecha"><button class="btn ok mini" type="submit">✓ Marcar hecha</button></form>`);
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
    `<option value="${esc(s.matricula)}"${t.asignados.includes(s.matricula) ? " selected" : ""}>${esc(nombreCorto(s))} · ${esc(a.id === s.area ? "" : areaDe(s, areas).nombre)}</option>`).join("");
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
    <div style="grid-column:1/-1"><label>Responsables (deja vacío para TODOS)</label>
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
  return `<article class="tarea${atras ? " atrasada" : ""}${esAbierta(t) ? "" : " hecha"}">
  <h3>${esc(t.titulo)}</h3>
  ${t.detalle ? `<div class="det">${esc(t.detalle)}</div>` : ""}
  <div class="meta">${badgeArea(a)} ${badgeEstado(t)} <span>${esc(cuando(t, eventos))}</span>
    ${atras ? '<span style="color:#A03434;font-weight:700">atrasada</span>' : ""}
    <span>· ${esc(quienes(t, staff))}</span>
    ${t.hechaEl ? `<span>· hecha el ${esc(fechaCorta(t.hechaEl.slice(0, 10)))}</span>` : ""}</div>
  ${ev ? `<div class="evid">${ev}</div>` : ""}
  ${acciones.length ? `<div class="acc">${acciones.join("")}</div>` : ""}
  ${formEvidencia}${formEditar}
</article>`;
}

const JS_TOGGLE = `<script>
function toggle(id) { const e = document.getElementById(id); if (e) e.hidden = !e.hidden; }
</script>`;
const CSS_PANEL = `
.panel { background:#F4FBFD; border:1px solid #DDF1F8; border-radius:12px; padding:12px; margin-top:10px; }
.panel input, .panel select { min-height:40px; font-size:14px; padding:8px 10px; }
.panel select[multiple] { min-height:120px; }
.grupo { margin-bottom:22px; }
.grupo > h3 { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#6A6F98; margin-bottom:8px; }
`;

// ---------------- mis tareas ----------------
export function renderYo(p: Persona, todas: Tarea[], areas: Area[], staff: Persona[],
                         eventos: EventoLite[], aviso?: string): string {
  const mias = todas.filter((t) => tocaA(t, p.matricula));
  const abiertas = mias.filter(esAbierta);
  const orden = (t: Tarea) => (atrasada(t) ? 0 : 1) + (t.vigencia.tipo === "fechas" ? 0 : 0.5);
  abiertas.sort((a, b) => orden(a) - orden(b) || (a.vigencia.fin ?? "9").localeCompare(b.vigencia.fin ?? "9"));
  const hechas = mias.filter((t) => !esAbierta(t))
    .sort((a, b) => (b.hechaEl ?? "").localeCompare(a.hechaEl ?? "")).slice(0, 12);
  const editable = puedeAsignar(p, areas);
  const pinta = (l: Tarea[]) => l.map((t) => tarjeta(t, p, areas, staff, eventos,
    { editable: editable && dirigeArea(p, t.area, areas), volver: "/portal" })).join("");
  const a = areaDe(p, areas);
  const cuerpo = `
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<h2>Pendientes <small>${abiertas.length}</small></h2>
${abiertas.length ? pinta(abiertas) : '<div class="vacio">Nada pendiente ahora mismo. 🎉</div>'}
${hechas.length ? `<h2>Cerradas hace poco <small>${hechas.length}</small></h2>${pinta(hechas)}` : ""}
<h2>Tu cuenta</h2>
<div class="tarjeta">
  <p style="font-size:13.5px">Eres <b>${esc(ROLES[p.rol].nombre)}</b> de <b>${esc(a.nombre)}</b>${p.admin ? " · con permiso de administración" : ""}.</p>
  <form method="post" action="/portal/pin-cambiar" class="fila" style="margin-top:12px">
    <div><label>PIN actual</label><input name="actual" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4"></div>
    <div><label>PIN nuevo</label><input name="pin" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4"></div>
    <div style="align-self:end"><button class="btn sec" type="submit">Cambiar mi PIN</button></div>
  </form>
</div>${JS_TOGGLE}`;
  return paginaPortal(`Mis tareas · MIND`,
    cabecera(p, "yo", `Hola, ${nombreCorto(p)}`, `${abiertas.length} pendiente${abiertas.length === 1 ? "" : "s"} · semana del ${rangoSemana(semanaActual())}`),
    cuerpo, CSS_PANEL);
}

// ---------------- tablero ----------------
export function renderTablero(p: Persona, todas: Tarea[], areas: Area[], staff: Persona[],
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
      suyas.map((t) => tarjeta(t, p, areas, staff, eventos,
        { editable: dirigeArea(p, t.area, areas), volver: "/tareas" })).join("")}</div>`;
  }).join("");
  const sinArea = abiertas.filter((t) => !areas.some((a) => a.id === t.area));
  const opcionesPersonas = staff.filter((s) => s.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((s) => `<option value="${esc(s.matricula)}">${esc(nombreCorto(s))} · ${esc(areaDe(s, areas).nombre)}</option>`).join("");
  const areasQuePuede = areas.filter((a) => dirigeArea(p, a.id, areas));
  const hoy = hoyISO();
  const cuerpo = `
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<h2>Nueva tarea</h2>
<form class="tarjeta" method="post" action="/tareas/nueva">
  <div class="fila">
    <div style="grid-column:1/-1"><label for="tit">¿Qué hay que hacer?</label>
      <input id="tit" name="titulo" required maxlength="120" placeholder="p. ej. Buscar espacio para la NeuroCharla"></div>
    <div style="grid-column:1/-1"><label for="det">Detalle (opcional)</label>
      <input id="det" name="detalle" maxlength="300" placeholder="Contexto, ligas, a quién contactar…"></div>
    <div><label for="ar">Área</label><select id="ar" name="area" required>${
      areasQuePuede.map((a) => `<option value="${esc(a.id)}"${a.id === p.area ? " selected" : ""}>${a.emoji} ${esc(a.nombre)}</option>`).join("")}</select></div>
    <div><label for="vig">Vigencia</label><select id="vig" name="vigencia" onchange="vig()">
      <option value="fechas">Con fechas</option><option value="transversal">Transversal</option>
      <option value="evento">Para un evento</option></select></div>
    <div id="c-ini"><label for="ini">Del</label><input id="ini" type="date" name="inicio" value="${hoy}"></div>
    <div id="c-fin"><label for="fin">Al</label><input id="fin" type="date" name="fin" value="${sumarDias(semanaActual(), 6)}"></div>
    <div id="c-ev" hidden><label for="evv">Evento</label><select id="evv" name="evento"><option value="">(ninguno)</option>${
      eventos.map((e) => `<option value="${esc(e.id)}">${esc(e.titulo)} · ${esc(fechaCorta(e.fecha))}</option>`).join("")}</select></div>
    <div style="grid-column:1/-1"><label for="asig">Responsables <span style="text-transform:none;letter-spacing:0">(varios con Ctrl o Cmd; vacío = TODOS)</span></label>
      <select id="asig" name="asignados" multiple size="6">${opcionesPersonas}</select></div>
  </div>
  <div style="margin-top:12px"><button class="btn" type="submit">Crear y asignar</button></div>
</form>

<h2>Abiertas <small>${abiertas.length} de ${visibles.length}</small>
  <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
    <a class="btn sec mini" href="/tareas">Todas</a>
    ${areas.map((a) => `<a class="btn sec mini" href="/tareas?area=${esc(a.id)}"${filtro === a.id ? ' style="background:#1C2260;color:#fff"' : ""}>${a.emoji} ${esc(a.nombre)}</a>`).join("")}
  </span></h2>
${grupos || '<div class="vacio">No hay tareas abiertas con este filtro.</div>'}
${sinArea.length ? `<div class="grupo"><h3>Sin área · ${sinArea.length}</h3>${sinArea.map((t) => tarjeta(t, p, areas, staff, eventos, { editable: puedeTodo, volver: "/tareas" })).join("")}</div>` : ""}
${puedeTodo ? `<h2>Cerrar la semana</h2>
<div class="tarjeta"><p style="font-size:13.5px;color:#6A6F98">Revisa lo que quedó abierto: lo que palomees se pasa a la próxima semana y el resto queda vencido.</p>
<p style="margin-top:12px"><a class="btn" href="/tareas/cerrar-semana">Revisar y cerrar la semana</a></p></div>` : ""}
${cerradas.length ? `<h2>Cerradas hace poco</h2>${cerradas.map((t) => tarjeta(t, p, areas, staff, eventos, { editable: dirigeArea(p, t.area, areas), volver: "/tareas" })).join("")}` : ""}
${JS_TOGGLE}
<script>
function vig() {
  const v = document.getElementById('vig').value;
  document.getElementById('c-ini').hidden = v !== 'fechas';
  document.getElementById('c-fin').hidden = v !== 'fechas';
  document.getElementById('c-ev').hidden = v !== 'evento';
}
vig();
</script>`;
  return paginaPortal("Tablero de tareas · MIND",
    cabecera(p, "tablero", "Tablero de tareas", `${abiertas.length} abiertas · semana del ${rangoSemana(semanaActual())}`),
    cuerpo, CSS_PANEL + `h2 { justify-content:flex-start; }`);
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
  // 1) medir
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
  // 2) repartir en columnas balanceando alto
  const cols = Array.from({ length: COLS }, () => ({ alto: 0, bloques: [] }));
  for (const b of bloques.sort((p, q) => q.alto - p.alto)) {
    const menor = cols.reduce((a, b2) => (a.alto <= b2.alto ? a : b2));
    menor.bloques.push(b); menor.alto += b.alto;
  }
  const altoCuerpo = Math.max(...cols.map((c2) => c2.alto), 100);
  const ALTO = 190 + altoCuerpo + 80;
  c.width = A; c.height = ALTO;
  c.style.width = '100%'; c.style.height = 'auto';
  // 3) pintar
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

// ---------------- equipo (solo presidencia) ----------------
export function renderEquipo(p: Persona, staff: Persona[], areas: Area[], aviso?: string): string {
  const filas = [...staff].sort((a, b) => ROLES[a.rol].orden - ROLES[b.rol].orden || a.nombre.localeCompare(b.nombre))
    .map((s) => {
      const a = areaDe(s, areas);
      const estado = !s.pinHash ? '<span class="chip" style="background:#FBECEC;color:#A03434">sin PIN</span>'
        : s.provisional ? '<span class="chip" style="background:#FDF3D7;color:#8A6A10">PIN provisional</span>'
        : '<span class="chip" style="background:#E8F3D9;color:#3F6B10">activa</span>';
      return `<tr><td><b>${esc(s.nombre)}</b><div class="det">${esc(s.matricula)}${s.apodo ? " · " + esc(s.apodo) : ""}</div></td>
<td>${badgeArea(a)}</td><td>${esc(ROLES[s.rol].nombre)}${s.admin ? '<div class="det">admin</div>' : ""}</td>
<td>${estado}${s.ultimoAcceso ? `<div class="det">entró ${esc(s.ultimoAcceso.slice(0, 10))}</div>` : ""}</td>
<td class="acc"><form method="post" action="/tareas/equipo/pin" onsubmit="return confirm('¿Generar un PIN nuevo para ${esc(s.nombre)}? El anterior deja de servir.')">
<input type="hidden" name="matricula" value="${esc(s.matricula)}"><button class="btn sec mini" type="submit">Nuevo PIN</button></form></td></tr>`;
    }).join("");
  const dirs = areas.map((a) => {
    const dir = staff.find((s) => s.matricula === a.director) ??
                staff.find((s) => s.area === a.id && s.rol === "direccion");
    return `<tr><td>${badgeArea(a)}</td><td>${dir ? esc(dir.nombre) : '<span class="det">sin director</span>'}</td>
<td class="acc"><form method="post" action="/tareas/equipo/director" class="fila" style="gap:6px">
<input type="hidden" name="area" value="${esc(a.id)}">
<select name="matricula"><option value="">(sin director)</option>${staff.filter((s) => s.activo).map((s) =>
  `<option value="${esc(s.matricula)}"${dir && dir.matricula === s.matricula ? " selected" : ""}>${esc(s.nombre)}</option>`).join("")}</select>
<button class="btn sec mini" type="submit">Guardar</button></form></td></tr>`;
  }).join("");
  const cuerpo = `
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
<h2>Personas <small>${staff.length}</small></h2>
<div class="scroll"><table>
<tr><th>Persona</th><th>Área</th><th>Rol</th><th>Cuenta</th><th></th></tr>${filas}</table></div>
<p class="det" style="margin-top:8px">El PIN nuevo se muestra una sola vez, al generarlo. Si alguien lo pierde, genera otro y compártelo.</p>
<h2>Direcciones de área</h2>
<div class="scroll"><table><tr><th>Área</th><th>Dirige</th><th></th></tr>${dirs}</table></div>`;
  return paginaPortal("Equipo · MIND",
    cabecera(p, "equipo", "Equipo de MIND", "Cuentas, roles y quién dirige cada área"),
    cuerpo, `table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E4E1D2; border-radius:14px; overflow:hidden; font-size:13.5px; }
th, td { padding:9px 11px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:middle; }
th { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; }
tr:last-child td { border-bottom:none; }
.scroll { overflow-x:auto; }
td.acc { white-space:nowrap; } td.acc form { display:inline-flex; align-items:center; }
td.acc select { min-height:34px; font-size:13px; padding:5px 8px; width:auto; }`);
}
