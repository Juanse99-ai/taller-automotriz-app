import { useState, useEffect, useCallback } from 'react'
import { Button, IconX, IconEdit } from '../components/ui'

const ROLES = [
  { value: 'admin', label: 'Administrador', desc: 'Acceso completo (todas las secciones)' },
  { value: 'jefe_taller', label: 'Jefe de taller', desc: 'Operacion: Trabajos, Clientes, Cotizaciones (sin Liquidacion/Reportes/Cuentti)' },
]

export default function Usuarios({ notify, currentUser }) {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)

  // Modal de crear / editar
  const [editing, setEditing] = useState(null) // null | 'new' | userObj
  const [form, setForm] = useState({ usuario: '', password: '', nombre: '', rol: 'jefe_taller', activo: true })
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [showPass, setShowPass] = useState(false)
  // Alta en una fila al pie, como el mockup. El usuario se prellena del nombre
  // ("Jefe de Patio" -> "patio") y queda editable; se marca DEL NOMBRE mientras
  // no se toque a mano.
  const [nuevo, setNuevo] = useState({ nombre: '', usuario: '', rol: 'jefe_taller', password: '', auto: true })
  const [showPassN, setShowPassN] = useState(false)
  const [creando, setCreando] = useState(false)
  const usuarioDeNombre = (n) => {
    const partes = (n || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/).filter(p => p && !['de','del','la','el','los','las'].includes(p))
    return (partes[partes.length - 1] || '').replace(/[^a-z0-9]/g, '')
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth-setup', { method: 'GET' })
      const data = await res.json()
      if (data.ok) setUsuarios(data.usuarios || [])
      else throw new Error(data.error || 'Error desconocido')
    } catch (e) {
      notify('Error cargando usuarios: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { cargar() }, [cargar, refreshTick])

  const abrirCrear = () => {
    setEditing('new')
    setForm({ usuario: '', password: '', nombre: '', rol: 'jefe_taller', activo: true })
    setShowPass(false)
  }
  const abrirEditar = (u) => {
    setEditing(u)
    setForm({ usuario: u.usuario, password: '', nombre: u.nombre || '', rol: u.rol || 'jefe_taller', activo: u.activo !== false })
    setShowPass(false)
  }
  const cerrar = () => { setEditing(null); setForm({ usuario: '', password: '', nombre: '', rol: 'jefe_taller', activo: true }) }

  const guardar = async (e) => {
    e?.preventDefault()
    if (!form.usuario.trim() || !form.nombre.trim() || !form.rol) {
      notify('Usuario, nombre y rol son obligatorios', 'error')
      return
    }
    if (editing === 'new' && !form.password) {
      notify('Contrasena obligatoria al crear', 'error')
      return
    }
    setSaving(true)
    try {
      const isNew = editing === 'new'
      const body = isNew
        ? {
            action: 'create',
            usuario: form.usuario.trim(),
            password: form.password,
            nombre: form.nombre.trim(),
            rol: form.rol,
            activo: form.activo,
          }
        : {
            action: 'update',
            id: editing.id,
            nombre: form.nombre.trim(),
            rol: form.rol,
            activo: form.activo,
            ...(form.password ? { password: form.password } : {}),
          }
      const res = await fetch('/api/auth-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Error desconocido')
      notify(isNew ? 'Usuario creado' : 'Usuario actualizado', 'success')
      cerrar()
      setRefreshTick(t => t + 1)
    } catch (e) {
      notify('Error: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const crearInline = async () => {
    const usuario = (nuevo.auto ? usuarioDeNombre(nuevo.nombre) : nuevo.usuario).trim()
    if (!nuevo.nombre.trim() || !usuario) { notify('Nombre y usuario son obligatorios', 'error'); return }
    if (!nuevo.password) { notify('La contraseña es obligatoria al crear', 'error'); return }
    setCreando(true)
    try {
      const res = await fetch('/api/auth-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', usuario, password: nuevo.password, nombre: nuevo.nombre.trim(), rol: nuevo.rol, activo: true }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Error desconocido')
      notify('Usuario creado', 'success')
      setNuevo({ nombre: '', usuario: '', rol: 'jefe_taller', password: '', auto: true })
      setShowPassN(false)
      setRefreshTick(t => t + 1)
    } catch (e) {
      notify('Error: ' + e.message, 'error')
    } finally {
      setCreando(false)
    }
  }

  const desactivar = async (u) => {
    setConfirmDel(null)
    try {
      const res = await fetch('/api/auth-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: u.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Error desconocido')
      notify('Usuario desactivado', 'info')
      setRefreshTick(t => t + 1)
    } catch (e) {
      notify('Error: ' + e.message, 'error')
    }
  }

  const reactivar = async (u) => {
    try {
      const res = await fetch('/api/auth-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: u.id, activo: true }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Error desconocido')
      notify('Usuario reactivado', 'success')
      setRefreshTick(t => t + 1)
    } catch (e) {
      notify('Error: ' + e.message, 'error')
    }
  }

  // El rol es el dato que se consulta: pastilla de color, no texto suelto.
  const rolBadge = (rol) => {
    if (rol === 'admin') return { chip: 'info', l: 'ADMINISTRADOR' }
    if (rol === 'jefe_taller') return { chip: 'ok', l: 'JEFE DE TALLER' }
    return { chip: 'mute', l: (rol || '—').toUpperCase() }
  }
  const activos = usuarios.filter(u => u.activo).length
  const inactivos = usuarios.length - activos

  return (
    <div>
      {/* Cuatro filas no se presentan como si fueran cuatrocientas: la tabla
          ocupa lo que ocupa y el resto del alto queda vacio. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Usuarios</h1>
          <div className="hd-head__sub">
            {usuarios.length} {usuarios.length === 1 ? 'usuario registrado' : 'usuarios registrados'}
            {activos > 0 && ` · ${activos} ${activos === 1 ? 'activo' : 'activos'}`}
            {inactivos > 0 && ` · ${inactivos} ${inactivos === 1 ? 'inactivo' : 'inactivos'}`}
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <button type="button" className="rep-ico" onClick={() => setRefreshTick(t => t + 1)} title="Recargar la lista">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
          </button>
          <Button variant="primary" onClick={abrirCrear}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}>
            Nuevo usuario
          </Button>
        </div>
      </div>

      <div className="hd-card usr" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="hd-void">Cargando…</div>
        ) : usuarios.length === 0 ? (
          <div className="hd-void">Sin usuarios registrados</div>
        ) : (
          <>
            <div className="usr__cab">
              <span style={{ flex: 1, minWidth: 0 }}>NOMBRE</span>
              <span style={{ width: 150 }}>USUARIO</span>
              <span style={{ width: 170 }}>ROL</span>
              <span style={{ width: 104 }}>ESTADO</span>
              <span style={{ width: 104, textAlign: 'right' }}>CREADO</span>
              <span style={{ width: 152, textAlign: 'right' }}>ACCESO</span>
            </div>
            {usuarios.map((u, i) => {
              const isMe = currentUser && (currentUser.id === u.id || currentUser.usuario === u.usuario)
              const badge = rolBadge(u.rol)
              return (
                <div key={u.id} className={`usr__row${u.activo ? '' : ' off'}`}>
                  <span className="usr__n">
                    <span className={`av av-${(i % 5) + 1} usr__av`}>
                      {(u.nombre || u.usuario || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                    <span className="usr__nb">
                      <span className="usr__nn">{u.nombre || u.usuario}</span>
                      {/* Marca la fila del que esta conectado: evita que se
                          desactive a si mismo sin darse cuenta. */}
                      {isMe && <span className="usr__yo">tu sesión</span>}
                    </span>
                  </span>
                  <span className="usr__u">{u.usuario}</span>
                  <span style={{ width: 170 }}><span className={`hd-chip hd-chip--${badge.chip}`}>{badge.l}</span></span>
                  <span className="usr__e">
                    <span className={`usr__dot${u.activo ? ' on' : ''}`} />
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  <span className="usr__c">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\sde\s/g, ' ').replace(/\./g, '') : <span className="hd-empty">—</span>}
                  </span>
                  <span className="usr__a">
                    <button type="button" className="usr__edit" aria-label={`Editar ${u.usuario}`} title="Editar" onClick={() => abrirEditar(u)}><IconEdit /></button>
                    {u.activo
                      ? <button type="button" className="usr__acc usr__acc--off" disabled={isMe}
                          title={isMe ? 'No puedes desactivar tu propia sesión' : undefined}
                          onClick={() => setConfirmDel(u)}>Desactivar</button>
                      : <button type="button" className="usr__acc usr__acc--on" onClick={() => reactivar(u)}>Reactivar</button>}
                  </span>
                </div>
              )
            })}
            <div className="usr__pie">
              <span>{usuarios.length} {usuarios.length === 1 ? 'usuario registrado' : 'usuarios registrados'}</span>
              <span className="hd-bar__sp" />
              <span className="usr__pien">{activos} activos · {inactivos} inactivo{inactivos === 1 ? '' : 's'}</span>
            </div>
          </>
        )}
      </div>

      {/* Alta: de formulario apilado en un modal a una fila de campos. El
          usuario se prellena del nombre y se marca DEL NOMBRE, editable. */}
      <div className="hd-card usr-new">
        <div className="ec-form__h">
          <span className="ec-aside__t">Nuevo usuario</span>
          <span className="ec-form__hs">el usuario y la contraseña se entregan a la persona</span>
        </div>
        <div className="ec-form__r">
          <div className="ec-form__c" style={{ flex: 1, minWidth: 170 }}>
            <div className="ec-form__l">NOMBRE COMPLETO <span className="req">*</span></div>
            <input className="usr-new__acc" value={nuevo.nombre} placeholder="ej: Jefe de Patio"
              onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} />
          </div>
          <div className="ec-form__c" style={{ width: 190, flex: 'none' }}>
            <div className="ec-form__l">USUARIO <span className="req">*</span></div>
            <div className="usr-new__u">
              <input className="usr-new__ui" value={nuevo.auto ? usuarioDeNombre(nuevo.nombre) : nuevo.usuario}
                placeholder="patio"
                onChange={e => setNuevo(n => ({ ...n, usuario: e.target.value.toLowerCase().trim(), auto: false }))} />
              {nuevo.auto && nuevo.nombre.trim() && <span className="hd-chip hd-chip--ok">DEL NOMBRE</span>}
            </div>
          </div>
          <div className="ec-form__c" style={{ width: 200, flex: 'none' }}>
            <div className="ec-form__l">ROL</div>
            <select className="hd-drop" style={{ width: '100%' }} value={nuevo.rol}
              onChange={e => setNuevo(n => ({ ...n, rol: e.target.value }))}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="ec-form__c" style={{ width: 190, flex: 'none' }}>
            <div className="ec-form__l">CONTRASEÑA <span className="req">*</span></div>
            <div className="usr-new__u">
              <input className="usr-new__ui" type={showPassN ? 'text' : 'password'} value={nuevo.password}
                placeholder="Mínimo 6 caracteres" autoComplete="new-password"
                onChange={e => setNuevo(n => ({ ...n, password: e.target.value }))} />
              <button type="button" className="usr-new__ojo" onClick={() => setShowPassN(v => !v)}
                aria-label={showPassN ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
              </button>
            </div>
          </div>
          <Button variant="primary" onClick={crearInline} disabled={creando} className="ec-form__go">
            {creando ? 'Creando…' : 'Crear usuario'}
          </Button>
        </div>
        {/* Los dos roles son los que la app tiene de verdad; su alcance se dice
            aqui en vez de esconderlo tras el desplegable. */}
        <div className="usr-new__rol">
          {ROLES.find(r => r.value === nuevo.rol)?.desc}
        </div>
      </div>

      {/* Modal crear / editar */}
      {editing && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__h">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                {editing === 'new' ? 'Nuevo usuario' : `Editar ${editing.usuario}`}
              </h3>
              <Button variant="ghost" size="sm" onClick={cerrar}><IconX /></Button>
            </div>
            <form onSubmit={guardar} className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label>Usuario (login) <span className="req">*</span></label>
                <input className="input" value={form.usuario}
                  disabled={editing !== 'new'}
                  onChange={e => setForm(f => ({ ...f, usuario: e.target.value.toLowerCase().trim() }))}
                  placeholder="ej: patio, recepcion, juan..."
                  autoFocus />
                {editing !== 'new' && <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>El nombre de usuario no se puede cambiar despues de creado.</span>}
              </div>
              <div className="field">
                <label>Nombre completo <span className="req">*</span></label>
                <input className="input" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="ej: Jefe de Patio" />
              </div>
              <div className="field">
                <label>Contraseña {editing === 'new' && <span className="req">*</span>}</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={editing === 'new' ? 'Minimo 6 caracteres' : 'Dejar vacio para mantener'}
                    autoComplete="new-password"
                    style={{ paddingRight: 70 }} />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: '4px 10px', background: 'transparent', border: 'none', color: 'var(--blue-600)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    {showPass ? 'ocultar' : 'mostrar'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Rol <span className="req">*</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ROLES.map(r => (
                    <label key={r.value} style={{
                      display: 'flex', gap: 10, padding: '10px 12px',
                      border: `1.5px solid ${form.rol === r.value ? 'var(--blue-600)' : 'var(--border)'}`,
                      background: form.rol === r.value ? 'var(--blue-50, #eff6ff)' : 'var(--bg-raised)',
                      borderRadius: 8, cursor: 'pointer'
                    }}>
                      <input type="radio" name="rol" value={r.value} checked={form.rol === r.value}
                        onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
                        style={{ marginTop: 3 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.label}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{r.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="activo" checked={form.activo}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  style={{ width: 16, height: 16 }} />
                <label htmlFor="activo" style={{ marginBottom: 0, cursor: 'pointer' }}>Usuario activo (puede iniciar sesion)</label>
              </div>

              <div className="modal__f" style={{ marginLeft: -22, marginRight: -22, marginBottom: -22, paddingLeft: 22, paddingRight: 22, paddingTop: 14, paddingBottom: 14, marginTop: 8 }}>
                <Button variant="outline" onClick={cerrar} disabled={saving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Guardando...' : editing === 'new' ? 'Crear usuario' : 'Guardar cambios'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm desactivar */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal__h">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--red-700)' }}>Desactivar usuario</h3>
            </div>
            <div className="modal__b">
              <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>
                ¿Seguro que quieres desactivar a <strong>{confirmDel.usuario}</strong> ({confirmDel.nombre})? No podra iniciar sesion hasta que lo reactives.
              </p>
            </div>
            <div className="modal__f">
              <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => desactivar(confirmDel)} style={{ background: 'var(--red-600)' }}>Desactivar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
