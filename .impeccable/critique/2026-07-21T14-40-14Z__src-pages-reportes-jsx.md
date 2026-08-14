---
target: ventana de Reportes (src/pages/Reportes.jsx)
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-07-21T14-40-14Z
slug: src-pages-reportes-jsx
---
# Critique: Reportes (src/pages/Reportes.jsx) — ronda 3

Register: product · HEAD c7472e0 · Evidencia en vivo medida por JS (desktop 1280/786, móvil 375, dark) + panel de 5 críticos por lente con verificación adversarial (20 hallazgos, 0 refutados). Detector determinístico NO disponible (motor ausente del bundle; exit 1, misma condición que rondas 1-2).

## Design Health Score

| # | Heurística | Puntaje | Hallazgo clave |
|---|-----------|:---:|-----------|
| 1 | Visibilidad del estado | 3 | Skeleton, toast aria-live, preset activo, % cobertura, aviso tope 500. Huecos: plegado no persiste; CSV vacío se descarga en silencio |
| 2 | Sistema ↔ mundo real | 4 | Idioma de Juan; "Margen antes de repuestos" vs "Aporte al taller"; fórmula en prosa; manoObraBase sin el +19% viejo |
| 3 | Control y libertad | 4 | 7 presets + custom + Corregir + plegado global/individual + "Ver mes actual". Falta guardar rango/plegado |
| 4 | Consistencia | 4 | pdfTheme, manoObraBase única, tbl-cards uniforme, cabezal() reusado en 9 secciones |
| 5 | Prevención de errores | 4 | Rango invertido con banner+Corregir; parseFechaLocal; "¿servicio?"; "Revisar" (stock<0); neto gris a cobertura 0 |
| 6 | Reconocimiento | 3 | Bien etiquetado, pero el ancla exige leer una nota de 234 chars; al plegar, el contexto (leyendas, notas) se oculta |
| 7 | Flexibilidad/eficiencia | 3 | Presets, plegado global, CSV/PDF. Resta: plegado no persiste; chips 38px; sin rangos guardados |
| 8 | Estética/minimalismo | 3 | Sin bans; 2 anclas grandes. Pero la jerarquía se aplana ≤960px; 9 tarjetas aún exigen scroll |
| 9 | Recuperación de errores | 4 | Rango invertido nombra ambas fechas + Corregir + empty state. Lenguaje llano, recuperación de un clic |
| 10 | Ayuda | 3 | Notas contextuales buenas (fórmula, cobertura, tooltip ¿servicio?), pero dispersas y desaparecen al plegar |
| **Total** | | **35/40** | **Good** (subiendo: 17 → 30 → 35) |

## Veredicto anti-patrones

**LLM**: No es slop, y mejoró. Cero bans (verificado en código): sin gradient text, glass, franjas border-left, hero-metric ni grillas idénticas; el rango usa flecha "→" no em dash; los "—" son placeholders de dato vacío legítimos. Lee como herramienta seria estilo Linear/Stripe. La honestidad del "Margen antes de repuestos" (gris + badge cuando no hay costo, el verde se gana) es anti-slop ejemplar.

**Detector**: no disponible (motor ausente; exit 1). Evidencia sustituta: mediciones en vivo (contraste, tamaños, cascada CSS) + panel adversarial.

## Qué funciona

1. **Honestidad de plata anti-slop**: el ancla va en neutro + badge "sin costo de repuestos" cuando cobertura=0; el verde solo se gana cuando el número descontó costo. El color nunca es el único portador (label cambia + badge + nota).
2. **Un solo número de plata, consistente**: `manoObraBase` (sin IVA, misma regla que Liquidación) alimenta comisiones, utilidad y ranking; la suma por técnico = Completados (incluye "Sin técnico asignado"); topVehiculos ya solo cuenta completadas. Nada se contradice.
3. **Prevención + recuperación del error costoso**: rango invertido con banner que nombra ambas fechas + Corregir + empty state; señal defensiva "¿servicio?" sin mutar el dato; plegado accesible (aria-expanded, teclado Enter/Espacio, aria-pressed).

## Issues prioritarios (todos verificados adversarialmente)

**[P2] La jerarquía money/ops de los KPIs se aplana en ≤960px — 4 lentes coincidieron.** El fix de la ronda 2 (anclas de dinero 32px sobre operación 27px) solo sobrevive >960px. En index.css:963, dentro de `@media(max-width:960px)`, la regla global `.kpi__v{font-size:24px !important}` vence por !important a `.rep-money .kpi__v{font-size:32px}` (816, sin !important); a ≤480px todo cae a 19px. Medido: 1280px→32/27, 786px→24/24, 375px→19/19. "La plata se lee de un vistazo" por tamaño se pierde justo en la tablet del mostrador y el celular. **Fix**: dentro de los `@media ≤960px` y `≤480px`, re-escalar (no aplanar) las anclas: `.rep-money .kpi__v{font-size:28px !important}` (~22px en ≤480), manteniendo el dinero por encima de operación. → layout/adapt

**[P2] El aviso de tope de 500 OT no aparece en rangos personalizados — subcuenta en silencio.** `topeAlcanzado` (L101) solo se activa con `presetActivo ∈ {todo,anio,trimestre}`, pero `setFecha` (L428) pone `presetActivo=null` al teclear fechas. Si Juan escribe "desde 2021" y hay >500 OT, el fetch está topado (fecha desc) y NO se avisa. Es un error de plata silencioso: el total puede quedar corto sin señal. **Fix**: disparar el aviso por el span efectivo del rango (o comparar con la OT más antigua traída), no por el nombre del preset. → harden

**[P3] Accesibilidad — 3 refinamientos.** (a) El `role="button"` sobre el div-cabezal (L67-78, usado 9x) canibaliza los `<h3>`: un botón aplana su contenido, así que los 9 títulos de sección dejan de anunciarse como encabezados y el lector de pantalla pierde el esquema. Fix: meter un `<button>` DENTRO del `<h3>` (o quitar role=button del wrapper). (b) Las rotaciones de chevron (L73) y del ícono Recoger (L463) usan `transition` inline que el bloque `prefers-reduced-motion` (index.css:1141) no cubre. (c) Chips de preset 38px < 44px táctil cómodo (L492) — pasan WCAG 2.5.8 AA (24px) pero apretados para 40+ en celular. → harden

**[P3] Honestidad — 3 refinamientos.** (a) "Aporte al taller" salta a VERDE y cambia de nombre con UN solo repuesto costeado (umbral binario `coberturaMargen===0`, L448/450/451): a cobertura 5% ya va verde aunque el número siga casi entero sin costo. Fix: verde gradual (neutro hasta ~70-80%). (b) El regex `pareceServicio` (L37) incluye `computador|pintura|soldadura|lavad` → marca falso-positivo repuestos físicos reales (ECU/computadora del motor, pintura, alambre de soldadura, motor lavaparabrisas). Fix: exigir señales más fuertes de M.O. y afinar exclusiones. (c) CSV/PDF se exportan aunque el rango esté vacío o inválido (botones fuera del guard `stats.total===0`, L468-475): archivo solo-headers + toast "(0 OT)". Fix: deshabilitar o cortar con aviso cuando `filtrados.length===0 || rangoInvalido`. → clarify + harden

**[P3] IA/UX del plegado — 4 refinamientos.** (a) El plegado no persiste (`useState({})` sin localStorage, L59): cada visita reabre las 9 tarjetas y borra lo que Juan configuró. Fix: persistir `colapso` en localStorage. (b) "Distribución por estado" (hoy 1 segmento 100% Completado) ocupa la posición #1 del detalle, empujando las tarjetas de plata (Ingresos/Utilidad/Margen) hacia abajo. Fix: reordenar plata primero, y auto-colapsar/degradar a texto cuando hay ≤1 estado. (c) El cabezal es un `.card__h` plano con solo `cursor:pointer` y chevron gris de bajo contraste; la app YA tiene `.card__h--toggle` (con `:hover`) en Trabajos.jsx sin reusar. Fix: adoptar esa clase y subir el chevron a `--text-2`. (d) 9 tarjetas fragmentan 3 historias; Ingresos+Utilidad+Margen son la misma historia de rentabilidad. Fix: consolidar a ~5 secciones con narrativa. → layout/distill

## Red flags por persona

- **Juan (dueño, 40+, mostrador/tablet/celular)**: en cualquier ventana <960px (tablet, celular, o el navegador angosto del mostrador) las anclas de dinero pierden su tamaño y quedan iguales a los KPIs chicos, contra el principio que motivó todo el rediseño. Los chips de 38px le pueden mandar a un preset equivocado (cambia toda la plata). Si teclea un rango de años, puede ver un total topado en 500 sin aviso.
- **Sam (a11y, lector de pantalla)**: pierde el esquema por encabezados (los 9 `<h3>` quedan dentro de botones); los chevrons giran aunque pida menos movimiento.
- **Riley (stress)**: exporta CSV/PDF vacío en rango inválido; el verde del "Aporte" aparece con 1 solo repuesto costeado; el `¿servicio?` marca una ECU real como sospechosa.

## Observaciones menores

- La nota de fórmula del neto (234 chars) compite en peso con el ancla; podría ir tras un disclosure "¿cómo se calcula?".
- Al plegar, las leyendas/notas de contexto se ocultan (esperado, pero quita ayuda).
- Sin glosario persistente para "cobertura", "descuadre" (solo el badge "Revisar" lo insinúa).

## Preguntas

1. Si la jerarquía de dinero es el corazón del rediseño y se pierde en la tablet/celular del mostrador, ¿vale re-escalar en cada breakpoint (no solo >960px)?
2. ¿El "Aporte al taller" debería ganarse el verde de forma gradual (cobertura alta) en vez de con el primer repuesto costeado?
3. Con las tarjetas plegables, ¿tiene sentido arrancar en modo resumen (detalle recogido) y recordar lo que Juan dejó (localStorage)?
