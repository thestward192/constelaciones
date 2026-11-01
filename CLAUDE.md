# Constelaciones

Reto de Instagram de 365 días: cada persona que comenta en el video del día se convierte en una
estrella con su @usuario; cada 300 estrellas nuevas forman una constelación. La página pública
muestra el cielo (mapa 2D con PixiJS, vista 3D con three.js) y permite buscar tu estrella. Un panel
privado permite a la dueña manejar el reto.

@AGENTS.md

## Documentos (leer antes de trabajar)

- [docs/constelaciones.md](docs/constelaciones.md) — producto, reglas y tecnologías. Manda ante dudas de reglas.
- [docs/constelaciones-diseno.md](docs/constelaciones-diseno.md) — diseño visual, mapa, Sol, planetas, zoom y 3D.
- [docs/constelaciones-diseno.html](docs/constelaciones-diseno.html) — prototipo visual de referencia.
- [docs/constelaciones-implementacion.md](docs/constelaciones-implementacion.md) — plan por fases.
- [docs/instagram-setup.md](docs/instagram-setup.md) — conectar Instagram (guía para la dueña y notas técnicas).
- [PROGRESO.md](PROGRESO.md) — qué fase sigue y qué está hecho.

## Reglas de trabajo

- **Una fase a la vez.** Al empezar, leer `PROGRESO.md` para saber cuál sigue. Nunca adelantar trabajo de fases futuras.
- Al terminar una fase:
  1. Marcar sus tareas con `[x]` en `PROGRESO.md` y escribir un resumen corto.
  2. Verificar los criterios de aceptación (pruebas, compilación, revisión visual cuando aplique).
  3. Commit con el mensaje `Fase N: <nombre>`.
  4. Explicar a la dueña, en español sencillo: qué quedó listo, cómo verlo y qué necesita hacer ella.
  5. Detenerse y esperar "siguiente".
- Si una tarea necesita algo que solo la dueña puede dar (cuentas, claves, decisiones), preguntar y esperar. No inventar valores.
- Nunca subir claves al repositorio. Van en `.env.local` (ignorado por git); `.env.example` lleva solo los nombres.
- Si algo del plan es imposible o hay una forma claramente mejor, explicarlo antes de cambiarlo.
- Interfaz en español. Código, nombres de archivos y variables en inglés.
- Respetar el diseño: tokens de color y tipografías de `src/app/globals.css` (copiados del documento de diseño), sin emojis. El oro (`--gold`) es el único acento.
- Dependencias con versiones exactas (`npm install --save-exact`).

## Estructura

```
docs/                  documentos del proyecto
supabase/migrations    SQL versionado
supabase/seed          figuras de constelaciones, palabras bloqueadas
src/app                páginas (público, /admin, /api)
src/sky                lógica pura del cielo (sin dependencias de UI)
src/map                mapa 2D con PixiJS
src/viewer3d           vista 3D con three.js
src/components         interfaz (buscador, tarjeta, paneles)
src/server             acceso a Supabase, Instagram, generación de archivos
scripts                generadores de datos de prueba, cargas masivas
tests/unit             pruebas de lógica (Vitest)
tests/e2e              pruebas de pantallas (Playwright)
```

## Comandos

- `npm run dev` — servidor local en http://localhost:3000
- `npm run build` — compilación de producción
- `npm run lint` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm test` — pruebas unitarias (Vitest)
- `npm run test:e2e` — pruebas de pantallas (Playwright, escritorio y celular). La primera vez: `npx playwright install chromium`
- `npm run db:migrate` — aplica migraciones (`supabase/migrations`) y semillas (`supabase/seed`) en la base de `SUPABASE_DB_URL`
- `npm run render:spiral` — dibuja las primeras 200 constelaciones en `scripts/output/` para revisión visual
- `npm run fake-data -- --days 31 --people 30000 --reset` — simula días con comentarios falsos (`prueba_*`) en Supabase, los procesa y comprueba los totales
- `npm run fake-sky` — escribe un cielo falso de 3 millones de estrellas en `public/dev-sky`; en desarrollo se abre con `http://localhost:3000/?sky=/dev-sky`
- `npm run measure:map` — mide cuadros por segundo y peso de la primera carga como un celular (necesita un servidor en :3300; para el cielo falso compilar con `MSYS_NO_PATHCONV=1 NEXT_PUBLIC_SKY_FILES_URL=/dev-sky npm run build`)
- `npm run measure:viewer` — abre y cierra la vista 3D 20 veces midiendo la memoria, y guarda capturas en `scripts/output/` (necesita un servidor en :3000)
- `npm run test:remote` — comprueba la seguridad del proyecto real de Supabase con la clave pública, y la tarea de cada hora con un Instagram falso
- `npm run cron:schedule -- --url https://dominio` — programa en Supabase la tarea de cada hora (`--check`, `--status`, `--remove`)

Las pruebas de `tests/db` aplican las migraciones desde cero en PGlite (Postgres en memoria) con los
roles de Supabase, así que corren sin conexión. Las migraciones nunca se editan una vez aplicadas:
cada cambio va en un archivo nuevo.
