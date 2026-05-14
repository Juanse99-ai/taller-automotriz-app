// OAuth 2.1 Authorization endpoint.
// GET: muestra formulario para que el usuario pegue su MCP_TOKEN.
// POST: valida el token contra MCP_TOKEN y redirige al redirect_uri con ?code=...&state=...
import { signAuthCode } from '../_mcp/oauth.js'

function htmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function renderForm({ redirectUri, state, codeChallenge, codeChallengeMethod, error }) {
  const errBlock = error ? `<p style="color:#c62828;margin:8px 0;">${htmlEscape(error)}</p>` : ''
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autorizar MCP</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0b1220; color:#e6e9ef; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; }
  .card { background:#111827; border:1px solid #1f2937; border-radius:12px; padding:28px; max-width:420px; width:100%; box-shadow:0 10px 30px rgba(0,0,0,0.4); }
  h1 { font-size:18px; margin:0 0 12px 0; color:#f3f4f6; }
  p { font-size:13px; color:#9ca3af; line-height:1.5; margin:0 0 16px 0; }
  label { display:block; font-size:12px; color:#9ca3af; margin-bottom:6px; }
  input[type="password"] { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid #374151; background:#0b1220; color:#e6e9ef; font-size:14px; }
  button { margin-top:14px; width:100%; padding:12px; border:0; border-radius:8px; background:#fbbf24; color:#111827; font-weight:600; font-size:14px; cursor:pointer; }
  button:hover { background:#f59e0b; }
  small { display:block; margin-top:14px; color:#6b7280; font-size:11px; }
</style>
</head>
<body>
<div class="card">
  <h1>Autorizar acceso MCP</h1>
  <p>Pegá tu token MCP para autorizar a Claude a usar este servidor.</p>
  ${errBlock}
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="redirect_uri" value="${htmlEscape(redirectUri || '')}">
    <input type="hidden" name="state" value="${htmlEscape(state || '')}">
    <input type="hidden" name="code_challenge" value="${htmlEscape(codeChallenge || '')}">
    <input type="hidden" name="code_challenge_method" value="${htmlEscape(codeChallengeMethod || '')}">
    <label for="token">MCP Token</label>
    <input id="token" name="token" type="password" autocomplete="off" required autofocus>
    <button type="submit">Autorizar</button>
  </form>
  <small>El token se valida contra la variable de entorno MCP_TOKEN del servidor.</small>
</div>
</body>
</html>`
}

async function readBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      const params = new URLSearchParams(req.body)
      const obj = {}
      for (const [k, v] of params) obj[k] = v
      return obj
    }
    return req.body
  }
  // Fallback: leer stream
  return await new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => {
      const params = new URLSearchParams(data)
      const obj = {}
      for (const [k, v] of params) obj[k] = v
      resolve(obj)
    })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (req.method === 'GET') {
    const q = req.query || {}
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(renderForm({
      redirectUri: q.redirect_uri,
      state: q.state,
      codeChallenge: q.code_challenge,
      codeChallengeMethod: q.code_challenge_method,
    }))
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = await readBody(req)
  const redirectUri = body.redirect_uri
  const state = body.state || ''
  const codeChallenge = body.code_challenge || ''
  const codeChallengeMethod = body.code_challenge_method || ''
  const token = body.token || ''

  if (!redirectUri) {
    res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri requerido' })
    return
  }

  const expected = process.env.MCP_TOKEN || ''
  if (!expected || token !== expected) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(401).send(renderForm({
      redirectUri, state, codeChallenge, codeChallengeMethod,
      error: 'Token invalido. Verifica el MCP_TOKEN.',
    }))
    return
  }

  let code
  try {
    code = signAuthCode({ redirectUri, codeChallenge, codeChallengeMethod })
  } catch (e) {
    res.status(500).json({ error: 'server_error', error_description: e.message })
    return
  }

  const url = new URL(redirectUri)
  url.searchParams.set('code', code)
  if (state) url.searchParams.set('state', state)

  res.setHeader('Location', url.toString())
  res.status(302).end()
}
