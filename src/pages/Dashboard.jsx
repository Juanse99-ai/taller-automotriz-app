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
    <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
  </svg>
)
const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconTrend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </svg>
)
const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)
const IconArrow = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

export default function Dashboard({ trabajos }) {
  const stats = useMemo(() => {
    const total = trabajos.length
    const completados = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO).length
    const pendientes = trabajos.filter(t => t.estado === ESTADOS.PENDIENTE || t.estado === 'En Diagnostico').length
    const enProgreso = trabajos.filter(t => t.estado === ESTADOS.EN_PROGRESO || t.estado === 'Esperando Repuestos' || t.estado === 'En Prueba').length
    const now = new Date()
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
    const ingresosMes = trabajos
      .filter(t => new Date(t.fecha) >= inicioMes)
      .reduce((s, t) => s + (t.total || 0), 0)
    return { total, completados, pendientes, enProgreso, ingresosMes }
  }, [trabajos])

  const estancados = useMemo(() => {
    return trabajos.filter(t => {
      if (t.estado === ESTADOS.COMPLETADO || t.estado === ESTADOS.CANCELADO) return false
      const dias = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
      return dias >= DIAS_ESTANCADO
    })
  }, [trabajos])

  const recientes = useMemo(() => {
    return [...trabajos]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 8)
  }, [trabajos])

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
      weeks.push({ label: `S${8 - i}`, count })
    }
    return weeks
  }, [trabajos])

  const porTecnico = useMemo(() => {
    return TECNICOS.map(tec => {
      const trabajosTec = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id)
      const completados = trabajosTec.filter(t => t.estado === ESTADOS.COMPLETADO).length
      const ingresos = trabajosTec.reduce((s, t) => s + (t.total || 0), 0)
      return { nombre: tec.nombre.split(' ')[0], completados, ingresos }
    })
  }, [trabajos])

  const tecnicoNombre = (id) => {
    const t = TECNICOS.find(t => t.id === parseInt(id))
    return t ? t.nombre : '—'
  }

  const today = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div className="metric-card">
          <div className="metric-head">
            <div className="metric-icon metric-icon--red"><IconAlert /></div>
            <div className="metric-label">Pendientes</div>
          </div>
          <div className="metric-value">{stats.pendientes + stats.enProgreso}</div>
          {estancados.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500 }}>
              <span style={{ background: 'var(--red-100)', color: '#991b1b', padding: '1px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 700 }}>{estancados.length} estancados</span>
            </div>
          )}
        </div>
        <div className="metric-card">
          <div className="metric-head">
            <div className="metric-icon metric-icon--green"><IconTrend /></div>
            <div className="metric-label">Ingresos del mes</div>
          </div>
          <div className="metric-value">{fmt(stats.ingresosMes)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-head">
            <div className="metric-icon metric-icon--blue"><IconCheck /></div>
            <div className="metric-label">Completados</div>
          </div>
          <div className="metric-value">{stats.completados}</div>
        </div>
        <div className="metric-card">
          <div className="metric-head">
            <div className="metric-icon metric-icon--amber"><IconTotal /></div>
            <div className="metric-label">Total OTs</div>
          </div>
          <div className="metric-value">{stats.total}</div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Weekly chart */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card__h">
            <h3>Trabajos por semana</h3>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>
              Total: <b style={{ color: 'var(--text)' }}>{stats.total}</b>
            </span>
          </div>
          <div className="card__b">
            <div className="chart-bar-container">
              {semanales.map((s, i) => {
                const max = Math.max(...semanales.map(w => w.count), 1)
                const h = (s.count / max) * 100
                return (
                  <div key={i} className="chart-bar-wrapper">
                    <span className="chart-bar-value">{s.count}</span>
                    <div className="chart-bar" style={{
                      height: `${h}%`,
                      background: i === semanales.length - 1
                        ? 'linear-gradient(180deg, var(--amber-400) 0%, var(--amber-500) 100%)'
                        : undefined
                    }} />
                    <span className="chart-bar-label">{s.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Productividad por tecnico */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card__h">
            <h3>Productividad</h3>
            <span className="card__h .count" style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)' }}>{TECNICOS.length}</span>
          </div>
          <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>
            {porTecnico.map((t, i) => {
              const max = Math.max(...porTecnico.map(x => x.completados), 1)
              const pct = (t.completados / max) * 100
              const colors = ['var(--blue-500)', 'var(--green-500)', 'var(--amber-400)']
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t.nombre}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{t.completados}</span> · {fmt(t.ingresos)}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[i % colors.length]}dd)`, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Estancados alert */}
      {estancados.length > 0 && (
        <div className="card" style={{ marginBottom: 0, borderLeft: '4px solid var(--red-600)' }}>
          <div className="card__h">
            <h3 style={{ color: 'var(--red-600)' }}>Trabajos estancados</h3>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: '#991b1b', background: 'var(--red-100)', padding: '2px 8px', borderRadius: 999 }}>{estancados.length}</span>
          </div>
          <div className="card__b card__b--flush">
            <table>
              <thead>
                <tr><th>Placa</th><th>Cliente</th><th>Estado</th><th>Dias</th><th>Tecnico</th></tr>
              </thead>
              <tbody>
                {estancados.map(t => {
                  const dias = Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000)
                  return (
                    <tr key={t.id}>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text)' }}>{t.cliente || '—'}</td>
                      <td><span className="badge badge-warning">{t.estado}</span></td>
                      <td><span className="badge badge-danger">{dias}d</span></td>
                      <td style={{ fontSize: 12.5 }}>{tecnicoNombre(t.tecnicoId)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recientes */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card__h">
          <h3>Trabajos recientes</h3>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)' }}>{recientes.length}</span>
        </div>
        {recientes.length === 0 ? (
          <div className="card__b">
            <div className="empty-state">
              <div className="empty-state-icon">🔧</div>
              <p>No hay trabajos registrados.</p>
            </div>
          </div>
        ) : (
          <div className="card__b card__b--flush">
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th>Vehiculo</th>
                  <th>Tecnico</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map(t => {
                  const badgeClass = t.estado === ESTADOS.COMPLETADO ? 'badge-success'
                    : t.estado === ESTADOS.CANCELADO ? 'badge-danger'
                    : t.estado === ESTADOS.EN_PROGRESO ? 'badge-info' : 'badge-warning'
                  return (
                    <tr key={t.id}>
                      <td className="text-mono" style={{ fontWeight: 700, color: 'var(--blue-600)' }}>{t.placa || '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text)' }}>{t.cliente || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ fontSize: 12.5 }}>{tecnicoNombre(t.tecnicoId)}</td>
                      <td><span className={`badge ${badgeClass}`}>{t.estado}</span></td>
                      <td className="text-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(t.total)}</td>
                      <td className="text-mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>{fmtDate(t.fecha)}</td>
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
