import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

// Obtener base de mano de obra (solo servicios) para un trabajo
const getManoObra = (t) => {
  if (typeof t?.manoObra === 'number' && !Number.isNaN(t.manoObra)) return t.manoObra
  if (typeof t?.mano_obra === 'number' && !Number.isNaN(t.mano_obra)) return t.mano_obra

  if (Array.isArray(t?.items) && t.items.length) {
    const suma = t.items.reduce((s, i) => {
      const precio = parseFloat(i?.precio) || 0
      const cant = parseInt(i?.cantidad) || 1
      const tipo = (i?.tipo || i?.categoria || '').toString().toLowerCase()
      const esServ = i?.esServicio === true
        || i?.es_servicio === 1
        || tipo.includes('serv')
      return s + (esServ ? precio * cant : 0)
    }, 0)
    return Math.max(0, suma)
  }

  return 0
}

const PRESETS = {
  DIA: 'dia',
  SEMANA: '7',
  QUINCENA: '15',
  MES: '30',
  RANGO: 'rango',
}

export default function Liquidacion({ trabajos, notify }) {
  const todayIso = () => new Date().toISOString().slice(0, 10)

  const [preset, setPreset] = useState(PRESETS.DIA)
  const [rango, setRango] = useState({
    inicio: todayIso(),
    fin: todayIso(),
  })
  const [tecnicoFiltro, setTecnicoFiltro] = useState('todos')
  const [movimientos, setMovimientos] = useState(() => lsGet(LS_KEYS.MOVIMIENTOS_TECNICOS, []))
  const [liquidados, setLiquidados] = useState(() => lsGet('liquidados', []))
  const [compartidos, setCompartidos] = useState(() => lsGet('trabajos_compartidos', {}))
  const [historial, setHistorial] = useState(() => lsGet('liquidacion_historial', []))
  const [verHistorial, setVerHistorial] = useState(false)
  const [movForm, setMovForm] = useState({
    tecnicoId: '',
    tipo: 'adelanto',
    monto: '',
    nota: '',
    referencia: '',
    fecha: new Date().toISOString().slice(0, 10),
  })

  const guardarMovs = (next) => {
    setMovimientos(next)
    lsSet(LS_KEYS.MOVIMIENTOS_TECNICOS, next)
  }

  const guardarLiquidados = (next) => {
    setLiquidados(next)
    lsSet('liquidados', next)
  }

  const guardarHistorial = (next) => {
    setHistorial(next)
    lsSet('liquidacion_historial', next)
  }

  const guardarCompartidos = (next) => {
    setCompartidos(next)
    lsSet('trabajos_compartidos', next)
  }

  const toggleCompartido = (trabajoId) => {
    const next = { ...compartidos }
    if (next[trabajoId]) {
      delete next[trabajoId]
    } else {
      next[trabajoId] = true
    }
    guardarCompartidos(next)
  }

  const agregarMovimiento = (e) => {
    e?.preventDefault?.()
    const monto = Math.abs(parseFloat(movForm.monto) || 0)
    if (!movForm.tecnicoId || !monto) {
      notify('Selecciona tecnico y monto', 'error')
      return
    }

    const nuevo = {
      id: `MV-${uid()}`,
      tecnicoId: parseInt(movForm.tecnicoId),
      tipo: movForm.tipo,
      monto,
      nota: movForm.nota,
      referencia: movForm.referencia,
      fecha: movForm.fecha,
    }
    guardarMovs([...movimientos, nuevo])
    setMovForm(f => ({ ...f, monto: '', nota: '', referencia: '' }))
    notify('Movimiento registrado', 'success')
  }

  const eliminarMovimiento = (id) => {
    guardarMovs(movimientos.filter(m => m.id !== id))
  }

  // ---- Export helpers ----
  const buildPeriodLabel = () => {
    const fmtD = (d) => d.toISOString().slice(0, 10)
    return `${fmtD(rangoFechas.inicio)} a ${fmtD(rangoFechas.fin)}`
  }

  const loadLogo = async () => {
    try {
      const res = await fetch('/logo.png')
      if (!res.ok) return null
      const type = res.headers.get('content-type') || ''
      if (!type.includes('image')) return null
      const blob = await res.blob()
      return await new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  const rangoFechas = useMemo(() => {
    const fin = new Date(rango.fin + 'T23:59:59')
    let inicio
    if (preset === PRESETS.DIA) {
      inicio = new Date(rango.fin + 'T00:00:00')
    } else if (preset === PRESETS.SEMANA) {
      inicio = new Date(fin)
      inicio.setDate(fin.getDate() - 6)
    } else if (preset === PRESETS.QUINCENA) {
      inicio = new Date(fin)
      inicio.setDate(fin.getDate() - 14)
    } else if (preset === PRESETS.MES) {
      inicio = new Date(fin)
      inicio.setDate(fin.getDate() - 29)
    } else {
      inicio = new Date(rango.inicio + 'T00:00:00')
    }
    return { inicio, fin }
  }, [preset, rango])

  // Filtrar trabajos completados del periodo (excluyendo ya liquidados)
  const trabajosPeriodo = useMemo(() => {
    return trabajos.filter(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return false
      if (liquidados.includes(t.id)) return false
      const d = new Date(t.fecha)
      return d >= rangoFechas.inicio && d <= rangoFechas.fin
    })
  }, [trabajos, rangoFechas, liquidados])

  // Calcular comisiones por tecnico
  const baseLiquidacion = useMemo(() => {
    const map = {}
    TECNICOS.forEach(t => {
      map[t.id] = { tecnico: t, trabajos: [], totalTrabajos: 0, comision: 0, cargos: 0, neto: 0 }
    })

    let facturadoTotal = 0
    let comisionesTotal = 0

    trabajosPeriodo.forEach(t => {
      const tid = parseInt(t.tecnicoId)
      const manoObra = getManoObra(t)
      const comisionTrabajo = manoObra * COMISION.TOTAL
      const esCompartido = compartidos[t.id] === true

      if (esCompartido) {
        // Pedro (1) + Victor (2) se reparten 50/50
        ;[1, 2].forEach(id => {
          map[id].trabajos.push(t)
          map[id].totalTrabajos += manoObra
          map[id].comision += comisionTrabajo / 2
        })
      } else if (map[tid]) {
        map[tid].trabajos.push(t)
        map[tid].totalTrabajos += manoObra
        map[tid].comision += comisionTrabajo
      }

      facturadoTotal += manoObra
      comisionesTotal += comisionTrabajo
    })

    // Aplicar cargos/adelantos
    movimientos.forEach(m => {
      const mid = parseInt(m.tecnicoId)
      const monto = Math.abs(parseFloat(m.monto) || 0)
      if (map[mid]) map[mid].cargos += monto
    })

    let cargosTotal = 0
    let netoTotal = 0
    Object.values(map).forEach(l => {
      l.neto = l.comision - l.cargos
      cargosTotal += l.cargos
      netoTotal += l.neto
    })

    return {
      lista: Object.values(map),
      totalesPeriodo: {
        trabajos: trabajosPeriodo.length,
        facturado: facturadoTotal,
        comisiones: comisionesTotal,
        cargos: cargosTotal,
        neto: netoTotal,
      },
    }
  }, [trabajosPeriodo, movimientos, compartidos])

  const filtrados = tecnicoFiltro === 'todos'
    ? baseLiquidacion.lista
    : baseLiquidacion.lista.filter(l => l.tecnico.id === parseInt(tecnicoFiltro))

  const totales = useMemo(() => {
    if (tecnicoFiltro === 'todos') return baseLiquidacion.totalesPeriodo
    return filtrados.reduce((acc, l) => ({
      trabajos: acc.trabajos + l.trabajos.length,
      facturado: acc.facturado + l.totalTrabajos,
      comisiones: acc.comisiones + l.comision,
      cargos: acc.cargos + l.cargos,
      neto: acc.neto + l.neto,
    }), { trabajos: 0, facturado: 0, comisiones: 0, cargos: 0, neto: 0 })
  }, [filtrados, tecnicoFiltro, baseLiquidacion])

  // Liquidar: marca los trabajos como liquidados, guarda historial y limpia movimientos
  const liquidar = () => {
    const ids = trabajosPeriodo.map(t => t.id)
    if (ids.length === 0) {
      notify('No hay trabajos para liquidar en este periodo', 'error')
      return
    }

    // Guardar registro en historial
    const registro = {
      id: `LQ-${uid()}`,
      fecha: new Date().toISOString(),
      periodo: buildPeriodLabel(),
      trabajosIds: ids,
      cantidadTrabajos: ids.length,
      detalleTecnicos: filtrados.map(l => ({
        tecnico: l.tecnico.nombre,
        tecnicoId: l.tecnico.id,
        trabajos: l.trabajos.length,
        manoObra: l.totalTrabajos,
        comision: l.comision,
        cargos: l.cargos,
        neto: l.neto,
      })),
      totales: { ...baseLiquidacion.totalesPeriodo },
      movimientos: movimientos.map(m => ({ ...m })),
    }
    guardarHistorial([registro, ...historial])

    guardarLiquidados([...liquidados, ...ids])
    // Limpiar movimientos aplicados
    guardarMovs([])
    notify(`${ids.length} trabajos liquidados — ver historial abajo`, 'success')
  }

  // Desliquidar: quita todos los IDs de la lista
  const desliquidar = () => {
    guardarLiquidados([])
    notify('Todos los trabajos desliquidados', 'info')
  }

  const periodoLabel = buildPeriodLabel()

  const exportExcel = () => {
    const period = buildPeriodLabel()
    const resumen = [{
      Periodo: period,
      Trabajos: totales.trabajos,
      ManoObra: totales.facturado,
      Comision: totales.comisiones,
      Cargos: totales.cargos || 0,
      Neto: (totales.comisiones || 0) - (totales.cargos || 0),
    }]

    const porTecnico = filtrados.map(l => ({
      Tecnico: l.tecnico.nombre,
      Trabajos: l.trabajos.length,
      ManoObra: l.totalTrabajos,
      Comision: l.comision,
      Cargos: l.cargos || 0,
      Neto: l.neto,
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porTecnico), 'Tecnicos')

    if (trabajosPeriodo.length > 0) {
      const detalleTrab = trabajosPeriodo.map(t => {
        const mano = getManoObra(t)
        const esComp = compartidos[t.id] === true
        const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
        return {
          Fecha: t.fecha?.slice(0, 10),
          Placa: t.placa,
          Cliente: t.cliente,
          Tecnico: TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))?.nombre || '',
          Compartido: esComp ? 'Si' : 'No',
          ManoObra: mano,
          Comision: com,
          Estado: t.estado,
        }
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleTrab), 'Trabajos')
    }

    XLSX.writeFile(wb, `liquidacion_${period.replace(/\s+/g, '')}.xlsx`)
    notify('Exportado a Excel', 'success')
  }

  const exportPdf = async () => {
    const doc = new jsPDF()
    const period = buildPeriodLabel()

    const logoData = await loadLogo()
    try {
      if (logoData && typeof logoData === 'string' && logoData.startsWith('data:image')) {
        doc.addImage(logoData, 'PNG', 14, 10, 28, 18)
      }
    } catch {}

    doc.setFontSize(14)
    const titleX = logoData ? 44 : 14
    doc.text('Liquidacion de tecnicos', titleX, 18)
    doc.setFontSize(10)
    doc.text(`Periodo: ${period}`, titleX, 24)

    autoTable(doc, {
      startY: 30,
      head: [['Trabajos', 'Mano de obra', 'Comision', 'Cargos', 'Neto']],
      body: [[
        totales.trabajos,
        fmt(totales.facturado),
        fmt(totales.comisiones),
        fmt(totales.cargos || 0),
        fmt((totales.comisiones || 0) - (totales.cargos || 0)),
      ]],
      styles: { fontSize: 9 },
    })

    autoTable(doc, {
      head: [['Tecnico', 'Trabajos', 'Mano de obra', 'Comision', 'Cargos', 'Neto']],
      body: filtrados.map(l => [
        l.tecnico.nombre,
        l.trabajos.length,
        fmt(l.totalTrabajos),
        fmt(l.comision),
        fmt(l.cargos || 0),
        fmt(l.neto),
      ]),
      styles: { fontSize: 8 },
      startY: doc.lastAutoTable.finalY + 6,
    })

    autoTable(doc, {
      head: [['Trabajo', 'Fecha', 'Placa', 'Cliente', 'Tecnico', 'Compartido', 'M.O.', 'Comision']],
      body: trabajosPeriodo.map(t => {
        const mano = getManoObra(t)
        const esComp = compartidos[t.id] === true
        const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
        return [
          t.id,
          t.fecha?.slice(0, 10),
          t.placa,
          t.cliente || '',
          TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))?.nombre || '',
          esComp ? 'Si' : 'No',
          fmt(mano),
          fmt(com),
        ]
      }),
      styles: { fontSize: 7 },
      startY: doc.lastAutoTable.finalY + 6,
    })

    doc.save(`liquidacion_${period.replace(/\s+/g, '')}.pdf`)
    notify('Exportado a PDF', 'success')
  }

  const exportPdfIndividual = async (l) => {
    const doc = new jsPDF()
    const logoData = await loadLogo()
    if (logoData && typeof logoData === 'string' && logoData.startsWith('data:image')) {
      try { doc.addImage(logoData, 'PNG', 14, 10, 28, 18) } catch {}
    }

    doc.setFontSize(14)
    const titleX = logoData ? 44 : 14
    doc.text(`Liquidacion — ${l.tecnico.nombre}`, titleX, 18)
    doc.setFontSize(10)
    doc.text(`Periodo: ${buildPeriodLabel()}`, titleX, 24)

    autoTable(doc, {
      startY: 30,
      head: [['Trabajos', 'Mano de obra', 'Comision', 'Cargos', 'Neto']],
      body: [[
        l.trabajos.length,
        fmt(l.totalTrabajos),
        fmt(l.comision),
        fmt(l.cargos || 0),
        fmt(l.neto),
      ]],
      styles: { fontSize: 9 },
    })

    autoTable(doc, {
      head: [['Fecha', 'Placa', 'Cliente', 'Compartido', 'Mano de obra', 'Comision']],
      body: l.trabajos.map(t => {
        const mano = getManoObra(t)
        const esComp = compartidos[t.id] === true
        const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
        return [fmtDate(t.fecha), t.placa, t.cliente || '', esComp ? 'Si' : 'No', fmt(mano), fmt(com)]
      }),
      styles: { fontSize: 8 },
      startY: doc.lastAutoTable.finalY + 6,
    })

    const movs = movimientos.filter(m => m.tecnicoId === l.tecnico.id)
    if (movs.length) {
      autoTable(doc, {
        head: [['Fecha', 'Tipo', 'Nota', 'Monto']],
        body: movs.map(m => [fmtDate(m.fecha), m.tipo, m.nota || '—', fmt(m.monto)]),
        styles: { fontSize: 8 },
        startY: doc.lastAutoTable.finalY + 6,
      })
    }

    doc.save(`liquidacion_${l.tecnico.nombre}_${buildPeriodLabel().replace(/\s+/g, '')}.pdf`)
    notify('Exportado PDF individual', 'success')
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Liquidacion de tecnicos</div>
            <div className="text-sm text-muted">Comisiones basadas en mano de obra (no incluye repuestos). Marca trabajos como "compartidos" si Pedro y Victor trabajaron juntos.</div>
            <div className="text-xs text-mono" style={{ marginTop: 4 }}>Periodo: {periodoLabel}</div>
            {liquidados.length > 0 && (
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                {liquidados.length} trabajos ya liquidados (ocultos).{' '}
                <button className="btn btn-ghost btn-sm" onClick={desliquidar} style={{ fontSize: 11, padding: '2px 6px' }}>Desliquidar todos</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={exportExcel}>Exportar Excel</button>
            <button className="btn btn-outline btn-sm" onClick={exportPdf}>Exportar PDF</button>
            <button className="btn btn-primary btn-sm" onClick={liquidar}
              title="Marca los trabajos del periodo como liquidados y limpia movimientos">
              Liquidar Periodo
            </button>
          </div>
        </div>

        <div className="form-row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <div className="form-group">
            <label className="form-label">Periodo</label>
            <select className="form-select" value={preset}
              onChange={e => setPreset(e.target.value)}>
              <option value={PRESETS.DIA}>Hoy</option>
              <option value={PRESETS.SEMANA}>Ultimos 7 dias</option>
              <option value={PRESETS.QUINCENA}>Ultimos 15 dias</option>
              <option value={PRESETS.MES}>Ultimos 30 dias</option>
              <option value={PRESETS.RANGO}>Rango personalizado</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha fin (corte)</label>
            <input className="form-input" type="date" value={rango.fin}
              onChange={e => setRango(r => ({ ...r, fin: e.target.value }))} />
          </div>
          {preset === PRESETS.RANGO && (
            <div className="form-group">
              <label className="form-label">Inicio</label>
              <input className="form-input" type="date" value={rango.inicio}
                onChange={e => setRango(r => ({ ...r, inicio: e.target.value }))} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Tecnico</label>
            <select className="form-select" value={tecnicoFiltro}
              onChange={e => setTecnicoFiltro(e.target.value)}>
              <option value="todos">Todos los tecnicos</option>
              {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="metrics-grid" style={{ marginTop: 12 }}>
          <div className="metric-card">
            <div className="metric-value">{totales.trabajos}</div>
            <div className="metric-label">Trabajos Completados</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{fmt(totales.facturado)}</div>
            <div className="metric-label">Base Mano de Obra</div>
          </div>
          <div className="metric-card">
            <div className="metric-value" style={{ color: 'var(--green-500)' }}>{fmt(totales.comisiones)}</div>
            <div className="metric-label">Comision Bruta ({COMISION.TOTAL * 100}%)</div>
          </div>
          <div className="metric-card">
            <div className="metric-value" style={{ color: 'var(--amber-500)' }}>{fmt(totales.cargos || 0)}</div>
            <div className="metric-label">Adelantos / Cargos</div>
          </div>
          <div className="metric-card">
            <div className="metric-value" style={{ color: (totales.comisiones || 0) - (totales.cargos || 0) >= 0 ? 'var(--green-600)' : 'var(--red-500)' }}>{fmt((totales.comisiones || 0) - (totales.cargos || 0))}</div>
            <div className="metric-label">Neto a Pagar</div>
          </div>
        </div>
      </div>

      {/* Registro de adelantos */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Movimientos de tecnicos</div>
          <span className="text-xs text-muted">Adelantos, prestamos, consumos, pagos</span>
        </div>
        <form onSubmit={agregarMovimiento} className="form-row">
          <div className="form-group">
            <label className="form-label">Tecnico</label>
            <select className="form-select" value={movForm.tecnicoId}
              onChange={e => setMovForm(f => ({ ...f, tecnicoId: e.target.value }))}>
              <option value="">Seleccionar</option>
              {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={movForm.tipo}
              onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}>
              <option value="adelanto">Adelanto</option>
              <option value="prestamo">Prestamo</option>
              <option value="consumo">Consumo (almuerzo)</option>
              <option value="descuento">Descuento</option>
              <option value="pago">Pago al tecnico</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Monto</label>
            <input className="form-input" type="number" value={movForm.monto}
              onChange={e => setMovForm(f => ({ ...f, monto: e.target.value }))}
              placeholder="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input className="form-input" type="date" value={movForm.fecha}
              onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Nota / referencia</label>
            <input className="form-input" value={movForm.nota}
              onChange={e => setMovForm(f => ({ ...f, nota: e.target.value }))}
              placeholder="Ej: Almuerzo, anticipo, cruce con TR-123" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-primary">Registrar</button>
          </div>
        </form>
      </div>

      {/* Detalle por tecnico */}
      {/* Historial de liquidaciones */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Historial de Liquidaciones</div>
            <span className="text-sm text-muted">{historial.length} liquidaciones realizadas</span>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setVerHistorial(!verHistorial)}>
            {verHistorial ? 'Ocultar' : 'Ver Historial'}
          </button>
        </div>
        {verHistorial && (
          historial.length === 0 ? (
            <p className="text-sm text-muted text-center" style={{ padding: 20 }}>No hay liquidaciones registradas aun.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {historial.map(reg => (
                <div key={reg.id} style={{ border: '1px solid var(--slate-200)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--slate-50)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <div>
                      <span className="text-mono text-sm" style={{ fontWeight: 700 }}>{reg.id}</span>
                      <span className="text-sm text-muted" style={{ marginLeft: 10 }}>
                        Realizada: {fmtDate(reg.fecha)}
                      </span>
                    </div>
                    <span className="text-sm text-muted">Periodo: {reg.periodo}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div className="text-sm"><strong>{reg.cantidadTrabajos}</strong> trabajos</div>
                    <div className="text-sm">Mano de obra: <strong className="text-mono">{fmt(reg.totales?.facturado || 0)}</strong></div>
                    <div className="text-sm" style={{ color: 'var(--green-500)' }}>Comisiones: <strong className="text-mono">{fmt(reg.totales?.comisiones || 0)}</strong></div>
                    <div className="text-sm" style={{ color: 'var(--amber-500)' }}>Cargos: <strong className="text-mono">{fmt(reg.totales?.cargos || 0)}</strong></div>
                    <div className="text-sm" style={{ color: 'var(--green-600)' }}>Neto: <strong className="text-mono">{fmt(reg.totales?.neto || 0)}</strong></div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tecnico</th>
                          <th className="text-right">Trabajos</th>
                          <th className="text-right">Mano de Obra</th>
                          <th className="text-right">Comision</th>
                          <th className="text-right">Cargos</th>
                          <th className="text-right">Neto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(reg.detalleTecnicos || []).filter(d => d.trabajos > 0).map(d => (
                          <tr key={d.tecnicoId}>
                            <td style={{ fontWeight: 600 }}>{d.tecnico}</td>
                            <td className="text-right text-mono">{d.trabajos}</td>
                            <td className="text-right text-mono">{fmt(d.manoObra)}</td>
                            <td className="text-right text-mono" style={{ color: 'var(--green-500)' }}>{fmt(d.comision)}</td>
                            <td className="text-right text-mono" style={{ color: 'var(--amber-500)' }}>{fmt(d.cargos || 0)}</td>
                            <td className="text-right text-mono" style={{ fontWeight: 700, color: d.neto >= 0 ? 'var(--green-600)' : 'var(--red-500)' }}>{fmt(d.neto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(reg.movimientos || []).length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Movimientos aplicados:</div>
                      {reg.movimientos.map(m => (
                        <div key={m.id} className="text-xs text-muted">
                          {TECNICOS.find(t => t.id === m.tecnicoId)?.nombre || '?'} — {m.tipo} — {fmt(m.monto)} {m.nota ? `(${m.nota})` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-500)' }}
                  onClick={() => { if (confirm('Borrar todo el historial de liquidaciones?')) guardarHistorial([]) }}>
                  Limpiar historial
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {filtrados.map(l => (
        <div className="card" key={l.tecnico.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div className="card-title" style={{ marginBottom: 2 }}>{l.tecnico.nombre}</div>
              <span className="text-sm text-muted">{l.tecnico.especialidad} — {l.trabajos.length} trabajos</span>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--slate-50)', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 120, border: '1px solid var(--slate-200)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green-500)' }}>{fmt(l.comision)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate-500)', marginTop: 2 }}>Comision bruta</div>
              </div>
              <div style={{ background: 'var(--slate-50)', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 120, border: '1px solid var(--slate-200)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--amber-500)' }}>{fmt(l.cargos || 0)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate-500)', marginTop: 2 }}>Cargos</div>
              </div>
              <div style={{ background: l.neto >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 130, border: `1px solid ${l.neto >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: l.neto >= 0 ? 'var(--green-600)' : 'var(--red-500)' }}>{fmt(l.neto)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate-500)', marginTop: 2 }}>Neto a pagar</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button className="btn btn-outline btn-sm" onClick={() => exportPdfIndividual(l)}>PDF</button>
              </div>
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
                    <th className="text-center">Compartido</th>
                    <th className="text-right">Mano de obra</th>
                    <th className="text-right">Comision ({COMISION.TOTAL * 100}%)</th>
                  </tr>
                </thead>
                <tbody>
                  {l.trabajos.map(t => {
                    const mano = getManoObra(t)
                    const esComp = compartidos[t.id] === true
                    const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
                    return (
                      <tr key={t.id}>
                        <td className="text-sm text-muted">{fmtDate(t.fecha)}</td>
                        <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                        <td>{t.cliente || '—'}</td>
                        <td className="text-sm">{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                        <td className="text-center">
                          <input type="checkbox" checked={esComp}
                            onChange={() => toggleCompartido(t.id)}
                            title="Marcar si Pedro y Victor trabajaron juntos en esta OT" />
                        </td>
                        <td className="text-right text-mono">{fmt(mano)}</td>
                        <td className="text-right text-mono" style={{ color: 'var(--green-500)', fontWeight: 600 }}>
                          {fmt(com)}
                          {esComp && <span className="text-xs text-muted" style={{ display: 'block' }}>50/50</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--slate-50)' }}>
                    <td colSpan={5} style={{ fontWeight: 700 }}>Total {l.tecnico.nombre}</td>
                    <td className="text-right text-mono" style={{ fontWeight: 700 }}>{fmt(l.totalTrabajos)}</td>
                    <td className="text-right text-mono" style={{ fontWeight: 700, color: 'var(--green-500)' }}>{fmt(l.comision)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Estado de cuenta del tecnico */}
          <div style={{ marginTop: 12, borderTop: '1px solid var(--slate-200)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="text-sm text-muted">Estado de cuenta (adelantos, prestamos, consumos)</div>
              <div className="text-sm text-mono">Cargos aplicados: {fmt(l.cargos || 0)}</div>
            </div>
            {movimientos.filter(m => m.tecnicoId === l.tecnico.id).length === 0 ? (
              <p className="text-sm text-muted">Sin movimientos registrados.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Nota</th>
                      <th className="text-right">Monto</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos
                      .filter(m => m.tecnicoId === l.tecnico.id)
                      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                      .map(m => (
                        <tr key={m.id}>
                          <td className="text-sm text-muted">{fmtDate(m.fecha)}</td>
                          <td className="text-sm" style={{ textTransform: 'capitalize' }}>{m.tipo}</td>
                          <td className="text-sm">{m.nota || '—'}</td>
                          <td className="text-right text-mono" style={{ color: 'var(--amber-500)' }}>{fmt(m.monto)}</td>
                          <td className="text-right">
                            <button className="btn btn-ghost btn-sm" onClick={() => eliminarMovimiento(m.id)}>X</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
