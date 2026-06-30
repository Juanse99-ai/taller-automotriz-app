const ALLOWED_ORIGINS = [
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

export default async function handler(req, res) {
  const origin = getOrigin(req.headers.origin || '')
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const table = req.query.table
  if (!table) { res.status(400).json({ error: 'table param requerido' }); return }
  const ALLOWED_TABLES = [
    'trabajos', 'cotizaciones', 'clientes', 'vehiculos', 'inspecciones',
    'movimientos_tecnicos', 'liquidacion_historial', 'liquidados', 'trabajos_compartidos',
    'prestamos_movimientos',
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
