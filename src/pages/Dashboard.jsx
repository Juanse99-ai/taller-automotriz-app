import { useMemo } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { ESTADOS, TECNICOS } from '../utils/constants'

export default function Dashboard({ trabajos, loading }) {
  const stats = useMemo(() => {
    const total = trabajos.length
    const completados = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO).length
    const enProgreso = trabajos.filter(t => t.estado === ESTADOS.EN_PROGRESO || t.estado === ESTADOS.PENDIENTE).length
    const now = new Date()
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
    const ingresosMes = trabajos
      .filter(t => new Date(t.fecha) >= inicioMes)
      .reduce((s, t) => s + (t.total || 0), 0)
    return { total, completados, enProgreso, ingresosMes }
  }, [trabajos])

  const recientes = useMemo(() => {
    return [...trabajos]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 8)
  }, [trabajos])

  const tecnicoNombre = (id) => {
    const t = TECNICOS.find(t => t.id === parseInt(id))
    return t ? t.nombre : '—'
  }

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{stats.total}</div>
          <div className="metric-label">Total Trabajos</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--green-500)' }}>{stats.completados}</div>
          <div className="metric-label">Completados</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--amber-500)' }}>{stats.enProgreso}</div>
          <div className="metric-label">Pendientes</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{fmt(stats.ingresosMes)}</div>
          <div className="metric-label">Ingresos del Mes</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Trabajos Recientes</div>
        {recientes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>No hay trabajos registrados.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Vehiculo</th>
                  <th>Placa</th>
                  <th>Tecnico</th>
                  <th>Estado</th>
                  <th className="text-right">Total</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map(t => {
                  const badgeClass = t.estado === ESTADOS.COMPLETADO ? 'badge-success'
                    : t.estado === ESTADOS.CANCELADO ? 'badge-danger' : 'badge-warning'
                  return (
                    <tr key={t.id}>
                      <td className="text-mono text-sm">{t.id}</td>
                      <td>{t.cliente || '—'}</td>
                      <td className="text-sm">{[t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || '—'}</td>
                      <td className="text-mono">{t.placa || '—'}</td>
                      <td className="text-sm">{tecnicoNombre(t.tecnicoId)}</td>
                      <td><span className={`badge ${badgeClass}`}>{t.estado}</span></td>
                      <td className="text-right text-mono">{fmt(t.total)}</td>
                      <td className="text-sm text-muted">{fmtDate(t.fecha)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
