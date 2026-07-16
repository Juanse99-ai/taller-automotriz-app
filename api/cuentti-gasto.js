// Backend: registra un GASTO en Cuentti desde la app (gasto de NÓMINA de los
// técnicos). El motor (login de sesión + payload) vive en api/_lib/gasto.js,
// compartido con la tool registrar_gasto del MCP.
//
// Sin idPlanCuentas → cuenta "Nomina" (43). Sin iva → 0. Es decir: el
// comportamiento histórico de la app no cambia.
//
// Requiere en Vercel (Sensitive): CUENTTI_USER (email) y CUENTTI_PASS (clave).

import { login, enviarGasto, TIPO_PERSONA_NATURAL } from './_lib/gasto.js'

const ALLOWED_ORIGINS = [
  'https://taller-multias.vercel.app',
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1])
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  // Modo prueba: GET → solo hace login y confirma que consiguió el token (NO graba gasto).
  if (req.method === 'GET') {
    try {
      const { token, idUsuario } = await login()
      res.status(200).json({ ok: true, login: 'OK', hasToken: !!token, tokenPrefix: (token || '').slice(0, 10), idUsuario })
    } catch (e) {
      res.status(500).json({ ok: false, login: 'FALLO', error: e.message })
    }
    return
  }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Solo POST' }); return }

  try {
    const { proveedorCedula, monto } = req.body || {}
    if (!proveedorCedula || !monto) { res.status(400).json({ ok: false, error: 'Falta proveedorCedula o monto' }); return }
    // El monto debe ser positivo: un negativo grabaría un gasto invertido.
    const montoNum = Math.round(parseFloat(monto) || 0)
    if (!(montoNum > 0)) { res.status(400).json({ ok: false, error: 'El monto debe ser mayor a 0' }); return }

    // La nomina siempre es un empleado => persona natural. Se fija aqui para que
    // la deduccion por NIT/nombre no aplique y el payload historico no cambie.
    const r = await enviarGasto({ tipoPersona: TIPO_PERSONA_NATURAL, ...req.body })
    if (!r.ok) { res.status(502).json({ ok: false, cuentti: r.cuentti }); return }
    res.status(200).json({ ok: true, idTransacion: r.idTransacion, numeroDoc: r.numeroDoc })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
