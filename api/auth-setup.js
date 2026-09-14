// Endpoint de gestion de usuarios: hash | create | list | update | delete
// Solo el administrador, con su sesion (X-Sesion).

import bcrypt from 'bcryptjs'

import { SUPABASE_URL, SUPABASE_KEY } from './_lib/supabase.js'
import { sesionDeLaPeticion } from './_lib/sesion.js'
import { ROLES_VALIDOS } from './_lib/mecanico.js'

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

// Ahora bcrypt (sal por-usuario + KDF lento). Los hashes viejos SHA-256 siguen
// funcionando en el login y se migran solos al primer acceso (ver api/auth.js).
async function hashPassword(password) {
  return bcrypt.hash(String(password), 10)
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Crear, borrar y cambiar claves o roles es cosa del administrador. Hasta el
  // 14/09/2026 no se pedia nada: cualquiera con la direccion (y el repo es
  // publico) podia listar los usuarios, crearse un admin o cambiarle la clave
  // al dueño. Comprobado ese dia con un GET sin sesion que devolvia la lista.
  const ses = sesionDeLaPeticion(req)
  if (!ses) return res.status(401).json({ error: 'Sesion requerida' })
  if (ses.r !== 'admin') return res.status(403).json({ error: 'Solo el administrador gestiona usuarios' })

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

  // Un rol desconocido no se guarda: la app le daria acceso por defecto.
  if (rol !== undefined && !ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: `Rol no válido. Usa: ${ROLES_VALIDOS.join(', ')}` })
  }

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

export const config = { runtime: 'nodejs' }
