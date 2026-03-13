import { useState, useMemo } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'

export default function Liquidacion({ trabajos, notify }) {
  const [periodo, setPeriodo] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [tecnicoFiltro, setTecnicoFiltro] = useState('todos')

  // Filtrar trabajos completados del periodo
  const trabajosPeriodo = useMemo(() => {
    const [year, month] = periodo.split('-').map(Number)
    return trabajos.filter(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return false
      const d = new Date(t.fecha)
      return d.getFullYear() === year && (d.getMonth() + 1) === month
    })
  }, [trabajos, periodo])

  // Calcular comisiones por tecnico
  const liquidacion = useMemo(() => {
    const map = {}
    TECNICOS.forEach(t => {
      map[t.id] = { tecnico: t, trabajos: [], totalTrabajos: 0, comision: 0 }
    })

    trabajosPeriodo.forEach(t => {
      const tid = parseInt(t.tecnicoId)
      if (!tid || !map[tid]) return

      const manoObra = t.manoObra || t.total || 0
      const comisionTrabajo = manoObra * COMISION.TOTAL

      map[tid].trabajos.push(t)
      map[tid].totalTrabajos += manoObra
      map[tid].comision += comisionTrabajo
    })

    return Object.values(map)
  }, [trabajosPeriodo])

  const filtrados = tecnicoFiltro === 'todos'
    ? liquidacion
    : liquidacion.filter(l => l.tecnico.id === parseInt(tecnicoFiltro))

  const totales = useMemo(() => {
    return filtrados.reduce((acc, l) => ({
      trabajos: acc.trabajos + l.trabajos.length,
      facturado: acc.facturado + l.totalTrabajos,
      comisiones: acc.comisiones + l.comision,
    }), { trabajos: 0, facturado: 0, comisiones: 0 })
  }, [filtrados])

  return (
    <div>
      {/* Filtros */}
      <div className="card">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Periodo</label>
            <input className="form-input" type="month" value={periodo}
              onChange={e => setPeriodo(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Tecnico</label>
            <select className="form-select" value={tecnicoFiltro}
              onChange={e => setTecnicoFiltro(e.target.value)}>
              <option value="todos">Todos los tecnicos</option>
              {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{totales.trabajos}</div>
          <div className="metric-label">Trabajos Completados</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{fmt(totales.facturado)}</div>
          <div className="metric-label">Total Facturado</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--green-500)' }}>{fmt(totales.comisiones)}</div>
          <div className="metric-label">Total Comisiones ({COMISION.TOTAL * 100}%)</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{fmt(totales.facturado - totales.comisiones)}</div>
          <div className="metric-label">Neto Taller</div>
        </div>
      </div>

      {/* Detalle por tecnico */}
      {filtrados.map(l => (
        <div className="card" key={l.tecnico.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 2 }}>{l.tecnico.nombre}</div>
              <span className="text-sm text-muted">{l.tecnico.especialidad} — {l.trabajos.length} trabajos</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green-500)' }}>
                {fmt(l.comision)}
              </div>
              <span className="text-xs text-muted">Comision del periodo</span>
            </div>
          </div>

          {l.trabajos.length === 0 ? (
            <p className="text-sm text-muted text-center" style={{ padding: 20 }}>Sin trabajos completados en este periodo.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Placa</th>
                    <th>Cliente</th>
                    <th>Vehiculo</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Comision ({COMISION.TOTAL * 100}%)</th>
                  </tr>
                </thead>
                <tbody>
                  {l.trabajos.map(t => (
                    <tr key={t.id}>
                      <td className="text-sm text-muted">{fmtDate(t.fecha)}</td>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                      <td>{t.cliente || '—'}</td>
                      <td className="text-sm">{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td className="text-right text-mono">{fmt(t.manoObra || t.total)}</td>
                      <td className="text-right text-mono" style={{ color: 'var(--green-500)', fontWeight: 600 }}>
                        {fmt((t.manoObra || t.total) * COMISION.TOTAL)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--slate-50)' }}>
                    <td colSpan={4} style={{ fontWeight: 700 }}>Total {l.tecnico.nombre}</td>
                    <td className="text-right text-mono" style={{ fontWeight: 700 }}>{fmt(l.totalTrabajos)}</td>
                    <td className="text-right text-mono" style={{ fontWeight: 700, color: 'var(--green-500)' }}>{fmt(l.comision)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
