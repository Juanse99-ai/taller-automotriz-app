import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Marca de versión visible en la app: hash del commit en Vercel (o 'dev' en local).
    // Sirve para saber de un vistazo si estás en la última versión o en una cacheada.
    __BUILD_ID__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)),
  },
  server: {
    port: 3000,
    proxy: {
      // Cuentti va al deploy de Vercel, NO directo a app.cuenti.com.
      // El token de Cuentti lo pone la funcion serverless api/cuentti.js desde
      // process.env.CUENTTI_TOKEN; nunca esta en el navegador. Apuntando directo
      // al servidor de Cuentti las peticiones salian SIN token y este respondia
      // 200 con {"type":0,"message":"Invalid Token3"} — es decir, Repuestos
      // nunca pudo funcionar en desarrollo local, y el fallo parecia de la API.
      // Mismo tratamiento que /api/supabase y /api/auth aqui debajo.
      '/api/cuentti': { target: 'https://taller-automotriz-app.vercel.app', changeOrigin: true, secure: true },
      // Estas son funciones serverless de Vercel que NO corren bajo Vite dev.
      // En local las mandamos al deploy de Vercel para que login y datos funcionen.
      '/api/auth': { target: 'https://taller-automotriz-app.vercel.app', changeOrigin: true, secure: true },
      '/api/supabase': { target: 'https://taller-automotriz-app.vercel.app', changeOrigin: true, secure: true },
    },
  },
})
