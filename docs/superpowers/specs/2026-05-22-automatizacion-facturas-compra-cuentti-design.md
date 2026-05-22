# Automatización de ingreso de facturas de compra en Cuentti — Diseño

**Fecha:** 2026-05-22
**Estado:** Borrador para revisión
**Autor:** Claude + Juanse

---

## 1. Contexto y objetivo

El taller (MULTIDIAGNOSTICOS AS / razón social ASESORIAS Y SUMINISTROS AS S.A.S, NIT 901572225-2)
recibe facturas electrónicas de compra de sus proveedores (repuestos, herramientas). Hoy esas
facturas se registran **a mano** en Cuentti, lo cual es lento y propenso a errores.

**Objetivo:** automatizar — de forma asistida — el ingreso de esas facturas de compra a Cuentti,
de modo que al registrarlas se:
1. **Registre la compra** (documento contable).
2. **Sume el inventario** de los productos comprados.
3. **Actualice el costo** del producto cuando cambie.

El **precio de venta NO se toca automáticamente** — eso queda como decisión manual del usuario
cuando el costo sube.

## 2. Insumo (validado con datos reales)

Las facturas ya llegan al correo `multidiagnosticosas@gmail.com`. Una herramienta existente del
usuario filtra el correo y sube a Notion el **XML y el PDF** de cada factura electrónica, creando
una fila en la base **"Consolidado Facturas"** (Notion DB `272d3ac7-6cdc-8051-b44a-db93e92e5926`).

Esquema de la base Notion (campos relevantes):
- `Nº Factura` (título) — identificador (CUFE-like o consecutivo)
- `Cliente` (texto) — **es el PROVEEDOR/emisor** (campo mal nombrado)
- `Valor` (número, COP) — total de la factura
- `Estado` (select): Pendiente / Aceptado / En revisión / Enviado / Rechazado
- `Fecha Recepción` (fecha)
- `XML en Drive` (url) — link a Google Drive
- `PDF en Drive` (url) — link a Google Drive
- `Observación` (texto)

**Validación real (factura TOYOPARTS, FE 4792):** se leyó el PDF desde Drive y se extrajo
correctamente: proveedor + NIT, 4 ítems con código, descripción, cantidad, valor unitario, IVA
y total, y los totales (Subtotal 495.798 · IVA 94.202 · **Total 590.000**, que coincide con el
`Valor` de Notion). Los códigos de ítem son números de parte del proveedor (ej. `90080-36149`),
distintos a los SKU internos en Cuentti → confirma la necesidad de emparejamiento.

## 3. Estado actual del código

- Integración Cuentti existente (`src/services/cuentti.js`, `api/mcp/cuentti.js`) cubre **solo
  ventas**: `grabarFacturaSimple`, búsqueda de productos (`obtenerProductoSku`,
  `consultaProductoPaginadaMovil`), crear/editar producto (`grabarProductoMovil`),
  crear cliente (`grabarCliente`). **No hay nada de compras.**
- No existe endpoint conocido de **factura de compra** en el código. El módulo de compras SÍ
  existe en la UI de Cuentti (el usuario lo usa manual), pero su endpoint API es desconocido.
- MCPs HTTP desplegados en Vercel: `/mcp/taller` (Supabase, lectura) y `/mcp/cuentti`
  (Cuentti). Autenticación por OAuth para claude.ai (ver `api/_mcp/`).

## 4. Arquitectura (orquestada por Claude en Cowork)

Decisión clave: **Claude usa los conectores que ya existen** (Notion, Google Drive) para leer y
escribir, y **solo se construyen herramientas MCP nuevas del lado de Cuentti**. Esto minimiza
código nuevo.

```
Cowork (Claude orquesta)
  │
  ├─ Conector Notion       → listar pendientes (Estado=Pendiente) + writeback de estado
  ├─ Conector Google Drive → leer el PDF de la factura (read_file_content)
  │                           [cuenta multidiagnosticosas@gmail.com, ya conectada]
  └─ MCP Cuentti (Vercel)  → buscar producto · crear producto · REGISTRAR COMPRA
                              + tabla de equivalencias (Supabase)
```

**Por qué leer el PDF y no el XML:** el conector de Drive renderiza el PDF como texto limpio
(`read_file_content`), validado con datos reales. El XML llega como mime no soportado por
`read_file_content` y `download_file_content` lo entrega en base64 (difícil de decodificar en
Cowork). El XML queda como **refuerzo futuro** si algún PDF de proveedor extrae mal.

## 5. Flujo de datos (paso a paso)

Disparador: el usuario dice en Cowork *"ingresa las compras nuevas"*.

1. **Listar pendientes** — Claude consulta la base Notion con `Estado = Pendiente`.
2. **Por cada factura:**
   a. **Leer** — toma `PDF en Drive`, lee el contenido vía conector Drive, extrae proveedor/NIT,
      ítems (código, descripción, cantidad, costo unitario, IVA) y totales.
   b. **Emparejar** — por cada ítem, busca en Cuentti (ver §7). Marca: ✅ coincide / ⚠️ dudoso /
      ➕ nuevo.
3. **Resumen y confirmación (dry-run)** — Claude muestra: qué entra automático, qué es dudoso,
   qué se crearía nuevo, cambios de costo y el total. El usuario confirma.
4. **Verificar duplicado + Registrar (confirm)** — antes de registrar, verifica que no exista ya
   una compra con ese Nº de factura en Cuentti (si el endpoint lo permite — ver Milestone 0).
   Luego crea los productos nuevos aprobados, registra la compra en Cuentti (endpoint del
   Milestone 0), suma inventario y actualiza costo.
5. **Writeback Notion** — marca la fila `Estado = Aceptado` y deja en `Observación` el id de
   transacción de Cuentti (anti-reproceso).

## 6. Componentes nuevos (herramientas MCP del lado Cuentti)

1. **`buscar_producto_sku`** — YA EXISTE en `/mcp/cuentti`. Se reutiliza para emparejar.
2. **`crear_producto`** — NUEVA. Envuelve `grabarProductoMovil` (ya existe en el servicio):
   crea un producto en Cuentti con SKU, nombre, costo, IVA, categoría. Con dry-run/confirm.
3. **`registrar_compra`** — NUEVA y central. Recibe proveedor (NIT) + lista de ítems ya
   emparejados (id_producto Cuentti, cantidad, costo, IVA) + metadatos (Nº factura, fecha).
   Llama al endpoint de compra de Cuentti (Milestone 0). Con dry-run/confirm. Devuelve
   id_transacción. **Depende del Milestone 0.**
4. **Equivalencias** (`buscar_equivalencia` / `guardar_equivalencia`) — NUEVAS. Sobre Supabase
   (ver §8). Permiten recordar `código proveedor → SKU Cuentti`.

Listar pendientes, leer el PDF y el writeback a Notion **no requieren herramientas nuevas**:
Claude los hace con los conectores Notion/Drive directamente.

## 7. Lógica de emparejamiento (caso "mezcla")

Para cada ítem de la factura, en orden:

1. **Equivalencia guardada** — buscar en `compras_equivalencias` por `(proveedor_nit,
   codigo_proveedor)`. Si existe → ✅ match directo a ese SKU/id_producto.
2. **SKU exacto** — `buscar_producto_sku` con el código del ítem. Si coincide → ✅ y se guarda la
   equivalencia para la próxima vez.
3. **Nombre (difuso)** — si no hay código, Claude busca por descripción y propone el más parecido
   → ⚠️ requiere confirmación del usuario. Al confirmar, se guarda la equivalencia.
4. **Producto nuevo** — si nada coincide → ➕ se propone crear (usuario confirma nombre, categoría,
   precio de venta inicial). Se crea con `crear_producto` y se guarda la equivalencia.

La tabla de equivalencias hace que el sistema **mejore con el uso**: la segunda factura de un
proveedor entra casi sin intervención.

## 8. Modelo de datos: tabla de equivalencias (Supabase)

Tabla nueva `compras_equivalencias`:

| Columna | Tipo | Nota |
|---|---|---|
| id | text (PK) | uid |
| proveedor_nit | text | NIT del emisor |
| proveedor_nombre | text | referencia |
| codigo_proveedor | text | código del ítem en la factura |
| sku_cuentti | text | SKU interno emparejado |
| id_producto_cuentti | text | id de producto en Cuentti |
| nombre_producto | text | referencia |
| fecha_creacion | timestamptz | |

Índice por `(proveedor_nit, codigo_proveedor)`. RLS desactivado (igual que el resto del esquema
del taller). Se expone vía el **MCP de Cuentti** — los helpers de Supabase ya viven ahí
(`api/mcp/cuentti.js`, `supabaseTaller()`), así que es el hogar de menor fricción.

## 9. Manejo de errores y casos borde

- **Factura sin XML/PDF útil** (ej. DMD15293, "sin XML disponible") → no se procesa automático;
  Claude la lista aparte como "requiere ingreso manual". No se marca Aceptado.
- **Duplicado** → solo se procesan filas `Estado = Pendiente`; al terminar se marca `Aceptado`.
  Guarda adicional: verificar en Cuentti si ya existe una compra con ese Nº de factura antes de
  registrar.
- **Fallo a mitad** (Cuentti rechaza) → NO se marca Notion como Aceptado; se reporta el error con
  el detalle. El patrón dry-run/confirm evita estados a medias.
- **Costo cambió** → se actualiza el costo del producto y se avisa "costo subió de X a Y" en el
  resumen para que el usuario decida el precio de venta (manual).
- **Totales no cuadran** → se compara el total extraído contra el `Valor` de Notion; si difieren
  más de un margen mínimo, se marca para revisión y no se registra sin confirmación explícita.
- **Extracción de PDF pobre** (proveedor con layout raro) → se marca para revisión; refuerzo
  futuro: parsear el XML.

## 10. Seguridad

- **Dry-run por defecto, confirm para ejecutar** — mismo patrón ya usado en `crear_cliente_cuentti`
  y en las herramientas de venta. Nada se registra en Cuentti sin `confirm: true`.
- **Anti-duplicado** — vía `Estado` en Notion + verificación de Nº en Cuentti.
- **Credenciales** — el MCP usa las env vars ya configuradas en Vercel (`CUENTTI_TOKEN`,
  `MCP_SUPABASE_URL`, `SUPABASE_KEY`). No se exponen al cliente.

## 11. Milestone 0 — prerrequisitos a de-riskear (van primero)

1. **[RESUELTO] Leer la factura desde Drive** — validado: reconectado Drive a
   `multidiagnosticosas@gmail.com`, PDF de TOYOPARTS leído y parseado correctamente.
2. **[PENDIENTE — bloqueante] Endpoint de compra de Cuentti** — descubrir la petición que hace la
   UI de Cuentti al registrar una compra. Método: el usuario registra UNA compra manual con la
   pestaña Red del navegador abierta y copia la URL + el JSON del payload (igual que se hizo con
   ventas). Alternativa: capturar con el MCP de Chrome. Sin esto, `registrar_compra` no puede
   completarse. Al capturar, responder además: (a) ¿el endpoint afecta inventario **y** costo en
   una sola llamada o requiere pasos separados (documento + ajuste de costo)?, y (b) ¿se puede
   consultar una compra existente por Nº de factura, para el anti-duplicado del paso §5.4? **La
   interfaz de `registrar_compra` no se congela hasta tener esta captura** — por eso esa
   herramienta se construye DESPUÉS del Milestone 0, no en paralelo.

## 12. Fuera de alcance (YAGNI por ahora)

- OCR de facturas en foto/papel (todas las relevantes son electrónicas con PDF/XML).
- Parseo del XML server-side (se usa el PDF; XML es refuerzo futuro).
- Actualización automática del precio de venta (queda manual por decisión del usuario).
- Pantalla/UI dedicada en la app (el flujo es por Cowork).
- Procesamiento 100% sin intervención (el modo es asistido con confirmación).

## 13. Verificación / pruebas

- **Dry-run** muestra el plan completo antes de tocar Cuentti.
- **Primera corrida real:** procesar UNA factura de punta a punta, verificar en Cuentti
  (documento + inventario + costo), y recién después correr en lote.
- Validar que el writeback de Notion (`Estado=Aceptado` + id) ocurre solo tras éxito.

## 14. Preguntas abiertas

- ¿Categoría e impuesto (IVA) por defecto al crear productos nuevos en Cuentti? (decisión menor de plan)

> Resueltas tras la revisión de spec: la tabla de equivalencias va en el MCP de Cuentti (§8); la
> atomicidad inventario+costo del endpoint y la consulta por Nº de factura se responden en el
> Milestone 0 (§11.2).
