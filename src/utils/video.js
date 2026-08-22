// Reescala un video en el propio navegador antes de subirlo.
//
// Por qué existe: los teléfonos graban en 4K por defecto. Un clip de 10 segundos
// pesa ~60 MB, que es más de lo que acepta el bucket de Storage, y subirlo por
// los datos del taller es lento. A 1080p el mismo clip queda en 8-12 MB y en la
// pantalla de un teléfono no se nota la diferencia.
//
// Cómo: se pinta el video cuadro a cuadro en un <canvas> del tamaño de destino y
// se graba ese canvas con MediaRecorder. El audio se toma del propio video y se
// pega al stream, porque un canvas no tiene sonido.
//
// REGLA: esto NUNCA debe impedir subir. Si el navegador no soporta la mezcla, si
// el códec no está, si el video es raro o si algo revienta, se devuelve el
// archivo ORIGINAL y la subida sigue su curso. Comprimir es una mejora, no un
// requisito.

const ALTO_OBJETIVO = 1080

// Safari escribe mp4; Chrome y Firefox, webm. Se pide el primero que el
// navegador declare soportar.
function elegirFormato() {
  if (typeof MediaRecorder === 'undefined') return null
  const candidatos = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return candidatos.find(t => {
    try { return MediaRecorder.isTypeSupported(t) } catch { return false }
  }) || null
}

export function sePuedeComprimirVideo() {
  return !!elegirFormato() &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

// Devuelve { file, comprimido, de, a } — `file` es el original si no se pudo.
export async function comprimirVideo(file, { onProgreso } = {}) {
  const sinCambios = { file, comprimido: false, de: file.size, a: file.size }
  const mimeType = elegirFormato()
  if (!mimeType || !sePuedeComprimirVideo()) return sinCambios

  let url = null
  try {
    const video = document.createElement('video')
    video.muted = true          // sin esto, iOS no deja reproducir sin gesto
    video.playsInline = true
    video.preload = 'auto'
    url = URL.createObjectURL(file)
    video.src = url

    await new Promise((res, rej) => {
      video.onloadedmetadata = res
      video.onerror = () => rej(new Error('no se pudo leer el video'))
      setTimeout(() => rej(new Error('tardó demasiado en abrir')), 15000)
    })

    const anchoOrig = video.videoWidth
    const altoOrig = video.videoHeight
    if (!anchoOrig || !altoOrig) return sinCambios
    // Ya es 1080p o menos: recodificar solo empeoraría la calidad.
    if (Math.min(anchoOrig, altoOrig) <= ALTO_OBJETIVO) return sinCambios

    const escala = ALTO_OBJETIVO / Math.min(anchoOrig, altoOrig)
    // Dimensiones pares: algunos codificadores fallan con impares.
    const ancho = Math.round(anchoOrig * escala / 2) * 2
    const alto = Math.round(altoOrig * escala / 2) * 2

    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')

    const stream = canvas.captureStream(30)
    // El audio no viaja por el canvas: se toma del video y se añade al stream.
    // Si el navegador no expone captureStream del <video>, el clip queda mudo,
    // que para una evidencia de taller es aceptable; perder la subida no.
    try {
      const vs = video.captureStream ? video.captureStream() : null
      const pista = vs?.getAudioTracks?.()[0]
      if (pista) stream.addTrack(pista)
    } catch { /* sin audio, pero se sube */ }

    const trozos = []
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
    rec.ondataavailable = e => { if (e.data?.size) trozos.push(e.data) }

    const terminado = new Promise(res => { rec.onstop = res })
    rec.start(500)

    const dur = video.duration || 0
    let dibujando = true
    const dibujar = () => {
      if (!dibujando) return
      try { ctx.drawImage(video, 0, 0, ancho, alto) } catch { /* cuadro suelto */ }
      if (dur && onProgreso) onProgreso(Math.min(1, video.currentTime / dur))
      requestAnimationFrame(dibujar)
    }

    await video.play()
    dibujar()

    await new Promise(res => {
      video.onended = res
      // Red de seguridad: nunca colgarse. El doble de la duración + 10s.
      setTimeout(res, Math.min(180000, (dur * 2 + 10) * 1000))
    })

    dibujando = false
    rec.stop()
    await terminado

    const blob = new Blob(trozos, { type: mimeType })
    if (!blob.size) return sinCambios
    // Si el "comprimido" no es más chico, no sirve de nada: se sube el original.
    if (blob.size >= file.size) return sinCambios

    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
    const base = (file.name || 'video').replace(/\.[^.]+$/, '')
    const nuevo = new File([blob], `${base}-1080.${ext}`, { type: mimeType })
    return { file: nuevo, comprimido: true, de: file.size, a: nuevo.size }
  } catch {
    // Cualquier fallo: se sube el original.
    return sinCambios
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}
