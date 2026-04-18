// Endpoint para crear usuarios iniciales y generar hashes
// Eliminar o proteger en produccion despues del setup

const SUPABASE_URL = 'https://hpndvrjjizzkusuuhefb.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbmR2cmpqaXp6a3VzdXVoZWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjkwMzMsImV4cCI6MjA4OTA0NTAzM30.-6Jz1TsDjAladZUOGD-WNMvVbZXd1Z4WBoOF-npew5c'

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + '_taller_salt_2026')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return }

  const { action, password, usuario, nombre, rol } = req.body || {}

  // Generar hash
  if (action === 'hash' || (!action && password && !usuario)) {
    if (!password) { return res.status(400).json({ error: 'password requerido' }) }
    const hash = await hashPassword(password)
    return res.status(200).json({ hash })
  }

  // Crear usuario
  if (action === 'create' || (usuario && password)) {
    if (!usuario || !password) {
      return res.status(400).json({ error: 'usuario y password requeridos' })
    }
    const hashedPwd = await hashPassword(password)
    const body = {
      usuario,
      password_hash: hashedPwd,
      nombre: nombre || usuario,
      rol: rol || 'jefe_taller',
      activo: true,
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/usuarios`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Error creando usuario', detail: text })
    }

    try {
      const created = JSON.parse(text)
      return res.status(201).json({ ok: true, user: created })
    } catch {
      return res.status(201).json({ ok: true, raw: text })
    }
  }

  res.status(400).json({ error: 'Accion no reconocida. Usa action: "hash" o "create"' })
}

export const config = { runtime: 'nodejs' }
