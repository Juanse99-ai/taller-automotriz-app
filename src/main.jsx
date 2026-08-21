import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// IBM Plex, auto-hospedada. Antes la app tomaba la fuente del sistema, asi que
// se veia distinta en el Mac (SF Pro), en el PC de recepcion (Segoe UI) y en el
// celular del mecanico (Roboto). Solo los cuatro pesos que el CSS pide: 400,
// 500, 600 y 700. Los nueve font-weight:800 sueltos caen al 700, que es el tope
// de Plex, sin negrita sintetica.
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
// Solo el subconjunto latin: cubre acentos, ñ, ¿ y ¡. Importar la entrada
// completa arrastraba cirilico, griego y vietnamita al deploy (470 KB que el
// navegador nunca baja, pero que igual viajan a Vercel).
// Plex Mono es la que por fin alinea las columnas de plata y separa el codigo
// de producto y la placa del texto corrido. Su cero va sin raya.
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-700.css'
import './index.css'
import App from './App.jsx'
import { precargarLogo } from './utils/pdfTheme'

// Forzar favicon — elimina TODOS los viejos e inyecta .ico con cache-bust
;(() => {
  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => el.remove())
  const ico = document.createElement('link')
  ico.rel = 'icon'
  ico.type = 'image/x-icon'
  ico.href = '/favicon.ico?' + Date.now()
  document.head.appendChild(ico)
  const png = document.createElement('link')
  png.rel = 'icon'
  png.type = 'image/png'
  png.sizes = '64x64'
  png.href = '/logo.png?' + Date.now()
  document.head.appendChild(png)
})()

// PWA: registra el service worker en produccion. Da funcionamiento offline
// (app shell) sin arriesgar "version vieja": la navegacion es NetworkFirst.
// updateViaCache:'none' hace que el navegador revalide sw.js en cada carga,
// asi un SW nuevo se adopta de inmediato (con skipWaiting + clients.claim).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {})
  })
}

// Deja el logo de los PDF en memoria antes de que nadie pida uno. Sin esto,
// generar un PDF esperaba la red DESPUES del clic y Safari cancelaba la
// descarga en silencio. Ver el comentario largo en utils/pdfTheme.js.
precargarLogo()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
