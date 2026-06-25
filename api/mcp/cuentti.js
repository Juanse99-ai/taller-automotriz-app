// MCP HTTP endpoint para Cuentti — montado en Vercel.
// URL final: https://<dominio>/mcp/cuentti  (ver vercel.json rewrites)
//
// Variables de entorno requeridas en Vercel:
//   MCP_TOKEN              - Bearer token para autenticar a claude.ai
//   CUENTTI_TOKEN          - Token de la API de Cuentti
//   CUENTTI_COMPANY_ID     - ID de empresa (default 11464)
//   CUENTTI_BRANCH_ID      - ID sucursal (default 1)
//   CUENTTI_EMPLOYEE_ID    - ID empleado (default 1)
//   CUENTTI_GTM            - Timezone (default GMT-0500)

import { handleMcp } from '../_mcp/shared.js'

const CONFIG = {
  baseUrl: process.env.CUENTTI_BASE_URL || 'https://app.cuenti.com',
  token: process.env.CUENTTI_TOKEN || '',
  companyId: process.env.CUENTTI_COMPANY_ID || '11464',
  branchId: process.env.CUENTTI_BRANCH_ID || '1',
  employeeId: process.env.CUENTTI_EMPLOYEE_ID || '2', // 2 = cajero real con la caja abierta (ver memoria cuentti-ids-caja)
  gtm: process.env.CUENTTI_GTM || 'GMT-0500',
  timeout: parseInt(process.env.CUENTTI_TIMEOUT || '15000', 10),
}

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${CONFIG.token}`,
    'x-auth-token-empresa': CONFIG.companyId,
    'x-id-sucursal': CONFIG.branchId,
    'x-id-empleado': CONFIG.employeeId,
    'X-Auth-Token-id-usuario': CONFIG.employeeId,
    'X-Auth-Token-usuario': CONFIG.employeeId,
    'x-gtm': CONFIG.gtm,
    usuario: CONFIG.employeeId,
    Accept: 'application/json',
  }
}

async function cuenttiRequest(endpoint, method = 'GET', body = null) {
  const url = `${CONFIG.baseUrl}${endpoint}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG.timeout)
  try {
    const opts = { method, headers: buildHeaders(), signal: controller.signal }
    if (body) opts.body = JSON.stringify(body)
    const r = await fetch(url, opts)
    clearTimeout(timer)
    const text = await r.text()
    let parsed = null
    try { parsed = JSON.parse(text) } catch { parsed = text }
    if (!r.ok) {
      const err = new Error(`Cuentti ${r.status}: ${typeof parsed === 'string' ? parsed : (parsed?.body || JSON.stringify(parsed))}`)
      err.status = r.status
      err.body = parsed
      throw err
    }
    return parsed
  } finally {
    clearTimeout(timer)
  }
}

function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(parseFloat(n) || 0)
}
function fmtFecha(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('es-CO') } catch { return String(iso) }
}

// ---------- Acceso a Supabase del taller (lectura de OT/cotizacion + writeback) ----------
// Reutiliza las mismas env vars del MCP Taller (compartidas en el proyecto Vercel).
const SUPABASE_URL = process.env.MCP_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''

async function supabaseTaller(table, { method = 'GET', query = '', body = null, upsert = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('MCP_SUPABASE_URL/SUPABASE_KEY no configurados en el servidor')
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Prefer: upsert ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
    Accept: 'application/json',
  }
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(url, opts)
  const text = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

// Paths de facturacion en Cuentti (portados de src/services/cuentti.js)
const FACTURA_PATHS = {
  grabarSimple: '/jServerj4ErpPro/api/token/grabarFacturaSimple',
  emitirFE: '/jServerj4ErpPro/com/j4ErpPro/server/transacion/generarFacturaElectronica/{id}/true/true/',
  urlDoc: '/jServerj4ErpPro/com/j4ErpPro/server/transacion/buscarQrId_transacion/{id}',
}

// IDs de consecutivo por resolucion (= RESOLUCIONES en src/utils/constants.js)
const RESOLUCION_ID = { MAS: 4, FEIC: 2 }

// Construye el payload de factura para Cuentti. El precio de cada item INCLUYE
// IVA. Identico a buildFacturaPayload de src/services/cuentti.js.
function buildFacturaPayload(factura) {
  const to2 = (n) => parseFloat((parseFloat(n || 0)).toFixed(2))
  const upper = (v) => (v ?? '').toString().trim().toUpperCase()

  const items = (factura.items || []).map(item => {
    const cantidad = parseFloat(item.cantidad) || 1
    const precioConIva = parseFloat(item.precio) || 0
    const impuesto = parseFloat(item.iva) || 19
    const precioBase = to2(precioConIva / (1 + impuesto / 100))
    const total = to2(precioBase * cantidad * (1 + impuesto / 100))
    const sku = item.sku || item.codigo || 'MO1'
    return {
      sku,
      descripcion: item.nombre || (item.esServicio ? 'Servicio Taller' : 'Repuesto'),
      precio_venta: precioBase,
      cantidad: Number.isFinite(cantidad) ? cantidad : 1,
      impuesto: parseInt(impuesto, 10),
      total,
      descuentoPor: 0,
      descuento_valor: 0,
    }
  })

  const totalNeto = to2(items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0))
  const totalSinImp = to2(items.reduce((s, i) => s + ((parseFloat(i.precio_venta) || 0) * (parseFloat(i.cantidad) || 0)), 0))
  const totalImp = to2(totalNeto - totalSinImp)

  const empId = parseInt(CONFIG.employeeId, 10) || 1
  const branchId = parseInt(CONFIG.branchId, 10) || 1
  const consecutivo = factura.resolucion === 'FEIC' ? RESOLUCION_ID.FEIC : RESOLUCION_ID.MAS
  const tipoDoc = factura.tipoDocumento || 1

  const clienteIdRaw = factura.clienteId ?? factura.cuenttiId
  const clienteId = parseInt(clienteIdRaw ?? -1, 10)
  const idCliente = Number.isFinite(clienteId) ? clienteId : -1

  return {
    tipoDocumento: tipoDoc,
    id_sucursal: branchId,
    id_bodega: branchId,
    id_consecutivo: consecutivo,
    id_documento: null,
    id_vendedor: empId,
    id_empleado: empId,
    nota: factura.observaciones || '',
    total_neto: to2(totalNeto),
    total_impuestos: to2(totalImp),
    total_sin_impuestos: to2(totalSinImp),
    observacion: '',
    objClienteMini: {
      id_cliente: idCliente,
      nombre_cliente: upper(factura.cliente || 'CONSUMIDOR FINAL'),
      identificacion: (factura.cedula || '222222222222').toString(),
    },
    objDetalle: items,
    lstPagos: factura.aCredito ? [] : [{
      id_medio_pago: factura.idMedioPago ?? 1,
      id_banco: factura.idBanco ?? 1, // 1=Caja General (efectivo). 2=Bancolombia, 3=Nequi
      valor: to2(totalNeto),
      boucher: '',
      digitos: '',
      devuelta: 0,
      dinero_entregado: 0,
      nota: factura.otCodigo ? `OT: ${factura.otCodigo}` : '',
      fecha_registro: Date.now(),
    }],
  }
}

// Extrae el id_transacion de la respuesta de Cuentti (portado de CuenttiPanel).
function extractIdTransacion(res) {
  const directo = res?.id_transacion || res?.id_transaccion || res?.idTransacion || res?.idTransaccion
    || res?.data?.id_transacion || res?.transacion?.id_transacion || res?.transaccion?.id_transaccion
  if (directo) return directo
  if (res?.retorno && typeof res.retorno === 'string') {
    const partes = res.retorno.split(';')
    if (partes.length >= 4 && partes[3]) return partes[3]
  }
  if (res?.url_externa) {
    const match = res.url_externa.match(/[?&]i=([^&]+)/)
    if (match) return match[1]
  }
  return ''
}

// uid local para registros de equivalencias
function uidc() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// Body para grabraProductoMovil (portado de src/services/cuentti.js)
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

// Busca un producto en Cuentti por SKU exacto; devuelve el objeto crudo o null
async function buscarProductoSkuRaw(sku) {
  const s = String(sku || '').trim()
  if (!s) return null
  const path = `/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/obtenerProductoSku/${CONFIG.branchId}/${encodeURIComponent(s)}`
  try {
    const data = await cuenttiRequest(path)
    if (!data || data.message) return null
    const p = Array.isArray(data) ? data[0] : data
    if (!p || !p.id_producto) return null
    return p
  } catch { return null }
}

// Busca si ya se registro una compra de ese proveedor con ese numero de factura
// (anti-duplicado). Devuelve la fila o null. No-fatal: si Supabase falla, null.
async function buscarCompraRegistrada(proveedorNit, numeroFactura) {
  const nf = String(numeroFactura || '').trim()
  const nit = String(proveedorNit || '').trim()
  if (!nf || !nit) return null
  try {
    const q = `select=*&proveedor_nit=eq.${encodeURIComponent(nit)}&numero_factura=eq.${encodeURIComponent(nf)}&limit=1`
    const rows = await supabaseTaller('compras_registradas', { query: q })
    return Array.isArray(rows) && rows[0] ? rows[0] : null
  } catch { return null }
}

// Guarda el registro de una compra ya enviada a Cuentti (para anti-duplicado).
async function guardarCompraRegistrada({ proveedorNit, proveedorNombre, numeroFactura, fecha, total, itemsCount, idTransacion }) {
  try {
    await supabaseTaller('compras_registradas', {
      method: 'POST',
      body: {
        id: uidc(),
        proveedor_nit: String(proveedorNit || '').trim(),
        proveedor_nombre: proveedorNombre || '',
        numero_factura: String(numeroFactura || '').trim(),
        fecha: fechaDocumento(fecha) || '',
        total: parseFloat(total) || 0,
        items_count: itemsCount || 0,
        id_transacion: String(idTransacion || ''),
      },
    })
  } catch { /* no-fatal: la compra ya se creo en Cuentti */ }
}

// Normaliza la fecha del documento a "YYYY-MM-DD". Acepta "YYYY-MM-DD" o
// "YYYY-MM-DDTHH:..." (toma solo la parte de fecha). Devuelve null si viene
// vacia o invalida -> en ese caso NO se manda fecha y Cuentti usa la de hoy
// (= comportamiento actual, no se rompe nada).
function fechaDocumento(fecha) {
  const s = String(fecha || '').trim()
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? m[1] : null
}

// IMPORTANTE: grabarFacturaSimple NO acepta fecha del documento (VALIDA el
// esquema y responde HTTP 400 ante cualquier campo desconocido, confirmado
// empiricamente y por el Postman oficial). Por eso el documento nace con la
// fecha de hoy y, si hace falta, se corrige en un 2do paso con
// cambiarFechaTransacion (el endpoint del boton "Editar fecha transaccion").

// Convierte "YYYY-MM-DD" a epoch en milisegundos al MEDIODIA hora Colombia
// (12:00 GMT-0500 = 17:00 UTC). Usar mediodia evita que un corrimiento de zona
// horaria mueva el dia. Devuelve null si la fecha es invalida.
function fechaEpochMs(fecha) {
  const f = fechaDocumento(fecha)
  if (!f) return null
  const [y, m, d] = f.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 17, 0, 0) // 17:00 UTC = 12:00 Colombia (GMT-5)
}

// Cambia la fecha de un documento YA creado en Cuentti (boton "Editar fecha
// transaccion"). Endpoint dado por el ingeniero de Cuentti (Juan David Davila):
//   GET .../transacion/cambiarFechaTransacion/{fecha_registro}/{fecha_anterior}/{id_empleado}/{id_transacion}
// Las fechas van en epoch ms (new Date().getTime()).
async function cambiarFechaTransacion(idTransacion, fechaNuevaMs, fechaAnteriorMs) {
  const empId = parseInt(CONFIG.employeeId, 10) || 1
  const ep = `/jServerj4ErpPro/com/j4ErpPro/server/transacion/cambiarFechaTransacion/${fechaNuevaMs}/${fechaAnteriorMs}/${empId}/${idTransacion}`
  return cuenttiRequest(ep, 'GET')
}

// Construye el payload de una COMPRA (egreso) para Cuentti.
// VERIFICADO con el ingeniero de Cuentti (prueba real OK, tx 5430 creada y anulada):
// usa el mismo grabarFacturaSimple que ventas con tipoDocumento=7 (egreso), id_consecutivo=1,
// el proveedor en objClienteMini con id_cliente=-1 (Cuentti lo busca/crea por NIT), el costo
// del item va en precio_venta (base sin IVA) y el total del item CON IVA.
function buildCompraPayload(c) {
  const to2 = (n) => parseFloat((parseFloat(n || 0)).toFixed(2))
  const upper = (v) => (v ?? '').toString().trim().toUpperCase()
  const items = (c.items || []).map(it => {
    const cantidad = parseFloat(it.cantidad) || 1
    const costoBase = parseFloat(it.costo ?? it.precio) || 0 // sin IVA
    const impuesto = parseFloat(it.iva) || 0
    return {
      sku: it.sku || it.codigo || '',
      descripcion: it.descripcion || it.nombre || 'Producto',
      precio_venta: to2(costoBase),
      cantidad,
      impuesto: parseInt(impuesto, 10),
      total: to2(costoBase * cantidad * (1 + impuesto / 100)), // total CON IVA (confirmado por Cuentti)
      descuentoPor: 0,
      descuento_valor: 0,
      id_producto: it.id_producto ?? it.idProducto ?? undefined,
    }
  })
  const totalSinImp = to2(items.reduce((s, i) => s + (i.precio_venta * i.cantidad), 0))
  const totalImp = to2(items.reduce((s, i) => s + (i.precio_venta * i.cantidad * (i.impuesto / 100)), 0))
  const totalNeto = to2(totalSinImp + totalImp)
  const empId = parseInt(CONFIG.employeeId, 10) || 1
  const branchId = parseInt(CONFIG.branchId, 10) || 1
  return {
    tipoDocumento: c.tipoDocumento ?? 7,
    id_sucursal: branchId,
    id_bodega: branchId,
    id_consecutivo: c.idConsecutivo ?? 1, // resolucion del egreso (confirmado por Cuentti: 1)
    id_documento: null,
    id_vendedor: empId,
    id_empleado: empId,
    nota: c.observaciones || (c.numeroFactura ? `Compra ${c.numeroFactura}` : ''),
    total_neto: totalNeto,
    total_impuestos: totalImp,
    total_sin_impuestos: totalSinImp,
    observacion: '',
    objClienteMini: {
      id_cliente: parseInt(c.proveedorId ?? -1, 10),
      nombre_cliente: upper(c.proveedorNombre || 'PROVEEDOR'),
      identificacion: (c.proveedorNit || '222222222222').toString(),
    },
    objDetalle: items,
    lstPagos: c.aCredito === false
      ? [{ id_medio_pago: c.idMedioPago ?? 1, id_banco: c.idBanco ?? 1, valor: totalNeto, boucher: '', digitos: '', devuelta: 0, dinero_entregado: 0, nota: c.numeroFactura ? `Compra ${c.numeroFactura}` : '', fecha_registro: Date.now() }]
      : [],
  }
}

// Construye el payload de una COTIZACION para Cuentti.
// Cuentti no tiene tipo "cotizacion" nativo, se usa REMISION (tipoDocumento=9, lstPagos=[]).
// El precio_venta de cada item es SIN IVA (a diferencia de buildFacturaPayload, que recibe con IVA).
function buildCotizacionPayload(c) {
  const to2 = (n) => parseFloat((parseFloat(n || 0)).toFixed(2))
  const upper = (v) => (v ?? '').toString().trim().toUpperCase()

  const items = (c.items || []).map(it => {
    const cantidad = parseFloat(it.cantidad) || 1
    const precioBase = parseFloat(it.precio_venta) || 0 // sin IVA
    const impuesto = parseFloat(it.impuesto ?? 19)
    const total = to2(precioBase * cantidad * (1 + impuesto / 100))
    return {
      sku: it.sku || '',
      descripcion: it.descripcion || '',
      precio_venta: to2(precioBase),
      cantidad,
      impuesto: parseInt(impuesto, 10),
      total,
      descuentoPor: 0,
      descuento_valor: 0,
    }
  })

  const totalSinImp = to2(items.reduce((s, i) => s + (i.precio_venta * i.cantidad), 0))
  const totalNeto = to2(items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0))
  const totalImp = to2(totalNeto - totalSinImp)

  const empId = parseInt(CONFIG.employeeId, 10) || 1
  const branchId = parseInt(CONFIG.branchId, 10) || 1
  // tipoDocumento=5 verificado experimentalmente como COTIZACION en Cuentti
  // (PDF muestra "Documento de Cotizacion #N" con botones Aprobar/Rechazar).
  // 1=Factura, 2=PlanSepare, 4=Pedido, 5=Cotizacion, 7=Egreso/Compra, 9=Remision.
  const tipoDoc = parseInt(c.tipoDocumento ?? 5, 10) || 5
  const idCons = parseInt(c.idConsecutivo ?? 1, 10) || 1

  return {
    tipoDocumento: tipoDoc,
    id_sucursal: branchId,
    id_bodega: branchId,
    id_consecutivo: idCons,
    id_documento: null,
    id_vendedor: empId,
    id_empleado: empId,
    nota: c.nota || '',
    total_neto: totalNeto,
    total_impuestos: totalImp,
    total_sin_impuestos: totalSinImp,
    observacion: c.observacion || '',
    objClienteMini: {
      id_cliente: -1,
      nombre_cliente: upper(c.cliente_nombre || ''),
      identificacion: (c.cliente_identificacion || '').toString(),
      telefono1: c.cliente_telefono || '',
      email1: c.cliente_email || '',
      direccion: 'N/A',
      id_tipo_persona: 1,
      es_cliente: 1,
      es_proveedor: 0,
      departamento: c.cliente_departamento || '',
      pais: 'Colombia',
      ciudad: c.cliente_ciudad || '',
      zona: '',
    },
    objDetalle: items,
    lstPagos: [],
  }
}

const tools = [
  {
    name: 'estado_cuentti',
    description: 'Diagnostico de la conexion con Cuentti: prueba el token, devuelve company/branch/employee configurados.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      if (!CONFIG.token) return `❌ CUENTTI_TOKEN no configurado en el servidor.`
      try {
        const probe = await cuenttiRequest('/jServerj4ErpPro/api/token/consultarClienteIdentificacion/222222222222')
        const ok = !probe?.message || /no.*exist/i.test(probe?.message || '')
        return [
          `## Estado Cuentti`,
          ``,
          `**Base URL:** ${CONFIG.baseUrl}`,
          `**Empresa:** ${CONFIG.companyId}`,
          `**Sucursal:** ${CONFIG.branchId}`,
          `**Empleado:** ${CONFIG.employeeId}`,
          `**Token:** \`${CONFIG.token.slice(0, 12)}…${CONFIG.token.slice(-6)}\``,
          ``,
          `**Conexion:** ${ok ? '✅ OK' : '⚠️ respuesta inesperada'}`,
        ].join('\n')
      } catch (e) {
        return `❌ No se pudo conectar con Cuentti: ${e.message}`
      }
    },
  },
  {
    name: 'buscar_cliente_cuentti',
    description: 'Busca un cliente en Cuentti por numero de identificacion (cedula / NIT). Devuelve nombre, telefono, email, direccion y el id_cliente de Cuentti.',
    inputSchema: {
      type: 'object',
      properties: { cedula: { type: 'string', description: 'Cedula o NIT' } },
      required: ['cedula'],
    },
    handler: async ({ cedula }) => {
      const ced = String(cedula || '').trim()
      if (!ced) return '❌ Debes pasar una cedula no vacia'
      const data = await cuenttiRequest(`/jServerj4ErpPro/api/token/consultarClienteIdentificacion/${encodeURIComponent(ced)}`)
      if (data?.message || data?.type === 0) {
        return `No se encontro cliente con cedula **${ced}** en Cuentti.`
      }
      const items = Array.isArray(data) ? data : (data?.data ? data.data : (data ? [data] : []))
      const filtered = items.filter(r => r && Object.keys(r).length > 0 && !r.message)
      if (!filtered.length) return `No se encontro cliente con cedula **${ced}** en Cuentti.`
      const c = filtered[0]
      const nombre = c.nombre_cliente
        || [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')
        || '(sin nombre)'
      return [
        `## Cliente encontrado en Cuentti`,
        ``,
        `| Campo | Valor |`,
        `|---|---|`,
        `| **id_cliente** | ${c.id_cliente || c.id || '—'} |`,
        `| **Identificacion** | ${c.identificacion || ced} |`,
        `| **Nombre** | ${nombre} |`,
        `| **Telefono** | ${c.telefono1 || c.telefono3 || c.telefono || '—'} |`,
        `| **Email** | ${c.email1 || c.email2 || c.email || '—'} |`,
        `| **Direccion** | ${c.direccion || '—'} |`,
        `| **Ciudad** | ${c.ciudad || '—'} |`,
        `| **Activo** | ${c.es_activo === '1' ? 'sí' : 'no'} |`,
      ].join('\n')
    },
  },
  {
    name: 'listar_inventario_cuentti',
    description: 'Lista productos del inventario de Cuentti (paginado, 1000 por pagina). Devuelve nombre, SKU, precio con IVA y existencias.',
    inputSchema: {
      type: 'object',
      properties: {
        pagina: { type: 'integer', minimum: 0, default: 0, description: 'Numero de pagina (0 = primera).' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Cuantos mostrar (default 50).' },
        filtro: { type: 'string', description: 'Filtro opcional (substring sobre nombre/SKU).' },
      },
    },
    handler: async ({ pagina = 0, limit = 50, filtro }) => {
      const path = `/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/consultaProductoPaginadaMovil/${CONFIG.branchId}/${pagina}?tomar_precio_online=0`
      const data = await cuenttiRequest(path)
      const items = Array.isArray(data) ? data : (data?.data || [])
      if (!items.length) return `Pagina ${pagina}: sin productos.`
      const filtroLow = (filtro || '').trim().toLowerCase()
      const filtered = filtroLow
        ? items.filter(p =>
            (p.nombre || '').toLowerCase().includes(filtroLow) ||
            (p.sku || '').toLowerCase().includes(filtroLow) ||
            (p.codigo_barras || '').toLowerCase().includes(filtroLow))
        : items
      const slice = filtered.slice(0, limit)
      const rows = slice.map(p => {
        const precioSinIva = parseFloat(p.precio_venta || 0)
        const iva = parseFloat(p.valor_impuesto || 0)
        const precioFinal = precioSinIva * (1 + iva / 100)
        return `| ${p.sku || '—'} | ${(p.nombre || '').slice(0, 60)} | ${fmtCOP(precioFinal)} | ${parseFloat(p.existencias || 0)} | ${iva}% |`
      })
      return [
        `## Inventario Cuentti — pagina ${pagina}`,
        `Total en la pagina: ${items.length} · Filtrados: ${filtered.length} · Mostrando: ${slice.length}`,
        ``,
        `| SKU | Nombre | Precio | Stock | IVA |`,
        `|---|---|---|---|---|`,
        ...rows,
      ].join('\n')
    },
  },
  {
    name: 'buscar_producto_sku_cuentti',
    description: 'Busca un producto especifico por SKU o codigo de barras en Cuentti.',
    inputSchema: {
      type: 'object',
      properties: { sku: { type: 'string', description: 'SKU o codigo de barras' } },
      required: ['sku'],
    },
    handler: async ({ sku }) => {
      const s = String(sku || '').trim()
      if (!s) return '❌ Debes pasar un SKU no vacio'
      const path = `/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/obtenerProductoSku/${CONFIG.branchId}/${encodeURIComponent(s)}`
      const data = await cuenttiRequest(path)
      if (!data || data.message) return `No se encontro producto con SKU **${s}**.`
      const p = Array.isArray(data) ? data[0] : data
      if (!p || !p.id_producto) return `No se encontro producto con SKU **${s}**.`
      const precioSinIva = parseFloat(p.precio_venta || 0)
      const iva = parseFloat(p.valor_impuesto || 0)
      const precioFinal = precioSinIva * (1 + iva / 100)
      return [
        `## Producto encontrado`,
        ``,
        `| Campo | Valor |`,
        `|---|---|`,
        `| **id_producto** | ${p.id_producto} |`,
        `| **SKU** | ${p.sku || '—'} |`,
        `| **Codigo barras** | ${p.codigo_barras || '—'} |`,
        `| **Nombre** | ${p.nombre || '—'} |`,
        `| **Precio sin IVA** | ${fmtCOP(precioSinIva)} |`,
        `| **IVA** | ${iva}% |`,
        `| **Precio final** | ${fmtCOP(precioFinal)} |`,
        `| **Stock** | ${parseFloat(p.existencias || 0)} |`,
      ].join('\n')
    },
  },
  {
    name: 'obtener_url_documento_cuentti',
    description: 'Obtiene la URL/QR del documento (factura/remision) por id_transacion.',
    inputSchema: {
      type: 'object',
      properties: { idTransacion: { type: ['string', 'number'], description: 'id_transacion' } },
      required: ['idTransacion'],
    },
    handler: async ({ idTransacion }) => {
      const tx = String(idTransacion || '').trim()
      if (!tx) return '❌ Debes pasar un id_transacion valido'
      const path = `/jServerj4ErpPro/com/j4ErpPro/server/transacion/buscarQrId_transacion/${encodeURIComponent(tx)}`
      const data = await cuenttiRequest(path)
      return [`## URL Documento — id_transacion ${tx}`, '', '```json', JSON.stringify(data, null, 2), '```'].join('\n')
    },
  },
  {
    name: 'crear_cliente_cuentti',
    description: 'Crea o actualiza un cliente en Cuentti. Idempotente por cedula. Para actualizar pasa cuenttiId.',
    inputSchema: {
      type: 'object',
      properties: {
        cedula: { type: 'string' },
        nombre: { type: 'string' },
        telefono: { type: 'string', default: '' },
        email: { type: 'string', default: '' },
        direccion: { type: 'string', default: '' },
        ciudad: { type: 'string', default: '' },
        tipoIdentificacion: { type: 'string', enum: ['2', '3', '4', '5', '6'], default: '3', description: '2=CExt, 3=CC, 4=TI, 5=NIT, 6=Pasaporte' },
        tipoPersona: { type: 'string', enum: ['1', '2'], default: '1', description: '1=Natural, 2=Juridica' },
        regimen: { type: 'integer', default: 2, description: '2=Simple, 5=Resp IVA, 49=No Resp IVA' },
        cuenttiId: { type: 'integer', description: 'id_cliente existente para actualizar' },
        confirm: { type: 'boolean', description: 'true para ejecutar; false para dry-run' },
      },
      required: ['cedula', 'nombre', 'confirm'],
    },
    handler: async ({ cedula, nombre, telefono = '', email = '', direccion = '', ciudad = '',
                     tipoIdentificacion = '3', tipoPersona = '1', regimen = 2, cuenttiId, confirm }) => {
      const ced = String(cedula || '').trim()
      const nom = String(nombre || '').trim()
      if (!ced || !nom) return '❌ cedula y nombre son obligatorios'

      const partes = nom.split(/\s+/)
      const primer_nombre = partes[0] || ''
      const primer_apellido = partes.length > 1 ? partes[partes.length - 1] : ''
      const segundo_nombre = partes.length > 2 ? partes.slice(1, -1).join(' ') : ''

      const body = {
        id_cliente: cuenttiId || 0,
        genera_bonos: 1,
        es_consumidor_final: '0',
        dias_vencimiento_cartera_cliente: 30,
        alias: '',
        regimenImpuesto: regimen,
        legalidad: 29,
        cliente_predeterminado: '0',
        nombre_cliente: nom,
        id_tipo_persona: tipoPersona,
        identificacion: ced,
        id_empresa_portal: 0,
        id_usuario_portal: 0,
        primer_nombre, segundo_nombre, primer_apellido,
        direccion, telefono1: telefono, telefono3: '',
        email1: email, email2: '',
        sitio_web: '', facebook: '', twitter: '', instagram: '', snapchat: '',
        puntos_acumulados: 0, nota: '',
        es_activo: '1',
        fecha_registro: Date.now(),
        es_cliente: 1, es_proveedor: 0,
        ciudad, zona: '', contacto: '', clave_portal: '',
        id_estado_civil: 1, id_estrato_social: 3, id_clase_cliente: 1, id_tipo_cliente: 1,
        sexo: 'N', saldo_bono: 0,
        permite_cartera_vencida: '1',
        codigo_interno: '', permite_saldo_cartera: '0', cupo_cartera: 0, permite_cartera: '1',
        id_tipo_retencion_ventas: 1, id_tipo_retencion_compra: 1,
        lstContactoCliente: [],
        envioSmsCartera: '0', envioSmsProducto: '0',
        departamento: '', pais: 'Colombia',
        regimen,
        id_tipo_identificacion: tipoIdentificacion,
        id_empleado: parseInt(CONFIG.employeeId, 10),
      }

      if (!confirm) {
        return [
          `## Dry-run: crear/actualizar cliente`,
          `**Confirm = false** — no se envio nada a Cuentti.`,
          ``,
          `**Operacion:** ${cuenttiId ? `actualizar id_cliente=${cuenttiId}` : 'crear nuevo'}`,
          `**Cedula:** ${ced}`,
          `**Nombre:** ${nom}`,
          `**Telefono:** ${telefono || '—'} · **Email:** ${email || '—'}`,
          `**Direccion:** ${direccion || '—'} · **Ciudad:** ${ciudad || '—'}`,
          `**Tipo ident.:** ${tipoIdentificacion} · **Persona:** ${tipoPersona} · **Regimen:** ${regimen}`,
          ``,
          `Para ejecutar, llama de nuevo con \`confirm: true\`.`,
        ].join('\n')
      }

      const resp = await cuenttiRequest('/jServerj4ErpPro/com/j4ErpPro/server/adm/cliente/grabarCliente', 'POST', body)
      const newId = resp?.id_cliente || resp?.id || resp?.data?.id_cliente || null
      return [
        `## ✅ Cliente ${cuenttiId ? 'actualizado' : 'creado'} en Cuentti`,
        ``,
        `**id_cliente:** ${newId || '(no devuelto)'}`,
        `**Cedula:** ${ced}`,
        `**Nombre:** ${nom}`,
      ].join('\n')
    },
  },
  {
    name: 'facturar',
    description: 'Crea una factura en Cuentti a partir de una orden de trabajo del taller (id o codigo OT-...) o de una cotizacion (COT-...). Por defecto hace DRY-RUN (muestra el payload sin enviar nada); pasa confirm:true para emitir de verdad. Anti-duplicado: avisa si la OT ya fue facturada. Para factura electronica DIAN usa resolucion:"FEIC" y emitirFE:true. Tras facturar, marca la OT/cotizacion en Supabase con el id_transacion.',
    inputSchema: {
      type: 'object',
      properties: {
        origen: { type: 'string', description: 'ID o codigo de la OT (ej OT-0001) o de la cotizacion (ej COT-abc123) a facturar.' },
        resolucion: { type: 'string', enum: ['MAS', 'FEIC'], default: 'MAS', description: 'MAS = factura interna; FEIC = factura electronica DIAN.' },
        metodoPago: { type: 'string', enum: ['efectivo', 'transferencia', 'credito'], default: 'efectivo' },
        idMedioPago: { type: 'integer', description: 'Override del id_medio_pago de Cuentti. Default: efectivo=1, transferencia=7.' },
        idBanco: { type: 'integer', description: 'Override del id_banco (1=Caja General, 2=Bancolombia, 3=Nequi). Default: efectivo=1 (Caja General), transferencia=2.' },
        emitirFE: { type: 'boolean', description: 'Si resolucion=FEIC, emite ante la DIAN tras crear la factura.' },
        confirm: { type: 'boolean', description: 'true = emitir de verdad; false (default) = dry-run.' },
      },
      required: ['origen'],
    },
    handler: async ({ origen, resolucion = 'MAS', metodoPago = 'efectivo', idMedioPago, idBanco, emitirFE = false, confirm = false }) => {
      const key = String(origen || '').trim()
      if (!key) return '❌ Debes pasar el id/codigo de la OT o cotizacion.'
      const esCotizacion = /^COT-/i.test(key)

      // Resolver origen en Supabase
      let registro = null
      if (esCotizacion) {
        const found = await supabaseTaller('cotizaciones', { query: `select=*&id=eq.${encodeURIComponent(key)}` })
        registro = found[0]
      } else {
        const found = await supabaseTaller('trabajos', { query: `select=*&or=(id.eq.${encodeURIComponent(key)},ot_codigo.eq.${encodeURIComponent(key)})` })
        registro = found[0]
      }
      if (!registro) return `❌ No se encontro ${esCotizacion ? 'cotizacion' : 'OT'} "${key}".`

      const items = typeof registro.items === 'string' ? JSON.parse(registro.items) : (registro.items || [])
      if (!items.length) return `❌ "${key}" no tiene items para facturar.`

      // Anti-duplicado
      if (!esCotizacion && registro.cuentti_id_transacion && !confirm) {
        return [
          `⚠️ Esta OT YA fue facturada en Cuentti.`,
          `**id_transacion:** ${registro.cuentti_id_transacion}`,
          registro.facturado_en ? `**Fecha:** ${fmtFecha(registro.facturado_en)}` : '',
          ``, `Si de verdad quieres crear un DUPLICADO, llama de nuevo con confirm:true.`,
        ].filter(Boolean).join('\n')
      }
      if (esCotizacion && registro.estado === 'Facturada' && !confirm) {
        return `⚠️ La cotizacion ${key} ya esta marcada como Facturada. Para facturar de nuevo (duplicado) usa confirm:true.`
      }

      // Mapeo de medio de pago
      const aCredito = metodoPago === 'credito'
      const medio = idMedioPago ?? (metodoPago === 'transferencia' ? 7 : 1)
      // 1=Caja General, 2=Bancolombia, 3=Nequi (verificado). Efectivo => Caja General.
      const banco = idBanco ?? (metodoPago === 'transferencia' ? 2 : metodoPago === 'credito' ? 0 : 1)

      const factura = {
        items,
        cliente: registro.cliente,
        cedula: registro.cedula || registro.cedula_cliente || '222222222222',
        clienteId: registro.cuentti_id || undefined,
        resolucion,
        tipoDocumento: 1,
        idMedioPago: medio,
        idBanco: banco,
        aCredito,
        otCodigo: registro.ot_codigo || registro.id,
        observaciones: `${registro.ot_codigo || key} — ${registro.observaciones || ''}`.trim(),
      }
      const payload = buildFacturaPayload(factura)

      if (!confirm) {
        return [
          `## Dry-run: factura (NO enviada a Cuentti)`,
          `Pasa **confirm:true** para emitir de verdad.`, ``,
          `**Origen:** ${esCotizacion ? 'cotizacion' : 'OT'} ${key}`,
          `**Cliente:** ${factura.cliente} (CC ${factura.cedula})`,
          `**Resolucion:** ${resolucion} ${resolucion === 'FEIC' ? '(electronica DIAN)' : '(interna)'}`,
          `**Medio de pago:** ${metodoPago} (id_medio_pago=${medio}, id_banco=${banco})`,
          `**Items:** ${items.length} · **Total:** ${fmtCOP(payload.total_neto)}`,
          ``, '<details><summary>Payload Cuentti</summary>', '', '```json',
          JSON.stringify(payload, null, 2).slice(0, 4000), '```', '</details>',
        ].join('\n')
      }

      // Enviar a Cuentti
      const result = await cuenttiRequest(FACTURA_PATHS.grabarSimple, 'POST', payload)
      const txId = extractIdTransacion(result)

      // Factura electronica (opcional)
      let feMsg = ''
      if (txId && resolucion === 'FEIC' && emitirFE) {
        try {
          await cuenttiRequest(FACTURA_PATHS.emitirFE.replace('{id}', encodeURIComponent(txId)))
          feMsg = `\n**Factura electronica:** ✅ enviada a la DIAN`
        } catch (e) {
          feMsg = `\n**Factura electronica:** ⚠️ error emitiendo FE: ${e.message}`
        }
      }

      // Writeback a Supabase (anti-duplicado multi-dispositivo)
      if (txId) {
        try {
          if (esCotizacion) {
            await supabaseTaller('cotizaciones', { method: 'PATCH', query: `id=eq.${encodeURIComponent(registro.id)}`, body: { estado: 'Facturada' } })
          } else {
            await supabaseTaller('trabajos', {
              method: 'PATCH', query: `id=eq.${encodeURIComponent(registro.id)}`,
              body: { cuentti_id_transacion: String(txId), facturado_en: new Date().toISOString(), cuentti_resolucion: resolucion },
            })
          }
        } catch { /* no-fatal: la factura ya se creo */ }
      }

      // URL del documento
      let urlDoc = ''
      if (txId) {
        try {
          const doc = await cuenttiRequest(FACTURA_PATHS.urlDoc.replace('{id}', encodeURIComponent(txId)))
          const docItem = Array.isArray(doc) ? doc[0] : doc
          urlDoc = typeof doc === 'string' ? doc : (docItem?.url_externa || docItem?.url || docItem?.qr || '')
        } catch { /* opcional */ }
      }

      return [
        `## ✅ Factura creada en Cuentti`,
        ``,
        `**id_transacion:** ${txId || '(no devuelto — revisa la respuesta)'}`,
        `**Origen:** ${esCotizacion ? 'cotizacion' : 'OT'} ${key}`,
        `**Cliente:** ${factura.cliente}`,
        `**Total:** ${fmtCOP(payload.total_neto)}`,
        `**Resolucion:** ${resolucion}${feMsg}`,
        urlDoc ? `**Documento:** ${urlDoc}` : '',
        !txId ? `\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 1500)}\n\`\`\`` : '',
      ].filter(Boolean).join('\n')
    },
  },
  {
    name: 'crear_cotizacion_cuentti',
    description: 'Crea una COTIZACION real en Cuentti (tipoDocumento=5, verificado: PDF muestra "Documento de Cotizacion #N" con botones Aprobar/Rechazar). Recibe el cliente y los items directamente (no lee de Supabase). El precio_venta de cada item es SIN IVA. Dry-run por defecto; pasa confirm:true para emitir de verdad y obtener el PDF.',
    inputSchema: {
      type: 'object',
      properties: {
        cliente_nombre: { type: 'string', description: 'Nombre del cliente' },
        cliente_identificacion: { type: 'string', description: 'Cedula o NIT del cliente' },
        cliente_telefono: { type: 'string', default: '', description: 'Telefono (opcional)' },
        cliente_email: { type: 'string', default: '', description: 'Email (opcional)' },
        cliente_ciudad: { type: 'string', description: 'Ciudad del cliente' },
        cliente_departamento: { type: 'string', description: 'Departamento del cliente' },
        items: {
          type: 'array',
          description: 'Items de la cotizacion. precio_venta debe ir SIN IVA.',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              descripcion: { type: 'string' },
              precio_venta: { type: 'number', description: 'Precio unitario SIN IVA' },
              cantidad: { type: 'number', default: 1 },
              impuesto: { type: 'number', default: 19, description: 'Porcentaje de IVA (default 19)' },
            },
            required: ['sku', 'descripcion', 'precio_venta', 'cantidad'],
          },
        },
        nota: { type: 'string', default: '' },
        observacion: { type: 'string', default: '' },
        tipoDocumento: { type: 'integer', default: 5, description: 'Tipo de documento Cuentti. Default 5=Cotizacion (verificado). Otros: 1=Factura, 2=PlanSepare, 4=Pedido, 7=Egreso, 9=Remision.' },
        idConsecutivo: { type: 'integer', default: 1, description: 'Override del id_consecutivo (default 1).' },
        confirm: { type: 'boolean', default: false, description: 'true = enviar a Cuentti; false (default) = dry-run' },
      },
      required: ['cliente_nombre', 'cliente_identificacion', 'cliente_ciudad', 'cliente_departamento', 'items'],
    },
    handler: async (a) => {
      if (!a.cliente_nombre || !a.cliente_identificacion) return '❌ cliente_nombre y cliente_identificacion son obligatorios.'
      if (!a.cliente_ciudad || !a.cliente_departamento) return '❌ cliente_ciudad y cliente_departamento son obligatorios.'
      if (!Array.isArray(a.items) || a.items.length === 0) return '❌ Se requiere al menos un item.'

      const payload = buildCotizacionPayload(a)
      const totalFmt = fmtCOP(payload.total_neto)

      if (!a.confirm) {
        return [
          `## Dry-run: cotizacion (NO enviada a Cuentti)`,
          `Pasa **confirm:true** para emitir de verdad.`,
          ``,
          `**Cliente:** ${a.cliente_nombre} (${a.cliente_identificacion})`,
          `**Ubicacion:** ${a.cliente_ciudad}, ${a.cliente_departamento}`,
          `**Items:** ${payload.objDetalle.length}`,
          `**Subtotal (sin IVA):** ${fmtCOP(payload.total_sin_impuestos)} · **IVA:** ${fmtCOP(payload.total_impuestos)} · **Total:** ${totalFmt}`,
          ``,
          '<details><summary>Payload Cuentti</summary>',
          '',
          '```json',
          JSON.stringify(payload, null, 2).slice(0, 4000),
          '```',
          '</details>',
        ].join('\n')
      }

      const result = await cuenttiRequest(FACTURA_PATHS.grabarSimple, 'POST', payload)
      const txId = extractIdTransacion(result)

      // URL del documento (PDF/QR)
      let urlDoc = ''
      if (txId) {
        try {
          const doc = await cuenttiRequest(FACTURA_PATHS.urlDoc.replace('{id}', encodeURIComponent(txId)))
          const docItem = Array.isArray(doc) ? doc[0] : doc
          urlDoc = typeof doc === 'string' ? doc : (docItem?.url_externa || docItem?.url || docItem?.qr || '')
        } catch { /* opcional */ }
      }

      return [
        `## ${txId ? '✅ Cotizacion creada en Cuentti' : '⚠️ Respuesta sin id_transacion — revisa'}`,
        ``,
        `**id_transacion:** ${txId || '(no devuelto)'}`,
        `**Cliente:** ${a.cliente_nombre}`,
        `**Total:** ${totalFmt}`,
        urlDoc ? `**Documento (PDF):** ${urlDoc}` : '',
        !txId ? `\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 1500)}\n\`\`\`` : '',
      ].filter(Boolean).join('\n')
    },
  },
  {
    name: 'crear_producto',
    description: 'Crea un producto nuevo en Cuentti (envuelve grabraProductoMovil). dry-run por defecto; pasa confirm:true para crear de verdad.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        sku: { type: 'string', default: '' },
        codigoBarras: { type: 'string', default: '' },
        precioVenta: { type: 'number', default: 0, description: 'Precio de venta SIN IVA' },
        idImpuesto: { type: 'integer', default: 1 },
        idCategoria: { type: 'integer', default: 1 },
        esServicio: { type: 'boolean', default: false },
        existencias: { type: 'number', default: 0 },
        confirm: { type: 'boolean', description: 'true = crear; false (default) = dry-run' },
      },
      required: ['nombre', 'confirm'],
    },
    handler: async (a) => {
      if (!a.nombre) return '❌ nombre es obligatorio'
      const body = buildProductoPayload(a)
      if (!a.confirm) {
        return ['## Dry-run: crear producto (NO creado)', 'Pasa **confirm:true** para crear.', '', '```json', JSON.stringify(body, null, 2), '```'].join('\n')
      }
      const resp = await cuenttiRequest('/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/grabraProductoMovil', 'POST', body)
      const id = resp?.id_producto || resp?.id || resp?.data?.id_producto || '(no devuelto)'
      return [`## ✅ Producto creado en Cuentti`, ``, `**id_producto:** ${id}`, `**SKU:** ${a.sku || '—'}`, `**Nombre:** ${a.nombre}`].join('\n')
    },
  },
  {
    name: 'buscar_equivalencia',
    description: 'Busca el SKU interno de Cuentti equivalente a un codigo de proveedor (tabla compras_equivalencias). Sirve para emparejar items de facturas de compra.',
    inputSchema: {
      type: 'object',
      properties: { proveedorNit: { type: 'string' }, codigoProveedor: { type: 'string' } },
      required: ['proveedorNit', 'codigoProveedor'],
    },
    handler: async ({ proveedorNit, codigoProveedor }) => {
      const q = `select=*&proveedor_nit=eq.${encodeURIComponent(proveedorNit)}&codigo_proveedor=eq.${encodeURIComponent(codigoProveedor)}`
      const rows = await supabaseTaller('compras_equivalencias', { query: q })
      if (!rows.length) return `Sin equivalencia para "${codigoProveedor}" (proveedor ${proveedorNit}).`
      const e = rows[0]
      return [`## Equivalencia encontrada`, '', `**${codigoProveedor}** → SKU **${e.sku_cuentti}** (id_producto ${e.id_producto_cuentti || '—'})`, `Producto: ${e.nombre_producto || '—'}`].join('\n')
    },
  },
  {
    name: 'guardar_equivalencia',
    description: 'Guarda o actualiza la equivalencia codigo de proveedor → SKU interno de Cuentti (tabla compras_equivalencias). Se usa cuando emparejas a mano un item para que la proxima factura de ese proveedor entre sola.',
    inputSchema: {
      type: 'object',
      properties: {
        proveedorNit: { type: 'string' },
        proveedorNombre: { type: 'string', default: '' },
        codigoProveedor: { type: 'string' },
        skuCuentti: { type: 'string' },
        idProductoCuentti: { type: 'string', default: '' },
        nombreProducto: { type: 'string', default: '' },
      },
      required: ['proveedorNit', 'codigoProveedor', 'skuCuentti'],
    },
    handler: async (a) => {
      if (!a.proveedorNit || !a.codigoProveedor || !a.skuCuentti) return '❌ proveedorNit, codigoProveedor y skuCuentti son obligatorios'
      const q = `select=id&proveedor_nit=eq.${encodeURIComponent(a.proveedorNit)}&codigo_proveedor=eq.${encodeURIComponent(a.codigoProveedor)}`
      const existing = await supabaseTaller('compras_equivalencias', { query: q })
      const body = {
        proveedor_nit: a.proveedorNit, proveedor_nombre: a.proveedorNombre || '',
        codigo_proveedor: a.codigoProveedor, sku_cuentti: a.skuCuentti,
        id_producto_cuentti: a.idProductoCuentti || '', nombre_producto: a.nombreProducto || '',
      }
      if (existing.length) {
        await supabaseTaller('compras_equivalencias', { method: 'PATCH', query: `id=eq.${encodeURIComponent(existing[0].id)}`, body })
      } else {
        await supabaseTaller('compras_equivalencias', { method: 'POST', body: { id: uidc(), ...body } })
      }
      return [`## ✅ Equivalencia guardada`, ``, `**${a.codigoProveedor}** → SKU **${a.skuCuentti}**`].join('\n')
    },
  },
  {
    name: 'emparejar_items',
    description: 'Empareja los items de una factura de compra con productos de Cuentti. Por cada item busca primero la equivalencia guardada (proveedor+codigo) y luego el SKU exacto en Cuentti. Clasifica en "coinciden" y "nuevos". El emparejamiento por nombre (difuso) de los nuevos lo hace Claude.',
    inputSchema: {
      type: 'object',
      properties: {
        proveedorNit: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              codigo: { type: 'string' }, descripcion: { type: 'string' },
              cantidad: { type: 'number' }, costo: { type: 'number' }, iva: { type: 'number' },
            },
          },
        },
      },
      required: ['proveedorNit', 'items'],
    },
    handler: async ({ proveedorNit, items = [] }) => {
      const matched = [], nuevos = []
      for (const it of items) {
        const codigo = String(it.codigo || '').trim()
        let prod = null, via = ''
        if (codigo) {
          const q = `select=*&proveedor_nit=eq.${encodeURIComponent(proveedorNit)}&codigo_proveedor=eq.${encodeURIComponent(codigo)}`
          const eq = await supabaseTaller('compras_equivalencias', { query: q })
          if (eq.length) { prod = { id_producto: eq[0].id_producto_cuentti, sku: eq[0].sku_cuentti, nombre: eq[0].nombre_producto }; via = 'equivalencia' }
        }
        if (!prod && codigo) {
          const p = await buscarProductoSkuRaw(codigo)
          if (p) { prod = { id_producto: p.id_producto, sku: p.sku, nombre: p.nombre }; via = 'sku' }
        }
        if (prod) matched.push({ ...it, ...prod, via })
        else nuevos.push(it)
      }
      const lineM = matched.map(m => `- ✅ ${m.codigo || '—'} → SKU ${m.sku} (${m.via}) · ${m.descripcion || m.nombre || ''} x${m.cantidad ?? '?'}`)
      const lineN = nuevos.map(n => `- ➕ ${n.codigo || '—'} · ${n.descripcion || ''} x${n.cantidad ?? '?'} — no existe; emparejar por nombre o crear`)
      return [
        `## Emparejamiento — proveedor ${proveedorNit}`,
        `Coinciden: ${matched.length} · Nuevos/dudosos: ${nuevos.length}`,
        ``, `### Coinciden`, ...(lineM.length ? lineM : ['(ninguno)']),
        ``, `### Nuevos / a revisar`, ...(lineN.length ? lineN : ['(ninguno)']),
        ``, nuevos.length
          ? 'Para los nuevos: busca por nombre con buscar_producto_sku_cuentti / listar_inventario_cuentti, o créalos con crear_producto; luego guarda la equivalencia con guardar_equivalencia.'
          : 'Todo emparejado.',
      ].join('\n')
    },
  },
  {
    name: 'registrar_compra',
    description: 'Registra una factura de COMPRA (egreso) en Cuentti vía grabarFacturaSimple. Verificado con Cuentti: tipoDocumento=7, id_consecutivo=1, proveedor con id_cliente=-1 (Cuentti lo busca/crea por NIT), el costo de cada item va en precio_venta (base sin IVA). Suma inventario y actualiza costo. dry-run por defecto; pasa confirm:true para registrar de verdad.',
    inputSchema: {
      type: 'object',
      properties: {
        proveedorNit: { type: 'string' },
        proveedorNombre: { type: 'string', default: '' },
        proveedorId: { type: 'integer', description: 'id_cliente del proveedor en Cuentti (si lo tienes). Si no, se usa -1.' },
        numeroFactura: { type: 'string', default: '' },
        fecha: { type: 'string', default: '', description: 'Fecha de la factura del proveedor (YYYY-MM-DD). Se aplica al documento DESPUÉS de crearlo, vía el endpoint "Editar fecha transacción" (grabarFacturaSimple no acepta fecha). Si se omite, queda con la fecha de hoy.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' }, codigo: { type: 'string' }, id_producto: { type: 'string' },
              descripcion: { type: 'string' }, cantidad: { type: 'number' },
              costo: { type: 'number', description: 'Costo unitario SIN IVA' }, iva: { type: 'number' },
            },
          },
        },
        tipoDocumento: { type: 'integer', default: 7, description: '7 = egreso/compra (hipotesis)' },
        idConsecutivo: { type: 'integer', description: 'Resolucion/consecutivo del egreso. PENDIENTE de confirmar con Cuentti.' },
        aCredito: { type: 'boolean', default: true, description: 'true = cuenta por pagar (sin pago inmediato)' },
        idMedioPago: { type: 'integer' },
        idBanco: { type: 'integer' },
        confirm: { type: 'boolean', description: 'true = enviar a Cuentti; false (default) = dry-run' },
        permitirDuplicado: { type: 'boolean', default: false, description: 'true = registrar aunque ya exista una compra con ese proveedor+numeroFactura. Default false (bloquea duplicados).' },
      },
      required: ['proveedorNit', 'items'],
    },
    handler: async (c) => {
      if (!c.proveedorNit || !Array.isArray(c.items) || c.items.length === 0) return '❌ Se requiere proveedorNit e items.'
      const payload = buildCompraPayload(c)
      const totalFmt = fmtCOP(payload.total_neto)

      // Anti-duplicado: ¿ya se registro esta factura de este proveedor?
      const yaRegistrada = await buscarCompraRegistrada(c.proveedorNit, c.numeroFactura)
      const avisoDup = yaRegistrada
        ? `> ⚠️ **OJO: esta factura YA fue registrada antes.** id_transacion **${yaRegistrada.id_transacion || '—'}**, el ${fmtFecha(yaRegistrada.registrado_en)} (total ${fmtCOP(yaRegistrada.total)}).`
        : ''

      if (!c.confirm) {
        return [
          `## Dry-run: COMPRA (NO enviada a Cuentti)`,
          avisoDup,
          avisoDup ? `> Si de verdad quieres registrarla otra vez, pasa **confirm:true** y **permitirDuplicado:true**.` : `Pasa **confirm:true** para registrar de verdad.`,
          ``,
          `**Proveedor:** ${c.proveedorNombre || '—'} (NIT ${c.proveedorNit})`,
          `**Factura:** ${c.numeroFactura || '—'} · **Items:** ${payload.objDetalle.length} · **Total:** ${totalFmt}`,
          `**Fecha documento:** ${c.fecha ? `${fechaDocumento(c.fecha)} (se aplicará tras crear, vía "Editar fecha transacción")` : 'hoy (no especificada — Cuentti usa la fecha actual)'}`,
          ``, '<details><summary>Payload Cuentti</summary>', '', '```json', JSON.stringify(payload, null, 2).slice(0, 4000), '```', '</details>',
        ].filter(Boolean).join('\n')
      }

      // confirm:true pero ya existe y NO se forzo el duplicado => bloquear.
      if (yaRegistrada && !c.permitirDuplicado) {
        return [
          `## 🛑 Compra NO registrada (duplicado evitado)`,
          ``,
          avisoDup,
          ``,
          `Para registrarla de todas formas (crear un duplicado a propósito), vuelve a llamar con **permitirDuplicado:true**.`,
        ].join('\n')
      }

      const result = await cuenttiRequest(FACTURA_PATHS.grabarSimple, 'POST', payload)
      const txId = extractIdTransacion(result)

      // 2do paso: poner la fecha real de la factura (boton "Editar fecha transaccion").
      // grabarFacturaSimple no acepta fecha, asi que el doc nace con la de hoy y aqui la corregimos.
      let fechaAviso = ''
      const fechaMs = fechaEpochMs(c.fecha)
      if (txId && fechaMs) {
        try {
          await cambiarFechaTransacion(txId, fechaMs, Date.now())
          fechaAviso = `**Fecha de la factura aplicada:** ${fechaDocumento(c.fecha)} ✅`
        } catch (e) {
          fechaAviso = `⚠️ **La compra se creó pero NO se pudo cambiar la fecha** (quedó con hoy). ${e.message}. Corrígela con cambiar_fecha_transaccion(idTransacion:"${txId}", fecha:"${fechaDocumento(c.fecha)}").`
        }
      }

      // Guardar el registro para el anti-duplicado de la proxima vez.
      if (txId) {
        await guardarCompraRegistrada({
          proveedorNit: c.proveedorNit,
          proveedorNombre: c.proveedorNombre,
          numeroFactura: c.numeroFactura,
          fecha: c.fecha,
          total: payload.total_neto,
          itemsCount: payload.objDetalle.length,
          idTransacion: txId,
        })
      }

      return [
        `## ${txId ? '✅ Compra registrada en Cuentti' : '⚠️ Respuesta sin id_transacion — revisa'}`,
        ``,
        `**id_transacion:** ${txId || '(no devuelto)'}`,
        `**Proveedor:** ${c.proveedorNombre || c.proveedorNit}`,
        `**Factura:** ${c.numeroFactura || '—'}`,
        `**Total:** ${totalFmt}`,
        fechaAviso,
        yaRegistrada ? `**Nota:** se registró como DUPLICADO (permitirDuplicado:true).` : '',
        !txId ? `\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 1500)}\n\`\`\`` : '',
      ].filter(Boolean).join('\n')
    },
  },
  {
    name: 'cambiar_fecha_transaccion',
    description: 'Cambia la fecha de un documento YA creado en Cuentti (compra/venta), equivalente al boton "Editar fecha transaccion". Recibe id_transacion y la fecha (YYYY-MM-DD). dry-run por defecto; confirm:true para aplicar.',
    inputSchema: {
      type: 'object',
      properties: {
        idTransacion: { type: ['string', 'number'] },
        fecha: { type: 'string', description: 'Nueva fecha del documento en YYYY-MM-DD' },
        confirm: { type: 'boolean', description: 'true = aplicar; false (default) = dry-run' },
      },
      required: ['idTransacion', 'fecha'],
    },
    handler: async ({ idTransacion, fecha, confirm = false }) => {
      const tx = String(idTransacion || '').trim()
      if (!tx) return '❌ Debes pasar un id_transacion'
      const fechaMs = fechaEpochMs(fecha)
      if (!fechaMs) return '❌ Fecha invalida. Usa formato YYYY-MM-DD.'
      if (!confirm) return `## Dry-run: cambiar fecha de tx ${tx} → ${fechaDocumento(fecha)}\nEpoch ms: ${fechaMs}. Pasa **confirm:true** para aplicar.`
      const resp = await cambiarFechaTransacion(tx, fechaMs, Date.now())
      return [`## ✅ Fecha cambiada`, `**id_transacion:** ${tx}`, `**Nueva fecha:** ${fechaDocumento(fecha)}`, '', '```json', JSON.stringify(resp, null, 2).slice(0, 800), '```'].join('\n')
    },
  },
  {
    name: 'anular_transaccion',
    description: 'Anula una transaccion en Cuentti por id_transacion (sirve para deshacer una compra/venta/prueba). dry-run por defecto; confirm:true para anular.',
    inputSchema: {
      type: 'object',
      properties: {
        idTransacion: { type: ['string', 'number'] },
        observacion: { type: 'string', default: '' },
        confirm: { type: 'boolean' },
      },
      required: ['idTransacion'],
    },
    handler: async ({ idTransacion, observacion = '', confirm = false }) => {
      const tx = String(idTransacion || '').trim()
      if (!tx) return '❌ Debes pasar un id_transacion'
      if (!confirm) return `## Dry-run: anular transaccion ${tx}\nPasa **confirm:true** para anular de verdad.`
      const body = {
        id_encabezado_anulada: 0, id_transacion: tx, id_cliente: 1,
        id_empleado: parseInt(CONFIG.employeeId, 10) || 1,
        observacion, nota: 'Anulacion', esEliminar: true,
        fecha_registro: Date.now(), id_transacion_remplazo: null,
      }
      const resp = await cuenttiRequest('/jServerj4ErpPro/com/j4ErpPro/server/transacion/anularTransacion', 'POST', body)
      return [`## ✅ Solicitud de anulación enviada`, `**id_transacion:** ${tx}`, '', '```json', JSON.stringify(resp, null, 2).slice(0, 800), '```'].join('\n')
    },
  },
]

const mcpServer = { name: 'Cuentti MultiAS (HTTP)', version: '1.0.0', tools }

export default async function handler(req, res) {
  return handleMcp(req, res, mcpServer)
}
