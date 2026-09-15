// Backend: registra un GASTO en Cuentti desde la app. Dos clases:
//   - la NÓMINA de los técnicos (Liquidación y Estado de cuenta), el uso de
//     siempre: sin idPlanCuentas → cuenta "Nomina" (43), sin iva → 0.
//   - tipo:'gasto', los de la pantalla Gastos (arriendo, servicios, sueltos):
//     ver registrarGastoDeLaApp.
// El motor (login de sesión + payload) vive en api/_lib/gasto.js, compartido
// con la tool registrar_gasto del MCP.
//
// Requiere en Vercel (Sensitive): CUENTTI_USER (email) y CUENTTI_PASS (clave).

import { randomUUID } from 'node:crypto'
import { login, enviarGasto, inferirTipoPersona, TIPO_PERSONA_NATURAL, ID_IVA_19 } from './_lib/gasto.js'
import { resolverProveedor } from './_lib/proveedor.js'
import { sesionDeLaPeticion } from './_lib/sesion.js'

const ALLOWED_ORIGINS = [
  'https://taller-multias.vercel.app',
  'https://taller-automotriz-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

// Bitácora en Supabase (misma que usa el MCP) para idempotencia: si un reintento
// tras timeout re-envía el mismo gasto, se detecta por la clave (idemKey, ej. el
// id de la liquidación LQ-...) y NO se graba dos veces.
import { SUPABASE_URL as SB_URL, SUPABASE_HEAD as SB_HEAD } from './_lib/supabase.js'

// Los ANULADOS no cuentan (igual que en el MCP): un gasto anulado en Cuentti y
// vuelto a registrar es el mismo gasto, no un duplicado.
async function buscarPorIdemKey(idemKey) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/gastos_registrados?numero_factura=eq.${encodeURIComponent(idemKey)}&anulado_en=is.null&select=id_transacion,numero_doc&limit=1`, { headers: SB_HEAD })
    if (!r.ok) return null
    const rows = await r.json()
    return Array.isArray(rows) && rows.length ? rows[0] : null
  } catch { return null }
}
async function guardarEnBitacora(fila) {
  try {
    // `id` va aqui porque la columna es NOT NULL y no tiene default. Sin el,
    // Supabase rechazaba CADA fila y el error se tragaba: las 48 nominas
    // registradas en Cuentti desde Liquidacion (jul-sep 2026) no dejaron ni una
    // en la bitacora, y el anti-doble de arriba nunca encontro nada.
    const r = await fetch(`${SB_URL}/rest/v1/gastos_registrados`, {
      method: 'POST', headers: { ...SB_HEAD, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ id: randomUUID(), ...fila }),
    })
    if (!r.ok) console.error('bitacora gastos_registrados:', r.status, (await r.text()).slice(0, 300))
  } catch { /* no-fatal: el gasto ya se creó en Cuentti */ }
}

const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())

// Mismos ids que registrar_gasto del MCP: efectivo sale de Caja General,
// transferencia de Bancolombia.
const MEDIOS = {
  efectivo: { idMedioPago: 1, idBanco: 1 },
  transferencia: { idMedioPago: 7, idBanco: 2 },
}

// ── Gasto de la pantalla Gastos ──────────────────────────────────────────
// Distinto de la nomina en tres cosas:
//   - el tercero es un proveedor que TIENE que existir en Cuentti: se resuelve
//     por NIT como registrar_gasto (api/_lib/proveedor.js), porque mandarlo sin
//     resolver crea un proveedor duplicado en silencio;
//   - la cuenta contable la trae el gasto;
//   - el metodo de pago es obligatorio: decide contra que caja o banco entra.
// La clave (gasto:<gasto fijo>:<mes> o gasto:<id>) la arma la app; con ella un
// reintento tras un corte de red devuelve el documento que ya existe.
async function registrarGastoDeLaApp(b, res) {
  const nit = String(b.proveedorNit || '').replace(/\D/g, '')
  const monto = Math.round(parseFloat(b.monto) || 0)
  const cuenta = parseInt(b.idPlanCuentas, 10)
  const medio = MEDIOS[b.metodoPago]
  const clave = String(b.idemKey || '').trim()
  const iva = parseFloat(b.iva) === 19 ? 19 : 0
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha || '')) ? b.fecha : hoyBogota()
  const concepto = String(b.concepto || '').trim().slice(0, 120)

  if (!nit) { res.status(400).json({ ok: false, error: 'Falta el NIT o la cédula del proveedor' }); return }
  if (!(monto > 0)) { res.status(400).json({ ok: false, error: 'El monto debe ser mayor a 0' }); return }
  if (!(cuenta > 0)) { res.status(400).json({ ok: false, error: 'Falta la cuenta de Cuentti' }); return }
  if (!medio) { res.status(400).json({ ok: false, error: 'Elige efectivo o transferencia' }); return }
  if (!/^gasto:[\w-]{3,60}(:\d{4}-\d{2})?$/.test(clave)) { res.status(400).json({ ok: false, error: 'Falta la clave del gasto' }); return }
  if (!concepto) { res.status(400).json({ ok: false, error: 'Falta el concepto' }); return }

  const previo = await buscarPorIdemKey(clave)
  if (previo) { res.status(200).json({ ok: true, dedup: true, idTransacion: previo.id_transacion, numeroDoc: previo.numero_doc }); return }

  const prov = await resolverProveedor(nit)
  if (!prov) {
    res.status(409).json({ ok: false, codigo: 'PROVEEDOR_NO_EXISTE', error: `No hay ningún proveedor con el NIT ${nit} en Cuentti. Revisa el número (va sin dígito de verificación) o créalo primero en Cuentti.` })
    return
  }
  if (prov.ambiguo) {
    res.status(409).json({
      ok: false, codigo: 'PROVEEDOR_DUPLICADO',
      error: `El NIT ${nit} está ${prov.ambiguo.length} veces en Cuentti (${prov.ambiguo.map(h => `${h.nombre || 'sin nombre'} · ${h.identificacion}`).join('; ')}). Deja uno solo en Cuentti y vuelve a intentar.`,
    })
    return
  }

  const r = await enviarGasto({
    proveedorId: prov.id,
    proveedorCedula: prov.identificacion,
    proveedorNombre: prov.nombre || String(b.proveedorNombre || ''),
    tipoPersona: prov.tipoPersona || inferirTipoPersona(prov.identificacion, prov.nombre),
    monto, iva, idImpuesto: ID_IVA_19,
    idPlanCuentas: cuenta,
    descripcion: concepto,
    nota: String(b.nota || concepto).slice(0, 200),
    idMedioPago: medio.idMedioPago, idBanco: medio.idBanco,
    fecha,
  })
  if (!r.ok) { res.status(502).json({ ok: false, cuentti: r.cuentti }); return }
  await guardarEnBitacora({
    proveedor_nit: prov.identificacion, proveedor_nombre: prov.nombre || '', proveedor_id: prov.id,
    numero_factura: clave, id_plan_cuentas: cuenta, concepto, fecha, total: monto, iva,
    id_transacion: String(r.idTransacion || ''), numero_doc: String(r.numeroDoc || ''),
  })
  res.status(200).json({ ok: true, idTransacion: r.idTransacion, numeroDoc: r.numeroDoc, proveedor: { id: prov.id, nombre: prov.nombre, identificacion: prov.identificacion } })
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1])
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sesion')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  // Graba plata en Cuentti con las credenciales del negocio: solo con sesion de
  // admin (la nomina es suya). Antes el POST y el GET de prueba (que ademas
  // devolvia el inicio del token) respondian a cualquiera.
  const ses = sesionDeLaPeticion(req)
  if (!ses) { res.status(401).json({ ok: false, error: 'Sesion requerida' }); return }
  if (ses.r !== 'admin') { res.status(403).json({ ok: false, error: 'Solo el administrador' }); return }

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

  if (req.body?.tipo === 'gasto') {
    try { await registrarGastoDeLaApp(req.body, res) } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
    return
  }

  try {
    const { proveedorCedula, monto, idemKey } = req.body || {}
    if (!proveedorCedula || !monto) { res.status(400).json({ ok: false, error: 'Falta proveedorCedula o monto' }); return }
    // El monto debe ser positivo: un negativo grabaría un gasto invertido.
    const montoNum = Math.round(parseFloat(monto) || 0)
    if (!(montoNum > 0)) { res.status(400).json({ ok: false, error: 'El monto debe ser mayor a 0' }); return }

    // Idempotencia: si ya se registró un gasto con esta clave (reintento tras
    // timeout), devolver el existente en vez de grabar doble.
    if (idemKey) {
      const previo = await buscarPorIdemKey(idemKey)
      if (previo) { res.status(200).json({ ok: true, dedup: true, idTransacion: previo.id_transacion, numeroDoc: previo.numero_doc }); return }
    }

    // La nomina siempre es un empleado => persona natural. Se fija aqui para que
    // la deduccion por NIT/nombre no aplique y el payload historico no cambie.
    const r = await enviarGasto({ tipoPersona: TIPO_PERSONA_NATURAL, ...req.body })
    if (!r.ok) { res.status(502).json({ ok: false, cuentti: r.cuentti }); return }
    // Registrar en la bitácora para que un reintento futuro con la misma clave no re-grabe.
    if (idemKey) {
      await guardarEnBitacora({
        proveedor_nit: String(proveedorCedula).trim(), proveedor_nombre: req.body.proveedorNombre || '',
        numero_factura: String(idemKey).trim(), concepto: req.body.nota || 'Nómina',
        total: montoNum, id_transacion: String(r.idTransacion || ''), numero_doc: String(r.numeroDoc || ''),
      })
    }
    res.status(200).json({ ok: true, idTransacion: r.idTransacion, numeroDoc: r.numeroDoc })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
