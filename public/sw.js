/* Service worker propio — offline SIN riesgo de "version vieja".
 *
 * Estrategia:
 *  - Navegacion / documento (index.html)  -> NetworkFirst: si hay red SIEMPRE
 *    trae lo mas nuevo; la copia en cache solo se usa cuando estas offline.
 *    Por eso NUNCA se queda pegado en una version cacheada teniendo internet.
 *  - Assets con hash (/assets/index-XXXX.js/css) -> CacheFirst: son inmutables
 *    (un build nuevo genera nombres nuevos), asi que cachearlos es seguro y da
 *    carga instantanea + funcionamiento offline.
 *  - /api/* y cualquier otra cosa (Supabase, Cuentti, QR...) -> se dejan pasar
 *    a la red normal, NUNCA se cachean (los datos siempre en vivo).
 *
 * Para forzar una actualizacion del propio SW, sube VERSION: el handler de
 * 'activate' borra toda cache cuya clave no sea la de la version actual, asi
 * que subirla limpia de un golpe cualquier copia envenenada en el navegador
 * de un usuario. v1 -> v2 el 2026-08-21 por eso mismo.
 */
const VERSION = 'v2'
const SHELL = 'mda-shell-' + VERSION
const ASSETS = 'mda-assets-' + VERSION

self.addEventListener('install', () => {
  // El SW nuevo toma control de inmediato (no espera a cerrar pestañas).
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Borra caches de versiones anteriores.
    const keys = await caches.keys()
    await Promise.all(
      keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // no tocar terceros (Cuentti/Supabase/QR)

  // Navegacion -> NetworkFirst (fresco si hay red; cache solo offline)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        if (fresh.ok) {
          const cache = await caches.open(SHELL)
          cache.put('/', fresh.clone()) // guarda el shell para abrir offline
        }
        return fresh
      } catch {
        const cache = await caches.open(SHELL)
        return (await cache.match('/')) || Response.error()
      }
    })())
    return
  }

  // Assets con hash -> CacheFirst (inmutables)
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS)
      const hit = await cache.match(req)
      if (hit) return hit
      // Este try/catch NO es defensivo por gusto. Si fetch() rechaza (un bache de
      // red, el wifi del taller, Safari cortando peticiones en segundo plano),
      // el respondWith se rechaza entero y el import dinamico de la pagina muere
      // con "Importing a module script failed" — que es exactamente el error que
      // se vio en Clientes, Reportes, Usuarios e Inspecciones. Sin esto no hay
      // reintento posible: la pagina queda rota hasta recargar a mano.
      try {
        const fresh = await fetch(req)
        // Solo se cachea el 200. Un 404 (trozo de un build ya borrado) NO entra
        // en cache: si se guardara, el error quedaria congelado para siempre.
        if (fresh.ok) cache.put(req, fresh.clone())
        return fresh
      } catch {
        // Sin red y sin copia: se deja pasar a la red del navegador, que dara su
        // propio error y permite que el boton "Reintentar" de la pagina funcione.
        return fetch(req)
      }
    })())
    return
  }

  // Resto (incluye /api/*): red normal, sin cache.
})
