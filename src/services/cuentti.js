import { RESOLUCIONES } from '../utils/constants'

// Configuracion de Cuentti
const CONFIG = {
  baseUrl: '/api/cuentti',
  token: 'MTE0NjR8MTE0NjR8OTAxNTcyMjI1fDB8ZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnpkV0lpT2lJeE1UUTJOQzB5TURJek1EQTVOREF3TUROak5Ea3laRGMwWlMwMU4yRmpMVFJrTVRrdE9HUm1OeTAxTkdSaU9EYzVaVGxtWlRGOE9UQXhOVGN5TWpJMUlpd2lhV0YwSWpveE56YzJNemd5T0RZMExDSmxlSEFpT201MWJHeDkuNnZueUpKZmFaZWh5ZmxGdUhlLTFMSHE5R2V3TVlBZk5CR3FCR2h4TzA0OA==',
  companyId: '11464',
  branchId: '1',
  // Empleado 2 = el usuario/cajero real con la CAJA abierta. Antes era 1, por eso los
  // pagos en efectivo caian en la caja del empleado 1 y NO salian en el cierre de caja
  // (verificado: el recibo manual que SÍ entra usa id_empleado=2; lo demas idéntico).
  employeeId: '2',
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
      // Gasto/egreso contra una cuenta de egreso (nómina). Endpoint que usa la UI
      // de Cuentti (capturado con DevTools). Clave: item con id_producto=0 +
      // id_plan_cuentas=43 (cuenta "Nomina"). Ver reference_cuentti_gasto_nomina.
      grabarGasto: '/jServerj4ErpPro/com/j4ErpPro/server/transacion/grabardocumentosTransacion_desconectado',
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
async function cuenttiRequest(endpoint, method = 'GET', body = null, timeout = CONFIG.timeout) {
  const url = `${CONFIG.baseUrl}?path=${encodeURIComponent(endpoint)}`
  const headers = buildHeaders()

  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

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

// ---------------------------------------------------------------------------
// GASTO DE NÓMINA (egreso contra la cuenta "Nomina", id_plan_cuentas=43).
// Reconstruido del payload capturado del frontend de Cuentti (DevTools).
// PENDIENTE: probar en vivo (el endpoint es de "sesión"; falta confirmar que el
// token de la app lo acepta). No está cableado al flujo aún.
// opts: { proveedorId, proveedorCedula, proveedorNombre, monto, idMedioPago=1, nota, fecha }
// ---------------------------------------------------------------------------
const ID_CUENTA_NOMINA = 43

export async function registrarGastoNomina(opts = {}) {
  const {
    proveedorId, proveedorCedula, proveedorNombre = '',
    monto, idMedioPago = 1, nota = '', fecha,
  } = opts
  const valor = Math.round(parseFloat(monto) || 0)
  if (!proveedorCedula) throw new Error('Falta la cédula del proveedor (técnico)')
  if (valor <= 0) throw new Error('El monto del gasto debe ser mayor a 0')

  const emp = (CONFIG.employeeId ?? '2').toString()
  const company = (CONFIG.companyId ?? '11464').toString()
  const ahora = new Date()
  const iso = (fecha ? new Date(`${fecha}T12:00:00`) : ahora).toISOString()
  const rand5 = Math.random().toString(36).slice(2, 7)
  const codigoUnico = `${company}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`

  const payload = {
    tipoDocumento: 7,
    id_sucursal: parseInt(CONFIG.branchId) || 1,
    id_bodega: 1,
    id_canal: 1,
    id_centro_costo: 1,
    id_cliente: proveedorId ?? -1,
    id_empleado: parseInt(emp) || 2,
    id_vendedor: parseInt(emp) || 2,
    id_consecutivo: null,
    id_documento: null,
    es_ingreso: 0,
    es_factura: 0,
    compraRemision: 0,
    esConectado: true,
    editar_transacion: false,
    descuento: 0,
    descuento_global: 0,
    domicilio: 0,
    propina: 0,
    anticipos: [],
    retenciones: [],
    empresa: 'Multidiagnosticos AS SAS',
    correoEnvia: 'multidiagnosticosas@gmail.com',
    nota,
    nFactura: '',
    codigo_unico: codigoUnico,
    codigo_unico_volatil: codigoUnico,
    codeUnicoQr: `${company}-7-${emp}-${rand5}`,
    fecha_registro: iso,
    fecha_inicial: iso,
    fecha_final: iso,
    fecha_vencimiento: iso,
    total_neto: valor,
    total_sin_impuestos: valor,
    total_impuestos: 0,
    total_estampilla: 0,
    total_impoconsumo: 0,
    json: JSON.stringify({ lstImpuestos: [{ breve: 'G', impuestosPor: 0, base: valor, valor: 0, total: valor, tipo_impuesto: 1 }] }),
    objClienteMini: {
      nombre_cliente: proveedorNombre,
      identificacion: String(proveedorCedula),
      es_proveedor: 1,
      es_cliente: 0,
      id_tipo_persona: 1,
      telefono1: '', telefono2: '', direccion: '', email1: '', medio_pago: null,
    },
    objTransacionDetalle: [{
      id_producto: 0,
      id_plan_cuentas: ID_CUENTA_NOMINA,
      descripcion: nota || 'Nomina',
      cantidad: 1,
      precio_venta: valor,
      precio_real: valor,
      total: valor,
      impuesto: 0,
      tipo_impuesto: 1,
      editoPrecioManul: true,
      es_devolucion: 0,
      es_promocion: 0,
      descuentoPor: 0,
      descuento_valor: 0,
      id_centro_costo: 0,
      id_lista_precio: 0,
      total_estampilla: 0,
      total_impoconsumo: 0,
    }],
    lstPagos: [{
      id_medio_pago: idMedioPago,
      valor,
      nota: '',
      boucher: '',
      digitos: '',
      devuelta: 0,
    }],
  }

  return cuenttiRequest(CONFIG.paths.facturas.grabarGasto, 'POST', payload)
}

// Registra el gasto de nómina vía el backend (api/cuentti-gasto.js), que hace el
// login con las credenciales del servidor. Es la forma que SÍ funciona (el token
// de sesión no lo puede tener el frontend). Devuelve { ok, idTransacion, numeroDoc }.
export async function registrarGastoNominaBackend({ proveedorId, proveedorCedula, proveedorNombre, monto, idMedioPago = 1, nota = '' }) {
  const res = await fetch('/api/cuentti-gasto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proveedorId, proveedorCedula, proveedorNombre, monto, idMedioPago, nota }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    const detalle = data?.error || (data?.cuentti ? JSON.stringify(data.cuentti).slice(0, 200) : `Error ${res.status}`)
    throw new Error(detalle)
  }
  return data
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

  // id_cliente: usar cuenttiId o _raw?.id_cliente para editar, 0 para crear. Si NO
  // lo tenemos pero el cliente ya existe en Cuentti, mandar 0 hace que Cuentti
  // intente CREARLO con una cedula duplicada y responde 400. Por eso, cuando falta
  // el id, lo buscamos por cedula para hacer ACTUALIZAR (upsert) en vez de crear.
  let id_cliente = cuenttiId || _raw?.id_cliente || 0
  if (!id_cliente && cedula) {
    try {
      const existente = await buscarClientePorCedula(cedula)
      if (existente?.id) id_cliente = existente.id
    } catch (e) {
      console.warn('grabarCliente: búsqueda por cédula falló:', e.message)
    }
  }

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

  const resp = await cuenttiRequest(CONFIG.paths.clientes.grabar, 'POST', body)
  // Dejar id_cliente disponible para el writeback local (guardar cuenttiId). En
  // actualizar ya lo conocemos; en crear, Cuentti lo devuelve dentro de `retorno`.
  let idFinal = id_cliente
  if (!idFinal && resp?.retorno) { try { idFinal = JSON.parse(resp.retorno)?.id_cliente } catch {} }
  if (resp && typeof resp === 'object' && idFinal && !resp.id_cliente) resp.id_cliente = idFinal
  return resp
}

// ---------- INVENTARIO ----------

// Cuentti no documenta el nombre exacto del campo de costo de compra, y varía
// entre endpoints. En vez de adivinar, escaneamos el objeto del producto por
// cualquier campo plausible de costo (sin IVA). Devuelve 0 si no lo encuentra.
const COSTO_KEYS = [
  'precio_compra', 'costo', 'costo_promedio', 'costo_promedio_ponderado',
  'ultimo_costo', 'costo_ultimo', 'valor_costo', 'costo_unitario',
  'precio_costo', 'costo_base', 'costoPromedio', 'precioCompra',
]
export function extraerCostoBase(obj) {
  if (!obj || typeof obj !== 'object') return 0
  for (const k of COSTO_KEYS) {
    if (obj[k] != null) {
      const v = parseFloat(obj[k])
      if (!isNaN(v) && v > 0) return v
    }
  }
  // Fallback: cualquier campo que mencione costo/compra (excluye id_centro_costo, etc.)
  for (const k of Object.keys(obj)) {
    if (/costo|compra/i.test(k) && !/centro|id_|_id/i.test(k)) {
      const v = parseFloat(obj[k])
      if (!isNaN(v) && v > 0) return v
    }
  }
  return 0
}

export async function cargarInventario(pagina = 0) {
  // Endpoint "Movil": trae el dato REAL y completo de cada producto, incluido el
  // costo de compra (campos precio_compra / costo, sin IVA) — necesario para mostrar
  // costo y utilidad de TODO el inventario. Pesa ~1.1MB/pagina, asi que se usa un
  // timeout amplio + 1 reintento; la UI muestra la cache mientras refresca atras.
  const path = CONFIG.paths.productos.paginadaMovil
    .replace('{id_sucursal}', CONFIG.branchId)
    .replace('{pagina}', pagina.toString())
  let ultimoError = null
  for (let intento = 0; intento < 2; intento++) {
    try {
      const data = await cuenttiRequest(path, 'GET', null, 45000)
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
          costoBase: extraerCostoBase(p), // precio_compra / costo (sin IVA)
          esServicio: p.es_servicio === 1,
          vendeSinExistencia: p.vende_sin_existencia === 1,
        }
      })
    } catch (e) {
      ultimoError = e
      console.warn(`Cuentti cargarInventario p${pagina} intento ${intento + 1}:`, e.message)
    }
  }
  console.warn('Cuentti cargarInventario fallo definitivo:', ultimoError?.message)
  return null // null = fallo (distinto de [] = página vacía/fin). El caller aborta.
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
      if (id != null) {
        map.set(String(id), {
          stock: parseFloat(e.exis ?? e.existencias ?? 0) || 0,
          costoBase: extraerCostoBase(e), // Tier 2: costo si el endpoint de existencias lo trae
        })
      }
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
    // Una página que FALLA (null) aborta la carga: mejor conservar el último
    // inventario completo en caché que guardar uno parcial (totales errados).
    if (items === null) {
      console.warn('[Inventario] carga abortada por fallo en página', pagina, '— se conserva la caché')
      return []
    }
    if (!items.length) { seguir = false; break }
    todos.push(...items)
    if (items.length < 1000) seguir = false
    else pagina++
  }
  // Mezclar el stock real (el Mini de productos viene sin existencias) y el costo
  // si el endpoint de existencias lo trae (Tier 2).
  const exMap = await cargarExistencias()
  if (exMap) {
    for (const p of todos) {
      const ex = exMap.get(String(p.id))
      if (ex != null) {
        if (ex.stock != null) p.stock = ex.stock
        if (!p.costoBase && ex.costoBase) p.costoBase = ex.costoBase
      }
    }
  }
  // Derivar costo CON impuestos y % de utilidad (markup sobre costo) por producto.
  for (const p of todos) derivarCosto(p)
  return todos
}

// Calcula costoConIva y utilidadPct a partir de costoBase (sin IVA) y precioBase.
// utilidadPct = markup sobre costo = (precioVenta - costo) / costo * 100.
// Muta el producto. Si no hay costo, deja costoConIva=0 y utilidadPct=null.
export function derivarCosto(p) {
  const costoBase = parseFloat(p.costoBase) || 0
  const iva = parseFloat(p.iva) || 0
  const precioBase = parseFloat(p.precioBase) || 0
  p.costoBase = costoBase
  p.costoConIva = costoBase > 0 ? costoBase * (1 + iva / 100) : 0
  p.utilidadPct = (costoBase > 0 && precioBase > 0)
    ? ((precioBase - costoBase) / costoBase) * 100
    : null
  return p
}

// Tier 3 (bajo demanda): trae el costo de UN producto via obtenerProductoSku, que
// devuelve el producto completo (ahí sí está el costo). Devuelve el costo SIN IVA,
// 0 si no se encuentra, null si falla la petición.
export async function cargarCostoProducto(skuOrCodigo) {
  const s = String(skuOrCodigo || '').trim()
  if (!s) return null
  try {
    const path = `/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/obtenerProductoSku/${CONFIG.branchId}/${encodeURIComponent(s)}`
    const data = await cuenttiRequest(path)
    if (!data || data.message) return null
    const p = Array.isArray(data) ? data[0] : data
    if (!p || !p.id_producto) return null
    return extraerCostoBase(p)
  } catch (e) {
    console.warn('Cuentti cargarCostoProducto:', e.message)
    return null
  }
}

// ---------- FACTURACION ----------

export function buildFacturaPayload(factura) {
  const to2 = (n) => parseFloat((parseFloat(n || 0)).toFixed(2))
  const upper = (v) => (v ?? '').toString().trim().toUpperCase()

  // Detalle. Si el item viene del inventario tiene su propio SKU. Si fue
  // escrito a mano (sin seleccionar de inventario) usa 'MO1' como fallback;
  // el usuario debe asegurarse de tener un producto con SKU 'MO1' en Cuentti
  // (o seleccionar siempre los productos del inventario al crear la OT).
  // Base con precisión ALTA (6 decimales), NO 2. Redondear la base a 2 y luego
  // re-multiplicar por (1+IVA) desviaba el total del número redondo que cobra el
  // usuario (ej. $148.000 con IVA 19% → base 124369.75 → 124369.75×1.19 = 147.999,90).
  // Con la base a 6 decimales, base×(1+IVA) reproduce el total redondo exacto.
  const to6 = (n) => Math.round((parseFloat(n || 0)) * 1e6) / 1e6
  const items = (factura.items || []).map(item => {
    const cantidad = parseFloat(item.cantidad) || 1
    const precioConIva = parseFloat(item.precio) || 0
    const impuesto = parseFloat(item.iva) || 19
    const precioBase = to6(precioConIva / (1 + impuesto / 100))
    // El total de la línea es EXACTAMENTE lo que cobras (precio con IVA × cantidad),
    // no se re-deriva de la base redondeada.
    const total = to2(precioConIva * cantidad)
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
    es_servicio: producto.esServicio ? 1 : 0,
    id_marca: producto.idMarca || 1,
    id_categoria: producto.idCategoria || 1,
    sku: producto.sku || '',
    es_activo: 1,
    codigo_barras: producto.codigoBarras || '',
    nota: producto.nota || '',
    id_empleado: parseInt(CONFIG.employeeId),
    id_impuesto: producto.idImpuesto || 5,
    existencias: producto.esServicio ? 0 : (parseFloat(producto.existencias) >= 0 ? parseFloat(producto.existencias) : 0),
  }
  return cuenttiRequest(
    '/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/grabraProductoMovil',
    'POST',
    body,
  )
}

export { CONFIG as cuenttiConfig }
