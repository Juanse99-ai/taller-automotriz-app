import { useMemo, useState } from 'react'
import { fmt } from '../utils/helpers'
import { COMISION, ESTADOS } from '../utils/constants'
import { manoObraBase } from '../utils/comision'
import { useTecnicos, tecnicosActivos, agregarTecnico, actualizarTecnico, setTecnicoActivo, eliminarTecnico } from '../services/tecnicos'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, Badge, IconX, IconEdit } from '../components/ui'

const ACTIVOS = [ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.EN_PROGRESO]

export default function Mecanicos({ trabajos, onNavigate, notify }) {
  const TECNICOS = useTecnicos()
  const [vistaAgenda, setVistaAgenda] = useState(false)
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [agregando, setAgregando] = useState(false)
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', especialidad: '', telefono: '', cedula: '' })
  const [confirmCfg, setConfirmCfg] = useState(null)

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
    const tec = editando
    const otsHistoria = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id).length
    const lead = otsHistoria > 0
      ? `Tiene ${otsHistoria} OT${otsHistoria !== 1 ? 's' : ''} en el historial: su nombre se conserva ahí, pero sale del equipo, los selects y la liquidación.`
      : 'No tiene OTs, se borra por completo.'
    setConfirmCfg({
      title: `Eliminar a ${tec.nombre}`,
      lead,
      confirmLabel: 'Eliminar',
      tone: 'danger',
      onConfirm: () => {
        eliminarTecnico(tec.id, trabajos)
        setEditando(null)
        notify?.(`${tec.nombre} eliminado del equipo`, 'info')
      },
    })
    return
  }

  return (
    <>
    <div>
      {/* La comision del mes se queda como cifra grande — es la que el dueño
          revisa. "Tecnicos activos" y "trabajos en curso" eran dos tarjetas mini
          de 180px para dos numeros de un digito: bajan a linea de apoyo. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Equipo técnico</h1>
          <div className="hd-head__sub">
            {equipoActivo.length} técnico{equipoActivo.length !== 1 ? 's' : ''} activo{equipoActivo.length !== 1 ? 's' : ''}
            {' · '}{equipoActivo.reduce((a, t) => a + t.activosCount, 0)} trabajos en curso
            {' · '}{equipoActivo.reduce((a, t) => a + t.completadosMes, 0)} completados este mes
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-fig">
            <div className="hd-fig__l">COMISIONES DEL MES</div>
            <div className="hd-fig__v">{fmt(totalComisionesMes)}</div>
            <div className="hd-fig__s">Acumulado por liquidar a técnicos</div>
          </div>
          <div className="hd-head__div" />
          <div className="hd-seg">
            <button type="button" className={`hd-seg__i${!vistaAgenda ? ' on' : ''}`} onClick={() => setVistaAgenda(false)}>Tarjetas</button>
            <button type="button" className={`hd-seg__i${vistaAgenda ? ' on' : ''}`} onClick={() => setVistaAgenda(true)}>Agenda</button>
          </div>
          <Button variant="primary" onClick={() => setAgregando(true)}>+ Agregar técnico</Button>
        </div>
      </div>

      {vistaAgenda ? (
        <AgendaSemanal trabajos={trabajos} onNavigate={onNavigate} tecnicos={TECNICOS} />
      ) : (
        <>
        {/* Tres tarjetas identicas repetian nueve rotulos (ACTIVOS / ESTE MES /
            COMISION, tres veces) para nueve numeros. En filas el rotulo se
            escribe una vez, en la cabecera, y las columnas se comparan de un
            vistazo — que es lo unico que se hace en esta pantalla. */}
        <div className="hd-card">
          <div className="hd-tbl">
            <div className="hd-tbl__h">
              <span style={{ flex: 1, minWidth: 0 }}>TÉCNICO</span>
              <span style={{ width: 92 }}>ESTADO</span>
              <span style={{ width: 124 }}>TELÉFONO</span>
              <span style={{ width: 74, textAlign: 'right' }}>ACTIVOS</span>
              <span style={{ width: 88, textAlign: 'right' }}>ESTE MES</span>
              <span style={{ width: 130, textAlign: 'right' }}>COMISIÓN</span>
              <span style={{ width: 190 }} />
            </div>
            <div className="hd-tbl__b">
              {equipoActivo.map(tec => (
                <div key={tec.id} className="hd-row" style={{ height: 62, cursor: 'default' }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className={`av av-${(tec.idx % 5) + 1}`} style={{ width: 38, height: 38, fontSize: 13.5, flex: 'none' }}>{initials(tec.nombre)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="hd-clip" style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{tec.nombre}</span>
                      <span className="hd-clip hd-sub" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>Especialidad · {tec.especialidad}</span>
                    </span>
                  </div>
                  <div style={{ width: 92 }}>
                    <span className={`hd-chip hd-chip--${tec.libre ? 'ok' : 'warn'}`}>{tec.libre ? 'LIBRE' : 'OCUPADO'}</span>
                  </div>
                  <div className="hd-mono" style={{ width: 124, fontSize: 12.5, color: 'var(--text-3)' }}>{tec.telefono || <span className="hd-empty">—</span>}</div>
                  {/* ACTIVOS se colorea solo cuando hay carga; en 0 se apaga. */}
                  <div className="hd-n" style={{ width: 74, fontSize: 15, fontWeight: tec.activosCount > 0 ? 700 : 400, color: tec.activosCount > 0 ? 'var(--warn-fg)' : 'var(--text-empty)' }}>{tec.activosCount}</div>
                  <div className="hd-n" style={{ width: 88, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{tec.completadosMes}</div>
                  <div className="hd-n" style={{ width: 130, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{fmt(tec.comisionMes)}</div>
                  {/* Ver trabajos se hace a diario; editar un tecnico, una vez al
                      año. Dejaban de ser dos botones del mismo tamaño. */}
                  <div style={{ width: 190, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button variant="outline" size="sm" onClick={() => onNavigate && onNavigate('trabajos')}>Ver trabajos</Button>
                    <Button variant="ghost" size="sm" className="btn-icon" aria-label="Editar técnico" title="Editar técnico"
                      onClick={() => { setEditando(tec); setEditForm({ nombre: tec.nombre, especialidad: tec.especialidad, telefono: tec.telefono, cedula: tec.cedula || '' }) }}>
                      <IconEdit />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hd-tbl__f">
              <span>{equipoActivo.length} técnico{equipoActivo.length !== 1 ? 's' : ''}</span>
              <span className="hd-bar__sp" />
              <span>Total del mes</span>
              <b>{fmt(totalComisionesMes)}</b>
            </div>
          </div>
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
                  <Badge tone="n">Inactivo</Badge>
                  <Button variant="outline" size="sm" onClick={() => { setTecnicoActivo(tec.id, true); notify?.(`${tec.nombre} reactivado`, 'success') }}>Reactivar</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ color: 'var(--red-600)', borderColor: 'rgba(220,38,38,.35)' }}
                    onClick={() => {
                      setConfirmCfg({
                        title: `Eliminar a ${tec.nombre}`,
                        lead: tec.totalTrabajos > 0
                          ? `Su nombre se conserva en las ${tec.totalTrabajos} OT${tec.totalTrabajos !== 1 ? 's' : ''} del historial, pero sale del equipo.`
                          : 'No tiene OTs, se borra por completo.',
                        confirmLabel: 'Eliminar',
                        tone: 'danger',
                        onConfirm: () => {
                          eliminarTecnico(tec.id, trabajos)
                          notify?.(`${tec.nombre} eliminado del equipo`, 'info')
                        },
                      })
                      return
                    }}
                  >Eliminar</Button>
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
              <button className="icobtn" onClick={() => setEditando(null)} aria-label="Cerrar"><IconX /></button>
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
                  <Button variant="outline" size="sm" style={{ flex: 1, color: 'var(--amber-600)', borderColor: 'rgba(245,158,11,.4)' }} onClick={handleDesactivar}>
                    Marcar inactivo
                  </Button>
                  <Button variant="outline" size="sm" style={{ flex: 1, color: 'var(--red-600)', borderColor: 'rgba(220,38,38,.35)' }} onClick={handleEliminar}>
                    Eliminar
                  </Button>
                </div>
              </div>
            </div>
            <div className="modal__f">
              <Button variant="outline" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button variant="primary" size="sm" onClick={handleGuardarEdicion}>Guardar cambios</Button>
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
              <button className="icobtn" onClick={() => setAgregando(false)} aria-label="Cerrar"><IconX /></button>
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
                <Button type="button" variant="outline" size="sm" onClick={() => setAgregando(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" size="sm">Agregar al equipo</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </>
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
