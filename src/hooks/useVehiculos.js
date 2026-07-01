import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchVehiculos, upsertVehiculo } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

export function useVehiculos() {
  const [vehiculos, setVehiculos] = useState(() => lsGet(LS_KEYS.VEHICULOS_HIST, []))
  const vehiculosRef = useRef(vehiculos)
  const [loading, setLoading] = useState(true)

  const normalizarRow = (r) => ({
    id: r.id,
    placa: r.placa || '',
    marca: r.marca || '',
    modelo: r.modelo || '',
    ano: r.ano || 0,
    cilindraje: r.cilindraje || '',
    cedulaPropietario: r.cedula_propietario || '',
    historial: typeof r.historial === 'string' ? JSON.parse(r.historial) : (r.historial || []),
    fechaCreacion: r.fecha_creacion || r.created_at,
    fechaUltimoServicio: r.fecha_ultimo_servicio || '',
  })

  // Cargar de Supabase al montar
  useEffect(() => {
    (async () => {
      try {
        const sbData = await fetchVehiculos()
        if (sbData.length > 0) {
          const norm = sbData.map(normalizarRow)
          // Merge: Supabase wins por placa
          const merged = [...norm]
          const placasDb = new Set(norm.map(v => v.placa))
          const cached = lsGet(LS_KEYS.VEHICULOS_HIST, [])
          cached.forEach(v => {
            if (!placasDb.has(v.placa)) merged.push(v)
          })
          vehiculosRef.current = merged
          setVehiculos(merged)
          lsSet(LS_KEYS.VEHICULOS_HIST, merged)
        } else {
          // Seed si hay datos locales
          const cached = lsGet(LS_KEYS.VEHICULOS_HIST, [])
          if (cached.length > 0) cached.forEach(v => upsertVehiculo(v))
        }
      } catch {
        // Usar cache local
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Persistir cambios en localStorage y sincronizar state + ref
  const persistir = useCallback((nuevoArr, changedVehiculo) => {
    vehiculosRef.current = nuevoArr
    setVehiculos(nuevoArr)
    lsSet(LS_KEYS.VEHICULOS_HIST, nuevoArr)
    // Fire-and-forget sync del vehiculo modificado
    if (changedVehiculo) upsertVehiculo(changedVehiculo)
  }, [])

  // Agregar vehiculo nuevo o actualizar existente por placa
  const agregarVehiculo = useCallback((data) => {
    const placaNorm = (data.placa || '').trim().toUpperCase()
    if (!placaNorm) return null

    const existente = vehiculosRef.current.find(
      (v) => v.placa === placaNorm
    )

    if (existente) {
      // Actualizar datos del vehiculo existente
      const actualizado = {
        ...existente,
        marca: data.marca ?? existente.marca,
        modelo: data.modelo ?? existente.modelo,
        ano: data.ano ?? existente.ano,
        cilindraje: data.cilindraje || existente.cilindraje || '',
        cedulaPropietario: data.cedulaPropietario ?? existente.cedulaPropietario,
      }
      const nuevoArr = vehiculosRef.current.map((v) =>
        v.placa === placaNorm ? actualizado : v
      )
      persistir(nuevoArr, actualizado)
      return actualizado
    }

    // Crear nuevo vehiculo
    const nuevo = {
      id: 'VH-' + Date.now(),
      placa: placaNorm,
      marca: data.marca || '',
      modelo: data.modelo || '',
      ano: data.ano || 0,
      cilindraje: data.cilindraje || '',
      cedulaPropietario: data.cedulaPropietario || '',
      historial: [],
      fechaCreacion: new Date().toISOString(),
      fechaUltimoServicio: '',
    }
    const nuevoArr = [...vehiculosRef.current, nuevo]
    persistir(nuevoArr, nuevo)
    return nuevo
  }, [persistir])

  // Buscar vehiculo por placa
  const buscarPorPlaca = useCallback((placa) => {
    const placaNorm = (placa || '').trim().toUpperCase()
    if (!placaNorm) return null
    return vehiculosRef.current.find((v) => v.placa === placaNorm) || null
  }, [])

  // Buscar todos los vehiculos de un cliente por cedula
  const buscarPorCedula = useCallback((cedula) => {
    const ced = (cedula || '').trim()
    if (!ced) return []
    return vehiculosRef.current.filter((v) => v.cedulaPropietario === ced)
  }, [])

  // Agregar registro de servicio al historial de un vehiculo
  const agregarHistorial = useCallback((placa, registroServicio) => {
    const placaNorm = (placa || '').trim().toUpperCase()
    if (!placaNorm || !registroServicio) return null

    const vehiculo = vehiculosRef.current.find((v) => v.placa === placaNorm)
    if (!vehiculo) return null

    const ahora = new Date().toISOString()
    const registro = {
      trabajoId: registroServicio.trabajoId || '',
      fecha: registroServicio.fecha || ahora,
      kilometraje: registroServicio.kilometraje || 0,
      observaciones: registroServicio.observaciones || '',
      tecnico: registroServicio.tecnico || '',
      total: registroServicio.total || 0,
      estado: registroServicio.estado || '',
    }

    const actualizado = {
      ...vehiculo,
      historial: [...vehiculo.historial, registro],
      fechaUltimoServicio: registro.fecha,
    }

    const nuevoArr = vehiculosRef.current.map((v) =>
      v.placa === placaNorm ? actualizado : v
    )
    persistir(nuevoArr, actualizado)
    return actualizado
  }, [persistir])

  // Actualizar datos de un vehiculo por placa
  const actualizarVehiculo = useCallback((placa, changes) => {
    const placaNorm = (placa || '').trim().toUpperCase()
    if (!placaNorm || !changes) return null

    const vehiculo = vehiculosRef.current.find((v) => v.placa === placaNorm)
    if (!vehiculo) return null

    const actualizado = { ...vehiculo, ...changes, placa: placaNorm }
    const nuevoArr = vehiculosRef.current.map((v) =>
      v.placa === placaNorm ? actualizado : v
    )
    persistir(nuevoArr, actualizado)
    return actualizado
  }, [persistir])

  return {
    vehiculos, loading,
    agregarVehiculo,
    buscarPorPlaca,
    buscarPorCedula,
    agregarHistorial,
    actualizarVehiculo,
  }
}
