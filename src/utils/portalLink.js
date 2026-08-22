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

// ── Recordatorio de una cotizacion que lleva dias sin respuesta ─────────────
// Medido en la base: 11 de 17 cotizaciones nunca recibieron respuesta y suman
// $13.417.500, cinco veces lo aprobado. No falta cotizar ni falta que el cliente
// pueda firmar (eso ya se hace desde el portal): falta el empujon.

// Marcas de que el "cliente" es una empresa y no una persona. Con estas, cortar
// por la primera palabra sale mal: "S & E INGENIERIA S.A.S" daria "Hola S!".
const EMPRESA = /\b(s\.?a\.?s|ltda|limitada|s\.?a|e\.?u|inc|corp|sociedad|en\s+c)\b|&/i

export function nombreParaSaludar(cliente) {
  const n = String(cliente || '').trim()
  if (!n) return 'cliente'
  if (EMPRESA.test(n)) return n            // a una empresa se la saluda entera
  const primera = n.split(/\s+/)[0]
  return primera.length >= 3 ? primera : n // ni "DE", ni "LA", ni iniciales sueltas
}

export function mensajeCotizacion(cot) {
  const nombre = nombreParaSaludar(cot?.cliente)
  const veh = [cot?.marca, cot?.modelo].filter(Boolean).join(' ')
  const placa = cot?.placa ? ` de placa ${cot.placa}` : ''
  const link = cot?.cedula ? portalLink(cot.cedula) : ''
  // Sin cedula el enlace del portal no lleva a NINGUNA cotizacion concreta, asi
  // que no se promete "apruebela aqui" y se pide la respuesta a secas. Medido:
  // 3 de las 11 pendientes no tienen cedula guardada.
  const cierre = link
    ? `Puede verla y aprobarla firmando aqui:\n${link}\n\n`
    : ''
  return `Hola ${nombre}! Le escribimos de Multidiagnosticos AS.\n\n`
    + `Le enviamos la cotizacion${veh ? ` para su ${veh}` : ''}${placa} y quedamos atentos a su respuesta.\n\n`
    + cierre
    + `Cualquier duda, por aqui mismo nos escribe.`
}

export function recordarCotizacionWhatsApp(cot) {
  const tel = String(cot?.telefonoCliente || '').replace(/[^\d]/g, '')
  const conCodigo = tel.length === 10 ? `57${tel}` : tel
  const msg = mensajeCotizacion(cot)
  // Sin numero se abre WhatsApp con el mensaje listo para elegir contacto. En
  // escritorio wa.me/?text sin numero da error, asi que se usa api.whatsapp.com.
  const url = conCodigo
    ? `https://wa.me/${conCodigo}?text=${encodeURIComponent(msg)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank', 'noopener')
}
