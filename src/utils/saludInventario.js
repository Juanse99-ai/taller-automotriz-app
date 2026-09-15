// Salud del inventario: los productos de Cuentti cuyos datos no cuadran.
//
// Una sola lectura para la pantalla de Inventario y para el MCP de Cuentti
// (salud_inventario_cuentti): si cada uno decidiera por su lado que es "un
// margen raro", la app y Claude darian listas distintas del mismo inventario.
//
// Trabaja sobre el producto ya normalizado de la app:
//   { id, sku, nombre, precioBase, costoBase, stock, esServicio }
// precio y costo SIN IVA, como los guarda Cuentti.
//
// Solo diagnostica. Corregir es cambiar el ERP del dueño y se hace en Cuentti.

import { margenSobreVenta } from './costos.js'
import { ESTADOS } from './estados.js'
import { cantidadItem } from './helpers.js'

// Precio sin IVA por debajo del cual un repuesto casi seguro quedo mal
// digitado. Los casos reales eran $1 (juego de llaves), $2 (sensor MAP) y $20
// (bolsa). Una arandela o un terminal cuestan desde unos $500, asi que 100 no
// atrapa precios de verdad.
export const PRECIO_SIMBOLICO = 100

// Margen sobre la venta, sin IVA. Bajo el 10% la venta no paga la operacion;
// sobre el 85% casi siempre el costo quedo cargado por unidad de empaque, o es
// el de otro producto. Entre los dos esta el almacen normal (20-45%).
export const MARGEN_BAJO = 10
export const MARGEN_ALTO = 85

// Codigo con el que la app factura las lineas escritas a mano
// (src/services/cuentti.js). Es mano de obra aunque en Cuentti no este marcado
// como servicio: cualquier costo que tenga infla el costo de cada factura.
export const SKU_LINEA_LIBRE = 'MO1'

// Dias hacia atras para "se vendio hace poco": lo que se esta vendiendo es lo
// primero que hay que arreglar, porque es lo que ensucia los reportes de hoy.
export const DIAS_VENTAS = 90

export const CATEGORIAS_SALUD = [
  {
    clave: 'servicio_con_costo',
    titulo: 'Servicio con costo',
    que: 'Un servicio o la mano de obra no gasta inventario, pero en Cuentti tiene costo. Cuentti lo cuenta como costo en cada factura y la ganancia sale menor de lo que es.',
    arreglo: 'En Cuentti, deja el costo del producto en 0.',
  },
  {
    clave: 'bajo_costo',
    titulo: 'Precio menor al costo',
    que: 'Se vende por menos de lo que costó: cada venta pierde plata, o el precio o el costo están mal cargados.',
    arreglo: 'Revisa en Cuentti cuál de los dos está mal y corrígelo.',
  },
  {
    clave: 'precio_simbolico',
    titulo: 'Precio simbólico',
    que: `Precio de menos de $${PRECIO_SIMBOLICO} sin IVA: casi seguro quedó mal digitado. Con un precio así el margen puede verse bien y no salta en ningún otro filtro.`,
    arreglo: 'Pon en Cuentti el precio de venta real.',
  },
  {
    clave: 'margen_raro',
    titulo: 'Margen fuera de rango',
    que: `Margen por debajo del ${MARGEN_BAJO}%, que no deja ganancia, o por encima del ${MARGEN_ALTO}%, que casi siempre es un costo cargado por unidad de empaque o de otro producto.`,
    arreglo: 'Compara el precio y el costo con la última factura del proveedor.',
  },
  {
    clave: 'sin_costo',
    titulo: 'Sin costo',
    que: 'No tiene costo registrado, así que su margen no se puede medir.',
    arreglo: 'Registra su compra en Cuentti (eso le pone el costo) o carga el costo en el producto.',
  },
  {
    clave: 'stock_negativo',
    titulo: 'Stock negativo',
    que: 'Se vendió más de lo que había registrado: faltan compras por registrar, o entraron después de la venta.',
    arreglo: 'Registra las compras que faltan o haz un ajuste de inventario en Cuentti.',
  },
]
const CLAVES = CATEGORIAS_SALUD.map(c => c.clave)

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const esLineaLibre = (p) => String(p?.sku ?? '').trim().toUpperCase() === SKU_LINEA_LIBRE

// Los problemas de UN producto, en el orden de CATEGORIAS_SALUD.
export function diagnosticarProducto(p) {
  if (!p || typeof p !== 'object') return []
  const precio = num(p.precioBase)
  const costo = num(p.costoBase)
  const problemas = []

  // A un servicio no se le mide precio, margen ni existencias: su unico dato
  // posible de error es tener costo. Sin este corte MO1 (precio 60.000, costo
  // 174.000) salia ademas como "precio menor al costo", y ahi el arreglo que se
  // sugiere —subir el precio— es el equivocado.
  if (p.esServicio || esLineaLibre(p)) {
    if (costo > 0) problemas.push('servicio_con_costo')
    return problemas
  }

  if (precio > 0 && precio < PRECIO_SIMBOLICO) problemas.push('precio_simbolico')
  if (costo > 0 && precio > 0 && precio < costo) {
    problemas.push('bajo_costo')
  } else if (costo > 0 && precio >= PRECIO_SIMBOLICO) {
    const m = margenSobreVenta(precio, costo)
    if (m != null && (m < MARGEN_BAJO || m > MARGEN_ALTO)) problemas.push('margen_raro')
  }
  if (!(costo > 0)) problemas.push('sin_costo')
  if (num(p.stock) < 0) problemas.push('stock_negativo')
  return problemas
}

// El inicio de la ventana de ventas, hoy menos `dias`.
export const haceDias = (dias) => new Date(Date.now() - dias * 86400000)

// Unidades vendidas por SKU en las OT completadas desde `desde` (Date o ISO).
// Mismo criterio de "venta" que los ingresos: OT Completada, no borrada, por
// su fecha. Una linea sin SKU cuenta como MO1, que es con lo que se factura
// (buildFacturaPayload): asi se ve cuantas facturas arrastra el costo de MO1.
export function unidadesVendidas(trabajos, desde) {
  const limite = desde ? new Date(desde).getTime() : 0
  const mapa = new Map()
  for (const t of trabajos || []) {
    if (!t || t.deleted === true || t.estado !== ESTADOS.COMPLETADO) continue
    const f = new Date(t.fecha).getTime()
    if (limite && !(f >= limite)) continue
    let items = t.items
    if (typeof items === 'string') { try { items = JSON.parse(items) } catch { items = [] } }
    for (const i of Array.isArray(items) ? items : []) {
      if (!i || typeof i !== 'object') continue
      const sku = String(i.sku || i.codigo || SKU_LINEA_LIBRE).trim().toUpperCase()
      mapa.set(sku, (mapa.get(sku) || 0) + cantidadItem(i))
    }
  }
  return mapa
}

// Lo que se ordena primero en cada categoria: lo que mas daño hace hoy.
function comparador(clave, vendidos) {
  const vend = (p) => vendidos?.get(String(p.sku || '').trim().toUpperCase()) || 0
  const desempate = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
  switch (clave) {
    case 'servicio_con_costo': return (a, b) => num(b.costoBase) - num(a.costoBase) || desempate(a, b)
    case 'bajo_costo': return (a, b) => (num(b.costoBase) - num(b.precioBase)) - (num(a.costoBase) - num(a.precioBase)) || desempate(a, b)
    case 'precio_simbolico': return (a, b) => num(a.precioBase) - num(b.precioBase) || desempate(a, b)
    case 'margen_raro': {
      const lejos = (p) => {
        const m = margenSobreVenta(p.precioBase, p.costoBase) ?? 0
        return m < MARGEN_BAJO ? MARGEN_BAJO - m : m - MARGEN_ALTO
      }
      return (a, b) => vend(b) - vend(a) || lejos(b) - lejos(a) || desempate(a, b)
    }
    case 'sin_costo': return (a, b) => vend(b) - vend(a) || num(b.stock) - num(a.stock) || desempate(a, b)
    case 'stock_negativo': return (a, b) => num(a.stock) - num(b.stock) || desempate(a, b)
    default: return desempate
  }
}

// Diagnostico de todo el inventario. `vendidos` (opcional) es el Map de
// unidadesVendidas: con el, lo que se vende sale primero.
export function resumirSalud(productos, vendidos = null) {
  const porCategoria = Object.fromEntries(CLAVES.map(k => [k, []]))
  let afectados = 0
  const lista = Array.isArray(productos) ? productos : []
  for (const p of lista) {
    const problemas = diagnosticarProducto(p)
    if (problemas.length) afectados++
    for (const k of problemas) porCategoria[k].push(p)
  }
  for (const k of CLAVES) porCategoria[k].sort(comparador(k, vendidos))
  return { revisados: lista.length, afectados, porCategoria }
}

// El detalle de UNA fila en palabras, para la lista y para el texto que se copia.
// `fmt` formatea pesos (la app y el MCP tienen el suyo).
export function detalleProblema(clave, p, fmt) {
  const precio = num(p.precioBase)
  const costo = num(p.costoBase)
  switch (clave) {
    case 'servicio_con_costo':
      return `Costo ${fmt(costo)} en un servicio`
    case 'bajo_costo':
      return `Pierde ${fmt(costo - precio)} por unidad (precio ${fmt(precio)}, costo ${fmt(costo)})`
    case 'precio_simbolico':
      return `Precio ${fmt(precio)}${costo > 0 ? `, costo ${fmt(costo)}` : ''}`
    case 'margen_raro': {
      const m = Math.round(margenSobreVenta(precio, costo) ?? 0)
      return `Margen ${m}% (precio ${fmt(precio)}, costo ${fmt(costo)})`
    }
    case 'sin_costo':
      return precio > 0 ? `Se vende a ${fmt(precio)} sin costo` : 'Sin costo ni precio'
    case 'stock_negativo': {
      // En palabras y no "Stock -21": la columna de al lado ya dice el numero.
      const n = Math.abs(num(p.stock))
      return n === 1 ? 'Falta 1 unidad por registrar' : `Faltan ${n.toLocaleString('es-CO')} unidades por registrar`
    }
    default:
      return ''
  }
}
