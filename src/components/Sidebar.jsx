const ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  recepcion: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1"/>
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>
      <path d="m9 14 2 2 4-4"/>
    </svg>
  ),
  trabajos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  mecanicos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  cotizaciones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  ),
  inventario: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  liquidacion: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  ),
  reportes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
      <line x1="2"  y1="20" x2="22" y2="20"/>
    </svg>
  ),
  cuentti: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9"  x2="8" y2="9"/>
    </svg>
  ),
}

const NAV = [
  { group: 'Principal', items: [
    { key: 'dashboard',   label: 'Dashboard' },
    { key: 'recepcion',   label: 'Recepcion' },
    { key: 'trabajos',    label: 'Trabajos' },
    { key: 'mecanicos',   label: 'Mecanicos' },
  ]},
  { group: 'Operaciones', items: [
    { key: 'cotizaciones', label: 'Cotizaciones' },
    { key: 'inventario',   label: 'Inventario' },
  ]},
  { group: 'Gestion', items: [
    { key: 'liquidacion', label: 'Liquidacion' },
    { key: 'reportes',    label: 'Reportes' },
    { key: 'cuentti',     label: 'Cuentti' },
  ]},
]

export default function Sidebar({ active, onNavigate, isOpen, collapsed, onToggleCollapse }) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">
          <img src="/logo.png" alt="MDA" className="sidebar-logo" />
        </div>
        {!collapsed && (
          <div className="sidebar-brand-text">
            <h1>MDA</h1>
            <p>Multidiagnosticos AS</p>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {NAV.map(g => (
          <div key={g.group}>
            {!collapsed && <div className="nav-group-title">{g.group}</div>}
            {g.items.map(item => (
              <div
                key={item.key}
                className={`nav-item ${active === item.key ? 'active' : ''}`}
                onClick={() => onNavigate(item.key)}
                title={collapsed ? item.label : undefined}
              >
                {ICONS[item.key]}
                {!collapsed && <span>{item.label}</span>}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title={collapsed ? 'Expandir' : 'Colapsar'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <div className="sidebar-footer">{collapsed ? 'v1.0' : 'Taller Automotriz v1.0'}</div>
    </aside>
  )
}
