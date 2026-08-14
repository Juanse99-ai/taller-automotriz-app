import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
