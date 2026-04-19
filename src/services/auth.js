const SESSION_KEY = 'taller_session'
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 horas

export async function login(usuario, password) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error de autenticacion')
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
  admin: ['dashboard', 'recepcion', 'trabajos', 'mecanicos', 'cotizaciones', 'inventario', 'liquidacion', 'reportes', 'cuentti'],
  jefe_taller: ['dashboard', 'recepcion', 'trabajos', 'mecanicos', 'cotizaciones', 'inventario'],
}

export function getSeccionesPermitidas(rol) {
  return PERMISOS[rol] || PERMISOS.jefe_taller
}
