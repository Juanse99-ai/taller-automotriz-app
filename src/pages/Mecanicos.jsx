import { useMemo } from 'react'
import { fmt } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'

export default function Mecanicos({ trabajos }) {
  const tecnicosData = useMemo(() => {
    return TECNICOS.map(tec => {
      const misTrab = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id)
      const completados = misTrab.filter(t => t.estado === ESTADOS.COMPLETADO)
      const enProgreso = misTrab.filter(t => t.estado === ESTADOS.EN_PROGRESO || t.estado === ESTADOS.PENDIENTE)
      const totalFacturado = completados.reduce((s, t) => s + (t.total || 0), 0)
      const comisionTotal = completados.reduce((s, t) => s + ((t.manoObra || t.total || 0) * COMISION.TOTAL), 0)

      // Mes actual
      const now = new Date()
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
      const completadosMes = completados.filter(t => new Date(t.fecha) >= inicioMes)
      const facturadoMes = completadosMes.reduce((s, t) => s + (t.total || 0), 0)
      const comisionMes = completadosMes.reduce((s, t) => s + ((t.manoObra || t.total || 0) * COMISION.TOTAL), 0)

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

      {tecnicosData.map(tec => (
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
