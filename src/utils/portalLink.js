// Helpers para generar y compartir el link del Portal del Cliente.
// Patron: tudominio.com/portal?c=<cedula>

export function portalLink(cedula) {
  const limpia = String(cedula || '').replace(/[.\-\s]/g, '')
  const base = `${window.location.origin}/portal`
  return limpia ? `${base}?c=${encodeURIComponent(limpia)}` : base
}

export function mensajeWhatsApp(cliente, cedula) {
  const link = portalLink(cedula)
  const nombre = cliente ? cliente.split(' ')[0] : 'cliente'
  return `Hola ${nombre}! Te comparto el link para que sigas el estado de tu vehiculo en Multidiagnosticos AS:\n\n${link}\n\nYa esta autenticado con tu cedula, solo entra y veras el progreso, las inspecciones y el historial.`
}

export function enviarPortalWhatsApp(telefono, cliente, cedula) {
  const tel = String(telefono || '').replace(/[^\d]/g, '')
  // Si no tiene codigo pais, asumir Colombia (+57)
  const telConCodigo = tel.length === 10 ? `57${tel}` : tel
  const msg = mensajeWhatsApp(cliente, cedula)
  const url = telConCodigo
    ? `https://wa.me/${telConCodigo}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank')
}

export async function copiarPortalLink(cedula) {
  const link = portalLink(cedula)
  try {
    await navigator.clipboard.writeText(link)
    return true
  } catch {
    return false
  }
}

export function portalQR(cedula, size = 220) {
  const link = portalLink(cedula)
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(link)}&margin=10`
}
