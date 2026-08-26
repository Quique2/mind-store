// Catálogo de la tienda MIND. Los precios viven SOLO aquí (el cliente nunca
// manda precios). Centavos MXN.
export interface Product {
  id: string;
  nombre: string;
  descripcion: string;
  precioCentavos: number;
}

export const PRODUCTS: Product[] = [
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
];

export const byId = (id: string): Product | undefined =>
  PRODUCTS.find((p) => p.id === id);
