import crypto from 'node:crypto';

const ALLOWED_ORIGINS = [
  'https://taller-multias.vercel.app',
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

// Firma de integridad de Wompi = SHA256(referencia + montoCentavos + moneda [+ expiracion] + secreto).
// Verificada contra el vector del PDF de Wompi. El secreto (WOMPI_INTEGRITY_SECRET)
// vive SOLO en el servidor: si se calculara en el navegador se expondría.
function wompiFirmaIntegridad({ referencia, montoCentavos, moneda, secreto, expiracion }) {
  const cadena = expiracion
    ? `${referencia}${montoCentavos}${moneda}${expiracion}${secreto}`
    : `${referencia}${montoCentavos}${moneda}${secreto}`;
  return crypto.createHash('sha256').update(cadena, 'utf8').digest('hex');
}

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

  // === Wompi: firma de integridad para armar el checkout (server-side) ===
  // El navegador pide la firma con { referencia, montoCentavos }; el secreto
  // nunca sale de aquí. Devuelve también la llave pública (esa sí es pública).
  if (req.query.wompi === 'firma') {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return; }
    const secreto = process.env.WOMPI_INTEGRITY_SECRET;
    if (!secreto) { res.status(500).json({ error: 'Falta WOMPI_INTEGRITY_SECRET en el servidor' }); return; }
    const { referencia, montoCentavos, expiracion } = req.body || {};
    const monto = Math.round(Number(montoCentavos) || 0);
    if (!referencia || !(monto > 0)) { res.status(400).json({ error: 'Falta referencia o montoCentavos > 0' }); return; }
    const moneda = 'COP';
    const firma = wompiFirmaIntegridad({ referencia, montoCentavos: monto, moneda, secreto, expiracion });
    res.status(200).json({
      ok: true, firma, referencia, montoCentavos: monto, moneda,
      publicKey: process.env.WOMPI_PUBLIC_KEY || '',
      checkoutUrl: 'https://checkout.wompi.co/p/',
    });
    return;
  }

  try {
    const path = req.query.path || '';
    if (!path.startsWith('/jServerj4ErpPro/')) { res.status(400).json({ error: 'Invalid API path' }); return; }

    const baseUrl = 'https://app.cuenti.com';
    const cuenttiUrl = new URL(path, baseUrl).toString();

    // El token lo pone el SERVIDOR, nunca el navegador.
    //
    // Antes viajaba hardcodeado en el bundle del frontend y este proxy solo lo
    // reenviaba: cualquiera que abriera la app podia leerlo con DevTools y
    // facturar o anular en el ERP por su cuenta. Ahora sale de la variable de
    // entorno y las credenciales que mande el cliente se IGNORAN a proposito
    // (si se reenviaran, seguiria sirviendo mandar un token propio).
    const token = process.env.CUENTTI_TOKEN;
    if (!token) {
      // Fallar claro y temprano: sin esto Cuentti responde 401 y el error real
      // (falta la env var) queda enterrado en la respuesta del ERP.
      console.error('Proxy Cuentti: falta la variable de entorno CUENTTI_TOKEN');
      return res.status(500).json({ error: 'Cuentti no esta configurado en el servidor (falta CUENTTI_TOKEN)' });
    }

    const empleado = process.env.CUENTTI_EMPLOYEE_ID || '2'; // 2 = cajero con la caja abierta
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-auth-token-empresa': process.env.CUENTTI_COMPANY_ID || '11464',
      'x-id-sucursal': process.env.CUENTTI_BRANCH_ID || '1',
      'x-id-empleado': empleado,
      'X-Auth-Token-id-usuario': empleado,
      'X-Auth-Token-usuario': empleado,
      'x-gtm': process.env.CUENTTI_GTM || 'GMT-0500',
      'usuario': empleado,
    };

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
