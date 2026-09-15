// Gastos fijos del mes (src/utils/gastos.js). Corre con: npm test
//
// Los tres gastos fijos del brief: arriendo $1.500.000, nómina $3.160.000 y el
// crédito del taller $2.500.000 el día 15. Datos inventados, sin base.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fijosDelMes, sueltosDelMes, totalesDelMes, vencimiento, sumarMeses, nombreMes,
  claveCuentti, cuenttiPorDefecto, faltaParaCuentti, validarGasto,
} from '../src/utils/gastos.js'

const FIJOS = [
  { id: 'f-arr', recurrente: true, activo: true, categoria: 'arriendo', concepto: 'Arriendo del local', monto: 1500000, dia_pago: 5, fecha: '2026-09-01' },
  { id: 'f-nom', recurrente: true, activo: true, categoria: 'nomina', concepto: 'Nómina', monto: 3160000, dia_pago: null, fecha: '2026-09-01' },
  { id: 'f-cre', recurrente: true, activo: true, categoria: 'credito', concepto: 'Crédito del taller', monto: 2500000, dia_pago: 15, fecha: '2026-09-01' },
  // Apagado en octubre, pero septiembre ya estaba pagado.
  { id: 'f-tv', recurrente: true, activo: false, categoria: 'servicios', concepto: 'Televisión', monto: 60000, dia_pago: 20, fecha: '2026-09-01' },
]
const PAGOS = [
  { id: 'p1', recurrente: false, gasto_fijo_id: 'f-arr', periodo: '2026-09', fecha: '2026-09-04', monto: 1500000, categoria: 'arriendo', concepto: 'Arriendo del local' },
  { id: 'p2', recurrente: false, gasto_fijo_id: 'f-tv', periodo: '2026-09', fecha: '2026-09-18', monto: 65000, categoria: 'servicios', concepto: 'Televisión' },
]
const SUELTOS = [
  { id: 's1', recurrente: false, fecha: '2026-09-10', monto: 52050, categoria: 'otros', concepto: 'Mercado', created_at: '2026-09-10T10:00:00Z' },
  { id: 's2', recurrente: false, fecha: '2026-09-12', monto: 250124, categoria: 'servicios', concepto: 'Agua', created_at: '2026-09-12T10:00:00Z' },
  { id: 's3', recurrente: false, fecha: '2026-08-30', monto: 86000, categoria: 'servicios', concepto: 'Software', created_at: '2026-08-30T10:00:00Z' },
]
const FILAS = [...FIJOS, ...PAGOS, ...SUELTOS]

test('el dia de pago cae dentro del mes, aunque el mes sea corto', () => {
  assert.equal(vencimiento({ dia_pago: 15 }, '2026-09'), '2026-09-15')
  assert.equal(vencimiento({ dia_pago: 31 }, '2026-09'), '2026-09-30')
  assert.equal(vencimiento({ dia_pago: 30 }, '2027-02'), '2027-02-28')
  assert.equal(vencimiento({ dia_pago: null }, '2026-09'), null)
  assert.equal(sumarMeses('2026-12', 1), '2027-01')
  assert.equal(sumarMeses('2026-01', -1), '2025-12')
  assert.equal(nombreMes('2026-09'), 'septiembre 2026')
})

test('septiembre a mitad de mes: pagado, vencido y pendiente, en ese orden', () => {
  const f = fijosDelMes(FILAS, '2026-09', '2026-09-16')
  assert.deepEqual(f.map(x => `${x.fijo.id}:${x.estado}`), ['f-cre:vencido', 'f-nom:pendiente', 'f-arr:pagado', 'f-tv:pagado'])
  assert.equal(f.find(x => x.fijo.id === 'f-arr').pago.id, 'p1')
})

test('antes del dia 15 el credito esta pendiente; en un mes ya cerrado, lo sin pagar esta vencido', () => {
  assert.equal(fijosDelMes(FILAS, '2026-09', '2026-09-14').find(x => x.fijo.id === 'f-cre').estado, 'pendiente')
  const octubreVistoEnNoviembre = fijosDelMes(FILAS, '2026-10', '2026-11-02')
  assert.ok(octubreVistoEnNoviembre.every(x => x.estado === 'vencido'))
  // Apagado y sin pago en octubre: ya no se espera.
  assert.ok(!octubreVistoEnNoviembre.some(x => x.fijo.id === 'f-tv'))
})

test('un gasto fijo no aparece antes del mes desde el que aplica', () => {
  assert.equal(fijosDelMes(FILAS, '2026-08', '2026-09-16').length, 0)
})

test('totales: lo pagado por lo que se pago, lo que falta por lo esperado', () => {
  const periodo = '2026-09'
  const t = totalesDelMes(fijosDelMes(FILAS, periodo, '2026-09-16'), sueltosDelMes(FILAS, periodo))
  assert.equal(t.pagadoFijos, 1565000)
  assert.equal(t.falta, 5660000)
  assert.equal(t.vencido, 2500000)
  assert.equal(t.esperado, 7225000)
  assert.equal(t.sueltos, 302174)
  assert.equal(t.salidas, 1867174)
})

test('sueltos del mes, el mas reciente primero; los pagos de un fijo no son sueltos', () => {
  assert.deepEqual(sueltosDelMes(FILAS, '2026-09').map(g => g.id), ['s2', 's1'])
})

test('clave para Cuentti: un pago por fijo y mes, o el id del suelto', () => {
  assert.equal(claveCuentti(PAGOS[0]), 'gasto:f-arr:2026-09')
  assert.equal(claveCuentti(SUELTOS[0]), 'gasto:s1')
})

test('nomina y credito no se registran en Cuentti por defecto', () => {
  assert.equal(cuenttiPorDefecto('arriendo'), true)
  assert.equal(cuenttiPorDefecto('nomina'), false)
  assert.equal(cuenttiPorDefecto('credito'), false)
  assert.deepEqual(faltaParaCuentti({ proveedor_nit: '900.111.222-3', id_plan_cuentas: 39 }), [])
  assert.deepEqual(faltaParaCuentti({ proveedor_nit: '', id_plan_cuentas: null }), ['el NIT o la cédula del proveedor', 'la cuenta de Cuentti'])
})

test('validarGasto dice que falta', () => {
  const bueno = { categoria: 'arriendo', concepto: 'Arriendo', monto: 1500000, fecha: '2026-09-01', dia_pago: 5 }
  assert.equal(validarGasto(bueno, { fijo: true }), null)
  assert.equal(validarGasto({ ...bueno, monto: 0 }), 'El monto debe ser mayor a 0')
  assert.equal(validarGasto({ ...bueno, concepto: '  ' }), 'Escribe el concepto')
  assert.equal(validarGasto({ ...bueno, dia_pago: 32 }), 'El día de pago va del 1 al 31')
  assert.equal(validarGasto({ ...bueno, categoria: 'viajes' }), 'Elige la categoría')
  assert.equal(validarGasto({ ...bueno, metodo_pago: 'credito' }), 'Método de pago no válido')
})
