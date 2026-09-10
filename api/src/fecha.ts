// Los días se cuentan en hora de Monterrey: el contenedor corre con TZ=America/Monterrey
// (ver Dockerfile). Un timestamp ISO siempre viene en UTC, así que cortarlo con
// slice(0, 10) da el día equivocado después de las 6 pm; por eso todo pasa por aquí.

/** Día local (AAAA-MM-DD) de un instante: timestamp ISO, milisegundos o Date. */
export const diaLocal = (t: string | number | Date = new Date()): string =>
  new Date(t).toLocaleDateString("sv-SE");

/** Si ya es una fecha AAAA-MM-DD la deja igual (new Date("2026-09-10") sería medianoche
 *  UTC y en Monterrey caería el día 9); si trae hora, la convierte a día local. */
export const aDia = (s: string): string => (s.length <= 10 ? s : diaLocal(s));
