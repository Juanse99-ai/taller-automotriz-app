# Estado de cuenta — v2

Rediseño de **Estado de cuenta** (préstamos a técnicos y terceros), dentro de Liquidación.

Archivo: `Estado de cuenta - v2.dc.html` — cuatro marcos: escritorio 1280, y tres móviles de 390 (Quién debe · La cuenta · Registrar movimiento).

---

## El diagnóstico que se atacó

La v1 eran cuatro bloques apilados, cada uno con su cabecera. Para entender una cuenta había que recorrer la pantalla en vertical. La v2 es **dos columnas y tres bloques**:

```
┌─ barra de título ──────────────────────────────────────────┐
│ Liquidación · conmutador     POR COBRAR $704.000 │ PDF     │
├──────────────┬─────────────────────────────────────────────┤
│ LISTA        │ LA CUENTA  (una sola tarjeta)               │
│ 4 cuentas    │  ├─ identidad + DEBE                        │
│ filas de 60px│  ├─ 4 contadores + Saldar la cuenta         │
│ pie: total   │  ├─ registrar movimiento  (fila hundida)    │
│              │  └─ Calcular por días (plegado)             │
│              ├─────────────────────────────────────────────┤
│              │ MOVIMIENTOS (tabla, filas de 38px)          │
│              ├─────────────────────────────────────────────┤
│              │ Liquidado y entregado por técnico (plegado) │
└──────────────┴─────────────────────────────────────────────┘
```

La columna izquierda responde "¿quién me debe y cuánto?" sin tocar nada. La derecha es **una sola tarjeta** con divisores de 1px, no tres tarjetas: la identidad, el saldo, los contadores y el formulario están en el mismo objeto visual, así que registrar no obliga a bajar la vista.

---

## Qué subió de jerarquía

**El formulario de registro subió del fondo al segundo renglón de la cuenta.** Es el momento de mayor uso (con la persona al frente, plata en mano) y era lo último de la pantalla. Ahora es una **sola fila** de campos —TIPO · PERSONA · MONTO · FECHA · Registrar— sobre `--surface-sunken`, pegada al bloque de la cuenta. PERSONA llega **prellenada con la cuenta elegida** (avatar incluido), MONTO es el único campo con borde de acento, y FECHA trae "HOY" marcado. Cinco segundos, sin buscar.

**MÁS ANTIGUO subió a color.** 60 días en `--bad-fg` con su rótulo también en rojo, no en gris. Es el dato que le dice si insistir; era un contador más entre seis.

**El saldo corrido es ahora una columna propia** (SALDO, alineada a la derecha, junto a MONTO). En la v1 solo se veía el total al pie; ahora se lee la deuda después de cada movimiento sin sumar mentalmente.

**MONTO usa signo, no solo color.** `+ $ 50.000` en préstamos, `− $ 30.000` en abonos, y el abono además en verde. El signo funciona sin depender del color.

---

## Qué bajó de jerarquía

**"Saldar la cuenta" pasó de botón lleno a botón de borde**, al final de la fila de la cuenta. Es lo raro; competía con Registrar, que es lo diario.

**Los cuatro contadores** (PRESTADO · ABONADO · MOVS. · MÁS ANTIGUO) dejaron de estirarse junto al nombre y el saldo: ahora son su **propio renglón** dentro de la misma tarjeta, cuatro bloques de ancho igual sobre `--surface-sunken`, con rótulo de 9px y cifra de 14.5px. El primer renglón queda solo con lo que identifica la cuenta (nombre, rol, desde, DEBE); el segundo con los números de apoyo y "Saldar la cuenta" al final.

**"Cuenta abierta desde 20 jun 2026"** bajó a metadato de 11.5px bajo el nombre.

**La nota del formulario** bajó al renglón de abajo, junto a "Calcular por días": se llena una de cada veinte veces y le estaba quitando ancho a PERSONA, que es el campo que dice de quién es la plata. Sigue en la fila de captura, un renglón más abajo y a ancho completo. **La nota de la tabla** (casi siempre vacía) es la columna elástica: se lleva el sobrante de ancho y cuando está vacía se pinta `—` en `--text-empty`, no un espacio en blanco que parece un error.

---

## Qué se dejó de repetir

El problema no era solo el orden: las mismas cifras salían tres veces.

| Cifra | v1 | v2 |
|---|---|---|
| POR COBRAR total | cabecera **y** pie de la lista | cabecera como cifra grande; el pie de la lista lo mantiene pero **añade contexto**: "Por cobrar · 3 de 4 cuentas · $ 704.000" |
| Saldo de la cuenta elegida | fila de la lista **+** banda (DEBE) **+** pie de la tabla ("Debe $ 70.000") | fila de la lista (chico) + DEBE en 26px (grande). El pie de la tabla **ya no lo repite**: la columna SALDO lo dice en su primera fila, que es exactamente la deuda actual |
| Pie de la tabla | "5 movimientos · $200.000 prestado, $130.000 abonado" + "Debe $70.000" | mismo texto, y en el hueco que dejó "Debe" ahora va **"1 abono sin registrar en Cuentti"** — información nueva, no repetida |

---

## Cuentti: dejó de duplicar las filas

En la v1 las tiras de Cuentti se intercalaban **entre** las filas de movimientos y casi doblaban el alto de la tabla. En la v2 Cuentti es **una columna de 176px dentro de la propia fila de 38px**, con tres estados:

- abono elegible sin registrar → mini-segmented `Efectivo / Transf.` (28px) + botón `Cuentti`. **Un solo toque**, sin abrir nada.
- abono ya registrado → chip verde `Cuentti · GT-4471`.
- préstamo o cuenta de técnico → `—`.

La tabla pasó de ~9 filas visuales para 5 movimientos a exactamente 5.

En móvil, donde 176px no caben en la fila, los controles de Cuentti aparecen como una segunda línea de **44px** solo en el abono que los necesita.

---

## Qué quedó plegado, y bajo qué etiqueta

| Etiqueta visible | Contador / pista visible | Qué hay dentro |
|---|---|---|
| **Calcular por días** | "valor por día × días = monto" | la calculadora del monto. Vive en el pie del formulario, compartiendo renglón con NOTA, a un toque del campo MONTO que va a llenar |
| **Liquidado y entregado por técnico** | "4 técnicos · $ 4.180.000 pagados en comisiones" | la tabla de comisiones ya pagadas. No es el libro de préstamos: se queda plegada, pero ahora su fila dice cuánto hay dentro, no solo el nombre |

---

## Móvil: tres momentos, no una pantalla encogida

1. **Quién debe.** Cabecera navy con POR COBRAR en 27px y el conmutador Comisiones / Estado de cuenta a lo ancho. Las cuatro cuentas en filas de 70px: avatar de 40px, nombre en 14.5px/700, saldo en 16px/700 y su estado. Abajo, **"Registrar movimiento"** de 48px — se puede registrar sin entrar a ninguna cuenta.
2. **La cuenta.** El saldo en 30px sobre navy, con MÁS ANTIGUO en ámbar al lado (los dos datos que se miran de pie). PRESTADO / ABONADO / MOVS. en tres bloques de una línea. Los movimientos como filas de dos líneas: tipo, fecha y monto arriba; nota y "queda $ 70.000" abajo. Pie: **Registrar** (48px, lleno) + **Saldar** (48px, blanco).
3. **Registrar movimiento.** Hoja inferior. TIPO como segmented de 52px, PERSONA prellenada, MONTO en 22px con borde de acento, FECHA con HOY, NOTA, y "Calcular por días" plegado. El botón dice lo que va a hacer: **"Registrar abono de $ 30.000"**.

Todo objetivo táctil es de 44px o más; el principal, 48-52px.

---

## Nada desapareció

Título "Liquidación", subtítulo "3 cuentas abiertas · 0 a favor · 1 al día", conmutador Comisiones / Estado de cuenta, POR COBRAR total, botón PDF "Estado de cuenta · MDA".

Lista: avatar, nombre, rol, contador de movimientos ("sin movimientos" cuando aplica), saldo, estado DEBE / A FAVOR / AL DÍA, pie con el total.

Cuenta elegida: nombre, rol, "cuenta abierta desde {fecha}", saldo grande con su etiqueta DEBE, PRESTADO, ABONADO, MOVIMIENTOS, MÁS ANTIGUO, "Saldar la cuenta".

Movimientos: fecha, tipo (chip ABONO / PRÉSTAMO), monto con signo, nota, saldo corrido, eliminar; pie con "N movimientos · $X prestado, $Y abonado".

Cuentti: `Efectivo / Transferencia` + "Registrar en Cuentti" + chip "Registrado en Cuentti · {doc}".

Registrar: TIPO, PERSONA (con "Otra persona (tercero)…" en el select), MONTO*, FECHA, NOTA, botón Registrar, "Calcular por días".

Resumen "Liquidado y entregado por técnico", plegado con contador.

**No se dibujó** medio de pago del movimiento, quién autorizó ni firma. La v1 los tenía y no eran implementables: un movimiento es `fecha, tipo, monto, nota`. El `Efectivo / Transferencia` que sí aparece es el de Cuentti, que es otra cosa (el medio con que se registra el gasto en facturación).

---

## Preguntas abiertas

1. **El error del monto.** "El monto no es positivo; no se registra." ¿Dónde aparece: bajo el campo MONTO, como toast, o como texto en el botón? En el mockup no está pintado porque no sé cuál de los tres es.

2. **MÁS ANTIGUO: ¿dónde está el umbral?** Puse 60 días en rojo, y en el resto de la app el ámbar entra a los 4 días y el rojo a los 5+ (eso es para OT, no para deuda). Dime a partir de cuántos días una deuda pasa a ámbar y a partir de cuántos a rojo.

3. **"Otra persona (tercero)…"** abre un campo NOMBRE. ¿Ese nombre queda guardado como persona frecuente para la próxima vez, o se escribe cada vez?

4. **Cuentti y los técnicos.** Entendí que Cuentti solo aplica a terceros con cédula, no a técnicos. Si un técnico también tiene cédula en el sistema, ¿aplica igual? La regla real la necesito para saber cuándo pintar `—`.

5. **El documento de Cuentti.** El chip dice "Cuentti · GT-4471". ¿Ese código tiene un prefijo fijo o formato definido? Lo inventé.

6. **Saldar la cuenta** registra un abono por el saldo. ¿Con qué fecha: hoy, o se puede elegir? ¿Y ese abono también entra al flujo de Cuentti?

7. **El pie de la lista** dice "3 de 4 cuentas". Si una cuenta queda A FAVOR (el taller le debe a la persona), ¿su saldo se resta del POR COBRAR total o se lleva aparte? Hoy no hay ninguna A FAVOR en los datos y no pude verlo.
