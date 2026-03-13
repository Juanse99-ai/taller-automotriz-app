import { useState, useEffect, useCallback } from 'react'
import { fetchTrabajos, upsertTrabajo, deleteTrabajo as sbDelete } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { uid } from '../utils/helpers'

export function useTrabajos() {
  const [trabajos, setTrabajos] = useState([])
  const [loading, setLoading] = useState(true)

  // Cargar: Supabase primero, fallback localStorage
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const sbData = await fetchTrabajos()
        if (mounted) {
          if (sbData.length > 0) {
            // Normalizar desde formato Supabase
            const normalized = sbData.map(r => ({
              id: r.id,
              fecha: r.fecha || r.created_at,
              cedula: r.cedula_cliente,
              cliente: r.cliente,
              telefonoCliente: r.telefono_cliente,
              emailCliente: r.email_cliente,
              placa: r.placa,
              marca: r.marca,
              modelo: r.modelo,
              ano: r.ano,
              kilometraje: r.kilometraje,
              tecnicoId: r.tecnico_id,
              estado: r.estado || 'Pendiente',
              observaciones: r.observaciones,
              items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
              manoObra: parseFloat(r.mano_obra) || 0,
              subtotalSinIva: parseFloat(r.subtotal_sin_iva) || 0,
              totalIva: parseFloat(r.total_iva) || 0,
              total: parseFloat(r.total) || 0,
              pagado: r.pagado || false,
              metodoPago: r.metodo_pago,
            }))
            setTrabajos(normalized)
            lsSet(LS_KEYS.TRABAJOS, normalized)
          } else {
            // Fallback localStorage
            setTrabajos(lsGet(LS_KEYS.TRABAJOS, []))
          }
        }
      } catch {
        if (mounted) setTrabajos(lsGet(LS_KEYS.TRABAJOS, []))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  // Persistir en localStorage cada cambio
  useEffect(() => {
    if (!loading) lsSet(LS_KEYS.TRABAJOS, trabajos)
  }, [trabajos, loading])

  const agregarTrabajo = useCallback(async (data) => {
    const trabajo = { ...data, id: data.id || `TR-${uid()}`, fecha: data.fecha || new Date().toISOString() }
    setTrabajos(prev => [trabajo, ...prev])
    upsertTrabajo(trabajo) // fire and forget
    return trabajo
  }, [])

  const actualizarTrabajo = useCallback(async (id, changes) => {
    setTrabajos(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t))
    // Buscar el trabajo actualizado para Supabase
    setTrabajos(prev => {
      const updated = prev.find(t => t.id === id)
      if (updated) upsertTrabajo(updated)
      return prev
    })
  }, [])

  const eliminarTrabajo = useCallback(async (id) => {
    setTrabajos(prev => prev.filter(t => t.id !== id))
    sbDelete(id)
  }, [])

  return { trabajos, loading, agregarTrabajo, actualizarTrabajo, eliminarTrabajo }
}
