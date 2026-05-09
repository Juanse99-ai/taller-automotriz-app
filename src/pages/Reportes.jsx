import { useState, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS, TALLER } from '../utils/constants'

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
    const comisiones = completados.reduce((s, t) => s + (getMO(t) * COMISION.TOTAL), 0)

    // Por tecnico — solo mano de obra (servicios), no repuestos
    const porTecnico = TECNICOS.map(tec => {
      const susTrab = completados.filter(t => parseInt(t.tecnicoId) === tec.id)
      const manoObra = susTrab.reduce((s, t) => s + getMO(t), 0)
      return { ...tec, cantidad: susTrab.length, facturado: manoObra }
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

  const exportarResumen = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('Reporte de Taller', 14, 14)
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text(TALLER.razonSocial || TALLER.nombre, 14, 20)
    doc.setFont(undefined, 'normal')
    doc.text(`NIT: ${TALLER.nit} · ${TALLER.direccion}`, 14, 24)
    doc.text(`Cel: ${TALLER.celular} · ${TALLER.email}`, 14, 28)
    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.text(`Periodo: ${rango.desde} a ${rango.hasta}`, 14, 35)

    autoTable(doc, {
      startY: 40,
      head: [['Metrica', 'Valor']],
      body: [
        ['Total Trabajos', String(stats.total)],
        ['Completados', String(stats.completados)],
        ['Ingresos', fmt(stats.ingresos)],
        ['Comisiones', fmt(stats.comisiones)],
        ['Neto Taller', fmt(stats.ingresos - stats.comisiones)],
      ],
      headStyles: { fillColor: [30, 41, 59] },
    })

    autoTable(doc, {
      head: [['Tecnico', 'Trabajos', 'Facturado']],
      body: stats.porTecnico.map(t => [t.nombre, String(t.cantidad), fmt(t.facturado)]),
      headStyles: { fillColor: [30, 41, 59] },
      startY: doc.lastAutoTable.finalY + 8,
    })

    autoTable(doc, {
      head: [['Estado', 'Cantidad']],
      body: stats.porEstado.filter(e => e.cantidad > 0).map(e => [e.estado, String(e.cantidad)]),
      headStyles: { fillColor: [30, 41, 59] },
      startY: doc.lastAutoTable.finalY + 8,
    })

    doc.save(`reporte_${rango.desde}_${rango.hasta}.pdf`)
  }

  // Presets rapidos de rango de fechas
  const aplicarPreset = (preset) => {
    const now = new Date()
    const yyyymmdd = (d) => d.toISOString().slice(0, 10)
    let desde, hasta = yyyymmdd(now)
    switch (preset) {
      case 'hoy':
        desde = hasta
        break
      case 'semana': {
        const d = new Date(now)
        d.setDate(d.getDate() - 6)
        desde = yyyymmdd(d)
        break
      }
      case 'mes':
        desde = yyyymmdd(new Date(now.getFullYear(), now.getMonth(), 1))
        break
      case 'mesPasado': {
        desde = yyyymmdd(new Date(now.getFullYear(), now.getMonth() - 1, 1))
        hasta = yyyymmdd(new Date(now.getFullYear(), now.getMonth(), 0))
        break
      }
      case 'trimestre': {
        const d = new Date(now)
        d.setMonth(d.getMonth() - 3)
        desde = yyyymmdd(d)
        break
      }
      case 'anio':
        desde = `${now.getFullYear()}-01-01`
        break
      case 'todo':
        desde = '2020-01-01'
        break
      default:
        return
    }
    setRango({ desde, hasta })
  }

  return (
    <div>
      <div className="pagehd">
        <div><h2>Reportes</h2><p className="sub">Metricas del periodo {fmtDate(rango.desde)} al {fmtDate(rango.hasta)} · {filtrados.length} {filtrados.length === 1 ? 'OT' : 'OTs'}</p></div>
        <div className="actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={exportarCSV}>📊 CSV</button>
          <button className="btn btn-outline btn-sm" onClick={() => exportarResumen()}>📄 PDF</button>
        </div>
      </div>

      {/* Filtros rapidos + custom */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__b" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Periodo rapido</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                ['hoy', 'Hoy'],
                ['semana', '7 dias'],
                ['mes', 'Mes actual'],
                ['mesPasado', 'Mes pasado'],
                ['trimestre', '3 meses'],
                ['anio', 'Este año'],
                ['todo', 'Todo'],
              ].map(([k, l]) => (
                <button key={k} type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => aplicarPreset(k)}
                  style={{ padding: '5px 12px', fontSize: 12 }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: 'var(--border)', margin: '0 6px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Personalizado</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" type="date" value={rango.desde} onChange={e => setRango(r => ({...r, desde: e.target.value}))} style={{ width: 150, fontSize: 13 }} />
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>→</span>
              <input className="input" type="date" value={rango.hasta} onChange={e => setRango(r => ({...r, hasta: e.target.value}))} style={{ width: 150, fontSize: 13 }} />
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,marginBottom:18}}>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div className="kpi__lbl">Total trabajos</div></div><div className="kpi__v">{stats.total}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic green"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg></div><div className="kpi__lbl">Completados</div></div><div className="kpi__v" style={{color:'var(--green-600)'}}>{stats.completados}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic amber"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div><div className="kpi__lbl">Ingresos</div></div><div className="kpi__v">{fmt(stats.ingresos)}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic red"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div className="kpi__lbl">Comisiones</div></div><div className="kpi__v">{fmt(stats.comisiones)}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic green"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div><div className="kpi__lbl">Neto taller</div></div><div className="kpi__v" style={{color:'var(--green-600)'}}>{fmt(stats.ingresos - stats.comisiones)}</div></div>
      </div>

      {/* Distribution by state - stacked bar */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card__h"><h3>Distribucion por estado</h3></div>
        <div className="card__b" style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'flex',height:14,borderRadius:7,overflow:'hidden',border:'1px solid var(--border)'}}>
            {stats.porEstado.filter(e=>e.cantidad>0).map((e,i)=>{
              const colors = {'Completado':'var(--green-500)','Cancelado':'var(--red-500)','En Proceso':'var(--blue-500)','Pendiente':'var(--amber-400)','En Diagnostico':'var(--blue-400)','Esperando Repuestos':'var(--amber-500)','En Prueba':'var(--purple-500,#7c3aed)','Programado':'var(--slate-400)'}
              return <div key={i} style={{width:`${(e.cantidad/stats.total)*100}%`,background:colors[e.estado]||'var(--slate-400)'}}/>
            })}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:9}}>
            {stats.porEstado.filter(e=>e.cantidad>0).map((e,i)=>{
              const colors = {'Completado':'var(--green-500)','Cancelado':'var(--red-500)','En Proceso':'var(--blue-500)','Pendiente':'var(--amber-400)','En Diagnostico':'var(--blue-400)','Esperando Repuestos':'var(--amber-500)','En Prueba':'var(--purple-500,#7c3aed)','Programado':'var(--slate-400)'}
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:10,fontSize:13}}>
                  <div style={{width:10,height:10,borderRadius:3,background:colors[e.estado]||'var(--slate-400)',flexShrink:0}}/>
                  <span style={{flex:1,fontWeight:500}}>{e.estado}</span>
                  <span className="mono" style={{fontWeight:700}}>{e.cantidad}</span>
                  <span className="mono" style={{color:'var(--text-3)'}}>{stats.total>0?Math.round(e.cantidad/stats.total*100):0}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Technician ranking */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card__h"><h3>Rendimiento del equipo</h3></div>
        <div className="card__b card__b--flush">
          <table className="tbl">
            <thead><tr><th>Mecánico</th><th className="c-right">Trabajos</th><th className="c-right">Mano de obra</th><th style={{width:'25%'}}/></tr></thead>
            <tbody>
              {stats.porTecnico.map((t,i)=>{
                const maxFact = Math.max(...stats.porTecnico.map(x=>x.facturado),1)
                const pct = Math.round((t.facturado/maxFact)*100)
                return (
                  <tr key={t.id}>
                    <td><div style={{display:'flex',alignItems:'center',gap:10}}><span className={`av av-${(i%5)+1}`}>{t.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><span style={{fontWeight:600}}>{t.nombre}</span></div></td>
                    <td className="c-mono c-right" style={{fontWeight:700}}>{t.cantidad}</td>
                    <td className="c-mono c-right" style={{fontWeight:700,color:'var(--green-600)'}}>{fmt(t.facturado)}</td>
                    <td>
                      <div style={{height:6,background:'var(--bg-subtle)',borderRadius:3,overflow:'hidden',border:'1px solid var(--border)'}}>
                        <div style={{width:`${pct}%`,height:'100%',background:pct>=70?'var(--green-500)':'var(--amber-400)'}}/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top vehicles */}
      {stats.topVehiculos.length > 0 && (
        <div className="card">
          <div className="card__h"><h3>Vehiculos frecuentes</h3><span className="count">{stats.topVehiculos.length}</span></div>
          <div className="card__b card__b--flush">
            <table className="tbl">
              <thead><tr><th>Placa</th><th>Vehículo</th><th className="c-right">Visitas</th><th className="c-right">Total facturado</th></tr></thead>
              <tbody>
                {stats.topVehiculos.map(v=>(
                  <tr key={v.placa}>
                    <td className="c-mono" style={{fontWeight:700}}>{v.placa}</td>
                    <td className="c-muted">{[v.marca,v.modelo].filter(Boolean).join(' ')||'—'}</td>
                    <td className="c-mono c-right" style={{fontWeight:700}}>{v.visitas}</td>
                    <td className="c-mono c-right" style={{fontWeight:700}}>{fmt(v.total)}</td>
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
