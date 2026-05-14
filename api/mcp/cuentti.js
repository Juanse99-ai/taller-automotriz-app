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
      const path = `/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/consultaProductoPaginadaMovil/${CONFIG.branchId}/${pagina}`
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
]

const mcpServer = { name: 'Cuentti MultiAS (HTTP)', version: '1.0.0', tools }

export default async function handler(req, res) {
  return handleMcp(req, res, mcpServer)
}
