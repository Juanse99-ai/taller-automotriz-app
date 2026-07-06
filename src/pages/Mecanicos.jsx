import { useMemo, useState } from 'react'
import { fmt } from '../utils/helpers'
import { COMISION, ESTADOS } from '../utils/constants'
import { manoObraBase } from '../utils/comision'
import { useTecnicos, tecnicosActivos, agregarTecnico, actualizarTecnico, setTecnicoActivo, eliminarTecnico } from '../services/tecnicos'

const ACTIVOS = [ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.EN_PROGRESO]

export default function Mecanicos({ trabajos, onNavigate, notify }) {
  const TECNICOS = useTecnicos()
  const [vistaAgenda, setVistaAgenda] = useState(false)
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [agregando, setAgregando] = useState(false)
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', especialidad: '', telefono: '', cedula: '' })

  const tecnicosData = useMemo(() => {
    return TECNICOS.map((tec, idx) => {
      const misTrab = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id)
      const completados = misTrab.filter(t => t.estado === ESTADOS.COMPLETADO)
      const activos = misTrab.filter(t => ACTIVOS.includes(t.estado))

      const now = new Date()
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
      const completadosMes = completados.filter(t => new Date(t.fecha) >= inicioMes)
      // Base SIN IVA (igual que Liquidación) para que la tarjeta muestre lo que se paga.
      const comisionMes = completadosMes.reduce((s, t) => s + manoObraBase(t) * COMISION.TOTAL, 0)

      return {
        ...tec,
        idx,
        totalTrabajos: misTrab.length,
        activosCount: activos.length,
        completadosMes: completadosMes.length,
        comisionMes,
        libre: activos.length === 0,
      }
    })
  }, [trabajos, TECNICOS])

  const equipoActivo = tecnicosData.filter(t => !t.eliminado && t.activo !== false)
  const equipoInactivo = tecnicosData.filter(t => !t.eliminado && t.activo === false)
  const totalActivos = equipoActivo.reduce((s, t) => s + t.activosCount, 0)
  const totalComisionesMes = equipoActivo.reduce((s, t) => s + t.comisionMes, 0)

  const initials = (nombre) => nombre.split(' ').map(x => x[0]).slice(0, 2).join('')

  const handleAgregar = (e) => {
    e?.preventDefault?.()
    if (!nuevoForm.nombre.trim()) { notify?.('Escribe el nombre del técnico', 'error'); return }
    agregarTecnico(nuevoForm)
    setNuevoForm({ nombre: '', especialidad: '', telefono: '', cedula: '' })
    setAgregando(false)
    notify?.('Técnico agregado al equipo', 'success')
  }

  const handleGuardarEdicion = () => {
    if (!editando) return
    if (!editForm.nombre?.trim()) { notify?.('El nombre no puede quedar vacío', 'error'); return }
    actualizarTecnico(editando.id, {
      nombre: editForm.nombre.trim(),
      especialidad: (editForm.especialidad || '').trim() || 'General',
      telefono: (editForm.telefono || '').trim(),
      cedula: (editForm.cedula || '').trim(),
    })
    setEditando(null)
    notify?.('Técnico actualizado', 'success')
  }

  const handleDesactivar = () => {
    if (!editando) return
    setTecnicoActivo(editando.id, false)
    setEditando(null)
    notify?.(`${editando.nombre} marcado como inactivo`, 'info')
  }

  const handleEliminar = () => {
    if (!editando) return
    const otsHistoria = trabajos.filter(t => parseInt(t.tecnicoId) === editando.id).length
    const msg = otsHistoria > 0
      ? `¿Eliminar a ${editando.nombre} del equipo?\n\nTiene ${otsHistoria} OT${otsHistoria !== 1 ? 's' : ''} en el historial: su nombre se conservará en los registros y reportes viejos, pero desaparecerá del equipo, los selects y la liquidación.`
      : `¿Eliminar a ${editando.nombre} del equipo? No tiene OTs registradas, se borrará por completo.`
    if (!confirm(msg)) return
    eliminarTecnico(editando.id, trabajos)
    setEditando(null)
    notify?.(`${editando.nombre} eliminado del equipo`, 'info')
  }

  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>Equipo técnico</h2>
          <p className="sub">{equipoActivo.length} mecánico{equipoActivo.length !== 1 ? 's' : ''} activo{equipoActivo.length !== 1 ? 's' : ''} · comisión {COMISION.TOTAL * 100}%</p>
        </div>
        <div className="actions">
          <button
            className={`btn btn-sm ${vistaAgenda ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setVistaAgenda(v => !v)}
          >
            {vistaAgenda ? 'Ver tarjetas' : 'Agenda semanal'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAgregando(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar técnico
          </button>
        </div>
      </div>

      {/* KPI row */}
      {/* Hero: comisiones del mes (el numero que el dueño revisa) + 2 mini */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-hero" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Comisiones del mes</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--green-700)', background: 'var(--green-100)', padding: '4px 10px', borderRadius: 999 }}>
              {equipoActivo.length} técnico{equipoActivo.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'clamp(34px, 5vw, 52px)', letterSpacing: '-1px', lineHeight: 1, color: 'var(--text)' }}>
              {fmt(totalComisionesMes)}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-3)', marginTop: 8, fontWeight: 500 }}>
              Acumulado por liquidar a técnicos
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10 }}>
          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic blue" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Técnicos activos</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 26, color: 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{equipoActivo.length}</div>
            </div>
          </div>

          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic amber" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Trabajos en curso</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 26, color: 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{totalActivos}</div>
            </div>
          </div>
        </div>
      </div>

      {vistaAgenda ? (
        <AgendaSemanal trabajos={trabajos} onNavigate={onNavigate} tecnicos={TECNICOS} />
      ) : (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
          {equipoActivo.map((tec) => (
            <div key={tec.id} className="card">
              <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Avatar + nombre + badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    className={`av av-${(tec.idx % 5) + 1}`}
                    style={{ width: 52, height: 52, fontSize: 16, flexShrink: 0 }}
                  >
                    {initials(tec.nombre)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{tec.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      Especialidad · {tec.especialidad}
                    </div>
                  </div>
                  {tec.libre
                    ? <span className="badge badge-s">Libre</span>
                    : <span className="badge badge-i">Ocupado</span>
                  }
                </div>

                {/* Telefono */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-3)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <span className="mono">{tec.telefono}</span>
                </div>

                {/* Stats grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  gap: 10,
                  padding: '12px 0',
                  borderTop: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{tec.activosCount}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Activos</div>
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{tec.completadosMes}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Este mes</div>
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--green-600)' }}>{fmt(tec.comisionMes)}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Comision</div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => onNavigate && onNavigate('trabajos')}>Ver trabajos</button>
                  <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => { setEditando(tec); setEditForm({ nombre: tec.nombre, especialidad: tec.especialidad, telefono: tec.telefono, cedula: tec.cedula || '' }) }}>Editar</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Inactivos: visibles pero apagados, con reactivación a un clic */}
        {equipoInactivo.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
              Inactivos ({equipoInactivo.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {equipoInactivo.map(tec => (
                <div key={tec.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: 'var(--bg-raised)', border: '1px dashed var(--border-strong)',
                  borderRadius: 12, opacity: .75,
                }}>
                  <span className={`av av-${(tec.idx % 5) + 1}`} style={{ width: 36, height: 36, fontSize: 12, flexShrink: 0, filter: 'grayscale(1)' }}>{initials(tec.nombre)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{tec.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{tec.especialidad} · {tec.totalTrabajos} OT{tec.totalTrabajos !== 1 ? 's' : ''} en historial</div>
                  </div>
                  <span className="badge badge-n">Inactivo</span>
                  <button className="btn btn-outline btn-sm" onClick={() => { setTecnicoActivo(tec.id, true); notify?.(`${tec.nombre} reactivado`, 'success') }}>Reactivar</button>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ color: 'var(--red-600)', borderColor: 'rgba(220,38,38,.35)' }}
                    onClick={() => {
                      const msg = tec.totalTrabajos > 0
                        ? `¿Eliminar a ${tec.nombre} del equipo?\n\nSu nombre se conservará en las ${tec.totalTrabajos} OT${tec.totalTrabajos !== 1 ? 's' : ''} del historial, pero desaparecerá del equipo.`
                        : `¿Eliminar a ${tec.nombre} del equipo? No tiene OTs, se borrará por completo.`
                      if (!confirm(msg)) return
                      eliminarTecnico(tec.id, trabajos)
                      notify?.(`${tec.nombre} eliminado del equipo`, 'info')
                    }}
                  >Eliminar</button>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
      )}

      {/* Modal Editar Técnico */}
      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal__h">
              <h3>Editar técnico</h3>
              <button className="icobtn" onClick={() => setEditando(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label>Nombre</label>
                <input className="input" value={editForm.nombre || ''} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="field">
                <label>Especialidad</label>
                <input className="input" value={editForm.especialidad || ''} onChange={e => setEditForm(f => ({ ...f, especialidad: e.target.value }))} placeholder="Frenos, Motor, General..." />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input className="input" value={editForm.telefono || ''} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))} placeholder="300 000 0000" />
              </div>
              <div className="field">
                <label>Cédula <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(para registrar el gasto en Cuentti)</span></label>
                <input className="input" value={editForm.cedula || ''} onChange={e => setEditForm(f => ({ ...f, cedula: e.target.value }))} placeholder="Sin puntos ni comas" />
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Zona de salida</div>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
                  Si el técnico ya no trabaja en el taller, márcalo inactivo: deja de aparecer
                  para asignar trabajos y liquidar, pero sus OTs del historial conservan su nombre.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" style={{ flex: 1, color: 'var(--amber-600)', borderColor: 'rgba(245,158,11,.4)' }} onClick={handleDesactivar}>
                    Marcar inactivo
                  </button>
                  <button className="btn btn-outline btn-sm" style={{ flex: 1, color: 'var(--red-600)', borderColor: 'rgba(220,38,38,.35)' }} onClick={handleEliminar}>
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-outline btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleGuardarEdicion}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar Técnico */}
      {agregando && (
        <div className="modal-overlay" onClick={() => setAgregando(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal__h">
              <h3>Agregar técnico</h3>
              <button className="icobtn" onClick={() => setAgregando(false)} aria-label="Cerrar">✕</button>
            </div>
            <form onSubmit={handleAgregar}>
              <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field">
                  <label>Nombre completo <span className="req">*</span></label>
                  <input className="input" value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre y apellido" autoFocus />
                </div>
                <div className="field">
                  <label>Especialidad</label>
                  <input className="input" value={nuevoForm.especialidad} onChange={e => setNuevoForm(f => ({ ...f, especialidad: e.target.value }))} placeholder="Frenos, Motor, General..." />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input className="input" value={nuevoForm.telefono} onChange={e => setNuevoForm(f => ({ ...f, telefono: e.target.value }))} placeholder="300 000 0000" />
                </div>
                <div className="field">
                  <label>Cédula <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(para Cuentti)</span></label>
                  <input className="input" value={nuevoForm.cedula} onChange={e => setNuevoForm(f => ({ ...f, cedula: e.target.value }))} placeholder="Sin puntos ni comas" />
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
                  Quedará disponible de inmediato para asignar trabajos y liquidar comisiones ({COMISION.TOTAL * 100}%).
                </p>
              </div>
              <div className="modal__f">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setAgregando(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary btn-sm">Agregar al equipo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function AgendaSemanal({ trabajos, onNavigate, tecnicos = [] }) {
  const dias = useMemo(() => {
    const hoy = new Date()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
    lunes.setHours(0, 0, 0, 0)

    const nombres = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
    const result = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes)
      d.setDate(lunes.getDate() + i)
      const fin = new Date(d)
      fin.setHours(23, 59, 59, 999)
      const trabajosDia = trabajos.filter(t => {
        const f = new Date(t.fecha)
        return f >= d && f <= fin && t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO
      })
      result.push({
        nombre: nombres[i],
        num: d.getDate(),
        esHoy: d.toDateString() === hoy.toDateString(),
        trabajos: trabajosDia,
      })
    }
    return result
  }, [trabajos])

  return (
    <div className="card">
      <div className="card__h"><h3>Agenda de la Semana</h3></div>
      <div className="card__b">
        <div className="calendar-week">
          {dias.map((dia, i) => (
            <div key={i} className={`calendar-day ${dia.esHoy ? 'today' : ''}`}>
              <div className="calendar-day-header">{dia.nombre}</div>
              <div className="calendar-day-num">{dia.num}</div>
              {dia.trabajos.map(t => {
                const tec = tecnicos.find(tc => tc.id === parseInt(t.tecnicoId))
                return (
                  <div key={t.id} className="calendar-task"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavigate && onNavigate('trabajos')}
                    title={`${t.placa} - ${t.cliente} (${tec?.nombre || 'Sin asignar'})\nClick para ver trabajos`}>
                    {t.placa} {tec ? `- ${tec.nombre.split(' ')[0]}` : ''}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
