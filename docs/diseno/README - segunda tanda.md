# Segunda tanda — 4 vistas

Archivos:

- `Reportes - rediseno.dc.html`
- `Estado de cuenta - rediseno.dc.html`
- `Detalle de OT - rediseno.dc.html`
- `Usuarios - rediseno.dc.html`

Cada uno abre en el navegador con sus marcos: 1280px a la izquierda, 390px a la derecha. Dos de ellos traen tres marcos, por lo explicado abajo.

---

## 1. Reportes

**Subió de jerarquía**

- **Facturado (c/IVA)** y **Margen antes de repuestos** salen de la grilla de seis KPIs iguales y pasan a cifras de cabecera (27px), en una sola banda. El margen va en el acento porque es la cifra por la que se mira esta pantalla.
- La **línea de fórmula** queda pegada al margen, en 11.5px, no suelta bajo la grilla. Se conserva palabra por palabra.
- **37,3% de lo facturado** es nuevo, calculado de las dos cifras que ya estaban. Dice si el mes fue bueno sin tener que dividir mentalmente.
- **Repuestos más vendidos** pasa de sección plegada a tabla abierta y ordenada por margen. Es la única de las nueve donde el dueño decide algo: qué reponer y a qué precio.
- **Rendimiento del equipo** queda abierto, en la columna derecha, con fila de totales.

**Bajó de jerarquía**

- **Total trabajos, Completados, Comisiones técnicos y Ticket promedio** pasan de tarjetas KPI a cuatro cifras de 17px en una rejilla 2×2 al lado del margen. Los cuatro datos siguen ahí, ninguno se toca.
- Las **tres secciones de ingresos** (Ingresos repuestos vs mano de obra · Utilidad por mano de obra · Margen de repuestos) dejan de ser tres bloques plegables y se vuelven **un solo bloque, "De dónde sale el margen"**, con una barra de composición y tres columnas. Los tres números y sus porcentajes quedan completos; lo que se elimina es la triple cabecera y el triple plegado, porque las tres son la misma pregunta.
- El **rango DESDE/HASTA** pasa de dos campos grandes a una pastilla de 36px con el rango escrito. Los dos campos siguen ahí al abrirla.
- **Abrir todo** pasa de botón con texto a botón circular de 36px, junto al rango.

**Colapsado, con etiqueta y contador visibles**

| Sección | Etiqueta y contador | Qué dice de lo que hay dentro |
| --- | --- | --- |
| Rotación de inventario | `1.303 agotadas` (rojo) | 3.460 referencias · 612 con venta en el periodo · Stock y Vendidas por referencia |
| Top clientes | `38 facturados` | GRUPO EMPRESARIAL MP encabeza con $ 4.860.000 en 7 trabajos |
| Vehículos frecuentes | `52 placas` | YHL370 con 6 visitas · HRK821 y HJX377 con 4 |
| Distribución por estado | `7 estados` | 57 completados · 12 abiertos · 2 cancelados |

Van bajo el rótulo **CONSULTA · 4 SECCIONES RECOGIDAS**. Cada una dice qué encontrarás dentro, no solo su nombre: la regla es que una sección recogida se pueda descartar sin abrirla.

**Móvil.** Las dos cifras grandes van dentro de la cabecera navy, con la fórmula debajo. Los presets son pastillas de 44px en fila que se desplaza. Los cuatro KPIs secundarios, en una tarjeta 2×2. El bloque de margen, con la barra y tres filas. Y **las seis secciones** (las dos abiertas en escritorio también) como filas de 44px de una sola lista: título, contador y la línea de qué hay dentro. En un teléfono nadie lee una tabla de cinco columnas de pie; entra a la que necesita.

---

## 2. Estado de cuenta

**Subió de jerarquía**

- **Por cobrar** ($ 1.840.000) es la cifra de cabecera, a la derecha del conmutador, con divisor de 44px. Es el número por el que existe la pestaña.
- El **saldo de cada persona** manda en la lista: 15px/700, en rojo si debe, verde si está a favor, gris si está al día. El nombre pesa 700 solo en quien debe.
- La **cuenta seleccionada** tiene su propia banda: DEBE en 26px rojo, y al lado Prestado, Abonado, Movimientos y **Más antiguo (96 días)** en cuatro cifras de 15px. Los tres primeros son sumas de los movimientos que ya existen; el cuarto sale de la fecha del más viejo sin abonar, y es el que dice si hay que insistir.
- **Saldar la cuenta** queda pegado a esa banda, no perdido entre los botones de arriba.

**Bajó de jerarquía**

- **Registrar movimiento** deja de pesar lo mismo que el saldo: pasa al pie de la columna derecha, en una sola fila de 40px. Tipo (segmented Préstamo/Abono), Persona, Monto y Fecha quedan a la vista; el Monto es el único con borde de acento y la Fecha viene con **HOY** prellenado.
- **Por días** y **PDF** pasan de botones con nombre largo a pastillas de 36px.
- Los **pies de firma del PDF** ("Nombre, cargo, fecha" / "Nombre, documento, fecha") salen de la pantalla. Pertenecen al documento exportado, no a la interfaz.

**Colapsado, con etiqueta y contador visibles**

| Qué | Etiqueta y contador |
| --- | --- |
| Medio (Efectivo / Transferencia), Autorizado por, y Firma de la persona | `Respaldo del pago 3` |

Debajo del formulario, en una línea de 11.5px, queda escrito el estado actual de esos tres: *"Efectivo · autoriza Juan Sebastian · falta la firma de Pedro"*. Se llenan casi siempre igual, así que van prellenados y recogidos; pero nunca invisibles.

En la tabla de movimientos los tres siguen presentes por fila: **MEDIO** como columna propia, **AUTORIZÓ** con el nombre, y la firma como pastilla `firmado` (verde) o `sin firma` (ámbar). El **saldo corrido** después de cada movimiento es nuevo y se calcula de lo que ya hay: sin él no se puede auditar la cuenta hacia atrás. Eliminar movimiento queda como botón de 28px al final de la fila.

**Móvil: dos marcos, porque son dos momentos.**

1. **Lista de cuentas** — POR COBRAR en la cabecera navy, el conmutador Comisiones / Estado de cuenta de 44px, las cinco cuentas en filas de 62px con saldo y estado, el total al pie, y "Registrar movimiento" de 48px abajo.
2. **Cuenta de una persona** — se abre al tocar una fila: DEBE en 27px, Prestado y Abonado al lado, las pastillas de 96 días y 7 movimientos, y **los siete movimientos completos** con su medio, quién autorizó, saldo corrido, estado de firma y borrar. Abajo, "Abono o préstamo" y "Saldar".

Meter las dos cosas en un solo marco de 844px era el escritorio encogido. Un teléfono navega, no divide en columnas.

---

## 3. Detalle de una OT ya guardada

**Subió de jerarquía**

- **La placa** en 24px monoespaciada, con el número de OT al lado en gris. Es por lo que se reconoce el registro.
- **Ir a Facturar** es el único botón primario, de 48px, con el monto escrito dentro: *Ir a Facturar · $ 660.000*. Es la acción que mueve plata.
- El **Total** en 26px, después de los ítems.
- El **aviso de Trabajo Completado** pasa de bloque suelto a franja verde de 44px en el borde superior del modal, con la fecha y *"listo para facturar"*. Es lo primero que se lee y explica por qué el botón azul dice Facturar.
- **Falta la firma del cliente** se vuelve una pastilla ámbar junto al técnico. Antes había que deducirlo de que el botón dijera "Firmar recibido" en vez de "Firmar de nuevo".

**Bajó de jerarquía**

Las siete acciones tenían el mismo peso. Ahora son tres niveles:

| Nivel | Acciones |
| --- | --- |
| Primario 48px | Ir a Facturar |
| Secundario 42px con borde | Firmar recibido · WhatsApp · Editar |
| Texto de 12.5px | Marcar listo · Firmar de nuevo · Después |

**Firmar recibido** y **Firmar de nuevo** son la misma acción en dos estados, así que solo se pinta la que aplica; la otra queda como texto. **Marcar listo** baja a texto porque en una OT ya completada no se usa. **Después** es un descarte, y un descarte nunca es un botón.

- La **comisión del técnico** ($ 231.000) se muestra bajo su nombre. Ya existe en Liquidación; aquí ahorra abrir otra pantalla antes de facturar.

**Nada colapsado.** El modal tiene 470px y cuatro ítems: no hay nada excepcional que recoger.

**Móvil.** No es el modal encogido: es pantalla completa. La cabecera navy lleva placa, OT, cliente, **Total en 27px** y el técnico con su comisión. La franja verde de completado va debajo. Los ítems son filas con nombre y valor, con el total en el pie de la tarjeta. La falta de firma es un bloque ámbar con su propio botón "Firmar" de 36px. Abajo, **Ir a Facturar de 52px**, luego WhatsApp / Editar / más opciones a 48px, y Marcar listo · Después como texto centrado.

---

## 4. Usuarios

**Subió de jerarquía**

- El **contador** pasa a subtítulo con su desglose: *"4 usuarios registrados · 3 activos · 1 inactivo"*. Antes el número estaba en una tarjeta.
- El **Rol** queda como pastilla de color: azul Administrador, verde Jefe de taller, ámbar Recepción, gris Solo consulta. Es el dato que se consulta.
- El **Estado** se lee de un vistazo: punto verde/gris + palabra, y la fila entera del inactivo va en `#fbfcfd` con el nombre en gris.
- **tu sesión** marca la fila del usuario conectado. Evita que se desactive a sí mismo.

**Bajó de jerarquía**

- La tabla deja de ocupar la pantalla: **cuatro filas de 52px, con su pie de totales, y ahí se acaba**. El resto del alto queda vacío. Cuatro filas no se presentan como si fueran cuatrocientas.
- **Recargar** pasa de botón con texto a botón circular de 36px junto a Nuevo usuario.
- **Desactivar / Reactivar** es una sola pastilla de 34px por fila, con el verbo que aplica: Desactivar en rojo, Reactivar en acento.
- El **alta de usuario** pasa de formulario apilado a una fila de cuatro campos de 44px con el botón al final. Nombre y contraseña son los únicos con borde de acento; **el usuario se prellena del nombre** (`Jefe de Patio` → `patio`) y se marca **DEL NOMBRE**, editable.

**Nada colapsado.** Cinco campos y cuatro filas: no hay nada que recoger.

**Móvil: dos marcos.**

1. **Lista** — cuatro tarjetas con nombre, usuario en mono, estado con punto, rol en pastilla, fecha de creación y el botón Desactivar/Reactivar de 44px. "Nuevo usuario" de 48px abajo.
2. **Nuevo usuario** — hoja inferior con los campos a 52px y **el rol como cuatro opciones tocables de 50px** con su nota (`todo`, `sin facturación`, `sin comisiones`, `sin editar`), no un desplegable. Son cuatro; un select de cuatro opciones en un teléfono es un paso de más, y aquí el rol define qué ve la persona.

---

## Preguntas abiertas

Las capturas de esta tanda no llegaron al proyecto, y el `src/` del design system tiene una versión anterior de Reportes (cinco KPIs, sin las nueve secciones ni los presets). Trabajé con el inventario de campos de tu prompt. Lo que necesito confirmar:

1. **Reportes · Rotación de inventario.** ¿Stock y Vendidas es por referencia, o son dos totales? Lo dejé como "por referencia" en la línea de la sección recogida.
2. **Reportes · Ticket promedio.** ¿Es facturado ÷ total de trabajos, o ÷ completados? Puse $ 724.000, que es 41.280.000 ÷ 57 (completados). Si es sobre 68 el número cambia a $ 607.000.
3. **Estado de cuenta · "Por días".** Lo dejé como pastilla que cambia la vista a antigüedad de la deuda. ¿Es eso, o es un filtro de rango de días?
4. **Estado de cuenta · saldo corrido.** Lo añadí por fila calculándolo de los movimientos. Si la app ya guarda ese campo, mejor; si no, es un cálculo, no un dato nuevo. Confirma que la lectura hacia atrás te sirve.
5. **Estado de cuenta · "A FAVOR".** ¿Un saldo a favor se puede abonar contra una comisión, o solo se devuelve? El estado se pinta, pero no sé qué acción le corresponde.
6. **Detalle de OT · "Después".** Lo leí como "cerrar sin hacer nada, recordármelo luego". Si es un aplazamiento con fecha, necesita un campo y no un enlace.
7. **Usuarios · roles.** Usé Administrador, Jefe de taller, Recepción y Solo consulta con esas notas de permisos. Si los roles reales son otros, dime los nombres exactos y qué puede hacer cada uno.
8. **Usuarios · contraseña.** ¿El administrador la escribe, o el sistema la genera y se la entrega? Lo dibujé escrita, con ojo para revelarla.
9. Los montos, placas, nombres y fechas son de muestra, tomados de los que ya venían en las quince pantallas anteriores. Ninguno va escrito en el código de producción.
