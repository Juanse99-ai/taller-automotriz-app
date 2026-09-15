// Resolucion de proveedores de Cuentti por NIT (api/_lib/proveedor.js), que
// ahora comparten el MCP y los gastos de la app. Corre con: npm test
// Cuentti falso: una funcion `pedir` con respuestas armadas, sin red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidatosNit, resolverProveedor } from '../api/_lib/proveedor.js'

const cliente = (id, identificacion, nombre, activo = 1) => ({ id_cliente: id, identificacion, nombre_cliente: nombre, es_activo: activo, id_tipo_persona: 2 })
const fakeCuentti = (tabla) => async (path) => {
  const ident = decodeURIComponent(path.split('/').pop())
  return tabla[ident] ? [tabla[ident]] : { message: 'No existe' }
}

test('candidatos: como viene y, si trae el DV pegado, sin el', () => {
  assert.deepEqual(candidatosNit('902.045.058-2'), ['9020450582', '902045058'])
  assert.deepEqual(candidatosNit('72145987'), ['72145987'])
  assert.deepEqual(candidatosNit(''), [])
})

test('encuentra el proveedor aunque la factura traiga el DV', async () => {
  const p = await resolverProveedor('9020450582', fakeCuentti({ 902045058: cliente(88, '902045058', 'REPUESTOS SAS') }))
  assert.equal(p.id, 88)
  assert.equal(p.viaDV, true)
  assert.equal(p.ambiguo, undefined)
})

test('un duplicado inactivo no bloquea: gana el activo', async () => {
  const p = await resolverProveedor('9020450582', fakeCuentti({
    9020450582: cliente(10, '9020450582', 'REPUESTOS SAS (viejo)', 0),
    902045058: cliente(88, '902045058', 'REPUESTOS SAS'),
  }))
  assert.equal(p.id, 88)
  assert.equal(p.descartados.length, 1)
  assert.ok(!p.ambiguo)
})

test('dos activos para el mismo NIT: ambiguo, decide un humano', async () => {
  const p = await resolverProveedor('8002223331', fakeCuentti({
    8002223331: cliente(42, '8002223331', 'GASES (con DV)'),
    800222333: cliente(41, '800222333', 'GASES'),
  }))
  assert.equal(p.ambiguo.length, 2)
})

test('no existe: null, y un error de red cuenta como no encontrado', async () => {
  assert.equal(await resolverProveedor('555', fakeCuentti({})), null)
  assert.equal(await resolverProveedor('555', async () => { throw new Error('caido') }), null)
})
