import { useState, useCallback, useRef } from 'react'
import { buscarClientePorCedula, grabarCliente } from '../services/cuentti'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { normalizarDoc, normalizarNombre } from '../utils/helpers'

// Build a richer local client record from any client-like object
function buildRecord(data, existing) {
  const now = new Date().toISOString()
  const cedula = (data.cedula || data.identificacion || data.documento || existing?.cedula || '').toString().trim()

  return {
    id: existing?.id || ('CL-' + Date.now()),
    cuenttiId: data.cuenttiId ?? data.id ?? existing?.cuenttiId ?? null,
    cedula,
    nombre: data.nombre || data.nombre_cliente || existing?.nombre || '',
    telefono: data.telefono || existing?.telefono || '',
    email: data.email || existing?.email || '',
    direccion: data.direccion || existing?.direccion || '',
    ciudad: data.ciudad || existing?.ciudad || '',
    vehiculos: existing?.vehiculos || [],
    fechaCreacion: existing?.fechaCreacion || now,
    fechaUltimaVisita: existing?.fechaUltimaVisita || now,
    totalVisitas: existing?.totalVisitas || 0,
    totalGastado: existing?.totalGastado || 0,
    _raw: data._raw || existing?._raw || null,
  }
}

export function useClientes() {
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)

  // ---- CLIENTES_CACHE (lightweight, existing behavior) ----
  const cacheRef = useRef(lsGet(LS_KEYS.CLIENTES_CACHE, []))
  const timerRef = useRef(null)

  // ---- CLIENTES table (richer local records) ----
  const [clientesTable, setClientesTable] = useState(() => lsGet(LS_KEYS.CLIENTES, []))
  const clientesRef = useRef(clientesTable)

  // Persist helper — syncs ref, state, and localStorage
  const persistClientes = useCallback((next) => {
    clientesRef.current = next
    setClientesTable(next)
    lsSet(LS_KEYS.CLIENTES, next)
  }, [])

  // -----------------------------------------------------------
  // upsertLocal: create or merge a record by cedula, persist it
  // Returns the resulting record.
  // -----------------------------------------------------------
  const upsertLocal = useCallback((data) => {
    const cedula = (data.cedula || data.identificacion || data.documento || '').toString().trim()
    if (!cedula) return null

    const table = clientesRef.current
    const idx = table.findIndex(c => c.cedula === cedula)
    const existing = idx >= 0 ? table[idx] : null
    const record = buildRecord(data, existing)

    let next
    if (idx >= 0) {
      next = [...table]
      next[idx] = record
    } else {
      next = [...table, record]
    }
    persistClientes(next)
    return record
  }, [persistClientes])

  // -----------------------------------------------------------
  // addToCache — original behaviour + auto-upsert local record
  // -----------------------------------------------------------
  const addToCache = useCallback((cliente) => {
    if (!cliente) return
    const exists = cacheRef.current.find(c => normalizarDoc(c) === normalizarDoc(cliente))
    if (!exists) {
      cacheRef.current = [...cacheRef.current, cliente]
      lsSet(LS_KEYS.CLIENTES_CACHE, cacheRef.current)
    }
    // Also feed the richer local table
    upsertLocal(cliente)
  }, [upsertLocal])

  // -----------------------------------------------------------
  // buscar — combined Cuentti API + local cache search
  // -----------------------------------------------------------
  const buscar = useCallback(async (termino) => {
    const t = (termino || '').trim().toLowerCase()
    if (t.length < 2) { setResultados([]); return }

    setBuscando(true)
    try {
      const results = []
      const seen = new Set()

      // 1. Buscar en Cuentti API
      try {
        const apiResult = await buscarClientePorCedula(t)
        if (apiResult) {
          const doc = normalizarDoc(apiResult).toLowerCase()
          if (!seen.has(doc)) {
            results.push(apiResult)
            seen.add(doc)
            addToCache(apiResult)
          }
        }
      } catch { /* silencio */ }

      // 2. Buscar en cache local (por cedula o nombre)
      const locales = cacheRef.current.filter(c => {
        const doc = normalizarDoc(c).toLowerCase()
        const nom = normalizarNombre(c).toLowerCase()
        return doc.includes(t) || nom.includes(t)
      })

      locales.forEach(c => {
        const doc = normalizarDoc(c).toLowerCase()
        if (!seen.has(doc)) {
          results.push(c)
          seen.add(doc)
        }
      })

      setResultados(results.slice(0, 30))
    } finally {
      setBuscando(false)
    }
  }, [addToCache])

  // Busqueda con debounce
  const buscarDebounced = useCallback((termino) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => buscar(termino), 300)
  }, [buscar])

  // -----------------------------------------------------------
  // NEW: guardarCliente — create/update a local client by cedula
  // -----------------------------------------------------------
  const guardarCliente = useCallback((clienteData) => {
    return upsertLocal(clienteData)
  }, [upsertLocal])

  // -----------------------------------------------------------
  // NEW: obtenerCliente — lookup by cedula
  // -----------------------------------------------------------
  const obtenerCliente = useCallback((cedula) => {
    const key = (cedula || '').toString().trim()
    return clientesRef.current.find(c => c.cedula === key) || null
  }, [])

  // -----------------------------------------------------------
  // NEW: listarClientes — return all records
  // -----------------------------------------------------------
  const listarClientes = useCallback(() => {
    return clientesRef.current
  }, [])

  // -----------------------------------------------------------
  // NEW: vincularVehiculo — add placa to a client's vehiculos[]
  // -----------------------------------------------------------
  const vincularVehiculo = useCallback((cedula, placa) => {
    const key = (cedula || '').toString().trim()
    const placaNorm = (placa || '').toString().trim().toUpperCase()
    if (!key || !placaNorm) return null

    const table = clientesRef.current
    const idx = table.findIndex(c => c.cedula === key)
    if (idx < 0) return null

    const record = { ...table[idx] }
    if (!record.vehiculos.includes(placaNorm)) {
      record.vehiculos = [...record.vehiculos, placaNorm]
    }

    const next = [...table]
    next[idx] = record
    persistClientes(next)
    return record
  }, [persistClientes])

  // -----------------------------------------------------------
  // NEW: guardarEnCuentti — push to Cuentti API, then sync local
  // -----------------------------------------------------------
  const guardarEnCuentti = useCallback(async (clienteData) => {
    try {
      const resp = await grabarCliente(clienteData)

      // Cuentti returns the id_cliente (or object with it) on success
      const cuenttiId = resp?.id_cliente || resp?.id || resp?.data?.id_cliente || null

      // Update local record with the Cuentti ID
      const merged = { ...clienteData }
      if (cuenttiId) merged.cuenttiId = cuenttiId

      const record = upsertLocal(merged)
      return { success: true, data: record }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, [upsertLocal])

  // -----------------------------------------------------------
  return {
    // Existing
    resultados,
    buscando,
    buscar,
    buscarDebounced,
    setResultados,
    addToCache,
    // New
    guardarCliente,
    obtenerCliente,
    listarClientes,
    vincularVehiculo,
    guardarEnCuentti,
    clientesTable,
  }
}
