#!/usr/bin/env node
/**
 * MCP Server: Cuentti (Multidiagnosticos AS)
 *
 * Fase 1 — Operaciones seguras (solo lectura + creacion de cliente):
 *   - buscar_cliente_cuentti(cedula)
 *   - listar_inventario_cuentti(pagina?)
 *   - buscar_producto_sku_cuentti(sku)
 *   - obtener_url_documento_cuentti(idTransacion)
 *   - estado_cuentti() — diagnostico de conexion y token
 *   - crear_cliente_cuentti(...) — graba cliente (idempotente por cedula)
 *
 * NOTA: emision de facturas y anulaciones quedan deshabilitadas en esta fase
 * por seguridad. Se agregaran en Fase 3 con dry-run + confirmacion explicita.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// Configuracion Cuentti
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  baseUrl: process.env.CUENTTI_BASE_URL || 'https://app.cuenti.com',
  token: process.env.CUENTTI_TOKEN || 'MTE0NjR8MTE0NjR8OTAxNTcyMjI1fDB8ZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnpkV0lpT2lJeE1UUTJOQzB5TURJek1EQTVOREF3TUROak5Ea3laRGMwWlMwMU4yRmpMVFJrTVRrdE9HUm1OeTAxTkdSaU9EYzVaVGxtWlRGOE9UQXhOVGN5TWpJMUlpd2lhV0YwSWpveE56YzJNemd5T0RZMExDSmxlSEFpT201MWJHeDkuNnZueUpKZmFaZWh5ZmxGdUhlLTFMSHE5R2V3TVlBZk5CR3FCR2h4TzA0OA==',
  companyId: process.env.CUENTTI_COMPANY_ID || '11464',
  branchId: process.env.CUENTTI_BRANCH_ID || '1',
  employeeId: process.env.CUENTTI_EMPLOYEE_ID || '1',
  gtm: process.env.CUENTTI_GTM || 'GMT-0500',
  timeout: parseInt(process.env.CUENTTI_TIMEOUT || '15000', 10),
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
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
    const res = await fetch(url, opts)
    clearTimeout(timer)
    const text = await res.text()
    let parsed = null
    try { parsed = JSON.parse(text) } catch { parsed = text }
    if (!res.ok) {
      const err = new Error(`Cuentti ${res.status}: ${typeof parsed === 'string' ? parsed : (parsed?.body || JSON.stringify(parsed))}`)
      err.status = res.status
      err.body = parsed
      throw err
    }
    return parsed
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(parseFloat(n) || 0)
}

function ok(text) {
  return { content: [{ type: 'text', text }] }
}

function fail(msg, detail = null) {
  let body = `❌ ${msg}`
  if (detail) body += `\n\n\`\`\`\n${typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)}\n\`\`\``
  return { content: [{ type: 'text', text: body }], isError: true }
}

// ─────────────────────────────────────────────────────────────
// Crear servidor MCP
// ─────────────────────────────────────────────────────────────
const server = new McpServer({
  name: 'Cuentti MultiAS',
  version: '0.1.0',
})

// ═════════════════════════════════════════════════════════════
// TOOL: estado_cuentti — Diagnostico de conexion
// ═════════════════════════════════════════════════════════════
server.tool(
  'estado_cuentti',
  'Diagnostico de la conexion con Cuentti: prueba el token, devuelve company/branch/employee configurados.',
  {},
  async () => {
    const headers = buildHeaders()
    // Probar token con una cedula generica
    try {
      const probe = await cuenttiRequest('/jServerj4ErpPro/api/token/consultarClienteIdentificacion/222222222222')
      const ok_token = !probe?.message || /no.*exist/i.test(probe?.message || '')
      return ok([
        `## Estado Cuentti`,
        ``,
        `**Base URL:** ${CONFIG.baseUrl}`,
        `**Empresa:** ${CONFIG.companyId}`,
        `**Sucursal:** ${CONFIG.branchId}`,
        `**Empleado:** ${CONFIG.employeeId}`,
        `**Token:** \`${CONFIG.token.slice(0, 12)}…${CONFIG.token.slice(-6)}\``,
        ``,
        `**Conexion:** ${ok_token ? '✅ OK' : '⚠️ respuesta inesperada'}`,
        `**Probe response:** \`\`\`\n${JSON.stringify(probe, null, 2).slice(0, 500)}\n\`\`\``,
      ].join('\n'))
    } catch (e) {
      return fail(`No se pudo conectar con Cuentti: ${e.message}`, e.body)
    }
  },
)

// ═════════════════════════════════════════════════════════════
// TOOL: buscar_cliente_cuentti
// ═════════════════════════════════════════════════════════════
server.tool(
  'buscar_cliente_cuentti',
  'Busca un cliente en Cuentti por numero de identificacion (cedula / NIT). Devuelve nombre, telefono, email, direccion y el id_cliente de Cuentti.',
  {
    cedula: z.string().describe('Numero de identificacion del cliente (cedula o NIT)'),
  },
  async ({ cedula }) => {
    const ced = (cedula || '').toString().trim()
    if (!ced) return fail('Debes pasar una cedula no vacia')

    try {
      const data = await cuenttiRequest(`/jServerj4ErpPro/api/token/consultarClienteIdentificacion/${encodeURIComponent(ced)}`)

      if (data?.message || data?.type === 0) {
        return ok(`No se encontro cliente con cedula **${ced}** en Cuentti.\n\nRespuesta: \`${data.message || 'sin datos'}\``)
      }

      const items = Array.isArray(data) ? data : (data?.data ? data.data : (data ? [data] : []))
      const filtered = items.filter(r => r && Object.keys(r).length > 0 && !r.message)
      if (!filtered.length) return ok(`No se encontro cliente con cedula **${ced}** en Cuentti.`)

      const c = filtered[0]
      const nombre = c.nombre_cliente
        || [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')
        || '(sin nombre)'

      return ok([
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
        `| **Tipo persona** | ${c.id_tipo_persona || '—'} |`,
        `| **Regimen** | ${c.regimen || '—'} |`,
        `| **Activo** | ${c.es_activo === '1' ? 'sí' : 'no'} |`,
      ].join('\n'))
    } catch (e) {
      return fail(`Error consultando Cuentti: ${e.message}`, e.body)
    }
  },
)

// ═════════════════════════════════════════════════════════════
// TOOL: listar_inventario_cuentti
// ═════════════════════════════════════════════════════════════
server.tool(
  'listar_inventario_cuentti',
  'Lista productos del inventario de Cuentti (paginado, 1000 por pagina). Devuelve nombre, SKU, precio con IVA y existencias.',
  {
    pagina: z.number().int().min(0).default(0).describe('Numero de pagina (0 = primera). Cada pagina trae hasta 1000 productos.'),
    limit: z.number().int().min(1).max(100).default(50).describe('Cuantos mostrar en la respuesta (filtra del lote de 1000). Default 50.'),
    filtro: z.string().optional().describe('Filtro opcional (substring case-insensitive sobre nombre o SKU).'),
  },
  async ({ pagina, limit, filtro }) => {
    try {
      const path = `/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/consultaProductoPaginadaMovil/${CONFIG.branchId}/${pagina}?tomar_precio_online=0`
      const data = await cuenttiRequest(path)
      const items = Array.isArray(data) ? data : (data?.data || [])
      if (!items.length) return ok(`Pagina ${pagina}: sin productos.`)

      const filtroLow = (filtro || '').trim().toLowerCase()
      const filtered = filtroLow
        ? items.filter(p => (p.nombre || '').toLowerCase().includes(filtroLow) || (p.sku || '').toLowerCase().includes(filtroLow) || (p.codigo_barras || '').toLowerCase().includes(filtroLow))
        : items

      const slice = filtered.slice(0, limit)
      const rows = slice.map(p => {
        const precioSinIva = parseFloat(p.precio_venta || 0)
        const iva = parseFloat(p.valor_impuesto || 0)
        const precioFinal = precioSinIva * (1 + iva / 100)
        return `| ${p.sku || '—'} | ${(p.nombre || '').slice(0, 60)} | ${fmtCOP(precioFinal)} | ${parseFloat(p.existencias || 0)} | ${iva}% |`
      })

      return ok([
        `## Inventario Cuentti — pagina ${pagina}`,
        `Total en la pagina: ${items.length} · Filtrados: ${filtered.length} · Mostrando: ${slice.length}`,
        ``,
        `| SKU | Nombre | Precio | Stock | IVA |`,
        `|---|---|---|---|---|`,
        ...rows,
      ].join('\n'))
    } catch (e) {
      return fail(`Error listando inventario: ${e.message}`, e.body)
    }
  },
)

// ═════════════════════════════════════════════════════════════
// TOOL: buscar_producto_sku_cuentti
// ═════════════════════════════════════════════════════════════
server.tool(
  'buscar_producto_sku_cuentti',
  'Busca un producto especifico por SKU o codigo de barras en Cuentti.',
  {
    sku: z.string().describe('SKU o codigo de barras del producto'),
  },
  async ({ sku }) => {
    const s = (sku || '').toString().trim()
    if (!s) return fail('Debes pasar un SKU no vacio')
    try {
      const path = `/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/obtenerProductoSku/${CONFIG.branchId}/${encodeURIComponent(s)}`
      const data = await cuenttiRequest(path)
      if (!data || data.message) return ok(`No se encontro producto con SKU **${s}**.`)
      const p = Array.isArray(data) ? data[0] : data
      if (!p || !p.id_producto) return ok(`No se encontro producto con SKU **${s}**.`)

      const precioSinIva = parseFloat(p.precio_venta || 0)
      const iva = parseFloat(p.valor_impuesto || 0)
      const precioFinal = precioSinIva * (1 + iva / 100)

      return ok([
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
        `| **Es servicio** | ${p.es_servicio === 1 ? 'sí' : 'no'} |`,
        `| **Vende sin existencia** | ${p.vende_sin_existencia === 1 ? 'sí' : 'no'} |`,
      ].join('\n'))
    } catch (e) {
      return fail(`Error buscando producto: ${e.message}`, e.body)
    }
  },
)

// ═════════════════════════════════════════════════════════════
// TOOL: obtener_url_documento_cuentti
// ═════════════════════════════════════════════════════════════
server.tool(
  'obtener_url_documento_cuentti',
  'Obtiene la URL/QR del documento (factura/remision) por id_transacion.',
  {
    idTransacion: z.union([z.number(), z.string()]).describe('id_transacion de Cuentti'),
  },
  async ({ idTransacion }) => {
    const tx = String(idTransacion || '').trim()
    if (!tx) return fail('Debes pasar un id_transacion valido')
    try {
      const path = `/jServerj4ErpPro/com/j4ErpPro/server/transacion/buscarQrId_transacion/${encodeURIComponent(tx)}`
      const data = await cuenttiRequest(path)
      return ok([
        `## URL Documento — id_transacion ${tx}`,
        ``,
        '```json',
        JSON.stringify(data, null, 2),
        '```',
      ].join('\n'))
    } catch (e) {
      return fail(`Error obteniendo URL del documento: ${e.message}`, e.body)
    }
  },
)

// ═════════════════════════════════════════════════════════════
// TOOL: crear_cliente_cuentti
// ═════════════════════════════════════════════════════════════
server.tool(
  'crear_cliente_cuentti',
  'Crea o actualiza un cliente en Cuentti. Es idempotente por cedula (Cuentti hace upsert si ya existe). Para actualizar pasa tambien cuenttiId.',
  {
    cedula: z.string().describe('Numero de identificacion (cedula/NIT)'),
    nombre: z.string().describe('Nombre completo o razon social'),
    telefono: z.string().optional().default('').describe('Telefono principal'),
    email: z.string().optional().default('').describe('Email principal'),
    direccion: z.string().optional().default('').describe('Direccion'),
    ciudad: z.string().optional().default('').describe('Ciudad'),
    tipoIdentificacion: z.enum(['2', '3', '4', '5', '6']).optional().default('3').describe('2=CExt, 3=CC, 4=TI, 5=NIT, 6=Pasaporte'),
    tipoPersona: z.enum(['1', '2']).optional().default('1').describe('1=Natural, 2=Juridica'),
    regimen: z.number().int().optional().default(2).describe('2=Simple, 5=Resp IVA, 49=No Resp IVA'),
    cuenttiId: z.number().int().optional().describe('Si vas a actualizar uno existente, pasa su id_cliente de Cuentti'),
    confirm: z.boolean().describe('Debe ser true para ejecutar. Si es false, devuelve un dry-run sin tocar Cuentti.'),
  },
  async ({ cedula, nombre, telefono, email, direccion, ciudad, tipoIdentificacion, tipoPersona, regimen, cuenttiId, confirm }) => {
    const ced = (cedula || '').trim()
    const nom = (nombre || '').trim()
    if (!ced || !nom) return fail('cedula y nombre son obligatorios')

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
      codigo_turismo: null,
      fecha_vencimiento_codigo_turismo: null,
      legalidad: 29,
      cliente_predeterminado: '0',
      tipoOperacion: null,
      medio_pago: null,
      id_sucursal: null,
      nombre_cliente: nom,
      id_tipo_persona: tipoPersona,
      identificacion: ced,
      id_empresa_portal: 0,
      id_usuario_portal: 0,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      direccion,
      telefono1: telefono,
      telefono3: '',
      email1: email,
      email2: '',
      sitio_web: '', facebook: '', twitter: '', instagram: '', snapchat: '',
      puntos_acumulados: 0,
      nota: '',
      es_activo: '1',
      fecha_registro: Date.now(),
      id_lista_precios: null,
      id_ruta_despacho: null,
      es_cliente: 1,
      es_proveedor: 0,
      ciudad,
      zona: '',
      contacto: '',
      clave_portal: '',
      id_estado_civil: 1,
      id_estrato_social: 3,
      id_clase_cliente: 1,
      id_tipo_cliente: 1,
      fecha_nacimiento: null,
      sexo: 'N',
      saldo_bono: 0,
      permite_cartera_vencida: '1',
      codigo_interno: '',
      numero_matricula: null,
      permite_saldo_cartera: '0',
      cupo_cartera: 0,
      permite_cartera: '1',
      id_tipo_retencion_ventas: 1,
      id_tipo_retencion_compra: 1,
      id_centro_costo: null,
      id_vendedor: null,
      lstContactoCliente: [],
      envioSmsCartera: '0',
      envioSmsProducto: '0',
      departamento: '',
      pais: 'Colombia',
      regimen,
      id_tipo_identificacion: tipoIdentificacion,
      id_empleado: parseInt(CONFIG.employeeId, 10),
    }

    if (!confirm) {
      return ok([
        `## Dry-run: crear/actualizar cliente`,
        `**Confirm = false** — no se envio nada a Cuentti.`,
        ``,
        `**Operacion:** ${cuenttiId ? `actualizar id_cliente=${cuenttiId}` : 'crear nuevo'}`,
        `**Cedula:** ${ced}`,
        `**Nombre:** ${nom}`,
        `**Telefono:** ${telefono || '—'}`,
        `**Email:** ${email || '—'}`,
        `**Direccion:** ${direccion || '—'}`,
        `**Ciudad:** ${ciudad || '—'}`,
        `**Tipo ident.:** ${tipoIdentificacion} · **Persona:** ${tipoPersona} · **Regimen:** ${regimen}`,
        ``,
        `Para ejecutar, llama de nuevo con \`confirm: true\`.`,
      ].join('\n'))
    }

    try {
      const resp = await cuenttiRequest('/jServerj4ErpPro/com/j4ErpPro/server/adm/cliente/grabarCliente', 'POST', body)
      const newId = resp?.id_cliente || resp?.id || resp?.data?.id_cliente || null
      return ok([
        `## ✅ Cliente ${cuenttiId ? 'actualizado' : 'creado'} en Cuentti`,
        ``,
        `**id_cliente:** ${newId || '(no devuelto)'}`,
        `**Cedula:** ${ced}`,
        `**Nombre:** ${nom}`,
        ``,
        `**Respuesta cruda:** \`\`\`json\n${JSON.stringify(resp, null, 2).slice(0, 800)}\n\`\`\``,
      ].join('\n'))
    } catch (e) {
      return fail(`Error grabando cliente: ${e.message}`, e.body)
    }
  },
)

// ─────────────────────────────────────────────────────────────
// Arrancar transporte stdio
// ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
