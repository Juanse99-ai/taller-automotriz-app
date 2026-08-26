const ALLOWED_ORIGINS = [
  'https://taller-multias.vercel.app',
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

import { sesionDeLaPeticion } from './_lib/sesion.js'

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

  // Verificación de pagos contra Cuentti (la usa el portal del cliente antes de
  // ofrecer "Pagar"). PROBLEMA QUE RESUELVE: si el cliente paga directamente en
  // Cuentti —transferencia, efectivo en caja— la app nunca se entera y le seguía
  // mostrando el botón de pagar sobre una factura ya cancelada, con riesgo real de
  // cobrarle dos veces (caso EDWIN DIAZ / FEIC-460).
  //
  // Va en el SERVIDOR para no exponer el id de transacción al navegador, y se
  // AUTO-CORRIGE: cuando Cuentti confirma que no queda saldo, marca pagado=true en
  // la base, así el arreglo es permanente y no solo cosmético.
  // Solo marca PAGADO, nunca al revés: un fallo de red jamás puede "despagar" algo.
  if (req.query.verificarPagos) {
    const ced = String(req.query.verificarPagos).replace(/[.\-\s]/g, '')
    if (!ced) { res.status(400).json({ error: 'Falta la cédula' }); return }
    try {
      const cols = 'id,cuentti_id_transacion,total'
      const q = `${SUPABASE_URL}/rest/v1/trabajos?cedula_cliente=eq.${encodeURIComponent(ced)}` +
        `&pagado=is.false&cuentti_id_transacion=not.is.null&deleted=not.is.true&select=${cols}&limit=20`
      const rows = await fetch(q, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])

      const marcados = []
      const saldos = {}
      // Lo ABONADO tal como lo dice Cuentti. Se devuelve aparte a propósito: el
      // portal lo mostraba restando (total de la app − pendiente de Cuentti), y
      // esas son dos fuentes distintas — si la factura de Cuentti no vale
      // exactamente lo mismo que trabajos.total, el cliente leía un abono que
      // nunca hizo. Aquí el dato es de una sola fuente y no hay que calcularlo.
      const abonos = {}
      for (const t of (Array.isArray(rows) ? rows : [])) {
        const tx = String(t.cuentti_id_transacion || '').trim()
        if (!tx) continue
        try {
          // Este endpoint del portal de Cuentti no pide token: basta la empresa.
          const url = `https://transaciones.cuenti.com/jServerj4ErpPro/com/j4ErpPro/server/transacion/consultarTransacionIdExterno/${encodeURIComponent(tx)}`
          const d = await fetch(url, { headers: { 'X-Auth-Token-empresa': '11464' } }).then(r => r.json())
          const enc = ((Array.isArray(d) ? d : []).find(x => x.consulta === 'Encabezados') || {}).resultado || []
          const e = enc[0]
          if (!e) continue // sin datos: se deja como estaba (nunca se asume pagado)
          const pendiente = Math.round(Number(e.total_deuda || 0) - Number(e.total_abono || 0))
          saldos[t.id] = pendiente
          abonos[t.id] = Math.round(Number(e.total_abono || 0))
          if (pendiente <= 1) { // ≤1 por el redondeo de centavos de Cuentti
            await fetch(`${SUPABASE_URL}/rest/v1/trabajos?id=eq.${encodeURIComponent(t.id)}`, {
              method: 'PATCH',
              headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ pagado: true }),
            })
            marcados.push(t.id)
          }
        } catch { /* Cuentti caído o lento: se deja como está */ }
      }
      res.status(200).json({ ok: true, marcados, saldos, abonos })
    } catch (e) {
      res.status(200).json({ ok: false, error: e.message, marcados: [], saldos: {}, abonos: {} })
    }
    return
  }

  // Storage: firma una URL de subida para el bucket "evidencias" (videos que no
  // caben ni en la columna ni en el límite de 4.5MB de una función). El servidor
  // firma con la llave anon; el navegador sube el archivo grande DIRECTO a esa
  // URL (la llave nunca sale al cliente). Devuelve también la URL pública.
  // Estado de pago de UNA factura en Cuentti. Se usa justo despues de registrar
  // un pago para confirmar que de verdad entro: Cuentti responde sus errores con
  // HTTP 200, asi que "no fallo" no significa "quedo registrado". Mismo endpoint
  // y misma cabecera de empresa que el barrido de verificarPagos.
  // URLs de factura para el PORTAL, por cedula. Se resuelven AQUI y no en el
  // cliente a proposito: el portal es publico y deliberadamente no trae
  // cuentti_id_transacion (ver SELECT_PORTAL). Sale solo el enlace ya resuelto,
  // que Cuentti protege con un codigo aleatorio de 20 hex por documento.
  if (req.query.facturasPortal) {
    const ced = String(req.query.facturasPortal).replace(/[.\-\s]/g, '')
    if (!ced) { res.status(400).json({ error: 'falta cedula' }); return }
    try {
      const cols = 'id,cuentti_id_transacion'
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/trabajos?cedula_cliente=eq.${encodeURIComponent(ced)}` +
        `&cuentti_id_transacion=not.is.null&deleted=not.is.true&select=${cols}&limit=40`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
      const rows = r.ok ? await r.json() : []
      const urls = {}
      await Promise.all((Array.isArray(rows) ? rows : []).map(async t => {
        const tx = String(t.cuentti_id_transacion || '').trim()
        if (!tx) return
        try {
          const d = await fetch(
            `https://transaciones.cuenti.com/jServerj4ErpPro/com/j4ErpPro/server/transacion/buscarQrId_transacion/${encodeURIComponent(tx)}`,
            { headers: { 'X-Auth-Token-empresa': '11464' } }).then(x => x.json())
          const u = (Array.isArray(d) ? d[0] : d)?.url
          if (u) urls[t.id] = u
        } catch { /* esa factura no se ofrece; el resto si */ }
      }))
      res.status(200).json({ ok: true, urls })
    } catch (e) {
      res.status(200).json({ ok: false, urls: {}, motivo: e.message })
    }
    return
  }

  if (req.query.estadoPago) {
    // Subir, borrar y consultar pagos es cosa de la app. El portal no pasa por aqui.
    if (!sesionDeLaPeticion(req)) { res.status(401).json({ error: 'Sesion requerida' }); return }
    const tx = String(req.query.estadoPago).replace(/[^\w-]/g, '')
    if (!tx) { res.status(400).json({ error: 'falta id_transacion' }); return }
    try {
      const url = `https://transaciones.cuenti.com/jServerj4ErpPro/com/j4ErpPro/server/transacion/consultarTransacionIdExterno/${encodeURIComponent(tx)}`
      const d = await fetch(url, { headers: { 'X-Auth-Token-empresa': '11464' } }).then(r => r.json())
      const enc = ((Array.isArray(d) ? d : []).find(x => x.consulta === 'Encabezados') || {}).resultado || []
      const e = enc[0]
      if (!e) { res.status(200).json({ ok: false, motivo: 'sin datos' }); return }
      const deuda = Math.round(Number(e.total_deuda || 0))
      const abono = Math.round(Number(e.total_abono || 0))
      // id_cliente sale de la propia factura: es el unico numero que Cuentti
      // reconoce como suyo para el recibo de caja. Antes se mandaba -1 cuando la
      // OT no lo tenia, confiando en que Cuentti lo resolviera, y no lo resuelve.
      res.status(200).json({
        ok: true,
        total_deuda: deuda,
        total_abono: abono,
        pendiente: deuda - abono,
        id_cliente: e.id_cliente ?? null,
        n_transacion: e.n_transacion ?? null,
      })
    } catch (err) {
      // Cuentti caido o lento: NO se afirma que el pago fallo, solo que no se
      // pudo comprobar. Quien llama decide (y nunca marca pagado a ciegas).
      res.status(200).json({ ok: false, motivo: err.message })
    }
    return
  }

  if (req.query.storage === 'sign') {
    // Subir, borrar y consultar pagos es cosa de la app. El portal no pasa por aqui.
    if (!sesionDeLaPeticion(req)) { res.status(401).json({ error: 'Sesion requerida' }); return }
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

  // Storage: borra un archivo del bucket "evidencias" (cuando se quita un video
  // de una OT o se elimina la OT). Solo ese bucket; el servidor usa la llave.
  if (req.query.storage === 'delete') {
    // Subir, borrar y consultar pagos es cosa de la app. El portal no pasa por aqui.
    if (!sesionDeLaPeticion(req)) { res.status(401).json({ error: 'Sesion requerida' }); return }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return }
    const path = String((req.body && req.body.path) || '').replace(/^\/+/, '')
    if (!path || path.includes('..') || !/^[\w./-]+$/.test(path)) { res.status(400).json({ error: 'path inválido' }); return }
    // Sólo se puede borrar un archivo que NINGÚN trabajo activo referencia. El
    // proxy es abierto y los paths son enumerables; sin esto, cualquiera podría
    // borrar todas las evidencias. Como el cliente persiste ANTES de borrar (quita
    // el video de la OT y guarda, luego borra), un borrado legítimo pasa; un
    // atacante que apunte a un video vivo choca con el 403.
    try {
      const ref = await fetch(`${SUPABASE_URL}/rest/v1/trabajos?deleted=eq.false&evidencias=like.*${encodeURIComponent(path)}*&select=id&limit=1`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
      if (ref.ok) {
        const filas = await ref.json().catch(() => [])
        if (Array.isArray(filas) && filas.length > 0) { res.status(403).json({ error: 'El archivo aún está referenciado por un trabajo' }); return }
      }
    } catch { /* si no se pudo verificar, se sigue (falla abierta hacia el borrado legítimo) */ }
    try {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/evidencias/${path}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      })
      // Idempotente: "ya no existe" (Supabase manda el 404 en el CUERPO, no en el
      // status HTTP) también cuenta como borrado OK.
      const body = r.ok ? '' : await r.text()
      if (!r.ok && !/not_?found|Object not found|"404"/i.test(body)) {
        res.status(502).json({ error: 'No se pudo borrar', detail: body }); return
      }
      res.status(200).json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: e.message || 'Error borrando' })
    }
    return
  }

  const table = req.query.table
  if (!table) { res.status(400).json({ error: 'table param requerido' }); return }

  // Columnas que el portal PUBLICO puede leer. Es la misma lista que el front ya
  // pedia a proposito (ver SELECT_PORTAL en PortalCliente.jsx), pero alli era solo
  // una intencion: el servidor aceptaba cualquier `select`, asi que un select=*
  // devolvia las 55 columnas, incluidas firma_cliente, telefono_cliente,
  // email_cliente y cuentti_id_transacion. Comprobado con curl.
  const COLUMNAS_PORTAL = {
    trabajos: 'id,fecha,created_at,cedula_cliente,cliente,placa,marca,modelo,ano,kilometraje,'
      + 'tecnico_id,estado,observaciones,items,total,ot_codigo,tipo_aceite,proximo_km,'
      + 'proxima_visita,notas_proximo_mant,evidencias,sin_vehiculo,pagado,facturado_en,ingreso',
    cotizaciones: 'id,fecha,cliente,placa,marca,modelo,ano,items,subtotal,iva,total,'
      + 'observaciones,validez_dias,estado,aprobada_en',
  }

  // Tablas que solo un admin puede tocar: son la plata que se le debe a los
  // tecnicos. El rol se comprobaba SOLO en el navegador (getSeccionesPermitidas),
  // asi que un jefe_taller con sesion valida podia leerlas y escribirlas por curl.
  const TABLAS_SOLO_ADMIN = ['liquidados', 'liquidacion_historial', 'movimientos_tecnicos', 'prestamos_movimientos']

  // ── Quien puede pasar ────────────────────────────────────────────────────
  // El portal del cliente es publico y no tiene sesion, asi que necesita una
  // puerta propia. Es DELIBERADAMENTE estrecha: solo lo que el portal hace de
  // verdad, y nada mas. Todo lo demas exige token.
  const soloLoSuyo = (v) => typeof v === 'string' && v.startsWith('eq.') && v.length > 3
  function permitidoSinSesion() {
    if (req.method === 'GET') {
      // Leer, pero SIEMPRE acotado a la cedula del que consulta. Sin el filtro
      // esto seria un volcado de toda la tabla.
      if (table === 'trabajos') return soloLoSuyo(req.query.cedula_cliente)
      if (table === 'cotizaciones') return soloLoSuyo(req.query.cedula)
      return false
    }
    // Lo unico que el cliente escribe: aprobar su cotizacion firmando.
    if (req.method === 'PATCH' && table === 'cotizaciones' && soloLoSuyo(req.query.id)) {
      const CAMPOS = ['estado', 'firma_aprobacion', 'aprobada_en']
      const cuerpo = req.body || {}
      const claves = Object.keys(cuerpo)
      // Sin esta comprobacion el cuerpo pasa tal cual a Supabase y desde fuera
      // se podria cambiar el TOTAL de una cotizacion, no solo aprobarla.
      return claves.length > 0
        && claves.every(k => CAMPOS.includes(k))
        && cuerpo.estado === 'Aprobada'
    }
    return false
  }
  const esPublico = permitidoSinSesion()
  const sesion = esPublico ? null : sesionDeLaPeticion(req)
  if (!esPublico && !sesion) {
    res.status(401).json({ error: 'Sesion requerida' })
    return
  }
  if (!esPublico && TABLAS_SOLO_ADMIN.includes(table) && sesion.r !== 'admin') {
    res.status(403).json({ error: 'Esta seccion es solo para administradores' })
    return
  }
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
    // En el camino publico el servidor DECIDE las columnas: se sobreescribe lo que
    // pidan. Validar en vez de sobreescribir dejaria la puerta a un select vacio o
    // ausente, que en PostgREST equivale a traerlo todo.
    if (esPublico && COLUMNAS_PORTAL[table]) {
      qs.searchParams.set('select', COLUMNAS_PORTAL[table])
    }
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
