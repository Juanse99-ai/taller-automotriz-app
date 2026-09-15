/* global process */
// Costo y margen del inventario de Cuentti. Corre con: npm test
//
// Cubre:
//   1. el costo sale de precio_compra / costo y de NINGUN otro campo con
//      "compra" en el nombre (equivalencia_compra inventaba costos)
//   2. el margen es sobre la venta y sin IVA, y un hueco no se vuelve 100%
//   3. listar_inventario_cuentti y buscar_producto_sku_cuentti lo muestran
// Todo con datos inventados y un Cuentti falso: no toca la red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costoDeProducto, margenSobreVenta, MARGEN_MINIMO_CREIBLE } from '../src/utils/costos.js'

// ---------- datos: registros crudos con los campos del listado Movil --------

const producto = (o) => ({
  equivalencia_compra: null, id_impuesto_compra: null, idProductoSucursal: 0, id_sucursal: 1,
  codigo_barras: '', es_servicio: 0, vende_sin_existencia: 1, id_categoria: 1,
  valor_impuesto: 19, existencias: 0, precio_compra: 0, costo: 0, ...o,
})
const PRODUCTOS = [
  producto({ id_producto: 501, sku: 'FA-SPK', nombre: 'FILTRO DE ACEITE CHEVROLET SPARK', precio_venta: 30000, precio_compra: 18000, costo: 18000, existencias: 6 }),
  // Sin costo registrado, con un numero en equivalencia_compra: no es un costo.
  producto({ id_producto: 502, sku: 'SIL-GRIS', nombre: 'SILICONA GRIS', precio_venta: 10000, equivalencia_compra: 12, existencias: 3 }),
  producto({ id_producto: 503, sku: 'BUJ-01', nombre: 'BUJIA NGK', precio_venta: 9000, precio_compra: 10000, costo: 10000, existencias: 8 }),
  // El caso real que ya marcaba la app: costo y precio que no cuadran.
  producto({ id_producto: 504, sku: '', nombre: 'Bolsa', precio_venta: 16.66666667, precio_compra: 63865.55, costo: 63865.55 }),
  producto({ id_producto: 1, sku: '0', nombre: 'Servicio', precio_venta: 0, es_servicio: 1, valor_impuesto: 0 }),
  // Costo solo en `costo`.
  producto({ id_producto: 506, sku: 'ACE-2050', nombre: 'ACEITE 20W50 MINERAL', precio_venta: 25000, costo: 20000, existencias: 20 }),
  producto({ id_producto: 507, sku: 'PROMO', nombre: 'OBSEQUIO LLAVERO', precio_venta: 0, precio_compra: 3000, costo: 3000, existencias: 40 }),
  producto({ id_producto: 508, sku: 'EMP-01', nombre: 'EMPAQUE CARTER', precio_venta: 100, precio_compra: 45000, costo: 45000, existencias: 2 }),
]

// ---------- logica pura ----------------------------------------------------

test('el costo sale de precio_compra, o de costo si ese viene en 0', () => {
  assert.equal(costoDeProducto(PRODUCTOS[0]), 18000)
  assert.equal(costoDeProducto(PRODUCTOS[5]), 20000)
  assert.equal(costoDeProducto({ precio_compra: '15000.5' }), 15000.5)
})

test('sin costo registrado da 0, aunque haya otro campo con "compra"', () => {
  assert.equal(costoDeProducto(PRODUCTOS[1]), 0)
  assert.equal(costoDeProducto({ precio_compra: -5, costo: 'abc', id_impuesto_compra: 5 }), 0)
  assert.equal(costoDeProducto(null), 0)
})

test('margen sobre la venta, sin IVA', () => {
  assert.equal(margenSobreVenta(30000, 18000), 40)
  assert.equal(margenSobreVenta(25000, 20000), 20)
  assert.ok(Math.abs(margenSobreVenta(9000, 10000) - (-11.111)) < 0.001)
})

test('sin costo o sin precio no hay margen: nunca un 100% inventado', () => {
  assert.equal(margenSobreVenta(10000, 0), null)
  assert.equal(margenSobreVenta(0, 3000), null)
  assert.equal(margenSobreVenta('', undefined), null)
})

test('un margen imposible queda por debajo del minimo creible', () => {
  assert.ok(margenSobreVenta(16.66666667, 63865.55) < MARGEN_MINIMO_CREIBLE)
  assert.ok(margenSobreVenta(10000, 20000) >= MARGEN_MINIMO_CREIBLE) // perder el 100% si puede pasar
})

// ---------- herramientas MCP contra un Cuentti falso ------------------------

process.env.MCP_TOKEN = 'token-de-prueba'
const { default: handler } = await import('../api/mcp/cuentti.js')

globalThis.fetch = async (url) => {
  const u = new URL(url)
  const partes = u.pathname.split('/').map(decodeURIComponent)
  if (u.pathname.includes('/consultaProductoPaginadaMovil/')) {
    const pagina = Number(partes.at(-1))
    return new Response(JSON.stringify(pagina === 0 ? PRODUCTOS : []), { status: 200 })
  }
  if (u.pathname.includes('/obtenerProductoSku/')) {
    const sku = partes.at(-1)
    const p = PRODUCTOS.find(x => x.sku === sku)
    return new Response(JSON.stringify(p ? [p] : { message: 'No existe' }), { status: 200 })
  }
  return new Response('{}', { status: 404 })
}

async function llamar(nombre, args = {}) {
  let cuerpo
  const res = { setHeader() {}, status() { return this }, json(o) { cuerpo = o }, end() {} }
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer token-de-prueba' },
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nombre, arguments: args } },
  }, res)
  const texto = cuerpo?.result?.content?.[0]?.text
  assert.ok(typeof texto === 'string', `${nombre} no devolvio texto: ${JSON.stringify(cuerpo)}`)
  assert.ok(!cuerpo.result.isError, `${nombre} fallo: ${texto}`)
  return texto
}
// Una fila de la tabla por SKU, con las celdas ya recortadas.
const celdas = (texto, sku) => {
  const linea = texto.split('\n').find(l => l.startsWith(`| ${sku} |`))
  assert.ok(linea, `no aparece la fila ${sku}:\n${texto}`)
  return linea.split('|').slice(1, -1).map(c => c.trim().replace(/\s/g, ' '))
}

test('listar_inventario_cuentti: columnas de costo y margen', async () => {
  const out = await llamar('listar_inventario_cuentti', {})
  assert.match(out, /\| SKU \| Nombre \| Precio c\/IVA \| Costo c\/IVA \| Margen \| Stock \| IVA \|/)
  //                                  sku       nombre                               precio       costo        margen   stock  iva
  assert.deepEqual(celdas(out, 'FA-SPK'), ['FA-SPK', 'FILTRO DE ACEITE CHEVROLET SPARK', '$ 35.700', '$ 21.420', '40%', '6', '19%'])
  assert.deepEqual(celdas(out, 'SIL-GRIS').slice(2, 5), ['$ 11.900', '—', 'sin costo'])
  assert.deepEqual(celdas(out, 'BUJ-01').slice(3, 5), ['$ 11.900', '⚠️ -11%'])
  assert.deepEqual(celdas(out, '—').slice(3, 5), ['$ 76.000', 'revisar'])
  assert.deepEqual(celdas(out, '0').slice(2, 5), ['$ 0', '—', 'servicio'])
  assert.deepEqual(celdas(out, 'ACE-2050').slice(3, 5), ['$ 23.800', '20%'])
  assert.deepEqual(celdas(out, 'PROMO').slice(2, 5), ['$ 0', '$ 3.570', 'sin precio'])
  // El servicio no cuenta como hueco: no tiene costo que registrar.
  assert.match(out, /1 de 8 sin costo registrado en Cuentti/)
})

test('listar_inventario_cuentti con filtro: la misma tabla', async () => {
  const out = await llamar('listar_inventario_cuentti', { filtro: 'spark' })
  assert.deepEqual(celdas(out, 'FA-SPK').slice(2, 5), ['$ 35.700', '$ 21.420', '40%'])
  assert.doesNotMatch(out, /sin costo registrado/)
})

test('buscar_producto_sku_cuentti: costo con y sin IVA, margen y utilidad por unidad', async () => {
  const out = (await llamar('buscar_producto_sku_cuentti', { sku: 'FA-SPK' })).replace(/\s/g, ' ')
  assert.match(out, /\| \*\*Costo sin IVA\*\* \| \$ 18\.000 \|/)
  assert.match(out, /\| \*\*Costo con IVA\*\* \| \$ 21\.420 \|/)
  assert.match(out, /\| \*\*Margen\*\* \| 40% \(utilidad de \$ 12\.000 por unidad, sin IVA\) \|/)
})

test('buscar_producto_sku_cuentti: sin costo, con perdida y con datos imposibles', async () => {
  const sinCosto = (await llamar('buscar_producto_sku_cuentti', { sku: 'SIL-GRIS' })).replace(/\s/g, ' ')
  assert.match(sinCosto, /\| \*\*Costo sin IVA\*\* \| sin costo registrado \|/)
  assert.match(sinCosto, /\| \*\*Margen\*\* \| no se puede calcular: el producto no tiene costo registrado en Cuentti \|/)

  const perdida = (await llamar('buscar_producto_sku_cuentti', { sku: 'BUJ-01' })).replace(/\s/g, ' ')
  assert.match(perdida, /\| \*\*Margen\*\* \| ⚠️ -11%: se vende por debajo del costo \(pierde \$ 1\.000 por unidad, sin IVA\) \|/)

  const promo = (await llamar('buscar_producto_sku_cuentti', { sku: 'PROMO' })).replace(/\s/g, ' ')
  assert.match(promo, /\| \*\*Margen\*\* \| no se puede calcular: el producto no tiene precio de venta \|/)

  const imposible = (await llamar('buscar_producto_sku_cuentti', { sku: 'EMP-01' })).replace(/\s/g, ' ')
  assert.match(imposible, /\| \*\*Margen\*\* \| revisar: con costo \$ 45\.000 y precio \$ 100 sin IVA sale -44\.900%, así que uno de los dos está mal en Cuentti \|/)

  const servicio = (await llamar('buscar_producto_sku_cuentti', { sku: '0' })).replace(/\s/g, ' ')
  assert.match(servicio, /\| \*\*Margen\*\* \| no aplica: es un servicio sin costo \|/)
})
