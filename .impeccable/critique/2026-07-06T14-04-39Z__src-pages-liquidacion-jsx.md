---
target: Liquidación (Comisiones + Estado de cuenta)
total_score: 23
p0_count: 0
p1_count: 2
timestamp: 2026-07-06T14-04-39Z
slug: src-pages-liquidacion-jsx
---
# Crítica de diseño — Liquidación (Comisiones + Estado de cuenta)

## Design Health Score

| # | Heurística | Score | Problema clave |
|---|-----------|-------|----------------|
| 1 | Visibilidad del estado | 3 | Buenos badges/saldos; falta señal de sync/guardado |
| 2 | Lenguaje del mundo real | 3 | "Le debes/A favor/Al día" excelente; "O por días" críptico |
| 3 | Control y libertad | 2 | "× Eliminar" y "Generar pago" sin confirmación real ni deshacer |
| 4 | Consistencia | 2 | Pestañas distintas al resto de la app; 5+ estilos de botón |
| 5 | Prevención de errores | 2 | Registrar con monto $0; borrar sin red de seguridad |
| 6 | Reconocer, no recordar | 3 | Labels claros |
| 7 | Flexibilidad/eficiencia | 2 | Sin teclado, sin liquidar en lote, formulario largo |
| 8 | Estético y minimalista | 2 | Todo en tarjetas iguales; tarjeta-héroe cliché |
| 9 | Recuperación de errores | 2 | Borrar es definitivo |
| 10 | Ayuda | 2 | Subtítulo del 40% ayuda; "O por días" no se explica |
| **Total** | | **23/40** | **Fair** |

## Veredicto anti-patrón (¿parece hecho por IA?)

No grita "IA" — se nota que ya pasó por tu rediseño anti-IA (Geist, sin glass ni degradados, buen contraste). Pero quedan tres tells de plantilla:
- **La tarjeta-héroe "TOTAL A PAGAR ESTE CIERRE $36.000"** con las 3 stats a la derecha (COMISIONES / M.O. / UTILIDAD) es exactamente el patrón "hero-metric" de dashboard SaaS.
- **Sopa de tarjetas**: cada sección (form, cuenta, tabla, historial) es una tarjeta blanca del mismo radio apilada — monótono. Las tarjetas son la respuesta perezosa.
- **Zoológico de botones**: Registrar (azul grande), PDF, Ver historial, Ver, × Eliminar (rojo texto), toggles Préstamo/Abono con borde ámbar. Cinco lenguajes visuales para "acción".

## Impresión general

Es una herramienta interna competente y legible. El problema no es que se vea mal, es que se ve **plana y sin jerarquía de acción**: todo pesa lo mismo (todo en tarjeta), y las acciones que mueven plata (borrar un movimiento, generar un pago) se ven igual de livianas que "Ver". La mayor oportunidad: **jerarquizar por riesgo** — que lo destructivo y lo que paga se vean y se comporten distinto de lo que solo consulta.

## Lo que funciona

- **Semántica de color en saldos**: verde "Le debes/A favor", neutro "Al día". Se lee de un vistazo quién queda debiendo.
- **El toggle Préstamo / Abono** con la aclaración "sube lo que debe (+) / baja (−)" — es el patrón correcto (segmentado) y el microcopy enseña.
- **Divulgación progresiva**: "31 trabajos ya liquidados (ocultos)" no ensucia la nómina.

## Priority Issues

- **[P1] Modales/confirmaciones: lo destructivo y lo que paga no piden confirmar (y usan `confirm()` nativo donde sí lo hacen).**
  - *Por qué importa:* "× Eliminar" borra un movimiento de plata con un tap sin preguntar; "Generar pago" ejecuta y consume adelantos sin un resumen previo. Y donde sí hay confirmación es el `confirm()` gris del navegador, que rompe tu estética.
  - *Fix:* un componente de diálogo propio (con tu tipografía/colores) para: (a) confirmar borrado de movimiento, (b) un **resumen "revisar antes de pagar"** en Generar pago (técnico, N OTs, comisión, cargos, neto). Botón destructivo en rojo-sólido, no texto.
  - *Comando sugerido:* `harden` + `clarify`
- **[P1] Jerarquía plana: "card soup" + tarjeta-héroe.**
  - *Por qué importa:* con todo envuelto en tarjetas iguales, el ojo no sabe dónde mirar primero. El número que importa (total a pagar) compite con 3 stats secundarias en la misma caja.
  - *Fix:* saca sección del envoltorio-tarjeta (usa encabezado + separador ligero). Deja el total como cifra dominante y baja las 3 stats a una línea secundaria, no a un mini-panel espejo. Varía el espaciado por ritmo.
  - *Comando sugerido:* `layout` + `distill`
- **[P2] Zoológico de botones: 5+ estilos para "acción".**
  - *Por qué importa:* sin un sistema, cada botón compite; "Ver" pesa lo mismo que "Registrar".
  - *Fix:* define 4 roles y úsalos con disciplina — **primario** (Registrar/Generar pago), **secundario/outline** (PDF, Ver, Ver historial), **fantasma** (acciones terciarias), **peligro** (Eliminar). Un solo color de acento de marca (hoy compiten azul y ámbar).
  - *Comando sugerido:* `extract` (tokens de botón) + `colorize`
- **[P2] Pestañas inconsistentes con el resto de la app y con poca presencia.**
  - *Por qué importa:* aquí son subrayado; en CRM/Inventario usas el segmentado `segctl` con estado "on". Dos gramáticas de navegación para lo mismo.
  - *Fix:* unifica a UN patrón de pestañas en toda la app. Para un switch de 2 modos, el segmentado (pill) se lee como "modo" y es más táctil en celular.
  - *Comando sugerido:* `layout`
- **[P2] "Registrar movimiento" es un formulario largo y "O por días" es críptico.**
  - *Por qué importa:* Persona + Tipo + Monto + Fecha + "O por días" + Nota + Registrar ocupa toda la columna; el bloque "O por días (pagos/cargos diarios · opcional)" añade carga a algo que casi no se usa.
  - *Fix:* colapsa "O por días" tras un link ("＋ calcular por días") y muéstralo solo si se necesita. Deshabilita "Registrar" con monto $0.
  - *Comando sugerido:* `distill` + `clarify`

## Persona Red Flags

**Dueño/administrador (uso diario, a veces en celular):** el formulario largo de Estado de cuenta obliga a scrollear; "× Eliminar" pegado a la tabla es fácil de tocar por error y borra plata sin preguntar; en celular las tablas (Cuentas, Cuentas por técnico) se van a scroll horizontal.

**Técnico que revisa lo suyo (primera vez, poca confianza):** ve "Comisión $0" en su fila sin explicación de por qué (¿no tiene OTs? ¿no marcaron "Servicio"?); "UTILIDAD TALLER" es info del taller, no suya, mezclada en la misma vista.

## Minor Observations

- "4 sin técnico" en rojo en el héroe es buena alerta, pero no es clickeable (debería filtrar/llevar a esas OTs).
- La fila de la nómina con chevron es clickeable pero no se ve como botón (falta hover/cursor claro).
- "PDF", "Ver historial", "Ver" tienen tres tratamientos distintos para la misma jerarquía.
- El estado activo ámbar del toggle Préstamo choca con el azul primario de "Registrar".

## Questions to Consider

- ¿Qué pasaría si "Generar pago" abriera un resumen de revisión en vez de ejecutar directo?
- ¿La pantalla necesita mostrar "UTILIDAD TALLER" al mismo nivel que "TOTAL A PAGAR", o eso es ruido para la tarea (pagar técnicos)?
- ¿Cuántas de estas tarjetas necesitan ser tarjetas de verdad?
