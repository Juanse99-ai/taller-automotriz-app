// Endpoint temporal para generar hashes de contraseña
// Usar una vez para crear usuarios en Supabase, luego eliminar

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + '_taller_salt_2026')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return }
  const { password } = req.body || {}
  if (!password) { res.status(400).json({ error: 'password requerido' }); return }
  const hash = await hashPassword(password)
  res.status(200).json({ hash })
}

export const config = { runtime: 'nodejs' }
