// Flujo de caja del mes (src/utils/flujoCaja.js). Corre con: npm test
//
// Los movimientos imitan los de la base: el adelanto de Víctor "SE LOS DI EN
// BARANOA", el descuento en la liquidación #PB260730, el saldo a favor, las
// nóminas registradas en Cuentti desde Liquidación (LQ-…) y el agua de Triple A
// registrada con Claude. Datos inventados, sin red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  flujoDelMes, movimientosDelMes, esAjusteDeLiquidacion, esEgresoDeLaApp, GRUPOS_ENTRADA, GRUPOS_SALIDA,
} from '../src/utils/flujoCaja.js'

const DATOS = {
  pagos: [
    { trabajo_id: 'TR-1', fecha: '2026-09-02', monto: '1309000.00', metodo: 'transferencia' },
    { trabajo_id: 'TR-2', fecha: '2026-09-10', monto: 450000, metodo: 'efectivo' },
    { trabajo_id: 'TR-3', fecha: '2026-08-31', monto: 999999, metodo: 'efectivo' },
  ],
  gastos: [
    { id: 'f1', recurrente: true, concepto: 'Arriendo del taller', monto: 500000, fecha: '2026-09-01' },
    // El arriendo de agosto pagado en septiembre: sale en septiembre.
    { id: 'p1', recurrente: false, gasto_fijo_id: 'f1', periodo: '2026-08', concepto: 'Arriendo del taller', monto: '500000.00', fecha: '2026-09-03' },
    { id: 's1', recurrente: false, gasto_fijo_id: null, concepto: 'Recarga de gas', monto: 90000, fecha: '2026-09-05' },
  ],
  liquidaciones: [
    // 8:30 pm del 30 de septiembre en Colombia = 1 de octubre en UTC.
    { id: 'LQ-PB260930', fecha: '2026-10-01T01:30:00Z', tecnico: 'Pedro Barraza', pagado: 900000, neto: 1000000 },
    { id: 'LQ-VP260910', fecha: '2026-09-10T17:00:00Z', tecnico: 'Víctor Padilla', pagado: null, neto: 300000 },
  ],
  prestamos: [
    { persona: 'Víctor Padilla', tecnico_id: 2, tipo: 'prestamo', monto: '100000', nota: 'ADELANTO DE TRABAJOS, SE LOS DI EN BARANOA EN EL CARRO', fecha: '2026-09-04' },
    { persona: 'Pedro Barraza', tecnico_id: 1, tipo: 'abono', monto: '100000', nota: 'Descuento en liquidación #PB260905-3', fecha: '2026-09-05' },
    { persona: 'Pedro Barraza', tecnico_id: 1, tipo: 'abono', monto: '49353', nota: 'Saldo a favor · liquidación #PB260909-2 (pagué $ 65.000 de $ 114.353)', fecha: '2026-09-09' },
    { persona: 'Nicanor Escorcia', tecnico_id: null, tipo: 'abono', monto: '40000', nota: '', fecha: '2026-09-10' },
  ],
  compras: [
    { proveedor_nombre: 'AUTOPARTES CASTELMOTORS SAS', numero_factura: 'BQU-31533', fecha: '2026-09-08', total: '1250000' },
  ],
  bitacora: [
    { numero_factura: '7428649', concepto: 'Agua local (acueducto/alcantarillado/aseo)', proveedor_nombre: 'TRIPLE A', fecha: '2026-09-12', total: 250124, anulado_en: null },
    { numero_factura: 'JB708', concepto: 'Servicio de reparación', fecha: '2026-09-12', total: 57130, anulado_en: '2026-09-13T10:00:00Z' },
    { numero_factura: 'LQ-VP260910', concepto: 'Nómina', fecha: '2026-09-10', total: 300000, anulado_en: null },
    { numero_factura: 'gasto:f1:2026-08', concepto: 'Arriendo del taller', fecha: '2026-09-03', total: 500000, anulado_en: null },
    { numero_factura: 'PR-mtw77v2ozxceq', concepto: 'Préstamo', fecha: '2026-09-04', total: 100000, anulado_en: null },
  ],
}

test('los ajustes de una liquidación no son plata que entre o salga', () => {
  assert.equal(esAjusteDeLiquidacion({ nota: 'Descuento en liquidación #PB260730' }), true)
  assert.equal(esAjusteDeLiquidacion({ nota: 'Saldo a favor pagado en liquidacion #PB260910' }), true)
  assert.equal(esAjusteDeLiquidacion({ nota: 'ADELANTO DE TRABAJOS' }), false)
  assert.equal(esAjusteDeLiquidacion({ nota: null }), false)
})

test('los egresos que la app ya cuenta no se repiten desde la bitácora de Cuentti', () => {
  assert.equal(esEgresoDeLaApp({ numero_factura: 'gasto:f1:2026-09' }), true)
  assert.equal(esEgresoDeLaApp({ numero_factura: 'LQ-PB260914' }), true)
  assert.equal(esEgresoDeLaApp({ numero_factura: 'PR-mtw77v2ozxceq' }), true)
  assert.equal(esEgresoDeLaApp({ numero_factura: 'FD31512289' }), false)
})

test('septiembre: cada grupo con su plata, por la fecha en que se movió', () => {
  const ots = new Map([['TR-1', 'OT-0229'], ['TR-2', 'OT-0231']])
  const f = flujoDelMes(DATOS, '2026-09', ots)
  assert.deepEqual(f.porGrupo, {
    cobros: 1759000, abonos: 40000,
    fijos: 500000, sueltos: 90000, liquidaciones: 1200000, prestamos: 100000, compras: 1250000, otros: 250124,
  })
  assert.equal(f.entro, 1799000)
  assert.equal(f.salio, 3390124)
  assert.equal(f.neto, 1799000 - 3390124)
  const cobro = f.movimientos.find(m => m.grupo === 'cobros' && m.monto === 1309000)
  assert.equal(cobro.concepto, 'OT-0229 · transferencia')
  // El pago del 31 de agosto no entra en septiembre.
  assert.ok(!f.movimientos.some(m => m.monto === 999999))
})

test('la liquidación de la noche del 30 cuenta en septiembre, y sin `pagado` vale el neto', () => {
  const liq = movimientosDelMes(DATOS, '2026-09').filter(m => m.grupo === 'liquidaciones')
  assert.deepEqual(liq.map(m => [m.concepto, m.monto, m.fecha]).sort(), [['Liquidación Pedro Barraza', 900000, '2026-09-30'], ['Liquidación Víctor Padilla', 300000, '2026-09-10']])
  assert.equal(movimientosDelMes(DATOS, '2026-10').filter(m => m.grupo === 'liquidaciones').length, 0)
})

test('los movimientos van del más reciente al más viejo', () => {
  const fechas = movimientosDelMes(DATOS, '2026-09').map(m => m.fecha)
  assert.deepEqual(fechas, [...fechas].sort().reverse())
})

test('un mes sin datos da ceros, no errores', () => {
  const f = flujoDelMes({}, '2026-01')
  assert.equal(f.entro, 0)
  assert.equal(f.salio, 0)
  assert.equal(f.movimientos.length, 0)
  for (const g of [...GRUPOS_ENTRADA, ...GRUPOS_SALIDA]) assert.ok(g.titulo && g.de)
})
