// Catálogo de la tienda MIND. Los precios viven SOLO en el servidor (el cliente
// nunca manda precios). Centavos MXN.
// El catálogo base va en git; desde /admin se edita (precios, altas, bajas) y la
// versión editada se guarda en el disco persistente (/data/productos.json), que
// sustituye por completo a la base mientras exista.
import fs from "node:fs";
import path from "node:path";

export interface Product {
  id: string;
  nombre: string;
  descripcion: string;
  precioCentavos: number;
  emoji?: string;        // ícono para productos nuevos (los base tienen SVG en la app)
  disponible?: boolean;  // false = oculto en la tienda sin perder su historial
  orden?: number;
}

export const PRODUCTOS_BASE: Product[] = [
  {
    id: "fidget-omega",
    nombre: "Fidget Omega MIND",
    descripcion: "Fidget hexagonal print-in-place con la palabra MIND en relieve. Dos colores, ~6x7 cm.",
    precioCentavos: 5000,
  },
  {
    id: "spinner-engranes",
    nombre: "Spinner de Engranajes",
    descripcion: "Spinner de 4 engranajes que se arma sin baleros. Gigante y muy satisfactorio (~13 cm).",
    precioCentavos: 10000,
  },
  {
    id: "cubito",
    nombre: "Cubito Fidget",
    descripcion: "El clásico cubito para manos inquietas.",
    precioCentavos: 7000,
  },
  {
    id: "pelota-antiestres",
    nombre: "Pelota antiestrés",
    descripcion: "Suave, para apretar y soltar el estrés.",
    precioCentavos: 2000,
  },
  {
    id: "squishy",
    nombre: "Squishy",
    descripcion: "Blandito y satisfactorio de apretar.",
    precioCentavos: 1000,
  },
  {
    id: "popit",
    nombre: "Pop-it",
    descripcion: "Burbujas para tronar una y otra vez.",
    precioCentavos: 1000,
  },
  {
    id: "stickers",
    nombre: "Stickers",
    descripcion: "Calcomanías para decorar lo que quieras.",
    precioCentavos: 1000,
  },
  {
    id: "clicker-3d",
    nombre: "Clicker 3D",
    descripcion: "Clic-clic impreso en 3D para manos inquietas.",
    precioCentavos: 1000,
    emoji: "🔘",
  },
  {
    id: "fidget-switch-3d",
    nombre: "Fidget Switch 3D",
    descripcion: "Interruptor fidget impreso en 3D: sube, baja, repite.",
    precioCentavos: 2000,
    emoji: "🎚️",
  },
];

const DIR = process.env.DATA_DIR ?? "/data";
const ARCHIVO = path.join(DIR, "productos.json");

export const hayCatalogoEditado = (): boolean => fs.existsSync(ARCHIVO);

function esProducto(p: unknown): p is Product {
  const o = p as Record<string, unknown> | null;
  return Boolean(o) && typeof o!.id === "string" && typeof o!.nombre === "string"
    && typeof o!.precioCentavos === "number";
}

/** Catálogo completo (incluye ocultos), ordenado por `orden` y luego por alta. */
export function catalogo(): Product[] {
  let lista = PRODUCTOS_BASE;
  if (fs.existsSync(ARCHIVO)) {
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
      if (Array.isArray(raw)) lista = raw.filter(esProducto);
    } catch (err) {
      console.error("productos.json ilegible; uso el catálogo base", err);
    }
  }
  return lista.map((p, i) => ({ ...p, descripcion: p.descripcion ?? "", orden: p.orden ?? i }))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));   // sort es estable: empates por alta
}

/** Lo que ve la tienda: solo disponibles y sin campos internos. */
export function catalogoPublico() {
  return catalogo().filter((p) => p.disponible !== false)
    .map(({ id, nombre, descripcion, precioCentavos, emoji }) =>
      ({ id, nombre, descripcion, precioCentavos, ...(emoji ? { emoji } : {}) }));
}

export const byId = (id: string) => catalogoPublico().find((p) => p.id === id);

function escribir(lista: Product[]): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(ARCHIVO + ".tmp", JSON.stringify(lista, null, 1));
  fs.renameSync(ARCHIVO + ".tmp", ARCHIVO);
}

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
   .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "producto";

/** Crea o actualiza (por id). Devuelve el producto guardado y si fue alta. */
export function guardarProducto(p: Omit<Product, "id"> & { id?: string })
    : { producto: Product; nuevo: boolean } {
  const lista = catalogo();
  const i = p.id ? lista.findIndex((x) => x.id === p.id) : -1;
  if (i >= 0) {
    lista[i] = { ...lista[i], ...p, id: lista[i].id };
    escribir(lista);
    return { producto: lista[i], nuevo: false };
  }
  const base = slug(p.id || p.nombre);
  let id = base;
  for (let n = 2; lista.some((x) => x.id === id); n++) id = `${base}-${n}`;
  const nuevo: Product = { ...p, id, orden: p.orden ?? lista.length };
  lista.push(nuevo);
  escribir(lista);
  return { producto: nuevo, nuevo: true };
}

export function borrarProducto(id: string): Product | null {
  const lista = catalogo();
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [quitado] = lista.splice(i, 1);
  escribir(lista);
  return quitado;
}

/** Vuelve al catálogo base del repo (borra la versión editada). */
export function restaurarCatalogo(): void {
  if (fs.existsSync(ARCHIVO)) fs.unlinkSync(ARCHIVO);
}
