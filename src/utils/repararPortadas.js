import { fetchTrabajosConPortadas, cambiarPortadaEvidencia, subirFotoEvidencia } from '../services/supabase'
import { portadaDeUrl } from './video'
import { esVideoEvid } from './evidencias'

// Arregla las portadas de video que quedaron NEGRAS.
//
// Hasta el 15 sep 2026, posterDeVideo guardaba desde Safari una portada negra
// (JPEG de 4,6 kB): pintaba el cuadro antes de que Safari lo tuviera listo.
// Quedaron 12, en OT-0233 y OT-0239, y con ellas las fichas de esos videos se
// ven negras en la OT y en el portal. El dueño pidio sacarles portadas nuevas
// de los mismos videos.
//
// Corre en la app de la oficina, en segundo plano, porque subir al bucket pide
// una sesion. Es seguro repetirlo:
// - Solo toca una portada que DE VERDAD es negra: se mira el color, no el peso.
// - Cambia esa portada y nada mas, sobre la OT recien leida (cambiarPortadaEvidencia).
// - El archivo negro no se borra: si una pestaña vieja vuelve a guardar la
//   portada negra, la ficha se ve negra otra vez, pero no queda un enlace roto.
//
// En cada aparato corre hasta que no quede nada por arreglar, con un tope de
// intentos: un navegador que no decodifica un video (HEVC en Chrome) no debe
// bajarse pedazos de video en cada arranque para siempre.

const LLAVE = 'mda_portadas_negras_v1'
const MAX_INTENTOS = 3
const UMBRAL_NEGRO = 16

function leerEstado() {
  try { return JSON.parse(localStorage.getItem(LLAVE) || '{}') || {} } catch { return {} }
}
function guardarEstado(estado) {
  try { localStorage.setItem(LLAVE, JSON.stringify(estado)) } catch { /* sin localStorage: se reintenta otro dia */ }
}

// true si la imagen es negra entera, false si no, null si no se pudo mirar.
function esPortadaNegra(url) {
  return new Promise((resolve) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 16
        const ctx = c.getContext('2d')
        ctx.drawImage(im, 0, 0, 16, 16)
        const d = ctx.getImageData(0, 0, 16, 16).data
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > UMBRAL_NEGRO || d[i + 1] > UMBRAL_NEGRO || d[i + 2] > UMBRAL_NEGRO) return resolve(false)
        }
        resolve(true)
      } catch { resolve(null) }
    }
    im.onerror = () => resolve(null)
    im.src = url
  })
}

const parsear = (v) => {
  if (Array.isArray(v)) return v
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

// Devuelve { reparadas, pendientes } o null si en este aparato ya no toca.
export async function repararPortadasNegras() {
  const estado = leerEstado()
  if (estado.hecho || (estado.intentos || 0) >= MAX_INTENTOS) return null
  guardarEstado({ ...estado, intentos: (estado.intentos || 0) + 1 })

  let reparadas = 0
  let pendientes = 0
  for (const fila of await fetchTrabajosConPortadas()) {
    for (const e of parsear(fila.evidencias)) {
      if (!esVideoEvid(e) || !e?.id || !e.poster || !e.url) continue
      const negra = await esPortadaNegra(e.poster)
      if (negra === false) continue
      if (negra === null) { pendientes++; continue }
      const jpeg = await portadaDeUrl(e.url)
      if (!jpeg) { pendientes++; continue }
      const { url } = await subirFotoEvidencia(jpeg, fila.ot_codigo || fila.id)
      if (await cambiarPortadaEvidencia(fila.id, e.id, e.poster, url)) reparadas++
      else pendientes++
    }
  }
  if (pendientes === 0) guardarEstado({ ...leerEstado(), hecho: new Date().toISOString(), reparadas })
  return { reparadas, pendientes }
}
