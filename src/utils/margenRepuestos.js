// Margen real de los repuestos: sobre lo que se vendió, no sobre el catálogo.
//
// Ponderar por el catálogo le da el mismo peso a un alternador que nunca se
// vendió que a un aceite de cada semana. Aquí pesa cada peso vendido: las líneas
// de repuesto de las OT del mes, con el costo del producto en Cuentti.
//
// Reglas acordadas con el dueño (15 sep 2026):
// - Un mes son sus OT Completadas y no borradas, por su fecha en hora de
//   Colombia: el mismo criterio de ingresos del Dashboard, Reportes y el MCP.
// - El costo es el que Cuentti tiene HOY. Cuentti no guarda el de cada venta:
//   para el mes pasado casi no cambia, para meses viejos se desvía.
// - Lo que no tiene costo real va aparte y nunca se promedia: una línea sin costo
//   contada con costo 0 es un margen de 100% inventado.
//
// Precios y costos SIN IVA, como los guarda Cuentti. Sin red: lo usan el MCP de
// Cuentti (margen_repuestos_cuentti) y las pruebas.

import { margenSobreVenta, MARGEN_MINIMO_CREIBLE } from './costos.js'
import { ESTADOS } from './estados.js'
import { cantidadItem } from './helpers.js'
import { referenciaDe, esGenerico, esLineaDeServicio, SKU_MANO_OBRA } from './referenciaRepuesto.js'

// Lo que no entra en el margen, en el orden en que se muestra.
export const FUERA_DEL_MARGEN = [
  {
    clave: 'generico',
    titulo: 'Genérico SALDO REPUESTO',
    por: 'No dice qué pieza se vendió: no hay costo que comparar y Cuentti no descuenta inventario.',
  },
  {
    clave: 'sin_referencia',
    titulo: 'Escrito a mano, sin producto',
    por: 'Se facturó con MO1, el código de la mano de obra: no hay costo de la pieza.',
  },
  {
    clave: 'servicio',
    titulo: 'Servicio marcado como repuesto',
    por: 'Mano de obra o trabajo de un técnico externo: no es mercancía del almacén.',
  },
  {
    clave: 'sin_costo',
    titulo: 'Sin costo en Cuentti',
    por: 'El producto existe pero no tiene costo: falta registrar su compra.',
  },
  {
    clave: 'no_existe',
    titulo: 'Referencia que no está en Cuentti',
    por: 'El código de la línea no aparece en el inventario de hoy: cambió o se borró.',
  },
  {
    clave: 'costo_dudoso',
    titulo: 'Costo o precio mal cargado',
    por: `Da un margen por debajo de ${MARGEN_MINIMO_CREIBLE}%: el costo o el precio está mal en Cuentti.`,
  },
]
const CLAVES_FUERA = FUERA_DEL_MARGEN.map(c => c.clave)

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const FMT_MES_BOGOTA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' })

// YYYY-MM de una fecha en hora de Colombia: a las 8 pm del 31, en UTC ya es el mes siguiente.
export function mesDeFecha(iso) {
  const s = String(iso || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s.slice(0, 7) : FMT_MES_BOGOTA.format(d)
}

export const mesActual = (ahora = new Date()) => FMT_MES_BOGOTA.format(ahora)

export function mesAnterior(mes) {
  const [a, m] = String(mes).split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

export function mesSiguiente(mes) {
  const [a, m] = String(mes).split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

export const esMes = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''))

/**
 * Índice del inventario por referencia. Una línea puede llegar con el SKU, con el
 * código de barras o con el PROD-<id> que la app arma cuando el producto no tiene
 * ninguno (services/cuentti.js, cargarInventario).
 * @param {{id, sku, codigoBarras, nombre, costoBase, esServicio}[]} productos
 */
export function indexarInventario(productos) {
  const mapa = new Map()
  for (const p of productos || []) {
    if (!p) continue
    for (const clave of [p.sku, p.codigoBarras, p.id != null ? `PROD-${p.id}` : '']) {
      const k = String(clave || '').trim().toUpperCase()
      if (k && !mapa.has(k)) mapa.set(k, p)
    }
  }
  return mapa
}

// Venta sin IVA de la línea. Un IVA vacío vale 19, igual que en la factura
// (buildFacturaPayload): es lo que quedó registrado en Cuentti.
export function ventaSinIva(item) {
  const ivaCrudo = parseFloat(item?.iva)
  const iva = Number.isFinite(ivaCrudo) ? ivaCrudo : 19
  return (num(item?.precio) * cantidadItem(item)) / (1 + iva / 100)
}

const itemsDe = (t) => {
  let items = t?.items
  if (typeof items === 'string') { try { items = JSON.parse(items) } catch { items = [] } }
  return Array.isArray(items) ? items : []
}

// Las OT que cuentan como venta de ese mes.
export function trabajosDelMes(trabajos, mes) {
  return (trabajos || []).filter(t => t && t.deleted !== true
    && t.estado === ESTADOS.COMPLETADO && mesDeFecha(t.fecha) === mes)
}

/**
 * Dónde cae una línea de repuesto: 'medido' o una clave de FUERA_DEL_MARGEN.
 * @returns {{ clase: string, producto: object|null }}
 */
export function clasificarLinea(item, inventario) {
  const ref = referenciaDe(item)
  if (!ref) return { clase: 'sin_referencia', producto: null }
  if (esGenerico(ref)) return { clase: 'generico', producto: inventario?.get(ref) || null }
  if (ref === SKU_MANO_OBRA) return { clase: 'servicio', producto: inventario?.get(ref) || null }
  const producto = inventario?.get(ref) || null
  if (!producto) return { clase: 'no_existe', producto: null }
  if (producto.esServicio) return { clase: 'servicio', producto }
  const costo = num(producto.costoBase)
  if (!(costo > 0)) return { clase: 'sin_costo', producto }
  const venta = ventaSinIva(item) / cantidadItem(item)
  const margen = margenSobreVenta(venta, costo)
  if (margen != null && margen < MARGEN_MINIMO_CREIBLE) return { clase: 'costo_dudoso', producto }
  return { clase: 'medido', producto }
}

/**
 * Margen de los repuestos vendidos en un mes.
 * @param {object[]} trabajos  filas de trabajos (camelCase de la app o snake_case de Supabase)
 * @param {string} mes  YYYY-MM
 * @param {Map} inventario  el de indexarInventario
 */
export function margenDelMes(trabajos, mes, inventario) {
  const ots = trabajosDelMes(trabajos, mes)
  const fuera = Object.fromEntries(CLAVES_FUERA.map(k => [k, { venta: 0, lineas: [] }]))
  const porProducto = new Map()
  let venta = 0, lineas = 0
  const medido = { venta: 0, costo: 0, lineas: 0 }

  for (const t of ots) {
    const ot = t.otCodigo || t.ot_codigo || t.id || ''
    for (const item of itemsDe(t)) {
      if (!item || typeof item !== 'object' || esLineaDeServicio(item)) continue
      const v = ventaSinIva(item)
      if (!(v > 0)) continue
      venta += v
      lineas++
      const cantidad = cantidadItem(item)
      const referencia = referenciaDe(item)
      const { clase, producto } = clasificarLinea(item, inventario)
      if (clase !== 'medido') {
        fuera[clase].venta += v
        fuera[clase].lineas.push({ ot, referencia, nombre: String(item.nombre || '').trim(), cantidad, venta: v })
        continue
      }
      const costo = num(producto.costoBase) * cantidad
      medido.venta += v
      medido.costo += costo
      medido.lineas++
      const clave = String(producto.sku || referencia).trim().toUpperCase() || referencia
      const fila = porProducto.get(clave) || { referencia: clave, nombre: producto.nombre || item.nombre || '', unidades: 0, venta: 0, costo: 0 }
      fila.unidades += cantidad
      fila.venta += v
      fila.costo += costo
      porProducto.set(clave, fila)
    }
  }

  for (const k of CLAVES_FUERA) fuera[k].lineas.sort((a, b) => b.venta - a.venta)
  const productos = [...porProducto.values()]
    .map(p => ({
      ...p,
      utilidad: p.venta - p.costo,
      margen: margenSobreVenta(p.venta, p.costo),
      peso: medido.venta > 0 ? p.venta / medido.venta : 0,
    }))
    .sort((a, b) => b.venta - a.venta || a.referencia.localeCompare(b.referencia))

  return {
    mes,
    ots: ots.length,
    lineas,
    venta,
    medido: { ...medido, utilidad: medido.venta - medido.costo, margen: margenSobreVenta(medido.venta, medido.costo) },
    // Qué parte de la venta de repuestos se pudo medir: un margen sobre el 40% de
    // la venta no dice lo mismo que uno sobre el 95%.
    cobertura: venta > 0 ? medido.venta / venta : null,
    productos,
    fuera,
  }
}

// Este mes contra el anterior. Los puntos del margen solo si los dos lo tienen.
export function compararMeses(actual, anterior) {
  const cambio = (a, b) => (b > 0 ? (a - b) / b : null)
  return {
    venta: cambio(actual.venta, anterior.venta),
    ventaMedida: cambio(actual.medido.venta, anterior.medido.venta),
    utilidad: cambio(actual.medido.utilidad, anterior.medido.utilidad),
    margenPuntos: actual.medido.margen != null && anterior.medido.margen != null
      ? actual.medido.margen - anterior.medido.margen
      : null,
    coberturaPuntos: actual.cobertura != null && anterior.cobertura != null
      ? (actual.cobertura - anterior.cobertura) * 100
      : null,
  }
}
