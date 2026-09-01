import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchTrabajos, upsertTrabajo, deleteTrabajo as sbDelete } from '../services/supabase'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { uid } from '../utils/helpers'
import { ESTADOS } from '../utils/constants'
import { haySesion } from '../services/auth'

// Normaliza un row de Supabase al modelo del front
// Despues de migracion: id es text en Supabase — mismo ID que el front
function normalizar(r) {
  return {
    id: r.id || r.ot_codigo || r.otCodigo || '',
    fecha: r.fecha || r.created_at,
    cedula: r.cedula_cliente || r.cedula || '',
    cliente: r.cliente || '',
    telefonoCliente: r.telefono_cliente || r.telefonoCliente || '',
    emailCliente: r.email_cliente || r.emailCliente || '',
    placa: r.placa || '',
    marca: r.marca || '',
    modelo: r.modelo || '',
    ano: r.ano || null,
    cilindraje: r.cilindraje || '',
    kilometraje: r.kilometraje || null,
    tecnicoId: r.tecnico_id || r.tecnicoId || null,
    estado: r.estado || 'Pendiente',
    observaciones: r.observaciones || '',
    items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
    manoObra: parseFloat(r.mano_obra ?? r.manoObra) || 0,
    manoObraExtra: parseFloat(r.mano_obra_extra ?? r.manoObraExtra) || 0,
    subtotalSinIva: parseFloat(r.subtotal_sin_iva ?? r.subtotalSinIva) || 0,
    totalIva: parseFloat(r.total_iva ?? r.totalIva) || 0,
    total: parseFloat(r.total) || 0,
    pagado: r.pagado || false,
    metodoPago: r.metodo_pago || r.metodoPago || null,
    otCodigo: r.ot_codigo || r.otCodigo || '',
    cuenttiTransacionId: r.cuentti_id_transacion || r.cuenttiTransacionId || null,
    facturadoEn: r.facturado_en || r.facturadoEn || null,
    firmaCliente: r.firma_cliente || r.firmaCliente || null,
    cuenttiResolucion: r.cuentti_resolucion || r.cuenttiResolucion || null,
    // Próximo mantenimiento (recordatorios del CRM)
    tipoAceite: r.tipo_aceite ?? r.tipoAceite ?? '',
    proximoKm: r.proximo_km ?? r.proximoKm ?? '',
    proximaVisita: r.proxima_visita ?? r.proximaVisita ?? '',
    notasProximoMant: r.notas_proximo_mant ?? r.notasProximoMant ?? '',
    sinVehiculo: r.sin_vehiculo ?? r.sinVehiculo ?? false,
    // Ficha del técnico (checklist + cronómetro)
    tareasHechas: typeof r.tareas_hechas === 'string' ? JSON.parse(r.tareas_hechas) : (r.tareas_hechas || r.tareasHechas || []),
    cronoInicio: r.crono_inicio ?? r.cronoInicio ?? null,
    cronoAcumulado: parseInt(r.crono_acumulado ?? r.cronoAcumulado) || 0,
    deleted: r.deleted === true, // borrado suave: la fila sigue en Supabase pero se oculta
    inspeccion: typeof r.inspeccion === 'string' ? JSON.parse(r.inspeccion) : (r.inspeccion || null),
    // Estado de ingreso: { inventario: string[], combustible: 0-100, estado: text }
    ingreso: typeof r.ingreso === 'string' ? JSON.parse(r.ingreso) : (r.ingreso || null),
    // Evidencias: ahora vienen del servidor (columna evidencias). Fallback a local.
    evidenciasIngreso: parseEvidencias(r.evidencias) ?? (r.evidenciasIngreso || []),
    evidenciasEntrega: r.evidenciasEntrega || [],
  }
}

// Parsea la columna evidencias (JSON string). Devuelve null si no hay/está vacía
// para poder caer al fallback local sin perder fotos aún no subidas.
function parseEvidencias(val) {
  if (!val) return null
  if (Array.isArray(val)) return val.length ? val : null
  if (typeof val === 'string') {
    try { const arr = JSON.parse(val); return Array.isArray(arr) && arr.length ? arr : null } catch { return null }
  }
  return null
}

// Firma de los campos SINCRONIZADOS de un trabajo, para decidir si un snapshot
// del servidor cambió algo (y refrescar la UI). Incluye todo lo que persiste;
// los blobs grandes (evidencias, firma) van por longitud/ids, no por su contenido,
// para no volver pesada la comparación que corre cada 60s sobre todas las OT.
function firmaTrabajo(t) {
  if (!t) return ''
  const items = Array.isArray(t.items) ? t.items.map(i => `${i.nombre}·${i.precio}·${i.cantidad}·${i.esServicio ? 1 : 0}`).join('|') : ''
  const evid = Array.isArray(t.evidenciasIngreso) ? t.evidenciasIngreso.map(e => e.id || e.url || (e.dataUrl || '').slice(0, 24)).join(',') : ''
  const tareas = Array.isArray(t.tareasHechas) ? [...t.tareasHechas].join(',') : ''
  const ing = t.ingreso ? JSON.stringify(t.ingreso) : ''
  return [
    t.otCodigo, t.estado, t.total, t.pagado, t.tecnicoId, t.manoObra, t.manoObraExtra,
    t.subtotalSinIva, t.totalIva, t.metodoPago, t.observaciones, t.cliente, t.cedula,
    t.placa, t.marca, t.modelo, t.ano, t.kilometraje, t.cilindraje,
    t.telefonoCliente, t.emailCliente, t.cuenttiTransacionId, t.facturadoEn,
    t.cuenttiResolucion, (t.firmaCliente || '').length, t.tipoAceite, t.proximoKm,
    t.proximaVisita, t.notasProximoMant, t.sinVehiculo ? 1 : 0,
    tareas, t.cronoInicio, t.cronoAcumulado, items, evid, ing,
  ].join('~')
}

export function useTrabajos() {
  // Carga inmediata desde cache local para mostrar UI sin pantalla de loading
  const [trabajos, setTrabajos] = useState(() => lsGet(LS_KEYS.TRABAJOS, []))
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  // Momento de la ultima respuesta BUENA del servidor. Arranca del navegador:
  // si la pagina se abre con datos de cache, la edad tiene que contar desde que
  // se trajeron, no desde ahora.
  const [ultimaSync, setUltimaSync] = useState(() => lsGet(LS_KEYS.TRABAJOS_TIMESTAMP, 0))
  const marcarSincronizado = useCallback(() => {
    const ahora = Date.now()
    lsSet(LS_KEYS.TRABAJOS_TIMESTAMP, ahora)
    setUltimaSync(ahora)
  }, [])
  // Ids que se guardaron en LOCAL pero no llegaron al servidor. sincronizar() ya
  // los reintenta solo; esto existe para poder DECIRLO. Hasta ahora fallar era un
  // console.warn: la OT se veia creada en el dashboard y en la base no existia,
  // y lo unico que avisaba era la franja amarilla, que habla de la LECTURA.
  const [sinSubir, setSinSubir] = useState([])
  const marcarSinSubir = useCallback((id, fallo) => {
    if (!id) return
    setSinSubir(prev => {
      const tiene = prev.includes(id)
      if (fallo === tiene) return prev          // sin cambio: no re-render
      return fallo ? [...prev, id] : prev.filter(x => x !== id)
    })
  }, [])
  const trabajosRef = useRef(trabajos)
  trabajosRef.current = trabajos

  // Máximo ot_codigo visto en el SERVIDOR, incluyendo OTs borradas (deleted=true).
  // Las borradas no aparecen en la lista visible, pero su número sigue reservado:
  // sin esto, borrar las OTs más altas haría retroceder el consecutivo y la
  // siguiente OT repetiría un código ya usado.
  const maxOtRemotoRef = useRef(0)
  const registrarMaxOtRemoto = useCallback((normalized) => {
    maxOtRemotoRef.current = normalized.reduce((mx, t) => {
      const m = /OT-(\d+)/.exec(t.otCodigo || '')
      return m ? Math.max(mx, parseInt(m[1], 10)) : mx
    }, maxOtRemotoRef.current)
  }, [])

  const nextOtCodigo = useCallback(() => {
    // Deriva el consecutivo del MÁXIMO real ya sincronizado (no solo del contador
    // local): un dispositivo nuevo o con caché limpio ya no arranca en OT-0001 y
    // pisa códigos existentes. El contador local es solo un piso.
    const maxTrabajos = (trabajosRef.current || []).reduce((mx, t) => {
      const m = /OT-(\d+)/.exec(t.otCodigo || '')
      return m ? Math.max(mx, parseInt(m[1], 10)) : mx
    }, 0)
    const local = lsGet(LS_KEYS.OT_CONSECUTIVO, 0) || 0
    const next = Math.max(local, maxTrabajos, maxOtRemotoRef.current) + 1
    lsSet(LS_KEYS.OT_CONSECUTIVO, next)
    return `OT-${String(next).padStart(4, '0')}`
  }, [])

  // Asegurar que un trabajo tenga otCodigo (necesario para sincronizacion)
  const asegurarOtCodigo = useCallback((trabajo) => {
    if (trabajo.otCodigo) return trabajo
    return { ...trabajo, otCodigo: nextOtCodigo() }
  }, [nextOtCodigo])

  // Ediciones locales recién hechas y aún sin confirmar contra el servidor.
  // Protegen contra la CARRERA optimista↔poll: al marcar una OT (ej. Completado)
  // el cambio se refleja local al instante y el upsert sale en camino (~700ms). Si
  // un poll alcanza a leer el servidor ANTES de que ese upsert commitee, trae el
  // estado viejo y el merge (que trata "el servidor manda") revertía el cambio a
  // Pendiente. Durante DIRTY_TTL lo local manda; para entonces el upsert ya
  // commiteó y los polls siguientes traen el valor correcto.
  const dirtyRef = useRef(new Map()) // id -> timestamp de la edición local
  const DIRTY_TTL = 20000
  const marcarDirty = useCallback((id) => { if (id) dirtyRef.current.set(id, Date.now()) }, [])

  // ¿El servidor ya respondió alguna vez? Si NO, y encima el cache está vacío, no
  // sabemos el consecutivo real y nextOtCodigo arrancaría en OT-0001 pisando
  // códigos existentes. El creador de OT (Recepción/Trabajos) usa esto para
  // bloquear la creación hasta tener el máximo real.
  const servidorRespondioRef = useRef(false)
  const puedeCrearOT = useCallback(
    () => servidorRespondioRef.current || (trabajosRef.current || []).length > 0,
    [])

  // Ids cuyas fotos ya están confirmadas en Supabase. Solo esas se aligeran al
  // guardar en el navegador: las que aún no subieron son irreemplazables y se
  // quedan completas en el caché.
  const fotosEnServidorRef = useRef(new Set())

  // Lo que se guarda en localStorage NO es lo que se muestra: a las OT cuyas
  // fotos ya están en el servidor se les quitan del caché (vuelven solas en el
  // primer sync). Sin esto el caché pesaba 4,6 MB contra un límite de ~5 MB, y
  // al pasarse ni siquiera se podía iniciar sesión.
  const aligerarParaCache = useCallback((lista) => lista.map(t =>
    fotosEnServidorRef.current.has(t.id) && (t.evidenciasIngreso?.length || t.evidenciasEntrega?.length)
      ? { ...t, evidenciasIngreso: [], evidenciasEntrega: [] }
      : t
  ), [])

  // Merge inteligente: Supabase es fuente de verdad, pero preservar datos solo-locales
  const mergeConLocal = useCallback((sbNormalized) => {
    const local = trabajosRef.current
    const locById = new Map(local.map(t => [t.id, t]))
    const locByOt = new Map(local.filter(t => t.otCodigo).map(t => [t.otCodigo, t]))
    const now = Date.now()
    // Podar dirty vencidos para que el Map no crezca indefinidamente.
    for (const [id, t] of dirtyRef.current) { if (now - t >= DIRTY_TTL) dirtyRef.current.delete(id) }

    // Preservar evidencias locales si el servidor aún no las tiene (fotos no subidas):
    // sin esto, el sync reemplazaría el trabajo local (con fotos) por el de Supabase (sin ellas).
    const sbConEvid = sbNormalized.map(t => {
      // Edición local reciente sin confirmar: NO dejar que el servidor la revierta.
      // Se devuelve la fila LOCAL completa (protege estado, items, etc.), no solo
      // el estado. Cede al servidor recién pasado el TTL (arriba se poda).
      if (dirtyRef.current.has(t.id)) {
        const loc = locById.get(t.id)
        if (loc) return loc
      }
      // El servidor YA tiene estas fotos: se anota para no volver a guardarlas en
      // el navegador (ver aligerarParaCache). Son 4,4 MB de los 4,6 del caché y
      // reventaban el límite de ~5 MB de Safari.
      if (t.evidenciasIngreso && t.evidenciasIngreso.length) { fotosEnServidorRef.current.add(t.id); return t }
      const loc = locById.get(t.id) || (t.otCodigo && locByOt.get(t.otCodigo))
      const locFotos = loc ? [...(loc.evidenciasIngreso || []), ...(loc.evidenciasEntrega || [])] : []
      return locFotos.length ? { ...t, evidenciasIngreso: locFotos } : t
    })

    const sbById = new Set(sbNormalized.map(t => t.id).filter(Boolean))
    const sbByOt = new Set(sbNormalized.map(t => t.otCodigo).filter(Boolean))

    // Trabajos que estan en local pero NO en Supabase (pendientes de subir)
    const soloLocales = local.filter(t => {
      if (sbById.has(t.id)) return false
      if (t.otCodigo && sbByOt.has(t.otCodigo)) return false
      return true
    })

    // Resultado: Supabase primero (fuente de verdad) + solo-locales al final.
    // Se ocultan las borradas (deleted=true): siguen en Supabase para no re-subirse
    // desde el cache de otro dispositivo, pero no aparecen en la app.
    return [...sbConEvid, ...soloLocales].filter(t => !t.deleted)
  }, [])

  // Sincronizacion silenciosa (no toca loading): para polling y focus
  const sincronizar = useCallback(async () => {
    // Sin sesion no se pide nada: la API responde 401 y marcar "no hay conexion"
    // seria mentira. En cuanto se entra, App llama a recargar().
    if (!haySesion()) return false
    try {
      const sbData = await fetchTrabajos()
      servidorRespondioRef.current = true
      setConnectionError(false)
      marcarSincronizado()
      const normalized = sbData.map(normalizar)
      registrarMaxOtRemoto(normalized) // incluye borradas: el consecutivo no retrocede

      // Detectar trabajos locales sin subir y reintentar
      const local = trabajosRef.current
      const sbIds = new Set(normalized.map(t => t.id).filter(Boolean))
      const sbOtCodigos = new Set(normalized.map(t => t.otCodigo).filter(Boolean))
      const pendientes = local.filter(t =>
        !sbIds.has(t.id) && (!t.otCodigo || !sbOtCodigos.has(t.otCodigo))
      )

      // El sync es la fuente de verdad de que esta y que no esta arriba: si no
      // hay pendientes, no queda nada sin subir, aunque un intento anterior
      // hubiera fallado.
      if (pendientes.length === 0) setSinSubir([])
      if (pendientes.length > 0) {
        console.log(`[Sync] Subiendo ${pendientes.length} trabajos pendientes`)
        let subidos = 0
        const fallidos = []
        for (const t of pendientes) {
          const tConOt = asegurarOtCodigo(t)
          const r = await upsertTrabajo(tConOt)
          if (r) subidos++; else fallidos.push(t.id)
        }
        setSinSubir(fallidos)
        if (subidos > 0) {
          // Re-fetch despues de subir
          const sbDataRetry = await fetchTrabajos()
          const normRetry = sbDataRetry.map(normalizar)
          const merged = mergeConLocal(normRetry)
          setTrabajos(merged)
          lsSet(LS_KEYS.TRABAJOS, aligerarParaCache(merged))
          return true
        }
      }

      if (normalized.length > 0) {
        const merged = mergeConLocal(normalized)
        // Solo actualizar si cambió algo. Antes se comparaban SOLO 7 campos, así
        // que cambios de otro dispositivo en el checklist/cronómetro del técnico,
        // items, evidencias u observaciones NO refrescaban esta pantalla (y la
        // siguiente edición local los pisaba). Ahora se compara una firma de TODOS
        // los campos sincronizados (los blobs grandes por longitud/ids, no el blob).
        const prev = trabajosRef.current
        const changed = prev.length !== merged.length ||
          merged.some((n, i) => firmaTrabajo(prev[i]) !== firmaTrabajo(n))
        if (changed) {
          setTrabajos(merged)
          lsSet(LS_KEYS.TRABAJOS, aligerarParaCache(merged))
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
    // Ver el comentario de haySesion(): sin token esto solo consigue un 401 y un
    // aviso de desconexion falso en la pantalla de entrada.
    if (!haySesion()) { setLoading(false); return }
    setLoading(true)
    setConnectionError(false)
    try {
      const sbData = await fetchTrabajos()
      servidorRespondioRef.current = true // ya sabemos el máximo real → numerar OT es seguro
      marcarSincronizado()
      if (sbData.length > 0) {
        const normalized = sbData.map(normalizar)
        registrarMaxOtRemoto(normalized) // incluye borradas: el consecutivo no retrocede
        const merged = mergeConLocal(normalized)
        setTrabajos(merged)
        lsSet(LS_KEYS.TRABAJOS, aligerarParaCache(merged))
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
              lsSet(LS_KEYS.TRABAJOS, aligerarParaCache(merged))
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

  // Polling silencioso cada 60s (antes 15s: multiplicaba el Fast Origin Transfer
  // de Vercel) + re-sync al volver el foco con freno de 30s. Con la pestaña
  // oculta no se consulta: nadie está mirando y el fetch igual cobraba ancho de banda.
  useEffect(() => {
    let ultimoSync = 0
    const tick = () => {
      if (document.hidden) return
      ultimoSync = Date.now()
      sincronizar()
    }
    const interval = setInterval(tick, 60000)
    const handleFocus = () => {
      if (Date.now() - ultimoSync < 30000) return
      ultimoSync = Date.now()
      sincronizar()
    }
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [sincronizar])

  // Persistir en localStorage cada cambio
  useEffect(() => {
    if (!loading) lsSet(LS_KEYS.TRABAJOS, aligerarParaCache(trabajos))
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
    marcarDirty(trabajo.id) // proteger de que un poll con datos viejos lo revierta
    const result = await upsertTrabajo(trabajo)
    marcarSinSubir(trabajo.id, !result)
    if (!result) {
      console.warn('Trabajo guardado solo en local — Supabase fallo:', trabajo.otCodigo)
    }
    return trabajo
  }, [nextOtCodigo, marcarDirty, marcarSinSubir])

  const actualizarTrabajo = useCallback(async (id, changes) => {
    // Calcular el trabajo actualizado desde la ref (estado ACTUAL), NO dentro del
    // updater de setState. El updater corre DESPUES, asi que antes el `if` se
    // evaluaba con trabajoActualizado=null y el upsert se SALTABA: el cambio (ej.
    // estado COMPLETADO) quedaba solo en local y la sincronizacion lo revertia a
    // pendiente. Ahora el upsert siempre corre y el cambio se guarda en Supabase.
    const actual = trabajosRef.current.find(t => t.id === id)
    // Si la OT no esta en memoria NO se puede actualizar: no hay base sobre la
    // que aplicar los cambios. Pasa de verdad — si el servidor responde mal, el
    // sync deja la lista vacia aunque el cache conserve las ordenes. Antes esto
    // era un `return` mudo: el cambio se perdia entero (ni siquiera en local) y
    // el usuario veia "Trabajo actualizado". Ahora se devuelve false y quien
    // llama decide que decir.
    if (!actual) {
      console.warn('actualizarTrabajo: la OT no esta en memoria, no se guardo nada:', id)
      return false
    }
    const trabajoActualizado = { ...actual, ...changes }
    if (!trabajoActualizado.otCodigo) trabajoActualizado.otCodigo = nextOtCodigo()
    setTrabajos(prev => prev.map(t => t.id === id ? trabajoActualizado : t))
    marcarDirty(id) // proteger de que un poll con datos viejos revierta este cambio
    const result = await upsertTrabajo(trabajoActualizado)
    marcarSinSubir(id, !result)
    if (!result) {
      console.warn('Cambio guardado solo en local — Supabase fallo:', id)
    }
    return true
  }, [nextOtCodigo, marcarDirty, marcarSinSubir])

  const eliminarTrabajo = useCallback(async (id) => {
    setTrabajos(prev => prev.filter(t => t.id !== id))
    if (id) {
      sbDelete(id)
    }
  }, [])

  return {
    trabajos, loading, connectionError, sinSubir, ultimaSync,
    agregarTrabajo, actualizarTrabajo, eliminarTrabajo,
    recargar: cargarInicial,
    sincronizar,
    puedeCrearOT,
  }
}
