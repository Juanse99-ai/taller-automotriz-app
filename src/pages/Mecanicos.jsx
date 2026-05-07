import { useMemo, useState } from 'react'
import { fmt } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'

const ACTIVOS = [ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.EN_PROGRESO]

export default function Mecanicos({ trabajos, onNavigate }) {
  const [vistaAgenda, setVistaAgenda] = useState(false)

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi__head"><span>Técnicos activos</span><span className="kpi__ic blue">👷</span></div>
          <div className="kpi__v">{TECNICOS.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><span>Trabajos en curso</span><span className="kpi__ic amber">🔧</span></div>
          <div className="kpi__v">{totalActivos}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><span>Comisiones del mes</span><span className="kpi__ic green">💰</span></div>
          <div className="kpi__v" style={{ fontSize: 20 }}>{fmt(totalComisionesMes)}</div>
        </div>
      </div>

      {vistaAgenda ? (
        <AgendaSemanal trabajos={trabajos} />
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

                {/* Teléfono */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-3)' }}>
                  <span>📞</span>
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
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Comisión</div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => onNavigate && onNavigate('trabajos')}>👁 Ver trabajos</button>
                  <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => alert(`Editar tecnico: ${tec.nombre}\n(Funcion en desarrollo)`)}>✏️ Editar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgendaSemanal({ trabajos }) {
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
                    title={`${t.placa} - ${t.cliente} (${tec?.nombre || 'Sin asignar'})`}>
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
