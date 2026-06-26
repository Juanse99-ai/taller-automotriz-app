import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Cuentti va directo a su servidor (con rewrite del ?path=)
      '/api/cuentti': {
        target: 'https://app.cuenti.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          return url.searchParams.get('path') || path
        },
      },
      // Estas son funciones serverless de Vercel que NO corren bajo Vite dev.
      // En local las mandamos al deploy de Vercel para que login y datos funcionen.
      '/api/auth': { target: 'https://taller-automotriz-app.vercel.app', changeOrigin: true, secure: true },
      '/api/supabase': { target: 'https://taller-automotriz-app.vercel.app', changeOrigin: true, secure: true },
    },
  },
})
