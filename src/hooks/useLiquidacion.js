import { useState, useEffect, useCallback } from 'react'
import {
  fetchMovimientos, upsertMovimiento, deleteMovimiento as sbDeleteMov,
  fetchLiquidacionHistorial, upsertLiquidacionHistorial, deleteAllLiquidacionHistorial,
  fetchLiquidados, upsertLiquidados, deleteAllLiquidados,
  fetchCompartidos, upsertCompartido, deleteCompartido,
} from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

export function useLiquidacion() {
  // Cargar inicial desde cache local para evitar loading screen
  const [movimientos, setMovimientos] = useState(() => lsGet(LS_KEYS.MOVIMIENTOS_TECNICOS, []))
  const [liquidados, setLiquidados] = useState(() => lsGet(LS_KEYS.LIQUIDADOS, []))
  const [compartidos, setCompartidos] = useState(() => lsGet(LS_KEYS.TRABAJOS_COMPARTIDOS, {}))
  const [historial, setHistorial] = useState(() => lsGet(LS_KEYS.LIQUIDACION_HISTORIAL, []))
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)

  const normalizarMov = (r) => ({
    id: r.id,
    tecnicoId: r.tecnico_id,
    tipo: r.tipo || 'adelanto',
    monto: parseFloat(r.monto) || 0,
    nota: r.nota || '',
    fecha: r.fecha,
  })

  // Supabase ahora guarda el compartido Y su partner (columna partner_id).
  //   compartidos[id] = true                  → compartido, partner sin elegir
  //   compartidos[id] = { partner: <tecId> }  → compartido con compañero elegido
  // La base manda: si trae partner, ese gana; sino conservamos el local (por si
  // se eligió recién y aún no sincroniza).
  const mergeCompartidos = (prev, sbComp) => {
    const merged = {}
    Object.keys(sbComp).forEach(id => {
      const sb = sbComp[id]
      if (sb && typeof sb === 'object') merged[id] = sb
      else merged[id] = (prev[id] && typeof prev[id] === 'object') ? prev[id] : true
    })
    return merged
  }

  const normalizarHistorial = (r) => ({
    id: r.id,
    fecha: r.fecha || r.created_at,
    tecnico: r.tecnico || '',
    tecnicoId: r.tecnico_id,
    trabajosIds: typeof r.trabajos_ids === 'string' ? JSON.parse(r.trabajos_ids) : (r.trabajos_ids || []),
    cantidadTrabajos: r.cantidad_trabajos || 0,
    manoObra: parseFloat(r.mano_obra) || 0,
    comision: parseFloat(r.comision) || 0,
    cargos: parseFloat(r.cargos) || 0,
    neto: parseFloat(r.neto) || 0,
    movimientos: typeof r.movimientos === 'string' ? JSON.parse(r.movimientos) : (r.movimientos || []),
    detalleTrabajo: typeof r.detalle_trabajo === 'string' ? JSON.parse(r.detalle_trabajo) : (r.detalle_trabajo || []),
  })

  // Sincronizacion silenciosa (polling): no toca loading
  const sincronizar = useCallback(async () => {
    try {
      const [sbMovs, sbHist, sbLiq, sbComp] = await Promise.all([
        fetchMovimientos().catch(() => null),
        fetchLiquidacionHistorial().catch(() => null),
        fetchLiquidados().catch(() => null),
        fetchCompartidos().catch(() => null),
      ])

      let anyOk = false

      if (sbMovs && sbMovs.length > 0) {
        const norm = sbMovs.map(normalizarMov)
        setMovimientos(norm)
        lsSet(LS_KEYS.MOVIMIENTOS_TECNICOS, norm)
        anyOk = true
      }

      if (sbHist && sbHist.length > 0) {
        const norm = sbHist.map(normalizarHistorial)
        setHistorial(norm)
        lsSet(LS_KEYS.LIQUIDACION_HISTORIAL, norm)
        anyOk = true
      }

      if (sbLiq && sbLiq.length > 0) {
        setLiquidados(sbLiq)
        lsSet(LS_KEYS.LIQUIDADOS, sbLiq)
        anyOk = true
      }

      if (sbComp && Object.keys(sbComp).length > 0) {
        setCompartidos(prev => {
          const merged = mergeCompartidos(prev, sbComp)
          lsSet(LS_KEYS.TRABAJOS_COMPARTIDOS, merged)
          return merged
        })
        anyOk = true
      }

      if (anyOk || sbMovs !== null || sbHist !== null || sbLiq !== null || sbComp !== null) {
        setConnectionError(false)
      }
      return true
    } catch (err) {
      console.warn('Sync liquidacion:', err.message)
      setConnectionError(true)
      return false
    }
  }, [])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    setConnectionError(false)
    try {
      const [sbMovs, sbHist, sbLiq, sbComp] = await Promise.all([
        fetchMovimientos().catch(() => null),
        fetchLiquidacionHistorial().catch(() => null),
        fetchLiquidados().catch(() => null),
        fetchCompartidos().catch(() => null),
      ])

      // Movimientos
      if (sbMovs && sbMovs.length > 0) {
        const norm = sbMovs.map(normalizarMov)
        setMovimientos(norm)
        lsSet(LS_KEYS.MOVIMIENTOS_TECNICOS, norm)
      } else {
        const cached = lsGet(LS_KEYS.MOVIMIENTOS_TECNICOS, [])
        if (cached.length > 0 && sbMovs !== null) cached.forEach(m => upsertMovimiento(m))
      }

      // Historial
      if (sbHist && sbHist.length > 0) {
        const norm = sbHist.map(normalizarHistorial)
        setHistorial(norm)
        lsSet(LS_KEYS.LIQUIDACION_HISTORIAL, norm)
      } else {
        const cached = lsGet(LS_KEYS.LIQUIDACION_HISTORIAL, [])
        if (cached.length > 0 && sbHist !== null) cached.forEach(h => upsertLiquidacionHistorial(h))
      }

      // Liquidados
      if (sbLiq && sbLiq.length > 0) {
        setLiquidados(sbLiq)
        lsSet(LS_KEYS.LIQUIDADOS, sbLiq)
      } else {
        const cached = lsGet(LS_KEYS.LIQUIDADOS, [])
        if (cached.length > 0 && sbLiq !== null) upsertLiquidados(cached)
      }

      // Compartidos
      if (sbComp && Object.keys(sbComp).length > 0) {
        setCompartidos(prev => {
          const merged = mergeCompartidos(prev, sbComp)
          lsSet(LS_KEYS.TRABAJOS_COMPARTIDOS, merged)
          return merged
        })
      } else {
        const cached = lsGet(LS_KEYS.TRABAJOS_COMPARTIDOS, {})
        if (Object.keys(cached).length > 0 && sbComp !== null) {
          Object.keys(cached).forEach(id => {
            const c = cached[id]
            upsertCompartido(id, (c && typeof c === 'object') ? c.partner : null)
          })
        }
      }

      if (!sbMovs && !sbHist && !sbLiq && !sbComp) setConnectionError(true)
    } catch (err) {
      console.warn('Error cargando liquidacion:', err.message)
      setConnectionError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargarDatos() }, [cargarDatos])

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

  // Persist to localStorage
  useEffect(() => { if (!loading) lsSet(LS_KEYS.MOVIMIENTOS_TECNICOS, movimientos) }, [movimientos, loading])
  useEffect(() => { if (!loading) lsSet(LS_KEYS.LIQUIDADOS, liquidados) }, [liquidados, loading])
  useEffect(() => { if (!loading) lsSet(LS_KEYS.TRABAJOS_COMPARTIDOS, compartidos) }, [compartidos, loading])
  useEffect(() => { if (!loading) lsSet(LS_KEYS.LIQUIDACION_HISTORIAL, historial) }, [historial, loading])

  // --- Actions ---
  const guardarMovs = useCallback((next) => {
    setMovimientos(next)
    // Sync: upsert all (simple for small arrays)
    next.forEach(m => upsertMovimiento(m))
  }, [])

  const agregarMovimiento = useCallback((mov) => {
    setMovimientos(prev => [...prev, mov])
    upsertMovimiento(mov)
  }, [])

  const eliminarMovimiento = useCallback((id) => {
    setMovimientos(prev => prev.filter(m => m.id !== id))
    sbDeleteMov(id)
  }, [])

  const guardarLiquidados = useCallback((next) => {
    setLiquidados(next)
    upsertLiquidados(next)
  }, [])

  const desliquidarTodos = useCallback(() => {
    setLiquidados([])
    deleteAllLiquidados()
  }, [])

  const guardarCompartidos = useCallback((next) => {
    setCompartidos(next)
  }, [])

  const toggleCompartido = useCallback((trabajoId) => {
    setCompartidos(prev => {
      const next = { ...prev }
      if (next[trabajoId]) {
        delete next[trabajoId]
        deleteCompartido(trabajoId)
      } else {
        next[trabajoId] = true
        upsertCompartido(trabajoId)
      }
      return next
    })
  }, [])

  // Asigna el compañero de un trabajo compartido (la otra mitad del 40%).
  // Persiste el partner en Supabase (columna partner_id) para que no se pierda.
  const setCompartidoPartner = useCallback((trabajoId, partnerId) => {
    setCompartidos(prev => {
      if (!prev[trabajoId]) return prev
      const pid = parseInt(partnerId)
      upsertCompartido(trabajoId, pid || null)
      return { ...prev, [trabajoId]: pid ? { partner: pid } : true }
    })
  }, [])

  const guardarHistorial = useCallback((next) => {
    setHistorial(next)
    // Lista vacia = limpiar todo: borrar tambien en Supabase para que el
    // proximo sync no resucite los registros.
    if (next.length === 0) deleteAllLiquidacionHistorial()
    else next.forEach(h => upsertLiquidacionHistorial(h))
  }, [])

  const agregarHistorial = useCallback((reg) => {
    setHistorial(prev => [reg, ...prev])
    upsertLiquidacionHistorial(reg)
  }, [])

  return {
    movimientos, liquidados, compartidos, historial,
    loading, connectionError,
    guardarMovs, agregarMovimiento, eliminarMovimiento,
    guardarLiquidados, desliquidarTodos,
    guardarCompartidos, toggleCompartido, setCompartidoPartner,
    guardarHistorial, agregarHistorial,
    recargar: cargarDatos,
  }
}
