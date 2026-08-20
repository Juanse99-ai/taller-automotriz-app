# Cómo implementar esto — léeme primero

Vas a implementar 20 pantallas rediseñadas de **App Gestión Taller** (Multidiagnosticos AS), taller automotriz en Sabanalarga, Atlántico. React 19 + Vite + Supabase, ya en producción.

## La regla que manda sobre todas

**El resultado debe verse igual al mockup.** No "inspirado en", no "siguiendo el espíritu de": igual. Los mockups son la especificación, no una sugerencia.

Cuando dudes entre lo que dice este documento y lo que muestra el `.dc.html`, **gana el `.dc.html`**. Cuando dudes entre lo que ya existe en el código y lo que muestra el mockup, **gana el mockup** — salvo que implementarlo exija un campo que la base de datos no tiene, y en ese caso paras y preguntas.

Cómo se logra eso en la práctica:

1. Abre el `.dc.html` de la pantalla en el navegador antes de escribir una línea.
2. Lee los valores del HTML, no los aproximes. Cada `style` inline trae el hex, el `font:`, la altura y el ancho exactos. **Cópialos.** Si el mockup dice `height:38px` la fila mide 38px, no 40. Si dice `font:700 13px`, es 700 y 13px, no `font-semibold text-sm`.
3. Los anchos de columna de las tablas son fijos y están medidos para que las cifras entren completas. `width:98px` en MANO DE OBRA no es arbitrario: con 84px se cortaba "$ 11.940.000". No los cambies por porcentajes ni por `flex:1`.
4. Cuando termines una pantalla, ponla al lado del mockup y compáralas. Las diferencias que veas son defectos.

## El paquete

| Archivo | Qué es |
|---|---|
| **`QA - capturas 20 ago 2026.md`** | **Empieza por aquí si la app ya está implementada.** 11 defectos medidos contra capturas de producción, con qué se ve, qué dice el mockup y qué cambiar. Cuatro son bloqueantes. |
| `README.md` | Las 15 pantallas de la primera tanda: tokens, chrome común, métrica, y por pantalla qué subió, qué bajó y qué se colapsó. |
| `README - segunda tanda.md` | Reportes, Estado de cuenta, Detalle de OT, Usuarios. Mismo formato + 9 preguntas abiertas. |
| `README - Estado de cuenta v2.md` | La segunda versión de Estado de cuenta, con 7 preguntas abiertas propias. |
| 20 × `.dc.html` | Los mockups. Cada uno trae el marco de escritorio 1280px y el de móvil 390px lado a lado; algunos traen tres o más marcos cuando el móvil son varios momentos. |

## Cómo leer un `.dc.html`

**No copies el archivo como componente.** Es un documento de un solo archivo con un runtime propio (`support.js`); no es React de producción.

De él extraes tres cosas:

- **Los valores exactos** — colores hex, `font:` completo, alturas de fila, paddings, radios, anchos de columna, gaps. Todo está en atributos `style` inline, así que se lee directo del HTML sin resolver variables.
- **La estructura de layout** — qué es flex y qué es grid, dónde van los `gap`, qué columna es `flex:1;min-width:0` y qué columna lleva `width` fijo.
- **La jerarquía** — qué dato está en 27px/700 y qué dato está en 11.5px/400. Eso es la decisión de diseño y es lo que hay que conservar.

Los datos (nombres, placas, montos, fechas) son de muestra. Vienen de la app real pero no van escritos en el código: conéctalos a Supabase.

## Las 7 reglas que no se negocian

1. **Ningún campo, columna ni dato desaparece.** Si algo no está donde estaba, el README dice a dónde se movió. Si terminas una pantalla y un campo del original no aparece en ninguna parte, es un error: revísalo contra el README antes de darlo por hecho.
2. **Un solo acento: `#1D4ED8`.** Se usa con avaricia: botón primario, ítem activo del rail, un dato que exige acción. El resto del color es semántico (verde `#166534` / ámbar `#92400e` / rojo `#b91c1c` / azul `#1e40af` / morado `#5b21b6`) y solo para estados reales.
3. **Una sola familia tipográfica** del sistema, con `font-variant-numeric: tabular-nums` global. Monoespaciada solo para identificadores que se comparan carácter a carácter: placas, cédulas/NIT, referencias de repuesto, códigos de OT y de cotización.
4. **Nada depende de `:hover`.** El jefe de taller usa el dedo. En móvil, objetivos táctiles de 44px mínimo y 48px en las acciones principales.
5. **Dos sombras en toda la app:** `0 1px 2px rgba(15,23,42,.1)` en el ítem activo de un segmented, y `0 2px 6px rgba(29,78,216,.25)` en el botón primario. Nada de degradados, glassmorphism, glow, franjas laterales de color ni tarjetas dentro de tarjetas.
6. **Una sola transición:** `width .18s ease` en el rail.
7. **El móvil no es el escritorio encogido.** Cuando un archivo trae varios marcos móviles son varias rutas o estados distintos, no un `@media`.

## Nada de texto explicativo

Los rediseños no tienen frases del tipo "selecciona un trabajo para ver el detalle", "aquí puedes registrar…", ni estados vacíos con ilustración y frase celebratoria. Los vacíos son etiquetas secas: `Sin items.`, `sin movimientos`, `—`. Si al implementar te falta una explicación, es señal de que el layout no está claro, no de que falte una frase.

## Orden de implementación

Primero el chrome, porque es idéntico en las 13 pantallas internas y todo lo demás cuelga de él:

1. **Rail lateral** — 86px en reposo, 212px al pasar el cursor, fondo `#0d1b35`, radius 26px, 14 ítems (Dashboard, Recepcion, Trabajos, Inspecciones, Mecanicos, Clientes, Vehiculos, CRM, Cotizaciones, Inventario, Liquidacion, Reportes, Cuentti, Usuarios). Activo: fondo de acento, texto blanco, peso 700. Contadores en pastilla de acento arriba a la derecha del ítem.
2. **Topbar** — 48px, blanco, radius 16px, alineada a la derecha: buscador de 300px + cuatro botones circulares de 34px (móvil, notificaciones, tema, salir).
3. **Barra de título** — una fila, `align-items:flex-end`. Izquierda: h1 22px/700 + subtítulo 12.5px con los contadores. Derecha: la cifra que exige acción en 26-27px/700, divisor vertical de 1px × 44px, y las acciones.
4. **Cabecera móvil** — bloque `#0d1b35` con logo 38×30, título 15px/700 y línea de contadores 11px/400.
5. **Los primitivos que se repiten** — fila de tabla 38px `padding:0 18px`, cabecera de tabla 28-30px sobre `#f8fafc` con borde inferior de 1.5px, pie de tabla 38px sobre `#f8fafc`, pastilla 36px radius 999px, botón primario 40px radius 999px, segmented 36px con ítem de 30px, pastilla de estado, avatar de técnico.

Después las pantallas, en orden de plata:

Dashboard → Órdenes de trabajo → Generar OT → Detalle de OT → Liquidación de comisiones → Estado de cuenta v2 → Cuentti → Reportes → Cotizaciones → Inventario → Inspecciones → Mecánicos → Clientes → Vehículos → CRM → Trabajos Kanban → Usuarios → Portal Cliente.

## Tres avisos

- **Estado de cuenta va solo en su v2.** `Estado de cuenta - v2.dc.html` reemplaza por completo la versión anterior, que el dueño rechazó ("todo muy esparcido, enredado"). La v1 no está en el paquete.
- **Trabajos Kanban es una propuesta.** No hubo captura del Kanban actual; las columnas se derivaron de los estados que aparecen en la lista de Trabajos. Confirma con el dueño antes de implementarla.
- **Las preguntas abiertas no son opcionales.** 9 en el README de la segunda tanda y 7 en el de Estado de cuenta v2. Cuatro cambian números en pantalla: cómo se calcula el ticket promedio, qué hace exactamente "Por días", el umbral de días para que MÁS ANTIGUO pase a ámbar y a rojo, y si una cuenta A FAVOR se resta del POR COBRAR total.

## Decisiones cerradas en esta última pasada

Tres cosas quedaron definidas y ya están en los mockups; impleméntalas así:

- **AÑO es lista desplegable** en los cuatro formularios que lo piden (Nueva cotización escritorio y móvil, Generar OT, Nueva OT desde Trabajos), con el mismo chevron y alineación que Marca, Modelo y Cilindraje. En **Vehículos** sigue siendo columna de tabla: ahí es dato de lectura, no campo.
- **MÁS ANTIGUO** (Estado de cuenta v2): **gris hasta 30 días, ámbar de 31 a 60, rojo desde 61**. Las comisiones se liquidan por mes, así que un préstamo que sobrevive un ciclo no se descontó y dos ciclos ya es problema.
- **Las cuentas A FAVOR no se restan del POR COBRAR.** Ese total es solo lo que el taller tiene por cobrar; el pie de la lista lo dice: "Por cobrar · 3 de 4 · 0 a favor".

Queda una pendiente: los **nombres reales de las categorías de inventario**. En la app son Cat-1…Cat-5 y casi todo está en Cat-1, así que la pastilla de filtro por categoría no sirve para nada hasta que tengan nombre. No inventes nombres: pregunta.

## Datos que el mockup no puede inventar

En Estado de cuenta v2 **no se dibujaron** medio de pago del movimiento, quién autorizó ni firma: un movimiento en la base es solo `fecha, tipo, monto, nota`. La primera versión los pintó y no se pudieron implementar. Si crees que faltan, es una conversación con el dueño, no un campo que se agrega.

El `Efectivo / Transferencia` que sí aparece en la tabla de movimientos es el de **Cuentti** (el medio con que se registra el gasto en facturación), que es otra cosa.

## Quién usa esto

- **El dueño** (Juan Sebastian, administrador): todo el día en el computador del mostrador, 40+ años, no es técnico. Escritorio a 1280px. La legibilidad le importa más que la elegancia.
- **El jefe de taller**: en el celular, de pie en el piso del taller, a veces con las manos sucias. 390px.
- **El cliente final**: en su teléfono, desde un enlace de WhatsApp, **sin login** — entra con su cédula o NIT. Solo el Portal Cliente.
