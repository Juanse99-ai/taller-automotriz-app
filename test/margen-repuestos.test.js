// Margen real de repuestos (src/utils/margenRepuestos.js) y la regla de no
// facturar un repuesto sin su producto (src/utils/referenciaRepuesto.js).
// Corre con: npm test
//
// Los casos salen de las OT reales: la culata por el genérico PROD-1105, la
// campana de freno escrita a mano (OT-0192), el aire acondicionado de un técnico
// externo con MO1 y la bolsa con costo de $76.639. Datos inventados, sin red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  margenDelMes, compararMeses, indexarInventario, clasificarLinea, trabajosDelMes,
  mesDeFecha, mesAnterior, ventaSinIva, FUERA_DEL_MARGEN,
} from '../src/utils/margenRepuestos.js'
import { faltaProducto, lineasSinProducto, referenciaDe } from '../src/utils/referenciaRepuesto.js'

const inventario = indexarInventario([
  { id: 11, sku: 'ACE-5W30', nombre: 'ACEITE 5W30 CUARTO', costoBase: 20000, esServicio: false },
  { id: 12, sku: 'FIL-AC-1', codigoBarras: '7701234', nombre: 'FILTRO ACEITE', costoBase: 9000, esServicio: false },
  { id: 13, sku: '7943GAM-I', nombre: 'PASTILLAS', costoBase: 0, esServicio: false },
  { id: 1105, sku: 'PROD-1105', nombre: 'SALDO REPUESTO', costoBase: 3000, esServicio: false },
  { id: 2, sku: 'PROD-2', nombre: 'BOLSA', costoBase: 76639, esServicio: false },
  { id: 1290, sku: 'PROD-1290', nombre: 'SERVICIO PRENSA', costoBase: 0, esServicio: true },
  { id: 77, sku: '', codigoBarras: '', nombre: 'SIN CODIGOS', costoBase: 5000, esServicio: false },
])

// Precio CON IVA, como lo guarda la OT.
const linea = (o) => ({ nombre: 'X', precio: 0, cantidad: 1, iva: 19, esServicio: false, ...o })
const ot = (fecha, items, o = {}) => ({ ot_codigo: o.ot || 'OT-1', estado: 'Completado', fecha, items, ...o })

test('el mes va en hora de Colombia: la noche del 31 no se pasa al mes siguiente', () => {
  assert.equal(mesDeFecha('2026-08-31T23:30:00-05:00'), '2026-08')
  assert.equal(mesDeFecha('2026-09-01T02:00:00Z'), '2026-08')
  assert.equal(mesDeFecha('2026-09-01T12:00:00Z'), '2026-09')
  assert.equal(mesDeFecha('2026-09-15'), '2026-09')
  assert.equal(mesAnterior('2026-01'), '2025-12')
  assert.equal(mesAnterior('2026-10'), '2026-09')
})

test('solo cuentan las OT completadas y vivas del mes', () => {
  const filas = [
    ot('2026-09-10T17:00:00Z', []),
    ot('2026-09-10T17:00:00Z', [], { estado: 'En Progreso' }),
    ot('2026-09-10T17:00:00Z', [], { deleted: true }),
    ot('2026-08-10T17:00:00Z', []),
  ]
  assert.equal(trabajosDelMes(filas, '2026-09').length, 1)
})

test('venta sin IVA: IVA vacío vale 19 como en la factura, y la cantidad acepta coma', () => {
  assert.equal(Math.round(ventaSinIva(linea({ precio: 119000 }))), 100000)
  assert.equal(Math.round(ventaSinIva(linea({ precio: 119000, iva: '' }))), 100000)
  assert.equal(Math.round(ventaSinIva(linea({ precio: 100000, iva: 0, cantidad: '0,5' }))), 50000)
})

test('clasifica cada línea: medida, genérico, a mano, servicio, sin costo, no existe, costo dudoso', () => {
  const clase = (o) => clasificarLinea(linea(o), inventario).clase
  assert.equal(clase({ sku: 'ACE-5W30', precio: 35700 }), 'medido')
  // El código de barras y el PROD-<id> también encuentran el producto.
  assert.equal(clase({ codigo: '7701234', precio: 17850 }), 'medido')
  assert.equal(clase({ codigo: 'PROD-77', precio: 11900 }), 'medido')
  assert.equal(clase({ sku: 'PROD-1105', nombre: 'CULATA MAZDA 3', precio: 4200000 }), 'generico')
  assert.equal(clase({ sku: '', codigo: '', nombre: 'CAMPANA DE FRENO', precio: 1100000 }), 'sin_referencia')
  assert.equal(clase({ sku: 'MO1', nombre: 'MANO OBRA AIRE ACONDICIONADO', precio: 150000 }), 'servicio')
  assert.equal(clase({ sku: 'PROD-1290', precio: 30000 }), 'servicio')
  assert.equal(clase({ sku: '7943GAM-I', precio: 98000 }), 'sin_costo')
  assert.equal(clase({ sku: 'YA-NO-ESTA', precio: 50000 }), 'no_existe')
  // Bolsa a $20 con costo $76.639: -383.000% no es un margen, es un dato malo.
  assert.equal(clase({ sku: 'PROD-2', precio: 20 }), 'costo_dudoso')
})

test('margen ponderado por pesos vendidos, sin promediar lo que no tiene costo', () => {
  const filas = [
    ot('2026-09-03T17:00:00Z', [
      // 4 cuartos a $35.700 c/IVA = $120.000 sin IVA, costo 4 × 20.000 = 80.000
      linea({ sku: 'ACE-5W30', precio: 35700, cantidad: 4 }),
      // $15.000 sin IVA, costo 9.000
      linea({ sku: 'FIL-AC-1', precio: 17850 }),
      linea({ nombre: 'ALINEACION', precio: 60000, esServicio: true, sku: 'MO1' }),
    ], { ot: 'OT-0300' }),
    ot('2026-09-12T17:00:00Z', [
      linea({ sku: 'PROD-1105', nombre: 'CULATA MAZDA 3', precio: 4998000 }),
      linea({ nombre: 'CAMPANA DE FRENO', precio: 1309000 }),
      linea({ sku: '7943GAM-I', precio: 119000 }),
    ], { ot: 'OT-0301' }),
  ]
  const r = margenDelMes(filas, '2026-09', inventario)
  assert.equal(r.ots, 2)
  assert.equal(r.lineas, 5) // la alineación es servicio: no es venta de repuestos
  assert.equal(Math.round(r.medido.venta), 135000)
  assert.equal(Math.round(r.medido.costo), 89000)
  assert.equal(Math.round(r.medido.margen * 10) / 10, 34.1) // 46.000 / 135.000
  // La culata y la campana van aparte y NO suben el margen a 90%.
  assert.equal(Math.round(r.fuera.generico.venta), 4200000)
  assert.equal(r.fuera.generico.lineas[0].ot, 'OT-0301')
  assert.equal(Math.round(r.fuera.sin_referencia.venta), 1100000)
  assert.equal(Math.round(r.fuera.sin_costo.venta), 100000)
  assert.equal(Math.round(r.venta), 5535000)
  assert.equal(Math.round(r.cobertura * 1000) / 1000, 0.024)
  // Por producto, primero lo que más pesa en pesos.
  assert.deepEqual(r.productos.map(p => p.referencia), ['ACE-5W30', 'FIL-AC-1'])
  assert.equal(r.productos[0].unidades, 4)
  assert.equal(Math.round(r.productos[0].peso * 100), 89)
  assert.equal(Math.round(r.productos[1].margen), 40)
})

test('las líneas de un mismo producto se suman aunque lleguen por SKU o por código de barras', () => {
  const filas = [ot('2026-09-03T17:00:00Z', [
    linea({ sku: 'FIL-AC-1', precio: 17850 }),
    linea({ codigo: '7701234', precio: 17850, cantidad: 2 }),
  ])]
  const r = margenDelMes(filas, '2026-09', inventario)
  assert.equal(r.productos.length, 1)
  assert.equal(r.productos[0].unidades, 3)
})

test('un mes sin ventas medibles no inventa margen, y la comparación lo respeta', () => {
  const vacio = margenDelMes([], '2026-08', inventario)
  assert.equal(vacio.medido.margen, null)
  assert.equal(vacio.cobertura, null)
  const sep = margenDelMes([ot('2026-09-03T17:00:00Z', [linea({ sku: 'ACE-5W30', precio: 35700 })])], '2026-09', inventario)
  const c = compararMeses(sep, vacio)
  assert.equal(c.venta, null)
  assert.equal(c.margenPuntos, null)
})

test('comparación contra el mes anterior en puntos de margen', () => {
  const ago = margenDelMes([ot('2026-08-20T17:00:00Z', [linea({ sku: 'ACE-5W30', precio: 29750 })])], '2026-08', inventario) // 25.000 → 20%
  const sep = margenDelMes([ot('2026-09-03T17:00:00Z', [linea({ sku: 'ACE-5W30', precio: 35700 })])], '2026-09', inventario) // 30.000 → 33,3%
  const c = compararMeses(sep, ago)
  assert.equal(Math.round(c.margenPuntos * 10) / 10, 13.3)
  assert.equal(Math.round(c.venta * 100), 20)
})

test('cada clave de fuera del margen tiene su explicación', () => {
  const r = margenDelMes([], '2026-09', inventario)
  assert.deepEqual(Object.keys(r.fuera).sort(), FUERA_DEL_MARGEN.map(c => c.clave).sort())
  for (const c of FUERA_DEL_MARGEN) assert.ok(c.titulo && c.por)
})

test('regla de facturación: repuesto a mano o por el genérico no se factura', () => {
  assert.equal(faltaProducto(linea({ nombre: 'CAMPANA DE FRENO', precio: 1100000 })), 'sin_referencia')
  assert.equal(faltaProducto(linea({ sku: 'prod-1105 ', nombre: 'TOPE AMORTIGUADOR', precio: 90000 })), 'generico')
  assert.equal(faltaProducto(linea({ sku: 'ACE-5W30', precio: 35700 })), null)
  // Mano de obra y servicios no llevan producto.
  assert.equal(faltaProducto(linea({ nombre: 'ALINEACION', precio: 60000, esServicio: true })), null)
  assert.equal(faltaProducto({ nombre: 'SCANNER', precio: 50000, es_servicio: 1 }), null)
  // MO1 elegido a propósito en un repuesto: servicio externo, se deja pasar.
  assert.equal(faltaProducto(linea({ sku: 'MO1', nombre: 'MANTENIMIENTO AIRE', precio: 150000 })), null)
  // Una línea en blanco no bloquea.
  assert.equal(faltaProducto(linea({ nombre: '  ', precio: 0 })), null)
})

test('lineasSinProducto lee los items como texto o arreglo', () => {
  const items = [linea({ nombre: 'SOPORTE CAJA', precio: 180000 }), linea({ sku: 'FIL-AC-1', precio: 17850 })]
  assert.deepEqual(lineasSinProducto(items).map(x => x.motivo), ['sin_referencia'])
  assert.equal(lineasSinProducto(JSON.stringify(items)).length, 1)
  assert.deepEqual(lineasSinProducto('no es json'), [])
  assert.equal(referenciaDe({ codigo: ' abc-1 ' }), 'ABC-1')
})
