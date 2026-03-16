import { createClient } from '@supabase/supabase-js'

const ALLOWED_ORIGINS = [
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

const SUPABASE_URL = 'https://qvjmyfvrdeebtbhuzzkw.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2am15ZnZyZGVlYnRiaHV6emt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTY1MDMsImV4cCI6MjA3NjU3MjUwM30.2V6ag-H06Qw4XDLUnU4KkxEz_gK7w817PwgX3M4ZJC8'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
    if (req.method === 'GET') {
      const select = req.query.select || '*'
      const order = req.query.order // e.g. "fecha.desc"
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 500

      let q = supabase.from(table).select(select)
      if (order) {
        const [col, dir] = order.split('.')
        q = q.order(col, { ascending: dir !== 'desc' })
      }
      if (limit) q = q.limit(limit)

      const { data, error, status } = await q
      if (error) return res.status(status || 500).json({ error: error.message })
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const payload = Array.isArray(req.body) ? req.body : [req.body]
      const { data, error, status } = await supabase
        .from(table)
        .upsert(payload, { onConflict: 'id', returning: 'representation' })
      if (error) return res.status(status || 500).json({ error: error.message })
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      const idEq = req.query.id?.replace('eq.', '')
      if (!idEq) return res.status(400).json({ error: 'id=eq.{id} requerido' })
      const { error, status } = await supabase.from(table).delete().eq('id', idEq)
      if (error) return res.status(status || 500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    res.status(405).json({ error: 'Metodo no soportado' })
  } catch (err) {
    console.error('Supabase proxy error:', err)
    res.status(500).json({ error: 'Supabase proxy failed', detail: err.message })
  }
}
