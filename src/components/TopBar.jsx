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

export default function TopBar({ title, subtitle, onHamburger, user, trabajos, onNavigate }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef(null)
  const [dark, setDark] = useState(() => localStorage.getItem('mda-theme') === 'dark')
  const [compartirOpen, setCompartirOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('mda-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false)
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
      (t.modelo || '').toLowerCase().includes(term)
    ).slice(0, 8)
    setResults(found)
    setShowResults(found.length > 0)
  }

  const selectResult = () => {
    setQuery('')
    setShowResults(false)
    if (onNavigate) onNavigate('trabajos')
  }

  return (
    <>
      <button className="mobile-toggle" onClick={onHamburger} aria-label="Menu">
        <HamburgerIcon />
      </button>

      <header className="topbar">
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
                  onClick={selectResult}
                  style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                >
                  <span className="mono" style={{ fontWeight: 700 }}>{t.placa}</span>
                  <span style={{ color: 'var(--text-3)' }}>{t.cliente || 'Sin cliente'}</span>
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

        <button className="icobtn" title="Notificaciones">
          <BellIcon />
        </button>

        <button
          className="icobtn"
          onClick={() => setDark(d => !d)}
          title={dark ? 'Modo claro' : 'Modo oscuro'}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      {compartirOpen && (
        <CompartirPortalModal onClose={() => setCompartirOpen(false)} />
      )}
    </>
  )
}
