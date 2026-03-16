const ALLOWED_ORIGINS = [
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

const SUPABASE_URL = 'https://qvjmyfvrdeebtbhuzzkw.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2am15ZnZyZGVlYnRiaHV6emt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTY1MDMsImV4cCI6MjA3NjU3MjUwM30.2V6ag-H06Qw4XDLUnU4KkxEz_gK7w817PwgX3M4ZJC8'

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
  if (table !== 'trabajos') { res.status(403).json({ error: 'Tabla no permitida' }); return }

  try {
    const qs = new URL(req.url, 'http://localhost')
    qs.searchParams.delete('table')
    const queryString = qs.searchParams.toString()
    const url = `${SUPABASE_URL}/rest/v1/${table}${queryString ? `?${queryString}` : ''}`
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
      'Accept': 'application/json',
    }
    const options = { method: req.method, headers, cache: 'no-store' }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
      options.body = JSON.stringify(req.body)
    }
    const response = await fetch(url, options)
    const text = await response.text()
    res.status(response.status)
    try { res.json(JSON.parse(text)) } catch { res.send(text) }
  } catch (err) {
    console.error('Supabase proxy error:', err)
    // Fallback: no bloqueo en FE, devolvemos arreglo vacio
    res.status(200).json([])
  }
}

// asegurar runtime node para fetch
export const config = {
  runtime: 'nodejs',
}
