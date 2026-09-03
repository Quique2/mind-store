// API de la tienda MIND: catálogo + Stripe Checkout, y en producción sirve
// también el build web de Expo (dist único en Railway, patrón continental).
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import { z } from "zod";
import { catalogo, catalogoPublico, byId, guardarProducto, borrarProducto, restaurarCatalogo,
         hayCatalogoEditado } from "./products";
import { renderPanel } from "./admin";
import { leerCSV, movsStripe, renderCuentas, renderCSV, agregarMov, borrarMov, editarMov,
         guardarMetaStripe, hayDiscoPersistente } from "./cuentas";
import QRCode from "qrcode";
import { leerEventos, leerAsistencias, crearEvento, alternarEvento, buscarEvento, registrar,
         normMatricula, esTipo, renderAdmin, renderFormulario, renderResultado, renderQR,
         renderCSV as renderAsistenciaCSV, borrarEvento, renderConfirmarBorrado, esStaff,
         quitarAsistencia, cambiarStaff, listaPersonas, type TipoId } from "./eventos";

const app = express();
app.use(cors());
app.use(express.json());

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.get("/api/products", (_req, res) => res.json(catalogoPublico()));

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
    res.type("html").send(renderCuentas(movs, st.ok, String(req.query.clave), aviso, catalogo(),
                                        nombresEventos()));
  }
}
// títulos de los eventos registrados (más reciente primero) para el desplegable de Cuentas
const nombresEventos = () =>
  [...leerEventos()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((e) => e.titulo);
// "Otro…" en el desplegable manda __otro + el nombre escrito
const eventoElegido = (evento: string, otro: string) =>
  (evento === "__otro" ? otro.trim() : evento.trim()) || "ventas";
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
  evento: z.string().max(60).optional().default("ventas"),
  eventoOtro: z.string().max(60).optional().default(""),
  tipo: z.enum(["ingreso", "gasto"]).optional().default("ingreso"),
});

app.post("/cuentas/nuevo", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const parsed = MovSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Datos inválidos. Regresa y revisa el formulario.");
  if (!hayDiscoPersistente()) {
    return res.status(503).send("No hay disco persistente configurado; el movimiento no se guardó.");
  }
  const m = parsed.data;
  agregarMov({ fecha: m.fecha, evento: eventoElegido(m.evento, m.eventoOtro), metodo: m.metodo,
               concepto: m.concepto, monto: m.monto, detalle: m.detalle, tipo: m.tipo });
  const ok = `✓ ${m.tipo === "gasto" ? "Gasto registrado" : "Registrado"}: ${m.concepto} · ${m.tipo === "gasto" ? "−" : ""}$${m.monto.toFixed(2)} (${m.metodo})`;
  res.redirect(`/cuentas?clave=${encodeURIComponent(String(req.query.clave))}&ok=${encodeURIComponent(ok)}`);
});

// cambiar evento / concepto de un cobro con tarjeta (Stripe) o de un movimiento capturado aquí
const EditSchema = z.object({
  ref: z.string().min(7).max(80),
  evento: z.string().max(60),
  eventoOtro: z.string().max(60).optional().default(""),
  concepto: z.string().trim().min(1).max(80),
});
app.post("/cuentas/editar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const parsed = EditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Datos inválidos. Regresa y revisa el formulario.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente; el cambio no se guardó.");
  const e = parsed.data;
  const evento = eventoElegido(e.evento, e.eventoOtro);
  let msg = "No se encontró ese movimiento.";
  if (e.ref.startsWith("stripe:") && /^(ch|py)_[A-Za-z0-9]+$/.test(e.ref.slice(7))) {
    guardarMetaStripe(e.ref.slice(7), { evento, concepto: e.concepto });
    msg = `✓ Cobro con tarjeta actualizado: ${e.concepto} · ${evento}`;
  } else if (e.ref.startsWith("disco:")) {
    const r = editarMov(Number(e.ref.slice(6)), { evento, concepto: e.concepto });
    if (r) msg = `✓ Actualizado: ${r.concepto} · ${r.evento}`;
  }
  res.redirect(`/cuentas?clave=${encodeURIComponent(String(req.query.clave))}&ok=${encodeURIComponent(msg)}`);
});

app.post("/cuentas/borrar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const idx = Number((req.body as { idx?: string }).idx);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).send("Índice inválido.");
  const concepto = borrarMov(idx);
  const msg = concepto ? `✓ Borrado: ${concepto}` : "No se encontró ese movimiento.";
  res.redirect(`/cuentas?clave=${encodeURIComponent(String(req.query.clave))}&ok=${encodeURIComponent(msg)}`);
});

// ---------------- Panel ejecutivo + catálogo editable ----------------
app.get("/admin", async (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido. Agrega ?clave=... al enlace.");
  const st = await movsStripe(stripe);
  res.type("html").send(renderPanel({
    movs: [...leerCSV(), ...st.movs], stripeOk: st.ok,
    eventos: leerEventos(), asistencias: leerAsistencias(),
    productos: catalogo(), editado: hayCatalogoEditado(),
    clave: String(req.query.clave),
    aviso: req.query.ok ? String(req.query.ok).slice(0, 200) : undefined,
  }));
});
const volverAdmin = (req: express.Request, aviso: string) =>
  `/admin?clave=${encodeURIComponent(String(req.query.clave))}&ok=${encodeURIComponent(aviso)}#productos`;

const ProductoSchema = z.object({
  id: z.string().max(40).optional().default(""),
  nombre: z.string().trim().min(2).max(60),
  descripcion: z.string().trim().max(160).optional().default(""),
  precio: z.coerce.number().min(1).max(100000),
  emoji: z.string().trim().max(8).optional().default(""),
  orden: z.coerce.number().int().min(0).max(999).optional().default(0),
  disponible: z.string().optional(),            // checkbox: "on" o ausente
});
app.post("/admin/productos/guardar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const parsed = ProductoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Datos inválidos. Regresa y revisa el formulario.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente; el catálogo no se guardó.");
  const p = parsed.data;
  const { producto, nuevo } = guardarProducto({
    id: p.id || undefined, nombre: p.nombre, descripcion: p.descripcion,
    precioCentavos: Math.round(p.precio * 100), emoji: p.emoji || undefined,
    orden: p.orden, disponible: p.disponible === "on",
  });
  res.redirect(volverAdmin(req, `✓ ${nuevo ? "Agregado" : "Guardado"}: ${producto.nombre} · ${(producto.precioCentavos / 100).toFixed(2)}${producto.disponible === false ? " (oculto)" : ""}`));
});
app.post("/admin/productos/borrar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente; el catálogo no se guardó.");
  const quitado = borrarProducto(String((req.body as { id?: string }).id ?? ""));
  res.redirect(volverAdmin(req, quitado ? `✓ Quitado de la tienda: ${quitado.nombre}` : "No se encontró ese producto."));
});
app.post("/admin/productos/restaurar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  restaurarCatalogo();
  res.redirect(volverAdmin(req, "✓ Catálogo original restaurado."));
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
  const { evento: ev, repetido } = crearEvento(parsed.data.tipo as TipoId, parsed.data.titulo, parsed.data.fecha);
  const enlace = `${urlBase(req)}/asistencia/${ev.id}`;
  res.redirect(volverEventos(req, repetido
    ? `Ese evento ya se había creado hace un momento, no se duplicó: ${ev.titulo} → ${enlace}`
    : `✓ Evento creado: ${ev.titulo} → ${enlace}`));
});

// borrar: primero la pantalla de confirmación (GET), luego el borrado real (POST con confirmar=si)
app.get("/eventos/borrar", (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const id = String(req.query.id ?? "");
  const ev = idOk(id) ? buscarEvento(id) : undefined;
  if (!ev) return res.redirect(volverEventos(req, "No se encontró ese evento."));
  const suyas = leerAsistencias().filter((a) => a.evento === id);
  res.type("html").send(renderConfirmarBorrado(ev, suyas.length, suyas.filter(esStaff).length,
                                               String(req.query.clave)));
});
app.post("/eventos/borrar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const b = req.body as { id?: string; confirmar?: string };
  const id = String(b.id ?? "");
  if (b.confirmar !== "si") {
    return res.redirect(`/eventos/borrar?clave=${encodeURIComponent(String(req.query.clave))}&id=${encodeURIComponent(id)}`);
  }
  const r = idOk(id) ? borrarEvento(id) : null;
  res.redirect(volverEventos(req, r
    ? `✓ Borrado: ${r.evento.titulo} (${r.asistencias} registro${r.asistencias === 1 ? "" : "s"} de asistencia)`
    : "No se encontró ese evento."));
});

app.post("/eventos/alternar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const id = String((req.body as { id?: string }).id ?? "");
  const ev = idOk(id) ? alternarEvento(id) : null;
  res.redirect(volverEventos(req, ev
    ? `✓ ${ev.titulo}: registro ${ev.abierto ? "reabierto" : "cerrado"}`
    : "No se encontró ese evento."));
});

// acciones del panel sobre asistencias (con clave). Van ANTES de /asistencia/:id
// para que "staff", "quitar" y "manual" no se interpreten como ids de evento.
app.post("/asistencia/staff", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const b = req.body as { matricula?: string; staff?: string };
  const hacer = b.staff === "si";
  const r = cambiarStaff(String(b.matricula ?? ""), hacer);
  res.redirect(volverEventos(req, r
    ? `✓ ${r.nombre} ahora ${hacer ? "es staff" : "cuenta como asistente"} (${r.n} registro${r.n === 1 ? "" : "s"})`
    : "No se encontró esa matrícula."));
});
app.post("/asistencia/quitar", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const b = req.body as { evento?: string; matricula?: string };
  const evId = String(b.evento ?? "");
  const r = idOk(evId) ? quitarAsistencia(evId, String(b.matricula ?? "")) : null;
  res.redirect(volverEventos(req, r
    ? `✓ Se quitó la asistencia de ${r.nombre} a ${buscarEvento(evId)?.titulo ?? "ese evento"}`
    : "No se encontró ese registro."));
});
const ManualSchema = z.object({
  evento: z.string().min(4).max(12),
  matriculas: z.union([z.string(), z.array(z.string())]).optional(),
  nombre: z.string().trim().max(80).optional().default(""),
  matricula: z.string().trim().max(14).optional().default(""),
  otroStaff: z.string().optional(),
});
app.post("/asistencia/manual", express.urlencoded({ extended: false }), (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  const parsed = ManualSchema.safeParse(req.body);
  const ev = parsed.success && idOk(parsed.data.evento) ? buscarEvento(parsed.data.evento) : undefined;
  if (!parsed.success || !ev) return res.redirect(volverEventos(req, "No se encontró ese evento."));
  const d = parsed.data;
  const conocidas = new Map(listaPersonas(leerAsistencias()).map((p) => [p.matricula, p.nombre]));
  const lote: { nombre: string; matricula: string; staff: boolean }[] = [];
  const mats = d.matriculas === undefined ? [] : Array.isArray(d.matriculas) ? d.matriculas : [d.matriculas];
  for (const m of mats) {
    const nombre = conocidas.get(normMatricula(m));
    if (nombre) lote.push({ nombre, matricula: m, staff: true });
  }
  if (d.nombre.length >= 3 && normMatricula(d.matricula).length >= 4) {
    lote.push({ nombre: d.nombre, matricula: d.matricula, staff: d.otroStaff === "on" });
  }
  if (!lote.length) return res.redirect(volverEventos(req, "Palomea a alguien del staff o escribe nombre y matrícula."));
  let ok = 0, dup = 0;
  for (const p of lote) {
    const r = registrar(ev.id, p.nombre, p.matricula, p.staff, true);
    if (r === "ok") ok++; else if (r === "duplicado") dup++;
  }
  res.redirect(volverEventos(req, `✓ ${ok} asistencia${ok === 1 ? "" : "s"} registrada${ok === 1 ? "" : "s"} en ${ev.titulo}` +
    (dup ? ` · ${dup} ya estaba${dup === 1 ? "" : "n"}` : "")));
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
  staff: z.enum(["si", "no"]).optional().default("no"),
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
  const staff = parsed.data.staff === "si";
  const r = registrar(ev.id, parsed.data.nombre, parsed.data.matricula, staff);
  if (r === "no-existe") return res.status(404).send("Ese evento no existe.");
  res.type("html").send(renderResultado(ev, r, parsed.data.nombre, staff));
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
