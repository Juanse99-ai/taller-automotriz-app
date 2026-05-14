// OAuth 2.1 Token endpoint.
// Recibe authorization_code + PKCE code_verifier y devuelve el access_token = MCP_TOKEN
// (asi el handler MCP existente lo valida sin cambios).
import { verifyAuthCode } from '../_mcp/oauth.js'

async function readBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      // Puede ser JSON o form-urlencoded
      const trimmed = req.body.trim()
      if (trimmed.startsWith('{')) {
        try { return JSON.parse(trimmed) } catch { /* fallthrough */ }
      }
      const params = new URLSearchParams(req.body)
      const obj = {}
      for (const [k, v] of params) obj[k] = v
      return obj
    }
    return req.body
  }
  return await new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => {
      const ct = (req.headers['content-type'] || '').toLowerCase()
      if (ct.includes('application/json')) {
        try { resolve(JSON.parse(data)) } catch { resolve({}) }
      } else {
        const params = new URLSearchParams(data)
        const obj = {}
        for (const [k, v] of params) obj[k] = v
        resolve(obj)
      }
    })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }

  const body = await readBody(req)
  const grantType = body.grant_type
  if (grantType !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type', error_description: 'solo authorization_code' })
    return
  }

  const code = body.code
  const redirectUri = body.redirect_uri
  const codeVerifier = body.code_verifier

  if (!code) {
    res.status(400).json({ error: 'invalid_request', error_description: 'code requerido' })
    return
  }

  try {
    verifyAuthCode(code, { redirectUri, codeVerifier })
  } catch (e) {
    res.status(400).json({ error: 'invalid_grant', error_description: e.message })
    return
  }

  const accessToken = process.env.MCP_TOKEN || ''
  if (!accessToken) {
    res.status(500).json({ error: 'server_error', error_description: 'MCP_TOKEN no configurado' })
    return
  }

  // Cache: no cachear tokens.
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600 * 24 * 30, // 30 dias
    scope: 'mcp',
  })
}
