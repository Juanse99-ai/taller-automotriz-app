// Logica pura de las metricas de OT del MCP del taller: sin red ni Supabase, para
// poder probarla con datos inventados (ver test/metricas-trabajos.test.js).

import {
  ESTADOS, ESTADOS_ACTIVOS, ESTADOS_COTIZACION, esEstadoOT, esEstadoCotizacion,
} from '../../src/utils/estados.js'

// Filtro PostgREST para leer solo OT vivas. "is not true" y no "= false": una
// fila con deleted en null es una OT viva, igual que en la vista trabajos_saldo.
export const SIN_BORRADAS = 'deleted=not.is.true'

export const borrada = (t) => t?.deleted === true

// La app lee un estado vacio como Pendiente (hooks/useTrabajos.js); el MCP igual.
export const estadoDe = (t) => t?.estado || ESTADOS.PENDIENTE

const FMT_BOGOTA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })

// Fecha de hoy en la hora del taller: a las 7 pm en Colombia, en UTC ya es mañana.
export const hoyTaller = () => FMT_BOGOTA.format(new Date())

// Fecha (YYYY-MM-DD) de un timestamp en hora de Bogota. Una fecha sin hora se deja igual.
export const fechaBogota = (iso) => {
  const s = String(iso || '')
  if (s.length <= 10) return s
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : FMT_BOGOTA.format(d)
}

// Primer dia que entra en el periodo. 'mes' devuelve YYYY-MM, que compara bien
// como texto contra cualquier YYYY-MM-DD de ese mes en adelante.
export function desdePeriodo(periodo, hoy) {
  switch (periodo) {
    case 'hoy': return hoy
    case 'semana': {
      const d = new Date(`${hoy}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 7)
      return d.toISOString().slice(0, 10)
    }
    case 'anio': return `${hoy.slice(0, 4)}-01-01`
    default: return hoy.slice(0, 7)
  }
}

export const sumaTotal = (filas) => filas.reduce((s, t) => s + (parseFloat(t.total) || 0), 0)

/**
 * Reparte las OT vivas en los grupos que muestran dashboard y stats_ingresos.
 * Las borradas no entran en ningun grupo. Una OT con un estado que no esta en el
 * catalogo va a `desconocidas` y NO a las demas: la herramienta debe decirlo,
 * no dejarla fuera de las cifras en silencio.
 *
 * @param {object[]} filas  filas de trabajos (idealmente ya sin borradas)
 * @param {{ hoy?: string, desde?: string }} opciones  fechas YYYY-MM-DD (desde puede ser YYYY-MM)
 */
export function resumirTrabajos(filas, { hoy, desde } = {}) {
  const r = { vivas: [], activas: [], completadas: [], sinFacturar: [], ingresadasHoy: [], delPeriodo: [], desconocidas: [] }
  for (const t of filas || []) {
    if (borrada(t)) continue
    r.vivas.push(t)
    const estado = estadoDe(t)
    const dia = fechaBogota(t.fecha)
    if (hoy && dia === hoy) r.ingresadasHoy.push(t)
    if (!esEstadoOT(estado)) { r.desconocidas.push(t); continue }
    if (ESTADOS_ACTIVOS.includes(estado)) r.activas.push(t)
    if (estado === ESTADOS.COMPLETADO) {
      r.completadas.push(t)
      // Mismo criterio que el Dashboard de la app: lista para entregar = completada
      // sin nada en cuentti_id_transacion (ni factura ni la marca SIN-FACTURA).
      if (!t.cuentti_id_transacion) r.sinFacturar.push(t)
      if (desde && dia >= desde) r.delPeriodo.push(t)
    }
  }
  return r
}

// { 'Entregado': { n: 3, total: 450000 }, ... }
export function agruparPorEstado(filas) {
  const g = {}
  for (const t of filas) {
    const e = estadoDe(t)
    g[e] ||= { n: 0, total: 0 }
    g[e].n += 1
    g[e].total += parseFloat(t.total) || 0
  }
  return g
}

// Linea de aviso para OT con estado desconocido; '' si no hay ninguna.
export function avisoEstadosDesconocidos(filas, fmtCOP) {
  if (!filas.length) return ''
  const detalle = Object.entries(agruparPorEstado(filas))
    .map(([e, { n, total }]) => `"${e}" (${n} OT, ${fmtCOP(total)})`).join(', ')
  return `> ⚠️ Hay OT con un estado que la app no conoce y no entran en ninguna cifra: ${detalle}. `
    + `Los estados validos son: ${Object.values(ESTADOS).join(', ')}.`
}

const CATALOGO_POR_TABLA = {
  trabajos: { valores: Object.values(ESTADOS), valido: esEstadoOT },
  trabajos_saldo: { valores: Object.values(ESTADOS), valido: esEstadoOT },
  cotizaciones: { valores: Object.values(ESTADOS_COTIZACION), valido: esEstadoCotizacion },
}

// Valores de estado que un filtro PostgREST compara y que no existen en esa
// tabla: estado=eq.X, neq.X, not.eq.X, in.(A,B), not.in.(A,"B C").
export function estadosInexistentesEnFiltro(tabla, filtro) {
  const cat = CATALOGO_POR_TABLA[tabla]
  if (!cat || !filtro) return []
  const malos = []
  for (const parte of String(filtro).split('&')) {
    const m = parte.match(/^estado=(?:not\.)?(eq|neq|in)\.(.+)$/)
    if (!m) continue
    let valor = m[2]
    try { valor = decodeURIComponent(valor) } catch { /* se usa tal cual */ }
    const valores = m[1] === 'in'
      ? valor.replace(/^\(|\)$/g, '').split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      : [valor]
    for (const v of valores) if (v && !cat.valido(v)) malos.push(v)
  }
  return malos
}

export function avisoFiltroEstado(tabla, filtro) {
  const malos = estadosInexistentesEnFiltro(tabla, filtro)
  if (!malos.length) return ''
  return `> ⚠️ ${malos.map(v => `"${v}"`).join(', ')} no es un estado de ${tabla}: `
    + `el filtro no puede encontrar nada con ese valor. Los validos son: ${CATALOGO_POR_TABLA[tabla].valores.join(', ')}.\n\n`
}
