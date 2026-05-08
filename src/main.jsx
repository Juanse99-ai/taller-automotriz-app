import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
