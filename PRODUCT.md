# Product

## Register

product

## Users

- **Juan (dueño/administrador)**: gestiona el taller Multidiagnósticos AS (Barranquilla, Colombia). Usa la app a diario en el computador del mostrador y a veces desde el celular. Liquida la nómina de técnicos, factura por Cuentti, revisa reportes. No es técnico de software; valora que todo sea legible de un vistazo.
- **Jefe de taller**: rol restringido (guard por sección). Crea OTs, recepciona vehículos, consulta trabajos. Usa más el celular en el piso del taller.
- **Clientes** (portal): ven el estado de su vehículo y su historial desde el teléfono, sin login.

## Product Purpose

App de gestión integral del taller: órdenes de trabajo, recepción con inspección, cotizaciones, inventario/facturación vía Cuentti, liquidación de comisiones de técnicos (40% de la M.O., diario 50/50, libro único de deudas) y portal del cliente. Éxito = el taller opera todo el día sobre la app sin fricción y sin errores de plata (facturas dobles, pagos que no cuadran).

## Brand Personality

Profesional, confiable, directo. Como una herramienta de trabajo bien hecha: seria con la plata, clara con los datos, sin decoración que estorbe. Tres palabras: **claro, sólido, honesto**.

## Anti-references

- **El "look IA"**: glassmorphism, degradados de texto, franjas laterales de color (`border-left` decorativo), tarjetas idénticas en grilla, hero-metric con gradiente. El usuario lo detecta y lo rechaza explícitamente.
- Micro-texto y bajo contraste (slate-400 en textos, iconos a opacidad 0.55).
- ~~Sidebars que se expanden con hover~~ — retirado: el dueño pidió el rail con hover-expand (86→212px) en el handoff y lo confirmó el 2026-08-19. Es el comportamiento deseado; no "corregirlo" a solo-click.
- Dashboards genéricos de plantilla SaaS.

**Referencia positiva**: Pitz (app.pitz.com.mx) — app de taller que compite en la misma categoría; legible, densa donde toca, profesional.

## Design Principles

1. **La plata se lee de un vistazo**: montos siempre con `$` y separador de miles, sin decimales, en cifras tabulares. La jerarquía visual sigue la jerarquía contable.
2. **Denso donde se trabaja, aire donde se decide**: tablas y listas pueden ser compactas; las acciones de dinero (pagar, facturar) necesitan espacio y confirmación.
3. **Jerarquía por tamaño y peso, no por efectos**: nada de sombras dramáticas, blurs ni color decorativo para separar contenido.
4. **Familiaridad ganada**: patrones estándar de herramienta (tablas, tabs, master-detail); la sorpresa se reserva para momentos, no para páginas.
5. **El error costoso se previene en el diseño**: estados de riesgo (OT sin técnico, factura sin caja, doble clic en pagos) se ven en rojo/ámbar y piden confirmación propia.

## Accessibility & Inclusion

- Fuentes grandes y legibles en todo (preferencia explícita del usuario; usuarios de 40+ años en ambiente de taller).
- Contraste alto en textos (mínimo AA; evitar grises claros sobre blanco).
- `prefers-reduced-motion` respetado (ya implementado en drawer/sidebar).
- Táctil cómodo en móvil: botones grandes, tablas que colapsan a tarjetas (`.tbl-cards`).
