import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

// Obtener base de mano de obra SIN IVA (solo servicios)
const getManoObra = (t) => {
  if (Array.isArray(t?.items) && t.items.length) {
    const suma = t.items.reduce((s, i) => {
      const precio = parseFloat(i?.precio) || 0
      const cant = parseInt(i?.cantidad) || 1
      const ivaPct = parseFloat(i?.iva) || 0
      const tipo = (i?.tipo || i?.categoria || '').toString().toLowerCase()
      const esServ = i?.esServicio === true || i?.es_servicio === 1 || tipo.includes('serv')
      if (!esServ) return s
      // Calcular precio base sin IVA
      const totalLinea = precio * cant
      const base = ivaPct > 0 ? totalLinea / (1 + ivaPct / 100) : totalLinea
      return s + base
    }, 0)
    return Math.round(Math.max(0, suma))
  }
  // Fallback a campos directos (ya sin IVA si vienen asi)
  if (typeof t?.manoObra === 'number' && !Number.isNaN(t.manoObra)) return t.manoObra
  if (typeof t?.mano_obra === 'number' && !Number.isNaN(t.mano_obra)) return t.mano_obra
  return 0
}

export default function Liquidacion({ trabajos, notify }) {
  const [tecnicoSel, setTecnicoSel] = useState('')
  const [seleccionados, setSeleccionados] = useState({}) // { [trabajoId]: true }
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
    fecha: new Date().toISOString().slice(0, 10),
  })

  const guardarMovs = (next) => { setMovimientos(next); lsSet(LS_KEYS.MOVIMIENTOS_TECNICOS, next) }
  const guardarLiquidados = (next) => { setLiquidados(next); lsSet('liquidados', next) }
  const guardarHistorial = (next) => { setHistorial(next); lsSet('liquidacion_historial', next) }
  const guardarCompartidos = (next) => { setCompartidos(next); lsSet('trabajos_compartidos', next) }

  const toggleCompartido = (trabajoId) => {
    const next = { ...compartidos }
    if (next[trabajoId]) delete next[trabajoId]
    else next[trabajoId] = true
    guardarCompartidos(next)
  }

  const toggleSeleccion = (trabajoId) => {
    setSeleccionados(prev => {
      const next = { ...prev }
      if (next[trabajoId]) delete next[trabajoId]
      else next[trabajoId] = true
      return next
    })
  }

  const seleccionarTodos = (ids) => {
    const next = { ...seleccionados }
    const todosYa = ids.every(id => next[id])
    ids.forEach(id => { if (todosYa) delete next[id]; else next[id] = true })
    setSeleccionados(next)
  }

  // Trabajos completados pendientes de liquidar por tecnico
  const trabajosPendientes = useMemo(() => {
    return trabajos.filter(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return false
      if (liquidados.includes(t.id)) return false
      return true
    }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [trabajos, liquidados])

  // Agrupar por tecnico
  const porTecnico = useMemo(() => {
    const map = {}
    TECNICOS.forEach(t => {
      map[t.id] = { tecnico: t, trabajos: [], totalMO: 0, comision: 0 }
    })

    trabajosPendientes.forEach(t => {
      const tid = parseInt(t.tecnicoId)
      const manoObra = getManoObra(t)
      const comision = manoObra * COMISION.TOTAL
      const esCompartido = compartidos[t.id] === true

      if (esCompartido) {
        ;[1, 2].forEach(id => {
          if (map[id]) {
            map[id].trabajos.push(t)
            map[id].totalMO += manoObra
            map[id].comision += comision / 2
          }
        })
      } else if (map[tid]) {
        map[tid].trabajos.push(t)
        map[tid].totalMO += manoObra
        map[tid].comision += comision
      }
    })

    return map
  }, [trabajosPendientes, compartidos])

  // Datos del tecnico seleccionado
  const tecData = tecnicoSel ? porTecnico[parseInt(tecnicoSel)] : null
  const tecTrabajos = tecData?.trabajos || []
  const tecMovs = movimientos.filter(m => m.tecnicoId === parseInt(tecnicoSel))

  // Calcular totales de la seleccion
  const totalSeleccion = useMemo(() => {
    let manoObra = 0, comision = 0
    tecTrabajos.forEach(t => {
      if (!seleccionados[t.id]) return
      const mo = getManoObra(t)
      const esComp = compartidos[t.id] === true
      manoObra += mo
      comision += esComp ? (mo * COMISION.TOTAL) / 2 : mo * COMISION.TOTAL
    })
    const cargos = tecMovs.reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
    return { manoObra: Math.round(manoObra), comision: Math.round(comision), cargos: Math.round(cargos), neto: Math.round(comision - cargos) }
  }, [tecTrabajos, seleccionados, compartidos, tecMovs])

  const cantSeleccionados = Object.keys(seleccionados).filter(id => seleccionados[id]).length

  // Resumen general de pendientes por tecnico
  const resumenTecnicos = useMemo(() =>
    TECNICOS.map(t => ({
      ...t,
      pendientes: (porTecnico[t.id]?.trabajos || []).length,
      moTotal: Math.round(porTecnico[t.id]?.totalMO || 0),
      comisionTotal: Math.round(porTecnico[t.id]?.comision || 0),
    })),
  [porTecnico])

  // --- ACCIONES ---
  const agregarMovimiento = (e) => {
    e?.preventDefault?.()
    const monto = Math.abs(parseFloat(movForm.monto) || 0)
    if (!movForm.tecnicoId || !monto) { notify('Selecciona tecnico y monto', 'error'); return }
    guardarMovs([...movimientos, {
      id: `MV-${uid()}`, tecnicoId: parseInt(movForm.tecnicoId),
      tipo: movForm.tipo, monto, nota: movForm.nota, fecha: movForm.fecha,
    }])
    setMovForm(f => ({ ...f, monto: '', nota: '' }))
    notify('Movimiento registrado', 'success')
  }

  const eliminarMovimiento = (id) => guardarMovs(movimientos.filter(m => m.id !== id))

  const generarPago = () => {
    const ids = Object.keys(seleccionados).filter(id => seleccionados[id])
    if (ids.length === 0) { notify('Selecciona al menos un trabajo para liquidar', 'error'); return }
    if (!tecData) return

    const registro = {
      id: `LQ-${uid()}`,
      fecha: new Date().toISOString(),
      tecnico: tecData.tecnico.nombre,
      tecnicoId: tecData.tecnico.id,
      trabajosIds: ids,
      cantidadTrabajos: ids.length,
      manoObra: totalSeleccion.manoObra,
      comision: totalSeleccion.comision,
      cargos: totalSeleccion.cargos,
      neto: totalSeleccion.neto,
      movimientos: tecMovs.map(m => ({ ...m })),
      detalleTrabajo: ids.map(id => {
        const t = trabajos.find(tr => tr.id === id)
        if (!t) return null
        const mo = getManoObra(t)
        const esComp = compartidos[t.id] === true
        return { id: t.id, placa: t.placa, cliente: t.cliente, fecha: t.fecha, manoObra: mo, compartido: esComp }
      }).filter(Boolean),
    }

    guardarHistorial([registro, ...historial])
    guardarLiquidados([...liquidados, ...ids])
    // Limpiar movimientos del tecnico liquidado
    guardarMovs(movimientos.filter(m => m.tecnicoId !== parseInt(tecnicoSel)))
    setSeleccionados({})
    notify(`Pago generado: ${fmt(totalSeleccion.neto)} para ${tecData.tecnico.nombre}`, 'success')
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

  const exportPdfPago = async () => {
    if (cantSeleccionados === 0) { notify('Selecciona trabajos primero', 'error'); return }
    const doc = new jsPDF()
    const logoData = await loadLogo()
    if (logoData && typeof logoData === 'string' && logoData.startsWith('data:image')) {
      try { doc.addImage(logoData, 'PNG', 14, 10, 28, 18) } catch {}
    }
    const titleX = logoData ? 44 : 14
    doc.setFontSize(14)
    doc.text(`Estado de Cuenta — ${tecData.tecnico.nombre}`, titleX, 18)
    doc.setFontSize(10)
    doc.text(`Fecha: ${fmtDate(new Date().toISOString())}`, titleX, 24)

    // Trabajos seleccionados
    const rows = []
    Object.keys(seleccionados).filter(id => seleccionados[id]).forEach(id => {
      const t = trabajos.find(tr => tr.id === id)
      if (!t) return
      const mo = getManoObra(t)
      const esComp = compartidos[t.id] === true
      const com = esComp ? (mo * COMISION.TOTAL) / 2 : mo * COMISION.TOTAL
      rows.push([fmtDate(t.fecha), t.placa, t.cliente || '—', esComp ? 'Si' : 'No', fmt(mo), fmt(Math.round(com))])
    })

    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Placa', 'Cliente', 'Compartido', 'M.O. (sin IVA)', 'Comision']],
      body: rows,
      styles: { fontSize: 8 },
    })

    // Movimientos
    if (tecMovs.length > 0) {
      autoTable(doc, {
        head: [['Fecha', 'Tipo', 'Nota', 'Monto']],
        body: tecMovs.map(m => [fmtDate(m.fecha), m.tipo, m.nota || '—', fmt(m.monto)]),
        styles: { fontSize: 8 },
        startY: doc.lastAutoTable.finalY + 6,
      })
    }

    // Totales
    autoTable(doc, {
      body: [
        ['', '', '', '', 'Comision bruta:', fmt(totalSeleccion.comision)],
        ['', '', '', '', 'Cargos/Adelantos:', fmt(totalSeleccion.cargos)],
        ['', '', '', '', 'NETO A PAGAR:', fmt(totalSeleccion.neto)],
      ],
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: { 4: { fontStyle: 'bold', halign: 'right' }, 5: { fontStyle: 'bold', halign: 'right' } },
      startY: doc.lastAutoTable.finalY + 4,
    })

    // Firmas
    const firmaY = doc.lastAutoTable.finalY + 25
    doc.setDrawColor(100)
    doc.line(20, firmaY, 85, firmaY)
    doc.line(120, firmaY, 185, firmaY)
    doc.setFontSize(9)
    doc.text('Firma del Tecnico', 38, firmaY + 6)
    doc.text('Autorizado por', 140, firmaY + 6)

    doc.save(`pago_${tecData.tecnico.nombre}_${new Date().toISOString().slice(0, 10)}.pdf`)
    notify('PDF de pago exportado', 'success')
  }

  const desliquidar = () => {
    guardarLiquidados([])
    notify('Todos los trabajos desliquidados', 'info')
  }

  // ===== RENDER =====
  return (
    <div>
      {/* Resumen por tecnico */}
      <div className="card">
        <div className="card-title">Estado de Cuenta — Tecnicos</div>
        <div className="text-sm text-muted" style={{ marginBottom: 12 }}>
          Mano de obra calculada antes de IVA. Selecciona un tecnico para ver sus trabajos pendientes.
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tecnico</th>
                <th className="text-center">Trabajos Pendientes</th>
                <th className="text-right">M.O. Total (sin IVA)</th>
                <th className="text-right">Comision ({COMISION.TOTAL * 100}%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resumenTecnicos.map(t => (
                <tr key={t.id} style={{ background: tecnicoSel === String(t.id) ? 'var(--blue-50, #eff6ff)' : undefined }}>
                  <td style={{ fontWeight: 700 }}>{t.nombre}</td>
                  <td className="text-center">
                    <span className={`badge ${t.pendientes > 0 ? 'badge-warning' : 'badge-success'}`}>{t.pendientes}</span>
                  </td>
                  <td className="text-right text-mono">{fmt(t.moTotal)}</td>
                  <td className="text-right text-mono" style={{ color: 'var(--green-500)' }}>{fmt(t.comisionTotal)}</td>
                  <td>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => { setTecnicoSel(String(t.id)); setSeleccionados({}) }}
                      disabled={t.pendientes === 0}>
                      {tecnicoSel === String(t.id) ? 'Seleccionado' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {liquidados.length > 0 && (
          <div className="text-xs text-muted" style={{ marginTop: 8 }}>
            {liquidados.length} trabajos ya liquidados (ocultos).{' '}
            <button className="btn btn-ghost btn-sm" onClick={desliquidar} style={{ fontSize: 11, padding: '2px 6px' }}>Desliquidar todos</button>
          </div>
        )}
      </div>

      {/* Detalle del tecnico seleccionado */}
      {tecData && (
        <>
          {/* Trabajos pendientes — seleccion */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div className="card-title" style={{ marginBottom: 2 }}>{tecData.tecnico.nombre} — Trabajos Pendientes</div>
                <span className="text-sm text-muted">Selecciona los trabajos que vas a liquidar</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm"
                  onClick={() => seleccionarTodos(tecTrabajos.map(t => t.id))}>
                  {tecTrabajos.every(t => seleccionados[t.id]) ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
              </div>
            </div>

            {tecTrabajos.length === 0 ? (
              <p className="text-sm text-muted text-center" style={{ padding: 20 }}>Sin trabajos pendientes de liquidar.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>Fecha</th>
                      <th>OT</th>
                      <th>Placa</th>
                      <th>Cliente</th>
                      <th className="text-center">Compartido</th>
                      <th className="text-right">M.O. (sin IVA)</th>
                      <th className="text-right">Comision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tecTrabajos.map(t => {
                      const mano = getManoObra(t)
                      const esComp = compartidos[t.id] === true
                      const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
                      const selected = !!seleccionados[t.id]
                      return (
                        <tr key={t.id} style={{ background: selected ? '#f0fdf4' : undefined, cursor: 'pointer' }}
                          onClick={() => toggleSeleccion(t.id)}>
                          <td className="text-center">
                            <input type="checkbox" checked={selected} onChange={() => {}} />
                          </td>
                          <td className="text-sm text-muted">{fmtDate(t.fecha)}</td>
                          <td className="text-mono text-sm">{t.otCodigo || t.id}</td>
                          <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                          <td>{t.cliente || '—'}</td>
                          <td className="text-center">
                            <input type="checkbox" checked={esComp}
                              onClick={e => e.stopPropagation()}
                              onChange={() => toggleCompartido(t.id)} />
                          </td>
                          <td className="text-right text-mono">{fmt(mano)}</td>
                          <td className="text-right text-mono" style={{ color: 'var(--green-500)', fontWeight: 600 }}>
                            {fmt(Math.round(com))}
                            {esComp && <span className="text-xs text-muted" style={{ display: 'block' }}>50/50</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Movimientos del tecnico */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 8 }}>Adelantos / Cargos — {tecData.tecnico.nombre}</div>
            <form onSubmit={agregarMovimiento} className="form-row" style={{ marginBottom: 12 }}>
              <input type="hidden" value={tecnicoSel} />
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={movForm.tipo}
                  onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="adelanto">Adelanto</option>
                  <option value="prestamo">Prestamo</option>
                  <option value="consumo">Consumo (almuerzo)</option>
                  <option value="descuento">Descuento</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monto</label>
                <input className="form-input" type="number" value={movForm.monto}
                  onChange={e => setMovForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input className="form-input" type="date" value={movForm.fecha}
                  onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Nota</label>
                <input className="form-input" value={movForm.nota}
                  onChange={e => setMovForm(f => ({ ...f, nota: e.target.value }))}
                  placeholder="Ej: Almuerzo, anticipo..." />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" className="btn btn-outline"
                  onClick={() => setMovForm(f => ({ ...f, tecnicoId: tecnicoSel }))}>Agregar</button>
              </div>
            </form>

            {tecMovs.length === 0 ? (
              <p className="text-sm text-muted">Sin movimientos registrados.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Nota</th><th className="text-right">Monto</th><th></th></tr></thead>
                  <tbody>
                    {tecMovs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map(m => (
                      <tr key={m.id}>
                        <td className="text-sm text-muted">{fmtDate(m.fecha)}</td>
                        <td className="text-sm" style={{ textTransform: 'capitalize' }}>{m.tipo}</td>
                        <td className="text-sm">{m.nota || '—'}</td>
                        <td className="text-right text-mono" style={{ color: 'var(--amber-500)' }}>{fmt(m.monto)}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => eliminarMovimiento(m.id)}>X</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Resumen del pago */}
          {cantSeleccionados > 0 && (
            <div className="card" style={{ borderLeft: '4px solid var(--green-500)', background: '#f0fdf4' }}>
              <div className="card-title" style={{ color: 'var(--green-600)' }}>Resumen del Pago — {tecData.tecnico.nombre}</div>
              <div className="metrics-grid" style={{ marginBottom: 16 }}>
                <div className="metric-card">
                  <div className="metric-value">{cantSeleccionados}</div>
                  <div className="metric-label">Trabajos Seleccionados</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(totalSeleccion.manoObra)}</div>
                  <div className="metric-label">Mano de Obra (sin IVA)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value" style={{ color: 'var(--green-500)' }}>{fmt(totalSeleccion.comision)}</div>
                  <div className="metric-label">Comision ({COMISION.TOTAL * 100}%)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value" style={{ color: 'var(--amber-500)' }}>{fmt(totalSeleccion.cargos)}</div>
                  <div className="metric-label">Cargos / Adelantos</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value" style={{ fontSize: 24, color: totalSeleccion.neto >= 0 ? 'var(--green-600)' : 'var(--red-500)' }}>
                    {fmt(totalSeleccion.neto)}
                  </div>
                  <div className="metric-label">NETO A PAGAR</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={exportPdfPago}>Exportar PDF</button>
                <button className="btn btn-primary" onClick={generarPago}>
                  Generar Pago
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Historial de pagos */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Historial de Pagos</div>
            <span className="text-sm text-muted">{historial.length} pagos realizados</span>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setVerHistorial(!verHistorial)}>
            {verHistorial ? 'Ocultar' : 'Ver Historial'}
          </button>
        </div>
        {verHistorial && (
          historial.length === 0 ? (
            <p className="text-sm text-muted text-center" style={{ padding: 20 }}>No hay pagos registrados.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {historial.map(reg => (
                <div key={reg.id} style={{ border: '1px solid var(--slate-200)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--slate-50)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <div>
                      <span className="text-mono text-sm" style={{ fontWeight: 700 }}>{reg.id}</span>
                      <span className="badge badge-info" style={{ marginLeft: 8 }}>{reg.tecnico}</span>
                    </div>
                    <span className="text-sm text-muted">{fmtDate(reg.fecha)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div className="text-sm"><strong>{reg.cantidadTrabajos}</strong> trabajos</div>
                    <div className="text-sm">M.O.: <strong className="text-mono">{fmt(reg.manoObra || 0)}</strong></div>
                    <div className="text-sm" style={{ color: 'var(--green-500)' }}>Comision: <strong className="text-mono">{fmt(reg.comision || 0)}</strong></div>
                    <div className="text-sm" style={{ color: 'var(--amber-500)' }}>Cargos: <strong className="text-mono">{fmt(reg.cargos || 0)}</strong></div>
                    <div className="text-sm" style={{ color: 'var(--green-600)', fontWeight: 700 }}>Neto: <strong className="text-mono">{fmt(reg.neto || 0)}</strong></div>
                  </div>
                </div>
              ))}
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-500)' }}
                  onClick={() => { if (confirm('Borrar todo el historial de pagos?')) guardarHistorial([]) }}>
                  Limpiar historial
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
