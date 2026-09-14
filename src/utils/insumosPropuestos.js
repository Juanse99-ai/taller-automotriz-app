// Insumos que carga un mecanico desde el taller y que la oficina revisa antes de
// que cuenten. Viven en trabajos.insumos_propuestos (ver la migracion
// 20260914_001 y api/_lib/mecanico.js, que valida lo que escribe un mecanico).
//
// Mientras estan pendientes NO suman al total, no salen en la factura, ni en el
// portal ni en la comision: solo pasan a `items` cuando alguien los aprueba.
// Revisados no se borran: son el historial de cuanto acierta cada mecanico.
import { uid, cantidadItem } from './helpers'
import { IVA_DEFAULT } from './constants'

export const ESTADO_PROPUESTA = Object.freeze({
  PENDIENTE: 'pendiente',
  APROBADO: 'aprobado',
  CORREGIDO: 'corregido',
  DESCARTADO: 'descartado',
})

export const ROTULO_PROPUESTA = {
  pendiente: 'POR REVISAR',
  aprobado: 'APROBADO',
  corregido: 'CORREGIDO',
  descartado: 'DESCARTADO',
}
export const CHIP_PROPUESTA = {
  pendiente: 'hd-chip--warn',
  aprobado: 'hd-chip--ok',
  corregido: 'hd-chip--info',
  descartado: 'hd-chip--mute',
}

const lista = (v) => (Array.isArray(v) ? v : [])

/**
 * Pendientes de verdad: siguen 'pendiente' y su linea no esta ya en la orden.
 * Lo segundo cubre el caso en que la aprobacion se guardo en `items` pero el
 * cambio de estado de la propuesta no alcanzo a guardarse: no se ofrece otra vez.
 */
export function propuestasPendientes(trabajo, items = trabajo?.items) {
  const enOrden = new Set(lista(items).map(i => i?.propuestaId).filter(Boolean))
  return lista(trabajo?.insumosPropuestos ?? trabajo?.insumos_propuestos)
    .filter(p => p?.estado === ESTADO_PROPUESTA.PENDIENTE && !enOrden.has(p.id))
}

/**
 * Lo que la oficina decidio en el formulario, sacado de la orden como quedo:
 * una propuesta con su linea en `items` fue aceptada (con la cantidad y el
 * precio FINALES de esa linea, por si se editaron despues); una marcada para
 * descartar, descartada. Si se borra la linea antes de guardar, la propuesta
 * sigue pendiente.
 */
export function decisionesDeRevision(propuestas, items, descartadas, revisor) {
  const lineas = new Map(lista(items).filter(i => i?.propuestaId).map(i => [i.propuestaId, i]))
  const firma = { revisadoPor: revisor?.usuario || null, revisadoPorNombre: revisor?.nombre || null, revisadoEn: new Date().toISOString() }
  const out = {}
  for (const p of lista(propuestas)) {
    if (p?.estado !== ESTADO_PROPUESTA.PENDIENTE) continue
    const linea = lineas.get(p.id)
    if (linea) out[p.id] = { cantidad: cantidadItem(linea), precio: Math.round(Number(linea.precio) || 0), ...firma }
    else if (descartadas?.has?.(p.id)) out[p.id] = { descartar: true, ...firma }
  }
  return out
}

/**
 * Aplica una decision sobre la propuesta tal como esta AHORA en la base. Aprobado
 * o corregido se decide aqui y no en el formulario: si el mecanico cambio la
 * cantidad mientras la oficina revisaba, se compara contra lo ultimo. Lo que ya
 * reviso otra persona no se toca.
 */
export function aplicarDecision(p, d) {
  if (!d || p?.estado !== ESTADO_PROPUESTA.PENDIENTE) return p
  const firma = { revisadoPor: d.revisadoPor ?? null, revisadoPorNombre: d.revisadoPorNombre ?? null, revisadoEn: d.revisadoEn || new Date().toISOString() }
  if (d.descartar) return { ...p, estado: ESTADO_PROPUESTA.DESCARTADO, ...firma }
  const cantidad = Number(d.cantidad) || 0
  const precio = Math.round(Number(d.precio) || 0)
  const igual = cantidad === Number(p.cantidad) && precio === Math.round(Number(p.precio) || 0)
  return igual
    ? { ...p, estado: ESTADO_PROPUESTA.APROBADO, ...firma }
    : { ...p, estado: ESTADO_PROPUESTA.CORREGIDO, cantidadFinal: cantidad, precioFinal: precio, ...firma }
}

/**
 * La linea de `items` que sale de aprobar una propuesta. Si vino del inventario
 * queda amarrada al producto, igual que al elegirlo en el formulario
 * (_bloqueado). Si el mecanico la escribio a mano, queda libre para buscarle el
 * producto, y con el IVA de siempre en vez del 0 que no sabia.
 */
export function lineaDesdePropuesta(p, { cantidad, precio } = {}) {
  const delInventario = !!(p.sku || p.codigo || p.productoId)
  return {
    id: uid(),
    codigo: p.codigo || p.sku || '',
    sku: p.sku || '',
    nombre: p.nombre,
    nombreInventario: delInventario ? p.nombre : '',
    precio: Number(precio ?? p.precio) || 0,
    cantidad: Number(cantidad ?? p.cantidad) || 1,
    iva: delInventario ? (Number(p.iva) || 0) : IVA_DEFAULT,
    esServicio: false,
    ...(delInventario ? { _bloqueado: true } : {}),
    propuestaId: p.id,
  }
}
