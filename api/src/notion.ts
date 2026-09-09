// Puente con Notion: importa lo que viene del semestre actual y mantiene un
// espejo de solo lectura dentro de una página propia.
// NUNCA escribe en las bases que el grupo ya usa: solo en su propia página.
import fs from "node:fs";
import path from "node:path";
import { leerAreas, leerStaff, normMat, nombreCorto, type Persona, type RolId } from "./staff";
import { esAbierta, leerTareas, ESTADOS, quienes, cuando, rangoSemana, semanaActual,
         enSemana, type Tarea } from "./tareas";

const VERSION = "2026-03-11";
const DIR = process.env.DATA_DIR ?? "/data";
const F_NOTION = path.join(DIR, "notion.json");

/** Bases del semestre AD 2026, halladas al explorar el workspace. Se pueden
 *  sustituir sin tocar código escribiendo /data/notion.json. */
const BASES_POR_DEFECTO = {
  semestre: "3909be29-0507-80c1-87aa-e28b5a715dc6",
  directorio: "4e39be29-0507-82ca-969c-072712dda0c6",
  pendientes: "9a39be29-0507-832e-aeb5-07f1275c0432",
  fechas: "dfe9be29-0507-82ff-bad2-079e4d550043",
  juntas: "4ce9be29-0507-82f2-963d-870f86f9c22c",
  tareas: [
    { id: "3099be29-0507-8211-bf2c-07fdec2c4460", area: "presidencia" },
    { id: "3399be29-0507-8340-b604-07b66209367c", area: "proyectos" },
    { id: "5579be29-0507-82f3-97d7-07eb45b7491b", area: "finanzas" },
    { id: "f679be29-0507-821e-b532-07288e61bbe2", area: "comunicacion" },
    { id: "5859be29-0507-82f8-9730-876fc125eeaa", area: "respo" },
  ] as { id: string; area: string }[],
};
interface Config { bases: typeof BASES_POR_DEFECTO; paginaEspejo?: string; ultimoEspejo?: string }

function leerConfig(): Config {
  try {
    const j = JSON.parse(fs.readFileSync(F_NOTION, "utf8")) as Partial<Config>;
    return { bases: { ...BASES_POR_DEFECTO, ...(j.bases ?? {}) }, paginaEspejo: j.paginaEspejo,
             ultimoEspejo: j.ultimoEspejo };
  } catch { return { bases: BASES_POR_DEFECTO }; }
}
function guardarConfig(c: Config): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(F_NOTION + ".tmp", JSON.stringify(c, null, 1));
  fs.renameSync(F_NOTION + ".tmp", F_NOTION);
}
export const notionActivo = () => Boolean(process.env.NOTION_TOKEN);
export const estadoEspejo = () => {
  const c = leerConfig();
  return { pagina: c.paginaEspejo, ultimo: c.ultimoEspejo };
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function api<T = Record<string, unknown>>(ruta: string, metodo = "GET", cuerpo?: unknown): Promise<T> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN no configurado");
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.notion.com/v1" + ruta, {
      method: metodo,
      headers: { Authorization: "Bearer " + token, "Notion-Version": VERSION, "Content-Type": "application/json" },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });
    if (r.status === 429) { await espera(1200 * (i + 1)); continue; }
    const j = await r.json().catch(() => ({}));
    await espera(340);   // el límite es ~3 por segundo
    if (!r.ok) throw new Error(`${r.status} ${(j as { message?: string }).message ?? ""}`.trim());
    return j as T;
  }
  throw new Error("Notion respondió 429 demasiadas veces");
}

// ---------------- lectura ----------------
interface FilaNotion { id: string; properties: Record<string, PropNotion>; url?: string }
type PropNotion = { type: string } & Record<string, unknown>;
const texto = (rich: unknown) =>
  Array.isArray(rich) ? rich.map((t) => (t as { plain_text: string }).plain_text).join("").trim() : "";

async function filas(dataSourceId: string): Promise<FilaNotion[]> {
  const out: FilaNotion[] = [];
  let cursor: string | undefined;
  do {
    const r = await api<{ results: FilaNotion[]; has_more: boolean; next_cursor: string }>(
      `/data_sources/${dataSourceId}/query`, "POST", { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}
/** Busca por tipo, no por nombre: cada base del grupo nombró sus columnas distinto. */
function porTipo(f: FilaNotion, tipo: string, nombrePreferido?: string): PropNotion | undefined {
  const entradas = Object.entries(f.properties ?? {});
  if (nombrePreferido) {
    const exacto = entradas.find(([k, v]) => k.toLowerCase() === nombrePreferido.toLowerCase() && v.type === tipo);
    if (exacto) return exacto[1];
  }
  return entradas.find(([, v]) => v.type === tipo)?.[1];
}
const titulo = (f: FilaNotion) => texto(porTipo(f, "title")?.title);
function estadoDe(f: FilaNotion): "pendiente" | "curso" | "hecha" {
  const p = porTipo(f, "status", "Estado") ?? porTipo(f, "select", "Estado");
  const raw = ((p?.status ?? p?.select) as { name?: string } | null)?.name ?? "";
  const n = raw.toLowerCase();
  if (n.includes("curso") || n.includes("progress")) return "curso";
  if (n.includes("listo") || n.includes("done") || n.includes("realizada") || n.includes("complet")) return "hecha";
  return "pendiente";
}
function fechaDe(f: FilaNotion): string | undefined {
  const p = porTipo(f, "date");
  const d = (p?.date as { start?: string } | null)?.start;
  return d ? d.slice(0, 10) : undefined;
}
function gentePorNombre(f: FilaNotion): string[] {
  const p = porTipo(f, "people");
  if (!Array.isArray(p?.people)) return [];
  return (p!.people as { name?: string }[]).map((u) => (u.name ?? "").trim()).filter(Boolean);
}
/** Compara nombres sin depender de acentos ni de apellidos completos. */
const normNombre = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
function casaNombre(nombre: string, candidatos: { nombre: string; matricula: string }[]): string | undefined {
  const a = normNombre(nombre);
  if (!a.length) return undefined;
  let mejor: { m: string; n: number } | undefined;
  for (const c of candidatos) {
    const b = new Set(normNombre(c.nombre));
    let n = 0;
    for (const w of a) if (b.has(w)) n++;
    if (n >= 2 || (n === 1 && a.length === 1)) {
      if (!mejor || n > mejor.n) mejor = { m: c.matricula, n };
    }
  }
  return mejor?.m;
}
function detalleDe(f: FilaNotion): string {
  for (const [, v] of Object.entries(f.properties ?? {})) {
    if (v.type === "rich_text") { const t = texto(v.rich_text); if (t) return t; }
  }
  return "";
}
function urlDe(f: FilaNotion): string {
  for (const [, v] of Object.entries(f.properties ?? {})) {
    if (v.type === "url" && typeof v.url === "string" && v.url) return v.url;
  }
  return "";
}

/** Personas del workspace por correo. Los tokens personales no pueden listar
 *  usuarios: si falla, la asignación se casa por nombre. */
export async function usuariosNotion(): Promise<Map<string, string>> {
  try {
  const r = await api<{ results: { id: string; type: string; name: string; person?: { email?: string } }[] }>("/users");
  const m = new Map<string, string>();
  for (const u of r.results) {
    const correo = u.person?.email ?? "";
    const mat = correo.match(/^([aA]0*\d+)@/);
    if (u.type === "person" && mat) m.set(u.name, mat[1].toUpperCase());
    }
    return m;
  } catch { return new Map(); }
}

export interface PersonaImportada {
  matricula: string; nombre: string; apodo: string; area: string; rol: RolId; correo: string; carrera: string;
}
const AREA_POR_NOMBRE: Record<string, string> = {
  "presidencia": "presidencia", "proyectos": "proyectos", "finanzas": "finanzas",
  "comunicación": "comunicacion", "comunicacion": "comunicacion",
  "responsabilidad social": "respo", "respo": "respo",
};
const ROL_POR_NOMBRE: Record<string, RolId> = {
  "presidencia": "presidencia", "vicepresidencia": "vicepresidencia",
  "dirección": "direccion", "direccion": "direccion", "coordinación": "coordinacion", "coordinacion": "coordinacion",
};

export async function leerDirectorio(): Promise<PersonaImportada[]> {
  const c = leerConfig();
  const out: PersonaImportada[] = [];
  for (const f of await filas(c.bases.directorio)) {
    const props = f.properties ?? {};
    const dime = (nombre: string) => {
      const p = props[nombre];
      if (!p) return "";
      if (p.type === "rich_text") return texto(p.rich_text);
      if (p.type === "title") return texto(p.title);
      if (p.type === "select") return ((p.select as { name?: string } | null)?.name) ?? "";
      if (p.type === "email") return (p.email as string) ?? "";
      if (p.type === "phone_number") return (p.phone_number as string) ?? "";
      return "";
    };
    const matricula = normMat(dime("Matrícula") || dime("Matricula"));
    // ojo: la columna título del Directorio es el apodo, el nombre va aparte
    const nombre = dime("Nombre Completo") || titulo(f);
    const apodoCol = (dime("Nombre Preferido") || titulo(f) || "").trim();
    if (!matricula || !nombre) continue;
    const areaTxt = (dime("Área") || dime("Area")).trim().toLowerCase();
    const rolTxt = dime("Rol").trim().toLowerCase();
    out.push({
      matricula, nombre,
      apodo: apodoCol === nombre ? "" : apodoCol,
      area: AREA_POR_NOMBRE[areaTxt] ?? "",
      rol: ROL_POR_NOMBRE[rolTxt] ?? "coordinacion",
      correo: dime("Correo").trim().toLowerCase(),
      carrera: dime("Carrera").trim(),
    });
  }
  return out;
}

export interface TareaImportada {
  titulo: string; detalle: string; area: string; asignados: string[];
  estado: "pendiente" | "curso"; fin?: string; origen: string;
}
/** Tareas ABIERTAS del semestre actual. Las ya terminadas se quedan en Notion. */
export async function leerTareasNotion(directorio?: PersonaImportada[]): Promise<TareaImportada[]> {
  const c = leerConfig();
  const dir = directorio ?? await leerDirectorio();
  const porCorreo = await usuariosNotion();
  const candidatos = [
    ...dir.map((d) => ({ nombre: d.nombre, matricula: d.matricula })),
    ...leerStaff().map((p) => ({ nombre: p.nombre, matricula: p.matricula })),
  ];
  const conocidas = new Set(candidatos.map((c2) => c2.matricula));
  const out: TareaImportada[] = [];
  const agrega = (f: FilaNotion, area: string) => {
    const t = titulo(f);
    const estado = estadoDe(f);
    if (!t || estado === "hecha") return;
    const asignados = gentePorNombre(f)
      .map((n) => porCorreo.get(n) ?? casaNombre(n, candidatos))
      .filter((m): m is string => !!m && conocidas.has(m));
    const url = urlDe(f);
    const detalle = [detalleDe(f), url].filter(Boolean).join(" · ");
    out.push({ titulo: t.slice(0, 120), detalle: detalle.slice(0, 300), area, asignados,
               estado, fin: fechaDe(f), origen: f.id });
  };
  for (const b of c.bases.tareas) {
    for (const f of await filas(b.id)) agrega(f, b.area);
  }
  // "Pendientes a tomar en cuenta" trae su propia columna de área y son transversales
  for (const f of await filas(c.bases.pendientes)) {
    const props = f.properties ?? {};
    const p = props["Área"] ?? props["Area"];
    let area = "";
    if (p?.type === "multi_select") {
      const nombres = (p.multi_select as { name: string }[]).map((x) => x.name.toLowerCase());
      area = AREA_POR_NOMBRE[nombres[0] ?? ""] ?? "";
    } else if (p?.type === "select") {
      area = AREA_POR_NOMBRE[((p.select as { name?: string } | null)?.name ?? "").toLowerCase()] ?? "";
    }
    agrega(f, area);
  }
  return out;
}

export interface EventoImportado { titulo: string; fecha: string; lugar: string; origen: string }
/** Eventos y juntas con fecha de HOY en adelante. */
export async function leerAgenda(desde: string): Promise<{ eventos: EventoImportado[]; juntas: EventoImportado[] }> {
  const c = leerConfig();
  const saca = async (id: string) => (await filas(id)).map((f) => {
    const props = f.properties ?? {};
    const lug = props["Lugar"];
    const lugar = lug?.type === "multi_select" ? (lug.multi_select as { name: string }[]).map((x) => x.name).join(", ")
      : lug?.type === "rich_text" ? texto(lug.rich_text) : "";
    return { titulo: titulo(f), fecha: fechaDe(f) ?? "", lugar, origen: f.id };
  }).filter((e) => e.titulo && e.fecha >= desde);
  return { eventos: await saca(c.bases.fechas), juntas: await saca(c.bases.juntas) };
}

// ---------------- espejo ----------------
const parrafo = (t: string) => ({ object: "block", type: "paragraph",
  paragraph: { rich_text: [{ type: "text", text: { content: t.slice(0, 1900) } }] } });
const titulo2 = (t: string) => ({ object: "block", type: "heading_2",
  heading_2: { rich_text: [{ type: "text", text: { content: t.slice(0, 100) } }] } });
const vinieta = (t: string, negrita = "") => ({ object: "block", type: "bulleted_list_item",
  bulleted_list_item: { rich_text: [
    ...(negrita ? [{ type: "text", text: { content: negrita.slice(0, 200) }, annotations: { bold: true } }] : []),
    { type: "text", text: { content: t.slice(0, 1700) } },
  ] } });

async function asegurarPagina(): Promise<string> {
  const c = leerConfig();
  if (c.paginaEspejo) return c.paginaEspejo;
  const p = await api<{ id: string }>("/pages", "POST", {
    parent: { type: "page_id", page_id: c.bases.semestre },
    icon: { type: "emoji", emoji: "🧠" },
    properties: { title: [{ type: "text", text: { content: "Portal MIND (espejo)" } }] },
    children: [parrafo("Esta página la escribe sola la página web de MIND. No la edites a mano: se rehace completa en cada actualización. La fuente es el portal.")],
  });
  guardarConfig({ ...c, paginaEspejo: p.id });
  return p.id;
}

let espejando = false;
let pendiente: NodeJS.Timeout | null = null;

/** Rehace el contenido de la página espejo. Nunca lanza hacia afuera. */
export async function espejar(): Promise<{ ok: boolean; mensaje: string }> {
  if (!notionActivo()) return { ok: false, mensaje: "Notion no está configurado" };
  if (espejando) return { ok: false, mensaje: "Ya se está actualizando" };
  espejando = true;
  try {
    const pagina = await asegurarPagina();
    // borrar lo que haya (la página es nuestra, nadie más escribe ahí)
    let cursor: string | undefined;
    const hijos: string[] = [];
    do {
      const r = await api<{ results: { id: string }[]; has_more: boolean; next_cursor: string }>(
        `/blocks/${pagina}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
      hijos.push(...r.results.map((b) => b.id));
      cursor = r.has_more ? r.next_cursor : undefined;
    } while (cursor);
    for (const id of hijos) { try { await api(`/blocks/${id}`, "DELETE"); } catch { /* ya no está */ } }

    const areas = leerAreas();
    const staff = leerStaff();
    const tareas = leerTareas();
    const lunes = semanaActual();
    const abiertas = tareas.filter(esAbierta);
    const bloques: unknown[] = [
      parrafo(`Actualizado el ${new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })} desde el portal. Semana del ${rangoSemana(lunes)}.`),
      parrafo("Esta página se rehace sola. Para cambiar algo, entra al portal."),
      titulo2("Tareas abiertas"),
    ];
    for (const a of areas) {
      const suyas = abiertas.filter((t) => t.area === a.id);
      if (!suyas.length) continue;
      bloques.push(titulo2(`${a.emoji} ${a.nombre}`));
      for (const t of suyas) {
        const q = quienes(t, staff);
        const estado = ESTADOS[t.estado].nombre;
        bloques.push(vinieta(`${t.titulo}${q ? ` (${q})` : ""} — ${estado} · ${cuando(t, [])}${enSemana(t, lunes) ? "" : " · fuera de esta semana"}`));
      }
    }
    const sinArea = abiertas.filter((t) => !areas.some((a) => a.id === t.area));
    if (sinArea.length) {
      bloques.push(titulo2("Sin área"));
      for (const t of sinArea) bloques.push(vinieta(`${t.titulo} (${quienes(t, staff)})`));
    }
    const hechas = tareas.filter((t) => t.estado === "hecha").slice(-25).reverse();
    if (hechas.length) {
      bloques.push(titulo2("Cerradas recientemente"));
      for (const t of hechas) bloques.push(vinieta(`${t.titulo} (${quienes(t, staff)})${t.hechaEl ? " — " + t.hechaEl.slice(0, 10) : ""}`));
    }
    bloques.push(titulo2("Equipo"));
    for (const a of areas) {
      const gente = staff.filter((p) => p.area === a.id && p.activo)
        .map((p) => `${nombreCorto(p)}`).join(", ");
      if (gente) bloques.push(vinieta(gente, `${a.emoji} ${a.nombre}: `));
    }
    for (let i = 0; i < bloques.length; i += 90) {
      await api(`/blocks/${pagina}/children`, "PATCH", { children: bloques.slice(i, i + 90) });
    }
    const c = leerConfig();
    guardarConfig({ ...c, ultimoEspejo: new Date().toISOString() });
    return { ok: true, mensaje: `Espejo actualizado (${abiertas.length} tareas abiertas)` };
  } catch (e) {
    console.error("espejo notion:", e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "error" };
  } finally {
    espejando = false;
  }
}

/** Programa una actualización del espejo sin bloquear la respuesta al navegador. */
export function espejarPronto(segundos = 45): void {
  if (!notionActivo()) return;
  if (pendiente) clearTimeout(pendiente);
  pendiente = setTimeout(() => { pendiente = null; void espejar(); }, segundos * 1000);
  if (typeof pendiente.unref === "function") pendiente.unref();
}

// ---------------- importación ----------------
import { crearEvento, leerEventos, TIPOS, type TipoId } from "./eventos";
import { crearTarea, leerTareas as leerTareasLocal, guardarTareas } from "./tareas";
import { generarPin, guardarStaff, guardarAreas, ponerPin } from "./staff";

/** Adivina el tipo de evento por su nombre; lo que no cae en las cuatro categorías va como "Otro". */
function tipoDeEvento(nombre: string): { tipo: TipoId; tipoNombre?: string } {
  const n = nombre.toLowerCase();
  if (n.includes("happy midweek")) return { tipo: "happy" };
  if (n.includes("neurocharla")) return { tipo: "neurocharla" };
  if (n.includes("neurart")) return { tipo: "neurart" };
  if (n.includes("redspot") || n.includes("stand") || n.includes("callejero")) return { tipo: "stand" };
  const limpio = nombre.replace(/\s+/g, " ").trim().slice(0, 40);
  return { tipo: "otro", tipoNombre: limpio.replace(/\s+[IVX]+$/i, "").trim() || limpio };
}
/** Fechas "de relleno" del calendario que no son eventos de MIND. */
const esRelleno = (n: string) => /^semana\b|semana santa|asamblea|tabulador|lead the future|back 2 school/i.test(n.trim());

/**
 * Trae del Notion del semestre lo que todavía sirve: el directorio, las tareas
 * abiertas y la agenda futura. Nunca borra ni pisa lo que ya existe en la página.
 * Con soloVer = true no escribe nada y solo describe lo que haría.
 */
export async function importarDeNotion(soloVer: boolean): Promise<string> {
  const l: string[] = [soloVer ? "ENSAYO (no se escribió nada)" : "IMPORTACIÓN APLICADA", ""];
  const hoy = new Date().toLocaleDateString("sv-SE");

  // 1) personas
  const dir = await leerDirectorio();
  const staff = leerStaff();
  const pines: string[] = [];
  let nuevas = 0, actualizadas = 0;
  for (const d of dir) {
    const ya = staff.find((p) => p.matricula === d.matricula);
    if (ya) {
      ya.nombre = d.nombre; ya.apodo = d.apodo || ya.apodo; ya.correo = d.correo || ya.correo;
      ya.carrera = d.carrera || ya.carrera;
      if (d.area) ya.area = d.area;
      ya.rol = d.rol; ya.activo = true;
      actualizadas++;
    } else {
      const p: Persona = { matricula: d.matricula, nombre: d.nombre, apodo: d.apodo, area: d.area || "",
                           rol: d.rol, correo: d.correo, carrera: d.carrera, activo: true };
      // Quique mantiene la página: permiso de administración con PIN acordado
      if (d.matricula === "A01178473") p.admin = true;
      const pin = d.matricula === "A01178473" ? "4071" : generarPin();
      ponerPin(p, pin, true);
      pines.push(`${d.matricula}\t${soloVer ? "----" : pin}\t${d.nombre}\t${d.apodo || ""}\t${d.area}\t${d.rol}`);
      staff.push(p);
      nuevas++;
    }
  }
  l.push(`PERSONAS: ${dir.length} en el Directorio · ${nuevas} nuevas · ${actualizadas} actualizadas`);
  if (pines.length) {
    l.push("", "PIN PROVISIONAL (matrícula, pin, nombre, apodo, área, rol) — se muestra UNA vez:");
    l.push(...pines.map((p) => "  " + p), "");
  }
  const areas = leerAreas();
  for (const a of areas) {
    const dirArea = staff.find((p) => p.area === a.id && p.rol === "direccion");
    if (!a.director && dirArea) a.director = dirArea.matricula;
  }
  const jefa = staff.find((p) => p.rol === "presidencia");
  const areaPres = areas.find((x) => x.id === "presidencia");
  if (areaPres && !areaPres.director && jefa) areaPres.director = jefa.matricula;
  l.push("DIRECCIONES: " + areas.map((a) => `${a.nombre}=${staff.find((p) => p.matricula === a.director)?.apodo ?? "—"}`).join(" · "));

  // 2) tareas abiertas
  const tareasNotion = await leerTareasNotion(dir);
  const locales = leerTareasLocal();
  const yaImportadas = new Set(locales.map((t) => t.origen).filter(Boolean));
  const viejas = tareasNotion.filter((t) => t.fin && t.fin < hoy);
  const porCrear = tareasNotion.filter((t) => !yaImportadas.has(t.origen) && !(t.fin && t.fin < hoy));
  l.push("", `TAREAS: ${tareasNotion.length} abiertas en Notion · ${porCrear.length} por importar · ${viejas.length} omitidas por fecha vencida del semestre anterior`);
  for (const t of viejas) l.push(`  (omitida ${t.fin}) ${t.titulo}`);
  for (const t of porCrear.slice(0, 40)) {
    l.push(`  [${t.area || "sin área"}] ${t.titulo}${t.asignados.length ? " (" + t.asignados.join(", ") + ")" : ""}${t.fin ? " · hasta " + t.fin : ""}`);
  }

  // 3) agenda futura
  const agenda = await leerAgenda(hoy);
  const eventos = leerEventos();
  const mismo = (titulo: string, fecha: string) =>
    eventos.some((e) => e.fecha === fecha && e.titulo.toLowerCase().includes(titulo.toLowerCase().slice(0, 12)));
  const evNuevos = agenda.eventos.filter((e) => !esRelleno(e.titulo) && !mismo(e.titulo, e.fecha));
  const juNuevas = agenda.juntas.filter((j) => !mismo(j.titulo, j.fecha));
  l.push("", `AGENDA: ${evNuevos.length} eventos y ${juNuevas.length} juntas por crear (de hoy en adelante)`);
  for (const e of evNuevos) {
    const t = tipoDeEvento(e.titulo);
    l.push(`  ${e.fecha}  ${TIPOS[t.tipo].emoji} ${t.tipoNombre ?? TIPOS[t.tipo].nombre} · ${e.titulo}${e.lugar ? " · " + e.lugar : ""}`);
  }
  for (const j of juNuevas) l.push(`  ${j.fecha}  📋 ${j.titulo}${j.lugar ? " · " + j.lugar : ""}`);

  if (soloVer) return l.join("\n");

  // ---- aplicar ----
  guardarStaff(staff);
  guardarAreas(areas);
  const conocidas = new Set(staff.map((p) => p.matricula));
  for (const t of porCrear) {
    crearTarea({
      titulo: t.titulo, detalle: t.detalle, area: t.area,
      asignados: t.asignados.filter((m) => conocidas.has(m)),
      vigencia: t.fin ? { tipo: "fechas", fin: t.fin } : { tipo: "transversal" },
      estado: t.estado, creadaPor: "notion", origen: t.origen,
    });
  }
  for (const e of evNuevos) {
    const t = tipoDeEvento(e.titulo);
    crearEvento({ tipo: t.tipo, tipoNombre: t.tipoNombre, titulo: e.titulo, fecha: e.fecha, lugar: e.lugar });
  }
  for (const j of juNuevas) {
    crearEvento({ tipo: "junta", titulo: j.titulo, fecha: j.fecha, lugar: j.lugar });
  }
  l.push("", "Listo. Nada de Notion fue modificado ni borrado.");
  return l.join("\n");
}

/** Tipos de archivo aceptados como evidencia de una tarea. */
export const EXT_EVIDENCIA: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "application/pdf": "pdf", "video/mp4": "mp4", "video/quicktime": "mov",
};
