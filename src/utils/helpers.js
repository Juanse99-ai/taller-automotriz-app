// Cantidad de una línea de la OT/cotización. ACEPTA DECIMALES: media silicona
// es 0,5. Regla ÚNICA para toda la app — antes cada pantalla hacía
// `parseInt(i.cantidad) || 1`, que convertía 0,5 en 1: la app cobraba el tubo
// entero mientras Cuentti facturaba la mitad (su payload sí usa parseFloat), y
// los dos totales no cuadraban. Un valor vacío, cero o inválido vale 1.
export function cantidadItem(i) {
  // La coma se acepta como separador decimal: en Colombia media unidad se
  // escribe "0,5", y parseFloat("0,5") daba 0 → la línea se cobraba entera.
  const crudo = typeof i?.cantidad === 'string' ? i.cantidad.replace(',', '.') : i?.cantidad
  const n = parseFloat(crudo)
  // Cero o vacío valen 1 a propósito: es preferible cobrar una unidad a dejar
  // una línea en $0 sin que nadie se dé cuenta.
  return Number.isFinite(n) && n > 0 ? n : 1
}

// Cantidad para MOSTRAR: entera se ve "2", fraccionaria se ve "0,5" (coma, como
// se escriben los decimales en Colombia). Sin ceros de relleno.
export function fmtCant(v) {
  const n = typeof v === 'object' ? cantidadItem(v) : (parseFloat(v) || 0)
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-CO', { maximumFractionDigits: 3 })
}

// Total de una línea en pesos enteros. El peso no usa centavos y una cantidad
// decimal puede dar fracciones (0,5 × $30.001), así que se redondea aquí.
export function totalLinea(i) {
  return Math.round((parseFloat(i?.precio) || 0) * cantidadItem(i))
}

// Formato moneda colombiana
export function fmt(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0)
}

// Formato moneda compacto para numeros grandes (tarjetas metricas)
export function fmtCompact(n) {
  const val = Math.abs(n || 0)
  if (val >= 1_000_000_000) return `$ ${(n / 1_000_000_000).toFixed(1)}B`
  if (val >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(1)}M`
  return fmt(n)
}

// Normaliza un telefono (quita ".0" final, espacios, decimales accidentales).
// Casos reales en BD: "3135067577.0" cuando se guardo como number; "  315 ...  ";
// "315.0" o "315,0". Devuelve solo los digitos del numero, preservando el "+" inicial si existe.
export function fmtTelefono(t) {
  if (t === null || t === undefined) return ''
  let s = t.toString().trim()
  if (!s) return ''
  // Si vino como float "3135067577.0" o "3135067577.00" → recorta el .000…
  s = s.replace(/[.,]\d+$/, '')
  // Si quedan mas decimales raros (ej "3,135,067,577") los quitamos pero
  // preservamos un + inicial para internacionales.
  const plus = s.startsWith('+') ? '+' : ''
  s = plus + s.replace(/[^\d]/g, '')
  return s
}

// Enlace wa.me con mensaje pre-cargado. Normaliza el número colombiano
// (10 dígitos → +57). Devuelve null si no hay teléfono.
export function whatsappLink(tel, mensaje = '') {
  if (!tel) return null
  const limpio = tel.toString().replace(/[.,]\d+$/, '').replace(/\D/g, '')
  if (!limpio) return null
  const num = limpio.length === 10 ? `57${limpio}` : limpio
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}

// Formato fecha corta
export function fmtDate(iso) {
  if (!iso) return '—'
  // Fecha sin hora (YYYY-MM-DD): tomarla como LOCAL, no UTC. Si no, new Date la
  // interpreta como medianoche UTC y en Colombia (UTC-5) muestra el día anterior.
  const m = typeof iso === 'string' && iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Formato fecha completa
export function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Generar ID unico
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// Parsear monto de input (acepta puntos, comas, etc)
export function parseMonto(valor) {
  if (!valor) return 0
  const limpio = valor.toString().replace(/[^\d]/g, '')
  return limpio ? parseInt(limpio, 10) : 0
}

// Escape HTML para prevenir XSS
export function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Normalizar documento de cliente (busca en multiples campos)
export function normalizarDoc(cliente) {
  return (
    cliente?.cedula || cliente?.identificacion || cliente?.documento ||
    cliente?.identification_number || cliente?.nit || cliente?.id_cedula ||
    cliente?.numero_documento || ''
  ).toString().trim()
}

// Normalizar nombre de cliente
export function normalizarNombre(cliente) {
  const nombre = cliente?.nombre_cliente || cliente?.nombre || cliente?.name ||
    cliente?.full_name || cliente?.razon_social || cliente?.tercero || ''
  if (nombre) return nombre.toString().trim()
  // Fallback: concatenar campos individuales de Cuentti (busca en raiz y en _raw)
  const raw = cliente?._raw
  const partes = [
    cliente?.primer_nombre || raw?.primer_nombre,
    cliente?.segundo_nombre || raw?.segundo_nombre,
    cliente?.primer_apellido || raw?.primer_apellido,
    cliente?.segundo_apellido || raw?.segundo_apellido,
  ].filter(Boolean)
  return partes.length ? partes.join(' ').trim() : 'Sin nombre'
}

// Hoy en formato ISO corto (YYYY-MM-DD)
export function hoyISO() {
  // Fecha local de HOY (no UTC): evita que en la tarde/noche de Colombia
  // (UTC-5) la fecha salte al día siguiente.
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Los nombres llegan de Cuentti EN MAYÚSCULA SOSTENIDA y así gritan en pantalla.
// Se pasan a mayúscula inicial dejando intactas las siglas jurídicas y cualquier
// palabra con punto (S.A.S., Cía.). Vivía duplicado en PortalCliente y
// Liquidación, y las copias ya habían divergido.
export function tituloCliente(s) {
  return String(s || '').trim().split(/\s+/).map(w => {
    if (/\./.test(w) || /^(sas|sa|ltda|cia|eu)$/i.test(w)) return w.toUpperCase()
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}
