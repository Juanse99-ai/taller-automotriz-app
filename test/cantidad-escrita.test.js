// Cantidad escrita con el teclado decimal del celular. Corre con: npm test
//
// En Colombia ese teclado solo trae la coma. Lo que se guarda tiene que leerse
// igual en la app (cantidadItem) y en la factura de Cuentti (parseFloat).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cantidadEscrita, cantidadItem } from '../src/utils/helpers.js'

test('la coma se guarda como punto', () => {
  assert.equal(cantidadEscrita('0,5'), '0.5')
  assert.equal(cantidadEscrita('0.5'), '0.5')
  assert.equal(cantidadEscrita('2'), '2')
})

test('media unidad escrita con coma se factura como media unidad', () => {
  const guardada = cantidadEscrita('0,5')
  assert.equal(parseFloat(guardada) || 1, 0.5) // como lee la cantidad buildFacturaPayload
  assert.equal(cantidadItem({ cantidad: guardada }), 0.5)
})

test('solo digitos y un separador', () => {
  assert.equal(cantidadEscrita('1,5,3'), '1.53')
  assert.equal(cantidadEscrita('-3'), '3')
  assert.equal(cantidadEscrita('2 und'), '2')
  assert.equal(cantidadEscrita(','), '.')
})

test('vacio sigue vacio (cantidadItem lo cobra como 1, igual que antes)', () => {
  assert.equal(cantidadEscrita(''), '')
  assert.equal(cantidadEscrita(undefined), '')
  assert.equal(cantidadItem({ cantidad: cantidadEscrita('') }), 1)
})
