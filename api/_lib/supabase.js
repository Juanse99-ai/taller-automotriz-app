// Un solo sitio para hablar con Supabase del taller.
//
// Por que existe: la clave estaba escrita a mano en CINCO ficheros de api/, y el
// repositorio es publico. Con RLS apagado eso equivale a leer y escribir toda la
// base desde cualquier parte del mundo.
//
// POR QUE VERIFICA EL PROYECTO: esta cuenta de Vercel tiene variables de OTRA
// app (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY...) que
// apuntan al proyecto lsobszypdaiiznwxvfyo, no al del taller. Usarlas a ciegas
// tumbo el portal con 503 primero y 401 despues. Comprobado. Asi que aqui no se
// coge una clave por como se llama la variable: se coge si el propio JWT dice
// que es de ESTE proyecto.

const REF_TALLER = 'hpndvrjjizzkusuuhefb'
const ANON_INCRUSTADA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbmR2cmpqaXp6a3VzdXVoZWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjkwMzMsImV4cCI6MjA4OTA0NTAzM30.-6Jz1TsDjAladZUOGD-WNMvVbZXd1Z4WBoOF-npew5c'

// La URL va FIJA. La variable SUPABASE_URL apunta a otro proyecto y da
// "fetch failed" — ya estaba avisado en un comentario de api/cuentti.js.
export const SUPABASE_URL = `https://${REF_TALLER}.supabase.co`

function refDelJwt(k) {
  try {
    const c = String(k).split('.')[1]
    if (!c) return null
    return JSON.parse(Buffer.from(c, 'base64').toString('utf8')).ref || null
  } catch { return null }
}

function elegirClave() {
  // 1) Variable propia del taller: intencion explicita, se usa sin preguntar.
  //    Es la que hay que crear para poder encender RLS.
  const propia = process.env.TALLER_SUPABASE_SERVICE_KEY
  if (propia) return { clave: propia, origen: 'TALLER_SUPABASE_SERVICE_KEY' }
  // 2) Variables compartidas: SOLO si el JWT dice que son de este proyecto.
  for (const nombre of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_KEY']) {
    const v = process.env[nombre]
    if (v && refDelJwt(v) === REF_TALLER) return { clave: v, origen: nombre }
  }
  // 3) Respaldo: la clave que la app viene usando desde siempre. Funciona, pero
  //    es anon y es publica, asi que con RLS encendido dejaria de servir.
  return { clave: ANON_INCRUSTADA, origen: 'incrustada-en-el-codigo' }
}

const elegida = elegirClave()
export const SUPABASE_KEY = elegida.clave
export const SUPABASE_HEAD = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
}

// Rol y origen SIN devolver la clave: el rol y el nombre de la variable no son
// secretos. Sirve para comprobar, antes de encender RLS, que el servidor va con
// una clave de servicio. Si dijera "anon", encender RLS deja al taller parado.
export function rolDeLaClave() {
  try {
    const c = SUPABASE_KEY.split('.')[1]
    if (!c) return 'formato-nuevo'
    return JSON.parse(Buffer.from(c, 'base64').toString('utf8')).role || 'sin-rol'
  } catch { return 'ilegible' }
}
export function origenDeLaClave() { return elegida.origen }
export function proyectoDeLaClave() { return refDelJwt(SUPABASE_KEY) || 'desconocido' }
