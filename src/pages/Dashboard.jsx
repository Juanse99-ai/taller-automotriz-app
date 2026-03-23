import { useMemo } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { ESTADOS, TECNICOS } from '../utils/constants'

const IconTotal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="4" rx="1"/>
    <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
    <line x1="9" y1="16" x2="13" y2="16"/>
  </svg>
)

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
)

const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
)

const IconTrend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
)

export default function Dashboard({ trabajos }) {
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
          <div className="metric-icon metric-icon--blue"><IconTotal /></div>
          <div className="metric-value">{stats.total}</div>
          <div className="metric-label">Total Trabajos</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon metric-icon--green"><IconCheck /></div>
          <div className="metric-value">{stats.completados}</div>
          <div className="metric-label">Completados</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon metric-icon--amber"><IconClock /></div>
          <div className="metric-value">{stats.enProgreso}</div>
          <div className="metric-label">Pendientes</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon metric-icon--blue"><IconTrend /></div>
          <div className="metric-value">{fmt(stats.ingresosMes)}</div>
          <div className="metric-label">Ingresos del Mes</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Trabajos Recientes</div>
        {recientes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔧</div>
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
