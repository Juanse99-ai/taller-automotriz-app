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
  const sinCambios = (motivo) => ({ file, comprimido: false, de: file.size, a: file.size, motivo })
  const mimeType = elegirFormato()
  if (!mimeType || !sePuedeComprimirVideo()) return sinCambios('este navegador no puede grabar video')

  let url = null
  try {
    const video = document.createElement('video')
    video.muted = true          // sin esto, iOS no deja reproducir sin gesto
    video.playsInline = true
    video.preload = 'auto'
    // FUERA DE PANTALLA PERO DENTRO DEL DOM. Safari no reproduce un <video> que
    // no esta en el documento, y sin reproduccion no hay cuadros que pintar en el
    // canvas: la compresion se quedaba colgada y acababa subiendo el original.
    // No vale display:none ni visibility:hidden por lo mismo.
    video.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none'
    video.setAttribute('data-comprimiendo', '1')
    document.body.appendChild(video)
    url = URL.createObjectURL(file)
    video.src = url

    await new Promise((res, rej) => {
      video.onloadedmetadata = res
      video.onerror = () => rej(new Error('no se pudo leer el video'))
      setTimeout(() => rej(new Error('tardó demasiado en abrir')), 15000)
    })

    const anchoOrig = video.videoWidth
    const altoOrig = video.videoHeight
    if (!anchoOrig || !altoOrig) return sinCambios('no se pudieron leer las medidas')
    // Ya es 1080p o menos: recodificar solo empeoraría la calidad.
    if (Math.min(anchoOrig, altoOrig) <= ALTO_OBJETIVO) return sinCambios('ya venia en 1080p o menos')

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
      const cap = video.captureStream || video.webkitCaptureStream
      const vs = cap ? cap.call(video) : null
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
    if (!blob.size) return sinCambios('la grabacion salio vacia')
    // Si el "comprimido" no es más chico, no sirve de nada: se sube el original.
    if (blob.size >= file.size) return sinCambios('comprimido pesaba mas que el original')

    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
    const base = (file.name || 'video').replace(/\.[^.]+$/, '')
    const nuevo = new File([blob], `${base}-1080.${ext}`, { type: mimeType })
    return { file: nuevo, comprimido: true, de: file.size, a: nuevo.size }
  } catch (e) {
    // Cualquier fallo: se sube el original, pero diciendo que paso.
    return sinCambios(e?.message || 'fallo al comprimir')
  } finally {
    if (url) URL.revokeObjectURL(url)
    try { document.querySelectorAll('video[data-comprimiendo]').forEach(v => v.remove()) } catch { /* ya no esta */ }
  }
}

// Foto de portada de un video, sacada en el propio navegador antes de subirlo.
//
// Por que existe: la miniatura de un video se pintaba con un <video> de verdad,
// asi que para enseñar un cuadro de 120px el navegador se bajaba el archivo
// entero. Medido con los videos que ya hay en el bucket: 5 MB el mp4 mas ligero
// y 38 MB un .mov de iPhone, y entre 1,1 y 2,0 segundos hasta que aparecia algo.
// En el celular del cliente eso son sus datos y su paciencia. Con la portada
// guardada, la ficha es un JPEG de unos 40 kB y sale al instante; el video solo
// se baja cuando alguien lo toca para verlo.
//
// Se toma el cuadro del segundo 0,1 y no el 0: muchos videos empiezan en negro
// (el .mov de prueba lo hacia) y la portada saldria en negro tambien.
//
// REGLA, la misma que comprimirVideo: esto NUNCA debe impedir subir. Si el
// navegador no puede decodificar ese codec —un .mov con HEVC en Chrome, por
// ejemplo— devuelve null y la subida sigue sin portada.
export function posterDeVideo(file, maxDim = 640, calidad = 0.72) {
  return new Promise((resolve) => {
    let url = null
    let terminado = false
    const acabar = (r) => {
      if (terminado) return
      terminado = true
      if (url) URL.revokeObjectURL(url)
      resolve(r)
    }
    // Tope duro: un video que no decodifica puede quedarse colgado sin lanzar
    // error, y la subida no puede esperar a nadie.
    const reloj = setTimeout(() => acabar(null), 8000)
    try {
      url = URL.createObjectURL(file)
      const v = document.createElement('video')
      v.muted = true
      v.playsInline = true
      v.preload = 'auto'
      v.src = url
      v.addEventListener('error', () => { clearTimeout(reloj); acabar(null) })
      v.addEventListener('loadedmetadata', () => {
        // Si dura menos de 0,1 s se coge el principio y ya.
        v.currentTime = Math.min(0.1, (v.duration || 1) / 2)
      })
      v.addEventListener('seeked', () => {
        clearTimeout(reloj)
        try {
          const { videoWidth: w, videoHeight: h } = v
          if (!w || !h) return acabar(null)
          const escala = Math.min(1, maxDim / Math.max(w, h))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(w * escala)
          canvas.height = Math.round(h * escala)
          canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
          canvas.toBlob(b => acabar(b || null), 'image/jpeg', calidad)
        } catch { acabar(null) }
      })
    } catch { clearTimeout(reloj); acabar(null) }
  })
}
