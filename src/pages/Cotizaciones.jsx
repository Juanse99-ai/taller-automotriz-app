import { useState, useMemo, useCallback } from 'react'
import { fmt, fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre } from '../utils/helpers'
import { TECNICOS, IVA_DEFAULT } from '../utils/constants'
import { useClientes } from '../hooks/useClientes'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

const ESTADO_COT = { PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' }

export default function Cotizaciones({ notify, onCrearTrabajo }) {
  const [cotizaciones, setCotizaciones] = useState(() => lsGet(LS_KEYS.COTIZACIONES, []))
  const [vista, setVista] = useState('lista')
  const [editId, setEditId] = useState(null)

  const guardar = useCallback((nuevas) => {
    setCotizaciones(nuevas)
    lsSet(LS_KEYS.COTIZACIONES, nuevas)
  }, [])

  const sorted = useMemo(() =>
    [...cotizaciones].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [cotizaciones])

  const stats = useMemo(() => ({
    total: cotizaciones.length,
    pendientes: cotizaciones.filter(c => c.estado === ESTADO_COT.PENDIENTE).length,
    aprobadas: cotizaciones.filter(c => c.estado === ESTADO_COT.APROBADA).length,
    valorPendiente: cotizaciones.filter(c => c.estado === ESTADO_COT.PENDIENTE).reduce((s, c) => s + (c.total || 0), 0),
  }), [cotizaciones])

  const cambiarEstado = (id, estado) => {
    guardar(cotizaciones.map(c => c.id === id ? { ...c, estado } : c))
    notify(`Cotizacion ${estado.toLowerCase()}`, estado === ESTADO_COT.APROBADA ? 'success' : 'info')
  }

  const eliminar = (id) => {
    guardar(cotizaciones.filter(c => c.id !== id))
    notify('Cotizacion eliminada', 'info')
  }

  if (vista === 'nueva' || vista === 'editar') {
    const cot = vista === 'editar' ? cotizaciones.find(c => c.id === editId) : null
    return (
      <CotizacionForm
        cotizacion={cot}
        onSave={(data) => {
          if (vista === 'editar') {
            guardar(cotizaciones.map(c => c.id === editId ? { ...c, ...data } : c))
            notify('Cotizacion actualizada', 'success')
          } else {
            guardar([{ ...data, id: `COT-${uid()}`, estado: ESTADO_COT.PENDIENTE, fecha: new Date().toISOString() }, ...cotizaciones])
            notify('Cotizacion creada', 'success')
          }
          setVista('lista')
          setEditId(null)
        }}
        onCancel={() => { setVista('lista'); setEditId(null) }}
      />
    )
  }

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{stats.total}</div>
          <div className="metric-label">Total Cotizaciones</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--amber-500)' }}>{stats.pendientes}</div>
          <div className="metric-label">Pendientes</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--green-500)' }}>{stats.aprobadas}</div>
          <div className="metric-label">Aprobadas</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{fmt(stats.valorPendiente)}</div>
          <div className="metric-label">Valor Pendiente</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Cotizaciones</h3>
        <button className="btn btn-primary" onClick={() => setVista('nueva')}>+ Nueva Cotizacion</button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <p>No hay cotizaciones registradas.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Placa</th>
                  <th>Vehiculo</th>
                  <th>Estado</th>
                  <th className="text-right">Total</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => {
                  const bc = c.estado === ESTADO_COT.APROBADA ? 'badge-success'
                    : c.estado === ESTADO_COT.RECHAZADA ? 'badge-danger' : 'badge-warning'
                  return (
                    <tr key={c.id}>
                      <td className="text-mono text-sm">{c.id}</td>
                      <td>{c.cliente || '—'}</td>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{c.placa || '—'}</td>
                      <td className="text-sm">{[c.marca, c.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td><span className={`badge ${bc}`}>{c.estado}</span></td>
                      <td className="text-right text-mono">{fmt(c.total)}</td>
                      <td className="text-sm text-muted">{fmtDate(c.fecha)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => { setEditId(c.id); setVista('editar') }}>Editar</button>
                          {c.estado === ESTADO_COT.PENDIENTE && (
                            <>
                              <button className="btn btn-success btn-sm" onClick={() => cambiarEstado(c.id, ESTADO_COT.APROBADA)}>Aprobar</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => cambiarEstado(c.id, ESTADO_COT.RECHAZADA)}>Rechazar</button>
                            </>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => eliminar(c.id)} title="Eliminar">🗑</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function CotizacionForm({ cotizacion, onSave, onCancel }) {
  const isEdit = !!cotizacion
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()

  const [form, setForm] = useState({
    cedula: cotizacion?.cedula || '',
    cliente: cotizacion?.cliente || '',
    telefonoCliente: cotizacion?.telefonoCliente || '',
    placa: cotizacion?.placa || '',
    marca: cotizacion?.marca || '',
    modelo: cotizacion?.modelo || '',
    observaciones: cotizacion?.observaciones || '',
    validezDias: cotizacion?.validezDias || 15,
  })
  const [items, setItems] = useState(cotizacion?.items || [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const seleccionarCliente = (c) => {
    set('cedula', normalizarDoc(c))
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', c.telefono || c.phone || '')
    setResultados([])
  }

  const addItem = () => setItems(prev => [...prev, { id: uid(), nombre: '', precio: 0, cantidad: 1, iva: IVA_DEFAULT }])
  const updateItem = (id, field, value) => setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id))

  const totales = useMemo(() => {
    let subtotal = 0, iva = 0, total = 0
    items.forEach(i => {
      const precio = parseFloat(i.precio) || 0
      const cant = parseInt(i.cantidad) || 1
      const ivaPct = parseFloat(i.iva) || 0
      const lineaTotal = precio * cant
      if (ivaPct > 0) {
        const base = lineaTotal / (1 + ivaPct / 100)
        subtotal += base; iva += lineaTotal - base
      } else { subtotal += lineaTotal }
      total += lineaTotal
    })
    return { subtotal: Math.round(subtotal), iva: Math.round(iva), total: Math.round(total) }
  }, [items])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.cliente) return
    onSave({ ...form, placa: (form.placa || '').toUpperCase(), items, ...totales })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Editar Cotizacion' : 'Nueva Cotizacion'}</h3>
        <button className="btn btn-outline" onClick={onCancel}>Volver</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-title">Cliente</div>
          <div className="form-row">
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Cedula / NIT</label>
              <input className="form-input" value={form.cedula} placeholder="Buscar por documento..."
                onChange={e => { set('cedula', e.target.value); buscarDebounced(e.target.value) }} />
              {resultados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--slate-200)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                  {resultados.map((c, i) => (
                    <div key={i} onClick={() => seleccionarCliente(c)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--slate-100)', fontSize: 13 }}>
                      <strong>{normalizarDoc(c)}</strong> — {normalizarNombre(c)}
                    </div>
                  ))}
                </div>
              )}
              {buscando && <span className="text-xs text-muted mt-2" style={{ display: 'block' }}>Buscando en Cuentti...</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Nombre del Cliente</label>
              <input className="form-input" value={form.cliente} required placeholder="Nombre completo"
                onChange={e => { set('cliente', e.target.value); buscarDebounced(e.target.value) }} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefono</label>
              <input className="form-input" value={form.telefonoCliente} placeholder="300..." onChange={e => set('telefonoCliente', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Vehiculo</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Placa</label>
              <input className="form-input" value={form.placa} placeholder="ABC123" style={{ textTransform: 'uppercase' }}
                onChange={e => set('placa', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Marca</label>
              <input className="form-input" value={form.marca} placeholder="Toyota, Mazda..." onChange={e => set('marca', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Modelo</label>
              <input className="form-input" value={form.modelo} placeholder="Corolla, CX-5..." onChange={e => set('modelo', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Items</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ Agregar linea</button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted text-center" style={{ padding: 24 }}>Sin items.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Descripcion</th>
                    <th style={{ width: '15%' }}>Precio</th>
                    <th style={{ width: '10%' }}>Cant.</th>
                    <th style={{ width: '10%' }}>IVA %</th>
                    <th style={{ width: '15%' }} className="text-right">Total</th>
                    <th style={{ width: '5%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const lineTotal = (parseFloat(item.precio) || 0) * (parseInt(item.cantidad) || 1)
                    return (
                      <tr key={item.id}>
                        <td><input className="form-input" value={item.nombre} placeholder="Nombre..."
                          onChange={e => updateItem(item.id, 'nombre', e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} /></td>
                        <td><input className="form-input" type="number" value={item.precio} min="0"
                          onChange={e => updateItem(item.id, 'precio', e.target.value)} style={{ padding: '6px 10px', fontSize: 13, textAlign: 'right' }} /></td>
                        <td><input className="form-input" type="number" value={item.cantidad} min="1"
                          onChange={e => updateItem(item.id, 'cantidad', e.target.value)} style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} /></td>
                        <td><input className="form-input" type="number" value={item.iva} min="0"
                          onChange={e => updateItem(item.id, 'iva', e.target.value)} style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} /></td>
                        <td className="text-right text-mono" style={{ fontWeight: 600 }}>{fmt(lineTotal)}</td>
                        <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)}>🗑</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--slate-200)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40 }}>
              <div className="text-sm"><span className="text-muted">Subtotal:</span> <span className="text-mono">{fmt(totales.subtotal)}</span></div>
              <div className="text-sm"><span className="text-muted">IVA:</span> <span className="text-mono">{fmt(totales.iva)}</span></div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Total: <span className="text-mono" style={{ color: 'var(--green-500)' }}>{fmt(totales.total)}</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Validez (dias)</label>
              <input className="form-input" type="number" value={form.validezDias} min="1"
                onChange={e => set('validezDias', parseInt(e.target.value) || 15)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea className="form-textarea" value={form.observaciones} placeholder="Notas adicionales..."
              onChange={e => set('observaciones', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary">{isEdit ? 'Actualizar' : 'Crear Cotizacion'}</button>
        </div>
      </form>
    </div>
  )
}
