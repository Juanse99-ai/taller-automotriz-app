// =====================================================================
// Motor de GASTOS (egresos) de Cuentti — compartido por:
//   - api/cuentti-gasto.js  (gasto de nomina desde la app)
//   - api/mcp/cuentti.js    (tool registrar_gasto para Claude/Cowork)
//
// Un "gasto" es un egreso (tipoDocumento 7) que NO toca inventario: en vez de
// un producto real, la linea lleva id_producto:0 + id_plan_cuentas:<cuenta>.
// Sirve para nomina, servicios comprados a terceros, arriendo, comisiones, etc.
//
// OJO: este endpoint es de SESION — necesita login con CUENTTI_USER/CUENTTI_PASS
// (no sirve el CUENTTI_TOKEN de la API). Por eso vive aparte del resto del MCP.
// Ver memoria reference_cuentti_gasto_nomina.
// =====================================================================

const BASE = 'https://app.cuenti.com/jServerj4ErpPro'
const EMPRESA = '11464'

// Cuenta por defecto: "Nomina" (comportamiento historico de la app).
export const ID_CUENTA_NOMINA = 43

// Tipo de persona en Cuentti. VERIFICADO contra el registro real de SERVICAR JB
// AUTOMOTRIZ SAS (id_cliente 929): id_tipo_persona = 2. Antes esto iba
// hardcodeado en 1 y creo la empresa como persona natural.
// Ojo: id_tipo_identificacion NO es el campo que manda — en el registro bueno
// viene en null. El que define si es empresa o persona es este.
export const TIPO_PERSONA_NATURAL = 1
export const TIPO_PERSONA_JURIDICA = 2

// Deduce si es empresa o persona. Dos señales, cualquiera basta:
//   - NIT de empresa: en Colombia empieza por 8 o 9 y tiene 9 digitos (+DV).
//     Las cedulas no caen ahi: las de 10 digitos empiezan por 1, y las viejas
//     tienen 8 o menos.
//   - Razon social terminada en SAS / LTDA / S.A. / E.U. ...
// Es una heuristica, asi que quien llama puede forzarla con tipoPersona y el
// dry-run siempre muestra que se dedujo, para que un humano lo pueda corregir.
export function inferirTipoPersona(identificacion, nombre = '') {
  const num = String(identificacion || '').replace(/\D/g, '')
  const esNitEmpresa = /^[89]\d{8,9}$/.test(num)
  const esRazonSocial = /\b(s\.?a\.?s|ltda|limitada|s\.?a|e\.?u|s\.?c\.?a|s\.?e\.?n\.?c)\.?\s*$/i.test(String(nombre || '').trim())
  return (esNitEmpresa || esRazonSocial) ? TIPO_PERSONA_JURIDICA : TIPO_PERSONA_NATURAL
}

// Cache del token en la instancia (sirve mientras la funcion este "caliente").
let cachedToken = null
let cachedIdUsuario = null
let cachedAt = 0
const TOKEN_TTL = 20 * 60 * 1000 // 20 min

export async function login() {
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

// Desglosa un total que YA trae el IVA incluido.
//   iva = 0  → base = total, impuestos = 0  (identico al payload historico de nomina)
export function desglosarIva(monto, iva = 0) {
  const total = Math.round(parseFloat(monto) || 0)
  const pct = parseFloat(iva) || 0
  const base = pct > 0 ? Math.round(total / (1 + pct / 100)) : total
  return { total, base, impuestos: total - base, pct }
}

// Id del impuesto en Cuentti (mismo catalogo que usa crear_producto):
//   5 = IVA 19% (lo normal aca) · 1 = IVA 16% · 4 = exento
export const ID_IVA_19 = 5

// opts: { proveedorId, proveedorCedula, proveedorNombre, monto (CON IVA), iva,
//         idImpuesto, idPlanCuentas, descripcion, nota, idMedioPago, idBanco, fecha }
export function buildGasto(opts = {}) {
  const {
    proveedorId, proveedorCedula, proveedorNombre, monto, iva = 0, idImpuesto,
    idPlanCuentas = ID_CUENTA_NOMINA, descripcion, nota, idMedioPago, idBanco, fecha,
    tipoPersona,
  } = opts
  // Sin tipoPersona explicito se deduce del NIT/nombre (antes: siempre natural).
  const idTipoPersona = parseInt(tipoPersona, 10) || inferirTipoPersona(proveedorCedula, proveedorNombre)
  const { total, base, impuestos, pct } = desglosarIva(monto, iva)
  // Con IVA (>0) va el id del impuesto (5 = 19%). Sin IVA se conserva el 1 del
  // payload historico de nomina, que esta probado y no debe cambiar.
  const tipoImp = pct > 0 ? (parseInt(idImpuesto, 10) || ID_IVA_19) : 1
  const iso = fecha ? new Date(`${fecha}T12:00:00`).toISOString() : new Date().toISOString()
  const rand5 = Math.random().toString(36).slice(2, 7)
  const cu = `${EMPRESA}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
  const desc = descripcion || nota || 'Gasto'
  return {
    tipoDocumento: 7, id_sucursal: 1, id_bodega: 1, id_canal: 1, id_centro_costo: 1,
    id_cliente: proveedorId ?? -1, id_empleado: 2, id_vendedor: 2, id_consecutivo: null, id_documento: null,
    es_ingreso: 0, es_factura: 0, compraRemision: 0, esConectado: true, editar_transacion: false,
    descuento: 0, descuento_global: 0, domicilio: 0, propina: 0, anticipos: [], retenciones: [],
    empresa: 'Multidiagnosticos AS SAS', correoEnvia: 'multidiagnosticosas@gmail.com', nota: nota || '', nFactura: '',
    codigo_unico: cu, codigo_unico_volatil: cu, codeUnicoQr: `${EMPRESA}-7-2-${rand5}`,
    fecha_registro: iso, fecha_inicial: iso, fecha_final: iso, fecha_vencimiento: iso,
    total_neto: total, total_sin_impuestos: base, total_impuestos: impuestos, total_estampilla: 0, total_impoconsumo: 0,
    json: JSON.stringify({ lstImpuestos: [{ breve: 'G', impuestosPor: pct, base, valor: impuestos, total, tipo_impuesto: tipoImp }] }),
    objClienteMini: { nombre_cliente: proveedorNombre || '', identificacion: String(proveedorCedula), es_proveedor: 1, es_cliente: 0, id_tipo_persona: idTipoPersona, telefono1: '', telefono2: '', direccion: '', email1: '', medio_pago: null },
    objTransacionDetalle: [{
      id_producto: 0, id_plan_cuentas: parseInt(idPlanCuentas, 10) || ID_CUENTA_NOMINA,
      descripcion: desc, cantidad: 1, precio_venta: base, precio_real: base, total,
      impuesto: pct, tipo_impuesto: tipoImp, editoPrecioManul: true, es_devolucion: 0, es_promocion: 0,
      descuentoPor: 0, descuento_valor: 0, id_centro_costo: 0, id_lista_precio: 0, total_estampilla: 0, total_impoconsumo: 0,
    }],
    lstPagos: [{ id_medio_pago: idMedioPago || 1, id_banco: idBanco || 1, valor: total, nota: '', boucher: '', digitos: '', devuelta: 0 }],
  }
}

// Hace login, arma el gasto y lo graba. Devuelve { ok, idTransacion, numeroDoc } o { ok:false, cuentti }.
export async function enviarGasto(opts = {}) {
  const { token, idUsuario } = await login()
  const doc = buildGasto(opts)

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
  if (!ok) return { ok: false, cuentti: parsed }

  // retorno tipo ";0;<idCliente>;<idTransacion>;<numeroDoc>;..."
  const partes = (parsed[0].retorno || '').split(';')
  return { ok: true, idTransacion: partes[3] || null, numeroDoc: partes[4] || null }
}
