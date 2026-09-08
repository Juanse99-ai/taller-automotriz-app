// Miniatura del carro de una OT.
//
// Las fotos de ingreso se guardan desde hace meses y ninguna lista las mostraba:
// para saber cual es el carro habia que abrir la orden. Con la miniatura se
// reconoce antes de leer la placa, que es como funciona en el mostrador.
//
// Sale la PRIMERA foto de ingreso. Si esa OT no trae fotos en memoria (las viejas
// que solo estan en cache aligerado, o las que nunca tuvieron), se pinta un hueco
// callado del mismo tamaño: sin el, las filas se desalinean segun quien tenga foto.
//
//   trabajo  la OT
//   tam      lado en px (34 en la tarjeta del tablero, 44 en el detalle)
export default function FotoOT({ trabajo, tam = 34 }) {
  const foto = (trabajo?.evidenciasIngreso || []).find(e => e?.tipo !== 'video' && (e?.url || e?.dataUrl))
  const src = foto?.url || foto?.dataUrl
  const estilo = { width: tam, height: tam, borderRadius: Math.round(tam * 0.27) }

  if (!src) {
    return (
      <span className="fotoot fotoot--vacia" style={estilo} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13" />
          <path d="M3 13h18v4H3zM6.5 17v1.5M17.5 17v1.5" />
        </svg>
      </span>
    )
  }

  return (
    <img
      className="fotoot"
      src={src}
      alt={`Foto de ingreso de ${trabajo?.placa || trabajo?.otCodigo || 'la orden'}`}
      loading="lazy"
      decoding="async"
      style={estilo}
    />
  )
}
