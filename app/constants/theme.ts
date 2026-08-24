// Tema MIND (estilo NEUROFEST): degradado teal->azul, blanco, puntos multicolor.
export const Colors = {
  teal: "#29A3C7",
  azul: "#2E4BC6",
  profundo: "#232D93",
  crema: "#F5EFD8",
  blanco: "#FFFFFF",
  tinta: "#1C2260",
  pastilla: "rgba(79,179,217,0.4)",
  borde: "rgba(255,255,255,0.45)",
  lima: "#8BC53F",
  amarillo: "#F5C518",
  rosa: "#EC4899",
  magenta: "#C026D3",
  cian: "#22B8CF",
};

export const spacing = { xs: 6, s: 10, m: 16, l: 24, xl: 32 } as const;
export const radius = { s: 12, m: 18, l: 24, pill: 999 } as const;

export const formatoMXN = (centavos: number): string =>
  `$${(centavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 0 })} MXN`;
