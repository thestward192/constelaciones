# Conectar Instagram

Guía para que la página lea sola los comentarios de los videos del reto. Se hace una sola vez y
toma unos 20 minutos. Todo es gratis.

Al final tendrás un **token de acceso**: una clave larga que deja a la página leer los comentarios
de tu cuenta. Lo pegas en el panel y la página lo renueva sola cada semana.

> El token es como una contraseña. No lo mandes por chat ni por correo; pégalo solo en el panel.

## 1. Cambiar la cuenta a Profesional

Si la cuenta del reto ya es de Creador o de Empresa, salta al paso 2.

1. En la app de Instagram, abre tu perfil y toca el menú (las tres rayas).
2. Entra a **Configuración y privacidad → Tipo de cuenta y herramientas → Cambiar a cuenta
   profesional**.
3. Elige **Creador** (o Empresa) y una categoría. No hace falta conectar una página de Facebook.

## 2. Crear la app en Meta for Developers

1. Entra a [developers.facebook.com](https://developers.facebook.com) con tu cuenta de Facebook y
   acepta las condiciones de desarrollador si es la primera vez.
2. Ve a **Mis apps → Crear app**.
3. Ponle un nombre, por ejemplo `Constelaciones`, y tu correo.
4. En **Casos de uso**, elige **Administrar mensajes y contenido en Instagram** (en inglés:
   _Manage messaging & content on Instagram_).
5. Si te pregunta por un portafolio comercial, puedes elegir "No quiero conectar un portafolio
   comercial todavía".
6. Termina de crear la app.

La app queda en **modo de desarrollo**, y así se queda: como solo lee tu propia cuenta, no hace
falta que Meta la revise.

## 3. Dar los permisos de comentarios

1. Dentro de la app, abre **Casos de uso** y entra a **Personalizar** en el caso de Instagram.
2. En **Permisos**, revisa que estén agregados estos dos:
   - `instagram_business_basic`
   - `instagram_business_manage_comments` (sin este, Instagram no entrega el nombre de quien
     comentó)

## 4. Generar el token

1. En el mismo caso de uso, abre **Configuración de la API con inicio de sesión de Instagram**.
2. En el paso **Generar tokens de acceso**, toca **Agregar cuenta** y entra con la cuenta del
   reto.
   - Si te dice que la cuenta no es evaluadora: ve a **Roles de la app → Roles**, agrega la cuenta
     del reto como **Evaluador de Instagram**, y acepta la invitación en Instagram
     (**Configuración → Permisos de sitios web → Apps y sitios web → Invitaciones de evaluador**).
     Luego vuelve a este paso.
3. Acepta los permisos que pide Instagram.
4. Al lado de la cuenta aparece **Generar token**. Tócalo y copia el token completo. Dura 60 días;
   la página lo renueva antes de que venza.

## 5. Pegarlo en el panel

1. Abre el panel en **Instagram** (`/admin/instagram`).
2. Pega el token en **Token de acceso de Instagram** y toca **Guardar token**.
3. Si todo está bien, verás "Conectado con @tu_cuenta" y la lista de tus videos recientes.

## 6. Probar con un video

1. En **Videos recientes**, elige el video y el número de día, y toca **Usar**.
2. Desde otra cuenta, comenta en ese video.
3. En la página **Día**, toca **Importar desde Instagram**, luego **Procesar ahora** y
   **Publicar ahora**.
4. Busca la otra cuenta en la página pública: ya debería tener su estrella.

Cuando la página esté publicada con su dominio (fase 13), esto pasa solo cada hora y no hace falta
tocar los botones.

## Si algo falla

- **"El token de Instagram venció o no es válido"**: genera un token nuevo (paso 4) y pégalo otra
  vez en el panel.
- **Aviso de que el token vence pronto**: la renovación automática falló varias veces. Genera uno
  nuevo y pégalo.
- **"No encontré el video del día…"**: el día tiene un enlace de un video que no está entre los
  últimos de la cuenta. Elígelo desde la lista en **Instagram**.
- **Faltan comentarios**: Instagram no entrega comentarios de videos con restricción de edad ni de
  cuentas que restringiste. Tampoco cuentan tus propias respuestas ni los comentarios que ocultaste.
- **Instagram no responde**: el panel muestra el error, y siempre puedes pegar la lista de
  comentarios a mano en la página **Día**.

## Para quien mantiene el código

- API: Instagram API con inicio de sesión de Instagram, `graph.instagram.com`, versión `v26.0`
  (`src/server/instagram/client.ts`). Comentarios: `GET /{media-id}/comments` con
  `fields=id,text,timestamp,username,from,hidden,replies{…}`, 50 por página, siguiendo
  `paging.next`; las respuestas llegan con `replies`.
- El token se guarda en la tabla `instagram_auth` (solo la clave de servicio la lee). También se
  puede poner en `IG_ACCESS_TOKEN`: un valor nuevo ahí reemplaza al guardado. Se renueva con
  `GET /refresh_access_token?grant_type=ig_refresh_token` una vez por semana.
- `IG_APP_ID`, `IG_APP_SECRET` e `IG_USER_ID` no son necesarios con un token generado en el panel de
  la app; quedan en `.env.example` por si algún día se agrega el inicio de sesión completo.
- La tarea cada hora es `POST /api/jobs/hourly` con `Authorization: Bearer CRON_SECRET`. La llama
  Supabase (pg_cron y pg_net): `npm run cron:schedule -- --url https://dominio`. Ver estado con
  `--status`, quitar con `--remove`.
