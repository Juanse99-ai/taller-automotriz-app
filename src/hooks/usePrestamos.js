import { useState, useEffect, useCallback } from 'react'
import { fetchPrestamos, upsertPrestamo, deletePrestamo as sbDeletePrestamo } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

// Estado de cuenta de préstamos por persona (técnicos, admin, terceros).
//   tipo 'prestamo' (+, lo que la persona debe)  ·  tipo 'abono' (-, lo que paga/descuenta)
//   saldo de una persona = sum(prestamo) - sum(abono)
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

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPrestamos()
        if (Array.isArray(data)) {
          const norm = data.map(normalizar)
          setMovimientos(norm)
          lsSet(LS_KEYS.PRESTAMOS, norm)
        }
      } catch (e) {
        console.warn('usePrestamos load:', e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

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
    setMovimientos(prev => [nuevo, ...prev])
    upsertPrestamo(nuevo)
    return nuevo
  }, [])

  const eliminarMovimiento = useCallback((id) => {
    setMovimientos(prev => prev.filter(m => m.id !== id))
    sbDeletePrestamo(id)
  }, [])

  return { movimientos, loading, agregarMovimiento, eliminarMovimiento }
}
