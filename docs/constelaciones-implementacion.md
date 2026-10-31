# Constelaciones — Plan de implementación

> Este documento es para **Claude Code**. Define cómo se construye el proyecto fase por fase.
> Documentos relacionados (deben estar en `docs/` del repositorio):
> - `docs/constelaciones.md` — producto, reglas y tecnologías.
> - `docs/constelaciones-diseno.md` — diseño visual, mapa, Sol, planetas, zoom y vista 3D.
> - `docs/constelaciones-diseno.html` — prototipo visual de referencia (600 estrellas, 2 constelaciones, vista 3D).
> - `docs/constelaciones-implementacion.md` — este documento.

---

## 0. Cómo usar este documento

### 0.1 Para la persona dueña del proyecto
1. Crea una carpeta vacía para el proyecto y pon los cuatro documentos dentro de `docs/`.
2. Abre Claude Code en esa carpeta y escribe:

   > Lee todos los documentos de `docs/`. Luego ejecuta la siguiente fase pendiente de `docs/constelaciones-implementacion.md`.

3. Cuando Claude Code termine una fase, te explicará qué hizo y qué necesita de ti (por ejemplo, claves de Supabase). Revisa y luego escribe:

   > siguiente

4. Repite hasta terminar la fase 13.

### 0.2 Reglas para Claude Code
- **Una fase a la vez.** Al empezar, lee `PROGRESO.md` para saber cuál sigue. Nunca adelantes trabajo de fases futuras.
- Al terminar una fase:
  1. Marca sus tareas con `[x]` en `PROGRESO.md` y escribe un resumen corto de lo hecho.
  2. Verifica los **criterios de aceptación** de la fase (pruebas, compilación, revisión visual cuando aplique).
  3. Haz un commit con el mensaje `Fase N: <nombre>`.
  4. Dile a la persona, en español sencillo: qué quedó listo, cómo verlo, y qué necesita hacer ella (si algo).
  5. Detente y espera "siguiente".
- Si una tarea necesita algo que solo la persona puede dar (cuentas, claves, decisiones), **pregunta y espera**; no inventes valores.
- Nunca subas claves al repositorio. Todas van en `.env.local` (incluido en `.gitignore`), con un `.env.example` sin valores reales.
- Si algo de este plan resulta imposible o hay una forma claramente mejor, explícalo antes de cambiarlo.
- Idioma de la interfaz: español. Código, nombres de archivos y variables: inglés.
- Respeta el diseño de `docs/constelaciones-diseno.md` y del prototipo HTML: colores, tipografías, sin emojis.

---

## 1. Arquitectura general

```
Instagram ──(API, cada hora)──▶ Importador ──▶ Supabase (PostgreSQL)
                                                   │
                         Procesamiento diario ◀────┘
                         (estrellas, constelaciones, invitaciones, retos)
                                                   │
                                Generador de archivos públicos
                                                   │
                                                   ▼
                           Supabase Storage (archivos de constelaciones, índice)
                                                   │
                                                   ▼
          Página pública (Next.js en Vercel): mapa 2D (PixiJS) + vista 3D (three.js)
          Búsqueda de @ ──▶ función de Supabase (respuesta mínima)
          Panel de administración (solo la dueña)
```

**Principio clave de rendimiento:** la página nunca descarga el cielo completo. Descarga un índice ligero y solo los archivos de las constelaciones que están en pantalla. La búsqueda la resuelve el servidor.

### 1.1 Stack

| Parte | Tecnología |
|---|---|
| App web y panel | Next.js (App Router) + TypeScript |
| Estilos | CSS Modules con variables (tokens del documento de diseño) |
| Mapa 2D | PixiJS v8 (WebGL) |
| Vista 3D | three.js, cargado solo al abrirse |
| Base de datos | Supabase PostgreSQL + `pg_trgm` |
| Archivos públicos | Supabase Storage (bucket público con CDN) |
| Autenticación del panel | Supabase Auth (correo), lista de correos permitidos |
| Tareas programadas | Vercel Cron llamando a rutas protegidas |
| Postales | `@vercel/og` |
| Instagram | Instagram API con inicio de sesión de Instagram (cuenta Profesional) |
| Pruebas | Vitest (lógica), Playwright (pantallas) |
| Hosting | Vercel |

Usar versiones estables y fijas de cada dependencia.

### 1.2 Estructura del repositorio

```
/docs                    documentos del proyecto
/PROGRESO.md             estado de las fases
/CLAUDE.md               reglas del proyecto para Claude Code
/supabase/migrations     SQL versionado
/supabase/seed           figuras de constelaciones, palabras bloqueadas
/src/app                 páginas (público, /admin, /api)
/src/sky                 lógica pura del cielo (sin dependencias de UI)
/src/map                 mapa 2D con PixiJS
/src/viewer3d            vista 3D con three.js
/src/components          interfaz (buscador, tarjeta, paneles)
/src/server              acceso a Supabase, Instagram, generación de archivos
/scripts                 generadores de datos de prueba, cargas masivas
/tests                   pruebas
```

---

## 2. Reglas de negocio que el código debe cumplir

Resumen técnico de `docs/constelaciones.md`. Ante una duda, manda ese documento.

- **Día del reto:** cada video registrado en el panel es el día N. Un comentario cuenta para el día del video donde se escribió, no para la fecha del comentario.
- **Usuario normalizado:** minúsculas, sin `@`, sin espacios. Es la clave única de la estrella.
- **Una estrella por persona**, para siempre. Su posición nunca cambia.
- **Participación:** una por persona por día (aunque comente muchas veces).
- **Días comentando:** cantidad de días distintos con participación. Define el nivel:
  `1 Chispa · 3 Enana roja · 7 Estrella amarilla · 15 Gigante azul · 30 Supergigante · 100 Nova · 365 Supernova`.
- **Constelación:** se llena con 300 estrellas nuevas. Al llegar a 300 se marca completa y se abre la siguiente.
- **Invitaciones:** al procesar un comentario, cada `@mención` a alguien **sin estrella** se guarda como invitación pendiente (gana la primera). Cuando esa persona comenta por primera vez, queda invitada por quien la mencionó primero. Anillos: 5 → 1, 25 → 2, 100 → 3 (+ satélite), 500 → corona de luz.
- **Estrellas fugaces:** la dueña define cuántas para un día; el servidor sortea al azar entre las participaciones de ese día con un generador criptográfico y guarda el resultado. Un sorteo hecho no se puede repetir para el mismo día.
- **Moderación:** nombres que coinciden con la lista de palabras bloqueadas quedan "en revisión" y no se muestran hasta que la dueña los apruebe.
- **Etapas:** Nuestro Cielo (88 constelaciones), Vía Láctea (1.000), El Universo (10.000).
- **Planetas:** aparecen al llegar a 1.000 / 2.500 / 5.000 / 10.000 / 26.400 / 100.000 / 300.000 / 1.000.000 estrellas.
- **Retos diarios:** tipos cantidad, velocidad, regreso, invitación, racha y récord. Si se cumplen, se guarda un desbloqueo permanente.
- Todo el procesamiento debe ser **idempotente**: correrlo dos veces no duplica nada.

---

## 3. Modelo de datos (borrador)

Claude Code puede ajustarlo en la fase 1, explicando los cambios.

```sql
create extension if not exists pg_trgm;

-- Figuras de constelaciones
create table figures (
  id          serial primary key,
  name        text not null,
  anchors     jsonb not null,   -- [[x,y],...] en rango -1..1
  edges       jsonb not null,   -- [[i,j],...]
  handmade    boolean default false
);

-- Días del reto (un video por día)
create table days (
  day               int primary key,
  ig_media_id       text unique,
  published_at      timestamptz,
  challenge_type    text,         -- cantidad | velocidad | regreso | invitacion | racha | record
  challenge_goal    int,
  challenge_progress int default 0,
  challenge_met     boolean,
  shooting_count    int,          -- cuántas estrellas fugaces definió la dueña
  closed            boolean default false
);

-- Constelaciones
create table constellations (
  id             int primary key,   -- número de constelación (1, 2, 3...)
  figure_id      int references figures(id),
  name           text,              -- nombre de la figura o elegido por la comunidad
  center_x       double precision not null,
  center_y       double precision not null,
  scale          real not null,
  rotation       real not null,
  star_count     int default 0,
  status         text default 'forming',  -- forming | complete
  started_day    int,
  completed_day  int,
  file_version   int default 0
);

-- Posiciones reservadas de la constelación que se está formando (300 por constelación)
create table slots (
  constellation_id int references constellations(id),
  slot_index       smallint,        -- orden de llenado (barajado)
  x                double precision,
  y                double precision,
  is_anchor        boolean,
  anchor_index     smallint,
  primary key (constellation_id, slot_index)
);

-- Estrellas (una por persona)
create table stars (
  id               bigserial primary key,
  username         text unique not null,     -- normalizado
  constellation_id int references constellations(id),
  slot_index       smallint,
  x                double precision,
  y                double precision,
  born_day         int not null,
  days_count       int not null default 1,
  last_day         int not null,
  invited_by       bigint references stars(id),
  invited_count    int not null default 0,
  shooting_days    int[] not null default '{}',
  gold_border      boolean not null default false,
  status           text not null default 'active'  -- active | review | hidden
);
create index stars_username_trgm on stars using gin (username gin_trgm_ops);
create index stars_constellation on stars (constellation_id);

-- Participación por día
create table participations (
  star_id   bigint references stars(id),
  day       int references days(day),
  first_at  timestamptz,
  primary key (star_id, day)
);

-- Comentarios importados (se procesan y luego se pueden purgar)
create table comment_inbox (
  ig_comment_id text primary key,
  day           int references days(day),
  username      text not null,
  mentions      text[] not null default '{}',
  commented_at  timestamptz,
  source        text not null,     -- api | manual
  processed     boolean not null default false
);

-- Invitaciones pendientes (personas mencionadas que aún no tienen estrella)
create table pending_invites (
  invited_username text primary key,   -- gana la primera mención
  inviter_star_id  bigint references stars(id),
  day              int
);

-- Desbloqueos permanentes de retos
create table unlocks (
  id      serial primary key,
  day     int references days(day),
  type    text not null,   -- aurora | cometa | luna | lluvia | nebulosa | borde_dorado
  params  jsonb
);

-- Planetas (hitos)
create table planets (
  id            smallint primary key,
  name          text not null,
  threshold     int not null,
  orbit_radius  double precision,
  unlocked_day  int
);

-- Palabras bloqueadas
create table blocked_words ( word text primary key );

-- Estado general (una fila)
create table sky_state (
  id                 boolean primary key default true,
  current_day        int,
  total_stars        int default 0,
  total_constellations int default 0,
  stage              smallint default 1,
  index_version      int default 0
);
```

**Seguridad (RLS):**
- El público solo puede: leer `sky_state`, leer `days` (campos públicos) y llamar a la función `search_stars(q)`.
- Todo lo demás se lee y escribe solo desde el servidor con la clave de servicio.
- `search_stars(q)` devuelve como máximo 8 resultados con: `username`, `constellation_id`, `slot_index`, `x`, `y`, nivel. Nunca expone estrellas en revisión.

---

## 4. Archivos públicos (lo que descarga la página)

Se generan en Storage después de cada procesamiento. Rutas con versión para que la CDN nunca muestre datos viejos.

| Archivo | Contenido | Tamaño objetivo |
|---|---|---|
| `sky/index.v{N}.json` | Estado general, Sol, planetas, órbitas, día, reto activo, estrellas fugaces del día, desbloqueos, y por cada constelación: id, centro, radio, nombre, estado, versión de archivo | < 300 KB comprimido con 10.000 constelaciones |
| `sky/latest.json` | Solo `{ "index": "sky/index.v{N}.json" }`, con caché corta (60 s) | < 1 KB |
| `c/{id}.v{V}.json` | Una constelación: figura (anclas y líneas), y sus estrellas en forma compacta `[slot, username, x, y, nivel, anillos, fugaz, bordeDorado]` | ~10–15 KB comprimido |
| `sky/overview.v{N}.webp` | Imagen de la espiral completa para el zoom "Universo" | < 400 KB |

- Solo se regeneran los archivos de constelaciones donde algo cambió (estrellas nuevas, subidas de nivel, invitaciones, fugaces).
- La constelación en formación también tiene archivo, regenerado en cada procesamiento.
- Los archivos con versión llevan caché larga (1 año, inmutables).

---

## 5. Geometría del mapa

- **Sol:** en el origen (0, 0).
- **Constelaciones en espiral dorada** alrededor del Sol: la constelación `n` se centra en `r = k·√n`, `θ = n · 137,508°`. `k` se calcula para que dos constelaciones nunca se toquen (radio de constelación ≈ 300 unidades).
- **Rotación y escala** de cada constelación con una semilla igual a su id (reproducible).
- **Figura:** las primeras 88 usan figuras hechas a mano (tabla `figures`, `handmade = true`). Después se reutilizan con variaciones de rotación, escala y deformación suave.
- **Posiciones de estrellas:** al abrir una constelación se calculan sus 300 posiciones (anclas de la figura + puntos a lo largo de las líneas + halo alrededor), con semilla = id, y se guardan en `slots` en orden barajado. Cada estrella nueva ocupa el siguiente slot libre. Así la figura aparece poco a poco y solo se confirma al completarse.
- **Órbita de cada planeta:** el radio de la espiral donde caería la constelación número `umbral / 300`.

Todo esto vive en `/src/sky` como funciones puras con pruebas.

---

## 6. Fases

Cada fase indica objetivo, tareas y criterios de aceptación. Claude Code copia esta lista a `PROGRESO.md` en la fase 0.

---

### Fase 0 — Preparación del proyecto

**Objetivo:** proyecto base funcionando en local, con reglas claras.

- [ ] Crear app Next.js con TypeScript, ESLint y Prettier.
- [ ] Crear la estructura de carpetas de la sección 1.2.
- [ ] Crear `CLAUDE.md` con: resumen del proyecto, reglas de la sección 0.2, comandos útiles y enlaces a `docs/`.
- [ ] Crear `PROGRESO.md` con todas las fases y tareas de este documento.
- [ ] Crear `.env.example` con: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `CRON_SECRET`, `IG_APP_ID`, `IG_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_USER_ID`.
- [ ] Cargar las fuentes (Cormorant Garamond, IBM Plex Sans, IBM Plex Mono) y crear los tokens de color del documento de diseño.
- [ ] Configurar Vitest y Playwright.
- [ ] Iniciar git y primer commit.

**Necesita de la dueña:** nada todavía. Al final, pedirle crear una cuenta y un proyecto en Supabase (plan gratis) para la fase 1.

**Aceptación:** `npm run dev` muestra una página oscura con el nombre del proyecto en la tipografía correcta; `npm test` corre.

---

### Fase 1 — Base de datos

**Objetivo:** esquema completo en Supabase, seguro y con datos base.

- [ ] Migraciones SQL con el modelo de la sección 3 (ajustado si hace falta).
- [ ] Políticas RLS: público solo lectura de lo indicado; escrituras solo con clave de servicio.
- [ ] Función `search_stars(q text)`: coincidencia por prefijo primero, luego por similitud (`pg_trgm`); máximo 8 resultados; excluye estrellas en revisión.
- [ ] Semilla de `figures`: al menos 12 figuras hechas a mano para empezar (colibrí, volcán, perezoso, tucán, ola, carreta, guitarra, mariposa, rana, colibrí en vuelo, palma, luna), más las 2 del prototipo.
- [ ] Semilla de `planets` con nombres y umbrales.
- [ ] Semilla de `blocked_words` en español (lista inicial; la dueña puede ampliarla).
- [ ] Cliente de Supabase en `/src/server` (servidor con clave de servicio, navegador con clave pública).

**Necesita de la dueña:** URL y claves del proyecto de Supabase, para ponerlas en `.env.local`.

**Aceptación:** las migraciones se aplican desde cero sin errores; una prueba confirma que la clave pública no puede escribir ni leer tablas privadas.

---

### Fase 2 — Motor del cielo (lógica pura)

**Objetivo:** toda la matemática del cielo, probada, sin interfaz.

- [ ] Normalización de usuarios y extracción de menciones (`@usuario`) de un texto.
- [ ] Cálculo de nivel, días para el siguiente nivel y anillos.
- [ ] Posición de la constelación `n` en la espiral (sección 5) y radio de órbita de cada planeta.
- [ ] Generación de las 300 posiciones de una constelación a partir de una figura y una semilla.
- [ ] Generador aleatorio con semilla (reproducible).
- [ ] Pruebas unitarias de todo lo anterior, incluyendo: misma semilla → mismo resultado; constelaciones vecinas no se superponen en las primeras 10.000.

**Aceptación:** `npm test` en verde; un script dibuja en una imagen PNG las primeras 200 constelaciones de la espiral para revisión visual.

---

### Fase 3 — Procesamiento diario

**Objetivo:** convertir comentarios en estrellas, constelaciones e invitaciones, de forma segura y repetible.

- [ ] Ruta protegida de importación manual: recibe una lista de comentarios (`usuario`, texto opcional) para un día y los guarda en `comment_inbox`.
- [ ] Función de procesamiento (en PostgreSQL o en el servidor, con transacción y bloqueo para que nunca corran dos a la vez):
  1. Toma comentarios sin procesar.
  2. Aplica la moderación.
  3. Crea participaciones (una por persona por día).
  4. Crea estrellas para personas nuevas en el siguiente slot de la constelación en formación.
  5. Resuelve invitaciones pendientes y guarda nuevas menciones.
  6. Actualiza `days_count`, `last_day`, `invited_count`.
  7. Cierra constelaciones al llegar a 300 y abre la siguiente (calculando sus slots).
  8. Actualiza `sky_state`, desbloquea planetas por umbral y actualiza la etapa.
  9. Marca los comentarios como procesados.
- [ ] Script `scripts/generate-fake-data.ts`: simula N días con M comentarios, regresos e invitaciones (nombres inventados y marcados como prueba).
- [ ] Pruebas: procesar dos veces no duplica; 301 personas nuevas → 1 constelación completa + 1 estrella en la siguiente; invitación con primera mención gana.

**Aceptación:** con el script, simular 31 días y ~30.000 personas; los totales cuadran; procesar 10.000 comentarios tarda menos de 30 segundos.

---

### Fase 4 — Archivos públicos

**Objetivo:** generar lo que la página descarga, sin cargar la base de datos con visitas.

- [ ] Generador de `c/{id}.v{V}.json` solo para constelaciones cambiadas.
- [ ] Generador de `sky/index.v{N}.json` y `sky/latest.json`.
- [ ] Generador de `sky/overview.v{N}.webp` (imagen de la espiral para el zoom lejano).
- [ ] Subida a Supabase Storage con cabeceras de caché correctas (sección 4).
- [ ] Ruta protegida `/api/jobs/publish` que corre el generador; se llama automáticamente al final del procesamiento.

**Aceptación:** con los datos falsos de la fase 3, el índice pesa menos del objetivo y cada archivo de constelación menos de 15 KB comprimido.

---

### Fase 5 — Mapa 2D

**Objetivo:** el cielo navegable, igual de bonito que el prototipo y capaz de manejar millones de estrellas.

- [ ] Lienzo PixiJS a pantalla completa con cámara (posición y zoom).
- [ ] Gestos: arrastrar con inercia, rueda con zoom hacia el cursor, pellizco, doble toque.
- [ ] Zoom de 0,001x a 20x con niveles: Universo, Región, Constelación, Estrella, Nombre (tabla del documento de diseño), con fundidos entre niveles.
- [ ] Carga por demanda: solo se descargan archivos de constelaciones visibles en zoom Constelación o más cerca; caché en memoria con límite (descartar las más lejanas).
- [ ] Estrellas con texturas de brillo por nivel (como el prototipo), parpadeo, anillos, estela, borde dorado.
- [ ] Líneas de constelación (doradas la de hoy), nombres debajo, revelación animada de la constelación de hoy.
- [ ] El Sol en el centro (animado) y los planetas en órbita; planetas bloqueados con órbita punteada y su meta.
- [ ] Estrellas fugaces del día cruzando la pantalla con el nombre.
- [ ] Desbloqueos de retos dibujados en el cielo (aurora, cometa, luna, lluvia, nebulosa).
- [ ] Minimapa con el Sol, órbitas y recuadro de la vista.
- [ ] Respeto a "reducir movimiento".

**Aceptación:** con 3.000.000 de estrellas falsas, el mapa se mantiene fluido (≥ 50 cuadros por segundo en un celular de gama media en zoom Constelación) y la carga inicial descarga menos de 1 MB.

---

### Fase 6 — Interfaz pública

**Objetivo:** todo lo que rodea al mapa, en escritorio y celular.

- [ ] Barra superior: nombre, día, etapa con progreso.
- [ ] Buscador con sugerencias (llama a `search_stars`, con espera de 200 ms al escribir); viaja a la estrella, descarga solo su constelación y la selecciona.
- [ ] Panel: constelación de hoy, próxima constelación (contador), reto del día, estrellas fugaces de hoy, niveles.
- [ ] Tarjeta de estrella completa (sección 6 del documento de diseño), con hilos de luz dibujados en el mapa.
- [ ] Tarjetas del Sol y de cada planeta.
- [ ] Atajos: Ver todo, Hoy, Mi estrella (recordada en el navegador).
- [ ] Versión celular: barra inferior plegable y tarjeta desde abajo.
- [ ] Enlaces directos: `/@usuario` abre la página centrada en esa estrella (para compartir).

**Aceptación:** pruebas de Playwright de buscar, seleccionar y compartir en tamaño escritorio y celular; sin desbordes horizontales en 360 px de ancho.

---

### Fase 7 — Vista 3D

**Objetivo:** la estrella de cada persona en 3D, como el prototipo.

- [ ] three.js cargado solo al abrir la vista.
- [ ] Un modelo de estrella con parámetros por nivel (tabla 7.1 del documento de diseño): superficie animada en la tarjeta gráfica, atmósfera, corona, destellos, onda expansiva.
- [ ] Extras: anillos, satélite, corona de puntos, cometa con estela.
- [ ] Barra de evolución con vista previa de niveles futuros.
- [ ] Sol y planetas también abren en 3D con el mismo sistema.
- [ ] Mapa 2D en pausa mientras el 3D está abierto; el 3D se detiene al cerrar y libera memoria.
- [ ] Mensaje claro si el dispositivo no soporta 3D.

**Aceptación:** abrir y cerrar la vista 20 veces no aumenta la memoria; se ve bien en celular.

---

### Fase 8 — Postal

**Objetivo:** imagen para historias de Instagram.

- [ ] Ruta `/api/postal/[usuario]` que genera la imagen 1080 × 1920 con `@vercel/og` (diseño de la sección 8 del documento de diseño).
- [ ] Botón en la tarjeta para ver y descargar la postal.
- [ ] La misma imagen sirve como vista previa al compartir el enlace `/@usuario`.

**Aceptación:** la imagen se genera en menos de 1 segundo y se ve correcta con nombres largos.

---

### Fase 9 — Panel de administración

**Objetivo:** que la dueña maneje el reto sin tocar código.

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

**Aceptación:** la dueña puede simular un día completo solo desde el panel.

---

### Fase 10 — Conexión con Instagram

**Objetivo:** importar comentarios automáticamente.

- [ ] Guía paso a paso en `docs/instagram-setup.md` para la dueña: cuenta Profesional, app en Meta for Developers, inicio de sesión de Instagram, token de larga duración.
- [ ] En el panel: listar los videos recientes de la cuenta y elegir cuál es el día N.
- [ ] Importador: lee los comentarios del video del día con paginación (incluye respuestas), guarda usuario, texto y menciones en `comment_inbox`. Verificar en la documentación oficial vigente los campos exactos del comentario.
- [ ] Tarea programada cada hora (Vercel Cron, protegida con `CRON_SECRET`): importar → procesar → publicar.
- [ ] Renovación automática del token antes de que venza, y aviso en el panel si falla.
- [ ] Si la API falla, el panel lo muestra y la importación manual sigue disponible.

**Necesita de la dueña:** cuenta Profesional, app de Meta y token (siguiendo la guía).

**Aceptación:** comentar en un video real de prueba y ver la estrella en la página después de la siguiente ejecución.

---

### Fase 11 — Retos y desbloqueos

**Objetivo:** que los retos diarios funcionen solos.

- [ ] Cálculo del progreso de cada tipo: cantidad (constelaciones nuevas), velocidad (estrellas en la primera hora desde la publicación del video), regreso (participaciones de personas que ya tenían estrella), invitación (invitaciones resueltas en el día), racha (personas que llegan a cierto nivel en el día), récord (más estrellas nuevas que cualquier día anterior).
- [ ] Al cerrar el día: marcar cumplido y crear el desbloqueo correspondiente.
- [ ] Desbloqueo "borde dorado" para las estrellas que invitaron ese día.
- [ ] Progreso en vivo en la página (actualizado en cada publicación).

**Aceptación:** pruebas unitarias de cada tipo de reto con datos falsos.

---

### Fase 12 — Rendimiento y pruebas de carga

**Objetivo:** confirmar que aguanta el éxito.

- [ ] Cargar 3.000.000 de estrellas falsas en una base de prueba.
- [ ] Medir: búsqueda < 150 ms; procesamiento de 50.000 comentarios < 2 minutos; generación de archivos < 2 minutos.
- [ ] Lighthouse en celular: rendimiento ≥ 85 en la página pública.
- [ ] Medir el peso total descargado por una visita típica (entrar, buscar, abrir 3D) y estimar la transferencia mensual con 100.000 visitas.
- [ ] Documentar resultados en `docs/rendimiento.md`.

**Aceptación:** todas las metas cumplidas o un plan concreto para las que no.

---

### Fase 13 — Lanzamiento

**Objetivo:** salir al público.

- [ ] Desplegar en Vercel con variables de entorno de producción.
- [ ] Dominio propio (si la dueña lo tiene).
- [ ] Pasar Supabase a plan Pro (decisión de la dueña) y activar copias de seguridad.
- [ ] Borrar todos los datos de prueba; cargar figuras finales.
- [ ] Página de privacidad simple (qué se guarda: solo el @ público y la participación).
- [ ] Monitoreo de errores y aviso si la tarea programada falla.
- [ ] Lista de verificación del día 1: crear día 1 en el panel, asociar el video, comprobar importación, procesar, publicar, revisar la página en celular.

**Aceptación:** la dueña completa la lista del día 1 sin ayuda.

---

## 7. Después del lanzamiento (no son fases, son ideas registradas)

- Mover los archivos de constelaciones a Cloudflare R2 si la transferencia se encarece (el código debe tenerlo aislado en una sola función de almacenamiento).
- Postal con la estrella en 3D.
- Temporada 2.
