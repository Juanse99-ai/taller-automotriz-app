import { useState, useEffect, useCallback } from 'react'
import { fetchTrabajos, upsertTrabajo, deleteTrabajo as sbDelete } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { uid } from '../utils/helpers'
import { ESTADOS } from '../utils/constants'

export function useTrabajos() {
  const [trabajos, setTrabajos] = useState([])
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)

  const nextOtCodigo = useCallback(() => {
    const current = lsGet(LS_KEYS.OT_CONSECUTIVO, 0) || 0
    const next = current + 1
    lsSet(LS_KEYS.OT_CONSECUTIVO, next)
    return `OT-${String(next).padStart(4, '0')}`
  }, [])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    setConnectionError(false)
    try {
      const sbData = await fetchTrabajos()
      if (sbData.length > 0) {
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
          otCodigo: r.ot_codigo || r.otCodigo || '',
          cuenttiTransacionId: r.cuentti_id_transacion || null,
          facturadoEn: r.facturado_en || null,
          cuenttiResolucion: r.cuentti_resolucion || null,
        }))
        setTrabajos(normalized)
        lsSet(LS_KEYS.TRABAJOS, normalized)
        setConnectionError(false)
      } else {
        // Supabase devolvio vacio - usar cache local
        const cached = lsGet(LS_KEYS.TRABAJOS, [])
        setTrabajos(cached)
        if (cached.length === 0) {
          // Podria ser que no hay datos todavia, o que fallo la conexion
          // Intentamos de nuevo una vez mas
          try {
            const retry = await fetchTrabajos()
            if (retry.length > 0) {
              const normalized = retry.map(r => ({
                id: r.id, fecha: r.fecha || r.created_at, cedula: r.cedula_cliente,
                cliente: r.cliente, telefonoCliente: r.telefono_cliente, emailCliente: r.email_cliente,
                placa: r.placa, marca: r.marca, modelo: r.modelo, ano: r.ano,
                kilometraje: r.kilometraje, tecnicoId: r.tecnico_id,
                estado: r.estado || 'Pendiente', observaciones: r.observaciones,
                items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
                manoObra: parseFloat(r.mano_obra) || 0, subtotalSinIva: parseFloat(r.subtotal_sin_iva) || 0,
                totalIva: parseFloat(r.total_iva) || 0, total: parseFloat(r.total) || 0,
                pagado: r.pagado || false, metodoPago: r.metodo_pago,
                otCodigo: r.ot_codigo || r.otCodigo || '',
                cuenttiTransacionId: r.cuentti_id_transacion || null,
                facturadoEn: r.facturado_en || null,
                cuenttiResolucion: r.cuentti_resolucion || null,
              }))
              setTrabajos(normalized)
              lsSet(LS_KEYS.TRABAJOS, normalized)
            }
          } catch {
            setConnectionError(true)
          }
        }
      }
    } catch (err) {
      console.warn('Error cargando trabajos:', err.message)
      setConnectionError(true)
      setTrabajos(lsGet(LS_KEYS.TRABAJOS, []))
    } finally {
      setLoading(false)
    }
  }, [])

  // Cargar: Supabase primero, fallback localStorage
  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // Polling: re-sync cada 30 segundos para mantener dispositivos actualizados
  useEffect(() => {
    const interval = setInterval(() => {
      cargarDatos()
    }, 30000)
    // Tambien re-sync cuando la ventana vuelve a tener foco
    const handleFocus = () => cargarDatos()
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [cargarDatos])

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
    upsertTrabajo(trabajo) // fire and forget
    return trabajo
  }, [nextOtCodigo])

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

  return {
    trabajos, loading, connectionError,
    agregarTrabajo, actualizarTrabajo, eliminarTrabajo,
    recargar: cargarDatos,
  }
}
