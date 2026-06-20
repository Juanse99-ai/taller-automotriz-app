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
  employeeId: process.env.CUENTTI_EMPLOYEE_ID || '1',
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
      id_banco: factura.idBanco ?? 2,
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
        idBanco: { type: 'integer', description: 'Override del id_banco. Default: efectivo=2, transferencia=1.' },
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
      const banco = idBanco ?? (metodoPago === 'transferencia' ? 1 : metodoPago === 'credito' ? 0 : 2)

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
          urlDoc = typeof doc === 'string' ? doc : (doc?.url_externa || doc?.url || doc?.qr || '')
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
]

const mcpServer = { name: 'Cuentti MultiAS (HTTP)', version: '1.0.0', tools }

export default async function handler(req, res) {
  return handleMcp(req, res, mcpServer)
}
