# Instrucciones para Claude Code

Estás implementando 19 pantallas rediseñadas de **App Gestión Taller** (Multidiagnosticos AS), una app interna de un taller automotriz en Sabanalarga, Atlántico. React 19 + Vite + Supabase, ya en producción.

## Cómo leer este paquete

1. **`README.md`** — las 15 pantallas de la primera tanda. Trae los tokens del sistema, el chrome común (rail, topbar, barra de título, cabecera móvil), la métrica, y por pantalla: qué subió de jerarquía, qué bajó y qué quedó colapsado.
2. **`README - segunda tanda.md`** — las 4 pantallas nuevas (Reportes, Estado de cuenta, Detalle de OT, Usuarios) con el mismo formato, más 9 preguntas abiertas al final.
3. **Los 19 `.dc.html`** — cada archivo es el mockup. Ábrelo en el navegador: trae el marco de escritorio 1280px y el de móvil 390px lado a lado. Algunos traen tres marcos cuando el móvil son dos momentos distintos.

## Cómo leer un `.dc.html`

No los copies como componentes. Son documentos de un solo archivo con un runtime propio (`support.js`); no son React de producción.

Lo que sí debes extraer de ellos:

- **Los valores exactos**: colores hex, tamaños de fuente y pesos, alturas de fila, paddings, radios, anchos de columna. Están todos en atributos `style` inline, así que se leen directo del HTML sin resolver ninguna variable.
- **La estructura de layout**: qué es flex, qué es grid, dónde van los `gap`, qué columna es `flex:1 min-width:0` y qué columna es `width` fija.
- **La jerarquía**: qué dato está en 27px/700 y qué dato está en 11.5px/400. Eso es la decisión de diseño, y es lo que hay que conservar.

Los datos (nombres, placas, montos, fechas) son de muestra. Vienen de la app real pero no van escritos en el código: conéctalos a Supabase.

## Reglas que no se negocian

1. **Ningún campo, columna ni dato desaparece.** Si algo no está donde estaba, el README dice a dónde se movió. Si implementas una pantalla y un campo del original no aparece en ninguna parte, es un error tuyo o mío: revísalo contra el README antes de darlo por hecho.
2. **Un solo acento: `#1D4ED8`.** El resto del color es semántico (verde/ámbar/rojo/azul/morado) y solo para estados reales.
3. **Una sola familia tipográfica** del sistema, con `font-variant-numeric: tabular-nums` global. Monoespaciada solo para identificadores que se comparan carácter a carácter: placas, cédulas/NIT, referencias de repuesto, códigos de OT.
4. **Nada depende de `:hover`.** El jefe de taller usa el dedo. En móvil, objetivos táctiles de 44px mínimo y 48px en las acciones principales.
5. **Dos sombras en toda la app**, las que están en el README. Sin degradados, glassmorphism, glow, franjas laterales de color ni tarjetas dentro de tarjetas.
6. **Una sola transición**: `width .18s ease` en el rail.
7. **El móvil no es el escritorio encogido.** Cuando el archivo trae dos marcos móviles, son dos rutas o dos estados distintos, no un `@media`.

## Orden sugerido de implementación

El chrome primero, porque es idéntico en las 13 pantallas internas y todo lo demás cuelga de él:

1. Rail lateral (86px → 212px al pasar el cursor) + topbar de 48px + patrón de barra de título.
2. Cabecera móvil navy.
3. Los primitivos que se repiten: fila de tabla de 38px, cabecera de tabla de 28-30px, pie de tabla sobre `--surface-sunken`, pastilla de 36px, botón primario de 40px, segmented de 36px, pastilla de estado, avatar de técnico.

Después las pantallas, en orden de plata:

Dashboard → Órdenes de trabajo → Generar OT → Detalle de OT → Liquidación de comisiones → Estado de cuenta → Cuentti → Reportes → Cotizaciones → Inventario → Inspecciones → Mecánicos → Clientes → Vehículos → CRM → Trabajos Kanban → Usuarios → Portal Cliente.

## Dos avisos

- **Trabajos Kanban es una propuesta.** No hubo captura del Kanban actual; las columnas se derivaron de los estados que aparecen en la lista de Trabajos. Confirma con el dueño antes de implementarla.
- **Las 9 preguntas abiertas** del README de la segunda tanda no son opcionales para Reportes y Estado de cuenta: dos de ellas cambian números en pantalla (cómo se calcula el ticket promedio, qué hace exactamente "Por días").

## Quién usa esto

- **El dueño** (Juan Sebastian, administrador): todo el día en el computador del mostrador, 40+ años, no es técnico. Escritorio a 1280px. La legibilidad le importa más que la elegancia.
- **El jefe de taller**: en el celular, de pie en el piso del taller, a veces con las manos sucias. 390px.
- **El cliente final**: en su teléfono, desde un enlace de WhatsApp, sin login — entra con su cédula o NIT. Solo el Portal Cliente.
