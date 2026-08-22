// Comprime una foto antes de guardarla o subirla.
//
// Estaba escrito dentro de TrabajoForm y las otras dos pantallas que aceptan
// fotos (Recepcion e Inspecciones) no lo usaban: guardaban el archivo CRUDO en
// base64. Una foto de camara son 3-5 MB; comprimida son unos 150 kB.

// Devuelve el dataURL comprimido, o el original si el navegador no puede.
// Nunca falla: comprimir es una mejora, no un requisito.
export const comprimirImagen = (file, maxDim = 1100, quality = 0.62) => new Promise((resolve) => {
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
        else { width = Math.round(width * maxDim / height); height = maxDim }
      }
      try {
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch { resolve(reader.result) }
    }
    img.onerror = () => resolve(reader.result)
    img.src = reader.result
  }
  reader.onerror = () => resolve(null)
  reader.readAsDataURL(file)
})

// El mismo dataURL, pero tambien como Blob para poder subirlo. Se devuelven los
// dos porque el dataURL se pinta al instante mientras el Blob viaja.
export async function fotoParaSubir(file, maxDim, quality) {
  const dataUrl = await comprimirImagen(file, maxDim, quality)
  if (!dataUrl) return null
  try {
    return { dataUrl, blob: await (await fetch(dataUrl)).blob() }
  } catch {
    // Sin Blob no hay subida, pero con el dataURL la foto igual se guarda.
    return { dataUrl, blob: null }
  }
}
