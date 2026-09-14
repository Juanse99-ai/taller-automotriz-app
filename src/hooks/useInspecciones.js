import { useState, useEffect, useCallback } from 'react'
import { fetchInspecciones, upsertInspeccion, borrarInspeccion } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { haySesion } from '../services/auth'

// Sync con la base, con el mismo esquema de usePrestamos:
//  - PENDIENTES: cada inspeccion que se guarda va COMPLETA a una cola y sale de
//    ella solo cuando el servidor la devuelve igual. Un guardado sin red no se
//    pierde: se re-sube en cada carga.
//  - LAPIDAS: cada borrado se anota; la carga oculta esa fila y reintenta el
//    DELETE mientras el servidor la siga devolviendo.
// Antes eliminar solo quitaba la inspeccion de la pantalla (nunca se mandaba el
// DELETE) y al recargar volvia a salir. Y con la base vacia se re-subia el cache
// entero, lo que revivia lo que otro equipo hubiera borrado.
const PENDING_KEY = 'inspecciones_pendientes' // inspecciones completas por confirmar
const TOMBS_KEY = 'inspecciones_borrados'     // lapidas {id, ts} de borrados por confirmar
// Una lapida vive mientras el servidor siga devolviendo la fila, o hasta 15 min
// si no la devuelve (cubre un guardado lento que aterrice DESPUES del borrado).
const TOMB_TTL_MS = 15 * 60 * 1000
const getPending = () => lsGet(PENDING_KEY, [])
const setPending = (filas) => lsSet(PENDING_KEY, filas)
const getTombs = () => lsGet(TOMBS_KEY, [])
const setTombs = (tombs) => lsSet(TOMBS_KEY, tombs)

// Lo que se guarda de una inspeccion, para saber si la base ya tiene la version
// de este equipo. La fecha se compara como instante: la base la devuelve con
// otro formato ("+00:00" en vez de "Z").
const huella = (i) => JSON.stringify([
  i.placa || '', i.cliente || '', i.cedula || '', i.vehiculo || '', i.tecnico || '',
  String(i.km ?? ''), Date.parse(i.fecha) || 0, i.items || [],
])

export function useInspecciones() {
  const [inspecciones, setInspecciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)

  const normalizarRow = (r) => ({
    id: r.id,
    fecha: r.fecha || r.created_at,
    placa: r.placa || '',
    cliente: r.cliente || '',
    cedula: r.cedula || '',
    vehiculo: r.vehiculo || '',
    tecnico: r.tecnico || '',
    km: r.km || '',
    items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
  })

  const cargarDatos = useCallback(async () => {
    // Ver el comentario de haySesion(): sin token esto solo consigue un 401 y un
    // aviso de desconexion falso en la pantalla de entrada.
    if (!haySesion()) { setLoading(false); return }
    setLoading(true)
    setConnectionError(false)
    try {
      const servidor = (await fetchInspecciones()).map(normalizarRow)
      const enServidor = new Map(servidor.map(i => [i.id, i]))
      // Primera carga con esta version (aun no hay cola): hasta hoy nada se
      // borraba de la base, asi que lo que este equipo tiene y la base no, nunca
      // llego a subir. Se encola una vez, que es lo que antes hacia la rama de
      // "base vacia", y desde ahi manda la cola.
      const cola = lsGet(PENDING_KEY, null)
      const candidatas = Array.isArray(cola)
        ? cola
        : lsGet(LS_KEYS.INSPECCIONES, []).filter(i => !enServidor.has(i.id))
      // Pendientes: lo que la base no tiene, o tiene con otra version (una
      // edicion que no subio). Nunca lo que se borro antes de confirmar.
      const tombsAll = getTombs()
      const tombSetAll = new Set(tombsAll.map(t => t.id))
      const pend = candidatas.filter(i => !tombSetAll.has(i.id)
        && (!enServidor.has(i.id) || huella(enServidor.get(i.id)) !== huella(i)))
      setPending(pend)
      pend.forEach(i => { upsertInspeccion(i) })
      // Lapidas: vivas mientras el servidor devuelva la fila (ocultar y
      // reintentar el DELETE) o hasta su TTL si no la devuelve.
      const ahora = Date.now()
      const tombs = tombsAll.filter(t => enServidor.has(t.id) || (ahora - (t.ts || 0)) < TOMB_TTL_MS)
      setTombs(tombs)
      tombs.filter(t => enServidor.has(t.id)).forEach(t => { borrarInspeccion(t.id) })
      const tombSet = new Set(tombs.map(t => t.id))
      const idsPend = new Set(pend.map(i => i.id))
      const lista = [...pend, ...servidor.filter(i => !tombSet.has(i.id) && !idsPend.has(i.id))]
      setInspecciones(lista)
      lsSet(LS_KEYS.INSPECCIONES, lista)
    } catch (err) {
      console.warn('Error cargando inspecciones:', err.message)
      setConnectionError(true)
      setInspecciones(lsGet(LS_KEYS.INSPECCIONES, []))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  useEffect(() => {
    if (!loading) lsSet(LS_KEYS.INSPECCIONES, inspecciones)
  }, [inspecciones, loading])

  // Crea o actualiza UNA inspeccion. Antes se re-subia la lista entera en cada
  // guardado, y eso revivia lo que otro equipo hubiera borrado mientras esta
  // pantalla seguia abierta.
  const guardarUna = useCallback((insp) => {
    // A la cola COMPLETA antes del upsert; sale de la cola cuando la base la
    // devuelva igual (ver cargarDatos).
    setPending([...getPending().filter(i => i.id !== insp.id), insp])
    lsSet(LS_KEYS.INSPECCIONES, [insp, ...lsGet(LS_KEYS.INSPECCIONES, []).filter(i => i.id !== insp.id)])
    setInspecciones(prev => {
      const idx = prev.findIndex(i => i.id === insp.id)
      return idx >= 0 ? prev.map(i => i.id === insp.id ? insp : i) : [insp, ...prev]
    })
    upsertInspeccion(insp)
  }, [])

  // Quita la inspeccion y la borra de la base. Devuelve true si la base ya la
  // solto; si no (sin red), la lapida la mantiene oculta y reintenta al cargar.
  const eliminar = useCallback((id) => {
    setPending(getPending().filter(i => i.id !== id))
    setTombs([...getTombs().filter(t => t.id !== id), { id, ts: Date.now() }])
    setInspecciones(prev => prev.filter(i => i.id !== id))
    lsSet(LS_KEYS.INSPECCIONES, lsGet(LS_KEYS.INSPECCIONES, []).filter(i => i.id !== id))
    return borrarInspeccion(id)
  }, [])

  return {
    inspecciones, loading, connectionError,
    guardarUna, eliminar,
    recargar: cargarDatos,
  }
}
