import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchTrabajos, upsertTrabajo, deleteTrabajo as sbDelete } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { uid } from '../utils/helpers'
import { ESTADOS } from '../utils/constants'

// Normaliza un row de Supabase al modelo del front
function normalizar(r) {
  return {
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
    otCodigo: r.ot_codigo || r.otCodigo || '',
    cuenttiTransacionId: r.cuentti_id_transacion || null,
    facturadoEn: r.facturado_en || null,
    cuenttiResolucion: r.cuentti_resolucion || null,
    inspeccion: typeof r.inspeccion === 'string' ? JSON.parse(r.inspeccion) : (r.inspeccion || null),
  }
}

export function useTrabajos() {
  // Carga inmediata desde cache local para mostrar UI sin pantalla de loading
  const [trabajos, setTrabajos] = useState(() => lsGet(LS_KEYS.TRABAJOS, []))
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  // ref para evitar comparar arrays en cada poll que causa renders innecesarios
  const trabajosRef = useRef(trabajos)
  trabajosRef.current = trabajos

  const nextOtCodigo = useCallback(() => {
    const current = lsGet(LS_KEYS.OT_CONSECUTIVO, 0) || 0
    const next = current + 1
    lsSet(LS_KEYS.OT_CONSECUTIVO, next)
    return `OT-${String(next).padStart(4, '0')}`
  }, [])

  // Sincronizacion silenciosa (no toca loading): para polling y focus
  // Tambien reintenta subir trabajos locales que faltan en Supabase
  const sincronizar = useCallback(async () => {
    try {
      const sbData = await fetchTrabajos()
      setConnectionError(false)
      const normalized = sbData.map(normalizar)
      const sbIds = new Set(normalized.map(t => t.id))

      // Detectar trabajos locales que no estan en Supabase y reintentar subirlos
      const local = trabajosRef.current
      const pendientes = local.filter(t => t.id && !sbIds.has(t.id))
      if (pendientes.length > 0) {
        console.log(`[Sync] Reintentando subir ${pendientes.length} trabajos pendientes`)
        const subidos = []
        for (const t of pendientes) {
          const r = await upsertTrabajo(t)
          if (r) subidos.push(t)
        }
        if (subidos.length > 0) {
          // Re-fetch despues de subir
          const sbDataRetry = await fetchTrabajos()
          const normRetry = sbDataRetry.map(normalizar)
          setTrabajos(normRetry)
          lsSet(LS_KEYS.TRABAJOS, normRetry)
          return true
        }
      }

      if (normalized.length > 0) {
        // Solo actualizar si cambio algo
        const prev = trabajosRef.current
        const changed = prev.length !== normalized.length ||
          normalized.some((n, i) => {
            const p = prev[i]
            if (!p) return true
            return p.id !== n.id || p.estado !== n.estado || p.total !== n.total ||
              p.pagado !== n.pagado || p.tecnicoId !== n.tecnicoId
          })
        if (changed) {
          setTrabajos(normalized)
          lsSet(LS_KEYS.TRABAJOS, normalized)
        }
      }
      return true
    } catch (err) {
      console.warn('Sync trabajos:', err.message)
      setConnectionError(true)
      return false
    }
  }, [])

  // Carga inicial: muestra loading solo la primera vez
  const cargarInicial = useCallback(async () => {
    setLoading(true)
    setConnectionError(false)
    try {
      const sbData = await fetchTrabajos()
      if (sbData.length > 0) {
        const normalized = sbData.map(normalizar)
        setTrabajos(normalized)
        lsSet(LS_KEYS.TRABAJOS, normalized)
        setConnectionError(false)
      } else {
        // Mantener cache local que ya esta en state
        setConnectionError(false)
      }
    } catch (err) {
      console.warn('Carga inicial trabajos:', err.message)
      setConnectionError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga al montar
  useEffect(() => {
    cargarInicial()
  }, [cargarInicial])

  // Polling silencioso cada 30s + re-sync al volver foco
  useEffect(() => {
    const interval = setInterval(() => { sincronizar() }, 60000)
    const handleFocus = () => sincronizar()
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [sincronizar])

  // Persistir en localStorage cada cambio
  useEffect(() => {
    if (!loading) lsSet(LS_KEYS.TRABAJOS, trabajos)
  }, [trabajos, loading])

  const agregarTrabajo = useCallback(async (data) => {
    const generarOT = data.generarOt || data.estado === ESTADOS.PROGRAMADO
    const otCodigo = generarOT ? (data.otCodigo || nextOtCodigo()) : (data.otCodigo || '')
    const estado = data.estado || (generarOT ? ESTADOS.PROGRAMADO : ESTADOS.PENDIENTE)
    const trabajo = {
      ...data,
      id: data.id || `TR-${uid()}`,
      fecha: data.fecha || new Date().toISOString(),
      estado,
      otCodigo,
      evidenciasIngreso: data.evidenciasIngreso || [],
      evidenciasEntrega: data.evidenciasEntrega || [],
    }
    setTrabajos(prev => [trabajo, ...prev])
    // Subir a Supabase y verificar exito (no fire-and-forget)
    const result = await upsertTrabajo(trabajo)
    if (!result) {
      console.warn('Trabajo guardado solo en local — Supabase fallo:', trabajo.id)
    }
    return trabajo
  }, [nextOtCodigo])

  const actualizarTrabajo = useCallback(async (id, changes) => {
    let trabajoActualizado = null
    setTrabajos(prev => prev.map(t => {
      if (t.id === id) {
        trabajoActualizado = { ...t, ...changes }
        return trabajoActualizado
      }
      return t
    }))
    // Sincronizar a Supabase con el resultado completo
    if (trabajoActualizado) {
      const result = await upsertTrabajo(trabajoActualizado)
      if (!result) {
        console.warn('Cambio guardado solo en local — Supabase fallo:', id)
      }
    }
  }, [])

  const eliminarTrabajo = useCallback(async (id) => {
    setTrabajos(prev => prev.filter(t => t.id !== id))
    sbDelete(id)
  }, [])

  return {
    trabajos, loading, connectionError,
    agregarTrabajo, actualizarTrabajo, eliminarTrabajo,
    recargar: cargarInicial,
    sincronizar,
  }
}
