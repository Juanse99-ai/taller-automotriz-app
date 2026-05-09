// Endpoint de gestion de usuarios: hash | create | list | update | delete
// Requiere proteccion adicional en produccion (ver TODO al final)

const SUPABASE_URL = 'https://hpndvrjjizzkusuuhefb.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbmR2cmpqaXp6a3VzdXVoZWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjkwMzMsImV4cCI6MjA4OTA0NTAzM30.-6Jz1TsDjAladZUOGD-WNMvVbZXd1Z4WBoOF-npew5c'

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + '_taller_salt_2026')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default async function handler(req, res) {
  // GET → listar usuarios (sin password_hash)
  if (req.method === 'GET') {
    const url = `${SUPABASE_URL}/rest/v1/usuarios?select=id,usuario,nombre,rol,activo,created_at&order=usuario.asc`
    const r = await fetch(url, { headers: SB_HEADERS })
    if (!r.ok) {
      const t = await r.text()
      return res.status(r.status).json({ error: 'Error consultando usuarios', detail: t })
    }
    const data = await r.json()
    return res.status(200).json({ ok: true, usuarios: data })
  }

  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Metodo no soportado' })
  }

  const { action, password, usuario, nombre, rol, activo, id } = req.body || {}

  // Generar hash (utilidad)
  if (action === 'hash') {
    if (!password) return res.status(400).json({ error: 'password requerido' })
    const hash = await hashPassword(password)
    return res.status(200).json({ hash })
  }

  // Listar (alternativa via POST por si GET no funciona en algun proxy)
  if (action === 'list') {
    const url = `${SUPABASE_URL}/rest/v1/usuarios?select=id,usuario,nombre,rol,activo,created_at&order=usuario.asc`
    const r = await fetch(url, { headers: SB_HEADERS })
    if (!r.ok) {
      const t = await r.text()
      return res.status(r.status).json({ error: 'Error consultando usuarios', detail: t })
    }
    const data = await r.json()
    return res.status(200).json({ ok: true, usuarios: data })
  }

  // Crear usuario
  if (action === 'create' || (usuario && password && !id)) {
    if (!usuario || !password) {
      return res.status(400).json({ error: 'usuario y password requeridos' })
    }
    const hashedPwd = await hashPassword(password)
    const body = {
      usuario: usuario.trim(),
      password_hash: hashedPwd,
      nombre: (nombre || usuario).trim(),
      rol: rol || 'jefe_taller',
      activo: activo !== false,
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/usuarios`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify(body),
    })
    const text = await r.text()
    if (!r.ok) {
      return res.status(r.status).json({ error: 'Error creando usuario', detail: text })
    }
    try {
      const created = JSON.parse(text)
      return res.status(201).json({ ok: true, user: Array.isArray(created) ? created[0] : created })
    } catch {
      return res.status(201).json({ ok: true, raw: text })
    }
  }

  // Actualizar usuario por id (cambiar password / nombre / rol / activo)
  if (action === 'update' && id) {
    const updates = {}
    if (nombre !== undefined) updates.nombre = nombre
    if (rol !== undefined) updates.rol = rol
    if (activo !== undefined) updates.activo = activo
    if (password) updates.password_hash = await hashPassword(password)
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Sin campos para actualizar' })
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: SB_HEADERS,
      body: JSON.stringify(updates),
    })
    const text = await r.text()
    if (!r.ok) return res.status(r.status).json({ error: 'Error actualizando', detail: text })
    try {
      const upd = JSON.parse(text)
      return res.status(200).json({ ok: true, user: Array.isArray(upd) ? upd[0] : upd })
    } catch {
      return res.status(200).json({ ok: true, raw: text })
    }
  }

  // Eliminar usuario por id (soft = solo marcar inactivo si no se especifica hard)
  if (action === 'delete' && id) {
    const hard = req.body?.hard === true
    if (hard) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: SB_HEADERS,
      })
      if (!r.ok) {
        const t = await r.text()
        return res.status(r.status).json({ error: 'Error eliminando', detail: t })
      }
      return res.status(200).json({ ok: true, deleted: true })
    }
    // Soft delete: marca como inactivo
    const r = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: SB_HEADERS,
      body: JSON.stringify({ activo: false }),
    })
    const text = await r.text()
    if (!r.ok) return res.status(r.status).json({ error: 'Error desactivando', detail: text })
    return res.status(200).json({ ok: true, deactivated: true })
  }

  res.status(400).json({ error: 'Accion no reconocida. Usa action: hash | list | create | update | delete' })
}

// TODO en produccion: anteponer un middleware que valide que el caller es admin
// (ej. token de sesion en header). Hoy cualquiera con la URL puede gestionar.
export const config = { runtime: 'nodejs' }
