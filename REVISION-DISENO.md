# Revisión de diseño — rama `rediseno-ux`

Pega el bloque de abajo en Claude (o en Claude Design) para pedir la crítica.
Debajo del prompt están las notas de uso.

---

## El prompt

```
Eres un director de diseño de producto. Vas a criticar un rediseño ya
implementado, no a proponer uno nuevo. Sé duro y concreto: prefiero cinco
objeciones bien fundadas a treinta observaciones tibias.

## El producto

App de gestión de un taller automotriz en Barranquilla (Multidiagnósticos AS).
Herramienta interna de uso diario, no un sitio de marketing. Tres tipos de
usuario:

- Juan, el dueño: la usa todo el día en el computador del mostrador. Liquida
  comisiones, factura, cobra. No es técnico de software. Tiene 40+ años y
  trabaja en un taller: la legibilidad le importa más que la elegancia.
- El jefe de taller: la usa sobre todo en el celular, de pie en el piso del
  taller, con las manos sucias.
- Clientes: ven el estado de su vehículo desde el teléfono, sin login.

El repositorio trae `PRODUCT.md` y `DESIGN.md` en la raíz. Léelos primero: ahí
están los principios, las anti-referencias y los tokens. En particular, el
usuario rechaza explícitamente el "look de IA" (glassmorphism, degradados de
texto, franjas laterales de color, tarjetas idénticas en grilla, hero-metric con
gradiente) y el micro-texto de bajo contraste.

## Qué se hizo

Rediseño pantalla por pantalla, un commit por pantalla, en la rama
`rediseno-ux`. El método fue: sacar un inventario de campos de los DATOS REALES
de producción (Supabase + la API de Cuentti), no del código; proponer un
agrupamiento; implementar; verificar a 1280px y 375px.

La idea que gobierna todo el trabajo: **una columna, una tarjeta o una cifra
solo se gana su sitio si cambia con los datos reales**. Varias decisiones salen
de ahí (porcentajes medidos sobre producción):

- Se fusionaron o eliminaron columnas casi constantes: "Teléfono"+"Email" en
  Clientes (97% sin teléfono), "En Cuentti" (847 de 850 iguales), "Categoría" en
  Repuestos (97% dice "Cat-1"), "Vehículo"+"Cliente" en Liquidación (59% sin
  carro), "Marca"+"Modelo" en Vehículos.
- Se colapsaron cabeceras que repetían datos: en Vehículos, Técnicos y
  Recordatorios había una tarjeta grande con su desglose dentro y, al lado,
  tarjetas pequeñas que repetían ese mismo desglose.
- Se cambió qué cifra encabeza cada pantalla por la que exige actuar: en Cobros,
  la cartera ($4,5M en 11 facturas, hasta 45 días) en vez de "Facturar", que
  tenía 1 candidato de 158; en Repuestos, los 480 productos con stock negativo
  en vez de "2.996 a reponer", que es el 87% del catálogo.
- En móvil, las tablas pasaron de tarjeta con N pares etiqueta/valor (una
  pantalla por registro) a filas de 2-3 líneas de ~84px.

## Tu tarea

Revisa la rama `rediseno-ux` a 1280px y a 375px. Para arrancar la app:
`npm install && npm run dev` (queda en http://localhost:3000).

Quiero que ataques cuatro cosas:

1. **Jerarquía y peso visual.** Ahora casi todas las pantallas abren con la misma
   receta: eyebrow en mayúsculas + cifra grande + una línea de contexto en gris.
   ¿Se volvió un molde? ¿Se distinguen entre sí? ¿La cifra elegida es la correcta
   en cada una, o hay alguna donde el titular sea vanidad y no decisión?

2. **Densidad y ritmo.** El principio del proyecto es "denso donde se trabaja,
   aire donde se decide". ¿Las tablas quedaron legibles o apretadas? ¿El aire
   está donde se toman decisiones de dinero (pagar, facturar, anular) o se
   repartió parejo? Mira específicamente Pago a técnicos, que es la pantalla
   donde se mueve la plata.

3. **Lo que se quitó.** Fui agresivo eliminando columnas y tarjetas. Dime dónde
   me pasé: qué información se perdió que alguien iba a necesitar, aunque los
   datos de hoy dijeran que casi nunca cambia. Un campo vacío el 97% del tiempo
   puede seguir siendo crítico el 3% restante.

4. **Coherencia.** ¿El sistema se sostiene entre pantallas — tipografía, botones,
   estados vacíos, la forma de las filas en móvil — o hay pantallas que se
   quedaron fuera del patrón?

## Cómo quiero la respuesta

Por pantalla, y dentro de cada una en este orden: qué está mal, por qué le
importa a este usuario en su contexto real, y qué harías en concreto. Sin
rodeos, sin resumen ejecutivo, sin repetirme lo que ya funciona salvo que sea
para explicar un contraste.

Si algo te parece un acierto, dilo en una línea y sigue.

## Fuera de alcance

- No propongas cambiar el stack, la paleta ni la tipografía base.
- No propongas glassmorphism, degradados, animaciones decorativas ni tarjetas
  con icono+título+texto en grilla: están vetados por el cliente.
- Los textos de los commits explican el porqué de cada decisión
  (`git log rediseno-ux`). Si vas a revertir una, discútela con su razón, no
  como si nadie la hubiera pensado.
```

---

## Notas de uso

**Cómo darle el código.** Tres opciones, de mejor a peor:

1. **Claude Code en este repo** (`claude` en esta carpeta, rama `rediseno-ux`).
   Es la mejor: puede leer el código, arrancar el servidor y ver las pantallas.
2. **Claude.ai con el repo conectado por GitHub.** Ve el código pero no la app
   corriendo; pídele que se apoye en capturas.
3. **Solo capturas.** Sirve para la crítica visual pura. Manda las 14 pantallas
   a 1280px y las 5 principales a 375px (Hoy, Órdenes de trabajo, Cobros, Pago a
   técnicos, Repuestos).

**Si usa capturas, avísale de esto:** la app muestra un aviso amarillo ("No se
pudo conectar con el servidor") cuando el proxy de datos falla, y entonces las
cifras salen de una caché local. No es parte del diseño de la pantalla.

**Después de la revisión.** Pídele que agrupe los hallazgos en tres cubos antes
de tocar nada: (a) errores objetivos, (b) diferencias de criterio que valga la
pena discutir, (c) preferencias personales del revisor. Solo (a) se aplica
directo; (b) lo decides tú.

**Un aviso sobre el método.** Las decisiones de esta rama se apoyan en
proporciones medidas sobre producción. Un revisor que solo mire pantallazos no
tiene esos datos y va a proponer devolver columnas que se quitaron con razón.
El punto 3 del prompt está escrito justo para eso: que argumente el caso del 3%,
no que ignore el 97%.
