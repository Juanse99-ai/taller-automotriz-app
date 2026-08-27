import { useState, useEffect, useCallback } from 'react'
import { fetchInspecciones, upsertInspeccion } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { haySesion } from '../services/auth'

export function useInspecciones() {
  const [inspecciones, setInspecciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)

  const normalizarRow = (r) => ({
    id: r.id,
    fecha: r.fecha || r.created_at,
    placa: r.placa || '',
    cliente: r.cliente || '',
    cedula: r.cedula || '',
    vehiculo: r.vehiculo || '',
    tecnico: r.tecnico || '',
    km: r.km || '',
    items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
  })

  const cargarDatos = useCallback(async () => {
    // Ver el comentario de haySesion(): sin token esto solo consigue un 401 y un
    // aviso de desconexion falso en la pantalla de entrada.
    if (!haySesion()) { setLoading(false); return }
    setLoading(true)
    setConnectionError(false)
    try {
      const sbData = await fetchInspecciones()
      if (sbData.length > 0) {
        const normalized = sbData.map(normalizarRow)
        setInspecciones(normalized)
        lsSet(LS_KEYS.INSPECCIONES, normalized)
      } else {
        const cached = lsGet(LS_KEYS.INSPECCIONES, [])
        setInspecciones(cached)
        if (cached.length > 0) {
          cached.forEach(i => upsertInspeccion(i))
        }
      }
    } catch (err) {
      console.warn('Error cargando inspecciones:', err.message)
      setConnectionError(true)
      setInspecciones(lsGet(LS_KEYS.INSPECCIONES, []))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  useEffect(() => {
    if (!loading) lsSet(LS_KEYS.INSPECCIONES, inspecciones)
  }, [inspecciones, loading])

  const guardar = useCallback((nuevas) => {
    setInspecciones(nuevas)
    lsSet(LS_KEYS.INSPECCIONES, nuevas)
    nuevas.forEach(i => upsertInspeccion(i))
  }, [])

  const guardarUna = useCallback((insp) => {
    setInspecciones(prev => {
      const idx = prev.findIndex(i => i.id === insp.id)
      return idx >= 0 ? prev.map(i => i.id === insp.id ? insp : i) : [insp, ...prev]
    })
    upsertInspeccion(insp)
  }, [])

  return {
    inspecciones, loading, connectionError,
    guardar, guardarUna,
    recargar: cargarDatos,
  }
}
