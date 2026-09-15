// ¿Una línea de repuesto tiene su producto del inventario de Cuentti?
//
// Regla del dueño (15 sep 2026): no se factura un repuesto sin su producto. Una
// línea escrita a mano se factura con MO1, el código de la mano de obra, y una
// que va por el genérico SALDO REPUESTO no dice qué pieza fue. En los dos casos
// Cuentti no descuenta inventario y el margen de esa venta no se puede medir.
// Es incómodo al principio y resuelve el problema de raíz.
//
// La misma lectura la usan el formulario de la OT, el envío a Cuentti, el MCP y
// el margen de repuestos. Sin dependencias: también la importa el servidor.

// Productos genéricos: una sola referencia para piezas distintas. PROD-1105 es
// "SALDO REPUESTO"; en mayo-septiembre de 2026 salieron con él 18 piezas
// diferentes, entre ellas una culata de $4.200.000.
export const SKU_GENERICOS = ['PROD-1105']

// Código con que la factura manda una línea sin referencia (buildFacturaPayload).
// Elegido a propósito en una línea de repuesto es mano de obra o el trabajo de un
// técnico externo, que va como repuesto para no generarle comisión al de planta.
export const SKU_MANO_OBRA = 'MO1'

// La referencia con que la línea llega a Cuentti, en mayúsculas; '' si no tiene.
export const referenciaDe = (item) => String(item?.sku || item?.codigo || '').trim().toUpperCase()

export const esGenerico = (referencia) => SKU_GENERICOS.includes(String(referencia || '').trim().toUpperCase())

// Misma regla que esServicioItem (utils/comision.js), repetida para no arrastrar
// sus dependencias al servidor.
export const esLineaDeServicio = (item) => {
  const tipo = String(item?.tipo || item?.categoria || '').toLowerCase()
  return item?.esServicio === true || item?.es_servicio === 1 || tipo.includes('serv')
}

// Una línea en blanco (sin descripción ni precio) no es un repuesto por facturar.
const lineaVacia = (item) => !String(item?.nombre || '').trim() && !(parseFloat(item?.precio) > 0)

/**
 * Qué le falta a una línea para poder facturarse.
 * @returns {'sin_referencia'|'generico'|null} null = se puede facturar
 */
export function faltaProducto(item) {
  if (!item || typeof item !== 'object' || esLineaDeServicio(item) || lineaVacia(item)) return null
  const ref = referenciaDe(item)
  if (!ref) return 'sin_referencia'
  if (esGenerico(ref)) return 'generico'
  return null
}

// Las líneas de una OT o cotización que no se pueden facturar, con su motivo.
export function lineasSinProducto(items) {
  let lista = items
  if (typeof lista === 'string') { try { lista = JSON.parse(lista) } catch { lista = [] } }
  return (Array.isArray(lista) ? lista : [])
    .map(item => ({ item, motivo: faltaProducto(item) }))
    .filter(x => x.motivo)
}

export const MOTIVO_SIN_PRODUCTO = {
  sin_referencia: 'escrito a mano, sin producto del inventario',
  generico: 'va por el genérico SALDO REPUESTO',
}
