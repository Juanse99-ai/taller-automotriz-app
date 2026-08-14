---
target: src (app completa)
total_score: 29
p0_count: 1
p1_count: 5
timestamp: 2026-08-14T05-33-44Z
slug: src-app-completa
---
# Critique — app completa del taller (2026-08-14)

## Design Health Score — 29/40 (sólida, con dos flancos débiles)

| # | Heurística | Score | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Portal deja tarjetas en opacity:0 durante el timeline GSAP; "Cargando…" plano en Inventario/Liquidación vs skeletons en Reportes |
| 2 | Sistema ↔ mundo real | 4 | Sólido: "debe $42.000", "½ CON VÍCTOR", vocabulario de mostrador |
| 3 | Control y libertad | 3 | Sin deshacer; filtro "hoy" persistido atrapa en vistas vacías |
| 4 | Consistencia | 2 | Tres sistemas de KPI (.kpi/.kpi-ind/.kpi-bh); ~1.014 estilos inline; botones fuera del sistema en Cotizaciones y TopBar |
| 5 | Prevención de errores | 3 | Monto en el botón de pagar, anti doble-clic; pero tacho de eliminar pegado a Aprobar en 13 filas |
| 6 | Reconocimiento | 3 | Nombres de Clientes truncados a ~12 chars; acciones solo-ícono en la OT |
| 7 | Flexibilidad | 3 | Buscador global no abre la OT elegida (TopBar.jsx:146-150) |
| 8 | Estética/minimalismo | 3 | Muro de ~50 botones en Cotizaciones; "Total OTs 149" en el band de plata; chart con 9 barras en cero |
| 9 | Recuperación de errores | 3 | Banner conexión + Reintentar bien; dos banners apilados en Inventario |
| 10 | Ayuda | 2 | Micro-textos buenos; cero onboarding para el jefe de taller |

## Veredicto anti-IA

**No parece de plantilla** — y se nota el trabajo deliberado: cero glass decorativo, cero degradados de texto, cero border-left, íconos de KPI escondidos a propósito (index.css:515). Lo que aún delata:
1. **👋 en "Hola, Juan 👋"** (Dashboard.jsx:189) — saludo de plantilla SaaS.
2. **Grillas de 4 KPIs gemelos** en Trabajos/Cotizaciones/Inventario — la tarjeta idéntica repetida que el dueño veta (y en Trabajos abren EN CERO).
3. **.kpi-ind con border-top de color 3px** (index.css:803) — la franja vetada, rotada 90°.
4. **~1.014 estilos inline** en pages/ (PortalCliente 188, Liquidacion 165, Reportes 113) — la firma estructural; produce las derivas que el propio CSS documenta.

**Detector determinístico: NO CORRIÓ.** `detect.mjs` existe pero su motor (`detect-antipatterns.mjs`) no está en la instalación del skill — "bundled detector not found" tras intento real. Sin overlay visual.

## Walkthrough de primer uso (agente sin contexto, 3 tareas)

- **Recibir un carro**: ✅ 6 pasos. Wizard claro. Peros: "OT"/"Generar OT" sin explicar; autocompletado muestra clientes basura; **Cancelar borra todo sin confirmar**.
- **Cobrar el carro listo (KYZ155)**: ❌ FALLÓ en 9 pasos. La OT completada no tiene botón de cobro ni estado de pago; el flujo real vive en "Cuentti" (nombre propio, bajo ANÁLISIS); al llegar, el selector la oculta por ya-facturada y el usuario nunca supo si se cobró. "Efectivo (ID 1)" filtra IDs internos.
- **Cuánto pagarle a Pedro**: ✅ 3 pasos, la mejor tarea. Pero "debe $42.000" + "$40.000 neto" en la misma fila confunde: la deuda es ajuste OPCIONAL sin marcar.

**Móvil (390px)**: tap en fila de técnico de Liquidación NO responde en emulación táctil (verificado en parte: el handler funciona con evento directo; la entrega del tap nativo falla — probar en celular real); drawer del menú abre en blanco; tabs de estado de Trabajos se cortan sin indicador de scroll.

## Fortalezas

1. Liquidación: stepper 1-2-3, deuda visible junto al nombre, monto dentro del botón — el mejor flujo de la app.
2. La plata se lee: tabular-nums, $ y miles en todas partes, jerarquía dinero>operación mantenida por breakpoint.
3. Copy de dominio excepcional, cero jerga de software (donde no se filtra — ver abajo).
4. Estados no-felices pensados: banner de conexión con Reintentar, empty-states con acción, reduced-motion, focus-visible.

## Priority Issues

- **[P0] Portal del cliente invisible mientras corre GSAP** — contenido clave (avance, barra de progreso) arranca en opacity:0 y se revela en cadena de 3-4s; verificado en vivo caja "Avance del trabajo" en blanco y "15% completado" sin barra. Es el único contacto con el cliente, en celulares de gama baja. Fix: render visible por defecto, animación corta con estado final garantizado. → PortalCliente.jsx:406-452
- **[P1] La OT completada no tiene camino de cobro** — sin botón "Cobrar", sin estado de pago en la ficha; el flujo vive detrás del nombre "Cuentti" bajo ANÁLISIS. La tarea más frecuente del negocio falló para un usuario nuevo. Fix: badge Facturada/Pagada/Pendiente en la OT + botón "Cobrar" que salte a Cuentti con el trabajo preseleccionado.
- **[P1] Liquidación móvil: tap de técnico no responde + drawer en blanco** — bloquea liquidar desde el celular (el jefe de taller vive en móvil). Reproducido en emulación; confirmar en dispositivo real y corregir la entrega del evento.
- **[P1] Trabajos abre en "hoy" → 4 ceros y lista vacía con 149 OTs** — se lee como pérdida de datos. Fix: fallback automático a "Todas" con aviso. → Trabajos.jsx:99
- **[P1] Cotizaciones: ~50-65 botones visibles; Aprobar (verde) × 8 compite consigo mismo; eliminar a 30px de Aprobar** — fila = navegar al detalle; acciones al detalle o menú ⋯.
- **[P1] Contraste dark roto: --text-4 = 2.85:1 en micro-texto de 10-11.5px** (medido). Fix: subir a ≥#8d8d95 o prohibir --text-4 bajo 12px. → index.css:134

## Menores

Emoji 👋 · "Total OTs · histórico" en el band de plata · IDs "COT-mskjp…" ilegibles · chart 12 meses con 9 ceros · buscador global no abre la OT · "Cargando…" plano vs skeletons · "Tecnico" sin tilde en portal · kpi-ind border-top · nombres truncados en Clientes (anchos localStorage sin reset) · plata ambigua del portal ("$500.000 de $1.250.000" sin "abonado"; "Placa SERVICIO" filtrada al cliente) · Cancelar del wizard resetea sin confirmar · clientes basura en autocompletado · "6 sin técnico" sin explicación en móvil.

## Personas

- **Juan (dueño, 40+, no técnico)**: Trabajos en ceros = susto real; Cotizaciones lo obliga a escanear 50 botones para 2-3 aprobaciones/semana; micro-texto dark ilegible de noche.
- **Jefe de taller (móvil)**: no puede liquidar (tap muerto), drawer en blanco, tabs cortados sin señal de scroll.
- **Cliente (portal, celular)**: espera 3-4s viendo fantasmas; "¿cuánto debo?" requiere aritmética; "Placa SERVICIO" mina confianza.

## Preguntas

1. ¿"hoy" en Trabajos lo pidió alguien para el turno, o es herencia?
2. ¿Cuántas cotizaciones se aprueban por semana? Si son 2-3, el par Aprobar/Rechazar inline no paga su costo.
3. ¿El portal se ha visto en un Android de gama baja con datos móviles?
4. ¿Los anchos de columna de Clientes tienen reset desde la UI?
