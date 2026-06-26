import { motion, useReducedMotion } from 'motion/react'
import { useState, useEffect, useRef } from 'react'

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
  usuarios: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M4 21v-2a4 4 0 0 1 3-3.87"/>
      <circle cx="12" cy="7" r="4"/>
      <path d="M12 11v0"/>
    </svg>
  ),
  crm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M9 11h.01"/><path d="M13 11h.01"/><path d="M17 11h.01"/>
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
  { group: 'Operación', items: [
    { key: 'recepcion',    label: 'Recepción' },
    { key: 'trabajos',     label: 'Trabajos' },
    { key: 'inspecciones', label: 'Inspecciones' },
    { key: 'mecanicos',    label: 'Mecánicos' },
  ]},
  { group: 'Gestión', items: [
    { key: 'clientes',  label: 'Clientes' },
    { key: 'vehiculos', label: 'Vehículos' },
    { key: 'crm',       label: 'CRM' },
  ]},
  { group: 'Facturación', items: [
    { key: 'cotizaciones', label: 'Cotizaciones' },
    { key: 'inventario',   label: 'Inventario' },
    { key: 'liquidacion',  label: 'Liquidación' },
  ]},
  { group: 'Análisis', items: [
    { key: 'reportes', label: 'Reportes' },
    { key: 'cuentti',  label: 'Cuentti' },
  ]},
  { group: 'Sistema', items: [
    { key: 'usuarios', label: 'Usuarios' },
  ]},
]

// Animacion del menu: entrada con resorte (spring) escalonada, SOLO en mobile (drawer).
// En desktop el sidebar es fijo => render directo en 'open' sin animar.
const navContainer = {
  open: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
  closed: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
}
const itemSpring = {
  open: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 500, damping: 24 } },
  closed: { x: -28, opacity: 0, transition: { type: 'spring', stiffness: 600, damping: 30 } },
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width:960px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width:960px)')
    const fn = (e) => setMobile(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return mobile
}

export default function Sidebar({ active, onNavigate, isOpen, collapsed, onCollapse, seccionesPermitidas, user, onLogout, trabajos = [] }) {
  const allowed = seccionesPermitidas || []

  // Pill rojo en Trabajos: pendientes + en progreso (alerta de carga del taller)
  const pendientes = trabajos.filter(t => t.estado === 'Pendiente' || t.estado === 'En Diagnostico').length
  const enProgreso = trabajos.filter(t => t.estado === 'En Progreso' || t.estado === 'Esperando Repuestos' || t.estado === 'En Prueba').length
  const pillCounts = { trabajos: pendientes + enProgreso || 0 }

  const inicial = (user?.nombre || user?.usuario || '?')[0].toUpperCase()
  const rolLabel = user?.rol === 'admin' ? 'Administrador' : 'Jefe de taller'

  // Reproduce la animacion de entrada (stagger con resorte) del menu SOLO cuando
  // el menu "aparece" por una accion deliberada del menu:
  //  - mobile: se abre el drawer (isOpen false -> true)
  //  - desktop: se expande el rail colapsado (collapsed true -> false)
  // NO se re-anima al navegar entre secciones (molestaba ver el stagger en cada
  // clic). En la carga inicial tampoco anima (initial=false).
  const isMobile = useIsMobile()
  const reduce = useReducedMotion()
  const [animKey, setAnimKey] = useState(0)
  const prevState = useRef({ isOpen, collapsed, isMobile })
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      prevState.current = { isOpen, collapsed, isMobile }
      return
    }
    const p = prevState.current
    prevState.current = { isOpen, collapsed, isMobile }
    if (reduce) return
    const aparecio = isMobile ? (isOpen && !p.isOpen) : (p.collapsed && !collapsed)
    if (aparecio) setAnimKey(k => k + 1)
  }, [isOpen, collapsed, isMobile, reduce])

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar__brand">
        <div className="logo">
          <img src="/logo.png" alt="MDA" />
        </div>
        <div className="wm">
          <div className="n">Multidiagnosticos AS</div>
          <div className="s">Taller Automotriz</div>
        </div>
      </div>

      <motion.nav key={animKey} className="sidebar__nav" variants={navContainer} initial={animKey === 0 ? false : 'closed'} animate="open">
        {NAV.map(g => {
          const visible = g.items.filter(item => allowed.includes(item.key))
          if (!visible.length) return null
          return (
            <motion.div key={g.group} variants={itemSpring}>
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
            </motion.div>
          )
        })}
      </motion.nav>

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
