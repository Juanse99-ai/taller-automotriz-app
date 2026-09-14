// ============================================================
// TRABAJOS para el rol MECÁNICO (lo que ve Anderson en "Trabajos").
//
// Todas las órdenes que siguen en el taller, y al abrir una:
//   - empezar el trabajo y marcarlo listo para revisar (= En prueba);
//   - las tareas de la orden con su cronómetro;
//   - subir fotos y videos de evidencia desde el celular;
//   - cargar los insumos que se van gastando, que quedan POR REVISAR hasta que
//     la oficina los aprueba (utils/insumosPropuestos).
//
// No hay mano de obra, totales, clientes ni facturación: el servidor ni se los
// manda (api/_lib/mecanico.js). Todo se guarda con cambios puntuales
// (patchTrabajo): un mecánico nunca reescribe la orden entera.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ESTADOS, ESTADOS_ACTIVOS, rotuloEstado } from '../utils/estados'
import { TECNICOS } from '../utils/constants'
import { fmt, fmtDate, uid, fmtCant, cantidadItem } from '../utils/helpers'
import { fetchTrabajoTaller, patchTrabajo, subirFotoEvidencia, subirVideoEvidencia, borrarVideoEvidencia } from '../services/supabase'
import { fotoParaSubir } from '../utils/imagen'
import { comprimirVideo, posterDeVideo } from '../utils/video'
import { useInventario } from '../hooks/useInventario'
import { ESTADO_PROPUESTA, ROTULO_PROPUESTA, CHIP_PROPUESTA, propuestasPendientes } from '../utils/insumosPropuestos'
import { Button, IconX } from '../components/ui'

const TONO_ESTADO = {
  [ESTADOS.PENDIENTE]: 'warn',
  [ESTADOS.EN_DIAGNOSTICO]: 'purple',
  [ESTADOS.ESPERANDO_REPUESTOS]: 'orange',
  [ESTADOS.EN_PROGRESO]: 'info',
  [ESTADOS.EN_PRUEBA]: 'info',
}
const POR_EMPEZAR = [ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.PROGRAMADO]
// Primero lo que está en las manos; al final lo que ya espera a la oficina.
const ORDEN_ESTADO = [ESTADOS.EN_PROGRESO, ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.PROGRAMADO, ESTADOS.EN_PRUEBA]
const GRUPOS = [
  ['todas', 'Todas', () => true],
  ['empezar', 'Por empezar', t => POR_EMPEZAR.includes(t.estado)],
  ['progreso', 'En progreso', t => t.estado === ESTADOS.EN_PROGRESO],
  ['revisar', 'Para revisar', t => t.estado === ESTADOS.EN_PRUEBA],
]

// Mismos límites que el formulario de la OT (ver TrabajoForm): 50 MB es el
// tope real del bucket, y 30 s bastan para mostrar un ruido o una fuga.
const MAX_VIDEO_SEG = 30
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const CAP_CRONO_SEG = 12 * 3600

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
const tecNombre = (id) => TECNICOS.find(t => t.id === parseInt(id))?.nombre || 'Sin técnico'
const lista = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}
// Lo que el servidor le deja reescribir a un mecanico: lo suyo. Lo de los demas
// lo conserva el servidor aunque no se mande (api/_lib/mecanico.js).
const misEvidencias = (fila, usuario) => lista(fila?.evidencias).filter(e => e?.subidoPor === usuario)
const misPendientes = (fila, usuario) => lista(fila?.insumos_propuestos)
  .filter(p => p?.cargadoPor === usuario && p?.estado === ESTADO_PROPUESTA.PENDIENTE)
const fmtTiempo = (seg) => {
  const s = Math.max(0, Math.floor(seg))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  const p = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`
}
const duracionVideo = (file) => new Promise(resolve => {
  const v = document.createElement('video')
  v.preload = 'metadata'
  v.onloadedmetadata = () => { const d = v.duration || 0; URL.revokeObjectURL(v.src); resolve(d) }
  v.onerror = () => { URL.revokeObjectURL(v.src); resolve(0) }
  v.src = URL.createObjectURL(file)
})

const IcBuscar = () => <svg viewBox="0 0 24 24" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
const IcCamara = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
  </svg>
)
const IcVideo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" />
  </svg>
)
const IcPlay = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>

export default function TrabajosMecanico({ trabajosHook, notify, user }) {
  const { trabajos = [], loading } = trabajosHook
  const [busca, setBusca] = useState('')
  const [grupo, setGrupo] = useState('todas')
  const [abiertaId, setAbiertaId] = useState(null)

  const activas = useMemo(() => trabajos.filter(t => !t.deleted && ESTADOS_ACTIVOS.includes(t.estado)), [trabajos])
  const conteo = useMemo(() => Object.fromEntries(GRUPOS.map(([k, , f]) => [k, activas.filter(f).length])), [activas])
  const vista = useMemo(() => {
    const q = norm(busca).trim()
    const filtro = GRUPOS.find(g => g[0] === grupo)?.[2] || (() => true)
    const pos = (e) => { const i = ORDEN_ESTADO.indexOf(e); return i < 0 ? 99 : i }
    return activas
      .filter(filtro)
      .filter(t => !q || norm([t.placa, t.cliente, t.otCodigo, t.marca, t.modelo].join(' ')).includes(q))
      .sort((a, b) => (pos(a.estado) - pos(b.estado)) || (new Date(b.fecha) - new Date(a.fecha)))
  }, [activas, busca, grupo])
  const abierta = abiertaId ? trabajos.find(t => t.id === abiertaId) : null
  const cerrar = useCallback(() => setAbiertaId(null), [])
  const aplicar = trabajosHook.aplicarCambiosLocales

  return (
    <div className="tm-pg">
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Trabajos</h1>
          <div className="hd-head__sub">
            {loading && !activas.length ? 'Cargando las órdenes…' : `${activas.length} ${activas.length === 1 ? 'orden' : 'órdenes'} en el taller`}
          </div>
        </div>
      </div>

      <div className="tm-bar">
        <label className="hd-find tm-find">
          <IcBuscar />
          <input placeholder="Placa, cliente u OT" value={busca} onChange={e => setBusca(e.target.value)} />
          {busca && <button type="button" className="input-clear" onClick={() => setBusca('')} aria-label="Limpiar búsqueda"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
        </label>
        <div className="hd-seg tm-seg" role="group" aria-label="Filtrar órdenes">
          {GRUPOS.map(([k, l]) => (
            <button key={k} type="button" className={`hd-seg__i${grupo === k ? ' on' : ''}`} aria-pressed={grupo === k} onClick={() => setGrupo(k)}>
              {l} <span className="tm-seg__n">{conteo[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {vista.length === 0 ? (
        <div className="empty">
          <h4>{busca.trim() ? 'Ninguna orden coincide' : 'No hay órdenes aquí'}</h4>
          <p>{busca.trim() ? 'Prueba con la placa completa.' : grupo === 'todas' ? 'Cuando entre un carro al taller aparece en esta lista.' : 'Toca «Todas» para ver las demás.'}</p>
        </div>
      ) : (
        <ul className="tm-lista">
          {vista.map(t => {
            const pend = propuestasPendientes(t).length
            return (
              <li key={t.id}>
                <button type="button" className="tm-card" onClick={() => setAbiertaId(t.id)}>
                  <span className="tm-card__top">
                    <span className="tm-card__placa">{t.placa || 'SERVICIO'}</span>
                    <span className={`hd-chip hd-chip--${TONO_ESTADO[t.estado] || 'mute'}`}>{rotuloEstado(t.estado)}</span>
                  </span>
                  <span className="tm-card__veh">{[t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || 'Sin datos del vehículo'}</span>
                  <span className="tm-card__meta">{t.cliente || 'Sin cliente'} · {tecNombre(t.tecnicoId)}{t.otCodigo ? ` · ${t.otCodigo}` : ''}</span>
                  {pend > 0 && <span className="tm-card__rev"><span className="hd-chip hd-chip--warn">{pend} {pend === 1 ? 'INSUMO' : 'INSUMOS'} POR REVISAR</span></span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {abierta && (
        <FichaTaller key={abierta.id} trabajo={abierta} user={user} notify={notify} onClose={cerrar}
          onCambio={(c) => aplicar?.(abierta.id, c)} />
      )}
    </div>
  )
}

// ── La orden abierta ─────────────────────────────────────────────────────
function FichaTaller({ trabajo, user, notify, onClose, onCambio }) {
  const [fila, setFila] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vivo = true
    fetchTrabajoTaller(trabajo.id)
      .then(f => { if (vivo) (f ? setFila(f) : setError('Esta orden ya no existe.')) })
      .catch(e => { if (vivo) setError(e.message || 'No se pudo abrir la orden.') })
    return () => { vivo = false }
  }, [trabajo.id])

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onClose])

  // La orden vigente para quien arma un cambio en el momento de guardar.
  const filaRef = useRef(null)
  useEffect(() => { filaRef.current = fila }, [fila])

  // Un cambio puntual a la vez. `campos` puede ser una funcion de la orden
  // vigente. Lo que responde el servidor (ya fusionado con lo de los demas)
  // reemplaza lo que hay en pantalla.
  const guardar = useCallback(async (campos, { exito } = {}) => {
    setOcupado(true)
    try {
      const cuerpo = typeof campos === 'function' ? campos(filaRef.current) : campos
      const nueva = await patchTrabajo(trabajo.id, cuerpo)
      if (nueva) {
        filaRef.current = nueva
        setFila(nueva)
        onCambio?.({
          estado: nueva.estado,
          tareasHechas: nueva.tareas_hechas || [],
          cronoInicio: nueva.crono_inicio || null,
          cronoAcumulado: nueva.crono_acumulado || 0,
          insumosPropuestos: Array.isArray(nueva.insumos_propuestos) ? nueva.insumos_propuestos : [],
        })
      }
      if (exito) notify?.(exito, 'success')
      return !!nueva
    } catch (e) {
      notify?.(e.message || 'No se pudo guardar', 'error')
      return false
    } finally {
      setOcupado(false)
    }
  }, [trabajo.id, notify, onCambio])

  const estado = fila?.estado || trabajo.estado
  const veh = [trabajo.marca, trabajo.modelo, trabajo.ano].filter(Boolean).join(' ')

  return (
    <div className="modal-overlay tm-over" onClick={onClose}>
      <div className="modal tm-sheet" role="dialog" aria-modal="true" aria-label={`Orden ${trabajo.otCodigo || trabajo.placa || ''}`} onClick={e => e.stopPropagation()}>
        <div className="tm-sheet__h">
          <div className="tm-sheet__id">
            <div className="tm-sheet__placa">
              {trabajo.placa || 'SERVICIO'}
              <span className={`hd-chip hd-chip--${TONO_ESTADO[estado] || 'mute'}`}>{rotuloEstado(estado)}</span>
            </div>
            <div className="tm-sheet__veh">{[veh, trabajo.cliente].filter(Boolean).join(' · ') || 'Sin datos'}</div>
            <div className="hd-sub">{[trabajo.otCodigo, tecNombre(trabajo.tecnicoId), trabajo.fecha ? `entró ${fmtDate(trabajo.fecha)}` : ''].filter(Boolean).join(' · ')}</div>
          </div>
          <button type="button" className="icobtn" onClick={onClose} aria-label="Cerrar"><IconX /></button>
        </div>

        <div className="tm-sheet__b">
          {error ? (
            <div className="empty"><h4>No se pudo abrir</h4><p>{error}</p></div>
          ) : !fila ? (
            <div className="empty"><p>Abriendo la orden…</p></div>
          ) : (
            <>
              <BloqueEstado estado={fila.estado} guardar={guardar} ocupado={ocupado} />
              <BloqueTareas fila={fila} guardar={guardar} />
              <BloqueEvidencias fila={fila} trabajo={trabajo} usuario={user?.usuario} guardar={guardar} notify={notify} ocupado={ocupado} />
              <BloqueInsumos fila={fila} user={user} guardar={guardar} ocupado={ocupado} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function BloqueEstado({ estado, guardar, ocupado }) {
  if (POR_EMPEZAR.includes(estado)) {
    return (
      <div className="tm-estado">
        <Button variant="primary" disabled={ocupado} onClick={() => guardar({ estado: ESTADOS.EN_PROGRESO }, { exito: 'Trabajo empezado' })}>Empezar trabajo</Button>
      </div>
    )
  }
  if (estado === ESTADOS.EN_PROGRESO) {
    return (
      <div className="tm-estado">
        <Button variant="primary" disabled={ocupado} onClick={() => guardar({ estado: ESTADOS.EN_PRUEBA }, { exito: 'Listo: la oficina lo revisa' })}>Listo para revisar</Button>
      </div>
    )
  }
  if (estado === ESTADOS.EN_PRUEBA) {
    return (
      <div className="tm-estado">
        <span className="tm-estado__nota">Esperando la revisión de la oficina.</span>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => guardar({ estado: ESTADOS.EN_PROGRESO })}>Volver a trabajar</Button>
      </div>
    )
  }
  return null
}

function BloqueTareas({ fila, guardar }) {
  const items = lista(fila.items)
  // Las marcas se guardan por id de linea; datos viejos guardaban el indice.
  const base = new Set(lista(fila.tareas_hechas).map(x => String(typeof x === 'number' ? items[x]?.id : x)).filter(Boolean))
  const [cambiando, setCambiando] = useState({})
  const hecha = (id) => (id in cambiando ? cambiando[id] : base.has(String(id)))
  const alternar = async (id) => {
    const quiere = !hecha(id)
    const deseados = { ...cambiando, [id]: quiere }
    setCambiando(deseados)
    const nuevas = new Set(base)
    Object.entries(deseados).forEach(([k, v]) => (v ? nuevas.add(k) : nuevas.delete(k)))
    await guardar({ tareas_hechas: [...nuevas] })
    setCambiando(c => { const n = { ...c }; delete n[id]; return n })
  }

  const corriendo = !!fila.crono_inicio
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!corriendo) return undefined
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [corriendo])
  // Mismo tope que FichaTecnico: si se le olvida pausar, una sesion no suma mas
  // de 12 horas.
  const delta = corriendo ? Math.min(Math.max(0, Math.floor((ahora - Date.parse(fila.crono_inicio)) / 1000)), CAP_CRONO_SEG) : 0
  const segundos = (parseInt(fila.crono_acumulado) || 0) + delta
  const hechasN = items.filter(i => hecha(i.id)).length

  return (
    <section className="tm-blq">
      <div className="otd__rot">
        <span>QUÉ HAY QUE HACER</span>
        {items.length > 0 && <span className="otd__n">{hechasN}/{items.length}</span>}
      </div>
      {fila.observaciones && <p className="tm-obs">{fila.observaciones}</p>}
      {items.length === 0 ? (
        <div className="pg__vacio">La orden todavía no tiene tareas ni repuestos.</div>
      ) : (
        <ul className="tm-tareas">
          {items.map(i => (
            <li key={i.id}>
              <label className={`tm-tarea${hecha(i.id) ? ' is-hecha' : ''}`}>
                <input type="checkbox" checked={hecha(i.id)} onChange={() => alternar(i.id)} />
                <span className="tm-tarea__n">{i.nombreInventario || i.nombre || 'Ítem'}</span>
                {/* Como en FichaTecnico: la cantidad solo si no es 1, y el precio
                    solo del repuesto (el de la mano de obra no llega). */}
                {(cantidadItem(i) !== 1 || (!i.esServicio && i.precio != null)) && (
                  <span className="tm-tarea__d">
                    {fmtCant(cantidadItem(i))}{!i.esServicio && i.precio != null ? ` × ${fmt(i.precio)}` : ''}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="tm-crono">
        <span className={`tm-crono__t${corriendo ? ' is-on' : ''}`}>{fmtTiempo(segundos)}</span>
        <span className="tm-crono__l">{corriendo ? 'Cronómetro corriendo' : segundos > 0 ? 'Tiempo trabajado' : 'Cronómetro'}</span>
        {corriendo
          ? <Button variant="outline" size="sm" onClick={() => guardar({ crono_inicio: null, crono_acumulado: Math.round(segundos) })}>Pausar</Button>
          : <Button variant="outline" size="sm" onClick={() => guardar({ crono_inicio: new Date().toISOString() })}>{segundos > 0 ? 'Seguir' : 'Iniciar'}</Button>}
      </div>
    </section>
  )
}

function BloqueEvidencias({ fila, trabajo, usuario, guardar, notify, ocupado }) {
  const todas = lista(fila.evidencias)
  const [subiendo, setSubiendo] = useState('')
  const [quitando, setQuitando] = useState(null)
  const carpeta = trabajo.otCodigo || trabajo.id

  // Cada cambio se arma sobre la orden vigente al GUARDAR (guardar recibe una
  // funcion), no sobre la de cuando empezo la subida: un video tarda y en el
  // camino pudo cambiar una nota.
  const agregar = (nuevas) => guardar(
    f => ({ evidencias: [...misEvidencias(f, usuario), ...nuevas] }),
    { exito: nuevas.length === 1 ? 'Evidencia guardada' : `${nuevas.length} evidencias guardadas` },
  )

  const subirFotos = async (files) => {
    const archivos = Array.from(files || [])
    if (!archivos.length) return
    const nuevas = []
    for (const [n, file] of archivos.entries()) {
      setSubiendo(archivos.length === 1 ? 'Subiendo la foto…' : `Subiendo foto ${n + 1} de ${archivos.length}…`)
      try {
        const foto = await fotoParaSubir(file)
        if (!foto?.blob) throw new Error('no se pudo leer')
        const { url, path } = await subirFotoEvidencia(foto.blob, carpeta)
        nuevas.push({ id: uid(), nombre: file.name, tipo: 'foto', url, path, nota: '', subidoPor: usuario, subidoEn: new Date().toISOString() })
      } catch (e) {
        notify?.(`La foto ${file.name} ${e.message || 'no se pudo subir'}`, 'error')
      }
    }
    if (nuevas.length) {
      setSubiendo('Guardando…')
      const ok = await agregar(nuevas)
      if (!ok) nuevas.forEach(v => borrarVideoEvidencia(v))
    }
    setSubiendo('')
  }

  // Varios videos de una vez, uno detras de otro (comprimir en paralelo se
  // pisaria: ver TrabajoForm.addVideos). Cada uno se guarda apenas sube, asi un
  // fallo en el tercero no se lleva los dos primeros.
  const subirVideos = async (archivos) => {
    const lista = Array.from(archivos || []).filter(Boolean)
    if (!lista.length) return
    try {
      for (const [n, file] of lista.entries()) {
        await subirVideo(file, lista.length > 1 ? `Video ${n + 1} de ${lista.length} · ` : '')
      }
    } finally {
      setSubiendo('')
    }
  }

  const subirVideo = async (file, prefijo = '') => {
    const nombre = prefijo ? `${file.name}: ` : ''
    if (!file.type?.startsWith('video/')) { notify?.(`${nombre}No es un video.`, 'error'); return }
    setSubiendo(`${prefijo}Revisando…`)
    const dur = await duracionVideo(file)
    if (dur > MAX_VIDEO_SEG + 0.5) { notify?.(`${nombre}El video dura ${Math.round(dur)} s y el máximo son ${MAX_VIDEO_SEG}.`, 'error'); return }
    setSubiendo(`${prefijo}Preparando el video…`)
    // Lo que ya llego al bucket, para no dejarlo huerfano si algo falla despues.
    const subidos = []
    try {
      const r = await comprimirVideo(file, { onProgreso: p => setSubiendo(`${prefijo}Preparando el video… ${Math.round(p * 100)} %`) })
      if (r.file.size > MAX_VIDEO_BYTES) throw new Error(`pesa ${Math.round(r.file.size / 1048576)} MB y el máximo son 50: grábalo más corto`)
      setSubiendo(`${prefijo}Subiendo el video…`)
      const video = await subirVideoEvidencia(r.file, carpeta)
      subidos.push(video)
      let poster = null
      try {
        const pb = await posterDeVideo(r.file)
        if (pb) { const sub = await subirFotoEvidencia(pb, carpeta); subidos.push(sub); poster = sub.url }
      } catch { /* sin portada: se ve el primer cuadro del video */ }
      setSubiendo(`${prefijo}Guardando…`)
      const ok = await agregar([{ id: uid(), nombre: file.name, tipo: 'video', url: video.url, path: video.path, poster, nota: '', subidoPor: usuario, subidoEn: new Date().toISOString() }])
      if (!ok) subidos.forEach(s => borrarVideoEvidencia(s))
    } catch (e) {
      notify?.(`${nombre}El video ${e.message || 'no se pudo subir'}`, 'error')
      subidos.forEach(s => borrarVideoEvidencia(s))
    }
  }

  const quitar = async (e) => {
    setQuitando(null)
    const ok = await guardar(f => ({ evidencias: misEvidencias(f, usuario).filter(x => x.id !== e.id) }), { exito: 'Evidencia quitada' })
    if (ok) {
      borrarVideoEvidencia(e)
      if (e.poster) borrarVideoEvidencia({ url: e.poster })
    }
  }

  const cambiarNota = (e, nota) => {
    if ((e.nota || '') === nota.trim()) return
    guardar(f => ({ evidencias: misEvidencias(f, usuario).map(x => (x.id === e.id ? { ...x, nota: nota.trim() } : x)) }))
  }

  const bloqueado = !!subiendo || ocupado
  return (
    <section className="tm-blq">
      <div className="otd__rot">
        <span>EVIDENCIAS</span>
        <span className="otd__n">{todas.length}</span>
      </div>
      <div className="tm-evid__acc">
        <label className={`btn btn-outline tm-file${bloqueado ? ' is-off' : ''}`}>
          <input type="file" accept="image/*" multiple disabled={bloqueado} onChange={e => { const f = e.target.files; subirFotos(f); e.target.value = '' }} />
          <IcCamara />Foto
        </label>
        <label className={`btn btn-outline tm-file${bloqueado ? ' is-off' : ''}`}>
          {/* La lista se copia antes de vaciar el input: vaciarlo borra los archivos. */}
          <input type="file" accept="video/*" multiple disabled={bloqueado} onChange={e => { const archivos = Array.from(e.target.files || []); e.target.value = ''; subirVideos(archivos) }} />
          <IcVideo />Videos
        </label>
        {subiendo && (
          <span className="tm-sync" role="status">
            {subiendo}
            <span className="tm-sync__nota">No cierres la orden ni bloquees el celular hasta que termine.</span>
          </span>
        )}
      </div>
      {todas.length === 0 ? (
        <div className="pg__vacio">Todavía no hay fotos ni videos de esta orden.</div>
      ) : (
        <ul className="tm-evid">
          {todas.map(e => {
            const propia = e.subidoPor === usuario
            const src = e.url || e.dataUrl
            return (
              <li key={e.id || src} className="tm-evid__i">
                <a className="tm-evid__m" href={src} target="_blank" rel="noopener noreferrer" aria-label={e.tipo === 'video' ? 'Ver video' : 'Ver foto'}>
                  {e.tipo === 'video'
                    ? (e.poster ? <img src={e.poster} alt="" loading="lazy" /> : <video src={`${e.url}#t=0.1`} muted playsInline preload="metadata" />)
                    : <img src={src} alt="" loading="lazy" />}
                  {e.tipo === 'video' && <span className="tm-evid__play"><IcPlay /></span>}
                </a>
                {propia && (quitando === e.id
                  ? <button type="button" className="tm-evid__x tm-evid__x--si" onClick={() => quitar(e)} disabled={ocupado}>¿Quitar?</button>
                  : <button type="button" className="tm-evid__x" onClick={() => setQuitando(e.id)} aria-label="Quitar evidencia" disabled={ocupado}>×</button>)}
                {propia
                  ? <input className="tm-evid__nota" placeholder="Nota" defaultValue={e.nota || ''} maxLength={200} onBlur={ev => cambiarNota(e, ev.target.value)} />
                  : e.nota ? <span className="tm-evid__nota tm-evid__nota--ro" title={e.nota}>{e.nota}</span> : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function BloqueInsumos({ fila, user, guardar, ocupado }) {
  const usuario = user?.usuario
  const propuestas = lista(fila.insumos_propuestos)
  const porRevisar = misPendientes(fila, usuario).length
  const { inventario, loading: invCargando } = useInventario()
  const [q, setQ] = useState('')
  const [elegido, setElegido] = useState(null)
  const [cant, setCant] = useState('1')

  const resultados = useMemo(() => {
    const texto = norm(q).trim()
    if (texto.length < 2) return []
    const tokens = texto.split(/\s+/)
    const out = []
    for (const p of inventario) {
      const t = norm(`${p.nombre} ${p.sku} ${p.codigo}`)
      if (tokens.every(k => t.includes(k))) { out.push(p); if (out.length >= 8) break }
    }
    return out
  }, [q, inventario])

  const cargar = async () => {
    const cantidad = Number(String(cant).replace(',', '.'))
    if (!elegido || !(cantidad > 0)) return
    const nueva = {
      id: uid(),
      productoId: elegido.id != null ? String(elegido.id) : undefined,
      sku: elegido.sku || '',
      codigo: elegido.codigo || '',
      nombre: elegido.nombre,
      cantidad,
      precio: Math.max(0, Math.round(Number(elegido.precio) || 0)),
      iva: Number(elegido.iva) || 0,
      cargadoPor: usuario,
      cargadoPorNombre: user?.nombre || usuario,
      cargadoEn: new Date().toISOString(),
      estado: ESTADO_PROPUESTA.PENDIENTE,
    }
    const ok = await guardar(f => ({ insumos_propuestos: [...misPendientes(f, usuario), nueva] }), { exito: `${elegido.nombre}: cargado para revisión` })
    if (ok) { setElegido(null); setQ(''); setCant('1') }
  }
  const cambiarCantidad = (p, n) => {
    if (!(n > 0)) return
    guardar(f => ({ insumos_propuestos: misPendientes(f, usuario).map(x => (x.id === p.id ? { ...x, cantidad: n } : x)) }))
  }
  const quitar = (p) => guardar(f => ({ insumos_propuestos: misPendientes(f, usuario).filter(x => x.id !== p.id) }), { exito: 'Insumo quitado' })

  const ordenadas = [...propuestas].sort((a, b) => String(b.cargadoEn).localeCompare(String(a.cargadoEn)))
  return (
    <section className="tm-blq">
      <div className="otd__rot">
        <span>INSUMOS USADOS</span>
        {porRevisar > 0 && <span className="hd-chip hd-chip--warn">{porRevisar} POR REVISAR</span>}
      </div>

      {elegido ? (
        <div className="tm-cargar">
          <div className="tm-cargar__p">
            <b>{elegido.nombre}</b>
            <span className="hd-sub">{[elegido.sku, elegido.precio ? fmt(elegido.precio) : 'sin precio', elegido.stock != null ? `${fmtCant(elegido.stock)} en bodega` : ''].filter(Boolean).join(' · ')}</span>
          </div>
          <label className="tm-cargar__c">
            <span>Cantidad</span>
            <input className="input" inputMode="decimal" value={cant} onChange={e => setCant(e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
          <div className="tm-cargar__acc">
            <Button variant="outline" size="sm" onClick={() => setElegido(null)} disabled={ocupado}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={cargar} disabled={ocupado || !(Number(String(cant).replace(',', '.')) > 0)}>Cargar</Button>
          </div>
        </div>
      ) : (
        <div className="tm-buscar">
          <label className="hd-find tm-find">
            <IcBuscar />
            <input placeholder={invCargando && !inventario.length ? 'Cargando el inventario…' : 'Buscar repuesto o insumo'} value={q} onChange={e => setQ(e.target.value)} />
          </label>
          {norm(q).trim().length >= 2 && (
            <ul className="tm-res">
              {resultados.map(p => (
                <li key={p.id || p.codigo}>
                  <button type="button" className="tm-res__i" onClick={() => { setElegido(p); setCant('1') }}>
                    <span className="tm-res__n">{p.nombre}</span>
                    <span className="tm-res__d">{[p.sku, fmt(p.precio), p.stock != null ? `${fmtCant(p.stock)} en bodega` : ''].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
              <li>
                {/* Lo que no esta en Cuentti igual se puede cargar: la oficina le pone
                    el precio al revisarlo. */}
                <button type="button" className="tm-res__i tm-res__i--libre" onClick={() => { setElegido({ nombre: q.trim().toUpperCase(), precio: 0, iva: 0 }); setCant('1') }}>
                  <span className="tm-res__n">{resultados.length ? 'No es ninguno: ' : 'No está en el inventario: '}cargar «{q.trim()}» sin precio</span>
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {ordenadas.length === 0 ? (
        <div className="pg__vacio">Busca el repuesto, pon la cantidad y cárgalo. La oficina lo revisa antes de facturar.</div>
      ) : (
        <ul className="tm-ins">
          {ordenadas.map(p => {
            const mio = p.cargadoPor === usuario
            const pendiente = p.estado === ESTADO_PROPUESTA.PENDIENTE
            const cantidadVista = p.cantidadFinal ?? p.cantidad
            const precioVisto = p.precioFinal ?? p.precio
            return (
              <li key={p.id} className={`tm-ins__i${p.estado === ESTADO_PROPUESTA.DESCARTADO ? ' is-descartado' : ''}`}>
                <div className="tm-ins__t">
                  <span className="tm-ins__n">{p.nombre}</span>
                  <span className={`hd-chip ${CHIP_PROPUESTA[p.estado] || 'hd-chip--mute'}`}>{ROTULO_PROPUESTA[p.estado] || p.estado}</span>
                </div>
                <div className="tm-ins__d">
                  {fmtCant(cantidadVista)} × {precioVisto ? fmt(precioVisto) : 'sin precio'}
                  {' · '}{mio ? 'tú' : (p.cargadoPorNombre || p.cargadoPor)}
                  {p.estado === ESTADO_PROPUESTA.CORREGIDO && ` · cargaste ${fmtCant(p.cantidad)} × ${p.precio ? fmt(p.precio) : 'sin precio'}`}
                </div>
                {mio && pendiente && (
                  <div className="tm-ins__acc">
                    <button type="button" className="tm-paso" aria-label="Uno menos" disabled={ocupado || p.cantidad <= 1} onClick={() => cambiarCantidad(p, p.cantidad - 1)}>−</button>
                    <span className="tm-ins__c">{fmtCant(p.cantidad)}</span>
                    <button type="button" className="tm-paso" aria-label="Uno más" disabled={ocupado} onClick={() => cambiarCantidad(p, p.cantidad + 1)}>+</button>
                    <button type="button" className="tm-ins__q" disabled={ocupado} onClick={() => quitar(p)}>Quitar</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
