import bcrypt from 'bcryptjs'
import { firmarSesion, verificarSesion } from './_lib/sesion.js'

// ── Freno a la prueba de contraseñas ───────────────────────────────────────
// Sin esto, /api/auth acepta intentos ilimitados: con bcrypt cada uno cuesta
// ~100ms, pero nadie tiene prisa y dos de los tres usuarios todavia arrastran
// hash SHA-256 sin sal.
//
// HONESTO SOBRE SU ALCANCE: esto vive en la memoria de la instancia serverless.
// Vercel reutiliza instancias, asi que frena un ataque sostenido desde el mismo
// sitio, pero alguien que reparta los intentos entre instancias lo diluye. Es un
// freno real, no una puerta blindada; la puerta blindada es cambiar las dos
// contraseñas viejas.
const INTENTOS_MAX = 8
const BLOQUEO_MS = 10 * 60 * 1000
const VENTANA_MS = 15 * 60 * 1000
const intentos = new Map() // clave -> { fallos, primero, hasta }

function limpiarViejos(ahora) {
  for (const [k, v] of intentos) {
    if (ahora > (v.hasta || 0) && ahora - v.primero > VENTANA_MS) intentos.delete(k)
  }
}

function bloqueado(clave, ahora) {
  const v = intentos.get(clave)
  return v && v.hasta && ahora < v.hasta ? Math.ceil((v.hasta - ahora) / 60000) : 0
}

function registrarFallo(clave, ahora) {
  const v = intentos.get(clave) || { fallos: 0, primero: ahora, hasta: 0 }
  if (ahora - v.primero > VENTANA_MS) { v.fallos = 0; v.primero = ahora }
  v.fallos += 1
  if (v.fallos >= INTENTOS_MAX) { v.hasta = ahora + BLOQUEO_MS; v.fallos = 0; v.primero = ahora }
  intentos.set(clave, v)
}

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

// Hash LEGACY (SHA-256 + sal global): débil y sin sal por-usuario. Solo se usa
// para verificar los hashes viejos y MIGRARLOS a bcrypt en el primer login.
async function hashLegacy(password) {
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
  // GET = comprobacion de salud. Responde si el servidor PUEDE firmar y volver a
  // verificar una sesion. No devuelve el secreto ni ningun token utilizable: solo
  // un si o un no. Existe porque si el secreto faltara, el login daria 500 y no
  // entraria nadie al taller; esto permite verlo antes de desplegar, sin tener
  // que escribir la contrasena de nadie.
  if (req.method === 'GET') {
    let firma = false
    try {
      const t = firmarSesion({ usuario: '_salud', rol: '_salud' })
      firma = !!verificarSesion(t) && !verificarSesion(t.split('.')[0] + '.roto')
    } catch { firma = false }
    res.status(firma ? 200 : 503).json({ ok: firma, sesiones: firma ? 'operativas' : 'sin secreto configurado' })
    return
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return }

  const { usuario, password } = req.body || {}

  // Dos claves: por usuario (protege la cuenta) y por origen (frena el barrido).
  const ahora = Date.now()
  limpiarViejos(ahora)
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sin-ip'
  const claves = [`u:${String(usuario || '').toLowerCase()}`, `ip:${ip}`]
  const espera = Math.max(...claves.map(c => bloqueado(c, ahora)))
  if (espera > 0) {
    return res.status(429).json({ error: `Demasiados intentos. Espera ${espera} minuto${espera === 1 ? '' : 's'} e intenta de nuevo.` })
  }
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' })
  }

  try {
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
      claves.forEach(c => registrarFallo(c, ahora))
      return res.status(401).json({ error: 'Usuario no encontrado' })
    }

    const user = usuarios[0]
    const stored = String(user.password_hash || '')
    // Verificar: bcrypt (nuevo, empieza por $2) o SHA-256 legacy (hex de 64).
    let ok = false
    let migrar = false
    if (stored.startsWith('$2')) {
      ok = await bcrypt.compare(password, stored)
    } else {
      ok = (stored.length > 0 && stored === (await hashLegacy(password)))
      migrar = ok // login legacy correcto → re-hashear a bcrypt (migración perezosa)
    }
    if (!ok) {
      claves.forEach(c => registrarFallo(c, ahora))
      return res.status(401).json({ error: 'Contraseña incorrecta' })
    }

    // Migración perezosa: al validar con el hash viejo, guardar uno bcrypt. Si
    // falla, NO bloquear el login (se reintenta en el próximo).
    if (migrar) {
      try {
        const nuevoHash = await bcrypt.hash(password, 10)
        await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ password_hash: nuevoHash }),
        })
      } catch (e) { console.warn('[auth] no se pudo migrar el hash a bcrypt:', e?.message || e) }
    }

    // Login exitoso - devolver datos del usuario sin la contraseña
    // Acerto: se borra el contador para que no arrastre fallos de antes.
    claves.forEach(c => intentos.delete(c))
    const { password_hash, ...userData } = user
    // El token es lo que /api/supabase pide para dejar entrar. Antes no habia
    // ninguno: el proxy miraba QUE tabla pedias pero nunca QUIEN eras.
    res.status(200).json({
      ok: true,
      user: userData,
      token: firmarSesion(userData),
    })
  } catch (err) {
    console.error('Auth error:', err)
    res.status(500).json({ error: 'Error interno de autenticacion' })
  }
}

export const config = { runtime: 'nodejs' }
