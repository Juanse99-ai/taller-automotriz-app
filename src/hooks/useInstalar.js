import { useEffect, useState } from 'react'

// La app ya se puede instalar en el celular (hay manifest, iconos y service
// worker desde hace meses), pero nada en pantalla lo decia, asi que nadie lo
// hacia: el equipo la abre por el navegador cada dia.
//
// Devuelve:
//   puede      hay algo que ofrecer (Chrome/Android con el aviso listo, o iOS)
//   comoIOS    en iOS no existe beforeinstallprompt: hay que explicar el gesto
//   instalar() lanza el dialogo nativo (solo cuando comoIOS es false)
export function useInstalar() {
  const [evento, setEvento] = useState(null)
  const [instalada, setInstalada] = useState(() => yaInstalada())

  useEffect(() => {
    const alPoder = (e) => {
      // Sin esto Chrome pinta su propia barrita, que en una app de trabajo
      // aparece encima del contenido en el peor momento.
      e.preventDefault()
      setEvento(e)
    }
    const alInstalar = () => { setEvento(null); setInstalada(true) }
    window.addEventListener('beforeinstallprompt', alPoder)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  const comoIOS = esIOS() && !instalada && !evento

  return {
    puede: !instalada && (!!evento || comoIOS),
    comoIOS,
    instalar: async () => {
      if (!evento) return false
      evento.prompt()
      const { outcome } = await evento.userChoice
      setEvento(null)                       // el aviso solo sirve una vez
      return outcome === 'accepted'
    },
  }
}

function yaInstalada() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
  } catch { return false }
}

function esIOS() {
  try {
    const ua = navigator.userAgent || ''
    // iPadOS 13+ se presenta como Mac: se distingue porque acepta toques.
    const iPadNuevo = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
    return (/iPhone|iPad|iPod/.test(ua) || iPadNuevo) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  } catch { return false }
}
