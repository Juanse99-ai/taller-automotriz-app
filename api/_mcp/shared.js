// Helpers compartidos para los endpoints MCP en Vercel (Streamable HTTP, stateless).
// Implementa el protocolo JSON-RPC 2.0 que requiere el formato MCP, sin depender
// del transporte stdio del SDK (no apto para serverless).

const PROTOCOL_VERSION = '2025-03-26'

function authOk(req) {
  const expected = process.env.MCP_TOKEN
  if (!expected) return false
  const header = req.headers['authorization'] || req.headers['Authorization'] || ''
  if (!header.startsWith('Bearer ')) return false
  const token = header.slice('Bearer '.length).trim()
  return token === expected
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}
function rpcError(id, code, message, data) {
  const err = { code, message }
  if (data !== undefined) err.data = data
  return { jsonrpc: '2.0', id, error: err }
}

// Convierte la respuesta del tool al formato MCP estandar.
function toMcpContent(value) {
  if (value && Array.isArray(value.content)) return value
  if (typeof value === 'string') return { content: [{ type: 'text', text: value }] }
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * Maneja una request MCP HTTP.
 * @param {object} req - Vercel/Node request
 * @param {object} res - Vercel/Node response
 * @param {object} server - { name, version, tools: [{ name, description, inputSchema, handler }] }
 */
export async function handleMcp(req, res, server) {
  setCors(res)

  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  // Probe sin auth: respondemos 401 con WWW-Authenticate apuntando a OAuth,
  // para que claude.ai inicie el flujo de descubrimiento.
  if (!authOk(req)) {
    // Header de descubrimiento OAuth 2.0 Protected Resource (RFC 9728).
    // claude.ai lo lee y arranca el flujo OAuth contra /.well-known/oauth-protected-resource.
    const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0]
    const host = (req.headers['x-forwarded-host'] || req.headers['host'] || '').toString().split(',')[0]
    const resourceMeta = `${proto}://${host}/.well-known/oauth-protected-resource`
    res.setHeader('WWW-Authenticate', `Bearer realm="mcp", resource_metadata="${resourceMeta}"`)
    res.status(401).json({ error: 'Unauthorized. Use OAuth or send Authorization: Bearer <MCP_TOKEN>' })
    return
  }

  if (req.method === 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use POST with JSON-RPC payload.' })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  if (!body) {
    res.status(400).json({ error: 'Empty or invalid JSON body' })
    return
  }

  const requests = Array.isArray(body) ? body : [body]
  const responses = []

  for (const msg of requests) {
    const id = msg.id ?? null
    const method = msg.method
    const params = msg.params || {}

    try {
      // Notificaciones: sin respuesta
      if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
        continue
      }

      if (method === 'initialize') {
        responses.push(rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: server.name, version: server.version },
        }))
        continue
      }

      if (method === 'ping') {
        responses.push(rpcResult(id, {}))
        continue
      }

      if (method === 'tools/list') {
        const tools = server.tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
        }))
        responses.push(rpcResult(id, { tools }))
        continue
      }

      if (method === 'tools/call') {
        const toolName = params.name
        const args = params.arguments || {}
        const tool = server.tools.find(t => t.name === toolName)
        if (!tool) {
          responses.push(rpcError(id, -32602, `Unknown tool: ${toolName}`))
          continue
        }
        try {
          const out = await tool.handler(args)
          responses.push(rpcResult(id, toMcpContent(out)))
        } catch (e) {
          responses.push(rpcResult(id, {
            content: [{ type: 'text', text: `Error: ${e.message || String(e)}` }],
            isError: true,
          }))
        }
        continue
      }

      if (method === 'resources/list' || method === 'prompts/list') {
        responses.push(rpcResult(id, { [method.split('/')[0]]: [] }))
        continue
      }

      responses.push(rpcError(id, -32601, `Method not found: ${method}`))
    } catch (e) {
      responses.push(rpcError(id, -32603, e.message || 'Internal error'))
    }
  }

  res.setHeader('Content-Type', 'application/json')
  if (Array.isArray(body)) {
    res.status(200).json(responses)
  } else {
    res.status(200).json(responses[0] ?? null)
  }
}
