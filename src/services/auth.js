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
  const session = { ...data.user, _loginAt: Date.now() }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
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
