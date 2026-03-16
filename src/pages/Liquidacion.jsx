import { useState, useMemo, useEffect } from 'react'
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

  // Sin items marcados como servicio: preferimos no cobrar comision sobre repuestos
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

  const [preset, setPreset] = useState(PRESETS.DIA) // por defecto día actual
  const [rango, setRango] = useState({
    inicio: todayIso(),
    fin: todayIso(),
  })
  const [tecnicoFiltro, setTecnicoFiltro] = useState('todos')
  const [movimientos, setMovimientos] = useState(() => lsGet(LS_KEYS.MOVIMIENTOS_TECNICOS, []))
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

  const agregarMovimiento = (e) => {
    e?.preventDefault?.()
    const monto = Math.abs(parseFloat(movForm.monto) || 0)
    if (!movForm.tecnicoId || !monto) {
      notify('Selecciona tecnico y monto', 'error')
      return
    }

    // Si es movimiento para el equipo Pedro+Victor, dividimos mitad y mitad
    if (movForm.tecnicoId === '1-2') {
      const half = Math.round((monto / 2) * 100) / 100
      const base = {
        tipo: movForm.tipo,
        nota: movForm.nota,
        referencia: movForm.referencia,
        fecha: movForm.fecha,
      }
      const nowId = uid()
      const nuevos = [
        { id: `${nowId}-p`, tecnicoId: 1, monto: half, ...base },
        { id: `${nowId}-v`, tecnicoId: 2, monto: half, ...base },
      ]
      guardarMovs([...movimientos, ...nuevos])
    } else {
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
    }

    setMovForm(f => ({ ...f, monto: '', nota: '', referencia: '' }))
    notify('Movimiento registrado', 'success')
  }

  const eliminarMovimiento = (id) => {
    guardarMovs(movimientos.filter(m => m.id !== id))
  }

  // ---- Export helpers ----
  const buildPeriodLabel = () => {
    const fmtDate = (d) => d.toISOString().slice(0, 10)
    return `${fmtDate(rangoFechas.inicio)} a ${fmtDate(rangoFechas.fin)}`
  }

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
      const detalleTrab = trabajosPeriodo.map(t => ({
        Fecha: t.fecha?.slice(0, 10),
        Placa: t.placa,
        Cliente: t.cliente,
        Tecnico: TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))?.nombre || '',
        ManoObra: getManoObra(t),
        Comision: [1, 2].includes(parseInt(t.tecnicoId)) ? (getManoObra(t) * COMISION.TOTAL) / 2 : getManoObra(t) * COMISION.TOTAL,
        Estado: t.estado,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleTrab), 'Trabajos')

      // Items por trabajo
      const detalleItems = trabajosPeriodo.flatMap(t => (t.items || []).map(it => ({
        Trabajo: t.id,
        Fecha: t.fecha?.slice(0, 10),
        Placa: t.placa,
        Cliente: t.cliente,
        Item: it.nombre,
        Cantidad: it.cantidad,
        Precio: it.precio,
        IVA: it.iva,
        Total: (parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 1),
        Servicio: it.esServicio ? 'Si' : 'No',
      })))
      if (detalleItems.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleItems), 'Items')
      }
    }

    if (movimientos.length > 0) {
      const movs = movimientos.map(m => ({
        Fecha: m.fecha,
        Tecnico: TECNICOS.find(t => t.id === parseInt(m.tecnicoId))?.nombre || m.tecnicoId,
        Tipo: m.tipo,
        Monto: m.monto,
        Nota: m.nota || '',
        Trabajo: m.referencia || '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movs), 'Movimientos')
    }

    XLSX.writeFile(wb, `liquidacion_${period.replace(/\\s+/g, '')}.xlsx`)
    notify('Exportado a Excel', 'success')
  }

  const loadLogo = async () => {
    try {
      const res = await fetch('/logo.png')
      if (!res.ok) return null
      const blob = await res.blob()
      return await new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  const exportPdf = async () => {
    const doc = new jsPDF()
    const period = buildPeriodLabel()

    // Logo
    const logoData = await loadLogo()
    if (logoData) {
      doc.addImage(logoData, 'PNG', 14, 10, 28, 18)
    }

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

    // Detalle de trabajos
    autoTable(doc, {
      head: [['Trabajo', 'Fecha', 'Placa', 'Cliente', 'Tecnico', 'Mano de obra', 'Comision']],
      body: trabajosPeriodo.map(t => {
        const mano = getManoObra(t)
        const tid = parseInt(t.tecnicoId)
        const com = [1, 2].includes(tid) ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
        return [
          t.id,
          t.fecha?.slice(0, 10),
          t.placa,
          t.cliente || '',
          TECNICOS.find(tc => tc.id === tid)?.nombre || '',
          fmt(mano),
          fmt(com),
        ]
      }),
      styles: { fontSize: 7 },
      startY: doc.lastAutoTable.finalY + 6,
    })

    // Detalle de items por trabajo
    const itemsTabla = trabajosPeriodo.flatMap(t => (t.items || []).map(it => {
      const totalLinea = (parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 1)
      return [
        t.id,
        t.placa,
        it.nombre,
        it.cantidad,
        fmt(it.precio),
        `${it.iva}%`,
        fmt(totalLinea),
        it.esServicio ? 'Servicio' : 'Repuesto',
      ]
    }))
    if (itemsTabla.length) {
      autoTable(doc, {
        head: [['Trabajo', 'Placa', 'Item', 'Cant', 'Precio', 'IVA', 'Total', 'Tipo']],
        body: itemsTabla,
        styles: { fontSize: 7 },
        startY: doc.lastAutoTable.finalY + 6,
      })
    }

    doc.save(`liquidacion_${period.replace(/\\s+/g, '')}.pdf`)
    notify('Exportado a PDF', 'success')
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

  useEffect(() => {
    // Ajustar rango al cambiar preset (conserva la fecha fin seleccionada)
    setRango(prev => ({ ...prev, inicio: prev.inicio, fin: prev.fin }))
  }, [preset])

  // Filtrar trabajos completados del periodo
  const trabajosPeriodo = useMemo(() => {
    return trabajos.filter(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return false
      const d = new Date(t.fecha)
      return d >= rangoFechas.inicio && d <= rangoFechas.fin
    })
  }, [trabajos, rangoFechas])
  // Calcular comisiones por tecnico y totales del periodo
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
      const esDuo = [1, 2].includes(tid)

      if (esDuo) {
        // Pedro + Victor se reparten 50/50 la comision (40% mano de obra)
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

    // Aplicar cargos/adelantos/consumos registrados
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
  }, [trabajosPeriodo, movimientos])

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

  const periodoLabel = buildPeriodLabel()

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Liquidacion de tecnicos</div>
            <div className="text-sm text-muted">Por defecto mostramos el dia de hoy. Cambia el periodo o el tecnico y exporta el resumen.</div>
            <div className="text-xs text-mono" style={{ marginTop: 4 }}>Periodo: {periodoLabel}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={exportExcel}>Exportar Excel</button>
            <button className="btn btn-primary btn-sm" onClick={exportPdf}>Exportar PDF</button>
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
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Calculamos hacia atras desde la fecha fin.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha fin (corte)</label>
            <input className="form-input" type="date" value={rango.fin}
              onChange={e => setRango(r => ({ ...r, fin: e.target.value }))} />
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Para semanal/quincenal/mensual usamos esta fecha como cierre.
            </div>
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
            <div className="metric-value" style={{ color: 'var(--amber-600)' }}>{fmt(totales.cargos || 0)}</div>
            <div className="metric-label">Adelantos / Cargos</div>
          </div>
          <div className="metric-card">
            <div className="metric-value" style={{ color: 'var(--green-600)' }}>{fmt((totales.comisiones || 0) - (totales.cargos || 0))}</div>
            <div className="metric-label">Neto a Pagar</div>
          </div>
        </div>
      </div>

      {/* Registro de adelantos / prestamos / consumos */}
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
              <option value="1-2">Pedro + Victor (mitad y mitad)</option>
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
          <div className="form-group">
            <label className="form-label">Trabajo (opcional)</label>
            <input className="form-input" value={movForm.referencia}
              onChange={e => setMovForm(f => ({ ...f, referencia: e.target.value }))}
              placeholder="ID trabajo" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-primary">Registrar</button>
          </div>
        </form>
      </div>

      {/* Detalle por tecnico */}
      {filtrados.map(l => (
        <div className="card" key={l.tecnico.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 2 }}>{l.tecnico.nombre}</div>
              <span className="text-sm text-muted">{l.tecnico.especialidad} — {l.trabajos.length} trabajos</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green-500)' }}>
                {fmt(l.comision)}
              </div>
              <div className="text-xs text-muted">Comision bruta</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--amber-600)' }}>
                {fmt(l.cargos || 0)}
              </div>
              <div className="text-xs text-muted">Cargos / adelantos</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)' }}>
                {fmt(l.neto)}
              </div>
              <div className="text-xs text-muted">Neto a pagar</div>
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
                    <th className="text-right">Mano de obra</th>
                    <th className="text-right">Comision ({COMISION.TOTAL * 100}%)</th>
                  </tr>
                </thead>
                <tbody>
                  {l.trabajos.map(t => {
                    const mano = getManoObra(t)
                    const tid = parseInt(t.tecnicoId)
                    const com = [1, 2].includes(tid) ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
                    return (
                      <tr key={t.id}>
                        <td className="text-sm text-muted">{fmtDate(t.fecha)}</td>
                        <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                        <td>{t.cliente || '—'}</td>
                        <td className="text-sm">{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                        <td className="text-right text-mono">{fmt(mano)}</td>
                        <td className="text-right text-mono" style={{ color: 'var(--green-500)', fontWeight: 600 }}>
                          {fmt(com)}
                        </td>
                      </tr>
                    )
                  })}
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
                      <th>Trabajo</th>
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
                          <td className="text-sm text-mono">{m.referencia || '—'}</td>
                          <td className="text-right text-mono" style={{ color: 'var(--amber-700)' }}>{fmt(m.monto)}</td>
                          <td className="text-right">
                            <button className="btn btn-ghost btn-sm" onClick={() => eliminarMovimiento(m.id)}>🗑</button>
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
