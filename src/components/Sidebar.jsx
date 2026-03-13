const NAV = [
  { group: 'Principal', items: [
    { key: 'dashboard', icon: '📊', label: 'Dashboard' },
    { key: 'recepcion', icon: '📋', label: 'Recepcion' },
    { key: 'trabajos', icon: '🔧', label: 'Trabajos' },
    { key: 'mecanicos', icon: '👨‍🔧', label: 'Mecanicos' },
  ]},
  { group: 'Operaciones', items: [
    { key: 'cotizaciones', icon: '💰', label: 'Cotizaciones' },
    { key: 'inventario', icon: '📦', label: 'Inventario' },
  ]},
  { group: 'Gestion', items: [
    { key: 'liquidacion', icon: '📝', label: 'Liquidacion' },
    { key: 'reportes', icon: '📈', label: 'Reportes' },
    { key: 'cuentti', icon: '💼', label: 'Cuentti' },
  ]},
]

export default function Sidebar({ active, onNavigate, isOpen }) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <h1>MDA</h1>
        <p>Multidiagnosticos AS</p>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(g => (
          <div key={g.group}>
            <div className="nav-group-title">{g.group}</div>
            {g.items.map(item => (
              <div
                key={item.key}
                className={`nav-item ${active === item.key ? 'active' : ''}`}
                onClick={() => onNavigate(item.key)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
