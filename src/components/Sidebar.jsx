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
  inspecciones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  mecanicos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  clientes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  vehiculos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
      <circle cx="6.5" cy="16.5" r="2.5"/>
      <circle cx="16.5" cy="16.5" r="2.5"/>
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
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
}

// Estructura de navegacion en grupos (segun prototipo)
const NAV = [
  { group: 'Principal', items: [
    { key: 'dashboard',   label: 'Dashboard' },
  ]},
  { group: 'Operacion', items: [
    { key: 'recepcion',    label: 'Recepcion' },
    { key: 'trabajos',     label: 'Trabajos' },
    { key: 'inspecciones', label: 'Inspecciones' },
    { key: 'mecanicos',    label: 'Mecanicos' },
  ]},
  { group: 'Gestion', items: [
    { key: 'clientes',  label: 'Clientes' },
    { key: 'vehiculos', label: 'Vehiculos' },
  ]},
  { group: 'Facturacion', items: [
    { key: 'cotizaciones', label: 'Cotizaciones' },
    { key: 'inventario',   label: 'Inventario' },
    { key: 'liquidacion',  label: 'Liquidacion' },
  ]},
  { group: 'Analisis', items: [
    { key: 'reportes', label: 'Reportes' },
    { key: 'cuentti',  label: 'Cuentti' },
  ]},
]

export default function Sidebar({ active, onNavigate, isOpen, collapsed, onCollapse, seccionesPermitidas, user, onLogout, trabajos = [] }) {
  const allowed = seccionesPermitidas || []

  // Pill rojo en Trabajos: pendientes + en progreso (alerta de carga del taller)
  const pendientes = trabajos.filter(t => t.estado === 'Pendiente' || t.estado === 'En Diagnostico').length
  const enProgreso = trabajos.filter(t => t.estado === 'En Progreso' || t.estado === 'Esperando Repuestos' || t.estado === 'En Prueba').length
  const pillCounts = { trabajos: pendientes + enProgreso || 0 }

  const inicial = (user?.nombre || user?.usuario || '?')[0].toUpperCase()
  const rolLabel = user?.rol === 'admin' ? 'Administrador' : 'Jefe de taller'

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar__brand">
        <div className="logo">
          <img src="/logo.png" alt="MDA" />
        </div>
        <div className="wm">
          <div className="n">Multidiagnosticos</div>
          <div className="s">AS · Taller</div>
        </div>
        <button
          className="sidebar__collapse"
          onClick={onCollapse}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          aria-label="Colapsar menú"
        >
          {collapsed
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          }
        </button>
      </div>

      <nav className="sidebar__nav">
        {NAV.map(g => {
          const visible = g.items.filter(item => allowed.includes(item.key))
          if (!visible.length) return null
          return (
            <div key={g.group}>
              <div className="sidebar__group">{g.group}</div>
              {visible.map(item => (
                <a
                  key={item.key}
                  className={`navlink ${active === item.key ? 'active' : ''}`}
                  onClick={() => onNavigate(item.key)}
                >
                  {ICONS[item.key]}
                  <span>{item.label}</span>
                  {pillCounts[item.key] > 0 && <span className="pill">{pillCounts[item.key]}</span>}
                </a>
              ))}
            </div>
          )
        })}
      </nav>

      {user && (
        <div className="sidebar__foot">
          <div className="av">{inicial}</div>
          <div className="me">
            <div className="n">{user.nombre || user.usuario}</div>
            <div className="r">{rolLabel}</div>
          </div>
          <button className="icobtn" onClick={onLogout} title="Cerrar sesion" style={{ color: 'rgba(255,255,255,.45)' }}>
            {ICONS.logout}
          </button>
        </div>
      )}
    </aside>
  )
}
