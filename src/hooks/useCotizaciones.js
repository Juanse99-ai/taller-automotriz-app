import { useState, useEffect, useCallback } from 'react'
import { fetchCotizaciones, upsertCotizacion, deleteCotizacion } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

export function useCotizaciones() {
  const [cotizaciones, setCotizaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)

  const normalizarRow = (r) => ({
    id: r.id,
    fecha: r.fecha || r.created_at,
    cedula: r.cedula || '',
    cliente: r.cliente || '',
    telefonoCliente: r.telefono_cliente || '',
    placa: r.placa || '',
    marca: r.marca || '',
    modelo: r.modelo || '',
    items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
    subtotal: parseFloat(r.subtotal) || 0,
    iva: parseFloat(r.iva) || 0,
    total: parseFloat(r.total) || 0,
    observaciones: r.observaciones || '',
    validezDias: r.validez_dias || 15,
    estado: r.estado || 'Pendiente',
  })

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    setConnectionError(false)
    try {
      const sbData = await fetchCotizaciones()
      if (sbData.length > 0) {
        const normalized = sbData.map(normalizarRow)
        setCotizaciones(normalized)
        lsSet(LS_KEYS.COTIZACIONES, normalized)
      } else {
        const cached = lsGet(LS_KEYS.COTIZACIONES, [])
        setCotizaciones(cached)
        // Seed: si hay datos locales pero Supabase esta vacio, subir
        if (cached.length > 0) {
          for (const c of cached) {
            try { await upsertCotizacion(c) } catch (e) { console.warn('Seed cotizacion fallo:', e.message) }
          }
        }
      }
    } catch (err) {
      console.warn('Error cargando cotizaciones:', err.message)
      setConnectionError(true)
      setCotizaciones(lsGet(LS_KEYS.COTIZACIONES, []))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  useEffect(() => {
    if (!loading) lsSet(LS_KEYS.COTIZACIONES, cotizaciones)
  }, [cotizaciones, loading])

  // Guardar UNA cotizacion (crear o actualizar). Async: throws si Supabase falla.
  const guardarUna = useCallback(async (cot) => {
    setCotizaciones(prev => {
      const idx = prev.findIndex(c => c.id === cot.id)
      return idx >= 0 ? prev.map(c => c.id === cot.id ? cot : c) : [cot, ...prev]
    })
    await upsertCotizacion(cot)
    return cot
  }, [])

  // Reemplazar el array completo (legacy). Persiste cada cotizacion individualmente
  // y devuelve { ok, fallidas } para que el componente notifique fallos.
  const guardar = useCallback(async (nuevas) => {
    setCotizaciones(nuevas)
    lsSet(LS_KEYS.COTIZACIONES, nuevas)
    const results = await Promise.allSettled(nuevas.map(c => upsertCotizacion(c)))
    const fallidas = results
      .map((r, i) => r.status === 'rejected' ? nuevas[i].id : null)
      .filter(Boolean)
    return { ok: fallidas.length === 0, fallidas }
  }, [])

  const eliminar = useCallback(async (id) => {
    setCotizaciones(prev => prev.filter(c => c.id !== id))
    return await deleteCotizacion(id)
  }, [])

  return {
    cotizaciones, loading, connectionError,
    guardar, guardarUna, eliminar,
    recargar: cargarDatos,
  }
}
