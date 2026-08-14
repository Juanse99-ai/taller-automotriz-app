---
target: ventana de Reportes (src/pages/Reportes.jsx)
total_score: 38
p0_count: 0
p1_count: 0
timestamp: 2026-07-21T16-55-17Z
slug: src-pages-reportes-jsx
---
# Critique: Reportes (src/pages/Reportes.jsx) — ronda 4

Register: product · HEAD 4b0c43c · Evidencia en vivo (desktop/tablet/móvil, medida por JS) + panel de Nielsen + 3 lentes con verificación adversarial (15 hallazgos, 1 refutado). Detector determinístico NO disponible (motor ausente; exit 1).

## Design Health Score

| # | Heurística | R3 | R4 | Nota |
|---|-----------|:--:|:--:|------|
| 1 | Visibilidad del estado | 3 | **4** | Rango en subtítulo, aria-pressed, skeletons, aviso de tope por rango efectivo, badges de cobertura, aria-expanded coherente |
| 2 | Sistema ↔ mundo real | 4 | 4 | "Margen antes de repuestos" vs "Aporte al taller"; $ tabular; sin jerga |
| 3 | Control y libertad | 4 | 4 | Presets + Corregir + plegado persistente; "Expandir" siempre visible |
| 4 | Consistencia | 4 | 4 | Button/Badge/pdfTheme/tbl-cards; una sola manoObraBase; h3 real con button dentro |
| 5 | Prevención de errores | 4 | **3** | Verde gradual + rango invertido + tope 500. Baja por el export sin guard (P3b) |
| 6 | Reconocimiento | 4 | **4** | Leyendas, labels, data-label móvil, preset activo |
| 7 | Flexibilidad | 3 | **4** | Arranca en RESUMEN; presets + persistencia + teclado; chips 44px |
| 8 | Estética/minimalismo | 3 | 3 | Anti-slop logrado; baja por Distribución #1 + 9 secciones fragmentando 3 historias |
| 9 | Recuperación de errores | 4 | **4** | Rango invertido nombra fechas + Corregir; "Revisar" vs "Agotado" |
| 10 | Ayuda | 3 | **4** | Fórmula, % comisión, salvedad de cobertura, tooltips, todo en el punto de uso |
| **Total** | | **35** | **38/40** | **Excellent** (trend 17 → 30 → 35 → 38) |

## Veredicto anti-patrones
**No es slop, y llegó a Excellent.** Cero bans verificados. Las 7 correcciones de la ronda 3 se sostienen en el código, pero DOS quedaron a medias (ver "self-inflicted"). Detector no disponible (motor ausente).

## Qué funciona (verificado)
1. **Una sola "mano de obra" de verdad**: `manoObraBase` es la fuente única; suma del equipo = Utilidad = split = comisión, sincronizado con Liquidación. Top clientes/vehículos facturan solo completadas.
2. **Honestidad de plata**: el ancla va gris con badge hasta ganar el verde; margen expone su cobertura; el aviso de tope 500 ahora es por rango efectivo.
3. **Jerarquía money>ops sostenida en todo ancho** (especificidad + !important + breakpoints 32/28/22 vs 27/24/19); el modo resumen por defecto es descubrible para lector (aria-expanded=false).

## Self-inflicted: 2 arreglos de la ronda 3 quedaron a medias

**[P3] El respeto a prefers-reduced-motion en los chevrons es un NO-OP.** La ronda 3 añadió `@media(prefers-reduced-motion:reduce){.rep-chevron,.rep-recoger-icon{transition:none}}` (index.css:1159), pero la `transition` vive **inline** en el SVG (Reportes.jsx:85 y :493), y el estilo inline gana sobre cualquier selector sin `!important`. Resultado: los chevrons **siguen animando** aunque el usuario pida menos movimiento. Fix: mover la `transition` del inline a la clase `.rep-chevron`/`.rep-recoger-icon` (dejar inline solo el `transform`), así el `@media` gana por orden.

**[P3] El nuevo cabezal encogió el objetivo táctil del toggle a ~24px (regresión).** Al mover el disclosure a un `<button class=rep-toggle>` con `padding:'2px 4px'` sin min-height (Reportes.jsx:83), el área clicable pasó de ~45px (el `.card__h` completo con role=button, ronda 2) a solo la altura del título+chevron (~24px). Juan pliega/expande a diario, a veces en celular. Fix: subir el padding vertical del botón (ej. `padding:'12px 4px'` con `margin:'-12px -4px'`) para recuperar ≥44px sin romper el heading.

## Issues de plata

**[P2] El verde gradual tiene un acantilado en 75%: entre 75% y 99% el neto salta a verde "Aporte al taller" y pierde TODA salvedad, aunque sigue sobreestimado.** El umbral es binario (`netoConfiable = coberturaMargen >= 75`, L477): a 74% va gris + aviso ámbar; a 76% va verde pleno sin ninguna nota, aunque ~24% de los repuestos no tienen costo descontado. Fix: mantener un renglón muted "costo cubre X%" mientras cobertura < 100 (no solo < 75); el verde a ≥75 puede quedar (diseño intencional), pero la salvedad no debe desaparecer hasta el 100%. *(Refinamiento de mi propio fix de la ronda 3.)*

**[P2] Un ítem con `es_servicio:1` (snake_case) se cuenta DOBLE: como mano de obra Y como repuesto.** `manoObraBase` (comision.js:21) trata un ítem como servicio si `esServicio===true || es_servicio===1 || tipo.includes('serv')`, pero el loop de repuestos/split de Reportes (L181 y L233) usa solo `esServicio===true || tipo.includes('serv')` — **omite `es_servicio===1`**. Un ítem guardado en snake_case sin 'serv' en tipo cuenta como M.O. en `manoObraBase` y como repuesto en el split/ranking → doble conteo (infla repuestos y el split, y aparece en "Repuestos más vendidos"). Fix: extraer una única `esServicioItem(i)` en comision.js y usarla en las dos ramas de Reportes.

## Backlog P3 conocido (sigue vigente, no re-descubierto)

- **Export sin guard**: CSV/PDF (L498-505, en el pagehd) se exportan aunque el rango esté vacío/invertido → PDF "REPORTE" vacío o de rango inválido. Fix: `disabled` cuando `rangoInvalido || stats.total===0`.
- **Regex `¿servicio?` con falsos positivos**: `pareceServicio` (L37) incluye `computador|pintura|soldadura|lavad` → marca repuestos físicos reales (ECU, pintura, electrodo, bomba lavaparabrisas). Fix: acotar a raíces menos ambiguas.
- **"Distribución por estado" en posición #1**: hoy 1 solo segmento (100% Completado), la tarjeta menos informativa encabeza el detalle. Fix: moverla al final o auto-ocultar cuando hay ≤1 estado.
- **Rentabilidad fragmentada**: "Aporte al taller" (ancla) + "Utilidad taller" + "Margen" compiten sin jerarquía. Fix: bajar el peso/color de las utilidades intermedias; el ancla es el resumen.
- **Nota redundante bajo el ancla**: el párrafo de fórmula (L599-603) repite el mensaje que ya carga el badge del KPI. Fix: reducir a una línea o quitar.

## Minor
- **Comisiones**: el KPI redondea el total una vez (`round(moBase*0.4)`, L136); Liquidación redondea por OT. Puede diferir por centavos. Opcional.
- **Botón global doble-señaliza**: `aria-pressed` + label cambiante ("Expandir"/"Recoger") confunde al lector ("presionado"). Fix: un solo mecanismo.

## Refutado
- Inputs de fecha `width:160`: NO desbordan a 360px (envuelven bien). Descartado.

## Preguntas
1. Los dos arreglos a medias (reduced-motion no-op, touch target 24px) son de bajo costo, ¿los cierro ya?
2. El doble conteo por `es_servicio:1` es un error de plata real aunque hoy no se vea (depende de cómo se guarden los ítems). ¿Unificamos `esServicioItem`?
3. Para llegar a 40: ¿tomamos el backlog de IA (reordenar Distribución, consolidar rentabilidad) o lo dejamos porque el resumen-por-defecto ya lo mitiga?
