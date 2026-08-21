import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // El alias @ lo exige shadcn en todos sus imports. Se declara tambien en
  // jsconfig.json porque el CLI de shadcn lee de ahi, no de vite.config.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    // Marca de versión visible en la app: hash del commit en Vercel (o 'dev' en local).
    // Sirve para saber de un vistazo si estás en la última versión o en una cacheada.
    __BUILD_ID__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)),
  },
  server: {
    port: 3000,
    proxy: {
      // Cuentti va al deploy de Vercel, NO directo a app.cuenti.com: el token de
      // empresa vive como variable de entorno en la funcion serverless, no en el
      // cliente. Yendo directo, en local toda pantalla que dependa de Cuentti
      // (Inventario, Cobros, lineas de una OT) responde vacia o 401 — y eso se
      // confunde con un fallo del rediseño cuando es solo el proxy.
      '/api/cuentti': { target: 'https://taller-automotriz-app.vercel.app', changeOrigin: true, secure: true },
      // Estas son funciones serverless de Vercel que NO corren bajo Vite dev.
      // En local las mandamos al deploy de Vercel para que login y datos funcionen.
      '/api/auth': { target: 'https://taller-automotriz-app.vercel.app', changeOrigin: true, secure: true },
      '/api/supabase': { target: 'https://taller-automotriz-app.vercel.app', changeOrigin: true, secure: true },
    },
  },
})
