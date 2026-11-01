# Rendimiento y pruebas de carga

Resultados de la fase 12 (31 de octubre de 2026). Todas las metas se cumplen. Dos cosas se
corrigieron por el camino: la búsqueda con prefijos cortos y el peso de la página pública.

## Resumen

| Meta | Resultado | |
|---|---|---|
| Búsqueda < 150 ms | p95 **67 ms** en la base (3 millones de estrellas) | Cumplida |
| Procesar 50.000 comentarios < 2 min | **45 s** | Cumplida |
| Generar archivos < 2 min | **41 s** todo el cielo; **5 s** un día normal | Cumplida |
| Lighthouse en celular ≥ 85 | **85** con el cielo real y **86** con 3 millones (mediana de 5) | Cumplida |
| Peso de una visita típica | **0,8 MB** hoy y **1,3 MB** con 3 millones | Medido |

## Cómo se midió

- **Base de prueba:** copia local con Postgres 17, la misma versión que usa Supabase, en UTF-8.
  - Tiene 3.000.000 de estrellas en 10.000 constelaciones, con 300 días, invitaciones (15%) y
    días comentados.
  - Las posiciones salen del motor real del cielo.
  - Ocupa **2,4 GB**: estrellas 1,3 GB, días comentados 0,8 GB y posiciones 0,24 GB. Coincide con
    la estimación de 1,5 a 2 GB del documento de producto, más el espacio que dejan las
    actualizaciones.
  - El proyecto real de Supabase no se tocó: el plan gratis tiene 500 MB.
- **Código:** se usa el código real de importación, procesamiento y publicación. Las llamadas
  REST de supabase-js las responde un adaptador local
  (`scripts/load-test/rest-adapter.ts`) que ejecuta el mismo SQL con el rol `service_role`, en
  vez de PostgREST.
- **Comandos:**
  - `npm run load-test -- --setup` crea la copia (unos 12 minutos).
  - `npm run load-test -- --measure` mide y guarda `scripts/output/load-test.json`.
  - `npm run load-test -- --remove` la borra (ocupa unos 2,5 GB en `.cache/`).
- **Página:** `npm run measure:visit` sobre la compilación de producción (`npm start -- -p 3300`).
  - Recorre una visita típica en un Pixel 7 emulado y corre Lighthouse 5 veces con el perfil de
    celular (4G lento y CPU 4 veces más lenta).
  - Con el cielo falso de 3 millones: compilar con
    `MSYS_NO_PATHCONV=1 NEXT_PUBLIC_SKY_FILES_URL=/dev-sky npm run build`.
- **Equipo:** Windows 11, 14 núcleos, 16 GB. Supabase Pro usa máquinas más chicas; ver "Riesgos".

## Búsqueda

Son 240 búsquedas con el rol público, como las hace la página. Los tiempos están medidos en la
conexión con la base.

| Tipo | p50 | p95 |
|---|---|---|
| Prefijo corto (3 letras) | 2 ms | 4 ms |
| Prefijo (4 a 6 letras) | 2 ms | 3 ms |
| Nombre completo | 54 ms | 71 ms |
| Con un error de escritura | 21 ms | 38 ms |
| **Todas** | **7 ms** | **67 ms** |

**Corregido.** La primera versión tardaba **380 ms** con prefijos cortos.
- **Por qué:** un prefijo como "mar" coincide con decenas de miles de nombres, y la función los
  ordenaba todos antes de quedarse con 8.
- **La migración `20261107000001_search_speed.sql`:**
  - agrega un índice ordenado (orden de bytes) y toma solo los primeros 200 nombres que coinciden
    para ordenarlos;
  - solo busca nombres parecidos si con el prefijo no se llenaron los 8 resultados.
- **Ya está aplicada en Supabase.** Con los nombres de prueba, que empiezan todos por `prueba_`,
  la búsqueda real pasó de 373 ms a **119 ms**, contando la red. Una llamada vacía tarda 114 ms
  desde Costa Rica hasta Supabase en EE. UU., así que la base aporta unos 5 ms.
- **Lo que siente la persona:** la red (unos 110 ms) más la base (2 a 70 ms). El buscador además
  espera 200 ms después de la última tecla.

## Procesamiento de un día grande

Son 50.000 comentarios: 30.000 de personas que ya tenían estrella, 20.000 nuevas y 2.000
invitaciones.

| Paso | Tiempo |
|---|---|
| Importar (guardar en `comment_inbox`) | 1,7 s |
| Procesar (13 tandas de 4.000) | 45 s |
| Tanda más lenta | 4,1 s (el límite de Supabase para una llamada es 8 s) |
| Constelaciones completadas y abiertas | 66 |

## Generación de archivos

| Caso | Archivos | Tiempo |
|---|---|---|
| Todo el cielo (primera publicación o reconstrucción) | 10.001 constelaciones, índice e imagen | 41 s |
| Después del día de 50.000 comentarios | 836 constelaciones (las de quienes regresaron cambian de nivel) | 5,2 s |

- **Tamaños:** cada archivo de constelación pesa unos 12 KB (5 KB comprimido). El índice con
  10.000 constelaciones pesa 475 KB (119 KB comprimido) y la imagen de la espiral 160 KB.
- **Subida:** el tiempo medido escribe en disco. En producción se suma la subida a Supabase
  Storage. Con 8 subidas a la vez, 836 archivos toman unos 15 a 30 segundos más, y siguen dentro
  de la meta.

## Lighthouse en celular

| Cielo | Mediana | Las 5 corridas | LCP | TBT | CLS |
|---|---|---|---|---|---|
| Real (Supabase) | **85** | 55, 87, 85, 80, 87 | 2,9 s | 390 ms | 0 |
| 3 millones (falso) | **86** | 52, 86, 87, 86, 87 | 2,9 s | 390 ms | 0 |

- La primera corrida sale siempre baja (52 a 55): Chrome recién abierto prepara WebGL. Las demás
  quedan entre 80 y 87.
- **Corregido: 81 → 85.**
  - La página pública cargaba la librería completa de Supabase solo para buscar y abrir la
    tarjeta, y el 91% no se usaba. Ahora usa dos llamadas `fetch` directas
    (`src/lib/sky-api.ts`): 61 KB menos de JavaScript.
  - El mapa arranca en pasos cortos (`yieldToMain` en `src/map/sky-map.ts`) en vez de bloques
    de 150 ms.
- **Lo que queda:**
  - El elemento LCP es el título "Constelaciones". Llega a 2,9 s en la simulación de 4G lento,
    porque compite con la descarga de React (230 KB) y de PixiJS.
  - Las tareas largas que quedan son la hidratación de React y la creación del contexto WebGL.
- **Si hiciera falta más margen, en orden de impacto:**
  1. Cargar el mapa después de que la página quede interactiva (`requestIdleCallback`).
  2. Usar `display: "optional"` en la tipografía del título.
  3. Generar el atlas de texturas en un Worker.

## Peso de una visita y transferencia al mes

Una visita típica en un celular: entrar, buscar una estrella y abrir la vista 3D. Se midió sin
caché, el peor caso.

| Paso | Cielo real | 3 millones |
|---|---|---|
| Entrar | 487 KB | 604 KB |
| Buscar y abrir su estrella | 209 KB | 550 KB (el viaje cruza muchas constelaciones) |
| Abrir la vista 3D | 135 KB | 135 KB |
| **Total** | **831 KB** | **1.289 KB** |

**De dónde sale, con 3 millones:**
- **Vercel** sirve 600 KB: JavaScript 455 KB, fuentes 136 KB y la página.
- **Supabase Storage** sirve 690 KB: archivos del cielo e imagen. Llegan comprimidos con brotli y
  en la caché de su CDN.

**Estimación con 100.000 visitas al mes, todas como primera visita (peor caso):**

| Servicio | Por visita | 100.000 visitas | Plan |
|---|---|---|---|
| Supabase Storage | 0,69 MB | **69 GB** | Supera los 5 GB del plan gratis. Cabe en Pro (250 GB) |
| Vercel | 0,60 MB | **60 GB** | Cabe en los 100 GB del plan Hobby |

- Las personas que regresan descargan mucho menos: los archivos con versión se guardan un año en
  su celular.
- Con 30.000 a 50.000 visitas al mes, el plan gratis de Supabase ya no alcanza. Esto confirma el
  plan del documento de producto: pasar a Pro al lanzar.
- Si la transferencia se encarece, los archivos se pueden mover a Cloudflare R2, que no cobra
  transferencia, cambiando solo `src/server/storage.ts`.

## Riesgos y plan

- **Máquina de Supabase:**
  - **El riesgo:** las medidas se hicieron en un equipo con 16 GB. Con 3 millones de estrellas,
    la base (2,4 GB) no cabe en la memoria de las máquinas chicas de Supabase (Micro: 1 GB), y
    las tandas de procesamiento podrían acercarse a los 8 s.
  - **El plan:**
    - pasar a **Small** (2 GB) o más al superar 1 millón de estrellas;
    - si una tanda se acerca al límite, bajar `BATCH_SIZE` de 4.000 a 2.000
      (`src/server/processing.ts`). El procesamiento sigue igual, solo hace más llamadas.
- **Espacio:** 2,4 GB con 3 millones caben en los 8 GB de Pro. El espacio que dejan las
  actualizaciones se recupera solo con el autovacuum de Supabase.
- **Republicar todo:** se publica en 41 s más la subida de unos 10.000 archivos, varios minutos
  en total. Solo pasa en la primera publicación o si se reconstruye el cielo. La tarea de cada
  hora solo republica lo que cambió.
