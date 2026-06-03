import { useMemo, useState } from 'react'
import { fmt } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'

const ACTIVOS = [ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.EN_PROGRESO]

export default function Mecanicos({ trabajos, onNavigate }) {
  const [vistaAgenda, setVistaAgenda] = useState(false)
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState({})

  const tecnicosData = useMemo(() => {
    return TECNICOS.map((tec, idx) => {
      const misTrab = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id)
      const completados = misTrab.filter(t => t.estado === ESTADOS.COMPLETADO)
      const activos = misTrab.filter(t => ACTIVOS.includes(t.estado))

      const getMO = (t) => {
        if (typeof t?.manoObra === 'number') return t.manoObra
        if (Array.isArray(t?.items)) {
          return t.items.reduce((s, i) => {
            const tipo = (i?.tipo || i?.categoria || '').toString().toLowerCase()
            const esServ = i?.esServicio === true || tipo.includes('serv')
            return s + (esServ ? (parseFloat(i?.precio) || 0) * (parseInt(i?.cantidad) || 1) : 0)
          }, 0)
        }
        return 0
      }

      const now = new Date()
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
      const completadosMes = completados.filter(t => new Date(t.fecha) >= inicioMes)
      const comisionMes = completadosMes.reduce((s, t) => s + getMO(t) * COMISION.TOTAL, 0)

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
  }, [trabajos])

  const totalActivos = tecnicosData.reduce((s, t) => s + t.activosCount, 0)
  const totalComisionesMes = tecnicosData.reduce((s, t) => s + t.comisionMes, 0)

  const initials = (nombre) => nombre.split(' ').map(x => x[0]).slice(0, 2).join('')

  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>Equipo técnico</h2>
          <p className="sub">{TECNICOS.length} mecánicos · comisión {COMISION.TOTAL * 100}% c/u</p>
        </div>
        <div className="actions">
          <button
            className={`btn btn-sm ${vistaAgenda ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setVistaAgenda(v => !v)}
          >
            {vistaAgenda ? 'Ver Tarjetas' : 'Ver Agenda Semanal'}
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
              {TECNICOS.length} técnicos
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
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 26, color: 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{TECNICOS.length}</div>
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
        <AgendaSemanal trabajos={trabajos} onNavigate={onNavigate} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
          {tecnicosData.map((tec) => (
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
                  <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => onNavigate && onNavigate('trabajos')}>👁 Ver trabajos</button>
                  <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => { setEditando(tec); setEditForm({ nombre: tec.nombre, especialidad: tec.especialidad, telefono: tec.telefono }) }}>✏️ Editar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Editar Tecnico */}
      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal__h">
              <h3>Editar Tecnico</h3>
              <button className="icobtn" onClick={() => setEditando(null)}>✕</button>
            </div>
            <div className="modal__b">
              <div className="field">
                <label>Nombre</label>
                <input className="input" value={editForm.nombre || ''} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="field">
                <label>Especialidad</label>
                <input className="input" value={editForm.especialidad || ''} onChange={e => setEditForm(f => ({ ...f, especialidad: e.target.value }))} />
              </div>
              <div className="field">
                <label>Telefono</label>
                <input className="input" value={editForm.telefono || ''} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
                Los tecnicos se gestionan en <code>src/utils/constants.js</code>. Esta vista es de solo lectura por ahora.
              </p>
            </div>
            <div className="modal__f">
              <button className="btn btn-outline btn-sm" onClick={() => setEditando(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AgendaSemanal({ trabajos, onNavigate }) {
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
                const tec = TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))
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
