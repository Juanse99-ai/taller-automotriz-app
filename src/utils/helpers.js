// Formato moneda colombiana
export function fmt(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0)
}

// Formato fecha corta
export function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
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
  // Fallback: concatenar campos individuales de Cuentti
  const partes = [cliente?.primer_nombre, cliente?.segundo_nombre, cliente?.primer_apellido].filter(Boolean)
  return partes.length ? partes.join(' ').trim() : 'Sin nombre'
}

// Hoy en formato ISO corto (YYYY-MM-DD)
export function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}
