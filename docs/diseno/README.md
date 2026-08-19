> **Empieza por `INSTRUCCIONES PARA CLAUDE CODE.md`.** Las 4 pantallas de la segunda tanda (Reportes, Estado de cuenta, Detalle de OT, Usuarios) están documentadas en `README - segunda tanda.md`.

# Handoff: Rediseño App Gestión Taller — Multidiagnosticos AS

## Overview

Rediseño completo de la interfaz de **App Gestión Taller**, la herramienta interna de Multidiagnosticos AS (taller automotriz, Sabanalarga / Barranquilla, Colombia) para recepción de vehículos, órdenes de trabajo, inspecciones digitales, inventario, comisiones de técnicos, cotizaciones y facturación electrónica vía Cuentti.

El problema que resuelve no era falta de información: era que **toda la información competía por la misma atención al mismo tiempo**. La restricción del rediseño fue dura y se respetó en las 19 pantallas: **ningún campo, columna ni dato de la app original se eliminó**. Lo que estorbaba se movió, bajó de jerarquía o se colapsó bajo una etiqueta con contador visible.

Usuarios:

- **El dueño (Juan Sebastian, administrador)** — todo el día en el computador del mostrador, 40+ años. Liquida comisiones, factura y cobra. La legibilidad le importa más que la elegancia. Escritorio a 1280px.
- **El jefe de taller** — en el celular, de pie en el piso del taller, a veces con las manos sucias. 390px. Nada depende de `:hover` en móvil; todos los objetivos táctiles son de 44px o más.
- **El cliente final** — en su teléfono, desde un enlace de WhatsApp, **sin login**: entra con su cédula o NIT. Solo ve lo suyo. Es la única superficie pública de la app (Portal Cliente, ~1.338 visitas).

Repositorio de la app en producción: `Juanse99-ai/taller-automotriz-app` (React 19 + Vite, Supabase).

## About the Design Files

Los archivos `.dc.html` de este paquete son **referencias de diseño hechas en HTML** — prototipos que muestran la apariencia y el comportamiento buscados. **No son código de producción para copiar y pegar.**

La tarea es **recrear estos diseños dentro del entorno que ya existe en el codebase** (React 19 + Vite, con los patrones, componentes y utilidades que ya usa la app), no incorporar estos archivos al proyecto. Los archivos abren en cualquier navegador; ábrelos al lado del código para comparar píxel a píxel.

Cada archivo contiene **dos marcos**: el de escritorio (1280px) a la izquierda y el de móvil (390px) a la derecha. El marco móvil no es el de escritorio encogido: es una versión pensada aparte, con jerarquía y controles propios. Ambos deben implementarse.

Los archivos usan un pequeño runtime (`support.js`) que convierte plantillas en React. Es un detalle del prototipo y **no se debe portar**: lo que importa es el marcado, los valores y la disposición resultantes.

## Fidelity

**Alta fidelidad (hifi).** Colores, tipografía, tamaños, pesos, espaciados, radios y estados son definitivos. La UI debe recrearse píxel a píxel con las librerías y patrones ya presentes en el codebase.

Las **cifras y registros son datos de ejemplo** tomados de las capturas de producción (placas, nombres, montos, fechas reales del 18 de agosto de 2026). No los hardcodees: vienen de Supabase.

Dónde la fidelidad es estricta y dónde no:

| Estricto | Flexible |
| --- | --- |
| Altura de fila (38px escritorio), tamaños y pesos de fuente, alineación de columnas, jerarquía de color | Los datos concretos de cada fila |
| Cuántas filas se ven sin scroll (ver "Densidad" abajo) | El orden exacto de los registros de ejemplo |
| Qué está colapsado y con qué etiqueta y contador | Iconografía exacta (usar Lucide, ver Assets) |
| Los 44/48px de objetivo táctil en móvil | — |

---

## Design Tokens

### Color

Gris frío de base, **un solo acento** usado con avaricia, y el resto del color estrictamente semántico.

```
/* Superficies */
--bg-desk        #e9edf2   /* fondo del área de contenido (escritorio) */
--bg-mobile      #eef1f5   /* fondo del área de contenido (móvil) */
--surface        #ffffff   /* tarjetas, tablas, topbar */
--surface-sunken #f8fafc   /* cabecera de tabla, pie de tabla, campos inertes */
--chip           #f1f5f9   /* pastillas neutras, botones de icono, segmented track */
--navy           #0d1b35   /* rail lateral, cabecera móvil, tarjeta de cifra fuerte */

/* Bordes */
--border         #e2e8f0   /* 1px, borde de tarjeta y topbar */
--border-strong  #d7dee7   /* 1.5px, botón secundario y divisores verticales */
--border-input   #dfe5ec   /* 1px, campos y controles */
--row-line       #f4f6f9   /* 1px, separador entre filas de tabla */
--head-line      #e8edf3   /* 1.5px, bajo la cabecera de tabla */

/* Texto */
--text           #0f172a   /* dato principal, títulos, números fuertes */
--text-2         #334155   /* dato secundario, etiquetas de control */
--text-3         #475569   /* subtítulos, unidades, texto de apoyo */
--text-4         #64748b   /* rótulos ALL-CAPS, referencias, metadatos */
--text-5         #94a3b8   /* chevrons, iconos inertes */
--text-empty     #b0bac6   /* valor ausente ("--") que no debe competir */

/* Acento — ÚNICO */
--accent         #1D4ED8   /* botón primario, nav activo, foco, barra de progreso */
--accent-soft    #eff6ff   /* fondo de acción secundaria con acento */
--accent-tint    #e7efff   /* pastilla de contador sobre acento */
--accent-shadow  0 2px 6px rgba(29,78,216,.25)

/* Semántico — solo para estados reales */
--ok-bg      #dcfce7   --ok-fg      #166534
--warn-bg    #fef3c7   --warn-fg    #92400e
--warn-bg-2  #fffbeb   --warn-fg-2  #b45309
--bad-bg     #fee2e2   --bad-fg     #b91c1c
--info-bg    #dbeafe   --info-fg    #1e40af
--purple-bg  #ede9fe   --purple-fg  #5b21b6   /* estado Diagnóstico */
--orange-bg  #ffedd5   --orange-fg  #9a3412   /* estado Esperando Rep. */
--group-bg   #fbfaf7   --group-bg-2 #fdf9f0   /* fila de grupo colapsado */
--group-line #f0e2c8   --group-fg   #78350f   --group-fg-2 #7c6444
```

Prohibido y ausente en todo el rediseño: degradados (de fondo o de texto), glassmorphism, glow, franjas laterales de color, sombras pesadas, tarjetas dentro de tarjetas, emojis como iconos, iconos decorativos, micro-texto de bajo contraste, estados vacíos con ilustración y frase celebratoria.

### Tipografía

Una sola familia en toda la app, la del sistema (tipo iOS):

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
-webkit-font-smoothing: antialiased;
font-variant-numeric: tabular-nums;   /* en el <body>, global */
```

Monoespaciada solo para identificadores que se comparan carácter a carácter (placas, CC/NIT, referencias de producto):

```css
font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
```

Escala en uso (tamaño / interlineado / peso):

| Rol | Escritorio | Móvil |
| --- | --- | --- |
| Título de pantalla (`h1`) | 22px / 1.1 / 700, `letter-spacing:-.3px` | 15px / 1.1 / 700 (en cabecera navy) |
| Subtítulo de pantalla | 12.5px / 1.4 / 400, `--text-3` | 11px / 1.3 / 400, `rgba(255,255,255,.6)` |
| Cifra de cabecera | 26–27px / 1.05 / 700 | 26–32px / 1.05 / 700 |
| Rótulo ALL-CAPS | 9.5px / 1 / 700, `letter-spacing:.9px`, `--text-4` | 10px / 1 / 700, `letter-spacing:.9px` |
| Cabecera de tabla | 9.5px / 1 / 700, `letter-spacing:.7px`, `--text-4` | — |
| Dato principal de fila | 13px / 1.2 / 600 (placa: 13.5px / 700 mono) | 13.5px / 1.25 / 600 |
| Dato numérico de fila | 13px / 1 / 700 (fuerte) · 12.5px / 1 / 400 (apoyo) | 15px / 1.1 / 700 |
| Metadato de fila | 11.5–12.5px / 1 / 400, `--text-4` | 11px / 1 / 400, `--text-4` |
| Botón primario | 13.5px / 1 / 700 | 14px / 1 / 700 |
| Botón secundario | 12.5–13px / 1 / 700 | 13px / 1 / 700 |
| Título de tarjeta | 13.5–14px / 1 / 700 | 14.5px / 1.2 / 700 |
| Pastilla de estado | 10.5–12px / 1 / 600–700, `letter-spacing:.5px` si ALL-CAPS | 11.5px / 1 / 700 |

Reglas: nunca microtexto gris sobre gris; el rótulo se escribe una vez en la cabecera de la tabla, no en cada fila; los números van a la derecha y con `tabular-nums`.

### Espaciado y radios

```
Marco escritorio:  padding 10px, gap 10px entre rail y contenido
Topbar:            altura 48px, padding 0 14px, radius 16px
Tarjeta/tabla:     radius 16px, borde 1px --border
Fila de tabla:     altura 38px, padding 0 18px
Cabecera tabla:    altura 28–30px
Pie de tabla:      altura 38px, fondo --surface-sunken, borde superior 1.5px
Control/pastilla:  altura 36px, radius 999px, padding 0 13–15px
Botón primario:    altura 40px, radius 999px, padding 0 18px
Segmented:         altura 36px, padding 3px, radius 999px; ítem 30px
Marco móvil:       radius 34px; contenido padding 12–14px; gap 8–11px
Fila móvil:        min-height 62–70px, padding 8–10px 12–14px
Botón móvil:       altura 48px, radius 13px; icono 48×48px, radius 13px
Radios:            999px (pastillas y botones) · 16px (tarjetas y tablas)
                   13px (botones móviles) · 11px (campos) · 9px (icono pequeño)
```

Nada de sombras salvo dos: `0 1px 2px rgba(15,23,42,.1)` en el ítem activo de un segmented, y `--accent-shadow` en el botón primario.

### Movimiento

Solo una transición en toda la app: `width .18s ease` en el rail lateral. Sin bounce, sin spring, sin parallax.

---

## Chrome común (idéntico en las 13 pantallas de la app interna)

### Rail lateral (solo escritorio)

- Ancho **86px** en reposo, **212px** al pasar el cursor (`onMouseEnter` / `onMouseLeave`, `transition: width .18s ease`). No es un botón: se abre solo por proximidad. En 86px cada ítem es icono de 19px con su rótulo de 8.5px debajo, centrado; en 212px pasa a fila (icono + rótulo de 12.5px a la derecha, `padding 9px 13px`, `margin 0 9px`, `gap 11px`).
- Fondo `--navy`, `border-radius: 26px`, `padding: 12px 0 10px`, `gap: 5px`, `overflow: hidden`.
- Arriba: logo (`logo-mda.png`, 62×44px, `object-fit: contain`, fondo blanco, radius 12px, padding 3px). Debajo, divisor `1px rgba(255,255,255,.12)`.
- 14 ítems en orden: Dashboard, Recepcion, Trabajos, Inspecciones, Mecanicos, Clientes, Vehiculos, CRM, Cotizaciones, Inventario, Liquidacion, Reportes, Cuentti, Usuarios.
- Ítem activo: fondo `--accent`, texto `#fff`, peso 700. Inactivo: `rgba(255,255,255,.62)`, peso 400.
- Contadores: pastilla azul absoluta (`top:3px; right:5px`, min 16px, `border-radius:8px`, texto 9.5px/700 blanco) sobre Trabajos (12), Cotizaciones (3), Liquidacion (2), Cuentti (10).
- Abajo: avatar circular de 38px (`--accent`, inicial "J" 14px/700), nombre "Juan Sebastian" (8.5px/600 blanco) y rol "Administrador" (8.5px/400 `rgba(255,255,255,.5)`).

**Importante:** el botón "X" que la app tenía en la esquina superior izquierda del topbar **se eliminó**. En escritorio el rail está siempre visible y se expande al pasar el cursor; ese control no hacía nada útil y parecía "cerrar". En móvil el menú sigue siendo un drawer, no depende del cursor.

### Topbar (solo escritorio)

Altura 48px, fondo blanco, borde 1px `--border`, radius 16px, `padding: 0 14px`. Contenido alineado a la derecha: buscador global (34px, ancho 300px, fondo `--chip`, radius 999px, placeholder "Buscar placa, cliente, OT...") y cuatro botones circulares de 34px — móvil, notificaciones (con punto azul de 6px), tema y salir (este último con fondo `#fef2f2` e icono `#dc2626`).

### Barra de título (solo escritorio)

Una sola fila, `align-items: flex-end`: a la izquierda `h1` + subtítulo con los contadores que antes eran tarjetas KPI; a la derecha la cifra que sí exige acción (grande, con su unidad debajo), un divisor vertical de 1px × 44px, y las acciones. Este patrón sustituye las tiras de tarjetas KPI de la app original en todas las pantallas.

### Cabecera móvil

Bloque `--navy` que arranca en la barra de estado (44px, hora 12px/700 blanca a la izquierda, indicadores a la derecha) y sigue con `padding: 8px 14px 13px`: logo de 38×30px, título 15px/700 y línea de contadores 11px/400 en `rgba(255,255,255,.6)`, y a la derecha la acción principal como círculo de 40px. Debajo, el buscador propio de la pantalla: 46–48px, fondo `rgba(255,255,255,.12)`, radius 14px, texto 14px.

---

## Screens / Views

Diecinueve pantallas, en orden de importancia para el negocio. Cada archivo `.dc.html` trae el marco de 1280px y el de 390px.

### 1. Dashboard — `Dashboard - rediseno.dc.html`

**Propósito:** lo primero que ve el dueño al abrir. Qué entró, qué falta cobrar, qué está pasando en el taller hoy.

**Jerarquía:** sube **Por cobrar** ($ 4.420.000 · 10 facturas facturadas sin pagar), que sale de la tira de KPI y pasa a tarjeta `--navy` con su propio botón, porque es la única cifra sobre la que se actúa el mismo día. Ingresos del mes queda como cifra grande con su "Acumulado del 1 al 18 de agosto". El resto de los KPI baja a tira alineada. El saludo ("Hola Juan", "Martes 18 de agosto") se mantiene, en tamaño de subtítulo.

**Nota:** esta pantalla usa `logo-mecanico.png` en el rail y `font-family: Arial` con `'JetBrains Mono'` para las cifras (viene del sistema de diseño original). El resto de las pantallas ya está unificado a la familia del sistema. **Al implementar, unifica el Dashboard al mismo stack tipográfico que las demás.**

### 2. Órdenes de trabajo — `Ordenes de trabajo - rediseno.dc.html`

**Propósito:** la lista de trabajo diaria. 157 OT; se reconoce una por placa, cliente y estado.

- **Sube:** la **placa** (mono, 700, `letter-spacing:.3px`) como primera columna. Cuando la OT es de servicio sin vehículo, la celda dice `SERVICIO` en gris `--text-4` — el dato no se inventa ni se deja vacío.
- **Baja:** `OT-0173` pasa a segunda línea bajo la placa; sirve para nombrar la orden, no para encontrarla.
- **Columnas:** PLACA · CLIENTE + vehículo · TÉCNICO (avatar de iniciales) · ESTADO · COBRO · **TOTAL** · **FECHA**. Total y Fecha son **dos columnas separadas** (98px y 74px), ambas a la derecha: total en 13px/700 negro, fecha en 12px/400 `--text-3`.
- **Filtros:** las 9 pestañas de estado (Activos, Pendientes, Diagnóstico, En Progreso, Esperando Rep., En Prueba, Completados 157, Cancelados, Todas 157) con su contador.
- Filas alternas `#fcfdfe` / `#fff`. Panel derecho de 262px con el detalle de la OT seleccionada ("Sin trabajo seleccionado" cuando no hay) y el resumen del filtro activo.
- **Móvil:** filas de tarjeta con placa grande, cliente, estado y total; Total y Fecha van juntos en la fila porque ahí no hay columnas.

### 3. Generar OT (recepción de vehículo) — `Generar OT - rediseno.dc.html`

**Propósito:** el formulario de ingreso. Es la pantalla de captura más usada del día.

- **Defaults deducidos y marcados:** Año = 2026, fecha de ingreso = hoy (con marca `HOY`), estado inicial = Pendiente, número de OT reservado (OT-0176). Todo prellenado y editable.
- Panel lateral `--navy` con "VEHICULOS EN TALLER", su cifra y los cortes 8 Pendientes / 4 En progreso, más la lista del taller (placa, cliente, vehículo, técnico, estado, ingreso).
- Evidencias de ingreso: espacios para foto por lado del vehículo con su nota.

### 4. Nueva OT desde Trabajos — `Nueva OT desde Trabajos - rediseno.dc.html`

**Propósito:** crear la OT desde la lista de trabajos, con líneas de inventario y mano de obra.

- Cifra fuerte "TOTAL OT" ($ 1.318.000 · 3 líneas · técnico Pedro Barraza) en tarjeta `--navy`, y las líneas de repuestos como lista marcable contra inventario.
- Barra inferior fija en móvil con Total, Cancelar y Guardar.

### 5. Nueva inspección digital — `Inspecciones - rediseno.dc.html`

**Propósito:** la inspección de 51 ítems en 7 secciones. Era la pantalla más pesada: las siete secciones abiertas a la vez, 51 filas de 66px, ~3.400px de scroll.

- **El default cambia el trabajo, no los datos:** los 51 ítems arrancan en **Bien**. El técnico solo marca lo que no lo está (dos o tres cosas en un carro normal). Los tres estados y el `+ Foto` siguen en cada ítem.
- **Una sección abierta a la vez.** Las siete conservan nombre y contador de ítems siempre visibles: Frenos (7), Suspension y Direccion (8), Llantas (5), Exterior del Vehiculo (8), Motor (11), Interior (8), Recomendaciones (4). Las cerradas son filas de 44px que dicen qué pasó dentro: "todo bien" (verde), "2 requieren atención" (ámbar + contador de fotos) o "sin revisar" (gris).
- **Datos del vehículo:** Placa es el único obligatorio, a 16px mono con borde `--accent`; Cliente, Cedula, Vehiculo y Kilometraje se rellenan desde la ficha y lo declaran con la marca verde `DE LA FICHA`; Técnico es el único que se escoge.
- Progreso "38 de 51 revisados" junto a Guardar inspección, con barra de 150×8px.
- Control de estado en escritorio: tres botones de 32×26px en un track `--chip` (✓ verde / ! ámbar / ✗ rojo), más botón de cámara de 30×28px con contador de fotos.
- **Móvil:** una sección a la vez, con placa y progreso fijos arriba. Los tres estados son botones de **48px con palabra** (Bien / Atención / Mal), cámara de 48px con contador, atajo "Todo bien" para la sección completa, y barra inferior "Siguiente: Interior". La nota del hallazgo aparece solo en los ítems marcados.

### 6. Liquidación de comisiones — `Liquidacion de comisiones - rediseno.dc.html`

**Propósito:** el dolor declarado del dueño. Pagarle a un técnico lo que se le debe.

- **Tres pasos, uno por uno:** ¿A quién le pagas? → ¿Qué trabajos le pagas? → ¿Cuánto le pagas? Aire donde se decide una plata; denso donde solo se consulta.
- Tarjeta `--navy` con "NETO A PAGAR HOY" ($ 158.000) y su desglose.
- Pestañas Comisiones / Estado de cuenta. Por técnico: nombre, especialidad y lo que debe (pastilla roja "Debe $ 42.000"). Las OT elegibles se marcan; la mano de obra de cada una se muestra al lado.
- Pie con "4 técnicos con comisión sin liquidar" y "$ 1.482.000 pendientes en total".
- **Móvil:** el marco está a propósito en el estado *sin nada marcado*, con la barra inferior "Ir al paso 2".
- **Supuestos confirmados por el dueño (existen en la app):** descuento elegible con tope, "Nota del pago" y "Últimos pagos a Pedro". Los porcentajes de comisión **no se muestran** en la UI: viven en la lógica.

### 7. Cuentti (facturación electrónica) — `Cuentti - rediseno.dc.html`

**Propósito:** enviar la factura a Cuentti y a la DIAN. La pantalla más riesgosa: un error aquí es un error tributario.

- **Un solo hilo de 5 pasos**, cada uno con su campo dentro: Seleccionar trabajo → Facturar → Emitir DIAN → Pago / Abono → URL · QR. Cada paso lleva su estado (LISTO / EN CURSO / ESPERA EL ID / PENDIENTE) y su acción propia.
- Los tres selectores del paso 2: Trabajo a cobrar, Resolución (Interna · Electrónica DIAN) y Método de pago.
- Panel derecho de 330px: "Estado de envío" con sus 6 hitos y hora (Trabajo seleccionado, Cliente sincronizado, Inventario actualizado, Enviado a Cuentti, Firmado y aprobado DIAN, Pago registrado) y "Últimas facturas" (número, cliente, resolución, valor, estado PAGADA / A CRÉDITO).
- Indicador "Conexión activa" en verde y botón "Probar Conexión". Casilla "Mostrar ya facturados (157)".
- **Cuando el servicio se marca, la OT sale sin placa** — la celda de placa dice `SERVICIO`, no se deja vacía.

### 8. Inventario — `Inventario - rediseno.dc.html`

**Propósito:** 3.460 referencias. ¿Hay o no hay, y a cuánto se vende?

- **Sube:** Producto y Stock. El stock se colorea solo cuando duele: rojo en 0, ámbar por debajo de 5, negro normal, `--text-empty` cuando no aplica. Precio en 13px/700.
- **Baja:** Referencia a mono gris (sirve para confirmar, no para reconocer); Costo gris al lado del precio; Categoría gris y angosta; IVA último y gris.
- **Colapsado 1 — categorías:** las seis pestañas Cat-1…Cat-5 se recogen en un solo control **"Categoría · Todas · 5"**. La columna Categoría sigue en la tabla. Casi todo el catálogo es Cat-1, así que las pestañas no distinguían nada. (Los nombres reales de las categorías siguen pendientes; cuando existan, van en el desplegable con su contador.)
- **Colapsado 2 — SKU de servicio:** las referencias `0`, `-1`, `-2`, `-3` y `MO1` (Servicio, Mas Administracion, Mas Improvistos, Mas Utilidad, MANO DE OBRA) son **SKU de servicios de facturación**, no repuestos. Salen de la lista a un grupo propio, fila de 40px `--group-bg`, etiqueta **"Servicios de facturación"** + contador **5** + los cinco nombres visibles. Un toque lo abre con su costo, precio, utilidad e IVA.
- **Utilidad:** el porcentaje se queda como número; el valor "Revisar" se vuelve pastilla ámbar. Antes eran dos tipos de dato con el mismo peso en la misma columna.
- Cabecera: A REPONER 2.996 (1.303 agotados · 1.213 bajo mínimo · **480 en negativo** en ámbar) y VALOR INVENTARIO $ 448.4M (a costo $ 154.9M). Referencias 3.460 baja a subtítulo.
- **Densidad: 15 filas completas de 38px sin scroll** en el marco de 920px. **Móvil: 5 filas** de 62px.

### 9. Clientes — `Clientes - rediseno.dc.html`

**Propósito:** 850 clientes. Encontrar uno y llamarlo.

- **Sube:** Nombre pasa a primera columna, en negro. Ya no se corta: el más largo de la base ("DALGYS PATRICIA ARENAS BUSTAMANTE") entra completo.
- **Baja:** CC/NIT a segunda posición, mono gris, pero **completa** — antes decía "1065903…" y no servía ni para confirmar.
- **Nada se trunca:** "15 ago 20…" pasa a `15 ago 2026` en una línea; "En Cuentti…" (recortado en las 14 filas de la captura) se vuelve punto verde + **Sí**, o ámbar + **No**.
- **Campo opcional vacío no se pinta.** Teléfono y Email conservan su columna, pero en blanco cuando no hay dato, así se ve de un golpe cuántos faltan.
- De las cuatro cifras, solo **822 sin teléfono** sube a cifra grande en ámbar, porque es la única accionable y explica el botón "Verificar 823 en Cuentti". Las otras tres (850 clientes, 847 verificados con id guardado, 87 con vehículos) bajan a subtítulo. Los tres cortes (Todos 850 / Con vehículos 87 / Sin teléfono 822) se vuelven filtros tocables.
- **Móvil:** el teléfono deja de ser texto y se vuelve **botón de llamar de 44px**; si no hay número, el botón no aparece.
- **Densidad: 18 filas** escritorio, **7** móvil.

### 10. Vehículos — `Vehiculos - rediseno.dc.html`

**Propósito:** 48 placas. Buscar un carro y ver su historial.

- **Propietario** sube a segunda columna: es lo que se lee después de la placa.
- Fechas en **una línea** (`15 ago 2026`); antes "15 de ago de / 2026" rompía el ritmo de fila.
- Los `--` de marca, modelo y año se pintan en `--text-empty` para que no compitan con los llenos.
- Visitas en 700 solo cuando son más de una; en 0, gris claro.
- Las tres cifras (48 placas, 47 con historial, 12 marcas únicas) bajan a subtítulo. El buscador sale de su tarjeta propia y se va a la barra del título, con filtro "Marca · Todas · 12" al lado.
- Pie: "30 vehículos más" y "Sin servicio registrado 1".
- **Densidad: 18 filas** escritorio, **7** móvil (placa 17px mono + ficha + propietario + último servicio y visitas).

### 11. Mecánicos — `Mecanicos - rediseno.dc.html`

**Propósito:** ver el equipo, quién está libre y qué comisión lleva cada uno.

- **Las tres tarjetas idénticas se vuelven tres filas de 62px.** Era una grilla de tarjetas iguales repitiendo nueve rótulos (ACTIVOS / ESTE MES / COMISION, tres veces) para nueve números. En filas el rótulo se escribe una vez y las columnas se comparan de un vistazo: 20 / 18 / 1 trabajos y $ 1.752.000 / $ 954.000 / $ 72.000.
- Nombre y especialidad juntos en la primera columna (antes tenían el mismo peso). ACTIVOS se colorea cuando hay carga y queda gris en 0.
- **Editar** deja de ser un botón del mismo tamaño que "Ver trabajos": se edita un técnico una vez al año, se ven sus trabajos todos los días. Editar queda como lápiz de 38px; Ver trabajos como acción con acento.
- El teléfono pasa a columna mono gris en escritorio y a botón de llamar en móvil.
- TÉCNICOS ACTIVOS 3 y TRABAJOS EN CURSO 0 bajan a subtítulo. COMISIONES DEL MES $ 2.778.000 se queda como cifra grande. El chip "3 técnicos" es ahora el pie de la tabla con los totales de las tres columnas.
- **Bloque "Reparto del mes"** (aprobado por el dueño): qué porcentaje de los $ 2.778.000 se lleva cada técnico, con barra. Sale de datos que ya existían.
- Conmutador Tarjetas / Agenda intacto.
- **Móvil:** aquí sí son tarjetas, porque son tres y hay que tocarlas. Tres cifras con rótulo en una línea, "Ver trabajos" de 48px, llamar y editar de 48px.

### 12. Cotizaciones — `Cotizaciones - rediseno.dc.html`

**Propósito:** cotizar y convertir a OT.

- Los 4 contadores eran cuatro números del mismo tamaño. Ahora **Pendientes 7** y **Valor pendiente $ 4.192.500** van juntos en un bloque ámbar (lo que hay que perseguir), y Total 14 / Aprobadas 6 bajan a los filtros (Todas 14, Pendientes 7, Aprobadas 6, Facturadas 1).
- Líneas de la cotización con búsqueda contra inventario; vacío como etiqueta seca ("Sin items").
- Estados: PENDIENTE (ámbar), APROBADA (verde), FACTURADA (azul).

### 13. CRM · Recordatorios — `CRM - rediseno.dc.html`

**Propósito:** llamar a los clientes a los que les toca mantenimiento.

- Los ~600px de cromo para dos registros se van. Los cuatro contadores (Vencidos 0, Esta semana 0, Total recordatorios 2, Contactados hoy 0) pasan a subtítulo y a los propios filtros; la tabla queda arriba con las dos filas reales.
- **"Faltan 16d" deja de ser verde.** Gris cuando hay margen, ámbar a menos de una semana, rojo si venció. El color semántico ya no dice "tranquilo" al lado de un botón que dice "hazlo ya".
- Columnas: CLIENTE + CC · VEHÍCULO (placa + modelo) · SERVICIO + pastilla `DEFAULT` + frecuencia · ÚLTIMA VISITA + "hace 104d" · VENCE · CONTACTO (llamar 38px, correo 38px, "Contactar" con acento).
- Inactivos (163), Plantillas y Servicios se mantienen como acciones de cabecera; Inactivos 163 aparece además en el pie de tabla y, en móvil, como fila tocable.
- **Móvil:** dos tarjetas con "Contactar" de 48px y correo de 48px; Plantillas y Servicios en la barra inferior.

### 14. Trabajos · Tablero (Kanban) — `Trabajos Kanban - rediseno.dc.html`

**Propósito:** la misma lista de Trabajos vista por estado, para mover una OT de una etapa a la siguiente. Conmutador **Lista / Tablero** en la barra de título.

> **Esta pantalla es una propuesta.** No hubo captura del Kanban actual, así que las columnas se derivaron de los estados que sí aparecen en la lista de Trabajos. Confirma con el dueño antes de implementar.

- **Seis columnas** de ancho igual (~186px, gap 8px): PENDIENTE, DIAGNÓSTICO, EN PROGRESO, ESPERANDO REP., EN PRUEBA, COMPLETADO. Cada una con punto de color de su estado, rótulo ALL-CAPS 11px/700 `letter-spacing:.4px`, contador en pastilla del tono del estado, y **la suma de plata de la columna** en 11.5px/600 debajo.
- **CANCELADO no es columna:** es una pastilla en la cabecera con su contador ("Cancelados 2"). Es lo excepcional; colapsarlo con etiqueta y contador visibles sigue la regla del rediseño.
- Fondo de columna teñido al 2-3% del tono de su estado (`#fffdf8` ámbar, `#f9fbff` azul, `#f9fdfa` verde…) con borde 1px del mismo tono. Es la única concesión de color de fondo, y sirve para no tener que leer el rótulo.
- **Tarjeta** (blanca, borde 1px `#e6ebf1`, radius 11px, padding 9px 10px): placa mono 13px/700 (o `SERVICIO` en gris cuando la OT no tiene vehículo) · cliente 11.5px/600 · vehículo 10.5px/400 gris · pie separado por línea con avatar de técnico de 21px, días en el estado y total 11.5px/700 (`white-space:nowrap`).
- **Antigüedad como color, no como número extra:** punto ámbar a los 4 días en el mismo estado, rojo a los 5+. Es lo que el dueño busca en un tablero: qué se está quedando quieto.
- Columnas con más registros de los que caben muestran pastilla de resto ("156 más", "1 más"); las vacías, una línea gris seca.
- **Móvil:** un tablero de seis columnas no funciona con el dedo. Es **una columna a la vez**: fila de pastillas de estado arriba (con punto y contador, la activa en `--navy`), título de la columna con su conteo y su plata, y las tarjetas con **"Pasar a En Prueba"** de 46px — el siguiente estado por nombre, no un menú — más un botón de más opciones de 46px. Abajo, navegación a la columna anterior y siguiente por nombre.

### 15. Portal Cliente (público, sin login) — `Portal Cliente - rediseno.dc.html`

**Propósito:** el cliente final consulta el estado de su vehículo desde el teléfono, por un enlace de WhatsApp. **No hay login:** la cédula o NIT es la llave. URLs reales: `/portal` pide el documento, `/portal?c=123456` entra directo.

Seis vistas en el archivo: **entrada**, **estado con trabajo activo**, **inspección e historial**, **sin trabajo activo**, **detalle del servicio** y **escritorio 1280**.

**Entrada.** Pantalla `--navy` completa, centrada: logo 96×70, marca 21px/700, "Seguimiento en línea de tu vehículo", y un único campo de 60px con el documento en mono 21px. Botón de 56px. Abajo, el teléfono del taller como **botón de llamar de 52px** (antes era texto en el pie) y la ciudad en una línea.

**Estado con trabajo activo.** Cabecera `--navy`: nombre del cliente, vehículo en 24px/700, placa en pastilla mono y "Orden OT-0147 · ingresó 22 abr 2026". Luego, en orden de lo que el cliente pregunta:
1. **Estado actual** + porcentaje en acento + barra de 9px + **timeline de 6 pasos** (Recibido, Diagnóstico, Repuestos, Reparación, Prueba, Entrega) con punto de 22px: relleno en acento si está hecho, borde en acento si es el actual, gris si falta.
2. **Inspección**: los tres cortes (2 urgentes / 5 sugeridos / 18 en buen estado) como bloques de color semántico, el hallazgo urgente con su nota, y "Ver la inspección completa" de 46px.
3. **Observaciones del técnico** y, en la misma tarjeta, el técnico asignado con avatar de 36px.
4. Barra inferior: **Llamar al taller** de 48px + descargar.

**Inspección e historial.** Tres grupos con glifo, nombre y contador: Reparación urgente (2), Reparación sugerida (5), En buen estado (18). Se listan los primeros ítems de cada grupo con su comentario y el resto queda tras una fila de resumen tocable ("Ver los 3 sugeridos restantes", "Ver los 16 restantes"). Cierra con el historial y "Descargar reporte en PDF" de 48px.

**Sin trabajo activo** (el caso más común: el cliente entra cuando ya le entregaron). La cabecera dice **"Sin vehículos en el taller"** y la fecha del último servicio, en vez de gastar 300px en repetir el nombre del cliente y el título de la sección.

**Historial de servicios — el arreglo principal.** En la app actual cada servicio es una tarjeta con cuatro filas etiqueta-valor (Fecha / Vehículo / Estado / Fotos): ~250px por servicio para cuatro datos, y dos servicios del mismo carro el mismo día se ven **idénticos**. Ahora cada servicio es una fila de una tarjeta compartida: placa mono 16px/700 + **número de OT** al lado, fecha y vehículo en una línea gris, y estado + PAGADO + contador de fotos como pastillas, con el **total** a la derecha en 15px/700.

> Dos datos **subieron desde el detalle a la lista**: el **número de OT** (sin él dos servicios iguales no se distinguen) y el **total**. No son datos nuevos: ya existían en el modal.

**Detalle del servicio.** Hoja inferior sobre el fondo atenuado (`rgba(15,23,42,.45)`), radius 22px arriba: fecha + OT en mono gris, placa en 24px/700 mono, vehículo, X de 36px y estado en pastilla verde. Luego **TRABAJOS REALIZADOS** — una línea por concepto con nombre, detalle ("Repuesto · 2 × $ 50.000") y valor a la derecha —, **Total** en 21px/700, el técnico responsable con avatar de 34px, **FOTOS Y VIDEOS** en miniaturas de 82px, y **OBSERVACIONES** al final en bloque `--surface-sunken`: el VIN y el número de cotización siguen ahí, pero dejan de competir con la plata. Pie: "Descargar en PDF" de 48px + "Cerrar".

**Escritorio 1280.** Cabecera `--navy` a lo ancho con el vehículo a la izquierda y estado + porcentaje + barra de 360px a la derecha; debajo, dos columnas: avance e inspección a la izquierda, observaciones e historial en una columna de 420px.

**Sin emojis.** La versión actual usa 👋, 💡, 📄, ⚠ y ⚐. Todos fuera: iconos Lucide como el resto de la app. También se eliminó la línea de demo ("Para esta demo prueba: 1045678234").

---

## Interactions & Behavior

- **Rail lateral:** `onMouseEnter` → 212px, `onMouseLeave` → 86px, `transition: width .18s ease`. Empuja el contenido (es hermano flex). Solo escritorio.
- **Sin dependencias de hover para funcionar.** El hover es un refuerzo, nunca el único camino: el jefe de taller usa el dedo. En móvil ningún estado depende de hover.
- **Objetivos táctiles:** 44px mínimo, 48px en las acciones principales de móvil. Los botones de estado de inspección y los de llamar/editar son de 48px.
- **Inspección:** los 51 ítems arrancan en Bien; tocar ! o ✗ abre la nota del ítem; "Todo bien" marca la sección completa; "Siguiente: <sección>" avanza. Una sección abierta a la vez; al cerrarse muestra su resumen.
- **Filtros:** el segmented marca el activo con fondo blanco, peso 700 y `0 1px 2px rgba(15,23,42,.1)`; los inactivos van en 600 `--text-3` sobre el track `--chip`.
- **Colapsables:** chevron a la derecha (cerrado) o abajo (abierto); la etiqueta y el contador **siempre visibles**, nunca ocultos tras el colapso.
- **Estados vacíos:** una línea de etiqueta seca en `--text-4` ("Sin trabajo seleccionado", "Sin items"). Sin ilustración, sin título grande, sin frase celebratoria.
- **Responsive:** 1280px y 390px son dos diseños distintos, no un rango. Entre ambos, el rail pasa a drawer y las tablas a filas de tarjeta; la regla es que el móvil conserve los 3-4 datos por los que se reconoce un registro y mande el resto a la segunda línea gris.

## State Management

Estado de UI que exigen estas pantallas (además de los datos de Supabase que ya existen):

| Estado | Dónde | Transición |
| --- | --- | --- |
| `railOpen` | todas (escritorio) | `mouseenter` / `mouseleave` del rail |
| filtro de estado activo | Trabajos, Cotizaciones, CRM, Inventario, Clientes | clic en el segmented |
| categoría seleccionada | Inventario | desplegable "Categoría" |
| grupo "Servicios de facturación" abierto | Inventario | clic en la fila de grupo |
| sección abierta | Inspecciones | clic en la sección o botón "Siguiente" |
| estado por ítem (`ok` / `warn` / `bad`) + nota + fotos | Inspecciones | por ítem; default `ok` |
| paso activo | Cuentti (5), Liquidación (3) | al completar el paso anterior |
| OT marcadas para liquidar | Liquidación | casilla por OT; recalcula el neto |
| descuento aplicado (con tope) | Liquidación | campo + atajos |
| fila seleccionada | Trabajos (panel derecho) | clic en la fila |
| vista Tarjetas / Agenda | Mecánicos | conmutador |
| vista Lista / Tablero | Trabajos | conmutador |
| columna visible | Tablero (móvil) | pastilla de estado o navegación inferior |
| `cedula` + `autenticado` | Portal Cliente | envío del documento; "Salir" limpia el estado y la URL |
| servicio abierto (modal) | Portal Cliente | "Ver detalle" / X / Cerrar |
| grupo de inspección expandido | Portal Cliente | fila de resumen ("Ver los 16 restantes") |

**Densidad como requisito verificable:** el número de filas que se ven sin scroll es parte del diseño, no un accidente. Inventario 15/5, Clientes 18/7, Vehículos 18/7, Trabajos según su marco. Al implementar, la última fila visible debe ser una fila **completa**; nunca media fila rebanada. Si el contenedor real es más alto o más bajo que el mock, ajusta cuántas filas se piden, no la altura de la fila.

## Assets

| Asset | Uso | Origen |
| --- | --- | --- |
| `logo-mda.png` | marca en el rail (62×44) y en la cabecera móvil (38×30) | archivo entregado por el dueño; sustituye al `/logo.png` que el repo referencia pero no tiene |
| `logo-mecanico.png` | variante usada hoy en el rail del Dashboard | ídem |
| Iconos | rail, topbar, filas, botones | **Lucide** — `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"` (2.2–2.6 en botones), `stroke-linecap`/`linejoin="round"`. 19px en el rail, 15px en topbar y filas, 16–20px en botones. Los SVG de los prototipos son Lucide inline; usa el paquete Lucide del codebase en vez de copiarlos. |
| Fotos | evidencias de ingreso (Generar OT) y fotos de inspección | subidas por el usuario, `object-fit: cover` dentro de borde slate |

Sin fotografía, sin ilustraciones, sin texturas, sin patrones.

## Copy

Español de Colombia, sin tildes en las etiquetas de sistema (`Liquidacion`, `Recepcion`, `Tecnico`) tal como está en el codebase; las tildes se conservan en contenido real de usuario (nombres, observaciones). Title Case en nav, sentence case en descripciones, ALL CAPS + `letter-spacing` en rótulos, cabeceras de tabla y pastillas. Sin signos de exclamación, sin emojis.

**Los textos explicativos se eliminaron de toda la interfaz.** No hay frases del tipo "se llenan solos con la placa", "Selecciona un trabajo completado para…", "Al enviar se descuenta inventario…", "Sin items. Agrega una linea y busca…". La UI se explica por su forma; los vacíos son etiquetas secas. **No los reintroduzcas al implementar.**

Moneda en COP con `Intl.NumberFormat('es-CO')`, sin decimales; abreviatura a `$ 448.4M` en cifras de cabecera. Fechas `dd mmm yyyy` en una línea (`15 ago 2026`). Em-dash `—` para el valor ausente en lectura, salvo cuando el campo es opcional y está vacío: entonces no se pinta nada.

## Pendiente (no rediseñado)

Estas vistas existen en la app pero no había captura, así que **no** se rediseñaron y no deben inferirse de este paquete:

- Detalle de una OT ya guardada
- Reportes
- Usuarios

El **Tablero (Kanban)** sí está en el paquete, pero como **propuesta**: se armó sin captura, a partir de los estados de la lista de Trabajos.

Y dos datos que faltan para cerrar Inventario: los **nombres reales de Cat-1 a Cat-5**, y confirmar si los teléfonos ausentes (822 de 850 clientes) se pueden traer de Cuentti en la verificación.

## Files

Cada archivo abre en el navegador y contiene el marco de 1280px y el de 390px (Portal Cliente trae seis marcos).

```
Dashboard - rediseno.dc.html
Ordenes de trabajo - rediseno.dc.html
Trabajos Kanban - rediseno.dc.html
Generar OT - rediseno.dc.html
Nueva OT desde Trabajos - rediseno.dc.html
Inspecciones - rediseno.dc.html
Liquidacion de comisiones - rediseno.dc.html
Cuentti - rediseno.dc.html
Inventario - rediseno.dc.html
Clientes - rediseno.dc.html
Vehiculos - rediseno.dc.html
Mecanicos - rediseno.dc.html
Cotizaciones - rediseno.dc.html
CRM - rediseno.dc.html
Portal Cliente - rediseno.dc.html
Reportes - rediseno.dc.html
Estado de cuenta - rediseno.dc.html
Detalle de OT - rediseno.dc.html
Usuarios - rediseno.dc.html
support.js          runtime del prototipo — NO portar
logo-mda.png        asset
logo-mecanico.png   asset
```
