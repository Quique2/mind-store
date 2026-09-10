// Personas, áreas y acceso al portal de MIND.
// Los datos personales (correo, carrera, PIN) viven SOLO en el disco persistente
// de Railway: el repositorio es público y nada de esto puede llegar a git.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type RolId = "presidencia" | "vicepresidencia" | "direccion" | "coordinacion";
export const ROLES: Record<RolId, { nombre: string; orden: number }> = {
  presidencia:    { nombre: "Presidencia",    orden: 0 },
  vicepresidencia:{ nombre: "Vicepresidencia", orden: 1 },
  direccion:      { nombre: "Dirección",      orden: 2 },
  coordinacion:   { nombre: "Coordinación",   orden: 3 },
};

export interface Persona {
  matricula: string;
  nombre: string;
  apodo: string;
  area: string;            // id de área
  rol: RolId;
  correo?: string;
  carrera?: string;
  admin?: boolean;         // permiso total sin ser Presidencia (p. ej. quien mantiene la página)
  pinHash?: string;
  pinSal?: string;
  provisional?: boolean;   // el PIN vigente es el que se repartió, hay que cambiarlo al entrar
  activadoEl?: string;     // cuándo eligió su propio PIN
  ultimoAcceso?: string;
  activo: boolean;
}

export interface Area {
  id: string;
  nombre: string;
  color: string;
  tinta: string;
  emoji: string;
  orden: number;
  director?: string;       // matrícula
}

export const AREAS_BASE: Area[] = [
  { id: "presidencia",  nombre: "Presidencia",             color: "#1C2260", tinta: "#ffffff", emoji: "👑", orden: 0 },
  { id: "proyectos",    nombre: "Proyectos",               color: "#29A3C7", tinta: "#0b3140", emoji: "🎯", orden: 1 },
  { id: "finanzas",     nombre: "Finanzas",                color: "#8BC53F", tinta: "#23400a", emoji: "💰", orden: 2 },
  { id: "comunicacion", nombre: "Comunicación",            color: "#EC4899", tinta: "#4a0f2b", emoji: "📣", orden: 3 },
  { id: "respo",        nombre: "Responsabilidad Social",  color: "#F5C518", tinta: "#4a3a00", emoji: "🤝", orden: 4 },
];

const DIR = process.env.DATA_DIR ?? "/data";
const F_STAFF = path.join(DIR, "staff.json");
const F_AREAS = path.join(DIR, "areas.json");

function leerJSON<T>(f: string, porDefecto: T[]): T[] {
  try { return JSON.parse(fs.readFileSync(f, "utf8")) as T[]; } catch { return porDefecto; }
}
function escribirJSON(f: string, data: unknown): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(f + ".tmp", JSON.stringify(data, null, 1));
  fs.renameSync(f + ".tmp", f);
}

export const leerStaff = (): Persona[] => leerJSON<Persona>(F_STAFF, []);
export const guardarStaff = (l: Persona[]) => escribirJSON(F_STAFF, l);
export const hayStaff = () => fs.existsSync(F_STAFF);
export function leerAreas(): Area[] {
  return leerJSON<Area>(F_AREAS, AREAS_BASE).sort((a, b) => a.orden - b.orden);
}
export const guardarAreas = (l: Area[]) => escribirJSON(F_AREAS, l);

export const normMat = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
export const buscarPersona = (matricula: string, lista = leerStaff()) =>
  lista.find((p) => p.matricula === normMat(matricula));
export const nombreCorto = (p: Persona) => p.apodo?.trim() || p.nombre.split(" ")[0];
/** Personas activas, ordenadas por nombre. */
export const staffActivo = (): Persona[] =>
  leerStaff().filter((p) => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
export const esStaffActivo = (matricula: string) =>
  leerStaff().some((p) => p.activo && p.matricula === normMat(matricula));
/** Iniciales para el avatar: dos letras del apodo o del nombre. */
export function iniciales(p: Persona): string {
  const partes = (p.apodo?.trim() || p.nombre).trim().split(/\s+/);
  const t = partes.length > 1 ? partes[0][0] + partes[1][0] : partes[0].slice(0, 2);
  return t.toUpperCase();
}

/** Área a la que pertenece, con respaldo si el área fue borrada. */
export function areaDe(p: Persona, areas = leerAreas()): Area {
  return areas.find((a) => a.id === p.area) ??
    { id: "", nombre: "Sin área", color: "#6A6F98", tinta: "#ffffff", emoji: "•", orden: 99 };
}

// ---------------- permisos ----------------
export const esPresidencia = (p: Persona) =>
  p.rol === "presidencia" || p.rol === "vicepresidencia" || p.admin === true;
export const dirigeArea = (p: Persona, areaId: string, areas = leerAreas()) =>
  esPresidencia(p) || (p.rol === "direccion" && p.area === areaId) ||
  areas.some((a) => a.id === areaId && a.director === p.matricula);
/** ¿Puede crear o reasignar tareas en algún lado? */
export const puedeAsignar = (p: Persona, areas = leerAreas()) =>
  esPresidencia(p) || p.rol === "direccion" || areas.some((a) => a.director === p.matricula);

// ---------------- PIN ----------------
/** PIN de 4 dígitos, evitando los obvios. */
export function generarPin(): string {
  const feos = new Set(["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999","1234","4321","0123"]);
  for (;;) {
    const p = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    if (!feos.has(p)) return p;
  }
}
const hash = (pin: string, sal: string) =>
  crypto.scryptSync(pin, sal, 32).toString("hex");

export function ponerPin(p: Persona, pin: string, provisional: boolean): void {
  p.pinSal = crypto.randomBytes(12).toString("hex");
  p.pinHash = hash(pin, p.pinSal);
  p.provisional = provisional;
  if (!provisional) p.activadoEl = new Date().toISOString();
}
export function pinCorrecto(p: Persona, pin: string): boolean {
  if (!p.pinHash || !p.pinSal) return false;
  const a = Buffer.from(p.pinHash, "hex");
  const b = Buffer.from(hash(pin, p.pinSal), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------- sesión (cookie firmada) ----------------
const SECRETO = () => process.env.CUENTAS_CLAVE ?? "mind-sin-clave";
const firma = (dato: string) =>
  crypto.createHmac("sha256", SECRETO()).update(dato).digest("base64url").slice(0, 32);

export const COOKIE = "mind_sesion";
const DIAS = 30;

export function crearSesion(matricula: string): string {
  const exp = Date.now() + DIAS * 86400_000;
  const dato = `${matricula}.${exp}`;
  return `${dato}.${firma(dato)}`;
}
export function leerSesion(cookies: string | undefined): string | null {
  const crudo = galleta(cookies, COOKIE);
  if (!crudo) return null;
  const partes = crudo.split(".");
  if (partes.length !== 3) return null;
  const [mat, exp, f] = partes;
  if (firma(`${mat}.${exp}`) !== f) return null;
  if (Number(exp) < Date.now()) return null;
  return mat;
}
export function galleta(cookies: string | undefined, nombre: string): string | null {
  if (!cookies) return null;
  for (const par of cookies.split(";")) {
    const i = par.indexOf("=");
    if (i < 0) continue;
    if (par.slice(0, i).trim() === nombre) return decodeURIComponent(par.slice(i + 1).trim());
  }
  return null;
}
// "Secure" solo cuando la petición viaja por https: en pruebas locales por http
// el navegador (y curl) descartarían la cookie.
export const cookieSesion = (valor: string, seguro: boolean) =>
  `${COOKIE}=${valor}; Path=/; Max-Age=${DIAS * 86400}; HttpOnly; SameSite=Lax${seguro ? "; Secure" : ""}`;
export const cookieBorrar = (seguro: boolean) =>
  `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${seguro ? "; Secure" : ""}`;
