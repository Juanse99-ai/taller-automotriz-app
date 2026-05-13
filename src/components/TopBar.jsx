import { useState, useRef, useEffect } from 'react'
import CompartirPortalModal from './CompartirPortalModal'

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)
const PortalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
)
const HamburgerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="3" y1="6"  x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)
const LogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

// Helper to format relative time
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `Hace ${days}d`
}

export default function TopBar({ title, subtitle, onToggleSidebar, user, onLogout, trabajos, onNavigate }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef(null)
  const [dark, setDark] = useState(() => localStorage.getItem('mda-theme') === 'dark')
  const [compartirOpen, setCompartirOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('mda-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSearch = (q) => {
    setQuery(q)
    if (!q.trim() || !trabajos?.length) { setResults([]); setShowResults(false); return }
    const term = q.toLowerCase()
    const found = trabajos.filter(t =>
      (t.placa || '').toLowerCase().includes(term) ||
      (t.cliente || '').toLowerCase().includes(term) ||
      (t.id || '').toLowerCase().includes(term) ||
      (t.marca || '').toLowerCase().includes(term) ||
      (t.modelo || '').toLowerCase().includes(term) ||
      (t.otCodigo || '').toLowerCase().includes(term) ||
      (t.cedula || '').toLowerCase().includes(term)
    ).slice(0, 8)
    setResults(found)
    setShowResults(found.length > 0)
  }

  const selectResult = (t) => {
    setQuery('')
    setShowResults(false)
    if (onNavigate) onNavigate('trabajos')
  }

  // Notifications: recent activity from trabajos
  const notifications = (trabajos || [])
    .filter(t => t.fecha)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 10)
    .map(t => ({
      id: t.id,
      text: `${t.placa || 'Sin placa'} - ${t.cliente || 'Sin cliente'}`,
      estado: t.estado,
      time: timeAgo(t.fecha),
    }))

  const pendientesCount = (trabajos || []).filter(t =>
    t.estado === 'Pendiente' || t.estado === 'En Diagnostico'
  ).length

  return (
    <>
      <header className="topbar">
        <button className="topbar__menu" onClick={onToggleSidebar} aria-label="Abrir menu">
          <HamburgerIcon />
        </button>
        <div className="title">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="sp" />

        <div className="search" ref={searchRef} style={{ position: 'relative' }}>
          <SearchIcon />
          <input
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onFocus={() => { if (results.length) setShowResults(true) }}
            placeholder="Buscar placa, cliente, OT..."
          />
          {showResults && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-md)', maxHeight: 320, overflowY: 'auto', zIndex: 100 }}>
              {results.map(t => (
                <div
                  key={t.id}
                  onClick={() => selectResult(t)}
                  style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                >
                  <span className="mono" style={{ fontWeight: 700 }}>{t.placa}</span>
                  <span style={{ color: 'var(--text-3)' }}>{t.cliente || 'Sin cliente'}</span>
                  {t.otCodigo && <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{t.otCodigo}</span>}
                  <span className="badge badge-n" style={{ fontSize: 10, marginLeft: 'auto' }}>{t.estado}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="btn btn-outline btn-sm"
          onClick={() => setCompartirOpen(true)}
          title="Compartir Portal del Cliente"
          style={{ gap: 6 }}
        >
          <PortalIcon /> Portal Cliente
        </button>

        {/* Notifications */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button className="icobtn" title="Notificaciones" onClick={() => setNotifOpen(o => !o)} style={{ position: 'relative' }}>
            <BellIcon />
            {pendientesCount > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: 2, width: 16, height: 16,
                background: '#ef4444', borderRadius: '50%', fontSize: 9,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, lineHeight: 1,
              }}>{pendientesCount > 9 ? '9+' : pendientesCount}</span>
            )}
          </button>
          {notifOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320,
              background: 'var(--bg-raised)', border: '1px solid var(--border)',
              borderRadius: 12, boxShadow: 'var(--shadow-md)', zIndex: 200,
              maxHeight: 400, overflowY: 'auto',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                Actividad Reciente
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  Sin actividad reciente
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => { setNotifOpen(false); if (onNavigate) onNavigate('trabajos') }}
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.text}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{n.time}</div>
                    </div>
                    <span className="badge badge-n" style={{ fontSize: 10, flexShrink: 0 }}>{n.estado}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <button
          className="icobtn"
          onClick={() => setDark(d => !d)}
          title={dark ? 'Modo claro' : 'Modo oscuro'}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>

        {onLogout && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              if (window.confirm('Cerrar sesion?')) onLogout()
            }}
            title="Cerrar sesion"
            style={{ gap: 6, color: '#dc2626', borderColor: 'rgba(220,38,38,.35)' }}
          >
            <LogoutIcon /> Salir
          </button>
        )}
      </header>

      {compartirOpen && (
        <CompartirPortalModal onClose={() => setCompartirOpen(false)} />
      )}
    </>
  )
}
