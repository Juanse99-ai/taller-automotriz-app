import { lsPurgarCache } from './storage'

const SESSION_KEY = 'taller_session'
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 horas

export async function login(usuario, password) {
  let res
  try {
    res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password }),
    })
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.')
  }
  // Leer como texto y parsear con cuidado: durante un re-deploy la función puede
  // responder vacío y res.json() lanzaría "Unexpected end of JSON input".
  const raw = await res.text().catch(() => '')
  let data = null
  if (raw) { try { data = JSON.parse(raw) } catch { data = null } }
  if (!res.ok) throw new Error((data && data.error) || 'El servidor no respondió bien. Intenta de nuevo en unos segundos.')
  if (!data || !data.user) throw new Error('El servidor no respondió. Intenta de nuevo en unos segundos.')
  const session = { ...data.user, _loginAt: Date.now(), _token: data.token || '' }
  // El navegador se llena (el caché de trabajos con fotos pasa de los ~5 MB que
  // da Safari) y este setItem reventaba: el login se completaba en el servidor
  // pero moría al guardar la sesión, y salía "The quota has been exceeded" —
  // nadie podía entrar. El caché es descartable: se libera y se reintenta.
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    const kb = lsPurgarCache()
    console.warn(`localStorage lleno: se liberaron ${kb} KB de caché para poder entrar`)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      // Ni así cabe (modo privado, o el sitio sin permiso de almacenamiento).
      // Se entra igual: la sesión vive en memoria hasta cerrar la pestaña.
      console.warn('No se pudo guardar la sesión; durará solo esta pestaña.')
    }
  }
  return session
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (session._loginAt && (Date.now() - session._loginAt) > SESSION_EXPIRY_MS) {
      logout()
      return null
    }
    // Sesion de antes de que existieran los tokens. Sin token la API responde
    // 401 a todo, asi que es mejor mandar a la pantalla de entrada que dejar la
    // app abierta y rota. Pasa UNA vez, al desplegar este cambio.
    if (!session._token) {
      logout()
      return null
    }
    return session
  } catch {
    return null
  }
}

// Roles y permisos
const PERMISOS = {
  admin: ['dashboard', 'recepcion', 'trabajos', 'mecanicos', 'cotizaciones', 'inspecciones', 'inventario', 'clientes', 'vehiculos', 'crm', 'liquidacion', 'reportes', 'cuentti', 'usuarios'],
  jefe_taller: ['dashboard', 'recepcion', 'trabajos', 'mecanicos', 'cotizaciones', 'inspecciones', 'inventario', 'clientes', 'vehiculos', 'crm'],
}

export function getSeccionesPermitidas(rol) {
  return PERMISOS[rol] || PERMISOS.jefe_taller
}

// El token que /api/supabase exige. Se lee de la sesion en cada llamada y no se
// cachea: al cerrar sesion tiene que dejar de servir de inmediato.
export function getToken() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')._token || '' }
  catch { return '' }
}
