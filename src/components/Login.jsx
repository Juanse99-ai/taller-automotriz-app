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
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1.1fr', background: 'var(--bg-raised)' }}>
      {/* Left: brand panel */}
      <div style={{
        position: 'relative', background: 'linear-gradient(165deg, #0d1b35 0%, #152544 55%, #1f3257 100%)',
        color: '#fff', padding: '56px 56px 40px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* decorative patterns */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(245,158,11,.10) 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.6, pointerEvents: 'none' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: -120, right: -80, width: 360, height: 360, background: 'radial-gradient(circle, rgba(245,158,11,.22), transparent 70%)', pointerEvents: 'none' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: -100, left: -60, width: 320, height: 320, background: 'radial-gradient(circle, rgba(220,38,38,.15), transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.3 }}>{TALLER.razonSocial || TALLER.nombre}</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 2, fontWeight: 600 }}>Taller Automotriz · Sabanalarga</div>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{ display: 'inline-block', padding: '5px 11px', background: 'rgba(245,158,11,.18)', color: '#fbbf24', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, borderRadius: 6, marginBottom: 18 }}>NIT {TALLER.nit}</div>
            <h1 style={{ margin: 0, fontSize: 44, fontWeight: 900, lineHeight: 1.05, letterSpacing: -0.8 }}>
              Todo el taller,<br />
              <span style={{ color: '#fbbf24' }}>en una sola pantalla.</span>
            </h1>
            <p style={{ marginTop: 16, fontSize: 14.5, color: 'rgba(255,255,255,.7)', lineHeight: 1.55, maxWidth: 440 }}>
              Recibe vehiculos, organiza el trabajo del equipo, cotiza, factura con Cuentti y liquida comisiones. Sin papeles, sin desorden.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 28, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.08)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 4 }}>Direccion</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)' }}>Carrera 27 #13-05</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>Sabanalarga, Atlantico</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 4 }}>Contacto</div>
              <div className="mono" style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', fontWeight: 700 }}>{TALLER.celular}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.55)' }}>{TALLER.email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div style={{ padding: '56px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ maxWidth: 380, margin: '0 auto', width: '100%' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>Bienvenido de vuelta</div>
          <h2 style={{ margin: '0 0 10px', fontSize: 30, fontWeight: 900, letterSpacing: -0.5, color: 'var(--text)' }}>Inicia sesion</h2>
          <p style={{ margin: '0 0 32px', color: 'var(--text-3)', fontSize: 13.5 }}>Accede al panel de administracion del taller.</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Usuario</label>
              <input
                className="form-input"
                type="text"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="Tu usuario"
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Contrasena</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Tu contrasena"
                  autoComplete="current-password"
                  style={{ paddingRight: 42 }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <EyeIcon />
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'var(--red-100)', color: '#991b1b', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{error}</div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ height: 46, fontSize: 14, marginTop: 6, width: '100%' }}>
              {loading ? 'Ingresando...' : <>Entrar al taller <ArrowRight /></>}
            </button>
          </form>

          <div style={{ marginTop: 40, paddingTop: 22, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-4)' }}>
            <span>{new Date().getFullYear()} {TALLER.razonSocial || TALLER.nombre}</span>
            <span>{TALLER.celular}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
