// Estado de cuenta de MIND: ingresos y gastos.
// - cuentas/movimientos.csv (git): historial auditable (carga inicial, cierres).
// - /data/movimientos.csv (disco persistente): lo capturado desde la página.
// - Stripe EN VIVO (caché 10 min): cada cobro es un ingreso y su comisión un gasto.
//   Evento y concepto de cada cobro se editan desde la página y se guardan en
//   cuentas/stripe_conceptos.json (git, semilla) + /data/stripe_conceptos.json (disco).
import fs from "node:fs";
import path from "node:path";
import type Stripe from "stripe";
import type { Product } from "./products";
import { NAV_CSS, navAdmin } from "./ui";

export type TipoMov = "ingreso" | "gasto";
export interface Mov {
  fecha: string;
  evento: string;
  metodo: string;      // efectivo | revolut | spei | stripe
  concepto: string;
  monto: number;       // MXN, siempre positivo: el signo lo da `tipo`
  tipo: TipoMov;
  detalle: string;
  ref?: string;        // editable: "disco:<línea>" o "stripe:<cargo>"; sin ref = viene de git
}
export const signo = (m: Mov) => (m.tipo === "gasto" ? -m.monto : m.monto);
/** Capital / saldo inicial: cuenta en el saldo pero NO es venta (no entra a "ventas por producto"). */
export const EVENTO_INICIAL = "inicial";

const DIR_DATOS = process.env.DATA_DIR ?? "/data";
const ARCHIVO_NUEVOS = path.join(DIR_DATOS, "movimientos.csv");
const ARCHIVO_META_STRIPE = path.join(DIR_DATOS, "stripe_conceptos.json");
const GIT_CSV = path.resolve(__dirname, "../../cuentas/movimientos.csv");
const GIT_META_STRIPE = path.resolve(__dirname, "../../cuentas/stripe_conceptos.json");
const CABECERA = "fecha,evento,metodo,concepto,monto_mxn,detalle,tipo";

// ---- CSV con comillas (los conceptos pueden llevar comas) ----
function partirLinea(l: string): string[] {
  const out: string[] = [];
  let cur = "";
  let enComillas = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (enComillas) {
      if (ch === '"') {
        if (l[i + 1] === '"') { cur += '"'; i++; } else enComillas = false;
      } else cur += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const campo = (s: string) => (/[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const aLinea = (m: Omit<Mov, "ref">) =>
  [m.fecha, campo(m.evento), m.metodo, campo(m.concepto), m.monto.toFixed(2), campo(m.detalle), m.tipo].join(",");

function deLinea(l: string): Omit<Mov, "ref"> {
  const [fecha, evento, metodo, concepto, monto, detalle, tipo] = partirLinea(l);
  return { fecha, evento, metodo, concepto, monto: Number(monto),
           tipo: tipo === "gasto" ? "gasto" : "ingreso", detalle: detalle ?? "" };
}
function parseCSV(texto: string, origen: "git" | "disco"): Mov[] {
  return texto.trim().split(/\r?\n/).slice(1).map((l, i) => ({ l, i }))
    .filter(({ l }) => l.trim())
    .map(({ l, i }) => ({ ...deLinea(l), ...(origen === "disco" ? { ref: `disco:${i}` } : {}) }));
}
function leerLineasDisco(): string[] {
  if (!fs.existsSync(ARCHIVO_NUEVOS)) return [];
  return fs.readFileSync(ARCHIVO_NUEVOS, "utf8").trim().split(/\r?\n/).slice(1).filter((l) => l.trim());
}
function escribirDisco(cuerpo: string[]): void {
  fs.mkdirSync(DIR_DATOS, { recursive: true });
  fs.writeFileSync(ARCHIVO_NUEVOS, [CABECERA, ...cuerpo].join("\n") + "\n");
}

export function leerCSV(): Mov[] {
  const movs: Mov[] = [];
  if (fs.existsSync(GIT_CSV)) movs.push(...parseCSV(fs.readFileSync(GIT_CSV, "utf8"), "git"));
  if (fs.existsSync(ARCHIVO_NUEVOS)) movs.push(...parseCSV(fs.readFileSync(ARCHIVO_NUEVOS, "utf8"), "disco"));
  return movs;
}

export function hayDiscoPersistente(): boolean {
  try {
    fs.mkdirSync(DIR_DATOS, { recursive: true });
    fs.accessSync(DIR_DATOS, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const limpiar = (s: string) => s.replace(/[\r\n]/g, " ").trim().slice(0, 80);

export function agregarMov(m: Omit<Mov, "ref">): void {
  const cuerpo = leerLineasDisco();
  cuerpo.push(aLinea({ ...m, evento: limpiar(m.evento) || "ventas", concepto: limpiar(m.concepto),
                       detalle: limpiar(m.detalle) }));
  escribirDisco(cuerpo);
}

/** Borra por índice un movimiento capturado en la página. Devuelve su concepto. */
export function borrarMov(idx: number): string | null {
  const cuerpo = leerLineasDisco();
  if (idx < 0 || idx >= cuerpo.length) return null;
  const [quitada] = cuerpo.splice(idx, 1);
  escribirDisco(cuerpo);
  return deLinea(quitada).concepto || "movimiento";
}

/** Cambia evento y concepto de un movimiento capturado en la página. */
export function editarMov(idx: number, cambios: { evento: string; concepto: string }): Omit<Mov, "ref"> | null {
  const cuerpo = leerLineasDisco();
  if (idx < 0 || idx >= cuerpo.length) return null;
  const m = { ...deLinea(cuerpo[idx]), evento: limpiar(cambios.evento) || "ventas", concepto: limpiar(cambios.concepto) };
  cuerpo[idx] = aLinea(m);
  escribirDisco(cuerpo);
  return m;
}

// ---- Stripe ----
interface CargoStripe { id: string; fecha: string; monto: number; comision: number; quien: string; last4: string }
type MetaStripe = Record<string, { evento?: string; concepto?: string }>;

function leerJSON(f: string): MetaStripe {
  try { return JSON.parse(fs.readFileSync(f, "utf8")) as MetaStripe; } catch { return {}; }
}
export const leerMetaStripe = (): MetaStripe => ({ ...leerJSON(GIT_META_STRIPE), ...leerJSON(ARCHIVO_META_STRIPE) });

export function guardarMetaStripe(id: string, meta: { evento: string; concepto: string }): void {
  fs.mkdirSync(DIR_DATOS, { recursive: true });
  const actual = leerJSON(ARCHIVO_META_STRIPE);
  actual[id] = { evento: limpiar(meta.evento), concepto: limpiar(meta.concepto) };
  fs.writeFileSync(ARCHIVO_META_STRIPE + ".tmp", JSON.stringify(actual, null, 1));
  fs.renameSync(ARCHIVO_META_STRIPE + ".tmp", ARCHIVO_META_STRIPE);
}

// La cuenta de Stripe puede tener cargos anteriores a la tienda que NO son ventas
// de MIND: solo contamos desde el lanzamiento.
const DESDE_TIENDA = "2026-08-24";
let cacheStripe: { t: number; cargos: CargoStripe[] } | null = null;

export async function movsStripe(stripe: Stripe | null): Promise<{ movs: Mov[]; ok: boolean }> {
  if (!stripe) return { movs: [], ok: false };
  let cargos: CargoStripe[];
  if (cacheStripe && Date.now() - cacheStripe.t < 10 * 60 * 1000) {
    cargos = cacheStripe.cargos;
  } else {
    try {
      const r = await stripe.charges.list({ limit: 100, expand: ["data.balance_transaction"] });
      cargos = r.data
        .filter((c) => c.status === "succeeded" && c.amount > 0)
        .map((c) => {
          const bt = c.balance_transaction as Stripe.BalanceTransaction | null;
          return {
            id: c.id,
            fecha: new Date(c.created * 1000).toISOString().slice(0, 10),
            monto: c.amount / 100,
            comision: bt && typeof bt === "object" ? bt.fee / 100 : 0,
            quien: (c.billing_details?.name ?? c.billing_details?.email ?? "").trim(),
            last4: c.payment_method_details?.card?.last4 ?? "",
          };
        })
        .filter((c) => c.fecha >= DESDE_TIENDA);
      cacheStripe = { t: Date.now(), cargos };
    } catch (err) {
      console.error("stripe cuentas error", err);
      return { movs: [], ok: false };
    }
  }
  // evento/concepto editados se aplican al vuelo (sin esperar a que caduque la caché)
  const meta = leerMetaStripe();
  const movs: Mov[] = [];
  for (const c of cargos) {
    const m = meta[c.id] ?? {};
    const evento = m.evento || (c.fecha >= "2026-08-24" && c.fecha <= "2026-08-28" ? "REDSPOT" : "online");
    const detalle = [c.quien, c.last4 ? "•" + c.last4 : ""].filter(Boolean).join(" · ");
    movs.push({ fecha: c.fecha, evento, metodo: "stripe", concepto: m.concepto || "Venta con tarjeta",
                monto: c.monto, tipo: "ingreso", detalle, ref: `stripe:${c.id}` });
    if (c.comision > 0) {
      movs.push({ fecha: c.fecha, evento, metodo: "stripe", concepto: "Comisión Stripe", monto: c.comision,
                  tipo: "gasto", detalle: `sobre $${c.monto.toFixed(2)} · ${detalle}` });
    }
  }
  return { movs, ok: true };
}

// ---- página ----
const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// todo lo que venga del formulario, del CSV o de Stripe se escapa antes de insertarse en el HTML
const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const GASTOS_RAPIDOS = ["Filamento", "Insumos / material", "Comida", "Transporte", "Impresión externa", "Publicidad"];

export function renderCuentas(movs: Mov[], stripeOk: boolean, clave: string, aviso: string | undefined,
                              productos: Product[], eventosRegistrados: string[]): string {
  const q = `?clave=${encodeURIComponent(clave)}`;
  const orden = [...movs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const suma = (f: (m: Mov) => boolean) => movs.filter(f).reduce((s, m) => s + signo(m), 0);
  const efectivo = suma((m) => m.metodo === "efectivo");
  const revolut = suma((m) => m.metodo === "revolut" || m.metodo === "spei");
  const stripeNeto = suma((m) => m.metodo === "stripe");
  const total = efectivo + revolut + stripeNeto;
  const bruto = (f: (m: Mov) => boolean) => movs.filter(f).reduce((s, m) => s + m.monto, 0);
  const ingresos = bruto((m) => m.tipo === "ingreso" && m.evento !== EVENTO_INICIAL);
  const gastos = bruto((m) => m.tipo === "gasto");
  const capital = bruto((m) => m.tipo === "ingreso" && m.evento === EVENTO_INICIAL);

  // eventos para el desplegable: los registrados en /eventos + los ya usados + "ventas"
  const nombresEv = [...new Set([...eventosRegistrados,
    ...movs.map((m) => m.evento).filter((e) => e && e !== EVENTO_INICIAL), "ventas"])];
  const opcionesEv = (actual: string) =>
    nombresEv.map((e) => `<option value="${esc(e)}"${e === actual ? " selected" : ""}>${esc(e)}</option>`).join("") +
    `<option value="${EVENTO_INICIAL}"${actual === EVENTO_INICIAL ? " selected" : ""}>Saldo inicial / capital (no es venta)</option>` +
    `<option value="__otro">Otro…</option>`;

  const eventos = [...new Set(movs.map((m) => m.evento))].filter((e) => e !== EVENTO_INICIAL);
  const porEvento = eventos.map((e) => {
    const ing = bruto((m) => m.evento === e && m.tipo === "ingreso");
    const gas = bruto((m) => m.evento === e && m.tipo === "gasto");
    return `<tr><td>${esc(e)}</td><td class="num">${fmt(ing)}</td><td class="num">${gas ? "−" + fmt(gas) : "—"}</td><td class="num"><b>${fmt(ing - gas)}</b></td></tr>`;
  }).join("");

  const clase = (m: Mov) => (["efectivo", "revolut", "spei", "stripe"].includes(m.metodo) ? m.metodo : "otro");
  const filas = orden.map((m, n) => {
    const disco = m.ref?.startsWith("disco:") ? m.ref.slice(6) : null;
    const acciones = (m.ref ? `<button class="mini" type="button" onclick="editar(${n})" title="Cambiar evento o concepto">Editar</button>` : "") +
      (disco !== null ? `<form method="post" action="/cuentas/borrar${q}" onsubmit="return confirm('¿Borrar este movimiento?')"><input type="hidden" name="idx" value="${esc(disco)}"><button class="del" title="Borrar movimiento">✕</button></form>` : "");
    const edicion = m.ref ? `<tr class="edicion" id="ed-${n}" hidden><td colspan="6">
<form method="post" action="/cuentas/editar${q}" class="editar">
  <input type="hidden" name="ref" value="${esc(m.ref)}">
  <div><label>Evento</label><select name="evento" onchange="otro(this)">${opcionesEv(m.evento)}</select><input name="eventoOtro" placeholder="Nombre del evento" maxlength="60" hidden></div>
  <div><label>Concepto</label><input name="concepto" value="${esc(m.concepto)}" required maxlength="80"></div>
  <div><label>&nbsp;</label><button class="btn-ok" type="submit">Guardar</button></div>
</form></td></tr>` : "";
    return `<tr class="${m.tipo}"><td>${esc(m.fecha)}</td>` +
      `<td><span class="met met-${clase(m)}">${esc(m.metodo)}</span>${m.tipo === "gasto" ? ' <span class="gasto-b">gasto</span>' : ""}</td>` +
      `<td>${esc(m.concepto)}<div class="det">${esc(m.evento)}${m.detalle ? " · " + esc(m.detalle) : ""}</div></td>` +
      `<td class="num${m.tipo === "gasto" ? " rojo" : ""}">${m.tipo === "gasto" ? "−" : ""}${fmt(m.monto)}</td>` +
      `<td class="acc">${acciones}</td></tr>${edicion}`;
  }).join("");

  const rapidos = productos.filter((p) => p.disponible !== false).map((p) =>
    `<button type="button" data-p="${esc(p.nombre)}" data-m="${p.precioCentavos / 100}">${esc(p.nombre)} $${p.precioCentavos / 100}</button>`).join("\n    ");
  const rapidosGasto = GASTOS_RAPIDOS.map((g) => `<button type="button" data-p="${esc(g)}" data-m="">${esc(g)}</button>`).join("\n    ");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cuentas MIND</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#F7F5EC; color:#1C2260; font-family:'Poppins','Segoe UI',system-ui,sans-serif; }
header { background:linear-gradient(140deg,#29A3C7,#2E4BC6 60%,#232D93); color:#fff; padding:30px 22px; }
header h1 { font-size:24px; font-weight:800; }
header p { font-size:12.5px; color:#CFE4F5; }
main { max-width:820px; margin:0 auto; padding:20px 18px 60px; }
.saldos { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:16px 0 8px; }
.saldo { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:14px 16px; }
.saldo small { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#6A6F98; }
.saldo b { display:block; font-size:20px; font-weight:800; margin-top:2px; font-variant-numeric:tabular-nums; }
.saldo.total { background:#1C2260; color:#F5EFD8; border-color:#1C2260; }
.saldo.total small { color:#B9C4E8; }
.resumen { font-size:12.5px; color:#6A6F98; margin-bottom:8px; }
.resumen b { color:#1C2260; }
h2 { font-size:16px; font-weight:800; margin:24px 0 8px; }
table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E4E1D2; border-radius:14px; overflow:hidden; font-size:13.5px; }
th, td { padding:9px 12px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:top; }
th { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; }
tr:last-child td { border-bottom:none; }
.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.rojo { color:#A03434; }
.det { font-size:11px; color:#8A8FB5; }
.met { font-size:11px; font-weight:600; border-radius:999px; padding:2px 9px; white-space:nowrap; }
.met-efectivo { background:#E8F3D9; color:#4C7A15; }
.met-revolut, .met-spei { background:#DDF1F8; color:#156F8F; }
.met-stripe { background:#E4E4F9; color:#4740B3; }
.gasto-b { font-size:10.5px; font-weight:700; border-radius:999px; padding:2px 8px; background:#FBECEC; color:#A03434; white-space:nowrap; }
tr.gasto td:first-child { border-left:3px solid #EF6C4C; }
.aviso { background:#FDF3D7; border:1px solid #EAD9A0; border-radius:10px; padding:10px 14px; font-size:12.5px; margin:12px 0; }
.ok-aviso { background:#E8F3D9; border:1px solid #BEDD97; border-radius:10px; padding:10px 14px; font-size:13px; margin:12px 0; color:#3F6B10; font-weight:600; }
form.nuevo { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:16px; display:grid; gap:12px; }
.fila { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; }
label { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; display:block; margin-bottom:3px; }
input, select { width:100%; font:inherit; font-size:15px; padding:10px 12px; border:1.5px solid #DDD9C6; border-radius:10px; background:#FCFBF5; color:#1C2260; min-height:44px; }
input:focus, select:focus { outline:2px solid #2E4BC6; outline-offset:1px; border-color:#2E4BC6; }
form.nuevo button[type=submit] { font:inherit; font-weight:800; font-size:15px; color:#fff; background:#2E4BC6; border:none; border-radius:999px; padding:14px; min-height:48px; cursor:pointer; }
form.nuevo button[type=submit]:hover { background:#232D93; }
form.nuevo.gasto button[type=submit] { background:#A03434; }
.seg { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.seg input { position:absolute; opacity:0; width:0; height:0; min-height:0; }
.seg label { text-transform:none; letter-spacing:0; font-size:14px; font-weight:700; color:#1C2260; background:#FCFBF5; border:1.5px solid #DDD9C6; border-radius:10px; padding:10px 8px; min-height:44px; margin:0; display:flex; align-items:center; justify-content:center; cursor:pointer; }
.seg input:checked + label { background:#1C2260; color:#fff; border-color:#1C2260; }
.seg input#t-out:checked + label { background:#A03434; border-color:#A03434; }
.rapidos { display:flex; flex-wrap:wrap; gap:8px; }
.rapidos button { font:inherit; font-size:13px; font-weight:600; background:#EFEDDF; color:#1C2260; border:1.5px solid #DDD9C6; border-radius:999px; padding:9px 14px; min-height:40px; cursor:pointer; }
.rapidos button:hover { background:#E2DFCB; }
footer { font-size:11.5px; color:#8A8FB5; margin-top:26px; }
.tabla-scroll { overflow-x:auto; }
td.acc { padding:6px 8px; white-space:nowrap; width:1%; }
td.acc form { display:inline; }
button.del { font:inherit; font-size:13px; line-height:1; color:#A03434; background:#FBECEC; border:1px solid #F0CFCF; border-radius:8px; width:30px; height:30px; cursor:pointer; vertical-align:middle; }
button.del:hover { background:#F5D9D9; }
button.mini { font:inherit; font-size:11.5px; font-weight:600; color:#1C2260; background:#EFEDDF; border:1.5px solid #DDD9C6; border-radius:999px; padding:5px 10px; min-height:30px; cursor:pointer; margin-right:4px; vertical-align:middle; }
button.mini:hover { background:#E2DFCB; }
tr.edicion td { background:#F4FBFD; }
form.editar { display:grid; grid-template-columns:1.2fr 1.6fr auto; gap:10px; align-items:end; }
@media (max-width:640px) { form.editar { grid-template-columns:1fr; } }
form.editar input, form.editar select { min-height:40px; font-size:14px; padding:8px 10px; }
form.editar input[name=eventoOtro] { margin-top:6px; }
.btn-ok { font:inherit; font-weight:800; font-size:13px; color:#fff; background:#2E4BC6; border:none; border-radius:999px; padding:10px 16px; min-height:40px; cursor:pointer; }
${NAV_CSS}</style></head><body>
<header>${navAdmin(clave, "cuentas")}<h1>Cuentas MIND</h1><p>Ingresos y gastos del grupo · Stripe en vivo · efectivo y Revolut auditados</p></header>
<main>
${aviso ? `<div class="ok-aviso">${esc(aviso)}</div>` : ""}
${stripeOk ? "" : '<div class="aviso">⚠ No se pudo consultar Stripe ahora mismo — se muestran solo efectivo y Revolut.</div>'}
<div class="saldos">
  <div class="saldo"><small>Efectivo</small><b>${fmt(efectivo)}</b></div>
  <div class="saldo"><small>Revolut / SPEI</small><b>${fmt(revolut)}</b></div>
  <div class="saldo"><small>Stripe (neto)</small><b>${fmt(stripeNeto)}</b></div>
  <div class="saldo total"><small>Total MIND</small><b>${fmt(total)}</b></div>
</div>
<p class="resumen">Ventas <b>${fmt(ingresos)}</b> · gastos <b class="rojo">−${fmt(gastos)}</b>${capital ? ` · capital inicial <b>${fmt(capital)}</b>` : ""}</p>

<h2>Registrar ingreso o gasto</h2>
<form class="nuevo" id="nuevo" method="post" action="/cuentas/nuevo${q}">
  <div class="seg">
    <input type="radio" id="t-in" name="tipo" value="ingreso" checked><label for="t-in">💰 Ingreso (venta)</label>
    <input type="radio" id="t-out" name="tipo" value="gasto"><label for="t-out">🧾 Gasto</label>
  </div>
  <div class="rapidos" id="rap-in">
    ${rapidos}
  </div>
  <div class="rapidos" id="rap-out" hidden>
    ${rapidosGasto}
  </div>
  <div class="fila">
    <div><label for="metodo">Método</label>
      <select id="metodo" name="metodo" required>
        <option value="efectivo">Efectivo</option>
        <option value="revolut">Revolut / SPEI</option>
      </select></div>
    <div><label for="monto">Monto (MXN)</label>
      <input id="monto" name="monto" type="number" step="0.01" min="0.01" inputmode="decimal" required placeholder="50.00"></div>
  </div>
  <div><label for="concepto">Concepto</label>
    <input id="concepto" name="concepto" required placeholder="Fidget Omega MIND" maxlength="80"></div>
  <div class="fila">
    <div><label for="detalle" id="l-detalle">¿De quién? (opcional)</label>
      <input id="detalle" name="detalle" placeholder="Nombre del comprador" maxlength="80"></div>
    <div><label for="evento">Evento</label>
      <select id="evento" name="evento" onchange="otro(this)">${opcionesEv("ventas")}</select>
      <input name="eventoOtro" placeholder="Nombre del evento" maxlength="60" hidden style="margin-top:6px"></div>
  </div>
  <div class="fila">
    <div><label for="fecha">Fecha</label>
      <input id="fecha" name="fecha" type="date" required></div>
  </div>
  <button type="submit" id="enviar">Agregar ingreso</button>
</form>
<script>
  document.getElementById('fecha').value = new Date().toLocaleDateString('sv-SE');
  for (const b of document.querySelectorAll('.rapidos button')) {
    b.addEventListener('click', () => {
      document.getElementById('concepto').value = b.dataset.p;
      if (b.dataset.m) document.getElementById('monto').value = b.dataset.m;
    });
  }
  function tipoCambio() {
    const gasto = document.getElementById('t-out').checked;
    document.getElementById('rap-in').hidden = gasto;
    document.getElementById('rap-out').hidden = !gasto;
    document.getElementById('nuevo').classList.toggle('gasto', gasto);
    document.getElementById('enviar').textContent = gasto ? 'Registrar gasto' : 'Agregar ingreso';
    document.getElementById('concepto').placeholder = gasto ? 'p. ej. Filamento PLA 1 kg' : 'Fidget Omega MIND';
    document.getElementById('l-detalle').textContent = gasto ? '¿A quién se pagó? (opcional)' : '¿De quién? (opcional)';
    document.getElementById('detalle').placeholder = gasto ? 'Tienda o persona' : 'Nombre del comprador';
  }
  for (const r of document.querySelectorAll('input[name=tipo]')) r.addEventListener('change', tipoCambio);
  function otro(sel) {
    const inp = sel.parentElement.querySelector('input[name=eventoOtro]');
    inp.hidden = sel.value !== '__otro'; inp.required = !inp.hidden;
    if (!inp.hidden) inp.focus();
  }
  function editar(n) {
    const fila = document.getElementById('ed-' + n);
    fila.hidden = !fila.hidden;
  }
</script>

<h2>Por evento</h2>
<div class="tabla-scroll"><table><tr><th>Evento</th><th class="num">Ingresos</th><th class="num">Gastos</th><th class="num">Neto</th></tr>${porEvento || '<tr><td colspan="4" class="det">Sin movimientos.</td></tr>'}</table></div>
<h2>Movimientos</h2>
<div class="tabla-scroll"><table>
<tr><th>Fecha</th><th>Método</th><th>Concepto · evento</th><th class="num">Monto</th><th></th></tr>
${filas}
</table></div>
<footer>Actualizado al cargar la página · Stripe con caché de 10 min · «Editar» cambia evento y concepto de cobros con tarjeta y de lo capturado aquí · descarga CSV: agrega <b>/cuentas.csv</b> con la misma clave.</footer>
</main></body></html>`;
}

export function renderCSV(movs: Mov[]): string {
  return ["fecha,evento,metodo,concepto,monto_mxn,tipo,detalle,ref",
    ...movs.map((m) => [m.fecha, campo(m.evento), m.metodo, campo(m.concepto), m.monto.toFixed(2),
                        m.tipo, campo(m.detalle), m.ref ?? ""].join(","))].join("\n");
}
