# QA contra los mockups — 24 capturas del 20 ago 2026

Revisión de la app implementada contra los `.dc.html`. Cada punto dice qué se ve, qué dice el mockup y qué cambiar.

**Fieles, no tocar:** el chrome completo (rail de 86px con sus 14 ítems y contadores, topbar de 48px, barra de título de una fila, cabecera móvil navy), Dashboard escritorio, Detalle de OT, Estado de cuenta escritorio, Mecánicos, Clientes, Cotizaciones, CRM, Cuentti, Recepción, Inspecciones.

---

## Bloqueantes

### 1. Vehículos móvil es la tabla de escritorio encogida

`celular-10-vehiculos.png`. Las 50 filas se renderizan con las siete columnas del escritorio comprimidas en 390px: la placa queda en ~7px, el propietario en ~6px. Ilegible, y el jefe de taller es justo quien busca una placa de pie en el taller.

El mockup (`Vehiculos - rediseno.dc.html`, marco 390) tiene **tarjetas de dos líneas**: placa en mono 17px/700 arriba con las visitas a la derecha, propietario en 12.5px/600 debajo, y marca · modelo · año · último servicio en una tercera línea de 11.5px. Siete filas por pantalla.

El `@media` no está aplicando, o la vista móvil nunca se implementó. Es el mismo caso de Clientes, que sí quedó bien: mírala y replica el patrón.

### 2. Órdenes de trabajo móvil: hay un triángulo negro gigante en medio de la pantalla

`celular-02-ordenes-de-trabajo.png`. Un triángulo negro de ~160×80px flota entre el filtro de técnico y el conteo de trabajos. Es un `<select>` o un caret sin estilo que perdió su contenedor. No está en ningún mockup. Quítalo.

### 3. Órdenes de trabajo móvil: dos buscadores y los filtros se salen

En la misma captura:
- **Dos campos "Buscar placa, cliente, OT..."**, uno en el topbar y otro en el cuerpo. El mockup móvil tiene **uno solo**, dentro de la cabecera navy.
- La fila de estados (Activos · Pendientes · Diagnóstico · En Progreso · Espera…) **se corta en el borde derecho**. El mockup usa rejilla de 2×2 con pastillas de 44px, igual que el Tablero móvil, precisamente para que nada quede fuera de vista.
- Los cuatro contadores (EN VISTA / COMPLETADOS / PENDIENTES / EN PROGRESO) se envuelven a dos líneas. En el mockup van en una sola línea de 11px dentro de la cabecera navy.

### 4. Estado de cuenta móvil está apilado, no en tres momentos

`celular-06-estado-de-cuenta.png`. La pantalla muestra, de arriba abajo: cifra, lista de 4 cuentas, formulario de registro, plegado del resumen. Todo junto, sin cuenta seleccionada. **Es exactamente el apilamiento que el dueño rechazó en la v1.**

El mockup `Estado de cuenta - v2.dc.html` tiene tres marcos móviles distintos:
1. **Quién debe** — cifra POR COBRAR en 27px, las cuatro cuentas en filas de 70px, y "Registrar movimiento" de 48px abajo. Nada más.
2. **La cuenta** — al tocar una fila: saldo en 30px sobre navy con MÁS ANTIGUO al lado, los tres contadores, los movimientos, y Registrar + Saldar abajo.
3. **Registrar movimiento** — hoja inferior, con PERSONA prellenada.

En la captura, PERSONA dice "Seleccionar..." incluso sin cuenta abierta; en el mockup llega con la cuenta elegida y su avatar.

---

## Defectos de color

### 5. Liquidación: el total en verde a 48px

`escritorio-05-liquidacion-comisiones.png`. `$ 67.530` sale en verde `#16a34a` a ~48px sobre blanco.

El mockup lo pone en **32px/700 blanco sobre el bloque navy**. El verde es semántico (un estado que está bien), no el color de una cifra de cabecera. Una cifra grande en verde brillante sobre blanco es lo único que se ve en esa pantalla, y no es lo más importante: lo importante es a quién le liquidas.

### 6. Reportes: los ingresos de repuestos en verde

`escritorio-07-reportes.png` y `celular-07-reportes.png`. La columna Ingresos de "Repuestos más vendidos" y la de Mano de obra en "Rendimiento del equipo" salen en verde.

El mockup usa `#475569` (gris) para la venta y `#0f172a` para la cifra fuerte. Son valores de consulta, no estados. Con todo en verde, el verde deja de significar algo.

Lo que sí es correcto en esa pantalla y hay que conservar: APORTE AL TALLER en acento azul con su pastilla verde de porcentaje, y la línea de fórmula debajo.

---

## Defectos de layout

### 7. Órdenes de trabajo escritorio arranca vacía

`escritorio-02-ordenes-de-trabajo.png`. El filtro de fecha entra en **"Hoy"** y la pantalla queda en blanco con "No hay trabajos con estos filtros", mientras el Tablero de la misma sección muestra 163. La barra de título dice 0 en los cuatro contadores.

El default debería ser el que muestre trabajo. En el mockup la lista arranca con las OT abiertas, y los contadores de la barra de título son los del total, no los del filtro activo. Un dueño que abre Trabajos y ve cero piensa que la app se rompió.

### 8. Usuarios escritorio: el campo CONTRASEÑA corta su placeholder

`escritorio-08-usuarios.png`. "Mínimo 6 caractere" — cortado, y el ojo de mostrar/ocultar se le monta encima.

La fila de alta tiene cinco elementos en una sola línea (NOMBRE COMPLETO, USUARIO, ROL, CONTRASEÑA, Crear usuario) y NOMBRE COMPLETO se lleva casi el doble del ancho que necesita para "ej: Jefe de Patio". Redistribuye: nombre 1fr, usuario 1fr, rol 160px, contraseña 200px.

### 9. Portal Cliente: 23 filas idénticas en el historial

`celular-18-portal-estado.png`. Veintitrés entradas con exactamente el mismo texto: JQQ567 · OT-00xx · 23 jul 2026 · Renault Kwid · $ 730.000 · RECIBIDO. Solo cambia el número de OT.

Puede ser data de prueba, pero si en producción pasa esto la lista es inservible. Dos cosas:
- **El estado del vehículo activo queda enterrado.** El cliente entra a ver si su carro está listo; el timeline "Recibido 15%" ocupa 200px y el historial 2.000px. Muestra las **3 más recientes** y el resto tras "Ver los 20 anteriores".
- El mockup ya trae ese patrón de resumen tocable en la vista de inspección ("Ver los 16 restantes"): úsalo aquí.

### 10. Dashboard móvil: la gráfica de 12 meses ocupa 400px para dos barras

`celular-01-dashboard.png`. Nueve de los doce meses están a cero y la gráfica reserva ~400px de alto. En 390px de ancho eso es una pantalla completa para dos datos.

El mockup móvil la deja en **160px de alto**. La gráfica es contexto, no la razón por la que abres el dashboard en el celular.

### 11. Usuarios móvil: "Desactivar" en rojo al mismo peso que todo

`celular-08-usuarios.png`. Cada tarjeta lleva un botón "Desactivar" de ancho completo en rojo. Es una acción destructiva y rara (tres usuarios, se desactiva casi nunca) con el mayor peso visual de la tarjeta.

El mockup lo pone como botón de borde de 44px al lado del de editar, no de ancho completo, y el rojo solo en el texto.

---

## Lo que sigue abierto

Tres cosas que no puedo resolver desde el diseño:

1. **El umbral de días de MÁS ANTIGUO.** En la captura de escritorio, 28 días sale en negro. Está provisional en 30. Dime a partir de cuántos días pasa a ámbar y a partir de cuántos a rojo, y lo fijo.
2. **Cuenta A FAVOR.** Si el taller le debe a alguien, ¿su saldo se resta del POR COBRAR total o va aparte? Hoy no hay ninguna en los datos y no se puede ver.
3. **Cat-1 … Cat-5 en Inventario.** Faltan los nombres reales. Sin ellos el filtro de categoría no dice nada.

Y falta la captura de **Inventario**, la única pantalla que no pude comparar.
