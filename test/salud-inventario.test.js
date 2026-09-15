// Salud del inventario (src/utils/saludInventario.js). Corre con: npm test
//
// Los productos son los casos reales del brief del dueño: MO1 con costo mayor
// al precio, la bolsa a $20, el juego de llaves a $1, el sensor MAP a $2, el
// terminal en -21 y las pastillas sin costo. Datos inventados, sin red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diagnosticarProducto, resumirSalud, unidadesVendidas, detalleProblema,
  PRECIO_SIMBOLICO, MARGEN_BAJO, MARGEN_ALTO,
} from '../src/utils/saludInventario.js'

const prod = (o) => ({ id: o.sku, nombre: o.sku, precioBase: 0, costoBase: 0, stock: 0, esServicio: false, ...o })
const pesos = (n) => `$${Math.round(n).toLocaleString('es-CO')}`

test('MO1 es mano de obra aunque Cuentti no lo marque servicio: solo "servicio con costo"', () => {
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'MO1', precioBase: 60000, costoBase: 174000, stock: -300 })), ['servicio_con_costo'])
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'mo1 ', precioBase: 60000, costoBase: 1 })), ['servicio_con_costo'])
  // Un servicio sin costo esta bien, y su stock no se mira.
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'SERV', esServicio: true, precioBase: 50000, stock: -8 })), [])
})

test('precio simbolico y precio menor al costo (bolsa, juego de llaves, sensor MAP)', () => {
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'PROD-2', precioBase: 20, costoBase: 76639 })), ['precio_simbolico', 'bajo_costo'])
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'JLL', precioBase: 1, costoBase: 75000 })), ['precio_simbolico', 'bajo_costo'])
  // $2 con costo $1 da 50% de margen: sin el filtro de precio no saltaba en nada.
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'MAP-SPK', precioBase: 2, costoBase: 1, stock: 4 })), ['precio_simbolico'])
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'ARANDELA', precioBase: PRECIO_SIMBOLICO, costoBase: 60 })), [])
})

test('stock negativo y sin costo (terminal en -21, pastillas 7943GAM-I)', () => {
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'TOP-01', precioBase: 1500, costoBase: 700, stock: -21 })), ['stock_negativo'])
  assert.deepEqual(diagnosticarProducto(prod({ sku: '7943GAM-I', precioBase: 82353, stock: 6 })), ['sin_costo'])
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'BAT', precioBase: 319328, stock: -1 })), ['sin_costo', 'stock_negativo'])
})

test('margen fuera de rango, con los bordes adentro', () => {
  const conMargen = (m) => prod({ sku: `M${m}`, precioBase: 100000, costoBase: 100000 * (1 - m / 100) })
  assert.deepEqual(diagnosticarProducto(conMargen(5)), ['margen_raro'])
  assert.deepEqual(diagnosticarProducto(conMargen(92)), ['margen_raro'])
  assert.deepEqual(diagnosticarProducto(conMargen(MARGEN_BAJO)), [])
  assert.deepEqual(diagnosticarProducto(conMargen(MARGEN_ALTO)), [])
  assert.deepEqual(diagnosticarProducto(conMargen(43)), [])
  // Precio 0 con costo: el precio se pone al facturar (genericos). No es error.
  assert.deepEqual(diagnosticarProducto(prod({ sku: 'SALDO', precioBase: 0, costoBase: 3000 })), [])
})

test('unidadesVendidas: OT completadas, no borradas, desde la fecha, con decimales', () => {
  const hace = (d) => new Date(Date.now() - d * 86400000).toISOString()
  const trabajos = [
    { estado: 'Completado', fecha: hace(3), items: [{ sku: '7943GAM-I', cantidad: 2 }, { codigo: 'sil-gris', cantidad: '0,5' }, { nombre: 'ALINEACION', cantidad: 1, esServicio: true }] },
    { estado: 'Completado', fecha: hace(10), items: JSON.stringify([{ sku: '7943GAM-I', cantidad: 1 }]) },
    { estado: 'Completado', fecha: hace(200), items: [{ sku: '7943GAM-I', cantidad: 50 }] },
    { estado: 'En Progreso', fecha: hace(1), items: [{ sku: '7943GAM-I', cantidad: 9 }] },
    { estado: 'Completado', fecha: hace(1), deleted: true, items: [{ sku: '7943GAM-I', cantidad: 9 }] },
  ]
  const m = unidadesVendidas(trabajos, hace(90))
  assert.equal(m.get('7943GAM-I'), 3)
  assert.equal(m.get('SIL-GRIS'), 0.5)
  // Escrita a mano: se factura como MO1.
  assert.equal(m.get('MO1'), 1)
})

test('resumirSalud cuenta por categoria, un producto una vez, y ordena por daño', () => {
  const productos = [
    prod({ sku: 'SANO', precioBase: 25000, costoBase: 14280, stock: 6 }),
    prod({ sku: 'TOP-01', precioBase: 1500, costoBase: 700, stock: -21 }),
    prod({ sku: 'BAT-1', precioBase: 300000, costoBase: 250000, stock: -1 }),
    prod({ sku: 'PROD-2', precioBase: 20, costoBase: 76639, stock: 0 }),
    prod({ sku: 'NADIE', nombre: 'A no vendido', precioBase: 9000, stock: 40 }),
    prod({ sku: 'VENDIDO', nombre: 'Z vendido', precioBase: 9000, stock: 1 }),
  ]
  const vendidos = new Map([['VENDIDO', 7]])
  const r = resumirSalud(productos, vendidos)
  assert.equal(r.revisados, 6)
  assert.equal(r.afectados, 5)
  assert.deepEqual(r.porCategoria.stock_negativo.map(p => p.sku), ['TOP-01', 'BAT-1'])
  assert.deepEqual(r.porCategoria.sin_costo.map(p => p.sku), ['VENDIDO', 'NADIE'])
  assert.deepEqual(r.porCategoria.bajo_costo.map(p => p.sku), ['PROD-2'])
  assert.equal(r.porCategoria.precio_simbolico.length, 1)
})

test('detalleProblema lo dice con pesos', () => {
  assert.equal(detalleProblema('bajo_costo', prod({ precioBase: 20, costoBase: 76639 }), pesos), 'Pierde $76.619 por unidad (precio $20, costo $76.639)')
  assert.equal(detalleProblema('servicio_con_costo', prod({ costoBase: 174000 }), pesos), 'Costo $174.000 en un servicio')
  assert.equal(detalleProblema('stock_negativo', prod({ stock: -21 }), pesos), 'Faltan 21 unidades por registrar')
  assert.equal(detalleProblema('stock_negativo', prod({ stock: -1 }), pesos), 'Falta 1 unidad por registrar')
})
