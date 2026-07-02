const ALLOWED_ORIGINS = [
  'https://taller-multias.vercel.app',
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

const SUPABASE_URL = 'https://hpndvrjjizzkusuuhefb.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbmR2cmpqaXp6a3VzdXVoZWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjkwMzMsImV4cCI6MjA4OTA0NTAzM30.-6Jz1TsDjAladZUOGD-WNMvVbZXd1Z4WBoOF-npew5c'

function getOrigin(reqOrigin = '') {
  if (ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin
  if (reqOrigin.startsWith('http://localhost')) return reqOrigin
  return ALLOWED_ORIGINS[0]
}

// Hash simple para comparar contraseñas (SHA-256)
async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + '_taller_salt_2026')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default async function handler(req, res) {
  const origin = getOrigin(req.headers.origin || '')
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return }

  const { usuario, password } = req.body || {}
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' })
  }

  try {
    const hashedPwd = await hashPassword(password)

    // Buscar usuario en Supabase
    const url = `${SUPABASE_URL}/rest/v1/usuarios?usuario=eq.${encodeURIComponent(usuario)}&activo=eq.true&select=*&limit=1`
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      return res.status(500).json({ error: 'Error consultando usuarios' })
    }

    const usuarios = await response.json()
    if (!usuarios.length) {
      return res.status(401).json({ error: 'Usuario no encontrado' })
    }

    const user = usuarios[0]
    if (user.password_hash !== hashedPwd) {
      return res.status(401).json({ error: 'Contraseña incorrecta' })
    }

    // Login exitoso - devolver datos del usuario sin la contraseña
    const { password_hash, ...userData } = user
    res.status(200).json({
      ok: true,
      user: userData,
    })
  } catch (err) {
    console.error('Auth error:', err)
    res.status(500).json({ error: 'Error interno de autenticacion' })
  }
}

export const config = { runtime: 'nodejs' }
