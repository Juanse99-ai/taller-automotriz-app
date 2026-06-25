import { useState, useEffect, useRef, useCallback } from 'react'
import { cargarInventarioCompleto } from '../services/cuentti'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

// Edad maxima del cache antes de considerarlo "viejo" y forzar fetch sincronico
const STALE_MS = 2 * 60 * 1000 // 2 minutos

/**
 * Hook centralizado para inventario:
 * - inventario: array de productos
 * - loading: true mientras espera primera carga
 * - refreshing: true cuando esta refrescando en background
 * - lastSyncAt: timestamp del ultimo sync exitoso
 * - refresh(): forzar fetch a Cuentti ahora
 * - cacheAge: edad del cache en ms
 * - isStale: true si el cache es viejo (>STALE_MS)
 */
export function useInventario({ autoSyncMs = 0 } = {}) {
  const [inventario, setInventario] = useState(() => lsGet(LS_KEYS.INVENTARIO_CACHE, []))
  const [loading, setLoading] = useState(() => {
    const cached = lsGet(LS_KEYS.INVENTARIO_CACHE, [])
    const ts = lsGet(LS_KEYS.INVENTARIO_TIMESTAMP, 0)
    // Si no hay cache O el cache es viejo, marcar como loading
    return cached.length === 0 || (Date.now() - ts) > STALE_MS
  })
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastSyncAt, setLastSyncAt] = useState(() => lsGet(LS_KEYS.INVENTARIO_TIMESTAMP, 0))
  const fetchingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setRefreshing(true)
    try {
      const data = await cargarInventarioCompleto()
      if (data && data.length > 0) {
        setInventario(data)
        lsSet(LS_KEYS.INVENTARIO_CACHE, data)
        const now = Date.now()
        lsSet(LS_KEYS.INVENTARIO_TIMESTAMP, now)
        setLastSyncAt(now)
        setError(null)
      } else {
        setError('Cuentti no devolvió productos. Reintenta en un momento.')
      }
    } catch (e) {
      console.warn('Error refreshing inventario:', e.message)
      setError('No se pudo cargar el inventario desde Cuentti.')
    } finally {
      fetchingRef.current = false
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  // Carga inicial: si el cache es viejo o vacio, fetch ahora
  useEffect(() => {
    const cacheAge = Date.now() - lastSyncAt
    if (inventario.length === 0 || cacheAge > STALE_MS) {
      refresh()
    } else {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-sync periodico (opcional)
  useEffect(() => {
    if (!autoSyncMs) return
    const id = setInterval(refresh, autoSyncMs)
    return () => clearInterval(id)
  }, [autoSyncMs, refresh])

  // null = nunca sincronizado (evita mostrar edades absurdas tipo "495093h")
  const cacheAge = lastSyncAt ? Date.now() - lastSyncAt : null
  const isStale = cacheAge == null || cacheAge > STALE_MS

  return {
    inventario,
    loading,
    refreshing,
    error,
    lastSyncAt,
    cacheAge,
    isStale,
    refresh,
  }
}

// Helper para formatear edad del cache
export function formatCacheAge(ms) {
  if (ms == null) return 'sin sincronizar'
  if (ms < 0) return 'recien'
  const seg = Math.floor(ms / 1000)
  if (seg < 60) return `hace ${seg}s`
  const min = Math.floor(seg / 60)
  if (min < 60) return `hace ${min}m`
  const horas = Math.floor(min / 60)
  if (horas < 48) return `hace ${horas}h`
  const dias = Math.floor(horas / 24)
  if (dias < 60) return `hace ${dias}d`
  return 'sin sincronizar' // edades absurdas = cache nunca seteado/roto
}
