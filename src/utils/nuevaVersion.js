// Avisar de que hay una version nueva ANTES de que algo se rompa.
//
// Por que hace falta: utils/recargaVersion es una red de seguridad, pero
// REACTIVA — solo salta cuando una parte que se descarga aparte ya fallo (una
// seccion que no abre, un PDF que no sale). Si en toda la jornada nadie toca
// esas dos cosas, la pestaña sigue con la version vieja sin enterarse, y el
// arreglo que se publico esa mañana no le llega a quien lo necesitaba.
//
// NUNCA recarga sola, y esto no es un detalle: aqui se dejan cotizaciones de
// once lineas a medio escribir, y no hay autoguardado. Perder eso es peor que
// trabajar una hora con la version anterior. Se avisa; el momento lo elige
// quien esta usando la app.

const CADA_MS = 5 * 60 * 1000

// El index.html referencia su propio paquete con la version en el nombre
// (/assets/index-CWgxZg7g.js). Es lo unico que cambia seguro en cada
// publicacion, y el fichero pesa 1,8 kB.
function versionDeEstaPestana() {
  const s = document.querySelector('script[type="module"][src*="/assets/index-"]')
  return s ? s.getAttribute('src') : null
}

async function versionPublicada() {
  try {
    // no-cache revalida siempre contra el servidor, pero deja que conteste 304
    // sin cuerpo cuando no ha cambiado nada: preguntar sale casi gratis.
    const r = await fetch('/', { cache: 'no-cache' })
    if (!r.ok) return null
    const m = (await r.text()).match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
    return m ? m[0] : null
  } catch {
    // Sin red no se afirma nada. Que no haya respuesta no significa que haya
    // version nueva; de eso ya avisa el otro cartel.
    return null
  }
}

export function vigilarVersion(alHaberNueva) {
  const mia = versionDeEstaPestana()
  // En desarrollo el script es /src/main.jsx, sin version en el nombre: no hay
  // nada que vigilar.
  if (!mia) return () => {}

  let parado = false
  const mirar = async () => {
    if (parado || document.hidden) return   // pestaña de fondo: no se consulta
    const suya = await versionPublicada()
    if (suya && suya !== mia) {
      parado = true                          // se avisa UNA vez, no se insiste
      alHaberNueva()
    }
  }
  const id = setInterval(mirar, CADA_MS)
  window.addEventListener('focus', mirar)
  return () => {
    parado = true
    clearInterval(id)
    window.removeEventListener('focus', mirar)
  }
}
