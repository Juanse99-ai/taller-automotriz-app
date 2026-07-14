import { useState, useEffect, useCallback } from 'react'
import { Button, Badge } from '../components/ui'

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

  const rolBadge = (rol) => {
    if (rol === 'admin') return { tone: 'info', l: 'Admin' }
    if (rol === 'jefe_taller') return { tone: 'warning', l: 'Jefe taller' }
    return { tone: 'neutral', l: rol || '—' }
  }

  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>Usuarios</h2>
        </div>
        <div className="actions">
          <Button variant="outline" onClick={() => setRefreshTick(t => t + 1)}>Recargar</Button>
          <Button variant="primary" onClick={abrirCrear}>+ Nuevo usuario</Button>
        </div>
      </div>

      <div className="card">
        <div className="card__h"><h3>Usuarios registrados</h3>{usuarios.length > 0 && <span className="count">{usuarios.length}</span>}</div>
        <div className="card__b card__b--flush">
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          ) : usuarios.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>👤</div>
              <p>No hay usuarios registrados.</p>
              <Button variant="primary" size="sm" onClick={abrirCrear} style={{ marginTop: 8 }}>+ Crear primero</Button>
            </div>
          ) : (
            <table className="tbl tbl-cards">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => {
                  const isMe = currentUser && (currentUser.id === u.id || currentUser.usuario === u.usuario)
                  const badge = rolBadge(u.rol)
                  return (
                    <tr key={u.id}>
                      <td className="c-name c-mono" style={{ fontWeight: 700 }}>{u.usuario}{isMe && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--blue-600)', fontWeight: 600 }}>(tú)</span>}</td>
                      <td data-label="Nombre">{u.nombre || '—'}</td>
                      <td data-label="Rol"><Badge tone={badge.tone}>{badge.l}</Badge></td>
                      <td data-label="Estado">
                        {u.activo
                          ? <Badge tone="success">● Activo</Badge>
                          : <Badge tone="danger">● Inactivo</Badge>}
                      </td>
                      <td className="c-muted" data-label="Creado">{u.created_at ? new Date(u.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                      <td className="td-actions" style={{ textAlign: 'right' }}>
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(u)}>Editar</Button>
                        {u.activo
                          ? <Button variant="ghost" size="sm" onClick={() => setConfirmDel(u)} disabled={isMe} style={{ color: isMe ? 'var(--text-3)' : 'var(--red-600)' }}>Desactivar</Button>
                          : <Button variant="ghost" size="sm" onClick={() => reactivar(u)} style={{ color: 'var(--green-600)' }}>Reactivar</Button>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
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
              <Button variant="ghost" size="sm" onClick={cerrar}>✕</Button>
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
