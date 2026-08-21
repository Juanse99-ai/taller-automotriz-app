---
name: Multidiagnósticos AS
description: Herramienta de taller donde la plata se lee de un vistazo y ningún efecto estorba al dato.
colors:
  azul-orden: "#1D4ED8"
  navy-taller: "#0d1b35"
  papel: "#ffffff"
  mesa: "#e9edf2"
  papel-tenue: "#f8fafc"
  tinta: "#0f172a"
  tinta-2: "#334155"
  tinta-3: "#475569"
  tinta-4: "#57677d"
  tinta-inerte: "#94a3b8"
  linea: "#e2e8f0"
  linea-firme: "#d7dee7"
  linea-campo: "#dfe5ec"
  verde-cobrado: "#166534"
  verde-cobrado-bg: "#dcfce7"
  ambar-revisar: "#92400e"
  ambar-revisar-bg: "#fef3c7"
  rojo-debe: "#b91c1c"
  rojo-debe-bg: "#fee2e2"
typography:
  display:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "1.05"
    letterSpacing: "-0.3px"
  headline:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "1.1"
  title:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: "1.3"
  body:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: "1.55"
  label:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "9.5px"
    fontWeight: 700
    letterSpacing: "0.9px"
  mono:
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 600
    fontFeature: "tabular-nums"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.azul-orden}"
    textColor: "{colors.papel}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
    typography: "{typography.title}"
  button-outline:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-sm:
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "38px"
  input:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    padding: "10px 13px"
    height: "42px"
  input-focus:
    backgroundColor: "{colors.papel}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.papel}"
    rounded: "{rounded.lg}"
    padding: "18px"
  badge:
    rounded: "{rounded.pill}"
    padding: "3px 10px"
    typography: "{typography.label}"
  chip-filtro:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta-2}"
    rounded: "{rounded.pill}"
    padding: "0 13px"
    height: "36px"
  nav-item:
    textColor: "{colors.tinta-2}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  nav-item-active:
    backgroundColor: "{colors.azul-orden}"
    textColor: "{colors.papel}"
    rounded: "{rounded.sm}"
---

# Design System: Multidiagnósticos AS

## 1. Overview

**Creative North Star: "El libro de cuentas del mostrador"**

Un libro de cuentas bien llevado no decora: alinea. Las columnas cuadran, los
números se leen sin acercarse, y lo que está mal salta antes de que te lo
cuenten. Ese es el sistema. La app se usa de pie en el mostrador, con luz de
taller, mientras alguien espera su carro, y por eso todo lo que no ayuda a leer
una cifra o a decidir un cobro sobra.

La superficie es papel: blanco sobre una mesa gris azulada, con líneas finas en
vez de sombras. La elevación casi no existe. Un solo azul de orden marca lo que
está activo y lo que se puede pulsar; el navy sostiene la navegación y la única
cifra por pantalla sobre la que se aprieta un botón. Todo lo demás es tinta en
cinco pesos. La densidad es alta donde se trabaja (tablas de 38px de fila) y se
abre donde se decide (el paso de pago vive en una columna de 660px, no estirado
a 1.500).

Lo que este sistema rechaza está escrito en PRODUCT.md y se cumple al pie de la
letra: nada de glassmorphism, degradados de texto, franjas laterales de color ni
tarjetas idénticas en grilla. Y nada de micro-texto gris claro: los usuarios
tienen 40 y pico y leen esto todo el día.

**Key Characteristics:**
- Papel blanco sobre mesa gris azulada; el borde separa, no la sombra
- IBM Plex Sans para leer, IBM Plex Mono para toda cifra que se compare
- Un azul de orden (#1D4ED8) reservado a lo activo y lo pulsable
- Rojo, ámbar y verde solo como estado contable, nunca como decoración
- Pastillas (999px) para controles, 16px para tarjetas: dos formas, sin medias tintas
- Objetivo táctil de 44px en móvil, sin excepción

## 2. Colors

Una paleta de oficina con un solo acento y tres colores que solo hablan de plata.

### Primary
- **Azul de orden** (#1D4ED8): lo activo y lo pulsable. Ítem de navegación
  seleccionado, botón primario, anillo de foco, contador sobre el rail. En modo
  oscuro sube a #4c8dff para mantener el contraste sobre superficie negra.
- **Azul de orden tenue** (#eff6ff): fondo del anillo de foco y de los estados
  seleccionados suaves. Nunca como fondo de sección.

### Secondary
- **Navy de taller** (#0d1b35): el rail de navegación y la tarjeta de la única
  cifra por pantalla sobre la que se aprieta un botón (el neto a pagar). Es
  estructura y momento de decisión, no color de marca repartido.

### Tertiary
Los tres colores contables. Cada uno viene en par fondo/texto y **solo** aparece
sobre un dato de dinero o de estado, nunca sobre texto corrido.
- **Verde cobrado** (#166534 sobre #dcfce7): saldado, al día, comisión ganada.
- **Ámbar revisar** (#92400e sobre #fef3c7): bajo mínimo, pendiente, utilidad
  sospechosa.
- **Rojo debe** (#b91c1c sobre #fee2e2): deuda, sin stock, stock en negativo.

### Neutral
- **Tinta** (#0f172a): dato principal, títulos, números fuertes.
- **Tinta 2** (#334155): dato secundario, etiquetas de control.
- **Tinta 3** (#475569): subtítulos, unidades, apoyo.
- **Tinta 4** (#57677d): rótulos en versalita, referencias, metadatos. Este valor
  es deliberado: #64748b pasaba 4,76:1 sobre tarjeta blanca pero solo 4,05:1
  sobre la mesa gris, donde también se usa.
- **Tinta inerte** (#94a3b8): chevrones e iconos que no se pulsan. Prohibido para
  texto.
- **Papel** (#ffffff), **Mesa** (#e9edf2), **Papel tenue** (#f8fafc): las tres
  superficies. La mesa es el fondo de la aplicación, el papel son las tarjetas y
  el papel tenue las cabeceras y pies de tabla.
- **Línea** (#e2e8f0), **Línea firme** (#d7dee7), **Línea de campo** (#dfe5ec).

### Named Rules

**La Regla del Navy Único.** El navy pinta el rail y **una sola** cifra por
pantalla: aquella sobre la que hay un botón. Dos tarjetas navy en la misma
pantalla es un error. Si el valor es cero, la tarjeta no se pinta.

**La Regla del Color Contable.** Rojo, ámbar y verde no describen importancia:
describen un estado de plata. Un título en rojo porque "es importante" está mal.

**La Regla de los Semánticos.** Se usa `var(--text-3)`, nunca `#475569`. El modo
oscuro redefine 76 tokens; un hex a mano no se entera y se queda blanco sobre
negro.

## 3. Typography

**Display / Body Font:** IBM Plex Sans (con `-apple-system`, `system-ui`, `Segoe UI`, `Roboto` de respaldo)
**Mono Font:** IBM Plex Mono (con `ui-monospace`, `SFMono-Regular`, `Menlo` de respaldo)

Ambas auto-hospedadas, solo el subconjunto latin y solo los pesos 400, 500, 600
y 700. El navegador baja 80 KB en el primer arranque y los cachea. Antes la app
tomaba la fuente del sistema y se veía distinta en el Mac del dueño, en el PC del
mostrador y en el Android del mecánico.

**Character:** Plex es una familia técnica e industrial, dibujada para contextos
de ingeniería. Su cero va sin raya, que en una columna de Stock importa: un cero
cruzado se lee como error de impresión. La pareja Sans/Mono comparte esqueleto,
así que una placa en mono junto a un nombre en sans no parecen dos aplicaciones.

### Hierarchy
- **Display** (700, 32px, 1.05): la cifra grande de una tarjeta navy. Una por pantalla.
- **Headline** (700, 22px, 1.1, -0.3px): título de página.
- **Title** (700, 15px, 1.3): título de tarjeta, botón primario, nombre de persona.
- **Body** (400, 13.5px, 1.55): celda de tabla, campo de formulario, texto corrido.
- **Label** (700, 9.5px, +0.9px, versalita): rótulos de columna y de campo.
- **Mono** (600, 13px, `tabular-nums`): toda cifra que se compare con otra, más
  placas y códigos de OT.

### Named Rules

**La Regla de la Columna que Cuadra.** Cualquier número que aparezca encima o
debajo de otro va en Mono con `tabular-nums`. Sin eso las columnas de plata
bailan y la tabla deja de leerse de un vistazo.

**La Regla del Peso 800.** No existe. Plex llega a 700; un `font-weight:800`
suelto cae al 700 sin negrita sintética. No lo escribas.

## 4. Elevation

Este sistema es **plano por defecto**. La tarjeta principal (`.card`) lleva
`box-shadow: none` y se separa del fondo con un borde de 1px y un cambio de
superficie: papel blanco sobre mesa gris azulada. La profundidad se consigue
apilando superficies, no oscureciendo el aire alrededor.

Las sombras existen y están tokenizadas, pero son excepción: solo aparecen
cuando algo se levanta de verdad sobre el plano, es decir cuando flota.

### Shadow Vocabulary
- **`--shadow-sm`** (`0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.03)`): botón primario y segmentos.
- **`--shadow`** (`0 2px 6px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)`): elemento levantado en reposo.
- **`--shadow-md`** (`0 6px 18px rgba(15,23,42,.10), 0 2px 6px rgba(15,23,42,.05)`): desplegables y menús flotantes.
- **`--shadow-lg`** (`0 18px 40px rgba(15,23,42,.16), 0 4px 12px rgba(15,23,42,.06)`): el cajón de navegación del teléfono.
- **Modal** (`0 30px 80px -20px rgba(0,0,0,.4)`): el único caso de sombra dramática, y es correcta porque el diálogo tapa la aplicación entera.

En modo oscuro la elevación deja de ser sombra y pasa a ser superficie más borde:
`--bg` #000000, `--bg-raised` #1c1c1e, `--bg-subtle` #151517.

### Named Rules

**La Regla de lo Plano en Reposo.** Una superficie quieta no lleva sombra. La
sombra es respuesta a un estado: flotar, abrirse, tapar. Si una tarjeta que no se
mueve lleva sombra, sobra.

## 5. Components

### Buttons
- **Forma:** pastilla completa (`999px`). No hay botones de esquina cuadrada.
- **Tamaños:** 44px de alto con texto de 15px (por defecto), y 38px con 13,5px
  (`sm`) para acciones dentro de una fila de tabla. Solo dos. Un tercer alto es un error.
- **Primario:** azul de orden con texto blanco y `0 1px 2px rgba(15,23,42,.12)`.
- **Outline:** papel con borde `--border-strong`, para la acción secundaria de la fila.
- **Ghost:** transparente con tinta 2, para acciones terciarias.
- **Danger:** rojo #dc2626 con texto blanco, solo para destruir.
- **Hover / Focus:** transición de 160ms en fondo y borde, 140ms en `transform`.
  El foco visible es obligatorio.
- **Desactivado:** el rótulo dice **por qué**, no se queda gris y mudo. «Escribe
  un monto» en vez de «Registrar» apagado.

### Chips
- **Estado** (`.hd-chip` / `.badge`): pastilla en versalita, 9,5-11px, peso 700,
  `+0.4px` de espaciado. Usa un par fondo/texto de los tres colores contables.
- **Filtro** (`.hd-drop`): pastilla de 36px con borde `--border-input` sobre
  papel, texto de 12,5px. Es el vocabulario de campo de una fila de filtros.

### Cards / Containers
- **Esquina:** 16px (`--r-lg`).
- **Fondo:** papel (#ffffff) sobre la mesa (#e9edf2).
- **Sombra:** ninguna. Ver Elevation.
- **Borde:** 1px `--border`.
- **Relleno interior:** 18px por defecto; `0` cuando la tarjeta contiene una
  tabla a sangre.
- **Prohibido anidar tarjetas.** Una tarjeta dentro de otra es siempre un error
  de estructura.

### Inputs / Fields
- **Estilo:** 42px de alto mínimo, esquina de 12px (`--r-md`), borde
  `--border-strong` sobre papel, texto de 13,5px.
- **Foco:** el borde pasa al azul de orden y aparece un anillo de
  `0 0 0 3px var(--accent-soft)`.
- **Campo de fila** (`.hd-drop`): 36px y pastilla, para filas de filtros donde el
  campo convive con chips y botones pequeños. En una misma fila **todos** los
  campos usan el mismo alto y la misma esquina.
- **Cuidado con `MoneyInput`:** su prop `className` **sustituye** a la de por
  defecto (`input`), no se suma. Pasarle una clase suelta deja el campo sin
  ancho, sin radio y sin alto. Se le pasa `"hd-drop ec-monto"`, no `"ec-monto"`.

### Navigation
- **Rail de escritorio:** navy, 86px en reposo y 212px al pasar el cursor. **El
  rótulo se ve siempre**, también a 86px: eso es lo que lo distingue de una tira
  de iconos que hay que adivinar. Comportamiento pedido y confirmado por el
  dueño; no proponer solo-clic.
- **Cajón del teléfono:** 280px, ítems de 44px con rótulo, contador a la derecha,
  nombre del taller arriba y del usuario abajo.
- **Ítem:** 10px 12px de relleno, esquina de 8px, tinta 2. Activo: fondo azul de
  orden con texto blanco y peso 700.

### Avatar
Círculo de 32px con dos iniciales en peso 800 a 11px, en una de cinco variantes
de color (`.av-1` a `.av-5`) asignada por la posición de la persona en su lista.
La misma persona debe llevar el mismo color en toda la aplicación.

## 6. Do's and Don'ts

### Do:
- **Do** usar los tokens semánticos (`var(--text-3)`, `var(--bg-raised)`), nunca
  el hex crudo. El modo oscuro redefine 76 tokens.
- **Do** poner toda cifra comparable en `.mono` con `tabular-nums`.
- **Do** quedarse en los dos altos de botón, 44px y 38px, y en los seis escalones
  de radio (`--r-xs` 4 a `--r-2xl` 24, más la pastilla).
- **Do** darle a cada control táctil 44px de alto en móvil (`var(--tap)`), salvo
  cuando el objetivo real es la fila o el `<label>` que lo contiene.
- **Do** decir en el rótulo de un botón desactivado qué falta para activarlo.
- **Do** comprobar el contraste sobre **la mesa** (#e9edf2), no solo sobre papel:
  es el fondo donde más rótulos viven y es 0,7 puntos más exigente.
- **Do** declarar el borde a mano en cualquier componente de shadcn que sea un
  `<button>`: la línea `button{border:none}` de `index.css` va fuera de `@layer`
  y en la cascada le gana a las utilidades de Tailwind.

### Don't:
- **Don't** usar **glassmorphism**, **degradados de texto**, **franjas laterales
  de color** (`border-left` decorativo de más de 1px) ni **tarjetas idénticas en
  grilla**. Son las anti-referencias de PRODUCT.md y el dueño las detecta.
- **Don't** montar el **hero-metric con gradiente** ni ningún **dashboard
  genérico de plantilla SaaS**.
- **Don't** usar **micro-texto ni bajo contraste**: nada de `--text-5` en texto,
  ni iconos a opacidad 0,55. Los usuarios tienen 40 y pico.
- **Don't** pintar dos tarjetas navy en la misma pantalla, ni pintarla cuando el
  valor es cero.
- **Don't** anidar una tarjeta dentro de otra.
- **Don't** escribir `font-weight:800`: Plex llega a 700.
- **Don't** proponer el rail solo-clic. El hover-expand es decisión del dueño,
  confirmada el 2026-08-19.
- **Don't** dejar un `position:sticky` encima de campos que hay que llenar. Si el
  elemento fijo tapa contenido interactivo, el fijo sobra.
- **Don't** meter filtros por categoría en Inventario: el 97,3% del catálogo es
  Cat-1 y no separan nada.
