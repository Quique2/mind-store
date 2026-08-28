// API de la tienda MIND: catálogo + Stripe Checkout, y en producción sirve
// también el build web de Expo (dist único en Railway, patrón continental).
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import { z } from "zod";
import { PRODUCTS, byId } from "./products";
import { leerCSV, movsStripe, renderCuentas, renderCSV } from "./cuentas";

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
async function cuentasHandler(req: express.Request, res: express.Response, csv: boolean) {
  const clave = process.env.CUENTAS_CLAVE;
  if (!clave || req.query.clave !== clave) {
    return res.status(401).send("Acceso restringido. Agrega ?clave=... al enlace.");
  }
  const manuales = leerCSV();
  const st = await movsStripe(stripe);
  const movs = [...manuales, ...st.movs];
  if (csv) {
    res.type("text/csv").send(renderCSV(movs));
  } else {
    res.type("html").send(renderCuentas(movs, st.ok));
  }
}
app.get("/cuentas", (req, res) => { void cuentasHandler(req, res, false); });
app.get("/cuentas.csv", (req, res) => { void cuentasHandler(req, res, true); });

// build web de Expo (app/dist) en producción
const dist = path.resolve(__dirname, "../../app/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`mind-store api en :${port}`));
