import { useState } from 'react'
import { login } from '../services/auth'
import { TALLER } from '../utils/constants'

const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

const EyeIcon = ({ open }) => (
  open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
)

export default function Login({ onLogin, aviso = '' }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState(aviso)
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
      display: 'grid',
      gridTemplateColumns: '1fr 1.12fr',
      background: 'var(--navy-900)',
      color: '#fff',
    }} className="login-shell">

      {/* Panel izquierdo: foto del taller (sin blur, sin gradients) */}
      <div className="login-art" style={{
        order: 2,
        position: 'relative',
        backgroundImage: 'url(/taller-fachada.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: 240,
      }}>
        {/* Capa única plana para legibilidad — no es gradient decorativo, es un solo color con alpha */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0,
          background: 'rgba(6, 11, 26, .58)',
        }} />
        <div style={{
          position: 'relative', zIndex: 1,
          height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '40px 44px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: '#fff', overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: .2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {TALLER.razonSocial || TALLER.nombre}
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 3, fontWeight: 600 }}>
                Taller Automotriz · Sabanalarga
              </div>
            </div>
          </div>

          <div style={{ maxWidth: 460 }}>
            <h1 style={{
              margin: 0, fontSize: 'clamp(32px, 4.4vw, 48px)',
              fontWeight: 900, lineHeight: 1.05, letterSpacing: '-1px',
            }}>
              Operación del taller, en un solo lugar.
            </h1>
            <p style={{
              margin: '16px 0 0', fontSize: 15.5, lineHeight: 1.55,
              color: 'rgba(255,255,255,.72)', maxWidth: 420,
            }}>
              Recepción, trabajos, inventario, liquidación y facturación. Todo conectado, sin papeles sueltos.
            </p>
          </div>

          {/* El numeral se distingue por PESO, no por un ambar: el handoff fija un
              solo acento y este era un segundo, colado en la pantalla de entrada. */}
          <div style={{ display: 'flex', gap: 32, fontSize: 12.5, color: 'rgba(255,255,255,.55)', flexWrap: 'wrap' }}>
            <span><span className="mono" style={{ color: '#fff', fontWeight: 700, marginRight: 6 }}>01</span> Recepción</span>
            <span><span className="mono" style={{ color: '#fff', fontWeight: 700, marginRight: 6 }}>02</span> Diagnóstico</span>
            <span><span className="mono" style={{ color: '#fff', fontWeight: 700, marginRight: 6 }}>03</span> Entrega</span>
          </div>
        </div>
      </div>

      {/* Panel del formulario (izquierda, estilo Sana: limpio y aireado) */}
      <div style={{
        order: 1,
        background: 'var(--bg-raised, #fff)',
        color: 'var(--text, #0f172a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Aqui iba un segundo bloque de marca. El panel ya la trae en grande, y
              en movil se apila justo encima: eran dos logos pegados. */}
          <h2 style={{
            margin: '0 0 8px', fontSize: 30, fontWeight: 700,
            letterSpacing: '-.5px', color: 'var(--text)',
          }}>Inicia sesión</h2>
          <p style={{ margin: '0 0 30px', color: 'var(--text-3)', fontSize: 15, lineHeight: 1.5 }}>
            Accede al panel de administración del taller.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field">
              <label htmlFor="login-user">Usuario</label>
              <input
                id="login-user"
                className="input"
                type="text"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="Tu usuario"
                autoFocus
                autoComplete="username"
              />
            </div>

            <div className="field">
              <label htmlFor="login-pass">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-pass"
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    width: 32, height: 32,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-3)', borderRadius: 6,
                    background: 'none', border: 'none', cursor: 'pointer',
                  }}>
                  <EyeIcon open={showPass} />
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" style={{
                padding: '12px 14px',
                background: 'var(--soft-red)',
                border: '1px solid rgba(220,38,38,.32)',
                color: 'var(--red-700)',
                borderRadius: 9, fontSize: 13.5, fontWeight: 600,
              }}>{error}</div>
            )}

            <button type="submit" disabled={loading || !usuario.trim() || !password}
              className="btn btn-primary"
              style={{
                height: 50, fontSize: 15, marginTop: 8, width: '100%',
                letterSpacing: .2,
              }}
            >
              {loading ? 'Ingresando…' : <>Entrar al taller <ArrowRight /></>}
            </button>
          </form>

          <div style={{
            marginTop: 32, paddingTop: 18,
            borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12.5, color: 'var(--text-3)',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span>{new Date().getFullYear()} {TALLER.razonSocial || TALLER.nombre}</span>
            <span className="mono">{TALLER.celular}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
