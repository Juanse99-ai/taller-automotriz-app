import { RESOLUCIONES } from '../utils/constants'

// Configuracion de Cuentti
const CONFIG = {
  baseUrl: '/api/cuentti',
  token: 'MTE0NjR8MTE0NjR8OTAxNTcyMjI1fDB8ZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnpkV0lpT2lJeE1UUTJOQzB5TURJek1EQTVOREF3TUROak5Ea3laRGMwWlMwMU4yRmpMVFJrTVRrdE9HUm1OeTAxTkdSaU9EYzVaVGxtWlRGOE9UQXhOVGN5TWpJMUlpd2lhV0YwSWpveE56YzJNemd5T0RZMExDSmxlSEFpT201MWJHeDkuNnZueUpKZmFaZWh5ZmxGdUhlLTFMSHE5R2V3TVlBZk5CR3FCR2h4TzA0OA==',
  companyId: '11464',
  branchId: '1',
  employeeId: '1',
  gtm: 'GMT-0500',
  timeout: 20000,
  paths: {
    clientes: {
      consultarPorId: '/jServerj4ErpPro/api/token/consultarClienteIdentificacion/{identificacion}',
      grabar: '/jServerj4ErpPro/com/j4ErpPro/server/adm/cliente/grabarCliente',
    },
    productos: {
      // "Movil" trae todo (incl. existencias/es_servicio) pero pesa ~1.1MB/pagina.
      // "Mini" es ~5x mas liviano (~215KB, ~0.4s) — suficiente para el buscador.
      paginadaMovil: '/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/consultaProductoPaginadaMovil/{id_sucursal}/{pagina}?tomar_precio_online=0',
      paginadaMini: '/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/consultaProductoPaginadaMini/{id_sucursal}/{pagina}?tomar_precio_online=0',
      // Existencias (stock) por separado: el Mini de productos no las trae. Liviano (~150KB).
      existenciasMini: '/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/consultaExistenciasActivosMini/{id_sucursal}',
    },
    facturas: {
      grabarSimple: '/jServerj4ErpPro/api/token/grabarFacturaSimple',
      emitirFE: '/jServerj4ErpPro/com/j4ErpPro/server/transacion/generarFacturaElectronica/{id_transacion}/true/true/',
      agregarPago: '/jServerj4ErpPro/com/j4ErpPro/server/transacion/agregarPagoTransacion',
      anular: '/jServerj4ErpPro/com/j4ErpPro/server/transacion/anularTransacion',
      urlDocumento: '/jServerj4ErpPro/com/j4ErpPro/server/transacion/buscarQrId_transacion/{id_transacion}',
    },
  },
}

// Construye los headers; se puede enmascarar el token para depurar
function buildHeaders({ maskToken = false } = {}) {
  const emp = (CONFIG.employeeId ?? '1').toString()
  const company = (CONFIG.companyId ?? '11464').toString()
  const branch = (CONFIG.branchId ?? '1').toString()
  const gtm = CONFIG.gtm || 'GMT-0500'
  const tok = CONFIG.token || ''
  const tokValue = maskToken && tok.length > 10
    ? `${tok.slice(0, 10)}...${tok.slice(-6)}`
    : tok

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tokValue}`,
    'x-auth-token-empresa': company,
    'x-id-sucursal': branch,
    'x-id-empleado': emp,
    'X-Auth-Token-id-usuario': emp,
    'X-Auth-Token-usuario': emp,
    'x-gtm': gtm,
    'usuario': emp,
  }
}

// Request generico al proxy de Cuentti
async function cuenttiRequest(endpoint, method = 'GET', body = null) {
  const url = `${CONFIG.baseUrl}?path=${encodeURIComponent(endpoint)}`
  const headers = buildHeaders()

  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG.timeout)

  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      const errText = await res.text()
      let parsed = null
      try { parsed = JSON.parse(errText) } catch {}
      console.error('[Cuentti] request', { endpoint, method, body })
      console.error('[Cuentti] response', res.status, parsed || errText)
      const msg = (parsed?.body) || errText || res.statusText || 'sin detalle'
      const error = new Error(`Cuentti ${res.status}: ${msg}`)
      error.status = res.status
      error.body = parsed?.body || parsed || errText
      error.headers = parsed?.headers || Object.fromEntries(res.headers.entries())
      throw error
    }
    const text = await res.text()
    try { return JSON.parse(text) } catch { return text }
  } catch (e) {
    clearTimeout(timer)
    console.error('[Cuentti] error lanzada', e)
    throw e
  }
}

// Devuelve headers en formato depuracion (token enmascarado)
export function getCuenttiDebugHeaders() {
  return buildHeaders({ maskToken: true })
}

// ---------- CLIENTES ----------

// Prueba directa del token — devuelve la respuesta cruda de Cuentti sin ocultar errores
export async function testTokenDirecto() {
  const path = CONFIG.paths.clientes.consultarPorId.replace('{identificacion}', '222222222222')
  try {
    const data = await cuenttiRequest(path)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e.message, body: e.body, status: e.status }
  }
}

export async function buscarClientePorCedula(cedula) {
  if (!cedula) return null
  try {
    const path = CONFIG.paths.clientes.consultarPorId.replace('{identificacion}', encodeURIComponent(cedula.trim()))
    const data = await cuenttiRequest(path)
    // Validar respuesta de error de Cuentti (token invalido, etc)
    if (data?.message || data?.type === 0) {
      console.warn('Cuentti API error:', data.message || 'Respuesta invalida')
      return null
    }

    const items = Array.isArray(data) ? data : (data?.data ? data.data : data ? [data] : [])
    const filtered = items.filter(r => r && Object.keys(r).length > 0 && !r.message)
    if (!filtered.length) return null

    const c = filtered[0]
    console.log('Cuentti API raw response cliente:', JSON.stringify(c, null, 2))

    // Construir nombre: usar nombre_cliente, o concatenar partes individuales
    const nombreCompleto = c.nombre_cliente
      || c.name || c.nombre || c.full_name || c.razon_social || c.tercero
      || [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')
      || ''

    return {
      id: c.id_cliente || c.id || c.customer_id,
      cedula: c.identificacion || c.document || c.documento || c.cedula || cedula,
      nombre: nombreCompleto,
      primer_nombre: c.primer_nombre || '',
      segundo_nombre: c.segundo_nombre || '',
      primer_apellido: c.primer_apellido || '',
      segundo_apellido: c.segundo_apellido || '',
      telefono: c.telefono1 || c.telefono3 || c.mobile || c.celular || c.telefono || c.phone || '',
      email: c.email1 || c.email2 || c.email || c.correo || '',
      direccion: c.direccion || c.address || '',
      _raw: c,
    }
  } catch (e) {
    console.warn('Cuentti buscarCliente:', e.message)
    return null
  }
}

// Tipos de identificacion Cuentti
export const TIPOS_IDENTIFICACION = [
  { id: '3', label: 'Cedula de Ciudadania' },
  { id: '5', label: 'NIT' },
  { id: '2', label: 'Cedula de Extranjeria' },
  { id: '4', label: 'Tarjeta de Identidad' },
  { id: '6', label: 'Pasaporte' },
]

// Tipos de persona Cuentti
export const TIPOS_PERSONA = [
  { id: '1', label: 'Natural' },
  { id: '2', label: 'Juridica' },
]

// Regimenes Cuentti
export const REGIMENES = [
  { id: 2, label: 'Regimen simple' },
  { id: 5, label: 'Responsable de IVA' },
  { id: 49, label: 'No responsable de IVA' },
]

export async function grabarCliente(clienteData) {
  const { cedula, nombre, telefono, email, direccion, ciudad, cuenttiId, _raw,
    tipoIdentificacion, tipoPersona, regimen } = clienteData || {}

  // Split nombre into primer_nombre, segundo_nombre, primer_apellido
  const partes = (nombre || '').trim().split(/\s+/)
  const primer_nombre = partes[0] || ''
  const primer_apellido = partes.length > 1 ? partes[partes.length - 1] : ''
  const segundo_nombre = partes.length > 2 ? partes.slice(1, -1).join(' ') : ''

  // id_cliente: usar cuenttiId o _raw?.id_cliente para editar, 0 para crear
  const id_cliente = cuenttiId || _raw?.id_cliente || 0

  const body = {
    id_cliente,
    genera_bonos: 1,
    es_consumidor_final: '0',
    dias_vencimiento_cartera_cliente: 30,
    alias: '',
    regimenImpuesto: regimen || 2,
    codigo_turismo: null,
    fecha_vencimiento_codigo_turismo: null,
    legalidad: 29,
    cliente_predeterminado: '0',
    tipoOperacion: null,
    medio_pago: null,
    id_sucursal: null,
    nombre_cliente: nombre || '',
    id_tipo_persona: tipoPersona || '1',
    identificacion: cedula || '',
    id_empresa_portal: 0,
    id_usuario_portal: 0,
    primer_nombre,
    segundo_nombre,
    primer_apellido,
    direccion: direccion || '',
    telefono1: telefono || '',
    telefono3: '',
    email1: email || '',
    email2: '',
    sitio_web: '',
    facebook: '',
    twitter: '',
    instagram: '',
    snapchat: '',
    puntos_acumulados: 0,
    nota: '',
    es_activo: '1',
    fecha_registro: Date.now(),
    id_lista_precios: null,
    id_ruta_despacho: null,
    es_cliente: 1,
    es_proveedor: 0,
    ciudad: ciudad || '',
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
    regimen: regimen || 2,
    id_tipo_identificacion: tipoIdentificacion || '3',
    id_empleado: parseInt(CONFIG.employeeId),
  }

  return cuenttiRequest(CONFIG.paths.clientes.grabar, 'POST', body)
}

// ---------- INVENTARIO ----------

export async function cargarInventario(pagina = 0) {
  try {
    // Endpoint "Mini" (liviano y rapido): el "Movil" devolvia ~1.1MB por pagina
    // y con conexiones lentas el inventario no terminaba de cargar (quedaba en
    // "0 productos"). Mini trae nombre/sku/precio/iva (lo que usa el buscador).
    const path = CONFIG.paths.productos.paginadaMini
      .replace('{id_sucursal}', CONFIG.branchId)
      .replace('{pagina}', pagina.toString())
    const data = await cuenttiRequest(path)
    const items = Array.isArray(data) ? data : (data?.data || [])
    return items.map(p => {
      const precioSinIva = parseFloat(p.precio_venta || 0)
      const iva = parseFloat(p.valor_impuesto || 0)
      return {
        id: p.id_producto || p.idProductoSucursal,
        codigo: p.codigo_barras || p.sku || `PROD-${p.id_producto}`,
        sku: p.sku || '',
        codigoBarras: p.codigo_barras || '',
        nombre: p.nombre || 'Sin nombre',
        categoria: p.id_categoria ? `Cat-${p.id_categoria}` : 'General',
        precio: precioSinIva * (1 + iva / 100),
        precioBase: precioSinIva,
        stock: parseFloat(p.existencias || 0),
        iva,
        esServicio: p.es_servicio === 1,
        vendeSinExistencia: p.vende_sin_existencia === 1,
      }
    })
  } catch (e) {
    console.warn('Cuentti cargarInventario:', e.message)
    return []
  }
}

// Buscar producto por SKU o codigo de barras
export async function buscarProductoPorSku(sku) {
  if (!sku) return null
  try {
    const path = `/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/obtenerProductoSku/${CONFIG.branchId}/${encodeURIComponent(sku.trim())}`
    const data = await cuenttiRequest(path)
    if (!data || data.message) return null
    const p = Array.isArray(data) ? data[0] : data
    if (!p || !p.id_producto) return null
    const precioSinIva = parseFloat(p.precio_venta || 0)
    const iva = parseFloat(p.valor_impuesto || 0)
    return {
      id: p.id_producto || p.idProductoSucursal,
      codigo: p.codigo_barras || p.sku || '',
      sku: p.sku || '',
      codigoBarras: p.codigo_barras || '',
      nombre: p.nombre || 'Sin nombre',
      precio: precioSinIva * (1 + iva / 100),
      precioBase: precioSinIva,
      stock: parseFloat(p.existencias || 0),
      iva,
    }
  } catch (e) {
    console.warn('Cuentti buscarProductoPorSku:', e.message)
    return null
  }
}

// Trae las existencias (stock) por id_producto. El endpoint Mini de productos no
// las incluye, así que se piden aparte (consultaExistenciasActivosMini es liviano).
async function cargarExistencias() {
  try {
    const path = CONFIG.paths.productos.existenciasMini.replace('{id_sucursal}', CONFIG.branchId)
    const data = await cuenttiRequest(path)
    const arr = Array.isArray(data) ? data : (data?.data || [])
    const map = new Map()
    for (const e of arr) {
      const id = e.id_producto ?? e.id
      if (id != null) map.set(String(id), parseFloat(e.exis ?? e.existencias ?? 0) || 0)
    }
    return map
  } catch (e) {
    console.warn('Cuentti cargarExistencias:', e.message)
    return null
  }
}

export async function cargarInventarioCompleto() {
  const todos = []
  let pagina = 0
  let seguir = true
  while (seguir) {
    const items = await cargarInventario(pagina)
    if (!items.length) { seguir = false; break }
    todos.push(...items)
    if (items.length < 1000) seguir = false
    else pagina++
  }
  // Mezclar el stock real (el Mini de productos viene sin existencias).
  const exMap = await cargarExistencias()
  if (exMap) {
    for (const p of todos) {
      const ex = exMap.get(String(p.id))
      if (ex != null) p.stock = ex
    }
  }
  return todos
}

// ---------- FACTURACION ----------

export function buildFacturaPayload(factura) {
  const to2 = (n) => parseFloat((parseFloat(n || 0)).toFixed(2))
  const upper = (v) => (v ?? '').toString().trim().toUpperCase()

  // Detalle. Si el item viene del inventario tiene su propio SKU. Si fue
  // escrito a mano (sin seleccionar de inventario) usa 'MO1' como fallback;
  // el usuario debe asegurarse de tener un producto con SKU 'MO1' en Cuentti
  // (o seleccionar siempre los productos del inventario al crear la OT).
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

  const empId = parseInt(CONFIG.employeeId) || 1
  const branchId = parseInt(CONFIG.branchId) || 1
  const consecutivo = factura.resolucion === 'FEIC'
    ? (RESOLUCIONES.FEIC?.id || 2)
    : (RESOLUCIONES.MAS?.id || 4)

  const tipoDoc = factura.tipoDocumento || 1 // 1=factura, 9=remision, 2=plan separe

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
      id_banco: factura.idBanco ?? 1,
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

export async function enviarFactura(factura) {
  const body = buildFacturaPayload(factura)
  console.log('Cuentti enviarFactura payload:', JSON.stringify(body, null, 2))
  return cuenttiRequest(CONFIG.paths.facturas.grabarSimple, 'POST', body)
}

// Emitir Factura Electronica ante la DIAN
export async function emitirFacturaElectronica(idTransacion) {
  if (!idTransacion) throw new Error('Se requiere id_transacion')
  try {
    const path = CONFIG.paths.facturas.emitirFE.replace('{id_transacion}', idTransacion)
    return await cuenttiRequest(path)
  } catch (e) {
    console.error('Cuentti emitirFE:', e.message)
    throw e
  }
}

// Detectar medios de pago disponibles en Cuentti probando muchos endpoints
// Cada cuenta de Cuentti tiene IDs distintos en su tabla vent_medio_pago
// y no hay docs publicas. Probamos 30+ paths conocidos del stack j4ErpPro
// hasta encontrar uno que responda con la lista.
export async function detectarMediosPago() {
  const branch = CONFIG.branchId
  const empresa = CONFIG.companyId
  const candidatos = [
    // Server-side (com/j4ErpPro/server/*)
    '/jServerj4ErpPro/com/j4ErpPro/server/general/medio_pago/listar',
    '/jServerj4ErpPro/com/j4ErpPro/server/general/medioPago/listar',
    '/jServerj4ErpPro/com/j4ErpPro/server/general/listarMediosPago',
    '/jServerj4ErpPro/com/j4ErpPro/server/admin/medio_pago/listar',
    '/jServerj4ErpPro/com/j4ErpPro/server/admin/medioPago/listar',
    '/jServerj4ErpPro/com/j4ErpPro/server/admin/listarMediosPago',
    '/jServerj4ErpPro/com/j4ErpPro/server/vent/medio_pago/listar',
    '/jServerj4ErpPro/com/j4ErpPro/server/vent/medioPago/listar',
    '/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/medio_pago/listar',
    '/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/listarMediosPago',
    '/jServerj4ErpPro/com/j4ErpPro/server/configuracion/medio_pago',
    '/jServerj4ErpPro/com/j4ErpPro/server/configuracion/medio_pago/listar',
    `/jServerj4ErpPro/com/j4ErpPro/server/general/medio_pago/listar/${branch}`,
    `/jServerj4ErpPro/com/j4ErpPro/server/admin/medio_pago/listar/${branch}`,
    `/jServerj4ErpPro/com/j4ErpPro/server/general/medio_pago/listar/${branch}/0`,
    `/jServerj4ErpPro/com/j4ErpPro/server/general/medio_pago/empresa/${empresa}`,
    // Token endpoints (api/token/*)
    '/jServerj4ErpPro/api/token/listarMediosPago',
    '/jServerj4ErpPro/api/token/mediosPago',
    '/jServerj4ErpPro/api/token/medios_pago',
    '/jServerj4ErpPro/api/token/medio_pago',
    '/jServerj4ErpPro/api/token/medio_pago/listar',
    '/jServerj4ErpPro/api/token/listar/medio_pago',
    '/jServerj4ErpPro/api/token/configuracion/medios_pago',
    `/jServerj4ErpPro/api/token/medios_pago/${branch}`,
    `/jServerj4ErpPro/api/token/medio_pago/${branch}`,
    // Otros patrones
    '/jServerj4ErpPro/com/j4ErpPro/server/factura/medio_pago',
    '/jServerj4ErpPro/com/j4ErpPro/server/transacion/medio_pago',
    '/jServerj4ErpPro/com/j4ErpPro/server/transacion/listarMediosPago',
    '/jServerj4ErpPro/com/j4ErpPro/server/general/lista/medio_pago',
    '/jServerj4ErpPro/com/j4ErpPro/server/general/lista_medio_pago',
  ]

  const resultados = []
  for (const path of candidatos) {
    // Prueba GET y POST si GET no funciona
    for (const method of ['GET', 'POST']) {
      try {
        const data = await cuenttiRequest(path, method, method === 'POST' ? {} : null)
        // Detecta una respuesta valida (array o objeto con datos)
        const items = Array.isArray(data) ? data : (data?.data || data?.lista || data?.medios || data?.body?.lista || [])
        if (Array.isArray(items) && items.length > 0 && items[0] && typeof items[0] === 'object') {
          // Verificar que parecen medios de pago (tienen un id y un nombre/descripcion)
          const validos = items.filter(m => {
            const id = m.id_medio_pago ?? m.id ?? m.idMedioPago
            const nombre = m.nombre ?? m.descripcion ?? m.medio_pago ?? m.label
            return id != null && (typeof id === 'number' || !isNaN(parseInt(id))) && nombre
          })
          if (validos.length > 0) {
            return {
              ok: true,
              endpoint: `${method} ${path}`,
              medios: validos.map(m => ({
                id: parseInt(m.id_medio_pago ?? m.id ?? m.idMedioPago),
                nombre: m.nombre ?? m.descripcion ?? m.medio_pago ?? m.label ?? '?',
                raw: m,
              })),
              intentos: resultados,
            }
          }
        }
        resultados.push({ path: `${method} ${path}`, status: 'sin lista' })
      } catch (e) {
        resultados.push({ path: `${method} ${path}`, status: e.status || 'error' })
      }
      // Si fue GET, no probar POST en el mismo path
      if (method === 'GET') break
    }
  }
  return { ok: false, intentos: resultados.slice(0, 30) }
}

// Probar un id_medio_pago especifico enviando una factura test minimal,
// y anular inmediatamente si tiene exito. Permite descubrir IDs validos
// sin tener que adivinar a ciegas. Cada test crea-y-anula UNA factura
// (queda en logs de Cuentti pero anulada).
export async function probarIdMedioPago(idMedioPago, idBanco = 2) {
  // Crear factura test minima: 1 peso, MO1, mismo cliente generico
  const facturaTest = {
    items: [{ nombre: 'TEST_ID_MEDIO_PAGO', precio: 1, cantidad: 1, iva: 0, sku: 'MO1' }],
    cliente: 'CONSUMIDOR FINAL',
    cedula: '222222222222',
    resolucion: 'MAS',
    idMedioPago,
    idBanco,
    aCredito: false,
    observaciones: 'TEST automatico para detectar id_medio_pago — debe anularse',
  }
  try {
    const result = await enviarFactura(facturaTest)
    // Si llego aqui sin throw, el ID funciona
    const txId = (typeof result === 'string' ? result : (result?.id_transacion ?? result?.idTransacion ?? result?.id ?? null))
    // Intentar anular inmediatamente
    if (txId) {
      try {
        await cuenttiRequest(`/jServerj4ErpPro/com/j4ErpPro/server/transacion/anularTransacion/${txId}`, 'POST')
      } catch {}
    }
    return { ok: true, idTransacion: txId, mensaje: 'ID valido — factura test creada y anulada' }
  } catch (e) {
    const msg = e.message || ''
    // Distinguir el tipo de error: FK violation = ID invalido vs otros errores
    const esFkViolation = /id_medio_pago|id_banco|FOREIGN KEY/i.test(msg) || /constraint fails/i.test(msg)
    return {
      ok: false,
      esFkViolation,
      mensaje: esFkViolation
        ? `ID ${idMedioPago} NO existe en tu Cuentti (FK violation)`
        : `Error distinto: ${msg.slice(0, 120)}`,
    }
  }
}

// Agregar pago a una transaccion existente
export async function agregarPagoTransacion(pago) {
  const body = {
    n_caja: 0,
    id_transacion: pago.idTransacion,
    valor: parseFloat(pago.valor) || 0,
    es_activo: '1',
    id_empleado: parseInt(CONFIG.employeeId),
    nota: pago.nota || '',
    id_sucursal: parseInt(CONFIG.branchId),
    id_banco: pago.idBanco || 1, // 1=Caja General (efectivo). 2=Bancolombia, 3=Nequi
    id_medio_pago: pago.idMedioPago || 1,
    boucher: pago.boucher || '',
    digitos: pago.digitos || '',
    devuelta: parseFloat(pago.devuelta) || 0,
    dinero_entregado: parseFloat(pago.dineroEntregado || pago.valor) || 0,
    es_ingreso: 1,
    id_cliente: pago.idCliente || 1,
    fecha_registro: new Date().toISOString(),
    id_centro_costo: 1,
  }
  return cuenttiRequest(CONFIG.paths.facturas.agregarPago, 'POST', body)
}

// Obtener URL del documento/factura (QR/PDF)
export async function obtenerUrlDocumento(idTransacion) {
  if (!idTransacion) return null
  try {
    const path = CONFIG.paths.facturas.urlDocumento.replace('{id_transacion}', idTransacion)
    return await cuenttiRequest(path)
  } catch (e) {
    console.warn('Cuentti urlDocumento:', e.message)
    return null
  }
}

// Anular transaccion
export async function anularTransacion(datos) {
  const body = {
    id_encabezado_anulada: 0,
    id_transacion: datos.idTransacion,
    id_cliente: datos.idCliente || 1,
    id_empleado: parseInt(CONFIG.employeeId),
    observacion: datos.observacion || '',
    nota: datos.nota || 'Anulacion',
    esEliminar: datos.eliminar !== false,
    fecha_registro: Date.now(),
    id_transacion_remplazo: null,
  }
  return cuenttiRequest(CONFIG.paths.facturas.anular, 'POST', body)
}

// ---------- PRODUCTOS (Crear/Editar) ----------

export async function grabarProductoMovil(producto) {
  const body = {
    idProductoSucursal: producto.idProductoSucursal || 0,
    id_producto: producto.idProducto || 0,
    id_sucursal: parseInt(CONFIG.branchId),
    nombre: producto.nombre || '',
    precio_venta: parseFloat(producto.precioVenta) || 0,
    es_servicio: producto.esServicio ? 1 : 10,
    id_marca: producto.idMarca || 1,
    id_categoria: producto.idCategoria || 1,
    sku: producto.sku || '',
    es_activo: 1,
    codigo_barras: producto.codigoBarras || '',
    nota: producto.nota || '',
    id_empleado: parseInt(CONFIG.employeeId),
    id_impuesto: producto.idImpuesto || 1,
    existencias: parseFloat(producto.existencias) || 0,
  }
  return cuenttiRequest(
    '/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/grabraProductoMovil',
    'POST',
    body,
  )
}

export { CONFIG as cuenttiConfig }
