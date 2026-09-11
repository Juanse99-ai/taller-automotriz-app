// Todo lo que el servidor le pregunta o le manda a Cuentti sobre PAGOS, en un
// solo sitio. Lo usan api/supabase.js (el portal y la sincronizacion de la
// cartera) y api/cuentti.js (el abono que se registra desde la app).

import { SUPABASE_URL, SUPABASE_HEAD } from './supabase.js'

const EMPRESA = process.env.CUENTTI_COMPANY_ID || '11464'
const SUCURSAL = process.env.CUENTTI_BRANCH_ID || '1'
// 2 = el cajero con la caja abierta: un recibo a nombre de otro empleado no
// sale en el cierre de caja (verificado con el recibo manual que si entra).
const EMPLEADO = process.env.CUENTTI_EMPLOYEE_ID || '2'
const URL_AGREGAR_PAGO = 'https://app.cuenti.com/jServerj4ErpPro/com/j4ErpPro/server/transacion/agregarPagoTransacion'

// Cabeceras para app.cuenti.com con la llave del negocio. El token vive solo
// en el servidor; el navegador nunca lo ve.
function cabecerasCuentti() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.CUENTTI_TOKEN}`,
    'x-auth-token-empresa': EMPRESA,
    'x-id-sucursal': SUCURSAL,
    'x-id-empleado': EMPLEADO,
    'X-Auth-Token-id-usuario': EMPLEADO,
    'X-Auth-Token-usuario': EMPLEADO,
    'x-gtm': process.env.CUENTTI_GTM || 'GMT-0500',
    usuario: EMPLEADO,
  }
}

// Cuentti responde sus errores con HTTP 200. Mismo criterio conservador que
// errorDeCuentti en src/services/cuentti.js: solo lo inequivocamente rechazado.
function errorDeCuentti(data) {
  if (data == null) return null
  if (typeof data === 'string') {
    const t = data.trim()
    if (t && /\b(error|no se pudo|invalid|denied|fail(ed)?|excepcion|exception)\b/i.test(t)) return t.slice(0, 200)
    return null
  }
  if (typeof data === 'object' && data.type === 0) return data.message || 'Cuentti rechazo la operacion'
  return null
}

const pesos = (n) => '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))
const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())

// ---- Pagos: los recibos de Cuentti bajan a la tabla `pagos` ----
// Cuentti es donde se cobra de verdad (mostrador, transferencias). Hasta ahora
// la app solo se enteraba del TOTAL abonado y lo usaba para marcar pagado; los
// abonos parciales no quedaban en ninguna parte. Cada recibo de caja de la
// factura (seccion ComprobanteCaja) se copia UNA vez a `pagos` con su numero de
// recibo como cuentti_ref: sincronizar dos veces no duplica. Los abonos que se
// registren a mano en la app conviven en la misma tabla.
export function medioDesdeCuentti(nombre) {
  const n = String(nombre || '').toLowerCase()
  if (n.includes('efectivo')) return 'efectivo'
  if (n.includes('transfer') || n.includes('consigna')) return 'transferencia'
  if (n.includes('wompi')) return 'wompi'
  return 'otro'
}
// DateKey_hora viene como 20260908120000 (hora del taller); fecha_registro en ms.
export function fechaDesdeCuentti(r) {
  const k = String(r?.DateKey_hora || r?.DateKey || '')
  if (/^\d{8}/.test(k)) return `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`
  if (r?.fecha_registro) return new Date(Number(r.fecha_registro)).toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}
export async function consultarCuentti(tx) {
  // Este endpoint del portal de Cuentti no pide token: basta la empresa.
  const url = `https://transaciones.cuenti.com/jServerj4ErpPro/com/j4ErpPro/server/transacion/consultarTransacionIdExterno/${encodeURIComponent(tx)}`
  const d = await fetch(url, { headers: { 'X-Auth-Token-empresa': '11464' } }).then(r => r.json())
  const seccion = (n) => ((Array.isArray(d) ? d : []).find(x => x.consulta === n) || {}).resultado || []
  return {
    enc: seccion('Encabezados')[0] || null,
    recibos: seccion('ComprobanteCaja').filter(r => r && r.es_activo !== 0 && Number(r.valor) > 0),
  }
}
// Baja a `pagos` los recibos de UNA orden y devuelve lo que dice Cuentti:
// { pendiente, abonado, nuevos }. null si Cuentti no contesto (nunca se asume
// nada). Si la tabla `pagos` aun no existe, solo se pierde la copia: el resto
// (marcar pagado) sigue funcionando como siempre.
export async function bajarPagosCuentti(t) {
  const tx = String(t.cuentti_id_transacion || '').trim()
  if (!tx) return null
  const { enc, recibos } = await consultarCuentti(tx)
  if (!enc) return null
  const pendiente = Math.round(Number(enc.total_deuda || 0) - Number(enc.total_abono || 0))
  const abonado = Math.round(Number(enc.total_abono || 0))
  let nuevos = 0
  if (recibos.length) {
    const refs = recibos.map(r => `cuentti:${r.id_comprobante_caja}`)
    const ya = await fetch(`${SUPABASE_URL}/rest/v1/pagos?select=cuentti_ref&trabajo_id=eq.${encodeURIComponent(t.id)}&cuentti_ref=in.(${refs.map(encodeURIComponent).join(',')})`,
      { headers: SUPABASE_HEAD }).then(r => (r.ok ? r.json() : [])).catch(() => [])
    const tengo = new Set((Array.isArray(ya) ? ya : []).map(x => x.cuentti_ref))
    const filas = recibos
      .filter(r => !tengo.has(`cuentti:${r.id_comprobante_caja}`))
      .map(r => ({
        trabajo_id: t.id,
        fecha: fechaDesdeCuentti(r),
        monto: Math.round(Number(r.valor)),
        metodo: medioDesdeCuentti(r.nombre_medio_pago),
        origen: 'cuentti',
        cuentti_ref: `cuentti:${r.id_comprobante_caja}`,
        nota: `Recibo ${r.n_caja || r.id_comprobante_caja} de Cuentti${r.nombre_banco ? ` · ${r.nombre_banco}` : ''}`,
      }))
    if (filas.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/pagos`, {
        method: 'POST',
        headers: { ...SUPABASE_HEAD, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(filas),
      }).catch(() => null)
      if (r && r.ok) nuevos = filas.length
    }
  }
  return { pendiente, abonado, nuevos }
}
export async function marcarPagada(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/trabajos?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEAD, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ pagado: true }),
  })
}
// De a 5 a la vez: Cuentti tarda ~medio segundo por factura y la cartera tiene
// decenas; en serie se pasaba del tiempo de espera del navegador.
export async function sincronizarConCuentti(rows) {
  const marcados = [], saldos = {}, abonos = {}
  let nuevos = 0, revisadas = 0
  const lista = Array.isArray(rows) ? rows : []
  for (let i = 0; i < lista.length; i += 5) {
    await Promise.all(lista.slice(i, i + 5).map(async (t) => {
      try {
        const r = await bajarPagosCuentti(t)
        if (!r) return // sin datos: se deja como estaba (nunca se asume pagado)
        revisadas++
        saldos[t.id] = r.pendiente
        abonos[t.id] = r.abonado
        nuevos += r.nuevos
        if (r.pendiente <= 1) { // <=1 por el redondeo de centavos de Cuentti
          await marcarPagada(t.id)
          marcados.push(t.id)
        }
      } catch { /* Cuentti caido o lento: se deja como esta */ }
    }))
  }
  return { marcados, saldos, abonos, nuevos, revisadas }
}

// Medios con los que la app registra un abono en Cuentti. Ids verificados:
// medio 1 = efectivo, 7 = transferencia; banco 1 = Caja General (entra al
// cierre de caja), 2 = Bancolombia, 3 = Nequi.
export const MEDIOS_ABONO = {
  efectivo: { id_medio_pago: 1, id_banco: 1 },
  transferencia: { id_medio_pago: 7, id_banco: 2 },
  nequi: { id_medio_pago: 7, id_banco: 3 },
}

// Registra UN abono en la factura de Cuentti de la orden y lo baja a `pagos`.
//
// Cuentti es la fuente de verdad del cobro: el abono se crea ALLA (recibo de
// caja contra la factura, a nombre del cliente de la factura) y la app lo trae
// de vuelta con bajarPagosCuentti, igual que un abono hecho en el mostrador.
// Asi nunca hay dos cifras distintas para la misma deuda.
//
// `clave` identifica ESTE abono y viaja en la nota del recibo. Si la respuesta
// se pierde y el navegador reintenta con la misma clave, aqui se encuentra el
// recibo en Cuentti y no se registra dos veces. Cuentti conserva la nota de los
// recibos que crea la app (comprobado: "OT OT-0165" y parecidas).
//
// Devuelve { status, body } para que el handler solo tenga que responder.
export async function registrarAbonoEnCuentti({ trabajoId, monto, fecha, metodo, nota = '', clave }) {
  const valor = Math.round(Number(monto) || 0)
  if (valor <= 0) return { status: 400, body: { ok: false, error: 'El abono debe ser mayor a 0' } }
  const medio = MEDIOS_ABONO[metodo]
  if (!medio) return { status: 400, body: { ok: false, error: 'Método de pago no válido para Cuentti' } }
  const idem = String(clave || '').replace(/[^\w-]/g, '').slice(0, 40)
  if (idem.length < 8) return { status: 400, body: { ok: false, error: 'Falta la clave del abono' } }
  if (!process.env.CUENTTI_TOKEN) return { status: 500, body: { ok: false, error: 'Cuentti no está configurado en el servidor' } }
  const hoy = hoyBogota()
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) && fecha <= hoy ? fecha : hoy

  const [t] = await fetch(`${SUPABASE_URL}/rest/v1/trabajos?id=eq.${encodeURIComponent(trabajoId)}&deleted=not.is.true&select=id,ot_codigo,total,pagado,cuentti_id_transacion&limit=1`,
    { headers: SUPABASE_HEAD }).then(r => (r.ok ? r.json() : [])).catch(() => [])
  if (!t) return { status: 404, body: { ok: false, error: 'No existe esa orden' } }
  const tx = String(t.cuentti_id_transacion || '').trim()
  if (!tx || tx === 'SIN-FACTURA') return { status: 400, body: { ok: false, error: 'Esta orden no tiene factura en Cuentti' } }

  const antes = await consultarCuentti(tx).catch(() => ({ enc: null, recibos: [] }))
  if (!antes.enc) return { status: 502, body: { ok: false, error: 'Cuentti no respondió. No se registró nada: intenta de nuevo.' } }
  const marca = `app:${idem}`
  const tieneMarca = (c) => (c.recibos || []).some(r => String(r.nota || '').includes(marca))
  const yaEstaba = tieneMarca(antes)
  if (!yaEstaba) {
    const pendiente = Math.round(Number(antes.enc.total_deuda || 0) - Number(antes.enc.total_abono || 0))
    if (valor > pendiente + 1) {
      return { status: 400, body: { ok: false, error: `El abono supera lo que falta en Cuentti (${pesos(pendiente)})`, pendiente } }
    }
    const cuerpo = {
      n_caja: 0, id_transacion: tx, valor, es_activo: '1',
      id_empleado: parseInt(EMPLEADO), id_sucursal: parseInt(SUCURSAL),
      nota: `${marca}${nota ? ` · ${String(nota).slice(0, 80)}` : ''}`,
      id_banco: medio.id_banco, id_medio_pago: medio.id_medio_pago,
      boucher: '', digitos: '', devuelta: 0, dinero_entregado: valor, es_ingreso: 1,
      // El cliente de la PROPIA factura: con -1 o un id adivinado el recibo quedaba
      // a nombre de otro, o se perdia (factura 5955, 21/08/2026).
      id_cliente: antes.enc.id_cliente ?? -1,
      // Hoy: la hora real. Un dia anterior: mediodia de ese dia en Colombia.
      fecha_registro: dia === hoy ? new Date().toISOString() : new Date(`${dia}T12:00:00-05:00`).toISOString(),
      id_centro_costo: 1,
    }
    let rechazo = null
    try {
      const r = await fetch(URL_AGREGAR_PAGO, { method: 'POST', headers: cabecerasCuentti(), body: JSON.stringify(cuerpo) })
      const txt = await r.text()
      let data = txt
      try { data = JSON.parse(txt) } catch { /* texto plano */ }
      rechazo = r.ok ? errorDeCuentti(data) : `HTTP ${r.status}`
    } catch { /* corte de red: se decide releyendo la factura, abajo */ }
    // Se comprueba SIEMPRE releyendo: Cuentti responde sus errores con HTTP 200,
    // y un corte de red puede llegar DESPUES de que el recibo quedo creado.
    const despues = await consultarCuentti(tx).catch(() => ({ enc: null, recibos: [] }))
    if (!tieneMarca(despues)) {
      return { status: 502, body: { ok: false, error: rechazo ? `Cuentti no registró el abono: ${rechazo}` : 'Cuentti no confirma el abono. Revisa en Cuentti antes de repetirlo.' } }
    }
  }
  // Traer el recibo a `pagos` (el trigger marca la orden pagada si completa el
  // total) y, si Cuentti la da por saldada aunque sea con descuento, marcarla.
  const s = await bajarPagosCuentti(t).catch(() => null)
  if (s && s.pendiente <= 1) await marcarPagada(t.id).catch(() => {})
  return { status: 200, body: { ok: true, yaEstaba, pendiente: s?.pendiente ?? null, abonado: s?.abonado ?? null } }
}
