import { useState, useCallback, useRef } from 'react'
import { buscarClientePorCedula } from '../services/cuentti'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { normalizarDoc, normalizarNombre } from '../utils/helpers'

export function useClientes() {
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const cacheRef = useRef(lsGet(LS_KEYS.CLIENTES_CACHE, []))
  const timerRef = useRef(null)

  // Agregar al cache sin duplicados
  const addToCache = useCallback((cliente) => {
    if (!cliente) return
    const exists = cacheRef.current.find(c => normalizarDoc(c) === normalizarDoc(cliente))
    if (!exists) {
      cacheRef.current = [...cacheRef.current, cliente]
      lsSet(LS_KEYS.CLIENTES_CACHE, cacheRef.current)
    }
  }, [])

  // Busqueda combinada: API Cuentti + cache local
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

  return { resultados, buscando, buscar, buscarDebounced, setResultados }
}
