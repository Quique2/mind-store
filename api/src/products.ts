// Catálogo de la tienda MIND. Los precios viven SOLO aquí (el cliente nunca
// manda precios). Centavos MXN. Costos calculados con slicing real en K2 Plus:
// fidget ~85 g / 2h40m -> costo ~$78; spinner ~44 g / 2h31m + ensamble -> ~$66.
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
    precioCentavos: 17900,
  },
  {
    id: "spinner-engranes",
    nombre: "Spinner de Engranajes",
    descripcion: "Spinner de 4 engranajes que se arma sin baleros. Gigante y muy satisfactorio (~13 cm).",
    precioCentavos: 14900,
  },
];

export const byId = (id: string): Product | undefined =>
  PRODUCTS.find((p) => p.id === id);
