// Una evidencia es video si LO DICE. Antes esto era "tiene url y no tiene
// dataUrl", que valia mientras las fotos fueran siempre base64. Ahora las fotos
// tambien se suben a Storage y cumplen esa condicion al pie de la letra: con la
// regla vieja, toda foto subida se pintaria como un <video> vacio.
export const esVideoEvid = (f) => {
  if (f?.tipo) return f.tipo === 'video'
  // Evidencias antiguas que no traen `tipo`: se mira la extension del archivo.
  return /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i.test(f?.url || '')
}

// dataUrl es la foto incrustada en la fila (las viejas); url es la que ya vive
// en Storage.
export const srcFotoEvid = (f) => f?.dataUrl || f?.url || ''
