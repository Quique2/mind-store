# Tienda MIND

Tienda web del grupo estudiantil MIND (impresión 3D · neurodiversidad · MTY).

## Stack
- `app/`: Expo 54 + expo-router 6, solo web (`web.output: single`), StyleSheet plano
  con tema en `constants/theme.ts` (estilo NEUROFEST: teal→azul, blanco, multicolor).
- `api/`: Express + Stripe Checkout + zod. El catálogo y los PRECIOS viven en
  `api/src/products.ts` — el cliente nunca manda precios.
- Deploy: Railway con Dockerfile único (API sirve el export web en el mismo puerto).

## Flujos de pago
- **Transferencia SPEI (principal)**: directo a la cuenta bancaria, al instante y
  sin comisiones. La tienda muestra la CLABE (de `/api/config`) y el comprador
  confirma por WhatsApp. Sin CLABE configurada, la opción no aparece.
- Tarjeta (opcional): `POST /api/checkout` crea una Checkout Session de Stripe.
  Sin `STRIPE_SECRET_KEY`, el botón no aparece.
- Efectivo: botón "Apartar" abre WhatsApp con el resumen del pedido.

## Variables de entorno (Railway → Variables)
- `SPEI_CLABE` — opcional: sustituye la CLABE por defecto del grupo
  (`646990404076302792`, verificada con el dígito de control de Banxico).
- `SPEI_BANCO`, `SPEI_TITULAR` — opcionales, se muestran junto a la CLABE.
- `STRIPE_SECRET_KEY` — opcional, activa pago con tarjeta (clave restringida;
  las claves secretas NUNCA van en el repo, solo en Railway).
- `PUBLIC_URL` — URL pública del deploy (para success/cancel de Stripe).

## Cuentas del grupo (ingresos y gastos)
- Modelo `Mov` en `api/src/cuentas.ts`: `tipo` ingreso|gasto (monto siempre positivo,
  `signo()` da el signo), `evento`, `concepto`, `ref` ("disco:<línea>" o "stripe:<cargo>";
  sin ref = fila de git, no editable desde la página). Evento `inicial` = capital: suma
  al saldo pero NO es venta (no entra a "ventas por producto").
- `cuentas/movimientos.csv` (git): historial auditable; columnas
  `fecha,evento,metodo,concepto,monto_mxn,detalle,tipo`, CSV con comillas (los conceptos
  pueden llevar comas). El efectivo de REDSPOT va desglosado por producto (día 1 de las
  notas del grupo = 770 exactos). `/data/movimientos.csv` = capturado en la página.
- Stripe EN VIVO (caché 10 min de los cargos, no de los conceptos): cada cobro es un
  ingreso y su comisión un GASTO "Comisión Stripe". Evento/concepto por cargo en
  `cuentas/stripe_conceptos.json` (git, semilla) + `/data/stripe_conceptos.json` (disco,
  editado desde la página con «Editar»). Solo cuenta desde `DESDE_TIENDA` (2026-08-24).
- Página `/cuentas?clave=...`: botón Ingreso/Gasto, chips de productos (del catálogo) o de
  gastos, desplegable de evento (eventos registrados en /eventos + usados + "ventas" +
  capital + Otro…), «Editar» en cobros Stripe y filas del disco, ✕ solo en filas del disco.
  Rutas: `/cuentas/nuevo`, `/cuentas/editar` (ref), `/cuentas/borrar` (idx), `/cuentas.csv`.
- Routine semanal "Cuentas MIND" (lunes 9:00 MX) revisa la página y reporta.

## Asistencia a eventos
- Sustituye a Google Forms: `api/src/eventos.ts` guarda `/data/eventos.json` y
  `/data/asistencias.json` (mismo volumen que cuentas). Sin API externa ni OAuth.
- `/eventos?clave=...` (misma `CUENTAS_CLAVE`): un botón por tipo (Happy Midweek,
  Stand, NeurArt, NeuroCharla) crea el evento y su enlace público; cada fila trae
  WhatsApp / Copiar / QR / Cerrar. Filtros por nombre-matrícula, tipo y evento con
  ranking de quién más asiste. `/eventos.csv?clave=...` exporta todo (abre en Sheets).
- `/asistencia/:id` — formulario público (nombre + matrícula); una matrícula solo
  cuenta una vez por evento; honeypot `sitio` contra bots. `/asistencia/:id/qr`
  muestra el QR para proyectar o imprimir.
- Campo `staff` en la asistencia (radio en el formulario; registros sin el campo =
  asistente normal). Eventos, CSV y Panel cuentan al staff aparte (no infla
  asistencia ni ranking); filtro "Solo asistentes / Solo staff / ambos" en /eventos.
- Borrar evento: `GET /eventos/borrar?id=` muestra la pantalla "¿Estás seguro?";
  `POST /eventos/borrar` con `confirmar=si` borra el evento y sus asistencias.
  Doble clic al crear: el formulario se bloquea y `crearEvento` devuelve el evento
  idéntico creado en los últimos 2 min en vez de duplicarlo.
- Gestión desde /eventos: `POST /asistencia/staff` (persona → staff/asistente en TODOS
  sus registros), `POST /asistencia/quitar` (un registro; sin registros la persona
  desaparece, no hay tabla de personas) y `POST /asistencia/manual` (captura desde el
  panel: roster de staff palomeable + "otra persona"; funciona con evento cerrado).
  Esas tres rutas van ANTES de `/asistencia/:id` o el id se las come.
- Las tablas dinámicas del panel usan <thead>/<tbody> explícitos: insertar <tr> en
  <table> crea un tbody por fila y las filas se duplican al filtrar (bug 2026-09-02).
- Las rutas nuevas van SIEMPRE antes del `app.get("*")` del SPA.

## Panel ejecutivo y catálogo editable
- `/admin?clave=...` (`api/src/admin.ts`): KPIs + 7 gráficas (Chart.js desde cdnjs):
  ingresos por semana por método, saldo acumulado, recaudado por evento, ventas por
  producto (el concepto capturado se mapea al catálogo por nombre/alias), asistencia
  por evento, por tipo, nuevos vs recurrentes; ranking de asistentes, últimos
  movimientos y eventos recientes. Todo se calcula en el servidor (`calcular`).
- Catálogo: `PRODUCTOS_BASE` en `api/src/products.ts` es el de git; al editar desde
  /admin se escribe `/data/productos.json` y ESE manda (precios, altas, bajas, ocultar,
  orden, emoji para productos sin ícono SVG en la app). `catalogoPublico()` es lo que
  ve la tienda y el checkout; `/admin/productos/restaurar` vuelve al de git.
- Los botones rápidos de /cuentas se generan del catálogo. Navegación común
  Panel · Cuentas · Eventos en `api/src/ui.ts`.
## Desarrollo
```
npm install
npm run dev:api          # API en :3000
npm run dev:app          # Expo web (define EXPO_PUBLIC_API_URL=http://localhost:3000)
```

## Precios base (definidos por el grupo, agosto 2026; los vigentes se editan en /admin)
- Fidget Omega MIND: $50 MXN
- Spinner de Engranajes: $100 MXN
- Cubito Fidget: $70 MXN
- Pelota antiestrés: $20 MXN
- Squishy / Pop-it / Stickers / Clicker 3D: $10 MXN c/u
- Fidget Switch 3D: $20 MXN (los del grupo agregaron también Squishy Animalito $50 y Bolita Spinner 3D $125 desde /admin)
