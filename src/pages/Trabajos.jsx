import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { fmt, fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre } from '../utils/helpers'
import { TECNICOS, ESTADOS, IVA_DEFAULT } from '../utils/constants'
import { useClientes } from '../hooks/useClientes'
import { lsGet, LS_KEYS } from '../services/storage'
import { cargarInventarioCompleto } from '../services/cuentti'

export default function Trabajos({ hook, notify }) {
  const { trabajos, agregarTrabajo, actualizarTrabajo, eliminarTrabajo } = hook
  const [vista, setVista] = useState('lista') // lista | nuevo | editar
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const stats = useMemo(() => {
    const total = trabajos.length
    const comp = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO).length
    const pend = trabajos.filter(t => t.estado === ESTADOS.PENDIENTE).length
    const prog = trabajos.filter(t => t.estado === ESTADOS.EN_PROGRESO).length
    return { total, comp, pend, prog }
  }, [trabajos])

  const sorted = useMemo(() =>
    [...trabajos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [trabajos])

  const tecNombre = (id) => TECNICOS.find(t => t.id === parseInt(id))?.nombre || '—'

  const handleCompletar = async (id) => {
    await actualizarTrabajo(id, { estado: ESTADOS.COMPLETADO })
    notify('Trabajo marcado como completado', 'success')
  }

  const handleEliminar = async (id) => {
    await eliminarTrabajo(id)
    setConfirmDel(null)
    notify('Trabajo eliminado', 'info')
  }

  const handleEditar = (id) => {
    setEditId(id)
    setVista('editar')
  }

  if (vista === 'nuevo' || vista === 'editar') {
    const trabajo = vista === 'editar' ? trabajos.find(t => t.id === editId) : null
    return (
      <TrabajoForm
        trabajo={trabajo}
        onSave={async (data) => {
          if (vista === 'editar') {
            await actualizarTrabajo(editId, data)
            notify('Trabajo actualizado', 'success')
          } else {
            await agregarTrabajo(data)
            notify('Trabajo creado', 'success')
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
          <div className="metric-label">Total</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--green-500)' }}>{stats.comp}</div>
          <div className="metric-label">Completados</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--amber-500)' }}>{stats.pend}</div>
          <div className="metric-label">Pendientes</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--blue-500)' }}>{stats.prog}</div>
          <div className="metric-label">En Progreso</div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Ordenes de Trabajo</h3>
        <button className="btn btn-primary" onClick={() => setVista('nuevo')}>+ Nuevo Trabajo</button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔧</div>
          <p>No hay trabajos registrados.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th>Vehiculo</th>
                  <th>Tecnico</th>
                  <th>Estado</th>
                  <th className="text-right">Total</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(t => {
                  const bc = t.estado === ESTADOS.COMPLETADO ? 'badge-success'
                    : t.estado === ESTADOS.CANCELADO ? 'badge-danger'
                    : t.estado === ESTADOS.EN_PROGRESO ? 'badge-info' : 'badge-warning'
                  return (
                    <tr key={t.id}>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                      <td>{t.cliente || '—'}</td>
                      <td className="text-sm">{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td className="text-sm">{tecNombre(t.tecnicoId)}</td>
                      <td><span className={`badge ${bc}`}>{t.estado}</span></td>
                      <td className="text-right text-mono">{fmt(t.total)}</td>
                      <td className="text-sm text-muted">{fmtDate(t.fecha)}</td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-outline btn-sm" onClick={() => handleEditar(t.id)}>Editar</button>
                          {t.estado !== ESTADOS.COMPLETADO && (
                            <button className="btn btn-success btn-sm" onClick={() => handleCompletar(t.id)}>Completar</button>
                          )}
                          {confirmDel === t.id ? (
                            <>
                              <button className="btn btn-danger btn-sm" onClick={() => handleEliminar(t.id)}>Si</button>
                              <button className="btn btn-outline btn-sm" onClick={() => setConfirmDel(null)}>No</button>
                            </>
                          ) : (
                            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(t.id)} title="Eliminar">🗑</button>
                          )}
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

// ========================
// FORMULARIO DE TRABAJO
// ========================
function TrabajoForm({ trabajo, onSave, onCancel }) {
  const isEdit = !!trabajo
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()

  const [form, setForm] = useState({
    cedula: trabajo?.cedula || '',
    cliente: trabajo?.cliente || '',
    telefonoCliente: trabajo?.telefonoCliente || '',
    emailCliente: trabajo?.emailCliente || '',
    clienteId: trabajo?.clienteId || '',
    placa: trabajo?.placa || '',
    marca: trabajo?.marca || '',
    modelo: trabajo?.modelo || '',
    ano: trabajo?.ano || new Date().getFullYear(),
    kilometraje: trabajo?.kilometraje || '',
    tecnicoId: trabajo?.tecnicoId || '',
    observaciones: trabajo?.observaciones || '',
    fecha: trabajo?.fecha ? trabajo.fecha.slice(0, 10) : hoyISO(),
  })

  const [items, setItems] = useState(trabajo?.items || [])

  // Inventario para busqueda de productos
  const [inventario, setInventario] = useState([])
  const [itemSearch, setItemSearch] = useState({}) // { [itemId]: { query, results, show } }

  useEffect(() => {
    const cached = lsGet(LS_KEYS.INVENTARIO_CACHE, [])
    if (cached.length > 0) {
      setInventario(cached)
    }
    // Cargar en background
    cargarInventarioCompleto().then(data => {
      if (data.length > 0) setInventario(data)
    }).catch(() => {})
  }, [])

  const buscarEnInventario = useCallback((itemId, query) => {
    if (!query || query.length < 2) {
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results: [], show: false } }))
      return
    }
    const q = query.toLowerCase()
    const results = inventario.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.codigoBarras || '').toLowerCase().includes(q)
    ).slice(0, 10)
    setItemSearch(prev => ({ ...prev, [itemId]: { query, results, show: results.length > 0 } }))
  }, [inventario])

  const seleccionarProducto = (itemId, producto) => {
    updateItem(itemId, 'nombre', producto.nombre)
    updateItem(itemId, 'precio', producto.precio)
    updateItem(itemId, 'iva', producto.iva)
    updateItem(itemId, 'codigo', producto.codigo || producto.sku || '')
    setItemSearch(prev => ({ ...prev, [itemId]: { query: '', results: [], show: false } }))
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Seleccionar cliente de resultados
  const seleccionarCliente = (c) => {
    set('cedula', normalizarDoc(c))
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', c.telefono || c.phone || '')
    set('emailCliente', c.email || c.correo || '')
    set('clienteId', c.id || '')
    setResultados([])
  }

  // Items
  const addItem = () => {
    setItems(prev => [...prev, {
      id: uid(), codigo: '', nombre: '', precio: 0, cantidad: 1, iva: IVA_DEFAULT,
    }])
  }
  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }
  const removeItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  // Totales
  const totales = useMemo(() => {
    let subtotal = 0, iva = 0, total = 0
    items.forEach(i => {
      const precio = parseFloat(i.precio) || 0
      const cant = parseInt(i.cantidad) || 1
      const ivaPct = parseFloat(i.iva) || 0
      const lineaTotal = precio * cant
      if (ivaPct > 0) {
        const base = lineaTotal / (1 + ivaPct / 100)
        subtotal += base
        iva += lineaTotal - base
      } else {
        subtotal += lineaTotal
      }
      total += lineaTotal
    })
    return { subtotal: Math.round(subtotal), iva: Math.round(iva), total: Math.round(total) }
  }, [items])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.placa || !form.cliente) return
    onSave({
      ...form,
      placa: form.placa.toUpperCase(),
      ano: parseInt(form.ano) || new Date().getFullYear(),
      kilometraje: parseInt(form.kilometraje) || 0,
      tecnicoId: parseInt(form.tecnicoId) || null,
      items,
      subtotalSinIva: totales.subtotal,
      totalIva: totales.iva,
      total: totales.total,
      estado: trabajo?.estado || ESTADOS.PENDIENTE,
      fecha: new Date(form.fecha + 'T12:00:00').toISOString(),
    })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Editar Trabajo' : 'Nuevo Trabajo'}</h3>
        <button className="btn btn-outline" onClick={onCancel}>Volver</button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* CLIENTE */}
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
                      {c.telefono && <span className="text-muted" style={{ marginLeft: 8 }}>{c.telefono}</span>}
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
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Telefono</label>
              <input className="form-input" value={form.telefonoCliente} placeholder="300..." onChange={e => set('telefonoCliente', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.emailCliente} placeholder="email@..." onChange={e => set('emailCliente', e.target.value)} />
            </div>
          </div>
        </div>

        {/* VEHICULO */}
        <div className="card">
          <div className="card-title">Vehiculo</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Placa *</label>
              <input className="form-input" value={form.placa} required placeholder="ABC123" style={{ textTransform: 'uppercase' }}
                onChange={e => set('placa', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Marca *</label>
              <input className="form-input" value={form.marca} required placeholder="Toyota, Mazda..." onChange={e => set('marca', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Modelo</label>
              <input className="form-input" value={form.modelo} placeholder="Corolla, CX-5..." onChange={e => set('modelo', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ano</label>
              <input className="form-input" type="number" value={form.ano} min="1980" max="2030" onChange={e => set('ano', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Kilometraje</label>
              <input className="form-input" type="number" value={form.kilometraje} min="0" placeholder="45000" onChange={e => set('kilometraje', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tecnico</label>
              <select className="form-select" value={form.tecnicoId} onChange={e => set('tecnicoId', e.target.value)}>
                <option value="">Seleccionar</option>
                {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ITEMS */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Repuestos y Servicios</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ Agregar linea</button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted text-center" style={{ padding: 24 }}>Sin items. Usa el boton para agregar repuestos o servicios.</p>
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
                    const searchState = itemSearch[item.id]
                    return (
                      <tr key={item.id}>
                        <td style={{ position: 'relative' }}>
                          <input className="form-input" value={item.nombre} placeholder="Buscar por nombre, codigo o referencia..."
                            onChange={e => {
                              updateItem(item.id, 'nombre', e.target.value)
                              buscarEnInventario(item.id, e.target.value)
                            }}
                            onFocus={() => {
                              if (item.nombre && item.nombre.length >= 2) buscarEnInventario(item.id, item.nombre)
                            }}
                            onBlur={() => setTimeout(() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } })), 200)}
                            style={{ padding: '6px 10px', fontSize: 13 }} />
                          {searchState?.show && searchState.results.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--slate-200)', borderRadius: 8, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                              {searchState.results.map(p => (
                                <div key={p.id} onClick={() => seleccionarProducto(item.id, p)}
                                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--slate-100)', fontSize: 12 }}>
                                  <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                                  <div style={{ color: '#666', display: 'flex', gap: 12, marginTop: 2 }}>
                                    {p.codigo && <span>Cod: {p.codigo}</span>}
                                    {p.sku && <span>SKU: {p.sku}</span>}
                                    <span>Precio: {fmt(p.precio)}</span>
                                    <span>Stock: {p.stock}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <input className="form-input" type="number" value={item.precio} min="0"
                            onChange={e => updateItem(item.id, 'precio', e.target.value)}
                            style={{ padding: '6px 10px', fontSize: 13, textAlign: 'right' }} />
                        </td>
                        <td>
                          <input className="form-input" type="number" value={item.cantidad} min="1"
                            onChange={e => updateItem(item.id, 'cantidad', e.target.value)}
                            style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} />
                        </td>
                        <td>
                          <input className="form-input" type="number" value={item.iva} min="0"
                            onChange={e => updateItem(item.id, 'iva', e.target.value)}
                            style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} />
                        </td>
                        <td className="text-right text-mono" style={{ fontWeight: 600 }}>{fmt(lineTotal)}</td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)}>🗑</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totales */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--slate-200)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40 }}>
              <div className="text-sm">
                <span className="text-muted">Subtotal:</span>{' '}
                <span className="text-mono">{fmt(totales.subtotal)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted">IVA:</span>{' '}
                <span className="text-mono">{fmt(totales.iva)}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                <span>Total: </span>
                <span className="text-mono" style={{ color: 'var(--green-500)' }}>{fmt(totales.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* OBSERVACIONES */}
        <div className="card">
          <div className="card-title">Observaciones</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input className="form-input" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <textarea className="form-textarea" value={form.observaciones} placeholder="Diagnostico, notas, recomendaciones..."
              onChange={e => set('observaciones', e.target.value)} />
          </div>
        </div>

        {/* ACCIONES */}
        <div className="flex gap-2" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary">{isEdit ? 'Actualizar' : 'Crear Trabajo'}</button>
        </div>
      </form>
    </div>
  )
}
