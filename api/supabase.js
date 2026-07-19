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

// ---- Portal: meta OpenGraph personalizados por cliente ----
// Vive AQUÍ (no en su propio api/portal.js) porque el plan Hobby de Vercel
// permite máximo 12 Serverless Functions por deployment y ya estamos en el
// límite; un archivo nuevo en /api las volvería 13 y el deploy falla.
// Se activa con /api/supabase?portal=1&c=<cedula> (rewrite desde /portal).
const escHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
// Capitaliza el nombre. Siglas jurídicas (S.A.S., LTDA…) en mayúscula; el resto
// con inicial mayúscula (respeta ñ/tildes: no se usa \b\p{L}, que en JS es ASCII
// y partiría "NIÑO"→"NiÑO"). Igual que tituloCliente en PortalCliente.jsx, para
// que el título del link coincida con el saludo dentro del portal.
const tituloNombre = (n) => String(n || '').trim().split(/\s+/).map(w =>
  (/\./.test(w) || /^(sas|sa|ltda|cia|eu)$/i.test(w))
    ? w.toUpperCase()
    : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
).join(' ')

async function servirPortal(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  const base = `${proto}://${host}`

  let html
  try { html = await (await fetch(`${base}/index.html`)).text() }
  catch { res.status(302).setHeader('Location', '/index.html'); res.end(); return }

  const ced = (req.query.c || '').toString().replace(/[.\-\s]/g, '')
  let nombre = ''
  if (ced) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?identificacion=eq.${encodeURIComponent(ced)}&select=nombre&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
      if (r.ok) { const rows = await r.json(); nombre = tituloNombre(rows?.[0]?.nombre) }
    } catch { /* sin nombre → título genérico */ }
  }

  const titulo = nombre ? `Portal del Vehículo — ${nombre}` : 'Portal del Vehículo — Multidiagnósticos AS'
  const desc = nombre
    ? `${nombre}, consulta aquí el estado de tu vehículo en Multidiagnósticos AS.`
    : 'Consulta el estado de tu vehículo en Multidiagnósticos AS.'
  const img = `${base}/logo.png`
  const meta = [
    `<meta property="og:title" content="${escHtml(titulo)}">`,
    `<meta property="og:description" content="${escHtml(desc)}">`,
    `<meta property="og:image" content="${escHtml(img)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Multidiagnósticos AS">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escHtml(titulo)}">`,
    `<meta name="twitter:description" content="${escHtml(desc)}">`,
    `<meta name="twitter:image" content="${escHtml(img)}">`,
  ].join('')
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escHtml(titulo)}</title>`).replace('</head>', `${meta}</head>`)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  res.status(200).send(html)
}

export default async function handler(req, res) {
  // El portal se sirve ANTES del CORS/allowlist de tablas: es HTML público, no la API.
  if (req.query.portal === '1') { await servirPortal(req, res); return }

  const origin = getOrigin(req.headers.origin || '')
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  // Storage: firma una URL de subida para el bucket "evidencias" (videos que no
  // caben ni en la columna ni en el límite de 4.5MB de una función). El servidor
  // firma con la llave anon; el navegador sube el archivo grande DIRECTO a esa
  // URL (la llave nunca sale al cliente). Devuelve también la URL pública.
  if (req.query.storage === 'sign') {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return }
    const path = String((req.body && req.body.path) || '').replace(/^\/+/, '')
    // Ruta simple dentro del bucket: evita path traversal y sobrescribir otras cosas.
    if (!path || path.includes('..') || !/^[\w./-]+$/.test(path)) { res.status(400).json({ error: 'path inválido' }); return }
    try {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/evidencias/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: '{}',
      })
      const data = await r.json().catch(() => null)
      if (!r.ok || !data?.url) { res.status(502).json({ error: 'No se pudo firmar la subida', detail: data }); return }
      res.status(200).json({
        signedUrl: `${SUPABASE_URL}/storage/v1${data.url}`,
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/evidencias/${path}`,
        path,
      })
    } catch (e) {
      res.status(500).json({ error: e.message || 'Error firmando la subida' })
    }
    return
  }

  const table = req.query.table
  if (!table) { res.status(400).json({ error: 'table param requerido' }); return }
  const ALLOWED_TABLES = [
    'trabajos', 'cotizaciones', 'clientes', 'vehiculos', 'inspecciones',
    'movimientos_tecnicos', 'liquidacion_historial', 'liquidados', 'trabajos_compartidos',
    'prestamos_movimientos', 'tecnicos',
  ]
  if (!ALLOWED_TABLES.includes(table)) { res.status(403).json({ error: 'Tabla no permitida' }); return }

  try {
    const qs = new URL(req.url, 'http://localhost')
    qs.searchParams.delete('table')
    qs.searchParams.delete('upsert')
    const queryString = qs.searchParams.toString()
    const url = `${SUPABASE_URL}/rest/v1/${table}${queryString ? `?${queryString}` : ''}`
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': req.query.upsert === 'true' && req.method === 'POST'
        ? 'return=representation,resolution=merge-duplicates'
        : 'return=representation',
      'Accept': 'application/json',
    }
    const options = { method: req.method, headers, cache: 'no-store' }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
      options.body = JSON.stringify(req.body)
    }
    const response = await fetch(url, options)
    const text = await response.text()

    if (!response.ok) {
      console.error('Supabase responded with error:', response.status, text)
      // Si Supabase devuelve error, indicar al frontend
      return res.status(502).json({
        error: 'Supabase error',
        status: response.status,
        detail: text,
      })
    }

    res.status(response.status)
    try { res.json(JSON.parse(text)) } catch { res.send(text) }
  } catch (err) {
    console.error('Supabase proxy error:', err.message || err)
    // Devolver error real para que el frontend pueda mostrar el banner
    res.status(503).json({
      error: 'No se pudo conectar con Supabase',
      detail: err.message || 'Connection failed',
    })
  }
}

// asegurar runtime node para fetch
export const config = {
  runtime: 'nodejs',
}
