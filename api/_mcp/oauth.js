// Helpers para OAuth 2.1 minimo (sin estado persistente).
//
// Estrategia:
//   - Dynamic Client Registration: devolvemos un client_id fijo "claude-mcp" (public client).
//   - Authorization code: JWT-like firmado con HMAC-SHA256 usando MCP_TOKEN como secreto.
//   - Access token: devolvemos el MCP_TOKEN como Bearer (asi el helper MCP existente lo valida).
//   - PKCE soportado (code_challenge_method = S256).
//
// El usuario debe poseer MCP_TOKEN para autorizar -> al pegarlo en /oauth/authorize,
// firmamos un code que solo /oauth/token puede verificar (usa el mismo MCP_TOKEN).

import crypto from 'node:crypto'

const PUBLIC_CLIENT_ID = 'claude-mcp'
const CODE_TTL_SECONDS = 600 // 10 min

function getSecret() {
  const s = process.env.MCP_TOKEN || ''
  if (!s) throw new Error('MCP_TOKEN no configurado')
  return s
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64')
}

function sign(payload, secret) {
  return b64url(crypto.createHmac('sha256', secret).update(payload).digest())
}
function safeEqual(a, b) {
  const A = Buffer.from(a); const B = Buffer.from(b)
  if (A.length !== B.length) return false
  return crypto.timingSafeEqual(A, B)
}

/**
 * Firma un authorization code que incluye redirect_uri y code_challenge.
 */
export function signAuthCode({ redirectUri, codeChallenge, codeChallengeMethod }) {
  const secret = getSecret()
  const payload = JSON.stringify({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge || null,
    code_challenge_method: codeChallengeMethod || null,
  })
  const head = b64url(payload)
  const sig = sign(head, secret)
  return `${head}.${sig}`
}

/**
 * Verifica un authorization code. Lanza Error en caso de invalido.
 */
export function verifyAuthCode(code, { redirectUri, codeVerifier }) {
  const secret = getSecret()
  if (typeof code !== 'string' || !code.includes('.')) throw new Error('invalid_grant: malformed code')
  const [head, sig] = code.split('.')
  const expectedSig = sign(head, secret)
  if (!safeEqual(sig, expectedSig)) throw new Error('invalid_grant: bad signature')
  let payload
  try { payload = JSON.parse(b64urlDecode(head).toString('utf8')) }
  catch { throw new Error('invalid_grant: bad payload') }
  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || now > payload.exp) throw new Error('invalid_grant: code expired')
  if (payload.redirect_uri && redirectUri && payload.redirect_uri !== redirectUri) throw new Error('invalid_grant: redirect_uri mismatch')

  if (payload.code_challenge) {
    if (!codeVerifier) throw new Error('invalid_grant: code_verifier required (PKCE)')
    const method = payload.code_challenge_method || 'plain'
    let computed
    if (method === 'S256') {
      computed = b64url(crypto.createHash('sha256').update(codeVerifier).digest())
    } else {
      computed = codeVerifier
    }
    if (!safeEqual(computed, payload.code_challenge)) throw new Error('invalid_grant: PKCE verification failed')
  }
  return payload
}

export function getPublicClientId() { return PUBLIC_CLIENT_ID }

/**
 * Construye la URL base absoluta del request (sirve para detrás de Vercel).
 */
export function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0]
  const host = (req.headers['x-forwarded-host'] || req.headers['host'] || '').toString().split(',')[0]
  return `${proto}://${host}`
}
