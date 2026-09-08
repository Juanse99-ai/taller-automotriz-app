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
    <div className="login">

      {/* Panel de la foto del taller. Plano: una sola capa de color con alpha
         para que se lea el texto encima, ni desenfoque ni degradado. */}
      <div className="login__art">
        <div className="login__velo" aria-hidden="true" />
        <div className="login__artb">
          <div className="login__marca">
            <div className="login__logo"><img src="/logo.png" alt="" /></div>
            <div style={{ minWidth: 0 }}>
              <div className="login__razon">{TALLER.razonSocial || TALLER.nombre}</div>
              <div className="login__sede">Taller automotriz · Sabanalarga</div>
            </div>
          </div>

          <div>
            <h1 className="login__lema">Todo el taller en un solo lugar.</h1>
            <p className="login__sub">
              Recepción, trabajos, inventario, liquidación y facturación. Sin papeles sueltos.
            </p>
          </div>

          {/* El recorrido real de un carro por el taller, en su orden. */}
          <ul className="login__pasos">
            <li><b className="mono">01</b>Recepción</li>
            <li><b className="mono">02</b>Diagnóstico</li>
            <li><b className="mono">03</b>Entrega</li>
          </ul>
        </div>
      </div>

      {/* Panel del formulario */}
      <div className="login__form">
        <div className="login__caja">
          <h2>Inicia sesión</h2>
          <p>Entra con el usuario que te dieron en el taller.</p>

          <form onSubmit={handleSubmit} className="login__campos">
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
              <div className="login__pass">
                <input
                  id="login-pass"
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                />
                <button type="button" className="login__ojo" onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  <EyeIcon open={showPass} />
                </button>
              </div>
            </div>

            {error && <div role="alert" className="login__error">{error}</div>}

            {/* El rotulo del boton apagado dice QUE FALTA, no se queda mudo. */}
            <button type="submit" disabled={loading || !usuario.trim() || !password}
              className="btn btn-primary login__entrar">
              {loading ? 'Entrando…'
                : !usuario.trim() ? 'Escribe tu usuario'
                : !password ? 'Escribe tu contraseña'
                : <>Entrar al taller <ArrowRight /></>}
            </button>
          </form>

          <div className="login__pie">
            <span>{new Date().getFullYear()} {TALLER.razonSocial || TALLER.nombre}</span>
            <span className="mono">{TALLER.celular}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
