// Sesion firmada para la API del taller.
//
// Por que existe: /api/supabase comprobaba QUE tabla pedias, pero nunca QUIEN
// eras. El CORS no cuenta: solo frena navegadores, no un curl. Cualquiera con
// la URL se bajaba los 852 clientes con cedula y telefono.
//
// No se usa una libreria de JWT a proposito: esto es un HMAC de dos campos y
// meter una dependencia en una funcion serverless por eso no sale a cuenta.

import crypto from 'crypto'

const HORAS = 24
const VIDA_MS = HORAS * 60 * 60 * 1000

// SESSION_SECRET si esta puesto; si no, se DERIVA de la clave de Supabase. La
// derivada nunca sale del servidor y evita que esto quede bloqueado esperando a
// que alguien cree la variable. Poner SESSION_SECRET de verdad es mejor: asi
// rotar la clave de Supabase no invalida todas las sesiones abiertas.
function secreto() {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 16) return s
  // Respaldo: derivar de la clave de Supabase, que si es un secreto de verdad.
  const k = process.env.SUPABASE_KEY
  if (k && k.length >= 16) {
    return crypto.createHash('sha256').update('sesion-taller|' + k).digest('hex')
  }
  // Sin ninguno de los dos NO se inventa un secreto: derivar de una constante
  // daria una firma que cualquiera puede reproducir con el codigo del repo, y
  // entonces el token deja de probar nada. Mejor que no entre nadie a que entre
  // cualquiera.
  return null
}

export function firmarSesion(user) {
  const sec = secreto()
  if (!sec) throw new Error('SESSION_SECRET no configurado en el servidor')
  const cuerpo = Buffer.from(JSON.stringify({
    u: user?.usuario || '', r: user?.rol || '', exp: Date.now() + VIDA_MS,
  })).toString('base64url')
  const firma = crypto.createHmac('sha256', sec).update(cuerpo).digest('base64url')
  return `${cuerpo}.${firma}`
}

// Devuelve los datos de la sesion, o null si el token falta, esta manipulado o
// caduco. Nunca lanza: un token basura es un 401, no un 500.
export function verificarSesion(token) {
  if (!token || typeof token !== 'string') return null
  const p = token.split('.')
  if (p.length !== 2 || !p[0] || !p[1]) return null
  const sec = secreto()
  if (!sec) return null
  try {
    const esperada = crypto.createHmac('sha256', sec).update(p[0]).digest('base64url')
    const a = Buffer.from(p[1]), b = Buffer.from(esperada)
    // Comparacion en tiempo constante: comparar con === filtra la firma byte a
    // byte a quien mida los tiempos de respuesta.
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const d = JSON.parse(Buffer.from(p[0], 'base64url').toString('utf8'))
    if (!d?.exp || Date.now() > d.exp) return null
    return d
  } catch { return null }
}

// El token viaja en su propia cabecera, no en Authorization: esa la usa el
// proxy para hablar con Supabase y mezclarlas se presta a confusion.
export function sesionDeLaPeticion(req) {
  return verificarSesion(req.headers?.['x-sesion'] || '')
}
