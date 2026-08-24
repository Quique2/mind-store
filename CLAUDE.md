# Tienda MIND

Tienda web del grupo estudiantil MIND (impresión 3D · neurodiversidad · MTY).

## Stack
- `app/`: Expo 54 + expo-router 6, solo web (`web.output: single`), StyleSheet plano
  con tema en `constants/theme.ts` (estilo NEUROFEST: teal→azul, blanco, multicolor).
- `api/`: Express + Stripe Checkout + zod. El catálogo y los PRECIOS viven en
  `api/src/products.ts` — el cliente nunca manda precios.
- Deploy: Railway con Dockerfile único (API sirve el export web en el mismo puerto).

## Flujos de pago
- Tarjeta: `POST /api/checkout` crea una Checkout Session de Stripe y redirige.
  Sin `STRIPE_SECRET_KEY` responde 503 y la tienda sigue funcionando con WhatsApp.
- Efectivo: botón "Apartar" abre WhatsApp con el resumen del pedido.

## Variables de entorno (Railway → Variables; NUNCA en el repo)
- `STRIPE_SECRET_KEY` — clave secreta de Stripe (usa una clave restringida).
- `PUBLIC_URL` — URL pública del deploy (para success/cancel de Stripe).

## Desarrollo
```
npm install
npm run dev:api          # API en :3000
npm run dev:app          # Expo web (define EXPO_PUBLIC_API_URL=http://localhost:3000)
```

## Precios actuales (calculados con slicing real en K2 Plus, agosto 2026)
- Fidget Omega MIND: $179 MXN (costo ≈ $78: 85 g PLA + 2h40m + mano de obra)
- Spinner de Engranajes: $149 MXN (costo ≈ $66: 44 g PLA + 2h31m + ensamble)
