// Costo y margen de un producto de Cuentti.
//
// Lo usan la app (Inventario) y el MCP de Cuentti (listar_inventario_cuentti y
// buscar_producto_sku_cuentti): el margen tiene que ser el mismo numero en los
// dos lados, o no hay forma de medir la rentabilidad del almacen.
// Sin dependencias a proposito: tambien lo importa el servidor.

// Los dos endpoints de producto (consultaProductoPaginadaMovil y
// obtenerProductoSku) mandan el costo de compra SIN IVA en `precio_compra` y en
// `costo`; en todos los registros vistos valen lo mismo. Los demas nombres
// quedan por si otro endpoint lo manda distinto.
//
// Antes, si no hallaba ninguno, se tomaba CUALQUIER campo con "costo" o "compra"
// en el nombre. El listado Movil trae `equivalencia_compra`, que no es un costo:
// con un numero ahi, un producto sin costo registrado salia con un costo
// inventado y un margen de casi 100%.
const CAMPOS_COSTO = [
  'precio_compra', 'costo', 'costo_promedio', 'costo_promedio_ponderado',
  'ultimo_costo', 'costo_ultimo', 'valor_costo', 'costo_unitario',
  'precio_costo', 'costo_base', 'costoPromedio', 'precioCompra',
]

/** Costo de compra SIN IVA del producto crudo de Cuentti; 0 si no lo tiene registrado. */
export function costoDeProducto(p) {
  if (!p || typeof p !== 'object') return 0
  for (const k of CAMPOS_COSTO) {
    const v = parseFloat(p[k])
    if (v > 0) return v
  }
  return 0
}

/**
 * Margen SOBRE LA VENTA, sin IVA: (precio - costo) / precio x 100. Asi lo
 * calcula Cuentti; el markup sobre el costo daba cifras infladas (110%, 78%...)
 * que no cuadraban con el. null si falta el costo o el precio: sin costo no hay
 * margen, y un 100% inventado es peor que un hueco.
 */
export function margenSobreVenta(precioSinIva, costoSinIva) {
  const precio = parseFloat(precioSinIva) || 0
  const costo = parseFloat(costoSinIva) || 0
  if (!(precio > 0) || !(costo > 0)) return null
  return ((precio - costo) / precio) * 100
}

// Por debajo de esto el margen no es un dato: el costo o el precio estan mal en
// Cuentti. Caso real: "Bolsa", con costo $63.865 y precio $17 sin IVA, daba
// -383.093%.
export const MARGEN_MINIMO_CREIBLE = -100
