# Constelaciones — Documento de diseño

> Complemento de `constelaciones.md` (producto y tecnología).
> Referencia visual: `constelaciones-diseno.html` (prototipo con 600 estrellas de ejemplo, dos constelaciones y vista 3D).
> Todo lo marcado como **Nuevo** todavía no está en el prototipo y se construye en la versión final.

---

## 1. Dirección visual

**Concepto:** un atlas celeste nocturno. El cielo ocupa toda la pantalla y la interfaz flota encima en paneles de vidrio oscuro. Tono profesional y sobrio, sin emojis, sin colores chillones. El protagonismo es de las estrellas.

### 1.1 Colores

| Nombre | Valor | Uso |
|---|---|---|
| Cielo | `#050813` | Fondo general |
| Cielo 2 | `#0b1326` | Degradado del fondo, centro del cielo |
| Panel | `rgba(10,15,30,.80)` + desenfoque 14px | Paneles flotantes |
| Panel sólido | `#0b1122` | Tarjeta de estrella, menús |
| Línea | `rgba(190,202,230,.14)` | Bordes y separadores |
| Tinta | `#eceff6` | Texto principal |
| Tinta 2 | `#a3adc4` | Texto secundario |
| Tinta 3 | `#6d7892` | Etiquetas y ayudas |
| Oro | `#e8cb8f` | Color de acento: botones principales, hilos de luz, anillos, constelación de hoy, progreso |
| Azul | `#9dc3ff` | Estrellas gigantes y detalles fríos |

Regla: el **oro** es el único acento. Se usa para lo importante (acción principal, lo del día, lo de la persona) y nunca como decoración.

### 1.2 Tipografía

| Rol | Fuente | Uso |
|---|---|---|
| Display | **Cormorant Garamond** 500/600 | Nombre del proyecto, nombres de constelaciones, nivel de estrella |
| Texto | **IBM Plex Sans** 400/500/600 | Interfaz, botones, descripciones |
| Datos | **IBM Plex Mono** 400/500 | @usuarios, coordenadas, contadores, etiquetas en mayúsculas |

- Los @usuarios siempre van en mono: se leen como coordenadas, no como texto.
- Etiquetas pequeñas en mayúsculas con espaciado de letras amplio (tipo "CONSTELACIÓN DE HOY").
- Números con cifras tabulares para que los contadores no "bailen".

### 1.3 Movimiento

- Parpadeo suave de cada estrella, con ritmo propio.
- Revelación de la constelación del día: las líneas se dibujan una por una al entrar.
- Viaje de cámara con aceleración suave al buscar una estrella.
- Estrellas fugaces que cruzan el cielo cada pocos segundos con el nombre.
- Si la persona tiene activado "reducir movimiento" en su teléfono, todo se vuelve estático o muy lento.

---

## 2. Estructura de la pantalla

### 2.1 Escritorio
- **Barra superior:** nombre del proyecto, "Día 31 de 365", etapa actual con barra de progreso ("Nuestro Cielo · 2 de 88").
- **Buscador centrado:** "Busca tu estrella", con @ en oro y botón "Buscar". Al tocarlo sin escribir sugiere estrellas.
- **Panel izquierdo:** constelación de hoy, próxima constelación (contador de 300), reto del día con progreso y premio, estrellas fugaces de hoy, niveles de estrella.
- **Tarjeta de estrella a la derecha** al seleccionar una estrella.
- **Controles abajo a la derecha:** acercar, alejar, ver todo.

### 2.2 Celular
- La mayoría de visitas llegan desde la bio de Instagram: el diseño se piensa primero para celular.
- El panel izquierdo se convierte en una **barra inferior plegable** ("Constelación de hoy · El Volcán · Reto 112/150").
- La tarjeta de estrella aparece desde abajo.
- Gestos: arrastrar para mover, pellizcar para zoom, tocar para seleccionar.

---

## 3. Las estrellas en el mapa (2D)

| Nivel | Días | Tamaño | Color | Efecto |
|---|---|---|---|---|
| Chispa | 1 | Muy pequeño | Blanco grisáceo | Brillo tenue |
| Enana roja | 3 | Pequeño | Rojo anaranjado | — |
| Estrella amarilla | 7 | Medio | Amarillo cálido | — |
| Gigante azul | 15 | Grande | Azul | Halo más amplio |
| Supergigante | 30 | Muy grande | Blanco azulado | Halo amplio |
| Nova | 100 | Muy grande | Blanco dorado | Destellos en cruz |
| Supernova | 365 | Máximo | Blanco puro | Destellos en cruz, la más visible |

**Marcas extra:**
- **Anillos dorados** alrededor de la estrella según invitaciones (1 anillo con 5, 2 con 25, 3 con 100).
- **Estela corta dorada** si alguna vez fue estrella fugaz.
- **Hilos de luz:** al seleccionar una estrella, curvas doradas la unen con quien la invitó y con sus invitados.
- **Selección:** círculo dorado con un pulso que se expande.
- Las estrellas de otras constelaciones se atenúan cuando hay una seleccionada.

**Constelaciones:**
- Líneas finas: doradas para la constelación de hoy, gris azulado para las demás.
- Debajo: "CONSTELACIÓN II · HOY" en mono y el nombre en Cormorant grande.

---

## 4. Nuevo: el Sol y los planetas

El mapa deja de ser un fondo plano y pasa a tener un **centro y puntos de referencia**, como un sistema solar.

### 4.1 El Sol: el centro del mapa
- El Sol está en el **centro del universo de Constelaciones**. Es el punto de partida: la constelación I nace a su lado.
- Las constelaciones se van colocando **en espiral alrededor del Sol**, de adentro hacia afuera, en el orden en que se completan. Así el cielo crece hacia afuera sin límite y las primeras constelaciones (las de los primeros días) quedan cerca del centro.
- Visual: esfera dorada cálida con superficie animada y corona amplia, más grande que cualquier estrella de persona para que nunca se confunda con una.
- Al tocarlo, muestra el resumen del reto: total de estrellas, constelaciones, día actual y etapa.
- El botón **"Ver todo"** y el logo siempre regresan al Sol.

### 4.2 Los planetas: hitos del reto
- Los **8 planetas** orbitan el Sol lentamente, entre las constelaciones.
- Cada planeta **aparece cuando la comunidad alcanza un hito**. Mientras no se alcanza, se ve su órbita como una línea punteada tenue y su nombre en gris con la meta.

| Planeta | Aparece al llegar a |
|---|---|
| Mercurio | 1.000 estrellas |
| Venus | 2.500 estrellas |
| Tierra | 5.000 estrellas |
| Marte | 10.000 estrellas |
| Júpiter | 26.400 estrellas (Nuestro Cielo completo, 88 constelaciones) |
| Saturno | 100.000 estrellas |
| Urano | 300.000 estrellas (Vía Láctea completa) |
| Neptuno | 1.000.000 estrellas |

- Al tocar un planeta: su nombre, el hito, el día en que se desbloqueó y la constelación que se completó ese día.
- La aparición de cada planeta es un video especial.
- Cada planeta tiene su aspecto propio en 2D (color, tamaño, anillos de Saturno) y se puede abrir en 3D igual que una estrella.
- Las órbitas son círculos muy finos; nunca tapan las constelaciones.

### 4.3 Más allá del sistema
- Al completar **la Vía Láctea**, el fondo muestra la franja de la galaxia.
- Al llegar a **El Universo**, aparecen otras galaxias lejanas al fondo.

---

## 5. Nuevo: navegación y zoom

### 5.1 Moverse por el mapa
- **Arrastrar** con el dedo o el mouse para moverse libremente por todo el mapa.
- **Inercia:** al soltar, el mapa sigue deslizándose un poco y se frena suave.
- **Doble toque** para acercar en ese punto.
- **Minimapa** en una esquina: muestra el Sol, las órbitas y un recuadro de dónde está la persona. Tocarlo lleva a ese lugar.
- **Atajos:** "Ver todo" (regresa al Sol con todo el mapa visible), "Hoy" (va a la constelación del día), "Mi estrella" (si ya buscó su @, la recuerda en su teléfono).

### 5.2 Zoom mucho más amplio
En el prototipo el zoom va de 0,2x a 8x. En la versión final debe ir **desde ver el universo entero hasta leer el nombre de una sola estrella**. Para eso, el mapa cambia lo que muestra según la distancia (zoom por niveles):

| Nivel de zoom | Qué se ve | Qué se carga |
|---|---|---|
| **Universo** | El Sol, órbitas, planetas, la espiral completa como una nube de luz | Una imagen ligera de la espiral, sin estrellas individuales |
| **Región** | Grupos de constelaciones como manchas de luz con su número | Un punto por constelación |
| **Constelación** | Figuras con sus líneas y nombres | Las estrellas de las constelaciones en pantalla |
| **Estrella** | Cada estrella con su tamaño, anillos y estela | Igual que el anterior |
| **Nombre** | Los @usuarios escritos junto a cada estrella | Igual que el anterior |

- Rango aproximado: de **0,001x a 20x**, para que funcione con 10.000 constelaciones.
- La transición entre niveles es un fundido suave, nunca un salto.
- Al hacer zoom, el punto bajo el dedo o el mouse se queda fijo (zoom hacia donde apuntas).
- Indicador discreto del nivel actual: "Universo · Región · Constelación · Estrella".

---

## 6. Tarjeta de estrella

Contenido, en este orden:
1. Etiqueta "ESTRELLA ENCONTRADA" y el **@usuario** en mono.
2. Coordenadas en oro: "Constelación I · El Colibrí / Estrella 018 de 300 · Nació el día 1".
3. Nivel con su punto de color, días comentando y una escalera de 7 tramos con los alcanzados en oro. Debajo: "Le faltan 2 días para ser Enana roja".
4. Invitada por, hilos de luz (con anillos dibujados), estrella fugaz.
5. Botón principal en oro: **"Ver mi estrella en 3D"**.
6. Botón secundario: **"Ver postal de mi estrella"**.

---

## 7. Vista 3D de la estrella

Pantalla completa sobre fondo de estrellas en 3D. La estrella gira sola despacio; se puede girar arrastrando y acercar con la rueda o pellizcando.

### 7.1 Cada nivel en 3D

| Nivel | Tamaño relativo | Superficie | Efectos |
|---|---|---|---|
| Chispa | 0,55 | Gris azulada, granulación suave | Corona pequeña |
| Enana roja | 0,78 | Roja anaranjada, granulación marcada | Atmósfera rojiza |
| Estrella amarilla | 0,95 | Amarilla cálida, como el Sol | Corona media |
| Gigante azul | 1,18 | Azul y blanca | Corona amplia |
| Supergigante | 1,5 | Blanca azulada, muy activa | Corona que late |
| Nova | 1,3 | Blanca dorada | Corona que late + 4 destellos en cruz |
| Supernova | 1,15 | Blanca con núcleo anaranjado | 8 destellos + onda expansiva de partículas que se repite |

### 7.2 Extras en 3D según la persona
- **Anillos dorados** inclinados, como Saturno: 1, 2 o 3 según invitaciones.
- **Satélite** orbitando con 100 invitados.
- **Corona de puntos de luz** sobre la estrella con 500 invitados.
- **Cometa con estela** orbitando si alguna vez fue estrella fugaz.

### 7.3 Interfaz de la vista 3D
- Arriba a la izquierda: "TU ESTRELLA EN 3D", @usuario, nivel en letra grande, días y lo que falta para el siguiente, y etiquetas con sus extras.
- Abajo: **barra de evolución** con los 7 niveles. Su nivel aparece como "Tu nivel"; los siguientes se ven atenuados pero se pueden tocar para una **vista previa** de cómo se verá ("Así se verá tu estrella al llegar a 100 días").
- Botón de cerrar arriba a la derecha.

### 7.4 Rendimiento
- three.js se descarga **solo la primera vez** que alguien abre una vista 3D.
- Un solo modelo de estrella que cambia con parámetros (tamaño, colores, brillo, efectos); no hay archivos 3D.
- La superficie se calcula en la tarjeta gráfica.
- Mientras el 3D está abierto, el mapa 2D se pausa; al cerrar, el 3D se detiene.
- Calidad limitada en pantallas muy densas para cuidar batería.
- El Sol y los planetas en 3D usan el mismo sistema.

---

## 8. Postal para historias

Formato vertical 1080 × 1920:
- Arriba: "MI ESTRELLA" y el nombre del proyecto.
- Centro: la constelación de la persona con sus líneas y su estrella marcada con doble círculo dorado.
- Abajo: @usuario en oro, constelación, número de estrella, día y nivel.
- Cierre: "Busca la tuya · link en la bio".
- **Nuevo:** opción de postal con la estrella en 3D (una captura de la vista 3D en ese momento).

---

## 9. Textos de la interfaz

- Directos y en segunda persona: "Busca tu estrella", "Ver mi estrella en 3D".
- Sin tecnicismos: se dice "estrellas", "constelaciones", "hilos de luz", nunca "registros" o "usuarios".
- Mensajes de error que dicen qué pasó y qué hacer: "No hay ninguna estrella con ese nombre todavía", "No se pudo cargar la vista 3D. Revisa tu conexión e inténtalo de nuevo".

---

## 10. Pendientes de diseño

- Nombre final y logo.
- Aspecto exacto de cada planeta en 2D y 3D.
- Diseño del minimapa.
- Figuras de las primeras 88 constelaciones.
- Animación de aparición de cada planeta para los videos.
