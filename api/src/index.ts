// API de la tienda MIND: catálogo + Stripe Checkout, y en producción sirve
// también el build web de Expo (dist único en Railway, patrón continental).
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import { z } from "zod";
import { PRODUCTS, byId } from "./products";
import { leerCSV, movsStripe, renderCuentas, renderCSV, agregarMov, borrarMov,
         hayDiscoPersistente } from "./cuentas";
import QRCode from "qrcode";
import { leerEventos, leerAsistencias, crearEvento, alternarEvento, buscarEvento, registrar,
         normMatricula, esTipo, renderAdmin, renderFormulario, renderResultado, renderQR,
         renderCSV as renderAsistenciaCSV, type TipoId } from "./eventos";

const app = express();
app.use(cors());
app.use(express.json());

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.get("/api/products", (_req, res) => res.json(PRODUCTS));

// Datos para transferencia SPEI directa (sin intermediarios). La CLABE es dato
// público de cobro (solo permite depositar); las env vars la pueden sustituir.
const CLABE_MIND = "646990404076302792";
app.get("/api/config", (_req, res) =>
  res.json({
    spei: {
      clabe: process.env.SPEI_CLABE ?? CLABE_MIND,
      banco: process.env.SPEI_BANCO ?? "",
      titular: process.env.SPEI_TITULAR ?? "MIND",
    },
    tarjeta: Boolean(stripeKey),
  }),
);

const CartSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        cantidad: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(10),
});

app.post("/api/checkout", async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: "Pagos con tarjeta aún no configurados. Aparta tu pedido por WhatsApp.",
    });
  }
  const parsed = CartSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Carrito inválido" });
  }
  const lineItems = [];
  for (const item of parsed.data.items) {
    const p = byId(item.id);
    if (!p) return res.status(400).json({ error: `Producto desconocido: ${item.id}` });
    lineItems.push({
      price_data: {
        currency: "mxn",
        product_data: { name: p.nombre, description: p.descripcion },
        unit_amount: p.precioCentavos,
      },
      quantity: item.cantidad,
    });
  }
  const origin = process.env.PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${origin}/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancelado`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error("stripe checkout error", err);
    return res.status(502).json({ error: "No se pudo iniciar el pago. Intenta de nuevo." });
  }
});

// Estado de cuenta del grupo, protegido con clave simple (CUENTAS_CLAVE)
const claveOk = (req: express.Request) => {
  const clave = process.env.CUENTAS_CLAVE;
  return Boolean(clave) && req.query.clave === clave;
};

async function cuentasHandler(req: express.Request, res: express.Response,
                              csv: boolean, aviso?: string) {
  if (!claveOk(req)) {
    return res.status(401).send("Acceso restringido. Agrega ?clave=... al enlace.");
  }
  const manuales = leerCSV();
  const st = await movsStripe(stripe);
  const movs = [...manuales, ...st.movs];
  if (csv) {
    res.type("text/csv").send(renderCSV(movs));
  } else {
    res.type("html").send(renderCuentas(movs, st.ok, String(req.query.clave), aviso));
  }
}
app.get("/cuentas", (req, res) => {
  const ok = req.query.ok ? String(req.query.ok).slice(0, 120) : undefined;
  void cuentasHandler(req, res, false, ok);
});
app.get("/cuentas.csv", (req, res) => { void cuentasHandler(req, res, true); });

const MovSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metodo: z.enum(["efectivo", "revolut"]),
  concepto: z.string().min(1).max(80),
  monto: z.coerce.number().positive().max(100000),
  detalle: z.string().max(80).optional().default(""),
  evento: z.string().max(40).optional().default("ventas"),
});

app.post("/cuentas/nuevo", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const parsed = MovSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Datos inválidos. Regresa y revisa el formulario.");
  if (!hayDiscoPersistente()) {
    return res.status(503).send("No hay disco persistente configurado; el movimiento no se guardó.");
  }
  const m = parsed.data;
  agregarMov({ fecha: m.fecha, evento: m.evento, metodo: m.metodo,
               concepto: m.concepto, monto: m.monto, detalle: m.detalle });
  const ok = `✓ Registrado: ${m.concepto} · $${m.monto.toFixed(2)} (${m.metodo})`;
  res.redirect(`/cuentas?clave=${encodeURIComponent(String(req.query.clave))}&ok=${encodeURIComponent(ok)}`);
});

app.post("/cuentas/borrar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const idx = Number((req.body as { idx?: string }).idx);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).send("Índice inválido.");
  const concepto = borrarMov(idx);
  const msg = concepto ? `✓ Borrado: ${concepto}` : "No se encontró ese movimiento.";
  res.redirect(`/cuentas?clave=${encodeURIComponent(String(req.query.clave))}&ok=${encodeURIComponent(msg)}`);
});

// ---------------- Asistencia a eventos (happy midweek, stand, neurart, neurocharla) ----------------
const urlBase = (req: express.Request) =>
  process.env.PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
const volverEventos = (req: express.Request, aviso: string) =>
  `/eventos?clave=${encodeURIComponent(String(req.query.clave))}&ok=${encodeURIComponent(aviso)}`;
const idOk = (id: string) => /^[a-z0-9_-]{4,12}$/i.test(id);

app.get("/eventos", (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido. Agrega ?clave=... al enlace.");
  const ok = req.query.ok ? String(req.query.ok).slice(0, 200) : undefined;
  res.type("html").send(renderAdmin(leerEventos(), leerAsistencias(), String(req.query.clave),
                                    urlBase(req), ok));
});

app.get("/eventos.csv", (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  res.type("text/csv").attachment("asistencia-mind.csv")
     .send(renderAsistenciaCSV(leerEventos(), leerAsistencias()));
});

const EventoSchema = z.object({
  tipo: z.string().refine(esTipo, "tipo desconocido"),
  titulo: z.string().max(80).optional().default(""),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
app.post("/eventos/nuevo", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const parsed = EventoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Datos inválidos. Regresa y revisa el formulario.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente; el evento no se guardó.");
  const ev = crearEvento(parsed.data.tipo as TipoId, parsed.data.titulo, parsed.data.fecha);
  res.redirect(volverEventos(req, `✓ Evento creado: ${ev.titulo} → ${urlBase(req)}/asistencia/${ev.id}`));
});

app.post("/eventos/alternar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const id = String((req.body as { id?: string }).id ?? "");
  const ev = idOk(id) ? alternarEvento(id) : null;
  res.redirect(volverEventos(req, ev
    ? `✓ ${ev.titulo}: registro ${ev.abierto ? "reabierto" : "cerrado"}`
    : "No se encontró ese evento."));
});

// formulario público (sin clave): nombre + matrícula
app.get("/asistencia/:id", (req, res) => {
  const ev = idOk(req.params.id) ? buscarEvento(req.params.id) : undefined;
  if (!ev) return res.status(404).send("Ese evento no existe.");
  res.type("html").send(renderFormulario(ev));
});

const AsisSchema = z.object({
  nombre: z.string().trim().min(3).max(80),
  matricula: z.string().trim().min(4).max(14),
  sitio: z.string().max(0).optional().default(""),   // honeypot: los bots lo llenan
});
app.post("/asistencia/:id", express.urlencoded({ extended: false }), (req, res) => {
  const ev = idOk(req.params.id) ? buscarEvento(req.params.id) : undefined;
  if (!ev) return res.status(404).send("Ese evento no existe.");
  const parsed = AsisSchema.safeParse(req.body);
  if (!parsed.success || normMatricula(parsed.data.matricula).length < 4) {
    return res.status(400).type("html")
      .send(renderFormulario(ev, "Revisa tu nombre y matrícula (p. ej. A01234567)."));
  }
  const r = registrar(ev.id, parsed.data.nombre, parsed.data.matricula);
  if (r === "no-existe") return res.status(404).send("Ese evento no existe.");
  res.type("html").send(renderResultado(ev, r, parsed.data.nombre));
});

app.get("/asistencia/:id/qr", async (req, res) => {
  const ev = idOk(req.params.id) ? buscarEvento(req.params.id) : undefined;
  if (!ev) return res.status(404).send("Ese evento no existe.");
  const url = `${urlBase(req)}/asistencia/${ev.id}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 1,
                                           color: { dark: "#1C2260", light: "#ffffff" } });
  res.type("html").send(renderQR(ev, svg, url));
});

// build web de Expo (app/dist) en producción
const dist = path.resolve(__dirname, "../../app/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`mind-store api en :${port}`));
