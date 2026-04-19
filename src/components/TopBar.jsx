import { useState, useRef, useEffect } from 'react'

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

export default function TopBar({ title, subtitle, onHamburger, user, onLogout, trabajos, onNavigate }) {
  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef(null)
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
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

  const selectResult = (t) => {
    setQuery('')
    setShowResults(false)
    if (onNavigate) onNavigate('trabajos')
  }

  return (
    <>
      <button className="hamburger" onClick={onHamburger} aria-label="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="6"  x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div className="top-bar">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="top-bar-right">
          <div className="top-bar-search" ref={searchRef}>
            <svg className="top-bar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="top-bar-search-input"
              type="text"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => { if (results.length) setShowResults(true) }}
              placeholder="Buscar placa, cliente, ID..."
            />
            {showResults && (
              <div className="top-bar-search-results">
                {results.map(t => (
                  <div key={t.id} className="top-bar-search-item" onClick={() => selectResult(t)}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{t.placa}</span>
                    <span style={{ color: 'var(--slate-500)' }}>{t.cliente || 'Sin cliente'}</span>
                    <span className="badge" style={{ fontSize: 10 }}>{t.estado}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="theme-toggle" onClick={() => setDark(d => !d)} title={dark ? 'Modo claro' : 'Modo oscuro'}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <span className="top-bar-date">{today}</span>
          {user && (
            <div className="top-bar-user">
              <span className="top-bar-user-name">{user.nombre || user.usuario}</span>
              <button className="btn btn-ghost btn-sm" onClick={onLogout} title="Cerrar sesion" style={{ padding: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
