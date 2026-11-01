# Progreso

Estado de las fases del plan (`docs/constelaciones-implementacion.md`, sección 6).
Al terminar cada fase se marcan sus tareas con `[x]` y se agrega un resumen corto.

**Siguiente fase:** Fase 13 — Lanzamiento

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

- [x] Ruta `/api/postal/[usuario]` que genera la imagen 1080 × 1920 con `@vercel/og` (diseño de la sección 8 del documento de diseño).
- [x] Botón en la tarjeta para ver y descargar la postal.
- [x] La misma imagen sirve como vista previa al compartir el enlace `/@usuario`.

**Resumen:** Ruta `GET /api/postal/[usuario]` con `ImageResponse` de `next/og` (es `@vercel/og`, ya incluido en Next; no hizo falta otra dependencia). Diseño de la sección 8 en `src/server/postal` (`layout.ts` puro y probado: textos, tamaño del @ que se ajusta a nombres de hasta 30 caracteres y dibujo SVG de la constelación con doble círculo dorado; `data.ts` lee la estrella de la base y su constelación de los archivos públicos, con caché en memoria). Fuentes WOFF con licencia OFL en `assets/fonts` (el generador no acepta WOFF2). Ventana de la postal con descarga desde la tarjeta. Los enlaces `/@usuario` ahora se sirven desde `/estrella/[usuario]` (reescritura en `next.config.ts`) para tener metadatos propios: título y la postal como vista previa (`og:image`, tarjeta grande en X); otras direcciones dan 404. Nueva variable `NEXT_PUBLIC_SITE_URL` para la dirección pública (fase 13). Tiempos en producción: 0,24–0,63 s por postal; la primera tras arrancar un servidor tarda ~1,1 s (carga del motor de imágenes); la CDN guarda cada postal 1 hora. Se agregó la estrella de prueba `prueba_nombre_muy_largo_123456` (30 caracteres). 7 pruebas nuevas (190 en total) y 2 de Playwright (20 en total).

## Fase 9 — Panel de administración

- [x] `/admin` con inicio de sesión por correo; solo correos de `ADMIN_EMAILS`.
- [x] Días: crear el día N, asociarlo a un video, cerrarlo.
- [x] Importación manual: pegar lista o subir CSV de comentarios.
- [x] Botón "Procesar ahora" y "Publicar ahora", con estado de la última ejecución.
- [x] Moderación: aprobar u ocultar nombres en revisión; editar palabras bloqueadas.
- [x] Reto del día: elegir tipo, meta y ver progreso.
- [x] Estrellas fugaces: definir cuántas y lanzar el sorteo (no repetible); mostrar los ganadores para el video.
- [x] Nombre de constelación: editar el nombre elegido por la comunidad.
- [x] Estadísticas del día y totales.
- [x] Exportar imagen de la constelación del día (apoyo para el video).

**Resumen:** Panel en `/admin` (páginas Día, Días, Moderación y Constelaciones) con inicio de sesión por enlace al correo (Supabase Auth y `@supabase/ssr`); solo entran los correos de `ADMIN_EMAILS` (`stwardserrano@gmail.com`), y cada página y cada acción lo comprueba en el servidor. El formulario de entrada responde igual para cualquier correo, así no revela quién tiene acceso. Migración `20261104000001_admin.sql`: historial de tareas (`job_runs`), candidatos y registro del sorteo (no repetible; el sorteo se hace en el servidor con `crypto.randomInt`), estadísticas del día, moderación y nombres. Importar acepta lista pegada o CSV (`src/server/admin/comment-list.ts`) y no permite importar en un día cerrado. Las rutas automáticas también dejan registro. Imagen vertical de cualquier constelación para el video (`/api/admin/constellation-image/[id]`, solo con sesión). 15 pruebas nuevas (205 en total) y 3 de Playwright, entre ellas un día completo hecho solo desde el panel (25 de pantalla en total). Las pruebas crean días y estrellas `prueba_e2e_*` en los datos de prueba.

**Pendiente de la dueña:** en Supabase > Authentication > URL Configuration, agregar `http://localhost:3000/admin/auth/callback` a Redirect URLs (y el dominio final en la fase 13).

## Fase 10 — Conexión con Instagram

- [x] Guía paso a paso en `docs/instagram-setup.md` para la dueña: cuenta Profesional, app en Meta for Developers, inicio de sesión de Instagram, token de larga duración.
- [x] En el panel: listar los videos recientes de la cuenta y elegir cuál es el día N.
- [x] Importador: lee los comentarios del video del día con paginación (incluye respuestas), guarda usuario, texto y menciones en `comment_inbox`. Verificar en la documentación oficial vigente los campos exactos del comentario.
- [x] Tarea programada cada hora (protegida con `CRON_SECRET`): importar → procesar → publicar. **Cambio acordado con la dueña:** la llama Supabase (pg_cron + pg_net) en vez de Vercel Cron, porque el plan gratis de Vercel solo permite tareas diarias.
- [x] Renovación automática del token antes de que venza, y aviso en el panel si falla.
- [x] Si la API falla, el panel lo muestra y la importación manual sigue disponible.

**Resumen:** Cliente de la Instagram API con inicio de sesión de Instagram (`graph.instagram.com`, v26.0, revisada en la documentación oficial de octubre de 2026) en `src/server/instagram/`: lee todas las páginas de comentarios (50 por página) y sus respuestas, omite las respuestas de la propia cuenta y los comentarios ocultos, y guarda cada comentario una sola vez con el id de Instagram. Los días con un enlace del video se resuelven al id real buscando entre los videos recientes. El token vive en la tabla `instagram_auth` (migración `20261105000001_instagram.sql`, solo clave de servicio), se pega en la nueva página del panel **Instagram** (se comprueba antes de guardarlo) o en `IG_ACCESS_TOKEN`, y se renueva solo cada semana; si falla o le quedan menos de 14 días, el panel avisa. Ruta `POST /api/jobs/hourly` (renovar → importar los días abiertos → procesar → publicar; un error de Instagram no detiene el resto). Script `npm run cron:schedule` que programa la tarea en Supabase con el secreto guardado en Vault (probado: se programa, se revisa y se quita). En la página Día, botón **Importar desde Instagram**. 15 pruebas nuevas (220 en total), una prueba remota de la tarea completa con un Instagram falso (16 en total) y una de pantalla de la página Instagram (26 en total).

**Pendiente de la dueña (pospuesto por ella):** seguir `docs/instagram-setup.md`, pegar el token en `/admin/instagram` y probar con un comentario real (aceptación de la fase). La tarea automática de cada hora se activa en la fase 13, cuando exista el dominio.

## Fase 11 — Retos y desbloqueos

- [x] Cálculo del progreso de cada tipo: cantidad (constelaciones nuevas), velocidad (estrellas en la primera hora desde la publicación del video), regreso (participaciones de personas que ya tenían estrella), invitación (invitaciones resueltas en el día), racha (personas que llegan a cierto nivel en el día), récord (más estrellas nuevas que cualquier día anterior).
- [x] Al cerrar el día: marcar cumplido y crear el desbloqueo correspondiente.
- [x] Desbloqueo "borde dorado" para las estrellas que invitaron ese día.
- [x] Progreso en vivo en la página (actualizado en cada publicación).

**Resumen:** Migración `20261106000001_challenges.sql`: `challenge_progress(día)` calcula los seis tipos en la base; `refresh_challenge` guarda el progreso (y en el récord la meta, que es el mejor día anterior más uno); `close_day` cierra el día, marca si se cumplió y crea el desbloqueo una sola vez (aurora, cometa, luna, borde dorado, lluvia, nebulosa con un color propio por día). Un desbloqueo nunca se pierde, aunque el día se vuelva a abrir. En el reto de invitación cumplido, quienes invitaron ese día reciben el borde dorado y su constelación se vuelve a publicar. Nueva columna `days.challenge_level` para la racha (por defecto Estrella amarilla), elegible en el panel. Cada publicación actualiza el progreso, así la página lo muestra en vivo; el panel lo calcula al momento y avisa qué se desbloquea. El botón Cerrar del panel informa el resultado del reto. 17 pruebas nuevas (237 en total), con una prueba por tipo de reto sobre datos falsos; la prueba de pantalla del día completo ahora cumple un reto de invitación y comprueba el borde dorado.

**Nota:** el brillo dorado de 24 horas del documento de producto no se agregó; el borde dorado permanente sí. Se puede sumar más adelante si lo quieres.

## Fase 12 — Rendimiento y pruebas de carga

- [x] Cargar 3.000.000 de estrellas falsas en una base de prueba.
- [x] Medir: búsqueda < 150 ms; procesamiento de 50.000 comentarios < 2 minutos; generación de archivos < 2 minutos.
- [x] Lighthouse en celular: rendimiento ≥ 85 en la página pública.
- [x] Medir el peso total descargado por una visita típica (entrar, buscar, abrir 3D) y estimar la transferencia mensual con 100.000 visitas.
- [x] Documentar resultados en `docs/rendimiento.md`.

**Resumen:** Copia local con Postgres 17 (`embedded-postgres`, solo desarrollo) y 3.000.000 de estrellas (2,4 GB), usando el código real de importación, procesamiento y publicación (`npm run load-test`); las llamadas REST las responde un adaptador local en vez de PostgREST (Docker Desktop no arrancó en este equipo y no se ejecutan binarios descargados). Resultados: búsqueda p95 67 ms; 50.000 comentarios procesados en 45 s (tanda más lenta 4,1 s); todo el cielo publicado en 41 s y un día normal en 5 s; Lighthouse 85 (cielo real) y 86 (3 millones); visita típica 0,8 MB hoy y 1,3 MB con 3 millones (unos 69 GB al mes de Supabase y 60 GB de Vercel con 100.000 visitas). Correcciones: búsqueda con prefijos cortos de 380 ms a 2 ms (migración `20261107000001_search_speed.sql`, ya aplicada en Supabase: la búsqueda real bajó de 373 a 119 ms, casi todo red); la página pública dejó de cargar supabase-js (61 KB menos) y el mapa arranca en pasos cortos (Lighthouse de 81 a 85). Riesgos y plan en `docs/rendimiento.md` (tamaño de máquina de Supabase al superar 1 millón de estrellas).

## Notas para el lanzamiento

- Agregar `https://<dominio>/admin/auth/callback` a las Redirect URLs de Supabase Auth.
- Definir `NEXT_PUBLIC_SITE_URL` con el dominio para las vistas previas al compartir.
- Borrar los datos de prueba (`prueba_*`) antes de lanzar (fase 13).
- La clave `service_role` y la contraseña de la base de datos se compartieron en un chat: cambiarlas antes de lanzar (Supabase > Project Settings > API Keys y Database).
- Pasar Supabase a Pro al lanzar (el plan gratis no alcanza la transferencia esperada, ver `docs/rendimiento.md`); máquina Small o más al superar 1 millón de estrellas.
- Programar la tarea de cada hora con el dominio: `npm run cron:schedule -- --url https://<dominio>` (Supabase pg_cron; el plan gratis de Vercel solo permite tareas diarias).
