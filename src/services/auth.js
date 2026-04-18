const SESSION_KEY = 'taller_session'

export async function login(usuario, password) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error de autenticacion')
  localStorage.setItem(SESSION_KEY, JSON.stringify(data.user))
  return data.user
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
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
