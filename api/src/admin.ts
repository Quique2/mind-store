// Panel ejecutivo de MIND: estado de cuenta + eventos + asistencia en gráficas,
// y edición del catálogo (precios, altas, bajas, ocultar). Los números se
// calculan aquí en el servidor; Chart.js solo los pinta en el navegador.
import type { Mov } from "./cuentas";
import { TIPOS, fechaBonita, esStaff, type Evento, type Asistencia, type TipoId } from "./eventos";
import type { Product } from "./products";
import { NAV_CSS, navAdmin } from "./ui";

export interface DatosPanel {
  movs: Mov[];
  stripeOk: boolean;
  eventos: Evento[];
  asistencias: Asistencia[];
  productos: Product[];
  editado: boolean;      // ¿el catálogo viene del disco (editado) o del repo?
  clave: string;
  aviso?: string;
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const jsonSeguro = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesos = (centavos: number) => (centavos / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Los conceptos del estado de cuenta los escribe una persona ("Hexafidget",
// "Fidget Spinner"...): se mapean al catálogo por nombre o por alias.
const ALIAS: Record<string, string[]> = {
  "fidget-omega": ["hexafidget", "omega", "fidget hex"],
  "spinner-engranes": ["spinner"],
  cubito: ["cubito", "cubo"],
  "pelota-antiestres": ["pelota"],
  squishy: ["squishy", "squishie"],
  popit: ["pop-it", "popit", "pop it"],
  stickers: ["sticker", "calcoman"],
};
function productoDe(concepto: string, productos: Product[]): string | null {
  const c = norm(concepto);
  for (const p of productos) {
    const claves = [norm(p.nombre), ...(ALIAS[p.id] ?? [])];
    if (claves.some((k) => k && c.includes(k))) return p.nombre;
  }
  return null;
}

// fechas ISO (YYYY-MM-DD) manipuladas en UTC a mediodía para no cruzar de día
const aDate = (f: string) => new Date(f + "T12:00:00Z");
const sumarDias = (f: string, n: number) => {
  const d = aDate(f); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const lunes = (f: string) => sumarDias(f, -((aDate(f).getUTCDay() + 6) % 7));

export function calcular(d: DatosPanel) {
  const neto = (m: Mov) => m.monto - m.comision;
  const ventas = d.movs.filter((m) => m.evento !== "inicial");
  const hoy = new Date().toISOString().slice(0, 10);
  const suma = (f: (m: Mov) => boolean) => d.movs.filter(f).reduce((s, m) => s + neto(m), 0);
  const total = suma(() => true);
  const metodos = {
    efectivo: suma((m) => m.metodo === "efectivo"),
    transferencia: suma((m) => m.metodo === "revolut" || m.metodo === "spei"),
    stripe: suma((m) => m.metodo === "stripe"),
  };
  const ingresos30 = ventas.filter((m) => m.fecha >= sumarDias(hoy, -30))
                           .reduce((s, m) => s + neto(m), 0);
  const bruto = ventas.reduce((s, m) => s + m.monto, 0);

  // ingresos por semana (últimas 30 como máximo), apilados por método
  const semanas: { label: string; efectivo: number; transferencia: number; stripe: number }[] = [];
  const fechas = ventas.map((m) => m.fecha).sort();
  if (fechas.length) {
    const fin = lunes(hoy);
    let w = lunes(fechas[0]);
    if (w < sumarDias(fin, -7 * 29)) w = sumarDias(fin, -7 * 29);
    const idx = new Map<string, number>();
    for (; w <= fin; w = sumarDias(w, 7)) {
      idx.set(w, semanas.length);
      semanas.push({ label: fechaBonita(w).replace(/ \d{4}$/, ""), efectivo: 0, transferencia: 0, stripe: 0 });
    }
    for (const m of ventas) {
      const i = idx.get(lunes(m.fecha));
      if (i === undefined) continue;
      const k = m.metodo === "efectivo" ? "efectivo" : m.metodo === "stripe" ? "stripe" : "transferencia";
      semanas[i][k] += neto(m);
    }
  }

  // saldo acumulado por fecha (incluye el saldo inicial)
  const porFecha = new Map<string, number>();
  for (const m of d.movs) porFecha.set(m.fecha, (porFecha.get(m.fecha) ?? 0) + neto(m));
  let acum = 0;
  const saldo = [...porFecha.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([f, v]) => { acum += v; return { label: fechaBonita(f), y: Math.round(acum * 100) / 100 }; });

  const agrupar = (clave: (m: Mov) => string) => {
    const mapa = new Map<string, number>();
    for (const m of ventas) mapa.set(clave(m), (mapa.get(clave(m)) ?? 0) + m.monto);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]).map(([label, y]) => ({ label, y }));
  };
  const porEvento = agrupar((m) => m.evento);
  const porProducto = agrupar((m) => productoDe(m.concepto, d.productos) ?? "Sin desglose");

  // asistencia: por evento (cronológico) con nuevos vs recurrentes, por tipo, ranking.
  // El staff se cuenta aparte: no infla la asistencia ni el ranking.
  const asis = d.asistencias.filter((a) => !esStaff(a));
  const staff = d.asistencias.filter(esStaff);
  const evIdx = new Map(d.eventos.map((e) => [e.id, e]));
  const evOrden = [...d.eventos].sort((a, b) =>
    a.fecha === b.fecha ? (a.creado < b.creado ? -1 : 1) : (a.fecha < b.fecha ? -1 : 1));
  const vistos = new Set<string>();
  const asistenciaEventos = evOrden.map((e) => {
    const lista = asis.filter((a) => a.evento === e.id);
    let nuevos = 0;
    for (const a of lista) if (!vistos.has(a.matricula)) { nuevos++; vistos.add(a.matricula); }
    return { titulo: e.titulo, corto: fechaBonita(e.fecha), emoji: TIPOS[e.tipo].emoji,
             total: lista.length, nuevos, recurrentes: lista.length - nuevos, color: TIPOS[e.tipo].color,
             staff: staff.filter((a) => a.evento === e.id).length };
  });
  const porTipo = (Object.keys(TIPOS) as TipoId[]).map((t) => ({
    label: `${TIPOS[t].emoji} ${TIPOS[t].nombre}`, color: TIPOS[t].color,
    y: asis.filter((a) => evIdx.get(a.evento)?.tipo === t).length,
  }));
  const personas = new Map<string, { nombre: string; mat: string; evs: Set<string>; tipos: Set<TipoId> }>();
  for (const a of asis) {
    const p = personas.get(a.matricula) ?? { nombre: a.nombre, mat: a.matricula, evs: new Set(), tipos: new Set() };
    p.evs.add(a.evento);
    const e = evIdx.get(a.evento);
    if (e) p.tipos.add(e.tipo);
    p.nombre = a.nombre;
    personas.set(a.matricula, p);
  }
  const top = [...personas.values()]
    .sort((a, b) => b.evs.size - a.evs.size || a.nombre.localeCompare(b.nombre)).slice(0, 10);

  return { total, metodos, ingresos30, nVentas: ventas.length,
           ticket: ventas.length ? bruto / ventas.length : 0,
           semanas, saldo, porEvento, porProducto, asistenciaEventos, porTipo, top,
           nAsis: asis.length, nStaff: staff.length,
           nStaffPersonas: new Set(staff.map((a) => a.matricula)).size,
           nPersonas: personas.size, abiertos: d.eventos.filter((e) => e.abierto).length,
           ultimos: [...ventas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 8),
           evRecientes: [...evOrden].reverse().slice(0, 6) };
}

const CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#F7F5EC; color:#1C2260; font-family:'Poppins','Segoe UI',system-ui,sans-serif; }
header { background:linear-gradient(140deg,#29A3C7,#2E4BC6 60%,#232D93); color:#fff; padding:26px 22px; }
header h1 { font-size:24px; font-weight:800; }
header p { font-size:12.5px; color:#CFE4F5; margin-top:2px; }
main { max-width:1040px; margin:0 auto; padding:20px 18px 70px; }
h2 { font-size:18px; font-weight:800; margin:30px 0 12px; display:flex; align-items:center; gap:10px; }
h2 small { font-size:12px; font-weight:600; color:#6A6F98; }
.kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
.kpi { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:13px 15px; }
.kpi small { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#6A6F98; display:block; }
.kpi b { font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; display:block; margin-top:2px; }
.kpi span { font-size:11.5px; color:#8A8FB5; }
.kpi.total { background:#1C2260; color:#F5EFD8; border-color:#1C2260; }
.kpi.total small { color:#B9C4E8; } .kpi.total span { color:#B9C4E8; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
@media (max-width:760px) { .grid2 { grid-template-columns:1fr; } }
.graf { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:14px 14px 10px; min-width:0; }
.graf h3 { font-size:13px; font-weight:800; margin-bottom:8px; }
.graf h3 small { font-weight:600; color:#8A8FB5; font-size:11px; margin-left:6px; }
.lienzo { position:relative; height:250px; }
.vacio { color:#8A8FB5; font-size:13px; padding:14px 4px; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th, td { padding:7px 8px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:top; }
th { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; }
tr:last-child td { border-bottom:none; }
.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.rank td:first-child { font-weight:800; color:#2E4BC6; width:30px; }
.tipo { font-size:10.5px; font-weight:700; border-radius:999px; padding:2px 8px; white-space:nowrap; }
.est { font-size:11px; font-weight:700; border-radius:999px; padding:2px 9px; }
.est.abierto { background:#E8F3D9; color:#3F6B10; } .est.cerrado { background:#EEECE3; color:#6A6F98; }
.met { font-size:10.5px; font-weight:600; border-radius:999px; padding:2px 8px; white-space:nowrap; }
.met-efectivo { background:#E8F3D9; color:#4C7A15; } .met-revolut, .met-spei { background:#DDF1F8; color:#156F8F; } .met-stripe { background:#E4E4F9; color:#4740B3; }
.det { font-size:11px; color:#8A8FB5; }
.ok-aviso { background:#E8F3D9; border:1px solid #BEDD97; border-radius:10px; padding:10px 14px; font-size:13px; margin:0 0 14px; color:#3F6B10; font-weight:600; }
.aviso { background:#FDF3D7; border:1px solid #EAD9A0; border-radius:10px; padding:10px 14px; font-size:12.5px; margin:0 0 14px; }
.nota { font-size:12.5px; color:#6A6F98; margin:-4px 0 12px; }
.productos { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
form.prod { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:14px; display:grid; gap:10px; }
form.prod.oculto { background:#F3F1E6; border-style:dashed; }
form.prod.nuevo { border:2px dashed #29A3C7; background:#F4FBFD; }
.prod-cab { display:flex; align-items:center; gap:10px; }
.prod-cab .ico { width:40px; height:40px; border-radius:10px; background:#29A3C7; color:#fff; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; flex:none; }
.prod-cab b { font-size:15px; } .prod-cab code { font-size:11px; color:#8A8FB5; font-family:ui-monospace,monospace; }
.prod-cab .oc { margin-left:auto; font-size:10.5px; font-weight:700; background:#EEECE3; color:#6A6F98; border-radius:999px; padding:2px 8px; }
.campos { display:grid; grid-template-columns:1fr 1fr; gap:8px 10px; }
.campos .ancho { grid-column:1 / -1; }
label { font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; display:block; margin-bottom:3px; }
input { width:100%; font:inherit; font-size:14px; padding:9px 10px; border:1.5px solid #DDD9C6; border-radius:9px; background:#FCFBF5; color:#1C2260; min-height:40px; }
input:focus { outline:2px solid #2E4BC6; outline-offset:1px; border-color:#2E4BC6; }
.check label { text-transform:none; letter-spacing:0; font-size:13px; font-weight:600; color:#1C2260; display:flex; align-items:center; gap:8px; margin-top:6px; }
.check input { width:18px; height:18px; min-height:0; }
.acciones { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.btn { font:inherit; font-weight:800; font-size:14px; color:#fff; background:#2E4BC6; border:none; border-radius:999px; padding:10px 18px; min-height:40px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; gap:6px; }
.btn:hover { background:#232D93; }
.btn.sec { background:#EFEDDF; color:#1C2260; border:1.5px solid #DDD9C6; font-weight:600; font-size:13px; }
.btn.sec:hover { background:#E2DFCB; }
.btn.peligro { color:#A03434; background:#FBECEC; border-color:#F0CFCF; } .btn.peligro:hover { background:#F5D9D9; }
.puntos { display:flex; gap:8px; justify-content:center; margin-top:28px; }
.puntos i { width:9px; height:9px; border-radius:50%; display:block; }
footer { font-size:11.5px; color:#8A8FB5; margin-top:14px; text-align:center; }
`;

const tarjetaProducto = (p: Product | null, q: string): string => {
  const nuevo = !p;
  const oculto = p?.disponible === false;
  const ico = p ? (p.emoji || p.nombre.trim().charAt(0).toUpperCase()) : "＋";
  return `<form class="prod${oculto ? " oculto" : ""}${nuevo ? " nuevo" : ""}" method="post" action="/admin/productos/guardar${q}">
  <input type="hidden" name="id" value="${p ? esc(p.id) : ""}">
  <div class="prod-cab"><span class="ico">${esc(ico)}</span>
    <div><b>${p ? esc(p.nombre) : "Nuevo producto"}</b><br><code>${p ? esc(p.id) : "se crea al guardar"}</code></div>
    ${oculto ? '<span class="oc">OCULTO</span>' : ""}</div>
  <div class="campos">
    <div class="ancho"><label>Nombre</label><input name="nombre" required minlength="2" maxlength="60" value="${p ? esc(p.nombre) : ""}" placeholder="p. ej. Llavero MIND"></div>
    <div><label>Precio (MXN)</label><input name="precio" type="number" step="0.01" min="1" max="100000" inputmode="decimal" required value="${p ? pesos(p.precioCentavos) : ""}" placeholder="50"></div>
    <div><label>Orden</label><input name="orden" type="number" min="0" max="999" value="${p ? p.orden ?? 0 : 99}"></div>
    <div class="ancho"><label>Descripción</label><input name="descripcion" maxlength="160" value="${p ? esc(p.descripcion) : ""}" placeholder="Una línea que venda"></div>
    <div><label>Emoji (ícono)</label><input name="emoji" maxlength="8" value="${p ? esc(p.emoji ?? "") : ""}" placeholder="${p ? "opcional" : "🔑"}"></div>
    <div class="check"><label><input type="checkbox" name="disponible"${!p || p.disponible !== false ? " checked" : ""}> Visible en la tienda</label></div>
  </div>
  <div class="acciones">
    <button class="btn" type="submit">${nuevo ? "Agregar a la tienda" : "Guardar"}</button>
    ${nuevo ? "" : `<button class="btn sec peligro" type="submit" formaction="/admin/productos/borrar${q}" formnovalidate
      onclick="return confirm('¿Quitar «${esc(p!.nombre)}» de la tienda? Si solo quieres pausarlo, desmarca “Visible”.')">Quitar</button>`}
  </div>
</form>`;
};

export function renderPanel(d: DatosPanel): string {
  const r = calcular(d);
  const q = `?clave=${encodeURIComponent(d.clave)}`;
  const clase = (m: Mov) => (["efectivo", "revolut", "spei", "stripe"].includes(m.metodo) ? m.metodo : "otro");
  const conteo = new Map<string, number>();
  for (const a of d.asistencias) if (!esStaff(a)) conteo.set(a.evento, (conteo.get(a.evento) ?? 0) + 1);
  const badge = (t: TipoId) =>
    `<span class="tipo" style="background:${TIPOS[t].color};color:${TIPOS[t].tinta}">${TIPOS[t].emoji} ${TIPOS[t].nombre}</span>`;
  const datosJS = {
    semanas: r.semanas, saldo: r.saldo, porEvento: r.porEvento, porProducto: r.porProducto,
    asistenciaEventos: r.asistenciaEventos, porTipo: r.porTipo,
  };
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Panel MIND</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>${CSS}${NAV_CSS}</style></head><body>
<header>${navAdmin(d.clave, "panel")}<h1>Panel MIND</h1><p>Vista ejecutiva · cuentas, eventos y asistencia · catálogo de la tienda</p></header>
<main>
${d.aviso ? `<div class="ok-aviso">${esc(d.aviso)}</div>` : ""}
${d.stripeOk ? "" : '<div class="aviso">⚠ No se pudo consultar Stripe ahora mismo: las cifras no incluyen ventas con tarjeta.</div>'}

<div class="kpis">
  <div class="kpi total"><small>Total MIND</small><b>${fmt(r.total)}</b><span>neto, todas las cuentas</span></div>
  <div class="kpi"><small>Últimos 30 días</small><b>${fmt(r.ingresos30)}</b><span>ingresos netos</span></div>
  <div class="kpi"><small>Movimientos</small><b>${r.nVentas}</b><span>ticket promedio ${fmt(r.ticket)}</span></div>
  <div class="kpi"><small>Eventos</small><b>${d.eventos.length}</b><span>${r.abiertos} con registro abierto</span></div>
  <div class="kpi"><small>Asistencias</small><b>${r.nAsis}</b><span>${d.eventos.length ? (r.nAsis / d.eventos.length).toFixed(1) : "0"} por evento · sin staff</span></div>
  <div class="kpi"><small>Personas distintas</small><b>${r.nPersonas}</b><span>matrículas únicas</span></div>
  <div class="kpi"><small>Staff</small><b>${r.nStaff}</b><span>${r.nStaffPersonas} persona${r.nStaffPersonas === 1 ? "" : "s"} de staff</span></div>
</div>

<h2>💰 Dinero <small>efectivo ${fmt(r.metodos.efectivo)} · transferencia ${fmt(r.metodos.transferencia)} · tarjeta ${fmt(r.metodos.stripe)}</small></h2>
<div class="grid2">
  <div class="graf"><h3>Ingresos por semana <small>neto, por método</small></h3><div class="lienzo"><canvas id="c-semanas"></canvas></div></div>
  <div class="graf"><h3>Saldo acumulado <small>desde el corte inicial</small></h3><div class="lienzo"><canvas id="c-saldo"></canvas></div></div>
</div>
<div class="grid2">
  <div class="graf"><h3>Recaudado por evento <small>bruto</small></h3><div class="lienzo"><canvas id="c-eventos"></canvas></div></div>
  <div class="graf"><h3>Ventas por producto <small>según el concepto capturado</small></h3><div class="lienzo"><canvas id="c-productos"></canvas></div></div>
</div>

<h2>🎟️ Eventos y asistencia</h2>
<div class="grid2">
  <div class="graf"><h3>Asistencia por evento <small>asistentes y staff</small></h3><div class="lienzo"><canvas id="c-asis"></canvas></div></div>
  <div class="graf"><h3>Por tipo de evento <small>sin staff</small></h3><div class="lienzo"><canvas id="c-tipos"></canvas></div></div>
</div>
<div class="grid2">
  <div class="graf"><h3>Nuevos vs. recurrentes <small>¿la gente regresa?</small></h3><div class="lienzo"><canvas id="c-retencion"></canvas></div></div>
  <div class="graf"><h3>Quienes más asisten <small>sin staff</small></h3>
    ${r.top.length ? `<table class="rank"><tr><th>#</th><th>Persona</th><th class="num">Eventos</th><th>Tipos</th></tr>${
      r.top.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.nombre)}<div class="det">${esc(p.mat)}</div></td><td class="num">${p.evs.size}</td><td>${[...p.tipos].map(badge).join(" ")}</td></tr>`).join("")
    }</table>` : '<p class="vacio">Aún no hay asistencias registradas.</p>'}</div>
</div>
<div class="grid2">
  <div class="graf"><h3>Últimos movimientos</h3>
    ${r.ultimos.length ? `<table><tr><th>Fecha</th><th>Método</th><th>Concepto</th><th class="num">Monto</th></tr>${
      r.ultimos.map((m) => `<tr><td>${esc(fechaBonita(m.fecha))}</td><td><span class="met met-${clase(m)}">${esc(m.metodo)}</span></td><td>${esc(m.concepto)}<div class="det">${esc(m.detalle)}</div></td><td class="num">${fmt(m.monto)}</td></tr>`).join("")
    }</table>` : '<p class="vacio">Sin movimientos.</p>'}
    <p class="det" style="margin-top:8px"><a href="/cuentas${q}" style="color:#2E4BC6;font-weight:600">Ver estado de cuenta completo y capturar →</a></p></div>
  <div class="graf"><h3>Eventos recientes</h3>
    ${r.evRecientes.length ? `<table><tr><th>Fecha</th><th>Evento</th><th class="num">Asist.</th><th>Estado</th></tr>${
      r.evRecientes.map((e) => `<tr><td>${esc(fechaBonita(e.fecha))}</td><td>${badge(e.tipo)}<div style="margin-top:3px">${esc(e.titulo)}</div></td><td class="num">${conteo.get(e.id) ?? 0}</td><td><span class="est ${e.abierto ? "abierto" : "cerrado"}">${e.abierto ? "abierto" : "cerrado"}</span></td></tr>`).join("")
    }</table>` : '<p class="vacio">Todavía no hay eventos.</p>'}
    <p class="det" style="margin-top:8px"><a href="/eventos${q}" style="color:#2E4BC6;font-weight:600">Crear eventos y compartir enlaces →</a></p></div>
</div>

<h2 id="productos">🛍️ Catálogo de la tienda <small>${d.productos.length} productos · ${d.productos.filter((p) => p.disponible !== false).length} visibles</small></h2>
<p class="nota">Lo que guardes aquí se refleja al instante en la tienda, en el cobro con tarjeta y en los botones rápidos de Cuentas.${d.editado ? "" : " Ahora mismo se usa el catálogo original del repositorio."}</p>
<div class="productos">
  ${d.productos.map((p) => tarjetaProducto(p, q)).join("\n")}
  ${tarjetaProducto(null, q)}
</div>
${d.editado ? `<form method="post" action="/admin/productos/restaurar${q}" style="margin-top:14px"
  onsubmit="return confirm('¿Volver al catálogo original del repositorio? Se pierden los cambios hechos aquí.')">
  <button class="btn sec" type="submit">↺ Restaurar catálogo original</button></form>` : ""}

<div class="puntos"><i style="background:#8BC53F"></i><i style="background:#F5C518"></i><i style="background:#EC4899"></i><i style="background:#C026D3"></i><i style="background:#22B8CF"></i></div>
<footer>Cifras al cargar la página · Stripe con caché de 10 min · MIND · LiFE Grupos Estudiantiles</footer>
</main>
<script>
const D = ${jsonSeguro(datosJS)};
const PALETA = ['#29A3C7','#EC4899','#F5C518','#8BC53F','#22B8CF','#C026D3','#F59E0B','#2E4BC6','#6A6F98','#EF6C4C'];
const mxn = (v) => '$' + Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 });
const sinDatos = (id, vacio) => {
  const c = document.getElementById(id);
  if (vacio) { c.parentElement.innerHTML = '<p class="vacio">Sin datos todavía.</p>'; return null; }
  return c;
};
if (typeof Chart === 'undefined') {
  document.querySelectorAll('.lienzo').forEach((l) => { l.innerHTML = '<p class="vacio">No se pudo cargar la librería de gráficas (¿sin internet?).</p>'; });
} else {
  Chart.defaults.font.family = "'Poppins','Segoe UI',system-ui,sans-serif";
  Chart.defaults.color = '#6A6F98';
  const base = { responsive: true, maintainAspectRatio: false };
  const leyenda = (pos) => ({ legend: { position: pos, labels: { boxWidth: 12, usePointStyle: true } } });
  let c;
  if ((c = sinDatos('c-semanas', !D.semanas.length))) new Chart(c, { type: 'bar',
    data: { labels: D.semanas.map((s) => s.label), datasets: [
      { label: 'Efectivo', data: D.semanas.map((s) => s.efectivo), backgroundColor: '#8BC53F' },
      { label: 'Transferencia / Revolut', data: D.semanas.map((s) => s.transferencia), backgroundColor: '#29A3C7' },
      { label: 'Tarjeta (neto)', data: D.semanas.map((s) => s.stripe), backgroundColor: '#C026D3' } ] },
    options: { ...base, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: mxn } } },
      plugins: { ...leyenda('bottom'), tooltip: { callbacks: { label: (t) => t.dataset.label + ': ' + mxn(t.raw) } } } } });
  if ((c = sinDatos('c-saldo', !D.saldo.length))) new Chart(c, { type: 'line',
    data: { labels: D.saldo.map((s) => s.label), datasets: [{ label: 'Saldo', data: D.saldo.map((s) => s.y),
      borderColor: '#2E4BC6', backgroundColor: 'rgba(46,75,198,.12)', fill: true, tension: .3, pointRadius: 3, pointBackgroundColor: '#2E4BC6' }] },
    options: { ...base, scales: { x: { grid: { display: false } }, y: { ticks: { callback: mxn } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (t) => 'Saldo: ' + mxn(t.raw) } } } } });
  if ((c = sinDatos('c-eventos', !D.porEvento.length))) new Chart(c, { type: 'bar',
    data: { labels: D.porEvento.map((e) => e.label), datasets: [{ data: D.porEvento.map((e) => e.y), backgroundColor: PALETA, borderRadius: 6 }] },
    options: { ...base, indexAxis: 'y', scales: { x: { ticks: { callback: mxn } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (t) => mxn(t.raw) } } } } });
  if ((c = sinDatos('c-productos', !D.porProducto.length))) new Chart(c, { type: 'doughnut',
    data: { labels: D.porProducto.map((p) => p.label), datasets: [{ data: D.porProducto.map((p) => p.y), backgroundColor: PALETA, borderWidth: 2, borderColor: '#fff' }] },
    options: { ...base, cutout: '58%', plugins: { ...leyenda('bottom'), tooltip: { callbacks: { label: (t) => t.label + ': ' + mxn(t.raw) } } } } });
  if ((c = sinDatos('c-asis', !D.asistenciaEventos.length))) new Chart(c, { type: 'bar',
    data: { labels: D.asistenciaEventos.map((e) => [e.corto, e.emoji + ' ' + e.titulo.slice(0, 22)]),
      datasets: [
        { label: 'Asistentes', data: D.asistenciaEventos.map((e) => e.total), backgroundColor: D.asistenciaEventos.map((e) => e.color), borderRadius: 6 },
        { label: 'Staff', data: D.asistenciaEventos.map((e) => e.staff), backgroundColor: '#C9CCE0', borderRadius: 6 } ] },
    options: { ...base, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { ...leyenda('bottom'), tooltip: { callbacks: { title: (t) => D.asistenciaEventos[t[0].dataIndex].titulo, label: (t) => t.dataset.label + ': ' + t.raw } } } } });
  if ((c = sinDatos('c-tipos', !D.porTipo.some((t) => t.y)))) new Chart(c, { type: 'doughnut',
    data: { labels: D.porTipo.map((t) => t.label), datasets: [{ data: D.porTipo.map((t) => t.y), backgroundColor: D.porTipo.map((t) => t.color), borderWidth: 2, borderColor: '#fff' }] },
    options: { ...base, cutout: '58%', plugins: leyenda('bottom') } });
  if ((c = sinDatos('c-retencion', !D.asistenciaEventos.length))) new Chart(c, { type: 'bar',
    data: { labels: D.asistenciaEventos.map((e) => e.corto), datasets: [
      { label: 'Nuevos', data: D.asistenciaEventos.map((e) => e.nuevos), backgroundColor: '#8BC53F' },
      { label: 'Recurrentes', data: D.asistenciaEventos.map((e) => e.recurrentes), backgroundColor: '#2E4BC6' } ] },
    options: { ...base, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { ...leyenda('bottom'), tooltip: { callbacks: { title: (t) => D.asistenciaEventos[t[0].dataIndex].titulo } } } } });
}
</script></body></html>`;
}
