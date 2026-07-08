import { useState, useEffect, useCallback } from 'react'
import { fetchPrestamos, upsertPrestamo, deletePrestamo as sbDeletePrestamo } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

// Estado de cuenta de préstamos por persona (técnicos, admin, terceros).
//   tipo 'prestamo' (+, lo que la persona debe)  ·  tipo 'abono' (-, lo que paga/descuenta)
//   saldo de una persona = sum(prestamo) - sum(abono)
//
// Robustez de sync (este libro mueve la plata de las liquidaciones):
//  - PENDIENTES: cada movimiento agregado se guarda COMPLETO en una cola
//    (localStorage) y solo sale de ella cuando un snapshot del SERVIDOR lo
//    trae de vuelta. Así ni un upsert fallido, ni un snapshot viejo en vuelo,
//    ni otra pestaña reescribiendo el cache pueden perderlo; se re-sube en
//    cada sync hasta que el servidor lo confirme.
//  - LÁPIDAS: cada borrado se anota; el sync oculta esas filas del snapshot y
//    reintenta el DELETE hasta que el servidor deje de devolverlas. Un delete
//    sin red ya no "resucita" a los 60s.
//  - RE-SYNC al enfocar la ventana y cada 60s (igual que useLiquidacion).
const PENDING_KEY = 'prestamos_pendientes' // filas completas por confirmar
const TOMBS_KEY = 'prestamos_borrados'     // lápidas {id, ts} de borrados por confirmar
// Una lápida vive mientras el servidor siga devolviendo la fila, o hasta 15 min
// si no la devuelve (cubre un upsert lento que aterrice DESPUÉS del borrado).
const TOMB_TTL_MS = 15 * 60 * 1000
const getPending = () => lsGet(PENDING_KEY, [])
const setPending = (rows) => lsSet(PENDING_KEY, rows)
const getTombs = () => lsGet(TOMBS_KEY, [])
const setTombs = (tombs) => lsSet(TOMBS_KEY, tombs)

export function usePrestamos() {
  const [movimientos, setMovimientos] = useState(() => lsGet(LS_KEYS.PRESTAMOS, []))
  const [loading, setLoading] = useState(true)

  const normalizar = (r) => ({
    id: r.id,
    persona: r.persona || '',
    tecnicoId: r.tecnico_id ?? null,
    tipo: r.tipo === 'abono' ? 'abono' : 'prestamo',
    monto: parseFloat(r.monto) || 0,
    nota: r.nota || '',
    fecha: r.fecha,
  })

  const sync = useCallback(async () => {
    try {
      const data = await fetchPrestamos()
      if (!Array.isArray(data)) return
      const cached = lsGet(LS_KEYS.PRESTAMOS, [])
      if (data.length === 0 && cached.length > 0) {
        // Supabase vacío: NO borrar lo local (eso perdía datos); subir el cache.
        cached.forEach(m => upsertPrestamo(m))
        return
      }
      const norm = data.map(normalizar)
      const serverIds = new Set(norm.map(m => m.id))
      // Pendientes primero, filtrando contra TODAS las lápidas (una fila
      // agregada y borrada antes de confirmar NO debe re-subirse). Solo se
      // desencola lo que el SERVIDOR ya confirmó traer (no cuando el upsert
      // resuelve — un snapshot viejo en vuelo lo pisaría).
      const tombsAll = getTombs()
      const tombSetAll = new Set(tombsAll.map(t => t.id))
      const pend = getPending().filter(r => !serverIds.has(r.id) && !tombSetAll.has(r.id))
      setPending(pend)
      pend.forEach(r => { upsertPrestamo(r) })
      // Lápidas: vivas mientras el servidor devuelva la fila (ocultar +
      // reintentar DELETE) o hasta su TTL si no la devuelve (por si un upsert
      // lento la crea después). Cumplidas y vencidas se descartan.
      const ahora = Date.now()
      const tombs = tombsAll.filter(t => serverIds.has(t.id) || (ahora - (t.ts || 0)) < TOMB_TTL_MS)
      setTombs(tombs)
      tombs.filter(t => serverIds.has(t.id)).forEach(t => { sbDeletePrestamo(t.id) })
      const tombSet = new Set(tombs.map(t => t.id))
      const merged = [...pend, ...norm.filter(m => !tombSet.has(m.id))]
      setMovimientos(merged)
      lsSet(LS_KEYS.PRESTAMOS, merged)
    } catch (e) {
      console.warn('usePrestamos sync:', e.message)
    }
  }, [])

  useEffect(() => {
    (async () => {
      try { await sync() } finally { setLoading(false) }
    })()
  }, [sync])

  // Re-sync al enfocar la ventana y cada 60s.
  useEffect(() => {
    const onFocus = () => sync()
    window.addEventListener('focus', onFocus)
    const id = setInterval(sync, 60 * 1000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id) }
  }, [sync])

  useEffect(() => { if (!loading) lsSet(LS_KEYS.PRESTAMOS, movimientos) }, [movimientos, loading])

  const agregarMovimiento = useCallback((mov) => {
    const nuevo = {
      id: mov.id,
      persona: (mov.persona || '').trim(),
      tecnicoId: mov.tecnicoId ?? null,
      tipo: mov.tipo === 'abono' ? 'abono' : 'prestamo',
      monto: Math.abs(parseFloat(mov.monto) || 0),
      nota: mov.nota || '',
      fecha: mov.fecha,
    }
    // A la cola COMPLETO antes del upsert; sale de la cola solo cuando el
    // servidor lo devuelva en un snapshot (ver sync).
    setPending([...getPending().filter(r => r.id !== nuevo.id), nuevo])
    lsSet(LS_KEYS.PRESTAMOS, [nuevo, ...lsGet(LS_KEYS.PRESTAMOS, []).filter(m => m.id !== nuevo.id)])
    setMovimientos(prev => [nuevo, ...prev.filter(m => m.id !== nuevo.id)])
    upsertPrestamo(nuevo)
    return nuevo
  }, [])

  const eliminarMovimiento = useCallback((id) => {
    // Fuera de pendientes (cancela reintentos) y a la cola de lápidas: aunque
    // el DELETE falle o un upsert en vuelo la re-cree, el sync la mantiene
    // oculta y reintenta el borrado hasta que el servidor la suelte.
    setPending(getPending().filter(r => r.id !== id))
    setTombs([...getTombs().filter(t => t.id !== id), { id, ts: Date.now() }])
    setMovimientos(prev => prev.filter(m => m.id !== id))
    lsSet(LS_KEYS.PRESTAMOS, lsGet(LS_KEYS.PRESTAMOS, []).filter(m => m.id !== id))
    sbDeletePrestamo(id)
  }, [])

  return { movimientos, loading, agregarMovimiento, eliminarMovimiento, sync }
}
