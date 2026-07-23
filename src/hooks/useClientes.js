import { useState, useEffect, useCallback, useRef } from 'react'
import { buscarClientePorCedula, grabarCliente } from '../services/cuentti'
import { fetchClientesLocal, upsertClienteLocal } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { normalizarDoc, normalizarNombre, fmtTelefono } from '../utils/helpers'

// Build a richer local client record from any client-like object
//
// OJO con `data.id`: en los objetos que vienen de la API de Cuentti ese campo
// es el id_cliente de CUENTTI (por eso alimenta cuenttiId). El id local propio
// (CL-…) NUNCA se toma de ahí: llega por `data.localId` cuando el registro se
// hidrata desde Supabase, que es su fuente de verdad.
function buildRecord(data, existing) {
  const now = new Date().toISOString()
  const cedula = (data.cedula || data.identificacion || data.documento || existing?.cedula || '').toString().trim()

  return {
    // Sin localId se generaba un id nuevo por registro; al hidratar cientos de
    // clientes en el mismo milisegundo, `Date.now()` repetía el id y cientos
    // quedaban con la misma PK (upsert silenciosamente fallido o pisando otro).
    id: existing?.id || data.localId || ('CL-' + Date.now()),
    cuenttiId: data.cuenttiId ?? data.id ?? existing?.cuenttiId ?? null,
    cedula,
    nombre: data.nombre || data.nombre_cliente || existing?.nombre || '',
    telefono: fmtTelefono(data.telefono || existing?.telefono || ''),
    email: data.email || existing?.email || '',
    direccion: data.direccion || existing?.direccion || '',
    ciudad: data.ciudad || existing?.ciudad || '',
    // Se descartaba lo que trae `data` (Supabase) y por eso el contador decía
    // "Con vehículos: 0" aunque la BD tenga vínculos. Gana quien traiga algo:
    // así un array vacío del servidor no borra de la vista un vínculo local
    // que todavía no ha subido.
    vehiculos: (data.vehiculos?.length ? data.vehiculos : existing?.vehiculos) || [],
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
  // Normaliza el telefono al cargar de localStorage para limpiar valores
  // legacy con ".0" (cuando se guardo como float desde Supabase).
  const [clientesTable, setClientesTable] = useState(() => {
    const raw = lsGet(LS_KEYS.CLIENTES, [])
    return raw.map(c => ({ ...c, telefono: fmtTelefono(c.telefono || '') }))
  })
  const clientesRef = useRef(clientesTable)

  // Load from Supabase on mount (merge with local, Supabase wins by cedula)
  useEffect(() => {
    (async () => {
      try {
        const sbData = await fetchClientesLocal()
        if (sbData.length > 0) {
          const norm = sbData.map(r => buildRecord({
            localId: r.id, cuenttiId: r.cuentti_id, cedula: r.cedula, nombre: r.nombre,
            telefono: fmtTelefono(r.telefono1 || r.telefono || ''), email: r.email, direccion: r.direccion, ciudad: r.ciudad,
            vehiculos: typeof r.vehiculos === 'string' ? JSON.parse(r.vehiculos) : (r.vehiculos || []),
            fechaCreacion: r.fecha_creacion, fechaUltimaVisita: r.fecha_ultima_visita,
            totalVisitas: r.total_visitas, totalGastado: r.total_gastado,
          }, null))
          // Merge: Supabase records win, add locals not in DB
          const cedDb = new Set(norm.map(c => c.cedula))
          const cached = lsGet(LS_KEYS.CLIENTES, [])
          const merged = [...norm]
          cached.forEach(c => { if (!cedDb.has(c.cedula)) merged.push(c) })
          clientesRef.current = merged
          setClientesTable(merged)
          lsSet(LS_KEYS.CLIENTES, merged)
        } else {
          // Seed if we have local data
          const cached = lsGet(LS_KEYS.CLIENTES, [])
          if (cached.length > 0) cached.forEach(c => upsertClienteLocal(c))
        }
      } catch { /* use local cache */ }
    })()
  }, [])

  // Polling silencioso 15s + focus — sync clientes en tiempo real
  useEffect(() => {
    const syncClientes = async () => {
      try {
        const sbData = await fetchClientesLocal()
        if (sbData.length > 0) {
          const norm = sbData.map(r => buildRecord({
            localId: r.id, cuenttiId: r.cuentti_id, cedula: r.cedula, nombre: r.nombre,
            telefono: fmtTelefono(r.telefono1 || r.telefono || ''), email: r.email, direccion: r.direccion, ciudad: r.ciudad,
            vehiculos: typeof r.vehiculos === 'string' ? JSON.parse(r.vehiculos) : (r.vehiculos || []),
            fechaCreacion: r.fecha_creacion, fechaUltimaVisita: r.fecha_ultima_visita,
            totalVisitas: r.total_visitas, totalGastado: r.total_gastado,
          }, null))
          const cedDb = new Set(norm.map(c => c.cedula))
          const cached = clientesRef.current
          const merged = [...norm]
          cached.forEach(c => { if (!cedDb.has(c.cedula)) merged.push(c) })
          if (merged.length !== clientesRef.current.length || merged.some((m, i) => m.cedula !== (clientesRef.current[i]?.cedula))) {
            clientesRef.current = merged
            setClientesTable(merged)
            lsSet(LS_KEYS.CLIENTES, merged)
          }
        }
      } catch { /* silent */ }
    }
    // Cada 5 min (antes 15s): son ~830 filas (~160 KB) que casi nunca cambian;
    // a 15s eran ~40 MB/hora de Fast Origin Transfer por pestaña abierta.
    const interval = setInterval(() => { if (!document.hidden) syncClientes() }, 5 * 60 * 1000)
    const handleFocus = () => syncClientes()
    window.addEventListener('focus', handleFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', handleFocus) }
  }, [])

  // Persist helper — syncs ref, state, localStorage, and Supabase
  const persistClientes = useCallback((next, changedRecord) => {
    clientesRef.current = next
    setClientesTable(next)
    lsSet(LS_KEYS.CLIENTES, next)
    if (changedRecord) upsertClienteLocal(changedRecord)
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
    persistClientes(next, record)
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

      // 2. Buscar en datos locales: la tabla COMPLETA de clientes (Supabase, ~800)
      //    + el cache liviano. Antes solo se miraba el cache chico (cacheRef), por
      //    eso "buscar por nombre" no devolvia nada para un cliente que no se hubiera
      //    consultado antes. Se ignoran acentos para tolerar "nino" vs "niño".
      const sinAcentos = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      const q = sinAcentos(t)
      const matchLocal = (c) => {
        const doc = sinAcentos(normalizarDoc(c) || c.cedula || '')
        const nom = sinAcentos(normalizarNombre(c) || c.nombre || '')
        return doc.includes(q) || nom.includes(q)
      }
      const locales = [...clientesRef.current, ...cacheRef.current].filter(matchLocal)

      locales.forEach(c => {
        const doc = (normalizarDoc(c) || c.cedula || '').toLowerCase()
        if (doc && !seen.has(doc)) {
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
    persistClientes(next, record)
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
