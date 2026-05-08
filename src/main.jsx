import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Forzar favicon desde logo.png (evitar cache del viejo)
;(() => {
  const old = document.querySelector('link[rel="icon"]')
  if (old) old.remove()
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/png'
  link.href = '/logo.png?' + Date.now()
  document.head.appendChild(link)
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
