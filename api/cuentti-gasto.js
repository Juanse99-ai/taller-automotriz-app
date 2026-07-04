// Backend: registra un GASTO DE NÓMINA en Cuentti.
// Hace login (validar_usuario_base → validar_usuario_erp) con las credenciales de
// entorno para obtener el token de sesión, y graba el gasto contra la cuenta de
// egreso "Nomina" (id_plan_cuentas 43). El x-auth-token-api NO se valida (cualquier
// valor sirve). Ver memoria reference_cuentti_gasto_nomina.
//
// Requiere en Vercel (Sensitive): CUENTTI_USER (email) y CUENTTI_PASS (clave).

const BASE = 'https://app.cuenti.com/jServerj4ErpPro'
const EMPRESA = '11464'
// v1 — login base→erp + grabar gasto nómina (cuenta 43)

const ALLOWED_ORIGINS = [
  'https://taller-multias.vercel.app',
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

// Cache del token en la instancia (sirve mientras la función esté "caliente").
let cachedToken = null
let cachedIdUsuario = null
let cachedAt = 0
const TOKEN_TTL = 20 * 60 * 1000 // 20 min

async function login() {
  const now = Date.now()
  if (cachedToken && (now - cachedAt) < TOKEN_TTL) {
    return { token: cachedToken, idUsuario: cachedIdUsuario }
  }
  const user = process.env.CUENTTI_USER
  const pass = process.env.CUENTTI_PASS
  if (!user || !pass) throw new Error('Faltan CUENTTI_USER / CUENTTI_PASS en el servidor')

  // Paso 1: validar_usuario_base
  const r1 = await fetch(`${BASE}/j4pro/seguridad/validar_usuario_base`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token-empresa': EMPRESA, 'X-Auth-Token-es-base': '1' },
    body: JSON.stringify({ usuario_empresa: user, password: pass, idEmpresa: parseInt(EMPRESA, 10), pais: '57' }),
  })
  const d1 = await r1.json().catch(() => null)
  if (!d1 || d1.type !== 1) throw new Error('Login base falló (¿usuario/clave?): ' + JSON.stringify(d1).slice(0, 200))
  const sesion = JSON.parse(d1.retorno)
  const idUsuario = sesion.id_usuario

  // Paso 2: validar_usuario_erp → token final
  const r2 = await fetch(`${BASE}/j4pro/seguridad/validar_usuario_erp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token-empresa': EMPRESA,
      'X-Auth-Token-id-usuario': String(idUsuario),
      'X-Auth-Token-usuario': String(idUsuario),
    },
    body: JSON.stringify({ token: sesion.token, idEmpresa: parseInt(EMPRESA, 10), usuario_empresa: idUsuario, es_contador: 0 }),
  })
  const d2 = await r2.json().catch(() => null)
  const token = d2?.token || sesion.token
  if (!token) throw new Error('Login erp no devolvió token')

  cachedToken = token; cachedIdUsuario = idUsuario; cachedAt = now
  return { token, idUsuario }
}

function buildGasto({ proveedorId, proveedorCedula, proveedorNombre, monto, idMedioPago, nota }) {
  const valor = Math.round(parseFloat(monto) || 0)
  const iso = new Date().toISOString()
  const rand5 = Math.random().toString(36).slice(2, 7)
  const cu = `${EMPRESA}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
  return {
    tipoDocumento: 7, id_sucursal: 1, id_bodega: 1, id_canal: 1, id_centro_costo: 1,
    id_cliente: proveedorId ?? -1, id_empleado: 2, id_vendedor: 2, id_consecutivo: null, id_documento: null,
    es_ingreso: 0, es_factura: 0, compraRemision: 0, esConectado: true, editar_transacion: false,
    descuento: 0, descuento_global: 0, domicilio: 0, propina: 0, anticipos: [], retenciones: [],
    empresa: 'Multidiagnosticos AS SAS', correoEnvia: 'multidiagnosticosas@gmail.com', nota: nota || '', nFactura: '',
    codigo_unico: cu, codigo_unico_volatil: cu, codeUnicoQr: `${EMPRESA}-7-2-${rand5}`,
    fecha_registro: iso, fecha_inicial: iso, fecha_final: iso, fecha_vencimiento: iso,
    total_neto: valor, total_sin_impuestos: valor, total_impuestos: 0, total_estampilla: 0, total_impoconsumo: 0,
    json: JSON.stringify({ lstImpuestos: [{ breve: 'G', impuestosPor: 0, base: valor, valor: 0, total: valor, tipo_impuesto: 1 }] }),
    objClienteMini: { nombre_cliente: proveedorNombre || '', identificacion: String(proveedorCedula), es_proveedor: 1, es_cliente: 0, id_tipo_persona: 1, telefono1: '', telefono2: '', direccion: '', email1: '', medio_pago: null },
    objTransacionDetalle: [{ id_producto: 0, id_plan_cuentas: 43, descripcion: nota || 'Nomina', cantidad: 1, precio_venta: valor, precio_real: valor, total: valor, impuesto: 0, tipo_impuesto: 1, editoPrecioManul: true, es_devolucion: 0, es_promocion: 0, descuentoPor: 0, descuento_valor: 0, id_centro_costo: 0, id_lista_precio: 0, total_estampilla: 0, total_impoconsumo: 0 }],
    lstPagos: [{ id_medio_pago: idMedioPago || 1, valor, nota: '', boucher: '', digitos: '', devuelta: 0 }],
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1])
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  // Modo prueba: GET → solo hace login y confirma que consiguió el token (NO graba gasto).
  if (req.method === 'GET') {
    try {
      const { token, idUsuario } = await login()
      res.status(200).json({ ok: true, login: 'OK', hasToken: !!token, tokenPrefix: (token || '').slice(0, 10), idUsuario })
    } catch (e) {
      res.status(500).json({ ok: false, login: 'FALLO', error: e.message })
    }
    return
  }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Solo POST' }); return }

  try {
    const { proveedorCedula, monto } = req.body || {}
    if (!proveedorCedula || !monto) { res.status(400).json({ ok: false, error: 'Falta proveedorCedula o monto' }); return }

    const { token, idUsuario } = await login()
    const doc = buildGasto(req.body)

    const r = await fetch(`${BASE}/com/j4ErpPro/server/transacion/grabardocumentosTransacion_desconectado`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token,
        'x-auth-token-api': `${Date.now()}-1-0-cuentti`, // no se valida; solo debe existir
        'x-auth-token-empresa': EMPRESA,
        'x-auth-token-es-online': '1',
        'x-auth-token-id-usuario': String(idUsuario ?? 17125),
        'x-auth-token-usuario': String(idUsuario ?? 17125),
        'x-gtm': 'GMT-0500',
        'x-id-empleado': '2',
      },
      body: JSON.stringify([doc]),
    })
    const text = await r.text()
    let parsed; try { parsed = JSON.parse(text) } catch { parsed = text }

    const ok = Array.isArray(parsed) && parsed[0]?.message === 'save'
    if (!ok) { res.status(502).json({ ok: false, cuentti: parsed }); return }

    // retorno tipo ";0;<idCliente>;<idTransacion>;<numeroDoc>;..."
    const partes = (parsed[0].retorno || '').split(';')
    res.status(200).json({ ok: true, idTransacion: partes[3] || null, numeroDoc: partes[4] || null })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}

export const config = { runtime: 'nodejs' }
