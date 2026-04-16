const ALLOWED_ORIGINS = [
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

function getCorsOrigin(reqOrigin) {
  if (ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  if (reqOrigin && (reqOrigin.startsWith('http://localhost') || reqOrigin.startsWith('http://127.0.0.1'))) return reqOrigin;
  return ALLOWED_ORIGINS[0];
}

export default async function handler(req, res) {
  const origin = getCorsOrigin(req.headers.origin || '');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-auth-token, x-auth-token-api, x-auth-token-empresa, x-id-sucursal, x-id-empleado, x-gtm, X-Auth-Token-id-usuario, token, X-Auth-Token-usuario, usuario');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const path = req.query.path || '';
    if (!path.startsWith('/jServerj4ErpPro/')) { res.status(400).json({ error: 'Invalid API path' }); return; }

    const baseUrl = 'https://app.cuenti.com';
    const cuenttiUrl = new URL(path, baseUrl).toString();

    const headers = { 'Content-Type': 'application/json' };
    const fwd = ['authorization','x-api-key','x-auth-token','x-auth-token-api','x-auth-token-empresa','x-id-sucursal','x-id-empleado','x-gtm','x-auth-token-id-usuario','token','x-auth-token-usuario','usuario'];
    fwd.forEach(h => { if (req.headers[h]) headers[h] = req.headers[h]; });

    // Defaults de seguridad: evitar valores "undefined" que Cuentti rechaza
    headers['x-auth-token-id-usuario'] = headers['x-auth-token-id-usuario'] || req.headers['x-auth-token-id-usuario'] || '1';
    headers['x-auth-token-usuario'] = headers['x-auth-token-usuario'] || req.headers['x-auth-token-usuario'] || '1';
    headers['x-id-empleado'] = headers['x-id-empleado'] || req.headers['x-id-empleado'] || '1';

    const options = { method: req.method, headers };
    if (req.body && (req.method === 'POST' || req.method === 'PUT')) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(cuenttiUrl, options);
    const data = await response.text();
    if (!response.ok) {
      // Devolver cuerpo y headers para poder diagnosticar desde el frontend
      let parsed
      try { parsed = JSON.parse(data) } catch { parsed = null }
      return res.status(response.status).json({
        status: response.status,
        body: data,
        json: parsed,
        headers: Object.fromEntries(response.headers.entries()),
      })
    }
    res.status(response.status)
    try { res.json(JSON.parse(data)) } catch { res.send(data) }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal proxy error' });
  }
}
