// Estado de cuenta de MIND: movimientos manuales (efectivo/Revolut) desde
// cuentas/movimientos.csv en el repo (historial auditable en git) + ventas de
// Stripe consultadas EN VIVO con la API (cache 10 min, comisiones reales).
import fs from "node:fs";
import path from "node:path";
import type Stripe from "stripe";

export interface Mov {
  fecha: string;
  evento: string;
  metodo: string;
  concepto: string;
  monto: number;      // MXN, bruto
  comision: number;   // MXN
  detalle: string;
}

export function leerCSV(): Mov[] {
  const p = path.resolve(__dirname, "../../cuentas/movimientos.csv");
  if (!fs.existsSync(p)) return [];
  const lineas = fs.readFileSync(p, "utf8").trim().split(/\r?\n/).slice(1);
  return lineas.filter(Boolean).map((l) => {
    const [fecha, evento, metodo, concepto, monto, detalle] = l.split(",");
    return { fecha, evento, metodo, concepto, monto: Number(monto), comision: 0,
             detalle: detalle ?? "" };
  });
}

// La cuenta de Stripe puede tener cargos anteriores a la tienda (p. ej. uno del
// 8-jul-2026) que NO son ventas de MIND: solo contamos desde el lanzamiento.
const DESDE_TIENDA = "2026-08-24";

let cacheStripe: { t: number; movs: Mov[] } | null = null;

export async function movsStripe(stripe: Stripe | null): Promise<{ movs: Mov[]; ok: boolean }> {
  if (!stripe) return { movs: [], ok: false };
  if (cacheStripe && Date.now() - cacheStripe.t < 10 * 60 * 1000) {
    return { movs: cacheStripe.movs, ok: true };
  }
  try {
    const cargos = await stripe.charges.list({ limit: 100, expand: ["data.balance_transaction"] });
    const movs: Mov[] = cargos.data
      .filter((c) => c.status === "succeeded" && c.amount > 0)
      .map((c) => {
        const bt = c.balance_transaction as Stripe.BalanceTransaction | null;
        const fecha = new Date(c.created * 1000).toISOString().slice(0, 10);
        const evento = fecha >= "2026-08-24" && fecha <= "2026-08-28" ? "REDSPOT" : "online";
        const quien = c.billing_details?.name ?? c.billing_details?.email ?? "";
        const last4 = c.payment_method_details?.card?.last4;
        return {
          fecha, evento, metodo: "stripe",
          concepto: "Venta con tarjeta",
          monto: c.amount / 100,
          comision: bt && typeof bt === "object" ? bt.fee / 100 : 0,
          detalle: [quien, last4 ? "•" + last4 : ""].filter(Boolean).join(" · "),
        };
      })
      .filter((m) => m.fecha >= DESDE_TIENDA);
    cacheStripe = { t: Date.now(), movs };
    return { movs, ok: true };
  } catch (err) {
    console.error("stripe cuentas error", err);
    return { movs: [], ok: false };
  }
}

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderCuentas(movs: Mov[], stripeOk: boolean): string {
  const orden = [...movs].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const suma = (f: (m: Mov) => boolean) =>
    movs.filter(f).reduce((s, m) => s + m.monto - m.comision, 0);
  const efectivo = suma((m) => m.metodo === "efectivo");
  const revolut = suma((m) => m.metodo === "revolut" || m.metodo === "spei");
  const stripeNeto = suma((m) => m.metodo === "stripe");
  const total = efectivo + revolut + stripeNeto;
  const eventos = [...new Set(movs.map((m) => m.evento))].filter((e) => e !== "inicial");
  const porEvento = eventos.map((e) =>
    `<tr><td>${e}</td><td class="num">${fmt(movs.filter((m) => m.evento === e)
      .reduce((s, m) => s + m.monto, 0))}</td></tr>`).join("");
  const filas = orden.map((m) =>
    `<tr><td>${m.fecha}</td><td><span class="met met-${m.metodo}">${m.metodo}</span></td>` +
    `<td>${m.concepto}<div class="det">${m.detalle}</div></td>` +
    `<td class="num">${fmt(m.monto)}</td>` +
    `<td class="num">${m.comision ? "−" + fmt(m.comision) : "—"}</td></tr>`).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cuentas MIND</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&display=swap">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#F7F5EC; color:#1C2260; font-family:'Poppins','Segoe UI',system-ui,sans-serif; }
header { background:linear-gradient(140deg,#29A3C7,#2E4BC6 60%,#232D93); color:#fff; padding:30px 22px; }
header h1 { font-size:24px; font-weight:800; }
header p { font-size:12.5px; color:#CFE4F5; }
main { max-width:760px; margin:0 auto; padding:20px 18px 60px; }
.saldos { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:16px 0; }
.saldo { background:#fff; border:1px solid #E4E1D2; border-radius:14px; padding:14px 16px; }
.saldo small { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#6A6F98; }
.saldo b { display:block; font-size:20px; font-weight:800; margin-top:2px; font-variant-numeric:tabular-nums; }
.saldo.total { background:#1C2260; color:#F5EFD8; border-color:#1C2260; }
.saldo.total small { color:#B9C4E8; }
h2 { font-size:16px; font-weight:800; margin:24px 0 8px; }
table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E4E1D2; border-radius:14px; overflow:hidden; font-size:13.5px; }
th, td { padding:9px 12px; text-align:left; border-bottom:1px solid #EFEDE0; vertical-align:top; }
th { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#6A6F98; }
tr:last-child td { border-bottom:none; }
.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.det { font-size:11px; color:#8A8FB5; }
.met { font-size:11px; font-weight:600; border-radius:999px; padding:2px 9px; white-space:nowrap; }
.met-efectivo { background:#E8F3D9; color:#4C7A15; }
.met-revolut, .met-spei { background:#DDF1F8; color:#156F8F; }
.met-stripe { background:#E4E4F9; color:#4740B3; }
.aviso { background:#FDF3D7; border:1px solid #EAD9A0; border-radius:10px; padding:10px 14px; font-size:12.5px; margin:12px 0; }
footer { font-size:11.5px; color:#8A8FB5; margin-top:26px; }
.tabla-scroll { overflow-x:auto; }
</style></head><body>
<header><h1>Cuentas MIND</h1><p>Estado de cuenta del grupo · Stripe en vivo · efectivo y Revolut auditados en git</p></header>
<main>
${stripeOk ? "" : '<div class="aviso">⚠ No se pudo consultar Stripe ahora mismo — se muestran solo efectivo y Revolut.</div>'}
<div class="saldos">
  <div class="saldo"><small>Efectivo</small><b>${fmt(efectivo)}</b></div>
  <div class="saldo"><small>Revolut / SPEI</small><b>${fmt(revolut)}</b></div>
  <div class="saldo"><small>Stripe (neto)</small><b>${fmt(stripeNeto)}</b></div>
  <div class="saldo total"><small>Total MIND</small><b>${fmt(total)}</b></div>
</div>
<h2>Recaudado por evento (bruto)</h2>
<div class="tabla-scroll"><table><tr><th>Evento</th><th class="num">Total</th></tr>${porEvento}</table></div>
<h2>Movimientos</h2>
<div class="tabla-scroll"><table>
<tr><th>Fecha</th><th>Método</th><th>Concepto</th><th class="num">Monto</th><th class="num">Comisión</th></tr>
${filas}
</table></div>
<footer>Actualizado al cargar la página · Stripe con caché de 10 min · descarga CSV: agrega <b>/cuentas.csv</b> con la misma clave.</footer>
</main></body></html>`;
}

export function renderCSV(movs: Mov[]): string {
  const enc = (s: string) => (s.includes(",") ? `"${s}"` : s);
  return ["fecha,evento,metodo,concepto,monto_mxn,comision_mxn,detalle",
    ...movs.map((m) => [m.fecha, m.evento, m.metodo, enc(m.concepto),
      m.monto.toFixed(2), m.comision.toFixed(2), enc(m.detalle)].join(","))].join("\n");
}
