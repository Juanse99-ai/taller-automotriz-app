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
// shadcn va ANTES de index.css a proposito: asi, cuando una utilidad de
// Tailwind y una regla de la app tocan lo mismo con la misma
// especificidad, gana la de la app.
import './shadcn.css'
import './index.css'
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

// El Portal del Cliente es una pagina PUBLICA y aparte, y se decide aqui, antes
// de tocar App. Antes la decision vivia DENTRO de App, con un return temprano, y
// eso costaba dos cosas.
//
// Una visible: el cliente que abria el portal desde el celular descargaba el
// armazon entero de la app (hooks, sidebar, Cuentti, liquidacion) para ver tres
// filas de su historial. Medido en produccion: 1.078 kB.
//
// Otra escondida: los hooks de App quedaban detras de ese return condicional,
// que es exactamente lo que React prohibe. Hoy no revienta porque la ruta no
// cambia sin recargar, pero eran 23 de los 83 errores del lint y el dia que
// alguien meta navegacion sin recarga, la app cae con "Rendered fewer hooks
// than expected".
const esPortal = window.location.pathname === '/portal' || window.location.hash === '#portal'

const raiz = createRoot(document.getElementById('root'))
const pintar = (Comp) => raiz.render(<StrictMode><Comp /></StrictMode>)

// El `return` entre las dos ramas NO es un adorno. Con un if/else simetrico el
// minificador funde las dos llamadas en una sola con un ternario dentro, y Vite
// acaba precargando la UNION de las dependencias de ambas: el portal se bajaba
// App.js y su chunk compartido sin usarlos nunca. Comprobado midiendo la red.
function arrancar() {
  if (esPortal) {
    import('./pages/PortalCliente.jsx').then(m => pintar(m.default))
    return
  }
  import('./App.jsx').then(m => pintar(m.default))
}
arrancar()
