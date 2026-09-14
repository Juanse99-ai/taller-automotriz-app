/* global process */
// Metricas de OT del MCP del taller. Corre con: npm test
//
// Cubre los dos fallos que dejaron el dashboard en $0 durante meses:
//   1. un estado que no existe en el catalogo no puede desaparecer en silencio
//   2. las OT con deleted = true no entran en conteos ni sumas
// Todo con datos inventados y un PostgREST falso: no toca la red ni la base.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADOS, ESTADOS_ACTIVOS } from '../src/utils/estados.js'
import {
  SIN_BORRADAS, hoyTaller, resumirTrabajos, sumaTotal, agruparPorEstado,
  avisoEstadosDesconocidos, estadosInexistentesEnFiltro,
} from '../api/_mcp/trabajos.js'

// ---------- datos ----------------------------------------------------------

const hoy = hoyTaller()
const diaDelMesPasado = (() => {
  const d = new Date(`${hoy.slice(0, 7)}-01T12:00:00Z`)
  d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
})()
const aLas3 = (dia) => `${dia}T15:00:00-05:00` // hora de Bogota

const TRABAJOS = [
  { id: 'a', ot_codigo: 'OT-0201', estado: 'Completado', total: 100000, fecha: aLas3(hoy), cuentti_id_transacion: '9001', deleted: false, placa: 'AAA111', cliente: 'ANA' },
  { id: 'b', ot_codigo: 'OT-0202', estado: 'Completado', total: 50000, fecha: aLas3(diaDelMesPasado), cuentti_id_transacion: null, deleted: false, placa: 'BBB222', cliente: 'BETO' },
  { id: 'c', ot_codigo: 'OT-0203', estado: 'En Progreso', total: 30000, fecha: aLas3(hoy), deleted: false, placa: 'CCC333', cliente: 'CARLA' },
  { id: 'g', ot_codigo: 'OT-0204', estado: 'Esperando Repuestos', total: 10000, fecha: aLas3(diaDelMesPasado), deleted: null, placa: 'GGG777', cliente: 'GABY' },
  { id: 'f', ot_codigo: 'OT-0205', estado: 'Entregado', total: 20000, fecha: aLas3(hoy), deleted: false, placa: 'FFF666', cliente: 'FIDEL' },
  // Borradas: el duplicado de JQQ567 y una completada. No deben contar en nada.
  { id: 'd', ot_codigo: 'OT-0306', estado: 'Pendiente', total: 730000, fecha: aLas3(diaDelMesPasado), deleted: true, placa: 'JQQ567', cliente: 'DUPLICADO' },
  { id: 'e', ot_codigo: 'OT-0307', estado: 'Completado', total: 148000, fecha: aLas3(hoy), cuentti_id_transacion: '9002', deleted: true, placa: 'EEE555', cliente: 'BORRADA' },
]
const ids = (filas) => filas.map(t => t.id).sort()
const digitos = (n) => new RegExp(n.toLocaleString('es-CO').replace(/\./g, '\\.'))

// ---------- logica pura ----------------------------------------------------

test('las OT borradas quedan fuera de todos los conteos y sumas', () => {
  const r = resumirTrabajos(TRABAJOS, { hoy, desde: hoy.slice(0, 7) })
  const todas = [...r.vivas, ...r.activas, ...r.completadas, ...r.sinFacturar, ...r.ingresadasHoy, ...r.delPeriodo, ...r.desconocidas]
  assert.equal(todas.filter(t => t.deleted === true).length, 0)
  assert.deepEqual(ids(r.completadas), ['a', 'b'])
  assert.equal(sumaTotal(r.completadas), 150000)   // sin los 148.000 de la borrada
  assert.deepEqual(ids(r.activas), ['c', 'g'])     // sin el Pendiente borrado
  assert.equal(r.vivas.length, 5)
})

test('un estado que no existe no desaparece en silencio', () => {
  const r = resumirTrabajos(TRABAJOS, { hoy, desde: hoy.slice(0, 7) })
  assert.deepEqual(ids(r.desconocidas), ['f'])
  assert.ok(!r.activas.includes(TRABAJOS[4]) && !r.completadas.includes(TRABAJOS[4]))
  assert.deepEqual(agruparPorEstado(r.desconocidas), { Entregado: { n: 1, total: 20000 } })
  const aviso = avisoEstadosDesconocidos(r.desconocidas, (n) => `$${n}`)
  assert.match(aviso, /Entregado/)
  assert.match(aviso, /\$20000/)
  assert.equal(avisoEstadosDesconocidos([], String), '')
})

test('activas son todos los estados salvo Completado y Cancelado', () => {
  assert.deepEqual([...ESTADOS_ACTIVOS].sort(), Object.values(ESTADOS).filter(e => e !== 'Completado' && e !== 'Cancelado').sort())
  assert.ok(ESTADOS_ACTIVOS.includes('Esperando Repuestos'))
  assert.ok(ESTADOS_ACTIVOS.includes('Programado'))
})

test('deleted en null es una OT viva, y un estado vacio se lee como Pendiente', () => {
  const r = resumirTrabajos([{ id: 'x', estado: null, total: 5, deleted: null }], {})
  assert.deepEqual(ids(r.activas), ['x'])
  assert.equal(r.desconocidas.length, 0)
})

test('detecta estados inexistentes en un filtro PostgREST', () => {
  assert.deepEqual(estadosInexistentesEnFiltro('trabajos', 'estado=eq.Entregado'), ['Entregado'])
  assert.deepEqual(estadosInexistentesEnFiltro('trabajos', 'placa=eq.ABC&estado=in.(Pendiente,"En%20Proceso")'), ['En Proceso'])
  assert.deepEqual(estadosInexistentesEnFiltro('trabajos', 'estado=not.in.(Completado,Cancelado)'), [])
  assert.deepEqual(estadosInexistentesEnFiltro('cotizaciones', 'estado=eq.Facturada'), [])
  assert.deepEqual(estadosInexistentesEnFiltro('cotizaciones', 'estado=eq.Completado'), ['Completado'])
  assert.deepEqual(estadosInexistentesEnFiltro('pagos', 'estado=eq.lo-que-sea'), [])
})

// ---------- herramientas MCP contra un PostgREST falso ---------------------

process.env.MCP_TOKEN = 'token-de-prueba'
process.env.MCP_SUPABASE_URL = 'https://supabase.falso'
process.env.SUPABASE_KEY = 'clave-falsa'
const { default: handler } = await import('../api/mcp/taller.js')

// ignoraBorrado: simula un servidor que NO aplica deleted=not.is.true, para
// probar que la herramienta tampoco las contaria si alguna se colara.
function postgrestFalso({ ignoraBorrado = false } = {}) {
  const peticiones = []
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url)
    const tabla = u.pathname.split('/').pop()
    peticiones.push({ tabla, metodo: opts.method || 'GET', query: u.search })
    if ((opts.method || 'GET') !== 'GET') return new Response('[]', { status: 201 })
    let filas = tabla === 'trabajos' ? [...TRABAJOS] : []
    for (const [k, v] of u.searchParams) {
      if (k === 'deleted' && v === 'not.is.true' && !ignoraBorrado) filas = filas.filter(t => t.deleted !== true)
      if (k === 'estado' && v.startsWith('eq.')) filas = filas.filter(t => t.estado === v.slice(3))
      if (k === 'or') {
        const m = v.match(/^\(id\.eq\.(.*),ot_codigo\.eq\.(.*)\)$/)
        if (m) filas = filas.filter(t => t.id === m[1] || t.ot_codigo === m[2])
      }
    }
    const offset = Number(u.searchParams.get('offset') || 0)
    const limit = Number(u.searchParams.get('limit') || filas.length)
    return new Response(JSON.stringify(filas.slice(offset, offset + limit)), { status: 200 })
  }
  return peticiones
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

test('dashboard: cifras sin borradas y aviso del estado desconocido', async () => {
  postgrestFalso()
  const out = await llamar('dashboard')
  assert.match(out, /\| OT activas \(sin completar ni cancelar\) \| 2 \|/)
  assert.match(out, /\| Listas para entregar \(completadas sin factura\) \| 1 \|/)
  assert.match(out, /Ingresos del mes \(1 OT completadas\) \| \$\s100\.000/)
  assert.match(out, /Historico completado \(2 OT\) \| \$\s150\.000/)
  assert.match(out, /\| OT registradas \(sin borradas\) \| 5 \|/)
  assert.match(out, /⚠️.*"Entregado" \(1 OT/)
  assert.doesNotMatch(out, /JQQ567|BORRADA/)
})

test('stats_ingresos del mes solo suma completadas vivas y avisa del estado desconocido', async () => {
  postgrestFalso()
  const out = await llamar('stats_ingresos', { periodo: 'mes' })
  assert.match(out, /\| OT completadas \| 1 \|/)
  assert.match(out, digitos(100000))
  assert.doesNotMatch(out, digitos(248000))   // 100.000 + los 148.000 de la borrada
  assert.match(out, /Entregado/)
})

test('toda lectura de trabajos de las herramientas de consulta pide excluir las borradas', async () => {
  const peticiones = postgrestFalso()
  await llamar('dashboard')
  await llamar('stats_ingresos', { periodo: 'anio' })
  await llamar('buscar_trabajos', { termino: 'AAA111' })
  await llamar('detalle_trabajo', { id: 'OT-0201' })
  await llamar('consultar_tabla', { tabla: 'trabajos', limite: 5 })
  const lecturas = peticiones.filter(p => p.tabla === 'trabajos' && p.metodo === 'GET')
  assert.ok(lecturas.length >= 5)
  for (const p of lecturas) assert.ok(p.query.includes(SIN_BORRADAS), `sin filtro de borradas: ${p.query}`)
})

test('aunque el servidor devolviera borradas, no se cuentan ni se muestran', async () => {
  postgrestFalso({ ignoraBorrado: true })
  const dash = await llamar('dashboard')
  assert.match(dash, /Historico completado \(2 OT\) \| \$\s150\.000/)
  assert.match(dash, /\| OT activas \(sin completar ni cancelar\) \| 2 \|/)
  assert.match(await llamar('buscar_trabajos', { termino: 'Pendiente' }), /No se encontraron trabajos/)
  assert.match(await llamar('detalle_trabajo', { id: 'OT-0307' }), /No existe la OT "OT-0307" \(o está borrada\)/)
  assert.doesNotMatch(await llamar('consultar_tabla', { tabla: 'trabajos' }), /DUPLICADO|BORRADA/)
})

test('buscar_trabajos: Pendiente da 0 porque solo habia borradas, y Completado encuentra', async () => {
  postgrestFalso()
  const pendiente = await llamar('buscar_trabajos', { termino: 'Pendiente' })
  assert.match(pendiente, /No se encontraron trabajos para "Pendiente"/)
  assert.match(pendiente, /los que existen son: .*En Progreso/)
  assert.match(await llamar('buscar_trabajos', { termino: 'completado' }), /Trabajos encontrados \(2\)/)
})

test('consultar_tabla avisa si el filtro compara con un estado que no existe', async () => {
  postgrestFalso()
  const out = await llamar('consultar_tabla', { tabla: 'trabajos', filtro: 'estado=eq.Entregado' })
  assert.match(out, /⚠️ "Entregado" no es un estado de trabajos/)
})

test('crear_trabajo rechaza un estado inexistente sin escribir nada', async () => {
  const peticiones = postgrestFalso()
  const out = await llamar('crear_trabajo', { cliente: 'X', estado: 'Entregado', confirm: true, items: [{ nombre: 'a', precio: 1 }] })
  assert.match(out, /❌ "Entregado" no es un estado de OT/)
  assert.equal(peticiones.filter(p => p.metodo !== 'GET').length, 0)
})

test('el consecutivo de OT si cuenta las borradas, para no reutilizar su codigo', async () => {
  const peticiones = postgrestFalso()
  const out = await llamar('crear_trabajo', { cliente: 'X', items: [{ nombre: 'a', precio: 1 }] })
  assert.match(out, /Dry-run: OT OT-0308/)   // la mas alta es OT-0307, que esta borrada
  const secuencia = peticiones.find(p => p.tabla === 'trabajos' && p.query.includes('select=ot_codigo'))
  assert.ok(secuencia && !secuencia.query.includes('deleted'))
})
