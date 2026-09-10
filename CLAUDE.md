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
- **Prerregistro** (apartar lugar antes del evento): `Evento.prereg` + `/data/preregistros.json`.
  Público `/preregistro/:id` (nombre, matrícula, correo opcional, honeypot) con fecha larga,
  hora, lugar, nota y botón de Google Calendar; `/preregistro/:id/qr`. Admin: botón «Abrir/
  Cerrar prerreg.» por evento (`POST /eventos/prereg`), tarjetas para compartir, lista con
  «asistió» automático, `POST /preregistro/quitar`, `/preregistros.csv`. Las rutas con clave
  van ANTES de `/preregistro/:id`. En «Registrar asistencia desde aquí» los prerregistrados
  del evento salen como casillas (se aceptan sus matrículas aunque no estén en el historial).
- **Tipo de evento «Otro»**: `TIPOS.otro` + `Evento.tipoNombre`. `nombreTipo(e)` da la etiqueta
  visible y `claveTipo(e)` agrupa (`otro:<nombre>` es su propia categoría en filtros y gráficas).
  `TIPOS_FIJOS` = los 4 de siempre; `TIPOS_EVENTO` = todos menos junta.
- Eventos con campos opcionales `hora`, `lugar`, `nota` (se muestran en el formulario público,
  el QR y la tarjeta de prerregistro).
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
## Galería y Juntas (pestañas de Eventos: Eventos · Galería · Juntas)
- Galería (`api/src/galeria.ts`): fotos/videos en `/data/galeria` (volumen) + `galeria.json`;
  ver es PÚBLICO (`/galeria`, `?evento=id` filtra), subir/borrar con clave. Subida multipart
  con multer (`/galeria/subir`, campos `archivo` + `miniatura` jpg, 80 MB); las fotos se
  comprimen en el navegador (1920 px) y la miniatura (480 px) también; para videos el
  navegador captura un fotograma. Enlaces (`/galeria/enlace`): YouTube y Drive se incrustan
  con miniatura; carpetas de Drive solo abren. Archivos servidos en `/galeria/archivo/<nombre>`
  (solo nombres `[a-z0-9]+(_t)?.ext`). Patrón tomado de tap-web (volumen + app).
- Juntas de staff: mismo motor que eventos con `tipo: "junta"` (TIPOS.junta). `/juntas` =
  `renderAdmin(..., "juntas")`: solo juntas, botón «Nueva junta», «Pasar lista» con el roster
  de staff, ranking con % de asistencia. Todo registro en una junta es staff (`registrar`
  fuerza `staff:true`; el formulario público no pregunta). La pestaña Eventos excluye
  juntas (`TIPOS_EVENTO`); las acciones llevan `&volver=juntas` para regresar a /juntas.
  `/eventos.csv?solo=juntas`. El Panel tiene bloque «Juntas de staff» (% del staff conocido).

## Portal de tareas (staff con PIN)
- **El repositorio es PÚBLICO**: ningún dato personal (nombres completos, correos,
  teléfonos, PIN) puede ir a git. Todo eso vive solo en el volumen: `staff.json`,
  `areas.json`, `tareas.json`, `semanas.json`, `notion.json` y `tareas/` (evidencias).
- `api/src/staff.ts`: personas, áreas y acceso. PIN de 4 dígitos con scrypt y sal por
  persona; sesión en cookie firmada con HMAC de `CUENTAS_CLAVE` (30 días, HttpOnly,
  Secure solo si la petición viene por https). Roles: presidencia, vicepresidencia,
  dirección, coordinación; `admin: true` da permiso total sin cambiar el área (lo usa
  quien mantiene la página). Áreas base: presidencia, proyectos, finanzas, comunicacion, respo.
- `api/src/tareas.ts`: modelo (área, asignados, vigencia fechas|transversal|evento,
  estado pendiente|curso|hecha|vencida, evidencia) y semanas. `api/src/portal.ts`: pantallas.
- Rutas: `/portal` (entrar y mis tareas), `/tareas` (tablero, solo quien asigna),
  `/tareas/semana` (lámina en canvas, PNG descargable), `/tareas/cerrar-semana`
  (arrastrar o vencer), `/tareas/equipo` (presidencia: PIN y directores).
- **Una sola lista de staff** (`staff.json`): Eventos/Juntas toman de ahí el roster para pasar
  lista y muestran a TODO el staff en el ranking aunque tenga cero; quien es staff activo
  queda como staff al registrarse aunque marque «vengo al evento». Equipo edita área/rol/
  admin/activo (a uno mismo solo el área), da de alta con PIN y crea/borra áreas (sus tareas
  y personas quedan «sin área», no se pierden).
- **Acceso unificado**: `acceso(req)` = clave `?clave=` O sesión del portal de nivel
  presidencia. Los enlaces se arman con `conClave(clave)` → `?clave=X` o `?via=portal`
  (así los `&id=` concatenados siguen funcionando). `claveDe(req)` devuelve "" en modo sesión.
- **Tablero visual** (`/tareas`): kanban por área con pool de fichas arrastrables (tap para
  celular), alta rápida por columna, mover entre columnas = cambiar área, hoja de detalle.
  Todo vía API JSON con sesión: `POST /api/tareas`, `PATCH /api/tareas/:id` (titulo, detalle,
  area, asignados, estado, vigencia, posponer), `DELETE /api/tareas/:id`. `/tareas/lista` es
  la vista de lista con formularios completos (evidencia).
- **Mis tareas** (`/portal?mes=YYYY-MM`): el calendario también pinta EVENTOS y JUNTAS del mes
  como franjas con el color de su tipo y un contador de tareas ligadas; al tocarlas se abre la
  hoja con esas tareas, su estado, área y las fichas de quién las lleva (lo tuyo va marcado).
  `eventosLite()` en index.ts es quien manda tipo, color, emoji, hora, lugar y prereg al portal.
- **Mis tareas** (continúa): calendario mensual con barras por rango, banda
  «Siempre» para transversales y hoja inferior con acciones; pestaña Lista secundaria.
- **Editar eventos**: `POST /eventos/editar` cambia título, fecha, hora, lugar y nota de un
  evento ya creado, con formulario desplegable en su fila. La bandera `porConfirmar` marca
  fecha y lugar como tentativos: `fechaAnuncio()` y `lugarAnuncio()` lo dicen en el formulario
  público, el prerregistro, el QR y el calendario. Si se mueve la fecha y ya hay gente
  registrada o prerregistrada, el aviso lo recuerda para que les avisen.
- **Transversales = recurrentes**: marcarlas hechas apunta una vuelta en `t.vueltas`
  ({semana, ts, por}, una por semana) y al abrir el portal en una semana nueva
  `refrescarRecurrentes()` las reabre solas. Nunca se cierran para siempre.
- **Tardías**: se pueden marcar hechas después de su fecha y cuentan igual; se ve la
  etiqueta «hecha tarde» y solo se pierde el bono de puntualidad, que exige fecha real.
- **Evidencia**: `POST /tareas/evidencia/quitar` (borra también el archivo del disco) y
  `/tareas/evidencia/mover` (a otra tarea). Puede quien la subió o quien dirige el área.
- **MIND Awards** (`api/src/awards.ts`, `/tareas/awards?periodo=todo|mes|semana&orden=puntos|tareas|cumple|tiempo|juntas|eventos`): ranking que
  cruza tareas hechas, puntualidad y asistencia a eventos y juntas. Puntos: 10 por tarea hecha,
  +3 si se cerró antes de su fecha o de su evento, 5 por junta y 8 por evento; nada resta. Las
  tareas de TODOS no suman a nadie. Medallas por categoría (empates comparten). Lo ve todo el
  staff con sesión y tiene descarga en PNG como la lámina.
- Notion (`api/src/notion.ts`, token en `NOTION_TOKEN`): `POST /admin/notion/importar`
  con `modo=aplicar` trae Directorio, tareas abiertas y agenda futura del semestre
  AD 2026; sin `modo=aplicar` es un ENSAYO que no escribe nada. El espejo vive en una
  página propia ("Portal MIND (espejo)") creada bajo el semestre: NUNCA se escribe en
  las bases del grupo. Los tokens personales de Notion no pueden listar usuarios, así
  que los responsables se casan por nombre contra el Directorio.
- Los ids de las bases de Notion están en `BASES_POR_DEFECTO` y se pueden sustituir
  escribiendo `/data/notion.json` sin tocar código (útil al cambiar de semestre).

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
