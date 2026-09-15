// Proveedores de Cuentti: resolucion segura por NIT. Lo usan el MCP de Cuentti
// (facturar, compras, gastos) y api/cuentti-gasto.js (los gastos de la app).
//
// En Colombia el NIT de una empresa es <numero>-<DV> (ej. 902045058-2) y Cuentti
// guarda SOLO el numero, sin el digito de verificacion (el campo se llama
// literalmente "Identificacion sin digito de verificacion"). Las facturas lo
// imprimen pegado (9020450582), asi que si se manda tal cual NO calza con el
// proveedor que ya existe y el endpoint lo CREA duplicado, en silencio.
// Por eso nunca se manda id_cliente:-1 a ciegas: primero se resuelve.
//
// Quien llama puede pasar su propia funcion `pedir(path)` (el MCP usa la suya,
// con su timeout y su manejo de errores); sin ella se pide con la llave del API.

/* global process */

const BASE = process.env.CUENTTI_BASE_URL || 'https://app.cuenti.com'
const EMPLEADO = process.env.CUENTTI_EMPLOYEE_ID || '2'

async function pedirConToken(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CUENTTI_TOKEN || ''}`,
        'x-auth-token-empresa': process.env.CUENTTI_COMPANY_ID || '11464',
        'x-id-sucursal': process.env.CUENTTI_BRANCH_ID || '1',
        'x-id-empleado': EMPLEADO,
        'X-Auth-Token-id-usuario': EMPLEADO,
        'X-Auth-Token-usuario': EMPLEADO,
        'x-gtm': process.env.CUENTTI_GTM || 'GMT-0500',
        usuario: EMPLEADO,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!r.ok) throw new Error(`Cuentti ${r.status}`)
    const text = await r.text()
    try { return JSON.parse(text) } catch { return text }
  } finally {
    clearTimeout(timer)
  }
}

// Candidatos a probar, en orden: como viene y sin el DV.
export function candidatosNit(nit) {
  const limpio = String(nit || '').replace(/\D/g, '')
  const cands = [limpio]
  // 10+ digitos en un NIT empresarial = numero + DV pegado.
  if (limpio.length >= 10) cands.push(limpio.slice(0, -1))
  return [...new Set(cands.filter(Boolean))]
}

export async function buscarClienteCuentti(ident, pedir = pedirConToken) {
  const data = await pedir(`/jServerj4ErpPro/api/token/consultarClienteIdentificacion/${encodeURIComponent(ident)}`).catch(() => null)
  if (!data || data.message || data.type === 0) return null
  const items = Array.isArray(data) ? data : (data?.data ? data.data : [data])
  const c = items.find(r => r && Object.keys(r).length > 0 && !r.message)
  if (!c) return null
  const id = parseInt(c.id_cliente || c.id, 10)
  if (!id) return null
  return {
    id,
    identificacion: String(c.identificacion || ident),
    nombre: c.nombre_cliente
      || [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')
      || '',
    activo: Number(c.es_activo) === 1, // llega como numero, no como texto
    tipoPersona: Number(c.id_tipo_persona) || null,
  }
}

// Devuelve el proveedor existente { id, identificacion, nombre, viaDV, ... } o null.
// Se prueba el NIT tal como viene ANTES que sin el DV: una cedula de 10 digitos es
// legitima, y recortarla de entrada podria pegar con OTRA persona.
//
// Desempate por estado: Cuentti NO borra de verdad — la X deja el registro con
// es_activo 0 y consultarClienteIdentificacion lo sigue devolviendo. Asi que un
// inactivo casi siempre es un duplicado ya descartado y el ACTIVO gana. Sin esto
// un NIT con un duplicado muerto quedaria bloqueado para siempre.
// Solo se aborta si hay dos o mas ACTIVOS: ahi si tiene que elegir un humano.
export async function resolverProveedor(nit, pedir = pedirConToken) {
  const cands = candidatosNit(nit)
  const hits = []
  for (const c of cands) {
    const hit = await buscarClienteCuentti(c, pedir)
    if (hit && !hits.some(h => h.id === hit.id)) hits.push({ ...hit, viaDV: c !== cands[0] })
  }
  if (!hits.length) return null

  const activos = hits.filter(h => h.activo)
  if (activos.length === 1) return { ...activos[0], descartados: hits.filter(h => !h.activo) }
  if (activos.length > 1) return { ...activos[0], ambiguo: activos }
  // Ninguno activo: se reusa igual. Reciclar un inactivo es mejor que crear otro duplicado.
  return { ...hits[0], inactivo: true, ambiguo: hits.length > 1 ? hits : null }
}
