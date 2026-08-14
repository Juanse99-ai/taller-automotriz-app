---
target: ventana de Reportes (src/pages/Reportes.jsx)
total_score: 17
p0_count: 2
p1_count: 2
timestamp: 2026-07-21T05-55-05Z
slug: src-pages-reportes-jsx
---
# Critique: Reportes (src/pages/Reportes.jsx)

Register: product · Evaluado en vivo (desktop 1280, móvil 375, dark) + código. Detector determinístico no disponible en esta instalación (wrapper `detect.mjs` sin motor `detect-antipatterns.mjs`; intento real, exit 1).

## Design Health Score

| # | Heurística | Puntaje | Hallazgo clave |
|---|-----------|-------|-----------|
| 1 | Visibilidad del estado | 2 | Ningún preset marca cuál está activo; exportar no confirma; cold start pinta $0 sin skeleton (App.jsx no pasa `loading`) |
| 2 | Sistema ↔ mundo real | 2 | "Neto taller" y "Utilidad taller" no son neto ni utilidad contable (IVA mezclado, sin costo de repuestos) |
| 3 | Control y libertad | 2 | Rango invertido deja la página en ceros sin aviso ni salida |
| 4 | Consistencia y estándares | 1 | Las 4 tablas usan `.tbl` pelado (el resto de la app usa `.tbl-cards` móvil); chip `.count` significa "filas" en unas cards y "% margen" en otra; dos "Mano de obra" con valores distintos en la misma pantalla |
| 5 | Prevención de errores | 1 | `desde > hasta` aceptado en silencio; etiquetas contables infladas inducen el error caro |
| 6 | Reconocimiento vs recuerdo | 3 | Todo visible; falla en recordar qué rango miras tras 9 cards de scroll |
| 7 | Flexibilidad y eficiencia | 2 | Sin comparación vs periodo anterior; CSV exporta OTs crudas, no lo que ves |
| 8 | Estética y minimalismo | 2 | 9 cards apiladas sin agrupación; MAYÚSCULAS de Cuentti dominan tablas |
| 9 | Recuperación de errores | 1 | No existe ningún mensaje de error en la página |
| 10 | Ayuda y documentación | 1 | Solo una nota metodológica (cobertura margen); ninguna cifra de plata explica su cálculo |
| **Total** | | **17/40** | **Poor (la base visual es sólida; la capa de confianza en los números y el móvil requieren intervención mayor)** |

## Veredicto anti-patrones

**LLM**: No es slop visual: tarjetas planas 1px, cero gradientes/glass/franjas, mono tabular, jerarquía por peso. Pasa los bans absolutos. Lo que delata ensamblaje rápido: emoji 📊 en CSV vs SVG en PDF, chips sin estado activo, tildes inconsistentes ("Distribucion", "Vehiculos", "PERIODO RAPIDO"), 6 SVGs de KPI ocultos por CSS (`.kpi__ic{display:none}`, uno es un reloj para "Comisiones"), mapa de colores de estados duplicado inline con clave muerta (`'En Proceso'` vs estado real `'En Progreso'` → pinta gris).

**Detector**: no disponible (motor ausente del bundle del skill; verificado con búsqueda exhaustiva). Overlays en navegador: no posibles sin el motor; evidencia sustituta = inspección en vivo con mediciones JS (scrollWidth 610px vs viewport 349px en las 4 tablas móviles, chips 47×36px, inputs fecha 13px).

## Impresión general

Herramienta seria en desktop que se derrumba en dos frentes: **el celular** (la plata queda fuera de pantalla en las 4 tablas) y **la semántica de la plata** ("Neto taller"/"Utilidad taller" prometen contabilidad que los números no cumplen, y el PDF lo consagra en la caja navy). La mayor oportunidad: hacer que los números digan la verdad y quepan en el bolsillo; el sistema visual ya está.

## Qué funciona

1. La plata se lee de un vistazo en desktop: `fmt` $ + miles sin decimales, `tabular-nums`, 22-27px peso 800, verde entra / ámbar−sale. Principio 1 del PRODUCT.md ejecutado.
2. Presets de rango correctos para el negocio + `ymdLocal` arregló de verdad el bug UTC-5 de "Hoy".
3. Honestidad metodológica puntual ("Sincronizando inventario…", "Cuentti no devolvió el costo…", nota de cobertura del margen). El tono correcto; falta heredarlo a las cifras grandes.

## Issues prioritarios

1. **[P0] En móvil ninguna tabla muestra la plata.** Las 4 tablas (Repuestos, Top clientes, Rendimiento del equipo, Vehículos) miden 610px en 349px de viewport; "Ingresos/Facturado/Mano de obra/Total" quedan fuera con scroll lateral casi invisible. Reportes usa `.tbl` pelado; 9 páginas de la app ya usan `.tbl-cards` + `data-label`. **Fix**: aplicar `tbl-cards` + `data-label` a las 4 tablas, cifra como protagonista de cada tarjeta. → adapt

2. **[P0] "Neto taller" y "Utilidad taller" mienten; el PDF lo consagra.** Neto = ingresos CON IVA (incluye repuestos a precio venta) − comisiones SIN IVA; no descuenta costo de repuestos ni IVA. En la misma pantalla conviven dos "Mano de obra" distintas: card Utilidad (con IVA, `ingresosRepuestos/MO` líneas 69-82) vs Rendimiento del equipo (sin IVA, `manoObraBase`). **Fix**: unificar toda la página a `manoObraBase` (sin IVA); renombrar KPI a "Ingresos − comisiones"; línea de "cómo se calcula" bajo cada cifra compuesta; mismo tratamiento en el PDF. → clarify + harden

3. **[P1] El filtro no comunica estado y acepta rangos inválidos.** Ningún chip marca activo; `desde > hasta` produce página de ceros con la barra repuestos/M.O. pintando 100% naranja para $0. **Fix**: variante sólida + `aria-pressed` en preset activo (limpiar al tocar fechas custom); swap automático o banner ámbar en rango invertido; empty state global único en vez de 9 cards en cero. → harden

4. **[P1] Rendimiento del equipo pierde OTs y plata.** 28+26+4=58 vs 60 completados: OTs cuyo `tecnicoId` no cruza con el equipo actual desaparecen con su M.O. Itera `TECNICOS` (array vivo, pero el useMemo no depende de sus cambios; incluye inactivos sin badge). Barra ámbar castiga al que esté <70% del líder. **Fix**: agrupar por `tecnicoId` real de las OTs del rango, fila "Sin técnico asignado", badge "Inactivo", barra neutra. → harden

5. **[P2] Rankings contaminados y etiquetas que no dicen lo que muestran.** Placa "SERVICIO" es el vehículo #1 y "CUANTIAS MENORES" el top cliente. "Venta repuestos (sin IVA)" muestra `repVentaConCosto` (solo lo cruzado con costo), no toda la venta. En Rotación, stock ≤ 0 se muestra "Agotado" pero el stock negativo aquí significa descuadre (Inventario lo llama "Revisar"). **Fix**: excluir/etiquetar mostrador en tops; renombrar a "Venta con costo conocido (sin IVA)"; "Revisar" para stock negativo. → clarify

6. **[P2] Tope silencioso de 500 OTs.** `fetchTrabajos()` trae `limit=500` orden fecha desc (supabase.js:66): los presets "Todo"/"Este año" subcontarán en silencio cuando el historial supere 500 OTs. Hoy latente; con el volumen actual será P1 en pocos meses. **Fix**: contar server-side para reportes o subir/paginar el límite y avisar "mostrando últimos 500". → harden

## Red flags por persona

- **Juan (dueño, 40+)**: citará "NETO TALLER $13.709.899" del PDF como plata real; labels 11px uppercase bajo su preferencia de fuentes grandes; en su celular las columnas de plata no existen; un dedazo en fecha = taller "en ceros" sin explicación.
- **Jefe de taller**: `jefe_taller` no incluye 'reportes' en PERMISOS (auth.js:49); nunca ve la página (¿intencional?). Si se abre, hereda la peor versión móvil (chips 36px < 44px táctil, inputs 13px disparan zoom iOS).
- **Alex (power user)**: no puede comparar vs mes pasado sin 2 CSVs a mano; el CSV no contiene nada de lo que la página muestra.
- **Riley (stress)**: rango invertido = ceros silenciosos; "−$ 0" en comisiones; "En Progreso" pinta gris idéntico a "Programado" por la clave muerta; "En Diagnostico" sin tilde viene de la constante misma.
- **Sam (a11y)**: inputs de fecha sin `<label>`; `<th>` vacíos en columnas de barras; barras sin texto alternativo; contraste AA ok en light, raspando en dark.

## Observaciones menores

- 📊 emoji vs SVG: un solo vocabulario de iconos.
- Tildes en títulos de UI ("Distribucion", "Vehiculos", "PERIODO RAPIDO", "7 dias").
- Divisor vertical del filtro queda huérfano al envolver en móvil.
- KPI row 6 en auto-fit deja 4+2 con huecos; SVGs muertos en markup.
- Chip `.count` con doble semántica (filas vs %).
- "Vehiculos frecuentes" sin orden secundario tras empates de visitas.
- "Sincronizando inventario de Cuentti…" sin auto-resolución visible ni reintento.
- Fechas legacy date-only caerían al día anterior por parse UTC en el filtro (línea 32); datos nuevos a salvo por anclaje T12:00.
- Nombres de Cuentti en MAYÚSCULAS a 2 líneas: truncar + title.

## Preguntas

1. Si el contador ve "NETO TALLER" en el PDF y pregunta de dónde salió, ¿qué responde Juan?
2. ¿Quién decide algo con los puestos 4-10 de cada ranking? La mitad del scroll esconde lo que importa (margen y equipo).
3. ¿Por qué Reportes es la única página donde el celular es ciudadano de segunda si la app ya resolvió eso con `.tbl-cards`?
