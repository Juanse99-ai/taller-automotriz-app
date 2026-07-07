// Tarjeta del sistema. Envuelve .card de index.css. Opcionalmente pinta un
// encabezado (.card-title con icono) y una zona de acciones a la derecha.
//   title/icon: encabezado de la tarjeta
//   actions:    nodos a la derecha del titulo (botones, filtros)
//   pad:        padding del cuerpo en px (18 por defecto; 0 = sin padding, p.ej. para tablas a sangre)
export default function Card({ title, icon, actions, children, pad = 18, className = '', style, bodyStyle, ...rest }) {
  const hasHeader = title != null || actions != null
  const p = Number(pad) || 0
  return (
    <div className={`card ${className}`.trim()} style={style} {...rest}>
      {hasHeader && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: p ? `${p}px ${p}px 0` : 0 }}>
          {title != null ? <h3 className="card-title" style={{ marginBottom: 0 }}>{icon}{title}</h3> : <span />}
          {actions != null && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: p ? (hasHeader ? `12px ${p}px ${p}px` : `${p}px`) : 0, ...bodyStyle }}>
        {children}
      </div>
    </div>
  )
}
