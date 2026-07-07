// Barra de acciones / cabecera de seccion: contenido a la izquierda (titulo,
// filtros, buscador) y acciones a la derecha (botones). Reemplaza el patron de
// flex + space-between que se repite inline en muchas pantallas.
export default function Toolbar({ left, right, children, className = '', style }) {
  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', ...style }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
        {left ?? children}
      </div>
      {right != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{right}</div>
      )}
    </div>
  )
}
