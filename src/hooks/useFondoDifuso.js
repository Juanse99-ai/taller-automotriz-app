import { useEffect, useRef } from 'react'
import { esVideoEvid, imagenEvid } from '../utils/evidencias'

// Fondo difuminado del visor de evidencias: lo que el cliente esta mirando,
// reducido a unos pocos pixeles, apagado y estirado a la pantalla.
//
// No usa `filter: blur`: a pantalla completa le cuesta a un iPhone, y ampliado
// deja manchas con forma (las ruedas se volvian dos sombras enormes). Reducir a
// 8 px y volver a 64 tres veces da una neblina de color que no cuesta nada.
//
// Todo pasa en UN lienzo que se funde poco a poco hacia lo que toque: al cambiar
// de evidencia el fondo se transforma en vez de apagarse, y con un video sigue
// lo que va pasando en el video.
//
// El fondo de un video sale de sus propios cuadros y no de la portada: las
// portadas subidas desde Safari hasta el 15 sep 2026 son negras, y con ellas el
// fondo quedaba negro. Una portada negra se descarta; mientras llega el primer
// cuadro, el fondo se queda como estaba.

const LADO = 64
const LADO_CHICO = 8
const PASADAS = 3
const APAGADO = 'rgba(4, 6, 12, 0.42)' // para que la foto y los controles resalten encima
const TAU_MS = 260       // en ~0,8 s el fondo ya es el nuevo
const MS_CUADRO = 180    // cada cuanto se toma un cuadro del video en marcha
const MS_FUNDIDO = 1200  // tras esto sin cambios, el lienzo queda quieto
const UMBRAL_NEGRO = 16  // una imagen con TODOS sus puntos por debajo es negra

const nuevoLienzo = (lado) => {
  const c = document.createElement('canvas')
  c.width = c.height = lado
  return c
}

function esNegra(ctx) {
  try {
    const d = ctx.getImageData(0, 0, LADO_CHICO, LADO_CHICO).data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] >= UMBRAL_NEGRO || d[i + 1] >= UMBRAL_NEGRO || d[i + 2] >= UMBRAL_NEGRO) return false
    }
    return true
  } catch {
    return false // el navegador no deja leerla: se usa sin revisar
  }
}

// Pinta `fuente` (imagen o video) difuminada y apagada en `destino`. Con
// `revisar`, devuelve true si la fuente es negra entera.
function difuminar(fuente, destino, grande, chico, revisar) {
  const cg = grande.getContext('2d')
  const cc = chico.getContext('2d')
  cg.imageSmoothingQuality = 'high'
  cc.imageSmoothingQuality = 'high'
  cg.clearRect(0, 0, LADO, LADO)
  cg.drawImage(fuente, 0, 0, LADO, LADO)
  let negra = false
  for (let i = 0; i < PASADAS; i++) {
    cc.clearRect(0, 0, LADO_CHICO, LADO_CHICO)
    cc.drawImage(grande, 0, 0, LADO_CHICO, LADO_CHICO)
    if (i === 0 && revisar) negra = esNegra(cc)
    cg.clearRect(0, 0, LADO, LADO)
    cg.drawImage(chico, 0, 0, LADO, LADO)
  }
  const cd = destino.getContext('2d')
  cd.clearRect(0, 0, LADO, LADO)
  cd.drawImage(grande, 0, 0)
  cd.fillStyle = APAGADO
  cd.fillRect(0, 0, LADO, LADO)
  return negra
}

// Deja en la cache la imagen ya difuminada. Las portadas se piden con CORS para
// poder ver si son negras (Supabase lo permite); si un servidor no lo permite,
// se piden sin CORS y se usan sin revisar.
function cargar(cache, src, esPortada) {
  if (!src || cache.has(src)) return
  const entrada = { estado: 'cargando', lienzo: null }
  cache.set(src, entrada)
  const intentar = (conCors) => {
    const im = new Image()
    if (conCors) im.crossOrigin = 'anonymous'
    im.onload = () => {
      const pintar = () => {
        try {
          const destino = nuevoLienzo(LADO)
          const negra = difuminar(im, destino, nuevoLienzo(LADO), nuevoLienzo(LADO_CHICO), conCors)
          entrada.lienzo = destino
          entrada.estado = negra ? 'negra' : 'lista'
        } catch {
          entrada.estado = 'error'
        }
      }
      if (im.decode) im.decode().then(pintar, pintar)
      else pintar()
    }
    im.onerror = () => { if (conCors) intentar(false); else entrada.estado = 'error' }
    im.src = src
  }
  intentar(esPortada)
}

// Pinta el fondo en `lienzoRef` (un <canvas>) para la evidencia `idx`.
// `videoRef` es el <video> de la tarjeta cuando la evidencia es un video.
// El lienzo lleva en data-fuente de donde sale el fondo: foto, video, portada,
// vecina o vacio mientras se queda como estaba.
export default function useFondoDifuso(lienzoRef, videoRef, items, idx) {
  const vistaRef = useRef({ items, idx })
  useEffect(() => { vistaRef.current = { items, idx } })

  useEffect(() => {
    const visible = lienzoRef.current
    const cv = visible?.getContext('2d')
    if (!cv) return
    visible.width = visible.height = LADO
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const cache = new Map()
    const cuadro = nuevoLienzo(LADO)
    const grande = nuevoLienzo(LADO)
    const chico = nuevoLienzo(LADO_CHICO)
    let video = null
    let hayCuadro = false
    let ultimoCuadro = -1
    let objetivo = null
    let restante = 0
    let pintado = false
    let fuente = null
    let previo = performance.now()
    let raf = 0

    const lista = (f) => {
      const e = cache.get(imagenEvid(f))
      return e?.estado === 'lista' ? e.lienzo : null
    }

    const paso = (ahora) => {
      const dt = Math.min(ahora - previo, 100)
      previo = ahora
      const { items, idx } = vistaRef.current
      const actual = items[idx]
      for (const n of [idx, idx + 1, idx - 1]) {
        if (items[n]) cargar(cache, imagenEvid(items[n]), esVideoEvid(items[n]))
      }

      let nuevo = null
      let nuevaFuente = ''
      if (esVideoEvid(actual)) {
        const v = videoRef.current
        if (v !== video) {
          video = v
          hayCuadro = false
          ultimoCuadro = -1
          // Safari no deja pintar un cuadro en un lienzo hasta presentarlo:
          // antes sale negro.
          v?.requestVideoFrameCallback?.(() => { if (video === v) hayCuadro = true })
        }
        if (v && !v.requestVideoFrameCallback && v.readyState >= 2 && v.currentTime > 0) hayCuadro = true
        if (v && hayCuadro && (ultimoCuadro < 0 || (!reducir && !v.paused && ahora - ultimoCuadro >= MS_CUADRO))) {
          try {
            difuminar(v, cuadro, grande, chico, false)
            ultimoCuadro = ahora
            restante = MS_FUNDIDO
          } catch {
            video = null // se vuelve a esperar un cuadro
          }
        }
        if (hayCuadro && ultimoCuadro >= 0) { nuevo = cuadro; nuevaFuente = 'video' }
        else if ((nuevo = lista(actual))) nuevaFuente = 'portada'
      } else if ((nuevo = lista(actual))) {
        nuevaFuente = 'foto'
      }

      // Recien abierto y sin nada propio listo: la vecina, para no arrancar en negro.
      if (!nuevo && !pintado) {
        for (const n of [idx - 1, idx + 1]) {
          if ((nuevo = lista(items[n]))) { nuevaFuente = 'vecina'; break }
        }
      }

      if (nuevo && nuevo !== objetivo) { objetivo = nuevo; restante = MS_FUNDIDO }
      // Sin nada nuevo, el fondo se queda como esta: no se apaga entre una y otra.
      if (objetivo && restante > 0) {
        restante -= dt
        // El ultimo paso va entero, para no dejar restos del fondo anterior por redondeo.
        cv.globalAlpha = reducir || restante <= 0 ? 1 : 1 - Math.exp(-dt / TAU_MS)
        cv.drawImage(objetivo, 0, 0)
        cv.globalAlpha = 1
        pintado = true
      }
      if (nuevaFuente !== fuente) { fuente = nuevaFuente; visible.dataset.fuente = fuente }
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [lienzoRef, videoRef])
}
