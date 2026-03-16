import { useState, useMemo } from 'react'
import { fmt, fmtDate, uid } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS } from '../utils/constants'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

// Obtener base de mano de obra (solo servicios) para un trabajo
const getManoObra = (t) => {
  if (typeof t?.manoObra === 'number') return t.manoObra
  if (Array.isArray(t?.items)) {
    const suma = t.items.reduce((s, i) => {
      const precio = parseFloat(i?.precio) || 0
      const cant = parseInt(i?.cantidad) || 1
      const esServ = !!i?.esServicio
      return s + (esServ ? precio * cant : 0)
    }, 0)
    if (suma > 0) return suma
  }
  // Fallback para trabajos viejos sin bandera esServicio
  return parseFloat(t?.total) || 0
}

export default function Liquidacion({ trabajos, notify }) {
  const [periodo, setPeriodo] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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

  // Filtrar trabajos completados del periodo
  const trabajosPeriodo = useMemo(() => {
    const [year, month] = periodo.split('-').map(Number)
    return trabajos.filter(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return false
      const d = new Date(t.fecha)
      return d.getFullYear() === year && (d.getMonth() + 1) === month
    })
  }, [trabajos, periodo])
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
          <div className="metric-value">{fmt((totales.comisiones || 0) - (totales.cargos || 0))}</div>
          <div className="metric-label">Neto a Pagar</div>
        </div>
      </div>

      {/* Registro de adelantos / prestamos / consumos */}
      <div className="card">
        <div className="card-title">Movimientos de tecnicos (adelantos, prestamos, consumos, pagos)</div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
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
