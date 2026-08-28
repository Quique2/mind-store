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

## Cuentas del grupo
- `cuentas/movimientos.csv` — libro de efectivo y Revolut/SPEI (historial auditable
  en git: cada peso queda con fecha, autor y diff). Una fila por movimiento.
- `/cuentas?clave=...` — estado de cuenta (saldos, totales por evento, movimientos);
  `/cuentas.csv?clave=...` — el mismo dato como CSV. Clave en `CUENTAS_CLAVE`.
- Stripe NO se copia al CSV: la página lo consulta en vivo (caché 10 min) y solo
  cuenta cargos desde `DESDE_TIENDA` (2026-08-24, lanzamiento) — la cuenta tiene
  cargos previos que no son ventas de MIND.
- Routine semanal "Cuentas MIND" (lunes 9:00 MX) revisa la página y reporta.

## Desarrollo
```
npm install
npm run dev:api          # API en :3000
npm run dev:app          # Expo web (define EXPO_PUBLIC_API_URL=http://localhost:3000)
```

## Precios actuales (definidos por el grupo, agosto 2026)
- Fidget Omega MIND: $50 MXN
- Spinner de Engranajes: $100 MXN
- Cubito Fidget: $70 MXN
- Pelota antiestrés: $20 MXN
- Squishy / Pop-it / Stickers: $10 MXN c/u
