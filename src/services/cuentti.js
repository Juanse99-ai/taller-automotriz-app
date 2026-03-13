// Configuracion de Cuentti
const CONFIG = {
  baseUrl: '/api/cuentti',
  token: 'MTE0NjR8MTE0NjR8OTAxNTcyMjI1fDB8ZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnpkV0lpT2lJeE1UUTJOQzB5TURJek1EQTVOREF3TUROak5Ea3laRGMwWlMwMU4yRmpMVFJrTVRrdE9HUm1OeTAxTkdSaU9EYzVaVGxtWlRGOE9UQXhOVGN5TWpJMUlpd2lhV0YwSWpveE56WXpOak0zTkRBNExDSmxlSEFpT241MWJHeDkucVpXbEI2SzFxNm1qZUU1dk1GaFFCd0NKcmxjUUVEWllxNkpXd0J0ZkRIdw==',
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
    },
  },
}

// Request generico al proxy de Cuentti
async function cuenttiRequest(endpoint, method = 'GET', body = null) {
  const url = `${CONFIG.baseUrl}?path=${encodeURIComponent(endpoint)}`
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CONFIG.token}`,
    'x-api-key': CONFIG.token,
    'token': CONFIG.token,
    'X-Auth-Token-id-usuario': CONFIG.employeeId,
    'x-id-empleado': CONFIG.employeeId,
    'x-auth-token-empresa': CONFIG.companyId,
    'x-id-sucursal': CONFIG.branchId,
    'x-gtm': CONFIG.gtm,
  }

  const opts = { method, headers }
  if (body) opts.body = JSON.stringify({ ...body, id_usuario: parseInt(CONFIG.employeeId) })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG.timeout)

  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`Cuentti ${res.status}`)
    const text = await res.text()
    try { return JSON.parse(text) } catch { return text }
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

// ---------- CLIENTES ----------

export async function buscarClientePorCedula(cedula) {
  if (!cedula) return null
  try {
    const path = CONFIG.paths.clientes.consultarPorId.replace('{identificacion}', encodeURIComponent(cedula.trim()))
    const data = await cuenttiRequest(path)
    const items = Array.isArray(data) ? data : (data?.data ? data.data : data ? [data] : [])
    const filtered = items.filter(r => r && Object.keys(r).length > 0)
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

// ---------- INVENTARIO ----------

export async function cargarInventario(pagina = 0) {
  try {
    const path = CONFIG.paths.productos.paginadaMovil
      .replace('{id_sucursal}', CONFIG.branchId)
      .replace('{pagina}', pagina.toString())
    const data = await cuenttiRequest(path)
    const items = Array.isArray(data) ? data : (data?.data || [])
    return items.map(p => {
      const precioSinIva = parseFloat(p.price || p.precio || p.precio_venta || 0)
      const iva = parseFloat(p.tax || p.iva || p.valor_impuesto || 19)
      return {
        id: p.id || p.id_producto || p.idProductoSucursal,
        codigo: p.sku || p.codigo_barras || p.code || p.codigo || `PROD-${p.id_producto}`,
        nombre: p.name || p.nombre || p.description || 'Sin nombre',
        categoria: p.category || p.categoria || 'General',
        precio: precioSinIva * (1 + iva / 100), // Precio con IVA incluido
        precioBase: precioSinIva,
        stock: parseInt(p.stock || p.quantity || p.existencias || 0),
        iva,
      }
    })
  } catch (e) {
    console.warn('Cuentti cargarInventario:', e.message)
    return []
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

export async function enviarFactura(factura) {
  const items = (factura.items || []).map(item => {
    const cantidad = parseFloat(item.cantidad) || 1
    const precioConIva = parseFloat(item.precio) || 0
    const impuesto = parseFloat(item.iva) || 19
    const precioBase = Math.round((precioConIva / (1 + impuesto / 100)) * 100) / 100
    return {
      sku: item.codigo || 'MO1',
      descripcion: item.nombre || 'Servicio Taller',
      precio_venta: precioBase,
      cantidad,
      impuesto,
      total: Math.round(precioConIva * cantidad * 100) / 100,
      descuentoPor: 0,
      descuento_valor: 0,
    }
  })

  const totalNeto = items.reduce((s, i) => s + i.total, 0)
  const totalImp = items.reduce((s, i) => {
    const base = i.precio_venta * i.cantidad
    return s + (i.total - base)
  }, 0)

  const body = {
    tipoDocumento: 1,
    id_cliente: parseInt(factura.clienteId) || 1,
    id_sucursal: 1, id_bodega: 1, id_punto: 1,
    id_consecutivo: factura.resolucion === 'FEIC' ? 2 : 4,
    id_documento: null, id_vendedor: 1, id_empleado: 1,
    nota: factura.observaciones || '',
    total_neto: Math.round(totalNeto * 100) / 100,
    total_impuestos: Math.round(totalImp * 100) / 100,
    total_sin_impuestos: Math.round((totalNeto - totalImp) * 100) / 100,
    objClienteMini: {
      id_cliente: parseInt(factura.clienteId) || 1,
      nombre_cliente: factura.cliente || 'CONSUMIDOR FINAL',
      identificacion: factura.cedula || '222222222222',
    },
    objDetalle: items,
    lstPagos: [{
      id_medio_pago: 1, id_banco: 1,
      valor: Math.round(totalNeto * 100) / 100,
      boucher: '', digitos: '', devuelta: 0,
      dinero_entregado: Math.round(totalNeto * 100) / 100,
      nota: '', fecha_registro: Date.now(),
    }],
  }

  return cuenttiRequest(CONFIG.paths.facturas.grabarSimple, 'POST', body)
}

export { CONFIG as cuenttiConfig }
