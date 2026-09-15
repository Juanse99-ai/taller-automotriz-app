// Flujo de caja del mes: la plata que entró y la que salió, cada peso con su fuente.
//
// Es la vista que cierra la tarea de gastos del brief: con los gastos fijos en
// la app, el mes se arma solo. Cuenta por la fecha en que se movió la plata, no
// por el mes que cubre: el arriendo de septiembre pagado el 2 de octubre sale en
// octubre.
//
// Fuentes (revisadas en la base el 15 sep 2026):
//   entra  pagos                  cobros a clientes (abonos y pagos de las OT)
//          prestamos_movimientos  abonos de préstamos pagados aparte
//   sale   gastos                 pagos de gastos fijos y gastos sueltos
//          liquidacion_historial  lo pagado en cada liquidación de técnicos
//          prestamos_movimientos  préstamos y adelantos entregados
//          compras_registradas    compras a proveedores registradas con Claude
//          gastos_registrados     egresos registrados con Claude en Cuentti
// Lo que se registra directo en Cuentti (compras, ventas de mostrador) no llega
// a la base y no se ve aquí.
//
// Sin red: lo usan la pantalla Gastos y las pruebas.

import { mesDeFecha } from './margenRepuestos.js'

export const GRUPOS_ENTRADA = [
  { clave: 'cobros', titulo: 'Cobros a clientes', de: 'Abonos y pagos de las órdenes, los mismos de Cartera.' },
  { clave: 'abonos', titulo: 'Abonos de préstamos', de: 'Lo que devolvieron aparte de una liquidación (Estado de cuenta).' },
]

export const GRUPOS_SALIDA = [
  { clave: 'fijos', titulo: 'Gastos fijos', de: 'Los pagos confirmados en Gastos.' },
  { clave: 'sueltos', titulo: 'Gastos sueltos', de: 'Los anotados en Gastos.' },
  { clave: 'liquidaciones', titulo: 'Liquidaciones de técnicos', de: 'Lo pagado en cada liquidación, ya sin los descuentos.' },
  { clave: 'prestamos', titulo: 'Préstamos y adelantos', de: 'Lo entregado a técnicos y otras personas (Estado de cuenta).' },
  { clave: 'compras', titulo: 'Compras a proveedores', de: 'Las facturas de compra registradas con Claude.' },
  { clave: 'otros', titulo: 'Otros gastos en Cuentti', de: 'Servicios públicos, mercado y demás registrados con Claude.' },
]

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

// Día (YYYY-MM-DD) en hora de Colombia: una liquidación de las 8:30 pm del 30
// es del 30, aunque en UTC ya sea el 1.
const FMT_DIA_BOGOTA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })
function diaDe(fecha) {
  const s = String(fecha || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : FMT_DIA_BOGOTA.format(d)
}

// Un movimiento del Estado de cuenta que nace de una liquidación ("Descuento en
// liquidación #PB260730", "Saldo a favor · liquidación…") no es plata que entre
// o salga: es lo que ya se descontó o se sumó en ese pago, y el pago ya cuenta.
export const esAjusteDeLiquidacion = (m) => /liquidaci[oó]n/i.test(String(m?.nota || ''))

// Egresos de la bitácora de Cuentti que la app ya cuenta por su lado: los de
// Gastos (gasto:…), los de Liquidación (LQ-…) y los del Estado de cuenta (PR-…).
export const esEgresoDeLaApp = (f) => /^(gasto:|LQ-|PR-)/i.test(String(f?.numero_factura || ''))

/**
 * Los movimientos de plata de un mes, cada uno con su grupo.
 * @param {object} datos  { pagos, gastos, liquidaciones, prestamos, compras, bitacora } en snake_case de Supabase
 * @param {string} mes    YYYY-MM
 * @param {Map} [ots]     id de trabajo → código OT, para nombrar los cobros
 */
export function movimientosDelMes(datos, mes, ots = null) {
  const { pagos = [], gastos = [], liquidaciones = [], prestamos = [], compras = [], bitacora = [] } = datos || {}
  const lista = []
  const poner = (grupo, fecha, concepto, monto) => {
    const m = num(monto)
    if (m > 0 && mesDeFecha(fecha) === mes) lista.push({ grupo, fecha: diaDe(fecha), concepto: texto(concepto), monto: m })
  }

  for (const p of pagos) {
    const ot = ots?.get(p.trabajo_id) || p.trabajo_id || 'orden'
    poner('cobros', p.fecha, [ot, p.metodo].filter(Boolean).join(' · '), p.monto)
  }
  for (const g of gastos) {
    if (g.recurrente) continue
    poner(g.gasto_fijo_id ? 'fijos' : 'sueltos', g.fecha, g.concepto, g.monto)
  }
  for (const l of liquidaciones) {
    // Antes del 3 jul 2026 no existía `pagado`: se pagaba el neto.
    poner('liquidaciones', l.fecha, `Liquidación ${texto(l.tecnico)}`, l.pagado ?? l.neto)
  }
  for (const m of prestamos) {
    if (esAjusteDeLiquidacion(m)) continue
    const nota = texto(m.nota)
    if (m.tipo === 'prestamo') poner('prestamos', m.fecha, `${texto(m.persona)}${nota ? ` · ${nota}` : ''}`, m.monto)
    else if (m.tipo === 'abono') poner('abonos', m.fecha, `${texto(m.persona)}${nota ? ` · ${nota}` : ''}`, m.monto)
  }
  for (const c of compras) {
    poner('compras', c.fecha, [c.proveedor_nombre, c.numero_factura].filter(Boolean).join(' · '), c.total)
  }
  for (const f of bitacora) {
    if (f.anulado_en || esEgresoDeLaApp(f)) continue
    poner('otros', f.fecha, f.concepto || f.proveedor_nombre, f.total)
  }
  return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.monto - a.monto))
}

// Totales por grupo, lo que entró, lo que salió y lo que quedó.
export function resumirFlujo(movimientos) {
  const porGrupo = Object.fromEntries([...GRUPOS_ENTRADA, ...GRUPOS_SALIDA].map(g => [g.clave, 0]))
  for (const m of movimientos || []) porGrupo[m.grupo] = (porGrupo[m.grupo] || 0) + m.monto
  const entro = GRUPOS_ENTRADA.reduce((s, g) => s + porGrupo[g.clave], 0)
  const salio = GRUPOS_SALIDA.reduce((s, g) => s + porGrupo[g.clave], 0)
  return { porGrupo, entro, salio, neto: entro - salio }
}

export function flujoDelMes(datos, mes, ots = null) {
  const movimientos = movimientosDelMes(datos, mes, ots)
  return { mes, movimientos, ...resumirFlujo(movimientos) }
}
