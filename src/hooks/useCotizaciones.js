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
          cached.forEach(c => upsertCotizacion(c))
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

  const guardar = useCallback((nuevas) => {
    setCotizaciones(nuevas)
    lsSet(LS_KEYS.COTIZACIONES, nuevas)
    // Sync diferencial: upsert cada cotizacion nueva/modificada
    nuevas.forEach(c => upsertCotizacion(c))
  }, [])

  const guardarUna = useCallback((cot) => {
    setCotizaciones(prev => {
      const idx = prev.findIndex(c => c.id === cot.id)
      const next = idx >= 0 ? prev.map(c => c.id === cot.id ? cot : c) : [cot, ...prev]
      return next
    })
    upsertCotizacion(cot)
  }, [])

  const eliminar = useCallback((id) => {
    setCotizaciones(prev => prev.filter(c => c.id !== id))
    deleteCotizacion(id)
  }, [])

  return {
    cotizaciones, loading, connectionError,
    guardar, guardarUna, eliminar,
    recargar: cargarDatos,
  }
}
