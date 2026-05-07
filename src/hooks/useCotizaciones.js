import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchCotizaciones, upsertCotizacion, deleteCotizacion } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

function normalizarRow(r) {
  return {
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
  }
}

export function useCotizaciones() {
  // Cargar inicial desde cache local
  const [cotizaciones, setCotizaciones] = useState(() => lsGet(LS_KEYS.COTIZACIONES, []))
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const ref = useRef(cotizaciones)
  ref.current = cotizaciones

  // Sincronizacion silenciosa
  const sincronizar = useCallback(async () => {
    try {
      const sbData = await fetchCotizaciones()
      setConnectionError(false)
      if (sbData.length > 0) {
        const normalized = sbData.map(normalizarRow)
        const prev = ref.current
        const changed = prev.length !== normalized.length ||
          normalized.some((n, i) => {
            const p = prev[i]
            if (!p) return true
            return p.id !== n.id || p.estado !== n.estado || p.total !== n.total
          })
        if (changed) {
          setCotizaciones(normalized)
          lsSet(LS_KEYS.COTIZACIONES, normalized)
        }
      }
      return true
    } catch (err) {
      console.warn('Sync cotizaciones:', err.message)
      setConnectionError(true)
      return false
    }
  }, [])

  const cargarInicial = useCallback(async () => {
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
        // Seed: si hay datos locales pero Supabase esta vacio, subir
        if (cached.length > 0) {
          for (const c of cached) {
            try { await upsertCotizacion(c) } catch (e) { console.warn('Seed cotizacion fallo:', e.message) }
          }
        }
      }
    } catch (err) {
      console.warn('Carga inicial cotizaciones:', err.message)
      setConnectionError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargarInicial() }, [cargarInicial])

  // Polling silencioso 30s + focus
  useEffect(() => {
    const interval = setInterval(() => { sincronizar() }, 60000)
    const handleFocus = () => sincronizar()
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [sincronizar])

  useEffect(() => {
    if (!loading) lsSet(LS_KEYS.COTIZACIONES, cotizaciones)
  }, [cotizaciones, loading])

  const guardarUna = useCallback(async (cot) => {
    setCotizaciones(prev => {
      const idx = prev.findIndex(c => c.id === cot.id)
      return idx >= 0 ? prev.map(c => c.id === cot.id ? cot : c) : [cot, ...prev]
    })
    await upsertCotizacion(cot)
    return cot
  }, [])

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
    recargar: cargarInicial,
    sincronizar,
  }
}
