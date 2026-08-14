---
target: ventana de Reportes (src/pages/Reportes.jsx)
total_score: 30
p0_count: 0
p1_count: 2
timestamp: 2026-07-21T07-47-06Z
slug: src-pages-reportes-jsx
---
# Critique: Reportes (src/pages/Reportes.jsx) — re-crítica

Register: product · Verificado en vivo (desktop 1400, móvil 375, dark) + código. Detector determinístico NO disponible (motor `detect-antipatterns.mjs` ausente del bundle del skill; intento real, exit 1 — mismo estado que la corrida anterior). Evidencia sustituta: inspección en vivo + verificación de código.

## Design Health Score

| # | Heurística | Puntaje | Hallazgo clave |
|---|-----------|:---:|-----------|
| 1 | Visibilidad del estado | 3 | Skeleton, preset activo (aria-pressed), toast "CSV descargado (60 OT)", subtítulo con el rango. El toast no tiene aria-live. |
| 2 | Sistema ↔ mundo real | 3 | Habla el idioma de Juan (OT, M.O., mostrador). "Neto taller" sobre-promete; hay un em dash en el copy. |
| 3 | Control y libertad | 3 | Presets + custom + "Corregir" + "Ver mes actual". Sin reset explícito del rango. |
| 4 | Consistencia y estándares | 3 | "Facturado" del cliente (solo completadas) vs "Total facturado" del vehículo (TODAS las OTs) se calculan distinto; Ticket es c/IVA mientras casi todo es sin IVA. |
| 5 | Prevención de errores | 2 | Rango invertido impecablemente prevenido, pero el KPI "Neto taller" induce el error caro que el diseño debería evitar. |
| 6 | Reconocimiento vs recuerdo | 4 | Todo visible y etiquetado; notas inline explican cada número derivado. |
| 7 | Flexibilidad y eficiencia | 3 | Presets + custom + CSV + PDF. Sin atajos ni rangos guardados (aceptable). |
| 8 | Estética y minimalismo | 3 | Limpio, pero 6 KPIs de peso idéntico (sin jerarquía) y "Distribución por estado" hoy es 100% Completado. |
| 9 | Recuperación de errores | 4 | El mensaje de rango invertido es modelo: nombra el problema con ambas fechas y ofrece el fix. |
| 10 | Ayuda y documentación | 3 | Sin tooltips, pero las notas contextuales (fórmula del neto, cobertura, % comisión, tope 500) son ayuda inline real. |
| **Total** | | **30/40** | **Good** — base sólida; arreglar el punto de plata (heur. 5) sube esto rápido |

## Veredicto anti-patrones

**LLM**: No es slop. Verificado por CSS computado en vivo: 0 gradient-text, 0 side-stripes de color, 0 fondos degradados, 0 hero-metric; estados cubiertos (skeleton, vacío que enseña, rango inválido); vocabulario visual consistente. Reaparecieron dos tells menores: un **em dash** en el copy (lo introduje yo, línea 403) y **jerarquía plana entre 6 KPIs**. El problema real no es "look IA": es *jerarquía contable* y *un número que miente en verde*.

**Detector**: no disponible (motor ausente del bundle; confirmado con búsqueda exhaustiva, exit 1). Sin overlays en navegador por la misma razón; evidencia = inspección en vivo con mediciones JS de contraste y aritmética.

## Impresión general

Salto grande desde 17/40: los números ya no mienten por IVA, el móvil quedó usable, y los filtros previenen y recuperan errores de libro. La única grieta seria que queda es de honestidad de plata en un solo lugar (el KPI "Neto taller"), más pulido menor. La mayor oportunidad: que el número con el que Juan decide "cómo me fue" nunca sea más optimista que la realidad.

## Qué funciona

1. **Los tres "Mano de obra" ya coinciden al peso** (verificado en vivo): suma del equipo (28+26+4+2 OTs → $4.925.000+$4.165.252+$580.000+$0) = $9.670.252 = tarjeta Utilidad = split. Y la suma de "Trabajos" del equipo = "Completados" (60 en Mes, 86 en Todo). La deuda vieja está saldada.
2. **Rango invertido de libro**: desde>hasta → banner ámbar nombrando ambas fechas + "Corregir" (intercambia) + un único empty state. Prevención + recuperación en un gesto.
3. **Colapso tabla→tarjeta en móvil ejemplar**: a 375px `scrollWidth==clientWidth` (cero scroll horizontal), cada fila es tarjeta con la cifra visible, avatares y "· Mostrador" preservados, barra `.td-bar` oculta.

## Issues prioritarios

**[P1] "Neto taller" pinta verde un número que sobre-estima la utilidad real.**
Hoy la cobertura de costo es 0% (Cuentti no devuelve costos — la tarjeta "Margen" queda "Sincronizando…" indefinidamente), así que `neto = ventas sin IVA − comisiones − costo` colapsa a `ventas − comisiones`, **sin restar NADA de costo de repuestos** (~$7–9M de repuestos vendidos contados con costo $0). La salvedad está en gris `--text-3`, no en ámbar. Para un dueño 40+ que barre cifras, el verde grande dice "me fue bien" y contradice el éxito del producto ("sin errores de plata").
Fix: cuando `coberturaMargen === 0`, no pintar el Neto en verde — mostrarlo neutro con badge "sin costo de repuestos" o como "Margen antes de repuestos"; cuando 0<cobertura<100, pintar la salvedad en ámbar. → harden + colorize

**[P1/P2] "Neto taller" sobre-promete por su nombre.** Aun con costos completos, es *ventas sin IVA − comisiones − costo repuestos*: no resta arriendo, sueldos fijos (Nicanor) ni IVA por pagar. Eso es **margen de contribución**, no "neto". (Nota: el usuario eligió explícitamente esta fórmula en la tanda anterior, así que es decisión de producto; el riesgo es el nombre, no el cálculo.) Fix: renombrar a "Aporte al taller"/"Margen operativo", o que la nota diga "antes de gastos fijos e IVA". → clarify

**[P2] Dos "facturado" que se calculan distinto (mentira latente).** "Top clientes → Facturado" suma solo completadas (L147); "Vehículos frecuentes → Total facturado" suma TODAS las OTs del rango (L113). Hoy invisible porque el dataset es 100% Completado, pero un rango con canceladas inflará el total del vehículo y no el del cliente. Fix: unificar a "solo completadas" en ambos, o etiquetar la diferencia. → harden

**[P2] Jerarquía contable plana en los KPIs.** 6 tarjetas idénticas; la importancia se comunica solo por color. Viola "la plata se lee de un vistazo" y "jerarquía por tamaño/peso, no efectos". Juan debería aterrizar primero en Neto/Facturado. Fix: 1 KPI ancla más grande/ancho, o separar "operación" (Total, Completados) de "plata" (Facturado, Comisiones, Neto, Ticket). → layout

**[P3] Pulido de accesibilidad/copy.** (a) Em dash en el subtítulo (L403) — ban de copy; usar "→" o "a". (b) Dark mode: banner de rango inválido `--amber-600` 13px = 3.39:1 (falla AA), "· Inactivo"/"· Mostrador"/"c/IVA" también fallan; subir a amber-300/400 y text-3. (c) Toast de export sin aria-live. (d) Shimmer del skeleton no se apaga con prefers-reduced-motion. (e) Ticket promedio es c/IVA sin etiqueta (inconsistente con "Facturado c/IVA"). → clarify + harden

## Red flags por persona

- **Juan (dueño, 40+)**: el "Neto taller" verde que no descuenta repuestos (miente al alza, salvedad invisible a 12.5px gris). **"REPARACION COMPUTADORA" sale como el #1 "Repuesto más vendido" ($800.000)** — es mano de obra mal etiquetada (`esServicio` no marcado en el dato de origen); el reporte lo muestra sin señal defensiva y le resta credibilidad al split. 6 KPIs de igual peso lo obligan a leer todo.
- **Jefe de taller**: correcto por diseño, no tiene acceso a Reportes (verificado en App.jsx). Sin red flags.
- **Sam (a11y)**: toast sin aria-live; skeleton no respeta reduced-motion; etiquetas ámbar/text-4 bajo AA en dark.
- **Riley (stress)**: el doble "facturado" divergente; "Sincronizando inventario de Cuentti…" sin fin si Cuentti nunca devuelve costos (y el Neto queda inflado en silencio mientras tanto).

## Observaciones menores

- Em dash U+2014 en subtítulo (L403). El mono de la nota sí usa el signo menos correcto U+2212.
- "Distribución por estado" hoy es barra 100% Completado: full-width que rara vez enseña algo con el patrón de datos del taller.
- "$0" en verde para "Sin técnico asignado": verde de "positivo" para un cero es levemente engañoso.
- Sin errores de consola en toda la sesión (solo el ruido preexistente de Cuentti, ajeno a Reportes).

## Preguntas

1. Si Cuentti nunca devuelve costos (cobertura crónica 0%, como hoy), ¿"Neto taller" debería existir, o mostrarse solo como "Margen antes de repuestos" hasta tener costo?
2. ¿"Neto" es la palabra correcta para un número que no resta arriendo, sueldos fijos ni IVA? ¿Qué entiende Juan por "Neto" a las 7pm en el mostrador?
3. ¿"Distribución por estado" y el split repuestos/MO ganan sus dos tarjetas full-width, o son dashboard genérico disfrazado?
