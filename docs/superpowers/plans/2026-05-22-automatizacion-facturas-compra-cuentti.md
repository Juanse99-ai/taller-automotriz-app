# Automatización de facturas de compra en Cuentti — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar (asistido en Cowork) el ingreso de facturas de compra de proveedores a Cuentti: registrar la compra, sumar inventario y actualizar costo.

**Architecture:** Claude orquesta en Cowork. Usa los conectores de Notion y Google Drive directamente para leer las facturas pendientes y el PDF, y delega en herramientas MCP nuevas del lado de Cuentti (sobre el endpoint `/mcp/cuentti` ya desplegado en Vercel) para buscar/crear productos, emparejar y registrar la compra. Una tabla `compras_equivalencias` en Supabase recuerda `código proveedor → SKU` por proveedor.

**Tech Stack:** Node ESM serverless (Vercel), API Cuentti j4ErpPro, Supabase REST (PostgREST), conectores Claude (Notion, Google Drive). Sin framework de tests en el repo → verificación por `node --check`, snippets `node -e` para funciones puras, y dry-run sobre datos reales.

**Spec:** `docs/superpowers/specs/2026-05-22-automatizacion-facturas-compra-cuentti-design.md`

---

## Reparto de responsabilidades (importante)

El MCP en Vercel **NO** tiene acceso a Notion ni a Google Drive (son conectores de Claude). Por eso:

| Paso | Quién lo hace |
|---|---|
| Listar facturas `Estado=Pendiente` | **Claude** (conector Notion) |
| Leer el PDF de la factura y extraer items | **Claude** (conector Drive, `read_file_content`) |
| Buscar/crear producto, emparejar, registrar compra | **MCP Cuentti** (herramientas nuevas) |
| Equivalencias `código→SKU` | **MCP Cuentti** (Supabase vía `supabaseTaller()`) |
| Marcar la factura como Aceptada + id | **Claude** (conector Notion, writeback) |

Por eso NO se construyen herramientas para "listar Notion" ni "leer Drive": eso lo hace Claude con sus conectores.

## Mapa de archivos

- Modificar: `api/mcp/cuentti.js` — agregar herramientas `crear_producto`, `buscar_equivalencia`, `guardar_equivalencia`, `emparejar_items`, y (Fase 2) `registrar_compra`. Helpers puros `buildProductoPayload`, `clasificarItem`, (Fase 2) `buildCompraPayload`.
- Crear: `supabase-compras-equivalencias.sql` — migración de la tabla nueva.
- Referencia (ya existe, no tocar salvo lectura): `src/services/cuentti.js` (`grabarProductoMovil`), `api/mcp/cuentti.js` (`supabaseTaller`, `cuenttiRequest`, `buscar_producto_sku_cuentti`).

---

## FASE 0 — Milestone 0 (bloqueante, requiere al usuario)

### Task 0.1: Capturar el endpoint de compra de Cuentti

**No es código.** Acción del usuario (con o sin ayuda de Claude vía MCP de Chrome):

- [ ] Abrir Cuentti en Chrome → `F12` → pestaña **Network**.
- [ ] Registrar UNA compra de prueba normal y guardar.
- [ ] Localizar la petición `POST` disparada al guardar (hacia `app.cuenti.com/...`).
- [ ] Copiar: **URL** del endpoint + **payload (JSON)** + método.
- [ ] Responder además: (a) ¿afecta inventario y costo en una sola llamada o requiere pasos separados?, (b) ¿hay forma de consultar una compra por Nº de factura (anti-duplicado)?

**Salida:** la URL + el shape del payload. Desbloquea la Fase 2. Hasta tener esto, NO se implementa `registrar_compra`.

---

## FASE 1 — Cimientos (NO dependen del endpoint, se construyen ya)

### Task 1.1: Migración de la tabla `compras_equivalencias` (Supabase)

**Files:**
- Create: `supabase-compras-equivalencias.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Tabla de equivalencias para compras: codigo del proveedor -> SKU interno en Cuentti
CREATE TABLE IF NOT EXISTS compras_equivalencias (
  id text PRIMARY KEY,
  proveedor_nit text NOT NULL,
  proveedor_nombre text DEFAULT '',
  codigo_proveedor text NOT NULL,
  sku_cuentti text DEFAULT '',
  id_producto_cuentti text DEFAULT '',
  nombre_producto text DEFAULT '',
  fecha_creacion timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_equiv
  ON compras_equivalencias (proveedor_nit, codigo_proveedor);
ALTER TABLE compras_equivalencias DISABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Ejecutar en Supabase** (Dashboard → SQL Editor). Verificar que la tabla existe: `SELECT * FROM compras_equivalencias LIMIT 1;` → 0 filas, sin error.
- [ ] **Step 3: Agregar `compras_equivalencias` al array `TABLES` permitidas si aplica** (revisar `api/mcp/taller.js` — la lista `TABLES`; agregar para poder consultarla con `consultar_tabla` si se desea). Opcional.
- [ ] **Step 4: Commit** `git add supabase-compras-equivalencias.sql && git commit -m "feat(compras): tabla compras_equivalencias"`

### Task 1.2: Helper puro `buildProductoPayload` + tool `crear_producto`

**Files:**
- Modify: `api/mcp/cuentti.js` (helpers antes de `const tools`, y nueva tool en el array)

- [ ] **Step 1: Snippet de verificación de la función pura** (TDD-lite, sin framework)

Crear temporalmente y correr con `node`:
```js
// buildProductoPayload(p) debe mapear a body de grabraProductoMovil
const body = buildProductoPayload({ nombre:'X', sku:'S1', precioVenta:1000, idImpuesto:1, existencias:5 })
console.assert(body.sku === 'S1' && body.precio_venta === 1000 && body.es_servicio === 10, 'payload producto')
console.log('ok')
```
Expected: `ok` sin assertion error.

- [ ] **Step 2: Implementar `buildProductoPayload`** (portado de `src/services/cuentti.js` `grabarProductoMovil`):

```js
function buildProductoPayload(p) {
  return {
    idProductoSucursal: p.idProductoSucursal || 0,
    id_producto: p.idProducto || 0,
    id_sucursal: parseInt(CONFIG.branchId, 10),
    nombre: p.nombre || '',
    precio_venta: parseFloat(p.precioVenta) || 0,
    es_servicio: p.esServicio ? 1 : 10,
    id_marca: p.idMarca || 1,
    id_categoria: p.idCategoria || 1,
    sku: p.sku || '',
    es_activo: 1,
    codigo_barras: p.codigoBarras || '',
    nota: p.nota || '',
    id_empleado: parseInt(CONFIG.employeeId, 10),
    id_impuesto: p.idImpuesto || 1,
    existencias: parseFloat(p.existencias) || 0,
  }
}
```

- [ ] **Step 3: Implementar la tool `crear_producto`** (dry-run/confirm) en el array `tools`:

```js
{
  name: 'crear_producto',
  description: 'Crea un producto nuevo en Cuentti (envuelve grabraProductoMovil). dry-run por defecto; confirm:true para crear.',
  inputSchema: { type:'object', properties:{
    nombre:{type:'string'}, sku:{type:'string'}, codigoBarras:{type:'string'},
    precioVenta:{type:'number'}, idImpuesto:{type:'integer', default:1},
    idCategoria:{type:'integer', default:1}, esServicio:{type:'boolean'},
    existencias:{type:'number', default:0}, confirm:{type:'boolean'} },
    required:['nombre','confirm'] },
  handler: async (a) => {
    if (!a.nombre) return '❌ nombre obligatorio'
    const body = buildProductoPayload(a)
    if (!a.confirm) return ['## Dry-run: crear producto', '```json', JSON.stringify(body,null,2), '```', 'Pasa confirm:true para crear.'].join('\n')
    const resp = await cuenttiRequest('/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/grabraProductoMovil', 'POST', body)
    const id = resp?.id_producto || resp?.id || resp?.data?.id_producto || '(no devuelto)'
    return `## ✅ Producto creado\n**id_producto:** ${id}\n**SKU:** ${a.sku||'—'} · **Nombre:** ${a.nombre}`
  },
}
```

- [ ] **Step 4: Verificar** `node --check api/mcp/cuentti.js` → OK.
- [ ] **Step 5: Commit** `git add api/mcp/cuentti.js && git commit -m "feat(compras): tool crear_producto en MCP Cuentti"`

### Task 1.3: Tools de equivalencias `buscar_equivalencia` / `guardar_equivalencia`

**Files:** Modify `api/mcp/cuentti.js` (usa `supabaseTaller()` ya existente)

- [ ] **Step 1: `buscar_equivalencia`** — query por `(proveedor_nit, codigo_proveedor)`:

```js
{
  name: 'buscar_equivalencia',
  description: 'Busca el SKU interno equivalente a un código de proveedor (tabla compras_equivalencias).',
  inputSchema: { type:'object', properties:{ proveedorNit:{type:'string'}, codigoProveedor:{type:'string'} }, required:['proveedorNit','codigoProveedor'] },
  handler: async ({ proveedorNit, codigoProveedor }) => {
    const q = `select=*&proveedor_nit=eq.${encodeURIComponent(proveedorNit)}&codigo_proveedor=eq.${encodeURIComponent(codigoProveedor)}`
    const rows = await supabaseTaller('compras_equivalencias', { query: q })
    if (!rows.length) return `Sin equivalencia para ${codigoProveedor} (proveedor ${proveedorNit}).`
    const e = rows[0]
    return `## Equivalencia\n**${codigoProveedor}** → SKU **${e.sku_cuentti}** (id_producto ${e.id_producto_cuentti}) — ${e.nombre_producto}`
  },
}
```

- [ ] **Step 2: `guardar_equivalencia`** — upsert:

```js
{
  name: 'guardar_equivalencia',
  description: 'Guarda/actualiza la equivalencia código de proveedor → SKU interno.',
  inputSchema: { type:'object', properties:{
    proveedorNit:{type:'string'}, proveedorNombre:{type:'string'}, codigoProveedor:{type:'string'},
    skuCuentti:{type:'string'}, idProductoCuentti:{type:'string'}, nombreProducto:{type:'string'} },
    required:['proveedorNit','codigoProveedor','skuCuentti'] },
  handler: async (a) => {
    const row = { id: uidc(), proveedor_nit:a.proveedorNit, proveedor_nombre:a.proveedorNombre||'',
      codigo_proveedor:a.codigoProveedor, sku_cuentti:a.skuCuentti, id_producto_cuentti:a.idProductoCuentti||'',
      nombre_producto:a.nombreProducto||'' }
    await supabaseTaller('compras_equivalencias', { method:'POST', body:row, upsert:true })
    return `## ✅ Equivalencia guardada\n${a.codigoProveedor} → ${a.skuCuentti}`
  },
}
```
(Nota: agregar helper `uidc()` local en cuentti.js — `Date.now().toString(36)+Math.random().toString(36).slice(2,7)`. El upsert por índice único `(proveedor_nit,codigo_proveedor)` requiere `Prefer: resolution=merge-duplicates` — ya lo pone `supabaseTaller` con `upsert:true`, pero el conflict target es la PK `id`; para merge por el índice único conviene PATCH si existe. Simplificar: buscar primero, si existe PATCH, si no POST.)

- [ ] **Step 3: Verificar** `node --check api/mcp/cuentti.js`.
- [ ] **Step 4: Commit** `git commit -m "feat(compras): equivalencias buscar/guardar"`

### Task 1.4: Helper puro `clasificarItem` + tool `emparejar_items`

**Files:** Modify `api/mcp/cuentti.js`

- [ ] **Step 1: Snippet de verificación de `clasificarItem`** (`node -e`): dado un item con SKU que existe → `match`; con equivalencia → `match`; sin nada → `nuevo`.
- [ ] **Step 2: Implementar `emparejar_items`** — input `proveedorNit` + `items[{codigo,descripcion,cantidad,costo,iva}]`. Por cada item: (1) `buscar_equivalencia`; si no, (2) `buscar_producto_sku` (Cuentti); clasifica `match` / `nuevo`. Devuelve listas. El emparejamiento difuso por nombre lo hace Claude después sobre los `nuevo`/dudosos.
- [ ] **Step 3:** `node --check`. 
- [ ] **Step 4: Commit** `git commit -m "feat(compras): emparejar_items"`

### Task 1.5: Deploy de Fase 1 y prueba de herramientas (sin registrar compra)

- [ ] **Step 1:** `node --check api/mcp/cuentti.js` final.
- [ ] **Step 2:** Commit pendientes y `git push` (Vercel auto-deploy).
- [ ] **Step 3:** Desde Cowork, reconectar/refrescar el conector de Cuentti para que aparezcan las tools nuevas.
- [ ] **Step 4:** Probar `emparejar_items` con los 4 items reales de la factura TOYOPARTS (códigos `90080-36149`, etc.) → ver cuáles matchean y cuáles son nuevos. Probar `crear_producto` en dry-run.

---

## FASE 2 — `registrar_compra` (DESPUÉS del Milestone 0)

> Bloqueada hasta tener la captura (Task 0.1). El shape del payload y si inventario+costo van en una o varias llamadas se definen con la captura.

### Task 2.1: Helper puro `buildCompraPayload`
- [ ] Definir a partir del payload capturado. Snippet `node -e` que valide que mapea proveedor + items (id_producto, cantidad, costo, IVA) + totales.

### Task 2.2: Tool `registrar_compra` (dry-run/confirm + anti-duplicado)
- [ ] Input: `proveedorNit`, `proveedorNombre`, `numeroFactura`, `fecha`, `items` ya emparejados (con `id_producto_cuentti`, cantidad, costo, iva).
- [ ] Anti-duplicado: si la captura reveló consulta por Nº, verificar antes de registrar.
- [ ] dry-run por defecto; `confirm:true` ejecuta. Devuelve id_transacción.
- [ ] Si la captura indica pasos separados (documento + ajuste de costo), encadenarlos aquí.
- [ ] `node --check` + commit.

### Task 2.3: Orquestación de costo
- [ ] Si el costo del producto cambió, actualizarlo (vía el mismo endpoint de compra si lo hace, o `grabraProductoMovil`). Reportar "costo subió de X a Y" en la salida (precio de venta NO se toca).

---

## FASE 3 — Flujo Cowork end-to-end + prueba real

### Task 3.1: Documentar el playbook de Cowork
- [ ] Dejar escrito (en el spec o un breve doc/skill) el orden que sigue Claude: listar pendientes (Notion) → leer PDF (Drive) → `emparejar_items` → mostrar resumen (dry-run) → confirmar → `crear_producto` (nuevos) → `registrar_compra` (confirm) → writeback Notion (`Estado=Aceptado` + id).

### Task 3.2: Prueba real de punta a punta (una factura)
- [ ] Procesar la factura TOYOPARTS completa en Cuentti (con confirmación). Verificar en Cuentti: documento de compra creado, inventario sumado, costo actualizado.
- [ ] Verificar writeback en Notion.
- [ ] Solo tras éxito de UNA, correr el resto de pendientes en lote.

---

## Notas
- Patrón de seguridad: **dry-run por defecto, `confirm:true` para ejecutar** en toda tool que escribe (igual que `crear_cliente_cuentti` y las tools de venta).
- Sin framework de tests en el repo: verificación = `node --check` + snippets `node -e` para funciones puras + dry-run sobre datos reales. No introducir un framework de tests (fuera de alcance).
- Credenciales: env vars ya en Vercel (`CUENTTI_TOKEN`, `MCP_SUPABASE_URL`, `SUPABASE_KEY`). No exponer al cliente.
