// RFC 7591 — Dynamic Client Registration.
// claude.ai POSTea aqui para registrarse. Devolvemos un client_id publico fijo.
import { getPublicClientId } from '../_mcp/oauth.js'

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  if (!body || typeof body !== 'object') body = {}

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []

  res.status(201).json({
    client_id: getPublicClientId(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: body.application_type || 'web',
    client_name: body.client_name || 'Claude MCP Client',
  })
}
