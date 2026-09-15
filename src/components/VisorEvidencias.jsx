import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { esVideoEvid, srcFotoEvid } from '../utils/evidencias'

// Visor de fotos y videos del portal, al estilo de las historias: la evidencia
// en una tarjeta vertical, el fondo hecho con la misma foto difuminada, barras
// de progreso arriba y avance solo. Es el UNICO sitio de la app con fondo
// difuminado: aqui no separa contenido ni decora tarjetas, llena la pantalla
// alrededor de la foto que el cliente vino a ver.
//
// Gestos (celular): tocar el tercio izquierdo vuelve, el resto avanza; mantener
// apretado pausa y esconde los controles para ver la foto limpia; deslizar a
// los lados cambia; deslizar hacia abajo cierra. Teclado: flechas, Esc,
// espacio pausa y M quita o pone el sonido.

// Una foto dura lo que tarda en leerse: 6 s, mas tiempo si trae nota larga.
const MS_FOTO = 6000
const MS_POR_LETRA = 45
const MS_NOTA_MAX = 6000
const duracionFoto = (f) => MS_FOTO + Math.min(MS_NOTA_MAX, (f?.nota?.length || 0) * MS_POR_LETRA)

const MS_MANTENER = 180      // apretado mas que esto ya no es un toque: es pausa
const PX_CERRAR = 120        // arrastre hacia abajo que cierra aunque sea lento
const PX_MIN_CERRAR = 40     // un tiron corto y rapido tambien cierra...
const VEL_CERRAR = 0.45      // ...si va a mas de esto (px por ms)

const srcFondo = (f) => (esVideoEvid(f) ? (f?.poster || '') : srcFotoEvid(f))

// El fondo de un video sin portada toma la foto mas cercana, para no saltar a
// negro en medio de la tanda.
function fondoPara(items, i) {
  for (let d = 0; d < items.length; d++) {
    const atras = srcFondo(items[i - d]); if (atras) return atras
    const adelante = srcFondo(items[i + d]); if (adelante) return adelante
  }
  return ''
}

// El fondo difuso NO usa `filter: blur`: un blur de pantalla entera le cuesta a
// un iPhone, y ampliado deja manchas con forma (las ruedas se volvian dos
// sombras enormes). Aqui la foto se reduce a unos pocos pixeles en un canvas,
// se agranda y se vuelve a reducir varias veces, y el navegador estira ese
// canvas diminuto a la pantalla: queda una neblina de color que no cuesta nada.
// Pintar una imagen de otro dominio en un canvas esta permitido; lo prohibido
// es leer sus pixeles, y aqui no se leen.
const LADO_FONDO = 64
const LADO_CHICO = 8
const PASADAS = 3
function pintarDifuso(canvas, im) {
  const lado = Math.min(im.naturalWidth, im.naturalHeight)
  const trabajo = document.createElement('canvas')
  const chico = document.createElement('canvas')
  trabajo.width = trabajo.height = LADO_FONDO
  chico.width = chico.height = LADO_CHICO
  const ct = trabajo.getContext('2d')
  const cc = chico.getContext('2d')
  const cv = canvas.getContext('2d')
  if (!lado || !ct || !cc || !cv) return
  for (const c of [ct, cc, cv]) { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high' }
  ct.drawImage(im, (im.naturalWidth - lado) / 2, (im.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO_FONDO, LADO_FONDO)
  for (let i = 0; i < PASADAS; i++) {
    cc.clearRect(0, 0, LADO_CHICO, LADO_CHICO)
    cc.drawImage(trabajo, 0, 0, LADO_CHICO, LADO_CHICO)
    ct.clearRect(0, 0, LADO_FONDO, LADO_FONDO)
    ct.drawImage(chico, 0, 0, LADO_FONDO, LADO_FONDO)
  }
  cv.clearRect(0, 0, LADO_FONDO, LADO_FONDO)
  cv.drawImage(trabajo, 0, 0)
  // Apagado para que la foto y los controles resalten encima.
  cv.fillStyle = 'rgba(4, 6, 12, 0.42)'
  cv.fillRect(0, 0, LADO_FONDO, LADO_FONDO)
}

function CapaDifusa({ src, activa }) {
  const ref = useRef(null)
  useEffect(() => {
    let vigente = true
    const im = new Image()
    im.decoding = 'async'
    im.onload = () => { if (vigente && ref.current) pintarDifuso(ref.current, im) }
    im.src = src
    return () => { vigente = false }
  }, [src])
  return (
    <canvas ref={ref} className={`hv__fondo-capa${activa ? ' es-activa' : ''}`}
      width={LADO_FONDO} height={LADO_FONDO} data-src={src} aria-hidden="true" />
  )
}

const Icono = ({ d, relleno = false }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill={relleno ? 'currentColor' : 'none'}
    stroke={relleno ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)
const I_PAUSA = <><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></>
const I_PLAY = <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
const I_SONIDO = <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.4 5.6a9 9 0 0 1 0 12.8" /></>
const I_MUTE = <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></>
const I_COMPARTIR = <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>
const I_CERRAR = <path d="M18 6 6 18M6 6l12 12" />
const I_ANT = <path d="m15 18-6-6 6-6" />
const I_SIG = <path d="m9 18 6-6-6-6" />
const I_PRIMERA = <><path d="m17 18-6-6 6-6" /><path d="M7 6v12" /></>
const I_ULTIMA = <><path d="m7 18 6-6-6-6" /><path d="M17 6v12" /></>

export default function VisorEvidencias({ items = [], inicio = 0, titulo = '', detalle = [], onCerrar }) {
  const total = items.length
  const [idx, setIdx] = useState(() => Math.min(Math.max(inicio, 0), Math.max(total - 1, 0)))
  const [pausado, setPausado] = useState(false)
  const [manteniendo, setManteniendo] = useState(false)
  const [oculto, setOculto] = useState(() => document.hidden)
  const [listo, setListo] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [silencio, setSilencio] = useState(false)

  const actual = items[idx]
  const esVideo = esVideoEvid(actual)
  const detenido = pausado || manteniendo || oculto

  const raizRef = useRef(null)
  const tarjetaRef = useRef(null)
  const fondoRef = useRef(null)
  const barraRef = useRef(null)
  const videoRef = useRef(null)
  const transcurridoRef = useRef(0)
  const estadoRef = useRef({})
  const silencioRef = useRef(silencio)
  const gestoRef = useRef(null)

  // ── Navegacion ──────────────────────────────────────────────────────────
  const ir = useCallback((n) => {
    if (n < 0 || n >= total) return
    transcurridoRef.current = 0
    if (n === idx) { if (videoRef.current) videoRef.current.currentTime = 0; return }
    setListo(false); setFallo(false); setPausado(false)
    setIdx(n)
  }, [idx, total])
  // Tocar a la derecha en la ultima cierra, como en las historias; el boton de
  // escritorio y la flecha del teclado se quedan quietos ahi.
  const siguiente = useCallback((cerrarAlFinal = false) => {
    if (idx < total - 1) ir(idx + 1)
    else if (cerrarAlFinal) onCerrar?.()
  }, [idx, total, ir, onCerrar])
  const anterior = useCallback(() => ir(Math.max(idx - 1, 0)), [idx, ir])

  // Lo que lee el bucle de progreso sin volver a crearse en cada render.
  useEffect(() => {
    estadoRef.current = { detenido, listo, esVideo, idx, total, dur: duracionFoto(actual), ir }
  })
  useEffect(() => { silencioRef.current = silencio }, [silencio])

  // ── Progreso: un solo bucle que pinta la barra de la evidencia actual ─────
  useEffect(() => {
    let raf = 0
    let previo = performance.now()
    const paso = (ahora) => {
      const dt = Math.min(ahora - previo, 100) // una pestana que vuelve no salta de golpe
      previo = ahora
      const s = estadoRef.current
      let p = 0
      if (s.esVideo) {
        const v = videoRef.current
        p = v && v.duration ? v.currentTime / v.duration : 0
      } else {
        if (s.listo && !s.detenido) transcurridoRef.current += dt
        p = transcurridoRef.current / s.dur
        // La ultima no cierra sola: el cliente puede seguir mirandola.
        if (p >= 1 && s.idx < s.total - 1) s.ir(s.idx + 1)
      }
      if (barraRef.current) barraRef.current.style.transform = `scaleX(${Math.min(Math.max(p, 0), 1)})`
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── Video: arranca con sonido; si el navegador no deja, sigue en silencio ──
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = silencioRef.current
    v.play()?.catch?.(() => {
      if (v.muted) return
      v.muted = true
      setSilencio(true)
      v.play()?.catch?.(() => {})
    })
  }, [idx])
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (detenido) v.pause()
    else if (v.paused && !v.ended) v.play()?.catch?.(() => {})
  }, [detenido])

  const alternarSonido = () => {
    const nuevo = !silencio
    const v = videoRef.current
    if (v) v.muted = nuevo
    setSilencio(nuevo)
  }

  const compartir = async () => {
    const url = actual?.url
    if (!url) return
    setPausado(true)
    try {
      if (navigator.share) await navigator.share({ title: titulo || 'Evidencia', text: actual.nota || undefined, url })
      else window.open(url, '_blank', 'noopener,noreferrer')
    } catch { /* el cliente cerro el menu de compartir */ }
  }

  // ── Pestana oculta: nada avanza mientras nadie mira ───────────────────────
  useEffect(() => {
    const alCambiar = () => setOculto(document.hidden)
    document.addEventListener('visibilitychange', alCambiar)
    return () => document.removeEventListener('visibilitychange', alCambiar)
  }, [])

  // ── Foco: entra al visor, vuelve a donde estaba al cerrar ─────────────────
  useEffect(() => {
    const previo = document.activeElement
    raizRef.current?.focus({ preventScroll: true })
    return () => { if (previo?.focus) previo.focus({ preventScroll: true }) }
  }, [])

  // ── Teclado. Sin animacion: se usa muchas veces seguidas ─────────────────
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCerrar?.() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(false) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); anterior() }
      else if ((e.key === ' ' || e.key === 'k') && !e.target.closest?.('button, a')) { e.preventDefault(); setPausado(p => !p) }
      else if (e.key === 'm' || e.key === 'M') { const v = videoRef.current; if (v) { v.muted = !v.muted; setSilencio(v.muted) } }
      else if (e.key === 'Tab') {
        // El foco no se escapa a la pagina de abajo.
        const focos = [...(raizRef.current?.querySelectorAll('button:not([disabled])') || [])]
        if (!focos.length) return
        const i = focos.indexOf(document.activeElement)
        const destino = e.shiftKey ? (i <= 0 ? focos.length - 1 : i - 1) : (i === focos.length - 1 ? 0 : i + 1)
        e.preventDefault()
        focos[destino].focus()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [siguiente, anterior, onCerrar])

  // ── Precarga de las vecinas: el cambio se siente instantaneo ─────────────
  useEffect(() => {
    for (const n of [idx + 1, idx - 1]) {
      const src = srcFondo(items[n])
      if (src) { const im = new Image(); im.decoding = 'async'; im.src = src }
    }
  }, [idx, items])

  // ── Gestos sobre la tarjeta ───────────────────────────────────────────────
  const moverTarjeta = (y) => {
    const c = tarjetaRef.current
    const f = fondoRef.current
    const bajada = Math.max(y, 0)
    if (c) { c.style.transition = 'none'; c.style.transform = `translate3d(0, ${y}px, 0) scale(${1 - Math.min(bajada / 1800, 0.07)})` }
    if (f) { f.style.transition = 'none'; f.style.opacity = String(1 - Math.min(bajada / 520, 0.55)) }
  }
  const soltarTarjeta = () => {
    const c = tarjetaRef.current
    const f = fondoRef.current
    if (c) { c.style.transition = 'transform 240ms var(--ease-out)'; c.style.transform = '' }
    if (f) { f.style.transition = 'opacity 240ms var(--ease-out)'; f.style.opacity = '' }
  }

  const alApretar = (e) => {
    // Un segundo dedo o un boton no empiezan gesto.
    if (gestoRef.current || e.button > 0 || e.target.closest('button, a')) return
    // Captura el dedo para que el arrastre siga aunque salga de la tarjeta. Algun
    // navegador lanza error si el puntero ya se solto: el gesto sigue sin ella.
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* sin captura */ }
    const g = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), modo: 'toque', mantiene: false }
    g.reloj = setTimeout(() => { g.mantiene = true; setManteniendo(true) }, MS_MANTENER)
    gestoRef.current = g
  }
  const alMover = (e) => {
    const g = gestoRef.current
    if (!g || e.pointerId !== g.id) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (g.modo === 'toque' && Math.hypot(dx, dy) > 10) {
      clearTimeout(g.reloj)
      g.modo = dy > 0 && Math.abs(dy) > Math.abs(dx) ? 'bajar' : 'lado'
      if (g.modo === 'bajar' && !g.mantiene) { g.mantiene = true; setManteniendo(true) }
    }
    // Hacia arriba no hay a donde ir: se mueve con friccion en vez de frenar en seco.
    if (g.modo === 'bajar') moverTarjeta(dy > 0 ? dy : dy / 5)
  }
  const alSoltar = (e) => {
    const g = gestoRef.current
    if (!g || e.pointerId !== g.id) return
    gestoRef.current = null
    clearTimeout(g.reloj)
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    const ms = Math.max(performance.now() - g.t0, 1)
    if (g.mantiene) setManteniendo(false)
    if (e.type === 'pointercancel') { soltarTarjeta(); return }
    if (g.modo === 'bajar') {
      if (dy > PX_CERRAR || (dy > PX_MIN_CERRAR && dy / ms > VEL_CERRAR)) onCerrar?.()
      else soltarTarjeta()
      return
    }
    if (g.modo === 'lado') {
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) siguiente(false); else anterior() }
      return
    }
    if (g.mantiene) return
    const r = e.currentTarget.getBoundingClientRect()
    if (e.clientX - r.left < r.width * 0.3) anterior()
    // Con el dedo, tocar en la ultima cierra; con el mouse no: ahi hay flechas.
    else siguiente(e.pointerType !== 'mouse')
  }

  // Fondos de la actual y sus vecinas, montados a la vez: al pasar de una a
  // otra el fondo se funde en vez de apagarse y volver a encender.
  const fondos = useMemo(() => {
    const lista = []
    for (const n of [idx - 1, idx, idx + 1]) {
      if (n < 0 || n >= total) continue
      const src = fondoPara(items, n)
      if (src && !lista.some(x => x.src === src)) lista.push({ src, activo: false })
    }
    const activo = fondoPara(items, idx)
    return lista.map(x => ({ ...x, activo: x.src === activo }))
  }, [items, idx, total])

  if (!actual) return null
  const tipo = esVideo ? 'Video' : 'Foto'
  const src = esVideo ? actual.url : srcFotoEvid(actual)

  return (
    <div ref={raizRef} className={`hv${manteniendo ? ' es-limpio' : ''}`} role="dialog" aria-modal="true"
      aria-label={titulo ? `Fotos y videos · ${titulo}` : 'Fotos y videos'} tabIndex={-1}>
      <div className="hv__fondo" ref={fondoRef} aria-hidden="true">
        {fondos.map(f => <CapaDifusa key={f.src} src={f.src} activa={f.activo} />)}
      </div>

      <button type="button" className="hv__cerrar" onClick={() => onCerrar?.()} aria-label="Cerrar">
        <Icono d={I_CERRAR} />
      </button>

      <div className="hv__escena">
        <div className="hv__lado">
          {total > 2 && (
            <button type="button" className="hv__saltar" onClick={() => ir(0)} disabled={idx === 0} aria-label="Primera">
              <Icono d={I_PRIMERA} />
            </button>
          )}
          <button type="button" className="hv__flecha" onClick={anterior} disabled={idx === 0} aria-label="Anterior">
            <Icono d={I_ANT} />
          </button>
        </div>

        <div ref={tarjetaRef} className="hv__tarjeta"
          onPointerDown={alApretar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}
          onContextMenu={e => e.preventDefault()}>
          <div className="hv__medio">
            {esVideo ? (
              <video key={idx} ref={videoRef} className="hv__media" src={src} poster={actual.poster || undefined}
                playsInline preload="auto"
                onLoadedData={() => setListo(true)} onPlaying={() => setListo(true)}
                onEnded={() => { if (idx < total - 1) ir(idx + 1) }}
                onError={() => { setFallo(true); setListo(true) }} />
            ) : (
              <img key={idx} className="hv__media" src={src} alt={actual.nota || `${tipo} ${idx + 1} de ${total}`}
                draggable={false} decoding="async"
                onLoad={() => setListo(true)} onError={() => { setFallo(true); setListo(true) }} />
            )}
            {!listo && <div className="hv__cargando" aria-hidden="true" />}
            {fallo && <div className="hv__fallo">No se pudo cargar {esVideo ? 'este video' : 'esta foto'}.</div>}

            {/* La franja oscura de arriba es para leer el titulo sobre cualquier foto, no adorno. */}
            <div className="hv__cabeza">
              <div className="hv__segs">
                {items.map((f, i) => (
                  <button key={i === idx ? `${i}-actual` : i} type="button"
                    className={`hv__seg${i < idx ? ' es-visto' : ''}`} onClick={() => ir(i)}
                    aria-label={`${esVideoEvid(f) ? 'Video' : 'Foto'} ${i + 1} de ${total}`}
                    aria-current={i === idx ? 'true' : undefined}>
                    <span className="hv__seg-pista"><span className="hv__seg-relleno" ref={i === idx ? barraRef : undefined} /></span>
                  </button>
                ))}
              </div>
              <div className="hv__fila">
                <div className="hv__titulo">
                  {titulo && <span className="hv__tit">{titulo}</span>}
                  {detalle.length > 0 && (
                    <span className="hv__det">
                      {detalle.map((parte, i) => (
                        <Fragment key={i}>
                          {i > 0 && ' '}
                          <span className="hv__det-parte">{parte}{i < detalle.length - 1 && '\u00a0·'}</span>
                        </Fragment>
                      ))}
                    </span>
                  )}
                </div>
                <div className="hv__acciones">
                  {esVideo && (
                    <button type="button" className="hv__ico" onClick={alternarSonido}
                      aria-label={silencio ? 'Activar sonido' : 'Silenciar'} aria-pressed={!silencio}>
                      <Icono d={silencio ? I_MUTE : I_SONIDO} />
                    </button>
                  )}
                  <button type="button" className="hv__ico" onClick={() => setPausado(p => !p)}
                    aria-label={pausado ? 'Reproducir' : 'Pausar'}>
                    <Icono d={pausado ? I_PLAY : I_PAUSA} relleno />
                  </button>
                  {actual.url && (
                    <button type="button" className="hv__ico" onClick={compartir} aria-label="Compartir">
                      <Icono d={I_COMPARTIR} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="hv__pie" aria-live="polite">
            {actual.nota && <p className="hv__nota">{actual.nota}</p>}
            <p className="hv__cuenta">{tipo} {idx + 1} de {total}</p>
          </div>
        </div>

        <div className="hv__lado">
          <button type="button" className="hv__flecha" onClick={() => siguiente(false)} disabled={idx === total - 1} aria-label="Siguiente">
            <Icono d={I_SIG} />
          </button>
          {total > 2 && (
            <button type="button" className="hv__saltar" onClick={() => ir(total - 1)} disabled={idx === total - 1} aria-label="Última">
              <Icono d={I_ULTIMA} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
