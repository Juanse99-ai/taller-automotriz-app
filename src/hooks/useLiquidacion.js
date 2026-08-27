import { useState, useEffect, useCallback } from 'react'
import {
  fetchMovimientos, upsertMovimiento, deleteMovimiento as sbDeleteMov,
  fetchLiquidacionHistorial, upsertLiquidacionHistorial, deleteAllLiquidacionHistorial,
  fetchLiquidacionHistorialPorId, deleteLiquidacionHistorial,
  fetchLiquidados, upsertLiquidados, deleteLiquidado as sbDeleteLiquidado,
  fetchCompartidos, upsertCompartido, deleteCompartido,
} from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { haySesion } from '../services/auth'

// Robustez de sync (esto mueve la plata de las liquidaciones): colas de
// PENDIENTES + LÁPIDAS por tabla, igual que usePrestamos. Un upsert o un delete
// fallido ya no pierde ni "resucita" datos: se reintenta en cada sync hasta que
// el SERVIDOR lo confirme. Sin esto, un cargo borrado reaparecía a los 60s
// (doble descuento) y un cargo recién agregado se perdía si el upsert falló.
const MOV_PENDING_KEY = 'movs_tec_pendientes'   // filas completas por confirmar
const MOV_TOMBS_KEY = 'movs_tec_borrados'       // {id, ts} de borrados por confirmar
const COMP_PENDING_KEY = 'compartidos_pendientes' // { id: partnerId|0 } por confirmar
const COMP_TOMBS_KEY = 'compartidos_borrados'
// LIQUIDADOS también necesita cola: era el ÚNICO de los tres sin ella. Si el
// upsert fallaba, el sync de 60s reemplazaba el estado local con el del servidor
// y las OTs recién pagadas volvían a "pendientes" → se podían pagar DOS VECES.
const LIQ_PENDING_KEY = 'liquidados_pendientes'
const TOMB_TTL_MS = 15 * 60 * 1000
const getLS = (k, d) => lsGet(k, d)
const setLS = (k, v) => lsSet(k, v)

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
    pagado: r.pagado == null ? null : (parseFloat(r.pagado) || 0),
    metodoPago: r.metodo_pago || null,
    cargosEfectivos: r.cargos_efectivos == null ? null : (parseFloat(r.cargos_efectivos) || 0),
    cuenttiGasto: r.cuentti_gasto || null,
    movimientos: typeof r.movimientos === 'string' ? JSON.parse(r.movimientos) : (r.movimientos || []),
    detalleTrabajo: typeof r.detalle_trabajo === 'string' ? JSON.parse(r.detalle_trabajo) : (r.detalle_trabajo || []),
  })

  // --- Aplicar un snapshot de MOVIMIENTOS con pendientes/lápidas ---
  const aplicarSyncMovs = (sbMovs) => {
    if (!Array.isArray(sbMovs)) return
    const cached = lsGet(LS_KEYS.MOVIMIENTOS_TECNICOS, [])
    if (sbMovs.length === 0 && cached.length > 0) {
      // Servidor vacío pero hay local: NO borrar; re-subir (no perder datos).
      cached.forEach(m => upsertMovimiento(m))
      return
    }
    const norm = sbMovs.map(normalizarMov)
    const serverIds = new Set(norm.map(m => m.id))
    const tombsAll = getLS(MOV_TOMBS_KEY, [])
    const tombSetAll = new Set(tombsAll.map(t => t.id))
    // Pendientes: re-subir los que el servidor aún no trae y no están tumbados.
    const pend = getLS(MOV_PENDING_KEY, []).filter(r => !serverIds.has(r.id) && !tombSetAll.has(r.id))
    setLS(MOV_PENDING_KEY, pend)
    pend.forEach(r => upsertMovimiento(r))
    // Lápidas: vivas mientras el servidor devuelva la fila (ocultar + reintentar
    // DELETE) o hasta el TTL si no la devuelve (por un upsert lento que aterrice
    // después del borrado). Cumplidas y vencidas se descartan.
    const ahora = Date.now()
    const tombs = tombsAll.filter(t => serverIds.has(t.id) || (ahora - (t.ts || 0)) < TOMB_TTL_MS)
    setLS(MOV_TOMBS_KEY, tombs)
    tombs.filter(t => serverIds.has(t.id)).forEach(t => sbDeleteMov(t.id))
    const tombSet = new Set(tombs.map(t => t.id))
    const merged = [...pend, ...norm.filter(m => !tombSet.has(m.id))]
    setMovimientos(merged)
    lsSet(LS_KEYS.MOVIMIENTOS_TECNICOS, merged)
  }

  // --- Aplicar un snapshot de LIQUIDADOS con pendientes ---
  // Sin lápidas a propósito: des-liquidar es raro y explícito (lo hace el
  // usuario), mientras que perder una marca de "ya pagado" es un doble pago.
  // Ante la duda, la marca SOBREVIVE.
  const aplicarSyncLiquidados = (sbLiq) => {
    if (!Array.isArray(sbLiq)) return
    const serverSet = new Set(sbLiq)
    // Los que el servidor aún no confirma siguen en cola y se reintentan.
    const pend = getLS(LIQ_PENDING_KEY, []).filter(id => !serverSet.has(id))
    setLS(LIQ_PENDING_KEY, pend)
    if (pend.length) upsertLiquidados(pend)
    const merged = [...new Set([...sbLiq, ...pend])]
    setLiquidados(merged)
    lsSet(LS_KEYS.LIQUIDADOS, merged)
  }

  // --- Aplicar un snapshot de COMPARTIDOS con pendientes/lápidas ---
  //   sbComp: { id: true | {partner} }  ·  pendientes: { id: partnerId|0 }
  const aplicarSyncCompartidos = (sbComp) => {
    if (!sbComp || typeof sbComp !== 'object') return
    const cached = lsGet(LS_KEYS.TRABAJOS_COMPARTIDOS, {})
    if (Object.keys(sbComp).length === 0 && Object.keys(cached).length > 0) {
      Object.keys(cached).forEach(id => {
        const c = cached[id]
        upsertCompartido(id, (c && typeof c === 'object') ? c.partner : null)
      })
      return
    }
    const serverIds = new Set(Object.keys(sbComp))
    const tombsAll = getLS(COMP_TOMBS_KEY, [])
    const tombSetAll = new Set(tombsAll.map(t => t.id))
    const pendAll = getLS(COMP_PENDING_KEY, {})
    // Pendientes: re-subir los que el servidor aún no confirma con el MISMO partner.
    const pend = {}
    Object.keys(pendAll).forEach(id => {
      if (tombSetAll.has(id)) return // se borró antes de confirmar
      const sb = sbComp[id]
      const partner = pendAll[id] || 0
      const confirmado = sb && ((partner && typeof sb === 'object' && sb.partner === partner) || (!partner && sb === true))
      if (confirmado) return // el servidor ya lo tiene igual → sale de la cola
      pend[id] = partner
      upsertCompartido(id, partner || null)
    })
    setLS(COMP_PENDING_KEY, pend)
    const ahora = Date.now()
    const tombs = tombsAll.filter(t => serverIds.has(t.id) || (ahora - (t.ts || 0)) < TOMB_TTL_MS)
    setLS(COMP_TOMBS_KEY, tombs)
    tombs.filter(t => serverIds.has(t.id)).forEach(t => deleteCompartido(t.id))
    const tombSet = new Set(tombs.map(t => t.id))
    // Merge: servidor (menos tumbados); luego los pendientes locales pisan (es la
    // intención más reciente del usuario, aún sin confirmar).
    const merged = {}
    Object.keys(sbComp).forEach(id => { if (!tombSet.has(id)) merged[id] = sbComp[id] })
    Object.keys(pend).forEach(id => { merged[id] = pend[id] ? { partner: pend[id] } : true })
    setCompartidos(merged)
    lsSet(LS_KEYS.TRABAJOS_COMPARTIDOS, merged)
  }

  // Sincronizacion silenciosa (polling): no toca loading
  const sincronizar = useCallback(async () => {
    // Sin sesion no se pide nada: la API responde 401 y marcar "no hay conexion"
    // seria mentira. En cuanto se entra, App llama a recargar().
    if (!haySesion()) return false
    try {
      const [sbMovs, sbHist, sbLiq, sbComp] = await Promise.all([
        fetchMovimientos().catch(() => null),
        fetchLiquidacionHistorial().catch(() => null),
        fetchLiquidados().catch(() => null),
        fetchCompartidos().catch(() => null),
      ])
      aplicarSyncMovs(sbMovs)
      if (sbHist && sbHist.length > 0) {
        const norm = sbHist.map(normalizarHistorial)
        setHistorial(norm)
        lsSet(LS_KEYS.LIQUIDACION_HISTORIAL, norm)
      }
      aplicarSyncLiquidados(sbLiq)
      aplicarSyncCompartidos(sbComp)
      if (sbMovs !== null || sbHist !== null || sbLiq !== null || sbComp !== null) setConnectionError(false)
      return true
    } catch (err) {
      console.warn('Sync liquidacion:', err.message)
      setConnectionError(true)
      return false
    }
  }, [])

  const cargarDatos = useCallback(async () => {
    // Ver el comentario de haySesion(): sin token esto solo consigue un 401 y un
    // aviso de desconexion falso en la pantalla de entrada.
    if (!haySesion()) { setLoading(false); return }
    setLoading(true)
    setConnectionError(false)
    try {
      const [sbMovs, sbHist, sbLiq, sbComp] = await Promise.all([
        fetchMovimientos().catch(() => null),
        fetchLiquidacionHistorial().catch(() => null),
        fetchLiquidados().catch(() => null),
        fetchCompartidos().catch(() => null),
      ])
      aplicarSyncMovs(sbMovs)
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
        aplicarSyncLiquidados(sbLiq)
      } else {
        const cached = lsGet(LS_KEYS.LIQUIDADOS, [])
        if (cached.length > 0 && sbLiq !== null) upsertLiquidados(cached)
      }
      aplicarSyncCompartidos(sbComp)
      if (!sbMovs && !sbHist && !sbLiq && !sbComp) setConnectionError(true)
    } catch (err) {
      console.warn('Error cargando liquidacion:', err.message)
      setConnectionError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  // Polling silencioso 60s + focus
  useEffect(() => {
    // Pausa con la pestaña oculta: una ventana olvidada en segundo plano seguía
    // pidiendo cada 60s (mismo criterio que trabajos/clientes/cotizaciones).
    const interval = setInterval(() => { if (!document.hidden) sincronizar() }, 60000)
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
  // Devuelve si el SERVIDOR lo aceptó. Antes se disparaba y se olvidaba: la
  // pantalla decía "Diario agregado ✓" aunque el guardado fallara, y el
  // movimiento quedaba solo en este navegador (así se "borraban" los diarios al
  // cambiar de equipo). Quien llama debe avisar cuando devuelva null.
  const agregarMovimiento = useCallback((mov) => {
    // A la cola COMPLETO antes del upsert; sale solo cuando el servidor lo devuelva.
    setLS(MOV_PENDING_KEY, [...getLS(MOV_PENDING_KEY, []).filter(r => r.id !== mov.id), mov])
    setMovimientos(prev => [...prev.filter(m => m.id !== mov.id), mov])
    return upsertMovimiento(mov)
  }, [])

  const eliminarMovimiento = useCallback((id) => {
    // Fuera de pendientes (cancela reintentos) y a la cola de lápidas: aunque el
    // DELETE falle o un upsert en vuelo lo re-cree, el sync lo mantiene oculto y
    // reintenta el borrado hasta que el servidor lo suelte.
    setLS(MOV_PENDING_KEY, getLS(MOV_PENDING_KEY, []).filter(r => r.id !== id))
    setLS(MOV_TOMBS_KEY, [...getLS(MOV_TOMBS_KEY, []).filter(t => t.id !== id), { id, ts: Date.now() }])
    setMovimientos(prev => prev.filter(m => m.id !== id))
    return sbDeleteMov(id)
  }, [])

  // Agregar liquidados (al pagar): FUSIONA con el estado real, NUNCA borra. Solo
  // sube las claves nuevas. Antes se pasaba [...liquidados, ...nuevas] con el
  // closure viejo y el hook borraba en el servidor lo que faltara → si otro
  // dispositivo liquidó en paralelo, esa OT se "des-liquidaba" y se pagaba DOBLE.
  // A la cola ANTES del upsert: si la red falla, el sync lo reintenta y la marca
  // no se pierde. Devuelve si el SERVIDOR confirmó, para que quien paga pueda
  // avisar cuando quedó solo en cola.
  const agregarLiquidados = useCallback((nuevas) => {
    if (!nuevas || nuevas.length === 0) return Promise.resolve(true)
    setLS(LIQ_PENDING_KEY, [...new Set([...getLS(LIQ_PENDING_KEY, []), ...nuevas])])
    setLiquidados(prev => [...new Set([...prev, ...nuevas])])
    return upsertLiquidados(nuevas).then(ok => {
      if (ok) setLS(LIQ_PENDING_KEY, getLS(LIQ_PENDING_KEY, []).filter(id => !nuevas.includes(id)))
      return ok
    })
  }, [])

  // Des-liquidar TODAS las claves de un trabajo (id plano + mitades `${id}#tec`).
  // Cierra sobre `prev` (no sobre un array viejo), así solo borra lo de ESTE
  // trabajo y no lo que otro dispositivo agregó.
  const desliquidarPorTrabajo = useCallback((trabajoId) => {
    const esDeEste = (x) => x === trabajoId || x.startsWith(`${trabajoId}#`)
    // Fuera de la cola de pendientes: si no, el sync lo volvería a subir y el
    // trabajo se "re-liquidaría" solo a los 60 segundos.
    setLS(LIQ_PENDING_KEY, getLS(LIQ_PENDING_KEY, []).filter(x => !esDeEste(x)))
    setLiquidados(prev => {
      prev.filter(esDeEste).forEach(id => sbDeleteLiquidado(id))
      return prev.filter(x => !esDeEste(x))
    })
  }, [])

  // Quitar EXACTAMENTE estas claves. Lo usa la anulación de un pago: en un
  // trabajo compartido hay que soltar solo la mitad del técnico que se anula
  // (`id#tec`) — desliquidarPorTrabajo borra TODAS las claves del trabajo y se
  // llevaría por delante la mitad que el compañero ya cobró en otro pago.
  const quitarLiquidados = useCallback((claves) => {
    if (!claves || claves.length === 0) return
    const set = new Set(claves)
    setLS(LIQ_PENDING_KEY, getLS(LIQ_PENDING_KEY, []).filter(x => !set.has(x)))
    setLiquidados(prev => {
      prev.filter(x => set.has(x)).forEach(id => sbDeleteLiquidado(id))
      return prev.filter(x => !set.has(x))
    })
  }, [])

  const toggleCompartido = useCallback((trabajoId) => {
    setCompartidos(prev => {
      const next = { ...prev }
      if (next[trabajoId]) {
        delete next[trabajoId]
        setLS(COMP_PENDING_KEY, (() => { const p = getLS(COMP_PENDING_KEY, {}); delete p[trabajoId]; return p })())
        setLS(COMP_TOMBS_KEY, [...getLS(COMP_TOMBS_KEY, []).filter(t => t.id !== trabajoId), { id: trabajoId, ts: Date.now() }])
        deleteCompartido(trabajoId)
      } else {
        next[trabajoId] = true
        setLS(COMP_TOMBS_KEY, getLS(COMP_TOMBS_KEY, []).filter(t => t.id !== trabajoId))
        setLS(COMP_PENDING_KEY, { ...getLS(COMP_PENDING_KEY, {}), [trabajoId]: 0 })
        upsertCompartido(trabajoId)
      }
      return next
    })
  }, [])

  // Asigna el compañero (la otra mitad del 40%). Persiste en Supabase (partner_id)
  // y en la cola de pendientes: si el upsert falla, el sync lo reintenta y NO se
  // pierde el compartido (antes revertía a 40% para el asignado).
  const setCompartidoPartner = useCallback((trabajoId, partnerId) => {
    setCompartidos(prev => {
      if (!prev[trabajoId]) return prev
      const pid = parseInt(partnerId) || 0
      setLS(COMP_PENDING_KEY, { ...getLS(COMP_PENDING_KEY, {}), [trabajoId]: pid })
      upsertCompartido(trabajoId, pid || null)
      return { ...prev, [trabajoId]: pid ? { partner: pid } : true }
    })
  }, [])

  const guardarHistorial = useCallback((next) => {
    setHistorial(next)
    if (next.length === 0) deleteAllLiquidacionHistorial()
    else next.forEach(h => upsertLiquidacionHistorial(h))
  }, [])

  const agregarHistorial = useCallback(async (reg) => {
    // Guardar en el servidor PRIMERO. Si da timeout, RECONCILIAR: el POST pudo
    // llegar aunque la respuesta se perdiera → consultar por id; si ya existe, el
    // pago sí quedó guardado y no hay que abortar (evita re-liquidar y doble pago).
    let res = await upsertLiquidacionHistorial(reg)
    if (res == null) {
      const existe = await fetchLiquidacionHistorialPorId(reg.id)
      if (existe) res = existe
    }
    if (res != null) setHistorial(prev => [reg, ...prev.filter(h => h.id !== reg.id)])
    return res
  }, [])

  // Anular UN pago. Se borra primero en el SERVIDOR: si falla, no se quita de la
  // lista local (así no queda "anulado" en pantalla y vivo en la base, que es
  // como se pagaría dos veces). Revertir los movimientos es cosa de quien llama.
  const eliminarHistorial = useCallback(async (id) => {
    const ok = await deleteLiquidacionHistorial(id)
    if (ok) setHistorial(prev => prev.filter(h => h.id !== id))
    return ok
  }, [])

  return {
    movimientos, liquidados, compartidos, historial,
    loading, connectionError,
    agregarMovimiento, eliminarMovimiento,
    agregarLiquidados, desliquidarPorTrabajo, quitarLiquidados, eliminarHistorial,
    toggleCompartido, setCompartidoPartner,
    guardarHistorial, agregarHistorial,
    recargar: cargarDatos,
  }
}
