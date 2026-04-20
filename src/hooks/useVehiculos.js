import { useState, useCallback, useRef } from 'react'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

export function useVehiculos() {
  const [vehiculos, setVehiculos] = useState(() => lsGet(LS_KEYS.VEHICULOS_HIST, []))
  const vehiculosRef = useRef(vehiculos)

  // Persistir cambios en localStorage y sincronizar state + ref
  const persistir = useCallback((nuevoArr) => {
    vehiculosRef.current = nuevoArr
    setVehiculos(nuevoArr)
    lsSet(LS_KEYS.VEHICULOS_HIST, nuevoArr)
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
        cedulaPropietario: data.cedulaPropietario ?? existente.cedulaPropietario,
      }
      const nuevoArr = vehiculosRef.current.map((v) =>
        v.placa === placaNorm ? actualizado : v
      )
      persistir(nuevoArr)
      return actualizado
    }

    // Crear nuevo vehiculo
    const nuevo = {
      id: 'VH-' + Date.now(),
      placa: placaNorm,
      marca: data.marca || '',
      modelo: data.modelo || '',
      ano: data.ano || 0,
      cedulaPropietario: data.cedulaPropietario || '',
      historial: [],
      fechaCreacion: new Date().toISOString(),
      fechaUltimoServicio: '',
    }
    const nuevoArr = [...vehiculosRef.current, nuevo]
    persistir(nuevoArr)
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
    persistir(nuevoArr)
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
    persistir(nuevoArr)
    return actualizado
  }, [persistir])

  return {
    vehiculos,
    agregarVehiculo,
    buscarPorPlaca,
    buscarPorCedula,
    agregarHistorial,
    actualizarVehiculo,
  }
}
