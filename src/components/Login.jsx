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
      display: 'grid',
      gridTemplateColumns: '1fr 1.1fr',
      overflow: 'hidden',
      backgroundColor: '#0a1326',
    }}>
      {/* Fondo: imagen del taller a pantalla completa */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'url(/taller-fachada.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'saturate(1.05)',
        zIndex: 0,
      }} />
      {/* Overlay oscuro con gradiente para legibilidad */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(115deg, rgba(10,19,38,.92) 0%, rgba(15,26,52,.78) 45%, rgba(15,26,52,.55) 65%, rgba(10,19,38,.78) 100%)',
        zIndex: 1,
      }} />
      {/* Patron decorativo de puntos sobre overlay */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(245,158,11,.10) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        opacity: 0.5,
        zIndex: 2,
        pointerEvents: 'none',
      }} />
      {/* Glow ambar */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: -120, right: -80, width: 420, height: 420,
        background: 'radial-gradient(circle, rgba(245,158,11,.18), transparent 70%)',
        zIndex: 2, pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: -120, left: -80, width: 380, height: 380,
        background: 'radial-gradient(circle, rgba(220,38,38,.12), transparent 70%)',
        zIndex: 2, pointerEvents: 'none',
      }} />

      {/* Left: brand panel */}
      <div style={{
        position: 'relative',
        color: '#fff',
        padding: '56px 56px 40px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 3,
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'rgba(255,255,255,.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,.35)',
            backdropFilter: 'blur(10px)',
          }}>
            <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.3, textShadow: '0 2px 12px rgba(0,0,0,.5)' }}>{TALLER.razonSocial || TALLER.nombre}</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 2, fontWeight: 600 }}>Taller Automotriz · Sabanalarga</div>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{
              display: 'inline-block', padding: '5px 11px',
              background: 'rgba(245,158,11,.22)', color: '#fbbf24',
              fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2,
              borderRadius: 6, marginBottom: 18,
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(245,158,11,.3)',
            }}>NIT {TALLER.nit}</div>
            <h1 style={{
              margin: 0, fontSize: 44, fontWeight: 900, lineHeight: 1.05, letterSpacing: -0.8,
              textShadow: '0 4px 24px rgba(0,0,0,.55)',
            }}>
              Todo el taller,<br />
              <span style={{ color: '#fbbf24' }}>en una sola pantalla.</span>
            </h1>
            <p style={{
              marginTop: 16, fontSize: 14.5, color: 'rgba(255,255,255,.82)',
              lineHeight: 1.55, maxWidth: 440,
              textShadow: '0 2px 12px rgba(0,0,0,.4)',
            }}>
              Recibe vehiculos, organiza el trabajo del equipo, cotiza, factura con Cuentti y liquida comisiones. Sin papeles, sin desorden.
            </p>
          </div>

          <div style={{
            display: 'flex', gap: 28, paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,.15)',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 4 }}>Direccion</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.9)', textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>Carrera 27 #13-05</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>Sabanalarga, Atlantico</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 4 }}>Contacto</div>
              <div className="mono" style={{ fontSize: 13, color: 'rgba(255,255,255,.9)', fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>{TALLER.celular}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.65)' }}>{TALLER.email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: form con efecto glassmorphism */}
      <div style={{
        position: 'relative',
        padding: '56px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 3,
      }}>
        <div style={{
          maxWidth: 420, width: '100%',
          padding: '40px 38px',
          borderRadius: 20,
          background: 'rgba(255,255,255,.08)',
          backdropFilter: 'blur(22px) saturate(140%)',
          WebkitBackdropFilter: 'blur(22px) saturate(140%)',
          border: '1px solid rgba(255,255,255,.15)',
          boxShadow: '0 24px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12)',
          color: '#fff',
        }}>
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,.6)',
            textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8,
          }}>Bienvenido de vuelta</div>
          <h2 style={{
            margin: '0 0 10px', fontSize: 30, fontWeight: 900, letterSpacing: -0.5,
            color: '#fff',
            textShadow: '0 2px 12px rgba(0,0,0,.35)',
          }}>Inicia sesion</h2>
          <p style={{ margin: '0 0 28px', color: 'rgba(255,255,255,.65)', fontSize: 13.5 }}>
            Accede al panel de administracion del taller.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ marginBottom: 0 }}>
              <label style={{
                display: 'block', fontSize: 11.5, fontWeight: 700,
                color: 'rgba(255,255,255,.75)', textTransform: 'uppercase',
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
            <div style={{ marginBottom: 0 }}>
              <label style={{
                display: 'block', fontSize: 11.5, fontWeight: 700,
                color: 'rgba(255,255,255,.75)', textTransform: 'uppercase',
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
            marginTop: 32, paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 11.5, color: 'rgba(255,255,255,.5)',
          }}>
            <span>{new Date().getFullYear()} {TALLER.razonSocial || TALLER.nombre}</span>
            <span>{TALLER.celular}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
