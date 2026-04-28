import { useMemo } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { ESTADOS, TECNICOS, DIAS_ESTANCADO } from '../utils/constants'

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

  // Trabajos por semana (ultimas 8 semanas)
  const semanales = useMemo(() => {
    const weeks = []
    const now = new Date()
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now)
      start.setDate(now.getDate() - (i * 7 + now.getDay()))
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(start.getDate() + 7)
      const count = trabajos.filter(t => {
        const f = new Date(t.fecha)
        return f >= start && f < end
      }).length
      const label = `S${8 - i}`
      weeks.push({ label, count })
    }
    return weeks
  }, [trabajos])

  // Productividad por tecnico
  const porTecnico = useMemo(() => {
    return TECNICOS.map(tec => {
      const trabajosTec = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id)
      const completados = trabajosTec.filter(t => t.estado === ESTADOS.COMPLETADO).length
      const ingresos = trabajosTec.reduce((s, t) => s + (t.total || 0), 0)
      return { nombre: tec.nombre.split(' ')[0], completados, ingresos }
    })
  }, [trabajos])

  // Trabajos estancados
  const estancados = useMemo(() => {
    return trabajos.filter(t => {
      if (t.estado === ESTADOS.COMPLETADO || t.estado === ESTADOS.CANCELADO) return false
      const dias = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
      return dias >= DIAS_ESTANCADO
    })
  }, [trabajos])

  const tecnicoNombre = (id) => {
    const t = TECNICOS.find(t => t.id === parseInt(id))
    return t ? t.nombre : '—'
  }

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-head">
            <div className="metric-icon metric-icon--blue"><IconTotal /></div>
            <div className="metric-label">Total Trabajos</div>
          </div>
          <div className="metric-value">{stats.total}</div>
        </div>
        <div className="metric-card">
          <div className="metric-head">
            <div className="metric-icon metric-icon--green"><IconCheck /></div>
            <div className="metric-label">Completados</div>
          </div>
          <div className="metric-value">{stats.completados}</div>
        </div>
        <div className="metric-card">
          <div className="metric-head">
            <div className="metric-icon metric-icon--amber"><IconClock /></div>
            <div className="metric-label">Pendientes</div>
          </div>
          <div className="metric-value">{stats.enProgreso}</div>
        </div>
        <div className="metric-card">
          <div className="metric-head">
            <div className="metric-icon metric-icon--blue"><IconTrend /></div>
            <div className="metric-label">Ingresos del Mes</div>
          </div>
          <div className="metric-value">{fmt(stats.ingresosMes)}</div>
        </div>
      </div>

      {/* Graficos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginBottom: 18 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">Trabajos por Semana</div>
          <div className="chart-bar-container">
            {semanales.map((s, i) => {
              const max = Math.max(...semanales.map(w => w.count), 1)
              const h = (s.count / max) * 100
              return (
                <div key={i} className="chart-bar-wrapper">
                  <span className="chart-bar-value">{s.count}</span>
                  <div className="chart-bar" style={{ height: `${h}%`, background: i === semanales.length - 1 ? 'linear-gradient(180deg, var(--amber-400) 0%, var(--amber-500) 100%)' : undefined }} />
                  <span className="chart-bar-label">{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">Productividad por Tecnico</div>
          <div className="chart-bar-container">
            {porTecnico.map((t, i) => {
              const max = Math.max(...porTecnico.map(x => x.completados), 1)
              const h = (t.completados / max) * 100
              const colors = ['var(--blue-500)', 'var(--green-500)', 'var(--amber-400)']
              return (
                <div key={i} className="chart-bar-wrapper">
                  <span className="chart-bar-value">{t.completados}</span>
                  <div className="chart-bar" style={{ height: `${h}%`, background: colors[i % colors.length] }} />
                  <span className="chart-bar-label">{t.nombre}</span>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 16, justifyContent: 'center' }}>
            {porTecnico.map((t, i) => (
              <span key={i} className="text-xs text-muted">{t.nombre}: {fmt(t.ingresos)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Trabajos estancados */}
      {estancados.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--red-500)' }}>
          <div className="card-title" style={{ color: 'var(--red-500)' }}>Trabajos Estancados ({estancados.length})</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Dias</th>
                  <th>Tecnico</th>
                </tr>
              </thead>
              <tbody>
                {estancados.map(t => {
                  const dias = Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000)
                  return (
                    <tr key={t.id}>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                      <td>{t.cliente || '—'}</td>
                      <td><span className="badge badge-warning">{t.estado}</span></td>
                      <td><span className="badge badge-danger">{dias}d</span></td>
                      <td className="text-sm">{tecnicoNombre(t.tecnicoId)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
