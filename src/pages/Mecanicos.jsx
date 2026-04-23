import { useMemo, useState } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'

export default function Mecanicos({ trabajos }) {
  const [vistaAgenda, setVistaAgenda] = useState(false)

  const tecnicosData = useMemo(() => {
    return TECNICOS.map(tec => {
      const misTrab = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id)
      const completados = misTrab.filter(t => t.estado === ESTADOS.COMPLETADO)
      const enProgreso = misTrab.filter(t => t.estado === ESTADOS.EN_PROGRESO || t.estado === ESTADOS.PENDIENTE)
      // Mano de obra: solo servicios, no repuestos
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
      const totalFacturado = completados.reduce((s, t) => s + getMO(t), 0)
      const comisionTotal = completados.reduce((s, t) => s + (getMO(t) * COMISION.TOTAL), 0)

      // Mes actual
      const now = new Date()
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
      const completadosMes = completados.filter(t => new Date(t.fecha) >= inicioMes)
      const facturadoMes = completadosMes.reduce((s, t) => s + getMO(t), 0)
      const comisionMes = completadosMes.reduce((s, t) => s + (getMO(t) * COMISION.TOTAL), 0)

      return {
        ...tec,
        totalTrabajos: misTrab.length,
        completados: completados.length,
        enProgreso: enProgreso.length,
        totalFacturado,
        comisionTotal,
        completadosMes: completadosMes.length,
        facturadoMes,
        comisionMes,
      }
    })
  }, [trabajos])

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{TECNICOS.length}</div>
          <div className="metric-label">Tecnicos Activos</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">
            {tecnicosData.reduce((s, t) => s + t.enProgreso, 0)}
          </div>
          <div className="metric-label">Trabajos en Curso</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{fmt(tecnicosData.reduce((s, t) => s + t.comisionMes, 0))}</div>
          <div className="metric-label">Comisiones del Mes</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className={`btn btn-sm ${vistaAgenda ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setVistaAgenda(v => !v)}>
          {vistaAgenda ? 'Ver Tarjetas' : 'Ver Agenda Semanal'}
        </button>
      </div>

      {vistaAgenda ? (
        <AgendaSemanal trabajos={trabajos} />
      ) : null}

      {!vistaAgenda && tecnicosData.map(tec => (
        <div className="card" key={tec.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>{tec.nombre}</div>
              <p className="text-sm text-muted">Especialidad: {tec.especialidad} — Tel: {tec.telefono}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`badge ${tec.enProgreso > 0 ? 'badge-info' : 'badge-success'}`}>
                {tec.enProgreso > 0 ? `${tec.enProgreso} en curso` : 'Disponible'}
              </span>
            </div>
          </div>

          <div className="metrics-grid" style={{ marginTop: 16, marginBottom: 0 }}>
            <div className="metric-card">
              <div className="metric-value" style={{ fontSize: 20 }}>{tec.totalTrabajos}</div>
              <div className="metric-label">Total Trabajos</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ fontSize: 20, color: 'var(--green-500)' }}>{tec.completados}</div>
              <div className="metric-label">Completados</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ fontSize: 20 }}>{fmt(tec.facturadoMes)}</div>
              <div className="metric-label">Facturado Mes</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ fontSize: 20, color: 'var(--green-500)' }}>{fmt(tec.comisionMes)}</div>
              <div className="metric-label">Comision Mes ({COMISION.TOTAL * 100}%)</div>
            </div>
          </div>
        </div>
      ))}
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
      <div className="card-title">Agenda de la Semana</div>
      <div className="calendar-week">
        {dias.map((dia, i) => (
          <div key={i} className={`calendar-day ${dia.esHoy ? 'today' : ''}`}>
            <div className="calendar-day-header">{dia.nombre}</div>
            <div className="calendar-day-num">{dia.num}</div>
            {dia.trabajos.map(t => {
              const tec = TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))
              return (
                <div key={t.id} className="calendar-task" title={`${t.placa} - ${t.cliente} (${tec?.nombre || 'Sin asignar'})`}>
                  {t.placa} {tec ? `- ${tec.nombre.split(' ')[0]}` : ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
