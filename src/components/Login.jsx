import { useState } from 'react'
import { login } from '../services/auth'
import { TALLER } from '../utils/constants'

const ArrowRight = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!usuario.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      const user = await login(usuario.trim(), password)
      onLogin(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      overflow: 'hidden',
      backgroundColor: '#0a1326',
    }}>
      {/* Fondo: imagen del taller a pantalla completa con blur cinematografico */}
      <div aria-hidden="true" style={{
        position: 'absolute',
        // se extiende un poco fuera del viewport para que el blur no muestre bordes
        top: -40, right: -40, bottom: -40, left: -40,
        backgroundImage: 'url(/taller-fachada.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(14px) saturate(1.15) brightness(0.85)',
        WebkitFilter: 'blur(14px) saturate(1.15) brightness(0.85)',
        transform: 'scale(1.08)',
        zIndex: 0,
      }} />
      {/* Overlay oscuro con gradiente */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(10,19,38,.72) 0%, rgba(15,26,52,.48) 50%, rgba(10,19,38,.72) 100%)',
        zIndex: 1,
      }} />
      {/* Patron de puntos */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(245,158,11,.10) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        opacity: 0.5,
        zIndex: 2,
        pointerEvents: 'none',
      }} />
      {/* Glow ambar y rojo a los lados */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '-15%', right: '-10%', width: 520, height: 520,
        background: 'radial-gradient(circle, rgba(245,158,11,.22), transparent 70%)',
        zIndex: 2, pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: '-15%', left: '-10%', width: 480, height: 480,
        background: 'radial-gradient(circle, rgba(220,38,38,.14), transparent 70%)',
        zIndex: 2, pointerEvents: 'none',
      }} />

      {/* Tarjeta central */}
      <div style={{
        position: 'relative',
        zIndex: 3,
        width: '100%',
        maxWidth: 460,
        padding: '44px 40px 36px',
        borderRadius: 24,
        background: 'rgba(255,255,255,.08)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        border: '1px solid rgba(255,255,255,.15)',
        boxShadow: '0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.12)',
        color: '#fff',
      }}>
        {/* Header con logo y marca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 13,
            background: 'rgba(255,255,255,.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
            flexShrink: 0,
          }}>
            <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.3, textShadow: '0 2px 8px rgba(0,0,0,.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {TALLER.razonSocial || TALLER.nombre}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2, fontWeight: 600 }}>
              Taller Automotriz · Sabanalarga
            </div>
          </div>
        </div>

        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,.6)',
          textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8,
        }}>Bienvenido de vuelta</div>
        <h2 style={{
          margin: '0 0 10px', fontSize: 30, fontWeight: 900, letterSpacing: -0.5,
          color: '#fff',
          textShadow: '0 2px 12px rgba(0,0,0,.4)',
        }}>Inicia sesion</h2>
        <p style={{ margin: '0 0 28px', color: 'rgba(255,255,255,.7)', fontSize: 13.5 }}>
          Accede al panel de administracion del taller.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{
              display: 'block', fontSize: 11.5, fontWeight: 700,
              color: 'rgba(255,255,255,.78)', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 8,
            }}>Usuario</label>
            <input
              type="text"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              placeholder="Tu usuario"
              autoFocus
              autoComplete="username"
              style={{
                width: '100%', height: 44, padding: '0 14px',
                background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.18)',
                borderRadius: 10, color: '#fff', fontSize: 14,
                outline: 'none', transition: 'all .18s ease',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(251,191,36,.55)'; e.target.style.background = 'rgba(255,255,255,.12)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,.18)'; e.target.style.background = 'rgba(255,255,255,.08)' }}
            />
          </div>
          <div>
            <label style={{
              display: 'block', fontSize: 11.5, fontWeight: 700,
              color: 'rgba(255,255,255,.78)', textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 8,
            }}>Contrasena</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Tu contrasena"
                autoComplete="current-password"
                style={{
                  width: '100%', height: 44, padding: '0 42px 0 14px',
                  background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(255,255,255,.18)',
                  borderRadius: 10, color: '#fff', fontSize: 14,
                  outline: 'none', transition: 'all .18s ease',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(251,191,36,.55)'; e.target.style.background = 'rgba(255,255,255,.12)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,.18)'; e.target.style.background = 'rgba(255,255,255,.08)' }}
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(255,255,255,.6)', borderRadius: 6,
                  background: 'none', border: 'none', cursor: 'pointer',
                }}>
                <EyeIcon />
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(220,38,38,.18)',
              border: '1px solid rgba(220,38,38,.4)',
              color: '#fecaca',
              borderRadius: 8, fontSize: 13, fontWeight: 600,
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading}
            style={{
              height: 46, fontSize: 14, marginTop: 6, width: '100%',
              background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
              color: '#1a1a1a', fontWeight: 800, letterSpacing: 0.3,
              border: 'none', borderRadius: 10, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 6px 24px rgba(245,158,11,.35)',
              transition: 'transform .15s ease, box-shadow .15s ease',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(245,158,11,.45)' } }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(245,158,11,.35)' }}
          >
            {loading ? 'Ingresando...' : <>Entrar al taller <ArrowRight /></>}
          </button>
        </form>

        <div style={{
          marginTop: 28, paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 11.5, color: 'rgba(255,255,255,.55)',
          gap: 12, flexWrap: 'wrap',
        }}>
          <span>{new Date().getFullYear()} {TALLER.razonSocial || TALLER.nombre}</span>
          <span className="mono">{TALLER.celular}</span>
        </div>
      </div>
    </div>
  )
}
