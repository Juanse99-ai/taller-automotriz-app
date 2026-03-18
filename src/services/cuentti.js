import { RESOLUCIONES } from '../utils/constants'

// Configuracion de Cuentti
const CONFIG = {
  baseUrl: '/api/cuentti',
  token: 'MTE0NjR8MTE0NjR8OTAxNTcyMjI1fDB8ZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnpkV0lpT2lJeE1UUTJOQzB5TURJek1EQTVOREF3TUROak5Ea3laRGMwWlMwMU4yRmpMVFJrTVRrdE9HUm1OeTAxTkdSaU9EYzVaVGxtWlRGOE9UQXhOVGN5TWpJMUlpd2lhV0YwSWpveE56Y3pPREUwTXpBekxDSmxlSEFpT251MWJHeDkuYTRzWE1zR0JMczk0RkljRk1IZzZuRUY2Rl84V2tqTW9IN25scUVpclIzUQ==',
  companyId: '11464',
  branchId: '1',
  employeeId: '1',
  gtm: 'GMT-0500',
  timeout: 10000,
  paths: {
    clientes: {
      consultarPorId: '/jServerj4ErpPro/api/token/consultarClienteIdentificacion/{identificacion}',
      grabar: '/jServerj4ErpPro/com/j4ErpPro/server/adm/cliente/grabarCliente',
    },
    productos: {
      paginadaMovil: '/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/consultaProductoPaginadaMovil/{id_sucursal}/{pagina}',
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
  const company = (CONFIG.companyId ?? '').toString()
  const branch = (CONFIG.branchId ?? '1').toString()
  const gtm = CONFIG.gtm || 'GMT-0500'
  const tok = CONFIG.token || ''
  const tokenValue = maskToken && tok.length > 10
    ? `${tok.slice(0, 6)}...${tok.slice(-4)}`
    : tok

  return {
    'Content-Type': 'application/json',
    'token': tokenValue,
    'x-auth-token-api': tokenValue,
    'X-Auth-Token-id-usuario': emp,
    'X-Auth-Token-usuario': emp,
    'x-id-empleado': emp,
    'x-auth-token-empresa': company || '11464',
    'x-id-sucursal': branch,
    'x-gtm': gtm,
    'usuario': emp,
  }
}

// Request generico al proxy de Cuentti
async function cuenttiRequest(endpoint, method = 'GET', body = null) {
  const url = `${CONFIG.baseUrl}?path=${encodeURIComponent(endpoint)}`
  const empId = parseInt(CONFIG.employeeId ?? '1', 10) || 1
  const headers = buildHeaders()

  const opts = { method, headers }
  if (body) opts.body = JSON.stringify({ ...body, id_usuario: empId })

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

    // Construir nombre: usar nombre_cliente, o concatenar primer_nombre + primer_apellido
    const nombreCompleto = c.nombre_cliente
      || c.name || c.nombre || c.full_name || c.razon_social || c.tercero
      || [c.primer_nombre, c.segundo_nombre, c.primer_apellido].filter(Boolean).join(' ')
      || ''

    return {
      id: c.id_cliente || c.id || c.customer_id,
      cedula: c.identificacion || c.document || c.documento || c.cedula || cedula,
      nombre: nombreCompleto,
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

export async function grabarCliente(clienteData) {
  const { cedula, nombre, telefono, email, direccion, ciudad, cuenttiId, _raw } = clienteData || {}

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
    regimenImpuesto: 2,
    codigo_turismo: null,
    fecha_vencimiento_codigo_turismo: null,
    legalidad: 29,
    cliente_predeterminado: '0',
    tipoOperacion: null,
    medio_pago: null,
    id_sucursal: null,
    nombre_cliente: nombre || '',
    id_tipo_persona: '1',
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
    regimen: 2,
    id_tipo_identificacion: '3',
    id_empleado: parseInt(CONFIG.employeeId),
  }

  return cuenttiRequest(CONFIG.paths.clientes.grabar, 'POST', body)
}

// ---------- INVENTARIO ----------

export async function cargarInventario(pagina = 0) {
  try {
    const path = CONFIG.paths.productos.paginadaMovil
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
  return todos
}

// ---------- FACTURACION ----------

export function buildFacturaPayload(factura) {
  // Detalle
  const items = (factura.items || []).map(item => {
    const cantidad = parseFloat(item.cantidad) || 1
    const precioConIva = parseFloat(item.precio) || 0
    const impuesto = parseFloat(item.iva) || 19
    const precioBase = parseFloat((precioConIva / (1 + impuesto / 100)).toFixed(2))
    const total = parseFloat((precioBase * cantidad * (1 + impuesto / 100)).toFixed(2))
    return {
      sku: item.codigo || 'MO1',
      descripcion: item.nombre || 'Servicio Taller',
      precio_venta: precioBase,
      cantidad: parseInt(cantidad),
      impuesto: parseInt(impuesto),
      total,
      descuentoPor: 0,
      descuento_valor: 0,
    }
  })

  const totalNeto = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100
  const totalSinImp = Math.round(items.reduce((s, i) => s + (i.precio_venta * i.cantidad), 0) * 100) / 100
  const totalImp = Math.round((totalNeto - totalSinImp) * 100) / 100

  const empId = parseInt(CONFIG.employeeId) || 1
  const branchId = parseInt(CONFIG.branchId) || 1
  const consecutivo = factura.resolucion === 'FEIC'
    ? (RESOLUCIONES.FEIC?.id || 2)
    : (RESOLUCIONES.MAS?.id || 4)

  const tipoDoc = factura.tipoDocumento || 1 // 1=factura, 9=remision, 2=plan separe

  const clienteId = parseInt(factura.clienteId || factura.cuenttiId || 0)
  const idCliente = Number.isFinite(clienteId) && clienteId > 0 ? clienteId : 0

  return {
    tipoDocumento: tipoDoc,
    id_sucursal: branchId,
    id_bodega: branchId,
    id_consecutivo: consecutivo,
    id_documento: 0,
    id_vendedor: empId,
    id_empleado: empId,
    nota: factura.observaciones || '',
    total_neto: parseFloat(totalNeto.toFixed(2)),
    total_impuestos: parseFloat(totalImp.toFixed(2)),
    total_sin_impuestos: parseFloat(totalSinImp.toFixed(2)),
    observacion: '',
    objClienteMini: {
      id_cliente: idCliente,
      nombre_cliente: factura.cliente || 'CONSUMIDOR FINAL',
      identificacion: factura.cedula || '222222222222',
      telefono1: factura.telefonoCliente || '',
      telefono2: '',
      email1: factura.emailCliente || '',
      direccion: factura.direccionCliente || 'N/A',
      id_tipo_persona: 1,
      es_cliente: 1,
      es_proveedor: 0,
      departamento: factura.departamento || 'ATLANTICO',
      pais: 'Colombia',
      ciudad: factura.ciudad || 'BARRANQUILLA',
      zona: '',
    },
    objDetalle: items,
    lstPagos: factura.aCredito ? [] : [{
      id_medio_pago: factura.idMedioPago || 1,
      id_banco: factura.idBanco || 1,
      valor: parseFloat(totalNeto.toFixed(2)),
      boucher: '',
      digitos: '',
      devuelta: 0,
      dinero_entregado: 0,
      nota: '',
      fecha_registro: new Date().toISOString(),
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
    id_banco: pago.idBanco || 2,
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
