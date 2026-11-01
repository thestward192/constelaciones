# Progreso

Estado de las fases del plan (`docs/constelaciones-implementacion.md`, sección 6).
Al terminar cada fase se marcan sus tareas con `[x]` y se agrega un resumen corto.

**Siguiente fase:** Fase 8 — Postal

## Fase 0 — Preparación del proyecto

- [x] Crear app Next.js con TypeScript, ESLint y Prettier.
- [x] Crear la estructura de carpetas de la sección 1.2.
- [x] Crear `CLAUDE.md` con: resumen del proyecto, reglas de la sección 0.2, comandos útiles y enlaces a `docs/`.
- [x] Crear `PROGRESO.md` con todas las fases y tareas de este documento.
- [x] Crear `.env.example` con: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `CRON_SECRET`, `IG_APP_ID`, `IG_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_USER_ID`.
- [x] Cargar las fuentes (Cormorant Garamond, IBM Plex Sans, IBM Plex Mono) y crear los tokens de color del documento de diseño.
- [x] Configurar Vitest y Playwright.
- [x] Iniciar git y primer commit.

**Resumen:** Next.js 16.4.3 + React 19.3 + TypeScript con ESLint y Prettier, versiones fijas. Carpetas de la sección 1.2 creadas y documentos copiados a `docs/` (el prototipo es la versión con vista 3D). Fuentes Cormorant Garamond, IBM Plex Sans e IBM Plex Mono servidas por `next/font`; tokens de color en `src/app/globals.css`. Vitest (prueba de tokens) y Playwright (página de inicio en escritorio y celular) en verde. Página de inicio provisional oscura con el nombre del proyecto.

## Fase 1 — Base de datos

- [x] Migraciones SQL con el modelo de la sección 3 (ajustado si hace falta).
- [x] Políticas RLS: público solo lectura de lo indicado; escrituras solo con clave de servicio.
- [x] Función `search_stars(q text)`: coincidencia por prefijo primero, luego por similitud (`pg_trgm`); máximo 8 resultados; excluye estrellas en revisión.
- [x] Semilla de `figures`: al menos 12 figuras hechas a mano para empezar (colibrí, volcán, perezoso, tucán, ola, carreta, guitarra, mariposa, rana, colibrí en vuelo, palma, luna), más las 2 del prototipo.
- [x] Semilla de `planets` con nombres y umbrales.
- [x] Semilla de `blocked_words` en español (lista inicial; la dueña puede ampliarla).
- [x] Cliente de Supabase en `/src/server` (servidor con clave de servicio, navegador con clave pública).

**Resumen:** Tres migraciones en `supabase/migrations` (esquema, seguridad, búsqueda) aplicadas en Supabase con `npm run db:migrate`. Ajustes al borrador: tabla `shooting_stars` para guardar el sorteo, `days.shooting_drawn_at`, `figures.slug`, restricciones de datos (usuario normalizado, estados, tipos de reto), índices de prefijo y por día, función `star_level()`, `pg_trgm` en el esquema `extensions`. RLS en todas las tablas: el público solo lee `sky_state`, columnas públicas de `days` y llama a `search_stars`. Semillas: 14 figuras (12 de la lista, con colibrí y volcán del prototipo, más quetzal y tortuga), 8 planetas, palabras bloqueadas. Clientes en `src/server/supabase`. Pruebas: 48 locales (PGlite) y 15 contra el proyecto real (`npm run test:remote`).

## Fase 2 — Motor del cielo (lógica pura)

- [x] Normalización de usuarios y extracción de menciones (`@usuario`) de un texto.
- [x] Cálculo de nivel, días para el siguiente nivel y anillos.
- [x] Posición de la constelación `n` en la espiral (sección 5) y radio de órbita de cada planeta.
- [x] Generación de las 300 posiciones de una constelación a partir de una figura y una semilla.
- [x] Generador aleatorio con semilla (reproducible).
- [x] Pruebas unitarias de todo lo anterior, incluyendo: misma semilla → mismo resultado; constelaciones vecinas no se superponen en las primeras 10.000.

**Resumen:** Motor del cielo en `src/sky` (funciones puras): generador con semilla (`random.ts`), usuarios y menciones (`username.ts`), niveles, días para el siguiente y anillos (`levels.ts`), espiral dorada con k = 400 y radio de constelación 300, colocación con rotación (±30°) y escala por semilla, órbitas de planetas (`geometry.ts`), elección y variación de figuras (`figures.ts`) y las 300 posiciones (anclas + líneas + halo, barajadas, sin estrellas encimadas) (`slots.ts`). Se usa el ángulo dorado exacto (137,50776°): así la distancia mínima entre vecinas no baja nunca (comprobado hasta 300.000). El radio de cada órbita queda guardado en `planets.orbit_radius`. 71 pruebas nuevas (119 en total). `npm run render:spiral` dibuja las primeras 200 constelaciones en `scripts/output/`.

## Fase 3 — Procesamiento diario

- [x] Ruta protegida de importación manual: recibe una lista de comentarios (`usuario`, texto opcional) para un día y los guarda en `comment_inbox`.
- [x] Función de procesamiento (en PostgreSQL o en el servidor, con transacción y bloqueo para que nunca corran dos a la vez):
- [x] Script `scripts/generate-fake-data.ts`: simula N días con M comentarios, regresos e invitaciones (nombres inventados y marcados como prueba).
- [x] Pruebas: procesar dos veces no duplica; 301 personas nuevas → 1 constelación completa + 1 estrella en la siguiente; invitación con primera mención gana.

**Resumen:** Procesamiento en PostgreSQL (`process_inbox`, migración `20261101000001_processing.sql`) con bloqueo para que nunca corran dos a la vez, por lotes de 4.000 comentarios (límite de 8 s de la API de Supabase). Las posiciones las calcula el motor del cielo y se guardan con `open_constellation` antes de asignarlas; las constelaciones abiertas por adelantado quedan como `reserved`. Nueva columna `constellations.dirty` para la fase 4. Rutas protegidas con `CRON_SECRET`: `POST /api/jobs/import` (lista manual; guarda solo usuario y menciones, nunca el texto; crea el día si no existe) y `POST /api/jobs/process`. 17 pruebas nuevas (136 en total). Simulación con `npm run fake-data -- --days 31 --people 30000 --reset`: 141.124 comentarios, 30.000 estrellas, 100 constelaciones, 10.649 invitaciones, todo cuadra; el día más grande (10.881 comentarios) se procesó en 5,0 s. La base de Supabase queda con estos datos de prueba (usuarios `prueba_*`) para las fases 4 y 5.

## Fase 4 — Archivos públicos

- [x] Generador de `c/{id}.v{V}.json` solo para constelaciones cambiadas.
- [x] Generador de `sky/index.v{N}.json` y `sky/latest.json`.
- [x] Generador de `sky/overview.v{N}.webp` (imagen de la espiral para el zoom lejano).
- [x] Subida a Supabase Storage con cabeceras de caché correctas (sección 4).
- [x] Ruta protegida `/api/jobs/publish` que corre el generador; se llama automáticamente al final del procesamiento.

**Resumen:** Publicador en `src/server/publish` (formatos en `files.ts`, imagen en `overview.ts`, orquestación en `publish.ts`). Almacenamiento aislado en `src/server/storage.ts` (bucket público `files` en Supabase Storage; para pasar a R2 basta otra implementación). Solo se regeneran las constelaciones marcadas como cambiadas; la imagen de la espiral solo cuando se completa alguna; el índice solo si su contenido cambió (hash). Se guardan la versión actual y la anterior de cada archivo; los viejos se borran. Candado de publicación y funciones en la migración `20261102000001_publishing.sql`. Mientras una constelación se forma, su archivo no lleva nombre ni líneas. La imagen de la espiral es opaca sobre negro: el mapa debe dibujarla con mezcla aditiva (comprime mucho mejor que con transparencia). Rutas `POST /api/jobs/publish` y `POST /api/jobs/process` (procesa y luego publica). Tamaños medidos con 10.000 constelaciones: índice 122 KB gzip, imagen 137 KB, archivo de constelación 7–10 KB gzip. En Supabase con los datos de prueba (CDN con brotli): índice 1,8 KB, constelación ~5,2 KB, imagen 29 KB. 14 pruebas nuevas (150 en total).

## Fase 5 — Mapa 2D

- [x] Lienzo PixiJS a pantalla completa con cámara (posición y zoom).
- [x] Gestos: arrastrar con inercia, rueda con zoom hacia el cursor, pellizco, doble toque.
- [x] Zoom de 0,001x a 20x con niveles: Universo, Región, Constelación, Estrella, Nombre (tabla del documento de diseño), con fundidos entre niveles.
- [x] Carga por demanda: solo se descargan archivos de constelaciones visibles en zoom Constelación o más cerca; caché en memoria con límite (descartar las más lejanas).
- [x] Estrellas con texturas de brillo por nivel (como el prototipo), parpadeo, anillos, estela, borde dorado.
- [x] Líneas de constelación (doradas la de hoy), nombres debajo, revelación animada de la constelación de hoy.
- [x] El Sol en el centro (animado) y los planetas en órbita; planetas bloqueados con órbita punteada y su meta.
- [x] Estrellas fugaces del día cruzando la pantalla con el nombre.
- [x] Desbloqueos de retos dibujados en el cielo (aurora, cometa, luna, lluvia, nebulosa).
- [x] Minimapa con el Sol, órbitas y recuadro de la vista.
- [x] Respeto a "reducir movimiento".

**Resumen:** Mapa en `src/map` con PixiJS 8.22: cámara y vuelos (`camera.ts`), niveles de zoom con fundidos (`zoom-levels.ts`: Universo < 0,03 ≤ Región < 0,2 ≤ Constelación < 0,9 ≤ Estrella < 2,5 ≤ Nombre), datos por demanda con caché limitada (`sky-data.ts`), gestos (`input.ts`), minimapa (`minimap.ts`) y capas en `src/map/layers`. Las estrellas son partículas de un solo atlas (un dibujo por cuadro); solo están en pantalla las constelaciones visibles. Los nombres se ocultan cuando chocarían, priorizando las estrellas más brillantes. Los desbloqueos se anclan a la última constelación completada ese día (las de un mismo día quedan repartidas por toda la espiral). La imagen de la espiral se descarga solo al llegar al zoom lejano. Cielo falso de prueba: `npm run fake-sky` (10.000 constelaciones, 2.999.887 estrellas en `public/dev-sky`, abrir con `?sky=/dev-sky`). Medición (`npm run measure:map`, Chromium con tamaño de Pixel 7, procesador frenado 4x, versión de producción, GPU real): 60 cuadros por segundo moviéndose en zoom Constelación (58 con freno 6x); carga inicial 594 KB. Pendiente de confirmar en un celular físico de gama media (fase 12). 22 pruebas nuevas (172 en total).

## Fase 6 — Interfaz pública

- [x] Barra superior: nombre, día, etapa con progreso.
- [x] Buscador con sugerencias (llama a `search_stars`, con espera de 200 ms al escribir); viaja a la estrella, descarga solo su constelación y la selecciona.
- [x] Panel: constelación de hoy, próxima constelación (contador), reto del día, estrellas fugaces de hoy, niveles.
- [x] Tarjeta de estrella completa (sección 6 del documento de diseño), con hilos de luz dibujados en el mapa.
- [x] Tarjetas del Sol y de cada planeta.
- [x] Atajos: Ver todo, Hoy, Mi estrella (recordada en el navegador).
- [x] Versión celular: barra inferior plegable y tarjeta desde abajo.
- [x] Enlaces directos: `/@usuario` abre la página centrada en esa estrella (para compartir).

**Resumen:** Interfaz en `src/components/app` (barra superior, buscador, panel, tarjetas y `SkyApp`, que lo coordina), con los estilos del prototipo. Nueva función pública `star_details` (migración `20261103000001_star_details.sql`) que devuelve los datos de la tarjeta y los hilos de luz de una sola estrella (nunca las que están en revisión). En el mapa: selección con círculo dorado y pulso, hilos de luz curvos, atenuación de las demás constelaciones, toques sobre estrellas, el Sol y los planetas, y márgenes para que los paneles no tapen lo que se busca. Los enlaces `/@usuario` se resuelven con una reescritura en `next.config.ts`; al seleccionar una estrella la dirección cambia a su enlace para poder compartirlo. "Mi estrella" se recuerda en el navegador al buscar. Los botones "Ver mi estrella en 3D" y "Ver postal" están en la tarjeta pero desactivados hasta las fases 7 y 8. Pruebas: 3 nuevas de base de datos (175 en total) y 5 de Playwright (buscar, nombre inexistente, enlace compartido, tocar el Sol, sin desborde a 360 px) en escritorio y celular.

## Fase 7 — Vista 3D

- [x] three.js cargado solo al abrir la vista.
- [x] Un modelo de estrella con parámetros por nivel (tabla 7.1 del documento de diseño): superficie animada en la tarjeta gráfica, atmósfera, corona, destellos, onda expansiva.
- [x] Extras: anillos, satélite, corona de puntos, cometa con estela.
- [x] Barra de evolución con vista previa de niveles futuros.
- [x] Sol y planetas también abren en 3D con el mismo sistema.
- [x] Mapa 2D en pausa mientras el 3D está abierto; el 3D se detiene al cerrar y libera memoria.
- [x] Mensaje claro si el dispositivo no soporta 3D.

**Resumen:** Vista 3D en `src/viewer3d` con three.js 0.187: parámetros por nivel, Sol y planetas (`params.ts`, tabla 7.1), sombreadores portados del prototipo con modo planeta iluminado de lado y bandas en gigantes gaseosos (`shaders.ts`), y el visor (`viewer.ts`) que construye un solo modelo desde parámetros: superficie animada en la tarjeta gráfica, atmósfera, corona, destellos, onda expansiva, anillos, satélite, corona de puntos, cometa y anillos de Saturno. Interfaz en `src/components/app/Viewer3DOverlay.tsx` (información, barra de evolución con vista previa, cerrar con botón o Esc, mensajes si falla o si el dispositivo no soporta 3D). three.js (134 KB comprimido) se descarga solo al abrir la vista; el mapa 2D se pausa mientras está abierta y al cerrar se libera todo (renderizador, geometrías, materiales, texturas y contexto WebGL). `npm run measure:viewer`: 20 aperturas y cierres con la memoria estable en 31,6 MB y sin lienzos sobrantes. 8 pruebas nuevas (183 en total) y 1 de Playwright (16 en total).

## Fase 8 — Postal

- [ ] Ruta `/api/postal/[usuario]` que genera la imagen 1080 × 1920 con `@vercel/og` (diseño de la sección 8 del documento de diseño).
- [ ] Botón en la tarjeta para ver y descargar la postal.
- [ ] La misma imagen sirve como vista previa al compartir el enlace `/@usuario`.

## Fase 9 — Panel de administración

- [ ] `/admin` con inicio de sesión por correo; solo correos de `ADMIN_EMAILS`.
- [ ] Días: crear el día N, asociarlo a un video, cerrarlo.
- [ ] Importación manual: pegar lista o subir CSV de comentarios.
- [ ] Botón "Procesar ahora" y "Publicar ahora", con estado de la última ejecución.
- [ ] Moderación: aprobar u ocultar nombres en revisión; editar palabras bloqueadas.
- [ ] Reto del día: elegir tipo, meta y ver progreso.
- [ ] Estrellas fugaces: definir cuántas y lanzar el sorteo (no repetible); mostrar los ganadores para el video.
- [ ] Nombre de constelación: editar el nombre elegido por la comunidad.
- [ ] Estadísticas del día y totales.
- [ ] Exportar imagen de la constelación del día (apoyo para el video).

## Notas para el lanzamiento

- Borrar los datos de prueba (`prueba_*`) antes de lanzar (fase 13).
- La clave `service_role` y la contraseña de la base de datos se compartieron en un chat: cambiarlas antes de lanzar (Supabase > Project Settings > API Keys y Database).
