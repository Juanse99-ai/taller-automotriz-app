// Sirve /portal con meta OpenGraph PERSONALIZADOS por cliente, para que la
// previsualización del link (WhatsApp, etc.) muestre "Portal del Vehículo —
// <Cliente>" en vez del título genérico de la app.
//
// Cómo funciona: WhatsApp/redes NO ejecutan el JS de la SPA — solo leen los
// <meta> del <head>. Esta función busca el nombre del cliente por su cédula en
// Supabase, toma el index.html ya construido y le inyecta los meta antes de
// devolverlo. Los usuarios reales reciben el MISMO index.html (la app arranca
// igual y lee ?c= como siempre); los crawlers ven el título con el nombre.
//
// Ante cualquier fallo se devuelve el index.html tal cual: el portal nunca se
// rompe por esto.

const SUPABASE_URL = 'https://hpndvrjjizzkusuuhefb.supabase.co'
// anon key (público, mismo que api/supabase.js — solo lectura con RLS)
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbmR2cmpqaXp6a3VzdXVoZWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjkwMzMsImV4cCI6MjA4OTA0NTAzM30.-6Jz1TsDjAladZUOGD-WNMvVbZXd1Z4WBoOF-npew5c'

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Capitaliza "MARTIN ANTONIO" -> "Martin Antonio" (los nombres vienen en MAYÚS).
function tituloNombre(n) {
  return String(n || '').toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase()).trim()
}

async function nombrePorCedula(ced) {
  if (!ced) return ''
  try {
    const url = `${SUPABASE_URL}/rest/v1/clientes?identificacion=eq.${encodeURIComponent(ced)}&select=nombre&limit=1`
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
    if (!r.ok) return ''
    const rows = await r.json()
    return rows?.[0]?.nombre || ''
  } catch { return '' }
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  const base = `${proto}://${host}`

  // index.html construido (estático). Si falla, no hay nada que servir.
  let html
  try {
    const r = await fetch(`${base}/index.html`)
    html = await r.text()
  } catch {
    res.status(302).setHeader('Location', '/index.html'); res.end(); return
  }

  const ced = (req.query.c || '').toString().replace(/[.\-\s]/g, '')
  const nombre = tituloNombre(await nombrePorCedula(ced))

  const titulo = nombre
    ? `Portal del Vehículo — ${nombre}`
    : 'Portal del Vehículo — Multidiagnósticos AS'
  const desc = nombre
    ? `${nombre}, consulta aquí el estado de tu vehículo en Multidiagnósticos AS.`
    : 'Consulta el estado de tu vehículo en Multidiagnósticos AS.'
  const img = `${base}/logo.png`

  const meta = [
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Multidiagnósticos AS">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${esc(titulo)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
  ].join('')

  // Reemplaza el <title> genérico y agrega los meta justo antes de </head>.
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(titulo)}</title>`)
  html = html.replace('</head>', `${meta}</head>`)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Sin cache: el nombre cambia por cédula.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  res.status(200).send(html)
}
