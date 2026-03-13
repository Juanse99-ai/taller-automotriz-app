import { useState, useMemo } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'

export default function Reportes({ trabajos }) {
  const [rango, setRango] = useState(() => {
    const now = new Date()
    const inicio = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
      desde: inicio.toISOString().slice(0, 10),
      hasta: now.toISOString().slice(0, 10),
    }
  })

  const filtrados = useMemo(() => {
    const desde = new Date(rango.desde + 'T00:00:00')
    const hasta = new Date(rango.hasta + 'T23:59:59')
    return trabajos.filter(t => {
      const d = new Date(t.fecha)
      return d >= desde && d <= hasta
    })
  }, [trabajos, rango])

  const stats = useMemo(() => {
    const completados = filtrados.filter(t => t.estado === ESTADOS.COMPLETADO)
    const ingresos = completados.reduce((s, t) => s + (t.total || 0), 0)
    const comisiones = completados.reduce((s, t) => s + ((t.manoObra || t.total || 0) * COMISION.TOTAL), 0)

    // Por tecnico
    const porTecnico = TECNICOS.map(tec => {
      const susTrab = completados.filter(t => parseInt(t.tecnicoId) === tec.id)
      const facturado = susTrab.reduce((s, t) => s + (t.total || 0), 0)
      return { ...tec, cantidad: susTrab.length, facturado }
    })

    // Por estado
    const porEstado = Object.values(ESTADOS).map(estado => ({
      estado,
      cantidad: filtrados.filter(t => t.estado === estado).length,
    }))

    // Top vehiculos (por placa)
    const placaMap = {}
    filtrados.forEach(t => {
      if (!t.placa) return
      if (!placaMap[t.placa]) placaMap[t.placa] = { placa: t.placa, marca: t.marca, modelo: t.modelo, visitas: 0, total: 0 }
      placaMap[t.placa].visitas++
      placaMap[t.placa].total += t.total || 0
    })
    const topVehiculos = Object.values(placaMap).sort((a, b) => b.visitas - a.visitas).slice(0, 10)

    return { total: filtrados.length, completados: completados.length, ingresos, comisiones, porTecnico, porEstado, topVehiculos }
  }, [filtrados])

  const exportarCSV = () => {
    const headers = ['ID', 'Fecha', 'Placa', 'Cliente', 'Marca', 'Modelo', 'Tecnico', 'Estado', 'Total']
    const rows = filtrados.map(t => [
      t.id, t.fecha?.slice(0, 10) || '', t.placa, t.cliente,
      t.marca, t.modelo,
      TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))?.nombre || '',
      t.estado, t.total || 0,
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_${rango.desde}_${rango.hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Filtro de rango */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <div className="form-row" style={{ flex: 1, marginBottom: 0 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Desde</label>
              <input className="form-input" type="date" value={rango.desde}
                onChange={e => setRango(r => ({ ...r, desde: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Hasta</label>
              <input className="form-input" type="date" value={rango.hasta}
                onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))} />
            </div>
          </div>
          <button className="btn btn-outline" onClick={exportarCSV}>Exportar CSV</button>
        </div>
      </div>

      {/* Metricas principales */}
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
          <div className="metric-value">{fmt(stats.ingresos)}</div>
          <div className="metric-label">Ingresos</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{fmt(stats.comisiones)}</div>
          <div className="metric-label">Comisiones</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{fmt(stats.ingresos - stats.comisiones)}</div>
          <div className="metric-label">Neto Taller</div>
        </div>
      </div>

      {/* Por estado */}
      <div className="card">
        <div className="card-title">Distribucion por Estado</div>
        <div className="metrics-grid" style={{ marginBottom: 0 }}>
          {stats.porEstado.map(e => {
            const bc = e.estado === ESTADOS.COMPLETADO ? 'var(--green-500)'
              : e.estado === ESTADOS.CANCELADO ? 'var(--red-500)'
              : e.estado === ESTADOS.EN_PROGRESO ? 'var(--blue-500)' : 'var(--amber-500)'
            return (
              <div className="metric-card" key={e.estado}>
                <div className="metric-value" style={{ fontSize: 22, color: bc }}>{e.cantidad}</div>
                <div className="metric-label">{e.estado}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Por tecnico */}
      <div className="card">
        <div className="card-title">Rendimiento por Tecnico</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tecnico</th>
                <th>Especialidad</th>
                <th className="text-right">Trabajos</th>
                <th className="text-right">Facturado</th>
              </tr>
            </thead>
            <tbody>
              {stats.porTecnico.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.nombre}</td>
                  <td className="text-sm text-muted">{t.especialidad}</td>
                  <td className="text-right text-mono">{t.cantidad}</td>
                  <td className="text-right text-mono">{fmt(t.facturado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top vehiculos */}
      {stats.topVehiculos.length > 0 && (
        <div className="card">
          <div className="card-title">Vehiculos Frecuentes</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Vehiculo</th>
                  <th className="text-right">Visitas</th>
                  <th className="text-right">Total Facturado</th>
                </tr>
              </thead>
              <tbody>
                {stats.topVehiculos.map(v => (
                  <tr key={v.placa}>
                    <td className="text-mono" style={{ fontWeight: 700 }}>{v.placa}</td>
                    <td className="text-sm">{[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}</td>
                    <td className="text-right text-mono">{v.visitas}</td>
                    <td className="text-right text-mono">{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
