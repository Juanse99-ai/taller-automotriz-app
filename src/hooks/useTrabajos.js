import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchTrabajos, upsertTrabajo, deleteTrabajo as sbDelete } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { uid } from '../utils/helpers'
import { ESTADOS } from '../utils/constants'

// Normaliza un row de Supabase al modelo del front
// NOTA: Supabase 'id' es integer auto-generado, usamos 'ot_codigo' como ID logico
function normalizar(r) {
  // Si viene de Supabase (tiene ot_codigo y id numerico), usar ot_codigo como id local
  // Si viene de localStorage (id es texto), mantener como esta
  const esDeSupabase = typeof r.id === 'number' || (r.plate !== undefined)
  return {
    id: esDeSupabase ? (r.ot_codigo || `sb-${r.id}`) : (r.id || r.ot_codigo || r.otCodigo || ''),
    fecha: r.fecha || r.created_at,
    cedula: r.cedula_cliente || r.cedula || '',
    cliente: r.cliente || '',
    telefonoCliente: r.telefono_cliente || r.telefonoCliente || '',
    emailCliente: r.email_cliente || r.emailCliente || '',
    placa: r.placa || '',
    marca: r.marca || '',
    modelo: r.modelo || '',
    ano: r.ano || null,
    kilometraje: r.kilometraje || null,
    tecnicoId: r.tecnico_id || r.tecnicoId || null,
    estado: r.estado || 'Pendiente',
    observaciones: r.observaciones || '',
    items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
    manoObra: parseFloat(r.mano_obra ?? r.manoObra) || 0,
    subtotalSinIva: parseFloat(r.subtotal_sin_iva ?? r.subtotalSinIva) || 0,
    totalIva: parseFloat(r.total_iva ?? r.totalIva) || 0,
    total: parseFloat(r.total) || 0,
    pagado: r.pagado || false,
    metodoPago: r.metodo_pago || r.metodoPago || null,
    otCodigo: r.ot_codigo || r.otCodigo || '',
    cuenttiTransacionId: r.cuentti_id_transacion || r.cuenttiTransacionId || null,
    facturadoEn: r.facturado_en || r.facturadoEn || null,
    cuenttiResolucion: r.cuentti_resolucion || r.cuenttiResolucion || null,
    inspeccion: typeof r.inspeccion === 'string' ? JSON.parse(r.inspeccion) : (r.inspeccion || null),
    // Guardar campos extra del localStorage si existen
    evidenciasIngreso: r.evidenciasIngreso || [],
    evidenciasEntrega: r.evidenciasEntrega || [],
  }
}

export function useTrabajos() {
  // Carga inmediata desde cache local para mostrar UI sin pantalla de loading
  const [trabajos, setTrabajos] = useState(() => lsGet(LS_KEYS.TRABAJOS, []))
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const trabajosRef = useRef(trabajos)
  trabajosRef.current = trabajos

  const nextOtCodigo = useCallback(() => {
    const current = lsGet(LS_KEYS.OT_CONSECUTIVO, 0) || 0
    const next = current + 1
    lsSet(LS_KEYS.OT_CONSECUTIVO, next)
    return `OT-${String(next).padStart(4, '0')}`
  }, [])

  // Asegurar que un trabajo tenga otCodigo (necesario para sincronizacion)
  const asegurarOtCodigo = useCallback((trabajo) => {
    if (trabajo.otCodigo) return trabajo
    return { ...trabajo, otCodigo: nextOtCodigo() }
  }, [nextOtCodigo])

  // Merge inteligente: Supabase es fuente de verdad, pero preservar datos solo-locales
  const mergeConLocal = useCallback((sbNormalized) => {
    const local = trabajosRef.current
    const sbByOt = new Map()
    sbNormalized.forEach(t => { if (t.otCodigo) sbByOt.set(t.otCodigo, t) })

    // Trabajos que estan en local pero NO en Supabase (pendientes de subir)
    const soloLocales = local.filter(t => {
      if (!t.otCodigo) return true // Sin OT code, mantener local
      return !sbByOt.has(t.otCodigo)
    })

    // Resultado: Supabase primero (fuente de verdad) + solo-locales al final
    return [...sbNormalized, ...soloLocales]
  }, [])

  // Sincronizacion silenciosa (no toca loading): para polling y focus
  const sincronizar = useCallback(async () => {
    try {
      const sbData = await fetchTrabajos()
      setConnectionError(false)
      const normalized = sbData.map(normalizar)

      // Detectar trabajos locales sin subir y reintentar
      const local = trabajosRef.current
      const sbOtCodigos = new Set(normalized.map(t => t.otCodigo).filter(Boolean))
      const pendientes = local.filter(t => t.otCodigo && !sbOtCodigos.has(t.otCodigo))

      if (pendientes.length > 0) {
        console.log(`[Sync] Subiendo ${pendientes.length} trabajos pendientes`)
        let subidos = 0
        for (const t of pendientes) {
          const tConOt = asegurarOtCodigo(t)
          const r = await upsertTrabajo(tConOt)
          if (r) subidos++
        }
        if (subidos > 0) {
          // Re-fetch despues de subir
          const sbDataRetry = await fetchTrabajos()
          const normRetry = sbDataRetry.map(normalizar)
          const merged = mergeConLocal(normRetry)
          setTrabajos(merged)
          lsSet(LS_KEYS.TRABAJOS, merged)
          return true
        }
      }

      if (normalized.length > 0) {
        const merged = mergeConLocal(normalized)
        // Solo actualizar si cambio algo
        const prev = trabajosRef.current
        const changed = prev.length !== merged.length ||
          merged.some((n, i) => {
            const p = prev[i]
            if (!p) return true
            return p.otCodigo !== n.otCodigo || p.estado !== n.estado ||
              p.total !== n.total || p.pagado !== n.pagado || p.tecnicoId !== n.tecnicoId
          })
        if (changed) {
          setTrabajos(merged)
          lsSet(LS_KEYS.TRABAJOS, merged)
        }
      }
      return true
    } catch (err) {
      console.warn('Sync trabajos:', err.message)
      setConnectionError(true)
      return false
    }
  }, [asegurarOtCodigo, mergeConLocal])

  // Carga inicial: muestra loading solo la primera vez
  // Si Supabase esta vacio, intenta subir datos locales (seed)
  const cargarInicial = useCallback(async () => {
    setLoading(true)
    setConnectionError(false)
    try {
      const sbData = await fetchTrabajos()
      if (sbData.length > 0) {
        const normalized = sbData.map(normalizar)
        const merged = mergeConLocal(normalized)
        setTrabajos(merged)
        lsSet(LS_KEYS.TRABAJOS, merged)
      } else {
        // Supabase vacio: intentar seed con datos locales
        const local = trabajosRef.current
        if (local.length > 0) {
          console.log(`[Seed] Subiendo ${local.length} trabajos locales a Supabase`)
          let subidos = 0
          for (const t of local) {
            const tConOt = asegurarOtCodigo(t)
            // Actualizar local con otCodigo si no tenia
            if (tConOt !== t) {
              setTrabajos(prev => prev.map(p => p.id === t.id ? tConOt : p))
            }
            const r = await upsertTrabajo(tConOt)
            if (r) subidos++
          }
          if (subidos > 0) {
            console.log(`[Seed] ${subidos}/${local.length} trabajos subidos exitosamente`)
            // Re-fetch para obtener datos limpios de Supabase
            const sbDataRetry = await fetchTrabajos()
            if (sbDataRetry.length > 0) {
              const normRetry = sbDataRetry.map(normalizar)
              const merged = mergeConLocal(normRetry)
              setTrabajos(merged)
              lsSet(LS_KEYS.TRABAJOS, merged)
            }
          }
        }
      }
      setConnectionError(false)
    } catch (err) {
      console.warn('Carga inicial trabajos:', err.message)
      setConnectionError(true)
    } finally {
      setLoading(false)
    }
  }, [asegurarOtCodigo, mergeConLocal])

  useEffect(() => { cargarInicial() }, [cargarInicial])

  // Polling silencioso cada 60s + re-sync al volver foco
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
    // SIEMPRE generar otCodigo — es la clave de sincronizacion con Supabase
    const otCodigo = data.otCodigo || nextOtCodigo()
    const generarOT = data.generarOt || data.estado === ESTADOS.PROGRAMADO
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
    const result = await upsertTrabajo(trabajo)
    if (!result) {
      console.warn('Trabajo guardado solo en local — Supabase fallo:', trabajo.otCodigo)
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
    if (trabajoActualizado) {
      // Asegurar otCodigo para sync
      if (!trabajoActualizado.otCodigo) {
        trabajoActualizado.otCodigo = nextOtCodigo()
        setTrabajos(prev => prev.map(t => t.id === id ? trabajoActualizado : t))
      }
      const result = await upsertTrabajo(trabajoActualizado)
      if (!result) {
        console.warn('Cambio guardado solo en local — Supabase fallo:', id)
      }
    }
  }, [nextOtCodigo])

  const eliminarTrabajo = useCallback(async (id) => {
    const trabajo = trabajosRef.current.find(t => t.id === id)
    setTrabajos(prev => prev.filter(t => t.id !== id))
    // Usar otCodigo para eliminar en Supabase (no el id local)
    if (trabajo?.otCodigo) {
      sbDelete(trabajo.otCodigo)
    }
  }, [])

  return {
    trabajos, loading, connectionError,
    agregarTrabajo, actualizarTrabajo, eliminarTrabajo,
    recargar: cargarInicial,
    sincronizar,
  }
}
