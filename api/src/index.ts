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
         quitarAsistencia, cambiarStaff, listaPersonas, esJunta, leerPreregistros, preregistrar,
         quitarPrereg, alternarPrereg, renderPreregistro, renderResultadoPre, renderCSVPre,
         nombreTipo, TIPOS, type TipoId } from "./eventos";
import multer from "multer";
import { leerStaff, guardarStaff, leerAreas, guardarAreas, buscarPersona, normMat, generarPin,
         ponerPin, pinCorrecto, crearSesion, leerSesion, cookieSesion, cookieBorrar, staffActivo,
         esPresidencia, dirigeArea, puedeAsignar, ROLES, type Persona, type RolId } from "./staff";
import { leerTareas, guardarTareas, crearTarea, conId, actualizar, borrarTarea, posponer, cerrarSemana,
         esAbierta, enSemana, tocaA, atrasada, semanaActual, lunesDe, hoyISO, sumarDias, DIR_EVIDENCIA,
         archivoSeguro, nuevoId as nuevoIdTarea, type Tarea, type EstadoTarea } from "./tareas";
import { renderEntrar, renderElegirPin, renderYo, renderTablero, renderTableroLista, renderLamina,
         renderCerrarSemana, renderEquipo } from "./portal";
import { conClave } from "./ui";
import { slug } from "./products";
import { notionActivo, espejar, espejarPronto, importarDeNotion, EXT_EVIDENCIA } from "./notion";
import { leerGaleria, agregarItem, borrarItem, infoEnlace, nuevoId, nombreSeguro, renderGaleria,
         DIR_GALERIA, EXT, LIMITE_MB } from "./galeria";

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
/** Nivel presidencia por sesión del portal (para navegar sin la clave). */
function sesionPresidencia(req: express.Request): Persona | null {
  const p = sesion(req);
  return p && !p.provisional && esPresidencia(p) ? p : null;
}
/** Acceso a la administración: con la clave, o con sesión del portal de nivel presidencia. */
const acceso = (req: express.Request) => claveOk(req) || Boolean(sesionPresidencia(req));
const claveDe = (req: express.Request) => (claveOk(req) ? String(req.query.clave) : "");

async function cuentasHandler(req: express.Request, res: express.Response,
                              csv: boolean, aviso?: string) {
  if (!acceso(req)) {
    return res.status(401).send("Acceso restringido. Agrega ?clave=... al enlace.");
  }
  const manuales = leerCSV();
  const st = await movsStripe(stripe);
  const movs = [...manuales, ...st.movs];
  if (csv) {
    res.type("text/csv").send(renderCSV(movs));
  } else {
    res.type("html").send(renderCuentas(movs, st.ok, claveDe(req), aviso, catalogo(),
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
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const parsed = MovSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Datos inválidos. Regresa y revisa el formulario.");
  if (!hayDiscoPersistente()) {
    return res.status(503).send("No hay disco persistente configurado; el movimiento no se guardó.");
  }
  const m = parsed.data;
  agregarMov({ fecha: m.fecha, evento: eventoElegido(m.evento, m.eventoOtro), metodo: m.metodo,
               concepto: m.concepto, monto: m.monto, detalle: m.detalle, tipo: m.tipo });
  const ok = `✓ ${m.tipo === "gasto" ? "Gasto registrado" : "Registrado"}: ${m.concepto} · ${m.tipo === "gasto" ? "−" : ""}$${m.monto.toFixed(2)} (${m.metodo})`;
  res.redirect(`/cuentas${conClave(claveDe(req))}&ok=${encodeURIComponent(ok)}`);
});

// cambiar evento / concepto de un cobro con tarjeta (Stripe) o de un movimiento capturado aquí
const EditSchema = z.object({
  ref: z.string().min(7).max(80),
  evento: z.string().max(60),
  eventoOtro: z.string().max(60).optional().default(""),
  concepto: z.string().trim().min(1).max(80),
});
app.post("/cuentas/editar", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
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
  res.redirect(`/cuentas${conClave(claveDe(req))}&ok=${encodeURIComponent(msg)}`);
});

app.post("/cuentas/borrar", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const idx = Number((req.body as { idx?: string }).idx);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).send("Índice inválido.");
  const concepto = borrarMov(idx);
  const msg = concepto ? `✓ Borrado: ${concepto}` : "No se encontró ese movimiento.";
  res.redirect(`/cuentas${conClave(claveDe(req))}&ok=${encodeURIComponent(msg)}`);
});

// ---------------- Panel ejecutivo + catálogo editable ----------------
app.get("/admin", async (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido. Agrega ?clave=... al enlace.");
  const st = await movsStripe(stripe);
  res.type("html").send(renderPanel({
    movs: [...leerCSV(), ...st.movs], stripeOk: st.ok,
    eventos: leerEventos(), asistencias: leerAsistencias(), preregistros: leerPreregistros(),
    productos: catalogo(), editado: hayCatalogoEditado(),
    clave: claveDe(req),
    aviso: req.query.ok ? String(req.query.ok).slice(0, 200) : undefined,
  }));
});
const volverAdmin = (req: express.Request, aviso: string) =>
  `/admin${conClave(claveDe(req))}&ok=${encodeURIComponent(aviso)}#productos`;

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
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
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
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente; el catálogo no se guardó.");
  const quitado = borrarProducto(String((req.body as { id?: string }).id ?? ""));
  res.redirect(volverAdmin(req, quitado ? `✓ Quitado de la tienda: ${quitado.nombre}` : "No se encontró ese producto."));
});
app.post("/admin/productos/restaurar", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  restaurarCatalogo();
  res.redirect(volverAdmin(req, "✓ Catálogo original restaurado."));
});

// ---------------- Asistencia a eventos (happy midweek, stand, neurart, neurocharla) ----------------
const urlBase = (req: express.Request) =>
  process.env.PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
// las acciones lanzadas desde la pestaña Juntas traen &volver=juntas y regresan ahí
const volverEventos = (req: express.Request, aviso: string) =>
  `/${req.query.volver === "juntas" ? "juntas" : "eventos"}${conClave(claveDe(req))}&ok=${encodeURIComponent(aviso)}`;
const idOk = (id: string) => /^[a-z0-9_-]{4,12}$/i.test(id);

app.get("/eventos", (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido. Agrega ?clave=... al enlace.");
  const ok = req.query.ok ? String(req.query.ok).slice(0, 200) : undefined;
  res.type("html").send(renderAdmin(leerEventos(), leerAsistencias(), leerPreregistros(),
                                    claveDe(req), urlBase(req), ok, "eventos"));
});
app.get("/juntas", (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido. Agrega ?clave=... al enlace.");
  const ok = req.query.ok ? String(req.query.ok).slice(0, 200) : undefined;
  res.type("html").send(renderAdmin(leerEventos(), leerAsistencias(), leerPreregistros(),
                                    claveDe(req), urlBase(req), ok, "juntas"));
});

app.get("/eventos.csv", (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const soloJuntas = req.query.solo === "juntas";
  const evs = leerEventos().filter((e) => esJunta(e) === soloJuntas);
  const ids = new Set(evs.map((e) => e.id));
  res.type("text/csv").attachment(soloJuntas ? "juntas-mind.csv" : "asistencia-mind.csv")
     .send(renderAsistenciaCSV(evs, leerAsistencias().filter((a) => ids.has(a.evento))));
});

// ---------------- Galería: ver es público; subir y borrar requieren clave ----------------
app.use("/galeria/archivo", (req, res, next) => {
  if (!nombreSeguro(req.path.slice(1))) return res.status(404).end();
  next();
}, express.static(DIR_GALERIA, { maxAge: "30d", immutable: true, index: false }));

app.get("/galeria", (req, res) => {
  const clave = acceso(req) ? claveDe(req) : null;
  const filtro = String(req.query.evento ?? "");
  const ok = clave && req.query.ok ? String(req.query.ok).slice(0, 200) : undefined;
  res.type("html").send(renderGaleria(leerGaleria(), leerEventos(), clave,
                                      filtro === "sin" || idOk(filtro) ? filtro : "", urlBase(req), ok));
});

const subida = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdirSync(DIR_GALERIA, { recursive: true }); cb(null, DIR_GALERIA); },
    filename: (req, file, cb) => {
      const id = (req as express.Request & { galeriaId: string }).galeriaId;
      cb(null, file.fieldname === "miniatura" ? `${id}_t.jpg` : `${id}.${EXT[file.mimetype]}`);
    },
  }),
  limits: { fileSize: LIMITE_MB * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ok = file.fieldname === "miniatura" ? file.mimetype === "image/jpeg" : Boolean(EXT[file.mimetype]);
    if (ok) cb(null, true); else cb(new Error(`tipo no permitido: ${file.mimetype}`));
  },
});
app.post("/galeria/subir",
  (req, res, next) => {
    if (!acceso(req)) return res.status(401).json({ ok: false, error: "clave incorrecta" });
    (req as express.Request & { galeriaId: string }).galeriaId = nuevoId();
    next();
  },
  (req, res, next) => subida.fields([{ name: "archivo", maxCount: 1 }, { name: "miniatura", maxCount: 1 }])(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "no se pudo subir" });
    next();
  }),
  (req, res) => {
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const archivo = files.archivo?.[0];
    if (!archivo) return res.status(400).json({ ok: false, error: "falta el archivo" });
    const b = req.body as { evento?: string; titulo?: string };
    const evento = b.evento && idOk(b.evento) && buscarEvento(b.evento) ? b.evento : "";
    const id = (req as express.Request & { galeriaId: string }).galeriaId;
    agregarItem({ id, tipo: archivo.mimetype.startsWith("video/") ? "video" : "foto", evento,
                  titulo: String(b.titulo ?? "").trim().slice(0, 80), archivo: archivo.filename,
                  miniatura: files.miniatura?.[0]?.filename, mime: archivo.mimetype, bytes: archivo.size,
                  creado: new Date().toISOString() });
    res.json({ ok: true, id });
  });

const EnlaceSchema = z.object({
  url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "http(s)"),
  titulo: z.string().trim().max(80).optional().default(""),
  evento: z.string().max(12).optional().default(""),
});
const volverGaleria = (req: express.Request, aviso: string, evento = "") =>
  `/galeria${conClave(claveDe(req))}${evento ? `&evento=${encodeURIComponent(evento)}` : ""}&ok=${encodeURIComponent(aviso)}`;
app.post("/galeria/enlace", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const parsed = EnlaceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Enlace inválido. Regresa y revisa el formulario.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente; no se guardó.");
  const d = parsed.data;
  const evento = d.evento && idOk(d.evento) && buscarEvento(d.evento) ? d.evento : "";
  const info = infoEnlace(d.url);
  agregarItem({ id: nuevoId(), tipo: "enlace", evento, titulo: d.titulo || info.proveedor, url: d.url,
                embed: info.embed, miniatura: info.miniatura, creado: new Date().toISOString() });
  res.redirect(volverGaleria(req, `✓ Enlace agregado (${info.proveedor})`, evento));
});
app.post("/galeria/borrar", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const id = String((req.body as { id?: string }).id ?? "");
  const item = /^[a-z0-9]{6,20}$/.test(id) ? borrarItem(id) : null;
  res.redirect(volverGaleria(req, item ? "✓ Elemento borrado de la galería" : "No se encontró ese elemento.", item?.evento));
});

const EventoSchema = z.object({
  tipo: z.string().refine(esTipo, "tipo desconocido"),
  titulo: z.string().max(80).optional().default(""),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipoNombre: z.string().max(40).optional().default(""),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")).default(""),
  lugar: z.string().max(80).optional().default(""),
  nota: z.string().max(80).optional().default(""),
  prereg: z.string().optional(),      // checkbox: "on" o ausente
});
app.post("/eventos/nuevo", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const parsed = EventoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Datos inválidos. Regresa y revisa el formulario.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente; el evento no se guardó.");
  const d = parsed.data;
  const { evento: ev, repetido } = crearEvento({
    tipo: d.tipo as TipoId, titulo: d.titulo, fecha: d.fecha, tipoNombre: d.tipoNombre,
    hora: d.hora, lugar: d.lugar, nota: d.nota, prereg: d.prereg === "on",
  });
  const enlace = `${urlBase(req)}/${ev.prereg ? "preregistro" : "asistencia"}/${ev.id}`;
  res.redirect(volverEventos(req, repetido
    ? `Ese evento ya se había creado hace un momento, no se duplicó: ${ev.titulo} → ${enlace}`
    : `✓ ${esJunta(ev) ? "Junta creada" : "Evento creado"}: ${ev.titulo} → ${ev.prereg ? "prerregistro: " : ""}${enlace}`));
});

// abrir / cerrar el prerregistro de un evento
app.post("/eventos/prereg", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const id = String((req.body as { id?: string }).id ?? "");
  const ev = idOk(id) ? alternarPrereg(id) : null;
  res.redirect(volverEventos(req, ev
    ? (ev.prereg ? `✓ Prerregistro abierto: ${urlBase(req)}/preregistro/${ev.id}` : `✓ ${ev.titulo}: prerregistro cerrado`)
    : "No se encontró ese evento."));
});

// borrar: primero la pantalla de confirmación (GET), luego el borrado real (POST con confirmar=si)
app.get("/eventos/borrar", (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const id = String(req.query.id ?? "");
  const ev = idOk(id) ? buscarEvento(id) : undefined;
  if (!ev) return res.redirect(volverEventos(req, "No se encontró ese evento."));
  const suyas = leerAsistencias().filter((a) => a.evento === id);
  const suyosPre = leerPreregistros().filter((p) => p.evento === id);
  res.type("html").send(renderConfirmarBorrado(ev, suyas.length, suyas.filter(esStaff).length,
                                               suyosPre.length, claveDe(req)));
});
app.post("/eventos/borrar", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const b = req.body as { id?: string; confirmar?: string };
  const id = String(b.id ?? "");
  if (b.confirmar !== "si") {
    return res.redirect(`/eventos/borrar${conClave(claveDe(req))}&id=${encodeURIComponent(id)}`);
  }
  const r = idOk(id) ? borrarEvento(id) : null;
  res.redirect(volverEventos(req, r
    ? `✓ Borrado: ${r.evento.titulo} (${r.asistencias} registro${r.asistencias === 1 ? "" : "s"} de asistencia${r.prereg ? ` y ${r.prereg} prerregistro${r.prereg === 1 ? "" : "s"}` : ""})`
    : "No se encontró ese evento."));
});

app.post("/eventos/alternar", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const id = String((req.body as { id?: string }).id ?? "");
  const ev = idOk(id) ? alternarEvento(id) : null;
  res.redirect(volverEventos(req, ev
    ? `✓ ${ev.titulo}: registro ${ev.abierto ? "reabierto" : "cerrado"}`
    : "No se encontró ese evento."));
});

// acciones del panel sobre asistencias (con clave). Van ANTES de /asistencia/:id
// para que "staff", "quitar" y "manual" no se interpreten como ids de evento.
app.post("/asistencia/staff", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const b = req.body as { matricula?: string; staff?: string };
  const hacer = b.staff === "si";
  const r = cambiarStaff(String(b.matricula ?? ""), hacer);
  res.redirect(volverEventos(req, r
    ? `✓ ${r.nombre} ahora ${hacer ? "es staff" : "cuenta como asistente"} (${r.n} registro${r.n === 1 ? "" : "s"})`
    : "No se encontró esa matrícula."));
});
app.post("/asistencia/quitar", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
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
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const parsed = ManualSchema.safeParse(req.body);
  const ev = parsed.success && idOk(parsed.data.evento) ? buscarEvento(parsed.data.evento) : undefined;
  if (!parsed.success || !ev) return res.redirect(volverEventos(req, "No se encontró ese evento."));
  const d = parsed.data;
  // se aceptan las matrículas conocidas (staff e historial) y las prerregistradas a ESTE evento
  const conocidas = new Map(listaPersonas(leerAsistencias())
    .map((p) => [p.matricula, { nombre: p.nombre, staff: p.staff }]));
  for (const s of staffActivo()) conocidas.set(s.matricula, { nombre: s.nombre, staff: true });
  for (const p of leerPreregistros().filter((x) => x.evento === ev.id)) {
    if (!conocidas.has(p.matricula)) conocidas.set(p.matricula, { nombre: p.nombre, staff: false });
  }
  const lote: { nombre: string; matricula: string; staff: boolean }[] = [];
  const mats = d.matriculas === undefined ? [] : Array.isArray(d.matriculas) ? d.matriculas : [d.matriculas];
  const vistas = new Set<string>();
  for (const m of mats) {
    const mat = normMatricula(m);
    if (vistas.has(mat)) continue;       // una persona puede venir del staff y del prerregistro
    vistas.add(mat);
    const c = conocidas.get(mat);
    if (c) lote.push({ nombre: c.nombre, matricula: mat, staff: c.staff });
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

// ---------------- Prerregistro (apartar lugar antes del evento) ----------------
// las acciones con clave van ANTES de /preregistro/:id para que no las tome por id
app.post("/preregistro/quitar", express.urlencoded({ extended: false }), (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const b = req.body as { evento?: string; matricula?: string };
  const evId = String(b.evento ?? "");
  const r = idOk(evId) ? quitarPrereg(evId, String(b.matricula ?? "")) : null;
  res.redirect(volverEventos(req, r
    ? `✓ Se quitó el prerregistro de ${r.nombre}`
    : "No se encontró ese prerregistro."));
});
app.get("/preregistros.csv", (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  res.type("text/csv").attachment("prerregistros-mind.csv")
     .send(renderCSVPre(leerEventos(), leerPreregistros(), leerAsistencias()));
});

app.get("/preregistro/:id", (req, res) => {
  const ev = idOk(req.params.id) ? buscarEvento(req.params.id) : undefined;
  if (!ev) return res.status(404).send("Ese evento no existe.");
  res.type("html").send(renderPreregistro(ev));
});
const PreSchema = z.object({
  nombre: z.string().trim().min(3).max(80),
  matricula: z.string().trim().min(4).max(14),
  correo: z.string().trim().max(80).optional().default(""),
  sitio: z.string().max(0).optional().default(""),   // honeypot: los bots lo llenan
});
app.post("/preregistro/:id", express.urlencoded({ extended: false }), (req, res) => {
  const ev = idOk(req.params.id) ? buscarEvento(req.params.id) : undefined;
  if (!ev) return res.status(404).send("Ese evento no existe.");
  const parsed = PreSchema.safeParse(req.body);
  if (!parsed.success || normMatricula(parsed.data.matricula).length < 4) {
    return res.status(400).type("html")
      .send(renderPreregistro(ev, "Revisa tu nombre y matrícula (p. ej. A01234567)."));
  }
  const r = preregistrar(ev.id, parsed.data.nombre, parsed.data.matricula, parsed.data.correo);
  if (r === "no-existe") return res.status(404).send("Ese evento no existe.");
  if (r === "cerrado") return res.type("html").send(renderPreregistro(ev));
  res.type("html").send(renderResultadoPre(ev, r, parsed.data.nombre));
});
app.get("/preregistro/:id/qr", async (req, res) => {
  const ev = idOk(req.params.id) ? buscarEvento(req.params.id) : undefined;
  if (!ev) return res.status(404).send("Ese evento no existe.");
  const url = `${urlBase(req)}/preregistro/${ev.id}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 1,
                                           color: { dark: "#1C2260", light: "#ffffff" } });
  res.type("html").send(renderQR(ev, svg, url, "prerregistro"));
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

// ---------------- Portal de tareas: cuentas con PIN, tablero y lámina ----------------
const urlencoded = express.urlencoded({ extended: false });
/** ¿La petición viene por https? En Railway lo dice el proxy. */
const conTLS = (req: express.Request) =>
  (req.headers["x-forwarded-proto"] ?? req.protocol) === "https";
/** Persona de la sesión, o null. */
function sesion(req: express.Request): Persona | null {
  const mat = leerSesion(req.headers.cookie);
  if (!mat) return null;
  const p = buscarPersona(mat);
  return p && p.activo ? p : null;
}
function exigeSesion(req: express.Request, res: express.Response): Persona | null {
  const p = sesion(req);
  if (!p) { res.redirect("/portal"); return null; }
  if (p.provisional) { res.type("html").send(renderElegirPin(p)); return null; }
  return p;
}
const volverPortal = (destino: string, aviso: string) =>
  `${destino}${destino.includes("?") ? "&" : "?"}ok=${encodeURIComponent(aviso)}`;
const avisoDe = (req: express.Request) =>
  req.query.ok ? String(req.query.ok).slice(0, 200) : undefined;
/** Eventos y juntas para el calendario y para amarrar tareas, del más reciente al más viejo. */
const eventosLite = () => leerEventos()
  .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  .map((e) => ({ id: e.id, titulo: e.titulo, fecha: e.fecha, tipo: e.tipo,
                 tipoNombre: nombreTipo(e), color: TIPOS[e.tipo].color, tinta: TIPOS[e.tipo].tinta,
                 emoji: TIPOS[e.tipo].emoji, junta: esJunta(e), hora: e.hora ?? "", lugar: e.lugar ?? "",
                 abierto: e.abierto, prereg: Boolean(e.prereg) }));

app.get("/portal", (req, res) => {
  const p = sesion(req);
  if (!p) return res.type("html").send(renderEntrar());
  if (p.provisional) return res.type("html").send(renderElegirPin(p));
  res.type("html").send(renderYo(p, leerTareas(), leerAreas(), leerStaff(), eventosLite(), avisoDe(req),
                                 String(req.query.mes ?? "")));
});

// Un PIN son cuatro dígitos: sin freno, alguien podría probarlos todos.
// Cinco fallos seguidos cierran esa matrícula durante quince minutos.
const fallos = new Map<string, { n: number; hasta: number }>();
const FRENO_MIN = 15, FRENO_TOPE = 5;
function frenado(mat: string): number {
  const f = fallos.get(mat);
  if (!f || f.hasta < Date.now()) return 0;
  return Math.ceil((f.hasta - Date.now()) / 60000);
}
function anotaFallo(mat: string): void {
  const f = fallos.get(mat) ?? { n: 0, hasta: 0 };
  f.n++;
  if (f.n >= FRENO_TOPE) { f.hasta = Date.now() + FRENO_MIN * 60000; f.n = 0; }
  fallos.set(mat, f);
}

app.post("/portal/entrar", urlencoded, (req, res) => {
  const b = req.body as { matricula?: string; pin?: string };
  const mat = normMat(String(b.matricula ?? ""));
  const pin = String(b.pin ?? "");
  const espera = frenado(mat);
  if (espera) {
    return res.status(429).type("html").send(renderEntrar(
      `Demasiados intentos. Vuelve a intentar en ${espera} minuto${espera === 1 ? "" : "s"}.`, mat));
  }
  const lista = leerStaff();
  const p = lista.find((x) => x.matricula === mat);
  if (!p || !p.activo || !p.pinHash) {
    anotaFallo(mat);
    return res.status(401).type("html").send(renderEntrar("No encontramos esa matrícula o todavía no tiene PIN. Pídeselo a Alexa.", mat));
  }
  if (!pinCorrecto(p, pin)) {
    anotaFallo(mat);
    return res.status(401).type("html").send(renderEntrar("PIN incorrecto. Inténtalo otra vez.", mat));
  }
  fallos.delete(mat);
  p.ultimoAcceso = new Date().toISOString();
  guardarStaff(lista);
  res.setHeader("Set-Cookie", cookieSesion(crearSesion(p.matricula), conTLS(req)));
  res.redirect("/portal");
});

app.get("/portal/salir", (req, res) => {
  res.setHeader("Set-Cookie", cookieBorrar(conTLS(req)));
  res.redirect("/portal");
});

// primera vez: cambiar el PIN provisional por uno propio
app.post("/portal/pin", urlencoded, (req, res) => {
  const p = sesion(req);
  if (!p) return res.redirect("/portal");
  const b = req.body as { pin?: string; pin2?: string };
  const pin = String(b.pin ?? "");
  if (!/^\d{4}$/.test(pin)) return res.type("html").send(renderElegirPin(p, "El PIN debe ser de cuatro dígitos."));
  if (pin !== String(b.pin2 ?? "")) return res.type("html").send(renderElegirPin(p, "Los dos PIN no coinciden."));
  const lista = leerStaff();
  const yo = lista.find((x) => x.matricula === p.matricula)!;
  ponerPin(yo, pin, false);
  guardarStaff(lista);
  res.redirect(volverPortal("/portal", "✓ Listo, tu PIN quedó guardado"));
});

app.post("/portal/pin-cambiar", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const b = req.body as { actual?: string; pin?: string };
  if (!pinCorrecto(p, String(b.actual ?? ""))) {
    return res.redirect(volverPortal("/portal", "Tu PIN actual no coincide, no se cambió nada."));
  }
  const pin = String(b.pin ?? "");
  if (!/^\d{4}$/.test(pin)) return res.redirect(volverPortal("/portal", "El PIN nuevo debe ser de cuatro dígitos."));
  const lista = leerStaff();
  const yo = lista.find((x) => x.matricula === p.matricula)!;
  ponerPin(yo, pin, false);
  guardarStaff(lista);
  res.redirect(volverPortal("/portal", "✓ Tu PIN quedó actualizado"));
});

// ---- tablero ----
app.get("/tareas", (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const areas = leerAreas();
  if (!puedeAsignar(p, areas)) return res.redirect("/portal");
  res.type("html").send(renderTablero(p, leerTareas(), areas, leerStaff(), eventosLite(), avisoDe(req)));
});
app.get("/tareas/lista", (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const areas = leerAreas();
  if (!puedeAsignar(p, areas)) return res.redirect("/portal");
  const area = String(req.query.area ?? "");
  res.type("html").send(renderTableroLista(p, leerTareas(), areas, leerStaff(), eventosLite(), avisoDe(req), area));
});

const listaDe = (v: unknown): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const TareaSchema = z.object({
  titulo: z.string().trim().min(3).max(120),
  detalle: z.string().trim().max(300).optional().default(""),
  area: z.string().max(40),
  vigencia: z.enum(["fechas", "transversal", "evento"]).optional().default("fechas"),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
  evento: z.string().max(12).optional().default(""),
});
function vigenciaDe(d: z.infer<typeof TareaSchema>): Tarea["vigencia"] {
  if (d.vigencia === "transversal") return { tipo: "transversal" };
  if (d.vigencia === "evento") return { tipo: "evento", evento: d.evento || undefined };
  return { tipo: "fechas", inicio: d.inicio || undefined, fin: d.fin || undefined };
}

app.post("/tareas/nueva", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const areas = leerAreas();
  const parsed = TareaSchema.safeParse(req.body);
  if (!parsed.success) return res.redirect(volverPortal("/tareas", "Revisa el título y el área."));
  const d = parsed.data;
  if (!dirigeArea(p, d.area, areas)) return res.redirect(volverPortal("/tareas", "No puedes crear tareas en esa área."));
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente; la tarea no se guardó.");
  const staff = leerStaff();
  const asignados = listaDe((req.body as Record<string, unknown>).asignados)
    .map((m) => normMat(m)).filter((m) => staff.some((s) => s.matricula === m));
  const t = crearTarea({ titulo: d.titulo, detalle: d.detalle, area: d.area, asignados,
                         vigencia: vigenciaDe(d), creadaPor: p.matricula });
  espejarPronto();
  res.redirect(volverPortal("/tareas", `✓ Creada: ${t.titulo}`));
});

app.post("/tareas/editar", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const b = req.body as { id?: string; volver?: string };
  const areas = leerAreas();
  const parsed = TareaSchema.safeParse(req.body);
  const actual = conId(String(b.id ?? ""));
  const destino = String(b.volver ?? "/tareas");
  if (!parsed.success || !actual) return res.redirect(volverPortal(destino, "No se pudo guardar el cambio."));
  if (!dirigeArea(p, actual.area, areas) || !dirigeArea(p, parsed.data.area, areas)) {
    return res.redirect(volverPortal(destino, "No puedes mover tareas a esa área."));
  }
  const staff = leerStaff();
  const asignados = listaDe((req.body as Record<string, unknown>).asignados)
    .map((m) => normMat(m)).filter((m) => staff.some((s) => s.matricula === m));
  const d = parsed.data;
  actualizar(actual.id, (t) => {
    t.titulo = d.titulo; t.detalle = d.detalle; t.area = d.area;
    t.vigencia = vigenciaDe(d); t.asignados = asignados;
  });
  espejarPronto();
  res.redirect(volverPortal(destino, `✓ Guardada: ${d.titulo}`));
});

app.post("/tareas/estado", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const b = req.body as { id?: string; estado?: string; volver?: string };
  const destino = String(b.volver ?? "/portal");
  const t = conId(String(b.id ?? ""));
  const nuevo = String(b.estado ?? "");
  if (!t || !["pendiente", "curso", "hecha", "vencida"].includes(nuevo)) {
    return res.redirect(volverPortal(destino, "No se encontró esa tarea."));
  }
  const areas = leerAreas();
  const puede = tocaA(t, p.matricula) || dirigeArea(p, t.area, areas);
  if (!puede) return res.redirect(volverPortal(destino, "Esa tarea no es tuya."));
  if (nuevo === "vencida" && !dirigeArea(p, t.area, areas)) {
    return res.redirect(volverPortal(destino, "Solo quien dirige el área puede dar por vencida una tarea."));
  }
  actualizar(t.id, (x) => {
    x.estado = nuevo as EstadoTarea;
    if (nuevo === "hecha") { x.hechaEl = new Date().toISOString(); x.hechaPor = p.matricula; }
    else { x.hechaEl = undefined; x.hechaPor = undefined; }
    if (nuevo === "vencida") x.cerradaEn = semanaActual();
    if (nuevo === "pendiente" || nuevo === "curso") x.cerradaEn = undefined;
  });
  espejarPronto();
  const dicho = nuevo === "hecha" ? "✓ ¡Hecha!" : nuevo === "vencida" ? "Marcada como vencida" : "Actualizada";
  res.redirect(volverPortal(destino, `${dicho}: ${t.titulo}`));
});

app.post("/tareas/posponer", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const b = req.body as { id?: string; volver?: string };
  const destino = String(b.volver ?? "/portal");
  const t = conId(String(b.id ?? ""));
  if (!t || (!tocaA(t, p.matricula) && !dirigeArea(p, t.area, leerAreas()))) {
    return res.redirect(volverPortal(destino, "No se encontró esa tarea."));
  }
  actualizar(t.id, posponer);
  espejarPronto();
  res.redirect(volverPortal(destino, `→ ${t.titulo} se movió a la próxima semana`));
});

app.post("/tareas/borrar", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const b = req.body as { id?: string; volver?: string };
  const destino = String(b.volver ?? "/tareas");
  const t = conId(String(b.id ?? ""));
  if (!t || !dirigeArea(p, t.area, leerAreas())) {
    return res.redirect(volverPortal(destino, "No puedes borrar esa tarea."));
  }
  borrarTarea(t.id);
  espejarPronto();
  res.redirect(volverPortal(destino, `Borrada: ${t.titulo}`));
});

// evidencia: archivo al disco o enlace
const subidaTarea = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdirSync(DIR_EVIDENCIA, { recursive: true }); cb(null, DIR_EVIDENCIA); },
    filename: (_req, file, cb) => cb(null, `${nuevoIdTarea()}.${EXT_EVIDENCIA[file.mimetype] ?? "bin"}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXT_EVIDENCIA[file.mimetype]) cb(null, true);
    else cb(new Error("tipo no permitido: " + file.mimetype));
  },
});
app.post("/tareas/evidencia",
  (req, res, next) => subidaTarea.single("archivo")(req, res, (err: unknown) => {
    if (err) return res.status(400).send(err instanceof Error ? err.message : "no se pudo subir");
    next();
  }),
  (req, res) => {
    const p = exigeSesion(req, res);
    if (!p) return;
    const b = req.body as { id?: string; volver?: string; url?: string; nombre?: string };
    const destino = String(b.volver ?? "/portal");
    const t = conId(String(b.id ?? ""));
    if (!t || (!tocaA(t, p.matricula) && !dirigeArea(p, t.area, leerAreas()))) {
      return res.redirect(volverPortal(destino, "No se encontró esa tarea."));
    }
    const archivo = req.file;
    const url = String(b.url ?? "").trim();
    const nombre = String(b.nombre ?? "").trim().slice(0, 60);
    if (!archivo && !/^https?:\/\//i.test(url)) {
      return res.redirect(volverPortal(destino, "Sube un archivo o pega un enlace que empiece con http."));
    }
    actualizar(t.id, (x) => {
      x.evidencia.push(archivo
        ? { tipo: "archivo", nombre: nombre || archivo.originalname.slice(0, 60), archivo: archivo.filename,
            por: p.matricula, ts: new Date().toISOString() }
        : { tipo: "enlace", nombre: nombre || "Enlace", url, por: p.matricula, ts: new Date().toISOString() });
    });
    espejarPronto();
    res.redirect(volverPortal(destino, `📎 Evidencia agregada a ${t.titulo}`));
  });

app.use("/tareas/evidencia", (req, res, next) => {
  if (!sesion(req)) return res.status(401).send("Entra al portal para ver la evidencia.");
  if (!archivoSeguro(req.path.slice(1))) return res.status(404).end();
  next();
}, express.static(DIR_EVIDENCIA, { maxAge: "7d", index: false }));

// ---- lámina y cierre de semana ----
app.get("/tareas/semana", (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  const areas = leerAreas();
  if (!puedeAsignar(p, areas)) return res.redirect("/portal");
  const q = String(req.query.lunes ?? "");
  const lunes = /^\d{4}-\d{2}-\d{2}$/.test(q) ? lunesDe(q) : semanaActual();
  res.type("html").send(renderLamina(p, leerTareas(), areas, leerStaff(), lunes));
});

app.get("/tareas/cerrar-semana", (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/tareas");
  res.type("html").send(renderCerrarSemana(p, leerTareas(), leerAreas(), leerStaff()));
});
app.post("/tareas/cerrar-semana", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/tareas");
  const arrastrar = listaDe((req.body as Record<string, unknown>).arrastrar);
  const abiertas = leerTareas().filter(esAbierta).filter((t) => enSemana(t, semanaActual()));
  const vencer = abiertas.map((t) => t.id).filter((id) => !arrastrar.includes(id));
  const s = cerrarSemana(arrastrar, vencer, p.matricula);
  espejarPronto(5);
  res.redirect(volverPortal("/tareas", `✓ Semana cerrada: ${s.arrastradas} se pasaron, ${s.vencidas} quedaron vencidas, ${s.hechas} se completaron`));
});

// ---- equipo (presidencia) ----
app.get("/tareas/equipo", (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/portal");
  res.type("html").send(renderEquipo(p, leerStaff(), leerAreas(), avisoDe(req)));
});
app.post("/tareas/equipo/pin", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/portal");
  const lista = leerStaff();
  const quien = lista.find((x) => x.matricula === normMat(String((req.body as { matricula?: string }).matricula ?? "")));
  if (!quien) return res.redirect(volverPortal("/tareas/equipo", "No se encontró a esa persona."));
  const pin = generarPin();
  ponerPin(quien, pin, true);
  guardarStaff(lista);
  res.redirect(volverPortal("/tareas/equipo", `PIN nuevo de ${quien.nombre}: ${pin} — cópialo ahora, no se vuelve a mostrar`));
});
app.post("/tareas/equipo/director", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/portal");
  const b = req.body as { area?: string; matricula?: string };
  const areas = leerAreas();
  const a = areas.find((x) => x.id === String(b.area ?? ""));
  if (!a) return res.redirect(volverPortal("/tareas/equipo", "No se encontró esa área."));
  const mat = normMat(String(b.matricula ?? ""));
  a.director = mat || undefined;
  guardarAreas(areas);
  const quien = leerStaff().find((x) => x.matricula === mat);
  res.redirect(volverPortal("/tareas/equipo", quien ? `✓ ${quien.nombre} dirige ${a.nombre}` : `✓ ${a.nombre} quedó sin director`));
});

// ---- importación desde Notion y espejo (con la clave del panel) ----
app.post("/admin/notion/importar", urlencoded, async (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  if (!notionActivo()) return res.status(503).send("Falta configurar NOTION_TOKEN.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente.");
  const soloVer = String((req.body as { modo?: string }).modo ?? "") !== "aplicar";
  try {
    const resumen = await importarDeNotion(soloVer);
    res.type("text/plain; charset=utf-8").send(resumen);
  } catch (e) {
    res.status(502).type("text/plain; charset=utf-8").send("Error: " + (e instanceof Error ? e.message : String(e)));
  }
});
// Carga de golpe la lámina semanal: reemplaza tareas y las liga a sus eventos.
const CargaSchema = z.object({
  borrar: z.enum(["notion", "todas", "no"]).optional().default("no"),
  tareas: z.array(z.object({
    titulo: z.string().trim().min(3).max(120),
    detalle: z.string().trim().max(300).optional().default(""),
    area: z.string().max(40),
    asignados: z.array(z.string().max(14)).max(40).optional().default([]),
    evento: z.string().max(12).optional().default(""),
    estado: z.enum(["pendiente", "curso", "hecha"]).optional().default("pendiente"),
  })).max(200),
});
app.post("/admin/tareas/cargar", (req, res) => {
  if (!claveOk(req)) return res.status(401).send("Acceso restringido.");
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente.");
  const parsed = CargaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).type("text/plain; charset=utf-8")
      .send(["Datos inválidos:", ...parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`)].join("\n"));
  }
  const { borrar, tareas } = parsed.data;
  const areas = leerAreas();
  const activas = new Set(staffActivo().map((s) => s.matricula));
  const eventos = leerEventos();
  const idsEv = new Set(eventos.map((e) => e.id));
  // se valida TODO antes de tocar nada: o entra completa o no entra
  const problemas: string[] = [];
  tareas.forEach((t, i) => {
    if (!areas.some((a) => a.id === t.area)) problemas.push(`  #${i + 1} «${t.titulo}»: el área "${t.area}" no existe`);
    for (const m of t.asignados) {
      if (!activas.has(normMat(m))) problemas.push(`  #${i + 1} «${t.titulo}»: ${m} no está en el staff activo`);
    }
    if (t.evento && !idsEv.has(t.evento)) problemas.push(`  #${i + 1} «${t.titulo}»: el evento ${t.evento} no existe`);
  });
  if (problemas.length) {
    return res.status(400).type("text/plain; charset=utf-8").send(["No se cargó nada. Revisa:", ...problemas].join("\n"));
  }
  const previas = leerTareas();
  const quedan = borrar === "todas" ? [] : borrar === "notion" ? previas.filter((t) => !t.origen) : previas;
  guardarTareas(quedan);
  const l: string[] = [`Borradas: ${previas.length - quedan.length} · se conservan ${quedan.length}`, ""];
  for (const t of tareas) {
    const nueva = crearTarea({
      titulo: t.titulo, detalle: t.detalle, area: t.area,
      asignados: [...new Set(t.asignados.map(normMat))],
      vigencia: t.evento ? { tipo: "evento", evento: t.evento } : { tipo: "transversal" },
      estado: t.estado, creadaPor: "lamina",
    });
    const ev = eventos.find((e) => e.id === t.evento);
    l.push(`  [${t.area}] ${nueva.titulo}${ev ? " → " + ev.titulo : " → sin evento"}`);
  }
  espejarPronto(10);
  l.push("", `Creadas: ${tareas.length} · total ahora: ${leerTareas().length}`);
  res.type("text/plain; charset=utf-8").send(l.join("\n"));
});

app.post("/admin/notion/espejo", urlencoded, async (req, res) => {
  if (!acceso(req)) return res.status(401).send("Acceso restringido.");
  const r = await espejar();
  res.redirect(volverAdmin(req, r.mensaje));
});

// ---------------- equipo: editar, dar de alta, áreas (nivel presidencia) ----------------
const contraste = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const l = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return l > 150 ? "#1C2260" : "#ffffff";
};
app.post("/tareas/equipo/persona", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/portal");
  const b = req.body as { matricula?: string; area?: string; rol?: string; admin?: string; activo?: string };
  const lista = leerStaff();
  const quien = lista.find((x) => x.matricula === normMat(String(b.matricula ?? "")));
  if (!quien) return res.redirect(volverPortal("/tareas/equipo", "No se encontró a esa persona."));
  const areas = leerAreas();
  const area = String(b.area ?? "");
  if (area && !areas.some((a) => a.id === area)) return res.redirect(volverPortal("/tareas/equipo", "Esa área no existe."));
  const rol = String(b.rol ?? "");
  if (!(rol in ROLES)) return res.redirect(volverPortal("/tareas/equipo", "Ese rol no existe."));
  quien.area = area;
  if (quien.matricula === p.matricula) {   // a uno mismo solo el área: el rol lo cambia otra persona
    if (rol !== quien.rol || (b.admin === "on") !== Boolean(quien.admin) || (b.activo === "on") !== quien.activo) {
      guardarStaff(lista);
      return res.redirect(volverPortal("/tareas/equipo", "Tu área quedó guardada. Tu rol, admin o baja los cambia otra persona de presidencia, para que nadie se quede fuera por accidente."));
    }
  } else {
    quien.rol = rol as RolId;
    quien.admin = b.admin === "on" ? true : undefined;
    quien.activo = b.activo === "on";
  }
  guardarStaff(lista);
  espejarPronto();
  const nombreArea = areas.find((a) => a.id === area)?.nombre ?? "sin área";
  res.redirect(volverPortal("/tareas/equipo", `✓ ${quien.nombre}: ${ROLES[quien.rol].nombre} de ${nombreArea}${quien.activo ? "" : " · dado de baja"}`));
});

const AltaSchema = z.object({
  nombre: z.string().trim().min(5).max(80),
  apodo: z.string().trim().max(20).optional().default(""),
  matricula: z.string().trim().min(6).max(12),
  area: z.string().max(40).optional().default(""),
  rol: z.string().refine((r) => r in ROLES, "rol").optional().default("coordinacion"),
});
app.post("/tareas/equipo/alta", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/portal");
  const parsed = AltaSchema.safeParse(req.body);
  if (!parsed.success) return res.redirect(volverPortal("/tareas/equipo", "Revisa nombre y matrícula (la matrícula va tipo A0XXXXXXX)."));
  if (!hayDiscoPersistente()) return res.status(503).send("No hay disco persistente.");
  const d = parsed.data;
  const mat = normMat(d.matricula);
  const lista = leerStaff();
  const areas = leerAreas();
  const area = areas.some((a) => a.id === d.area) ? d.area : "";
  const pin = generarPin();
  const ya = lista.find((x) => x.matricula === mat);
  if (ya && ya.activo) return res.redirect(volverPortal("/tareas/equipo", `${ya.nombre} ya está dado de alta con esa matrícula.`));
  if (ya) {   // estaba de baja: se reactiva con PIN nuevo
    ya.activo = true; ya.nombre = d.nombre; ya.apodo = d.apodo; ya.area = area; ya.rol = d.rol as RolId;
    ponerPin(ya, pin, true);
  } else {
    const nuevo: Persona = { matricula: mat, nombre: d.nombre, apodo: d.apodo, area, rol: d.rol as RolId, activo: true };
    ponerPin(nuevo, pin, true);
    lista.push(nuevo);
  }
  guardarStaff(lista);
  espejarPronto();
  res.redirect(volverPortal("/tareas/equipo", `✓ ${d.nombre} dado de alta · PIN provisional: ${pin} — cópialo ahora, no se vuelve a mostrar`));
});

app.post("/tareas/equipo/area/nueva", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/portal");
  const b = req.body as { nombre?: string; emoji?: string; color?: string };
  const nombre = String(b.nombre ?? "").trim().slice(0, 40);
  if (nombre.length < 3) return res.redirect(volverPortal("/tareas/equipo", "El nombre del área necesita al menos tres letras."));
  const areas = leerAreas();
  let id = slug(nombre);
  for (let n = 2; areas.some((a) => a.id === id); n++) id = `${slug(nombre)}-${n}`;
  const color = /^#[0-9a-fA-F]{6}$/.test(String(b.color ?? "")) ? String(b.color).toUpperCase() : "#C026D3";
  const emoji = String(b.emoji ?? "").trim().slice(0, 4) || "📌";
  areas.push({ id, nombre, color, tinta: contraste(color), emoji, orden: Math.max(-1, ...areas.map((a) => a.orden)) + 1 });
  guardarAreas(areas);
  espejarPronto();
  res.redirect(volverPortal("/tareas/equipo", `✓ Área creada: ${emoji} ${nombre}`));
});
app.post("/tareas/equipo/area/borrar", urlencoded, (req, res) => {
  const p = exigeSesion(req, res);
  if (!p) return;
  if (!esPresidencia(p)) return res.redirect("/portal");
  const id = String((req.body as { area?: string }).area ?? "");
  const areas = leerAreas();
  const a = areas.find((x) => x.id === id);
  if (!a) return res.redirect(volverPortal("/tareas/equipo", "No se encontró esa área."));
  guardarAreas(areas.filter((x) => x.id !== id));
  // tareas y personas se quedan, solo pierden el área
  const tareas = leerTareas();
  let n = 0;
  for (const t of tareas) if (t.area === id) { t.area = ""; n++; }
  guardarTareas(tareas);
  const lista = leerStaff();
  for (const s of lista) if (s.area === id) s.area = "";
  guardarStaff(lista);
  espejarPronto();
  res.redirect(volverPortal("/tareas/equipo", `✓ Área borrada: ${a.nombre}${n ? ` · ${n} tarea${n === 1 ? "" : "s"} quedaron sin área` : ""}`));
});

// ---------------- API JSON del tablero visual (sesión del portal) ----------------
const jsonSesion = (req: express.Request, res: express.Response): Persona | null => {
  const p = sesion(req);
  if (!p || p.provisional) { res.status(401).json({ error: "Tu sesión terminó. Entra al portal otra vez." }); return null; }
  return p;
};
const tareaJSON = (t: Tarea) => ({
  id: t.id, titulo: t.titulo, detalle: t.detalle ?? "", area: t.area, asignados: t.asignados,
  vigencia: t.vigencia, estado: t.estado, evidencia: t.evidencia.length, atrasada: atrasada(t),
});
const fechaOpt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).nullable();
const VigenciaSchema = z.object({
  tipo: z.enum(["fechas", "transversal", "evento"]),
  inicio: fechaOpt, fin: fechaOpt, evento: z.string().max(12).optional().nullable(),
});
const PatchSchema = z.object({
  titulo: z.string().trim().min(3).max(120).optional(),
  detalle: z.string().trim().max(300).optional(),
  area: z.string().max(40).optional(),
  asignados: z.array(z.string().max(14)).max(40).optional(),
  estado: z.enum(["pendiente", "curso", "hecha", "vencida"]).optional(),
  vigencia: VigenciaSchema.optional(),
  posponer: z.boolean().optional(),
});

app.post("/api/tareas", (req, res) => {
  const p = jsonSesion(req, res);
  if (!p) return;
  const parsed = z.object({ titulo: z.string().trim().min(3).max(120), area: z.string().max(40) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "El título necesita al menos tres letras." });
  const areas = leerAreas();
  if (!areas.some((a) => a.id === parsed.data.area)) return res.status(400).json({ error: "Esa área no existe." });
  if (!dirigeArea(p, parsed.data.area, areas)) return res.status(403).json({ error: "No puedes crear tareas en esa área." });
  if (!hayDiscoPersistente()) return res.status(503).json({ error: "No hay disco persistente." });
  // nace en la semana actual; la fecha exacta se afina después desde la tarjeta
  const t = crearTarea({ titulo: parsed.data.titulo, detalle: "", area: parsed.data.area, asignados: [],
                         vigencia: { tipo: "fechas", inicio: hoyISO(), fin: sumarDias(semanaActual(), 6) },
                         creadaPor: p.matricula });
  espejarPronto();
  res.json(tareaJSON(t));
});

app.patch("/api/tareas/:id", (req, res) => {
  const p = jsonSesion(req, res);
  if (!p) return;
  const t = conId(String(req.params.id));
  if (!t) return res.status(404).json({ error: "Esa tarea ya no existe." });
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos." });
  const c = parsed.data;
  const areas = leerAreas();
  const gestiona = dirigeArea(p, t.area, areas);
  const mia = tocaA(t, p.matricula);
  const edita = c.titulo !== undefined || c.detalle !== undefined || c.area !== undefined ||
                c.asignados !== undefined || c.vigencia !== undefined;
  if (edita && !gestiona) return res.status(403).json({ error: "Solo quien dirige el área puede editar esa tarea." });
  if (c.area !== undefined && c.area !== "" && !areas.some((a) => a.id === c.area)) return res.status(400).json({ error: "Esa área no existe." });
  if (c.area !== undefined && c.area !== t.area && !dirigeArea(p, c.area, areas)) return res.status(403).json({ error: "No puedes mover tareas a esa área." });
  if ((c.estado !== undefined || c.posponer) && !gestiona && !mia) return res.status(403).json({ error: "Esa tarea no es tuya." });
  if (c.estado === "vencida" && !gestiona) return res.status(403).json({ error: "Solo quien dirige el área puede dar por vencida una tarea." });
  const activas = new Set(staffActivo().map((s) => s.matricula));
  const r = actualizar(t.id, (x) => {
    if (c.titulo !== undefined) x.titulo = c.titulo;
    if (c.detalle !== undefined) x.detalle = c.detalle;
    if (c.area !== undefined) x.area = c.area;
    if (c.asignados !== undefined) x.asignados = [...new Set(c.asignados.map(normMat).filter((m) => activas.has(m)))];
    if (c.vigencia) {
      const v = c.vigencia;
      x.vigencia = v.tipo === "fechas" ? { tipo: "fechas", inicio: v.inicio || undefined, fin: v.fin || undefined }
        : v.tipo === "evento" ? { tipo: "evento", evento: v.evento || undefined } : { tipo: "transversal" };
    }
    if (c.estado !== undefined) {
      x.estado = c.estado;
      if (c.estado === "hecha") { x.hechaEl = new Date().toISOString(); x.hechaPor = p.matricula; }
      else { x.hechaEl = undefined; x.hechaPor = undefined; }
      x.cerradaEn = c.estado === "vencida" ? semanaActual() : undefined;
    }
    if (c.posponer) posponer(x);
  });
  espejarPronto();
  res.json(tareaJSON(r!));
});

app.delete("/api/tareas/:id", (req, res) => {
  const p = jsonSesion(req, res);
  if (!p) return;
  const t = conId(String(req.params.id));
  if (!t) return res.status(404).json({ error: "Esa tarea ya no existe." });
  if (!dirigeArea(p, t.area, leerAreas())) return res.status(403).json({ error: "Solo quien dirige el área puede borrar esa tarea." });
  borrarTarea(t.id);
  espejarPronto();
  res.json({ ok: true });
});

// build web de Expo (app/dist) en producción
const dist = path.resolve(__dirname, "../../app/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`mind-store api en :${port}`));
