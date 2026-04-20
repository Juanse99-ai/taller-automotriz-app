import { useState, useMemo } from 'react'
import { uid, fmtDate } from '../utils/helpers'
import { INSPECCION_CATEGORIAS } from '../utils/vehiculos'
import { TECNICOS } from '../utils/constants'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

const ESTADO_ITEM = { BUENO: 'bueno', SUGERIDO: 'sugerido', URGENTE: 'urgente', NO_APLICA: 'no_aplica' }

const ESTADO_COLORS = {
  bueno: { bg: '#dcfce7', color: '#166534', icon: '✓', label: 'Buen estado' },
  sugerido: { bg: '#fef3c7', color: '#92400e', icon: '!', label: 'Reparacion sugerida' },
  urgente: { bg: '#fee2e2', color: '#991b1b', icon: '✕', label: 'Atencion urgente' },
  no_aplica: { bg: '#f1f5f9', color: '#64748b', icon: '—', label: 'No aplica' },
}

export default function Inspecciones({ trabajos, notify }) {
  const [inspecciones, setInspecciones] = useState(() => lsGet('inspecciones', []))
  const [vista, setVista] = useState('lista')
  const [editId, setEditId] = useState(null)

  const guardar = (nuevas) => {
    setInspecciones(nuevas)
    lsSet('inspecciones', nuevas)
  }

  const sorted = useMemo(() =>
    [...inspecciones].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [inspecciones])

  if (vista === 'nueva' || vista === 'editar') {
    const insp = vista === 'editar' ? inspecciones.find(i => i.id === editId) : null
    return (
      <InspeccionForm
        inspeccion={insp}
        trabajos={trabajos}
        onSave={(data) => {
          if (vista === 'editar') {
            guardar(inspecciones.map(i => i.id === editId ? { ...i, ...data } : i))
            notify('Inspeccion actualizada', 'success')
          } else {
            guardar([{ ...data, id: `INS-${uid()}`, fecha: new Date().toISOString() }, ...inspecciones])
            notify('Inspeccion creada', 'success')
          }
          setVista('lista')
          setEditId(null)
        }}
        onCancel={() => { setVista('lista'); setEditId(null) }}
      />
    )
  }

  // Vista: Detalle de inspeccion
  if (vista === 'detalle' && editId) {
    const insp = inspecciones.find(i => i.id === editId)
    if (!insp) { setVista('lista'); return null }
    return <InspeccionDetalle inspeccion={insp} onVolver={() => { setVista('lista'); setEditId(null) }} />
  }

  const stats = useMemo(() => ({
    total: inspecciones.length,
    conUrgentes: inspecciones.filter(i => i.items?.some(it => it.estado === ESTADO_ITEM.URGENTE)).length,
  }), [inspecciones])

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{stats.total}</div>
          <div className="metric-label">Inspecciones</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--red-500)' }}>{stats.conUrgentes}</div>
          <div className="metric-label">Con Urgentes</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Inspecciones Digitales (DVI)</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setVista('nueva')}>+ Nueva Inspeccion</button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <p>No hay inspecciones registradas.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th>Tecnico</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(i => {
                  const urgentes = (i.items || []).filter(it => it.estado === ESTADO_ITEM.URGENTE).length
                  const sugeridos = (i.items || []).filter(it => it.estado === ESTADO_ITEM.SUGERIDO).length
                  const buenos = (i.items || []).filter(it => it.estado === ESTADO_ITEM.BUENO).length
                  const totalItems = (i.items || []).filter(it => it.estado !== ESTADO_ITEM.NO_APLICA).length
                  const pct = totalItems > 0 ? Math.round((buenos / totalItems) * 100) : 0
                  return (
                    <tr key={i.id}>
                      <td className="text-mono text-sm">{i.id}</td>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{i.placa || '—'}</td>
                      <td>{i.cliente || '—'}</td>
                      <td className="text-sm">{i.tecnico || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {buenos > 0 && <span className="badge badge-success">{buenos}</span>}
                          {sugeridos > 0 && <span className="badge badge-warning">{sugeridos}</span>}
                          {urgentes > 0 && <span className="badge badge-danger">{urgentes}</span>}
                          <span className="text-xs text-muted" style={{ marginLeft: 4 }}>{pct}%</span>
                        </div>
                      </td>
                      <td className="text-sm text-muted">{fmtDate(i.fecha)}</td>
                      <td>
                        <div className="actions-cell">
                          <button className="btn btn-outline btn-sm" onClick={() => { setEditId(i.id); setVista('detalle') }}>Ver</button>
                          <button className="btn btn-outline btn-sm" onClick={() => { setEditId(i.id); setVista('editar') }}>Editar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => {
                            guardar(inspecciones.filter(x => x.id !== i.id))
                            notify('Inspeccion eliminada', 'info')
                          }}>🗑</button>
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

function InspeccionForm({ inspeccion, trabajos, onSave, onCancel }) {
  const isEdit = !!inspeccion
  const [placa, setPlaca] = useState(inspeccion?.placa || '')
  const [cliente, setCliente] = useState(inspeccion?.cliente || '')
  const [cedula, setCedula] = useState(inspeccion?.cedula || '')
  const [vehiculo, setVehiculo] = useState(inspeccion?.vehiculo || '')
  const [tecnico, setTecnico] = useState(inspeccion?.tecnico || '')
  const [km, setKm] = useState(inspeccion?.km || '')

  const defaultItems = INSPECCION_CATEGORIAS.flatMap(cat =>
    cat.items.map(nombre => ({
      id: uid(),
      categoria: cat.nombre,
      nombre,
      estado: ESTADO_ITEM.BUENO,
      comentario: '',
      fotos: [],
    }))
  )

  const [items, setItems] = useState(inspeccion?.items || defaultItems)

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const addFoto = (id, files) => {
    if (!files?.length) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        setItems(prev => prev.map(i => i.id === id ? {
          ...i, fotos: [...(i.fotos || []), { id: uid(), dataUrl: reader.result, fecha: new Date().toISOString() }]
        } : i))
      }
      reader.readAsDataURL(file)
    })
  }

  // Auto-fill from trabajo
  const autoFill = (p) => {
    const t = trabajos?.find(t => (t.placa || '').toUpperCase() === p.toUpperCase())
    if (t) {
      if (!cliente) setCliente(t.cliente || '')
      if (!cedula) setCedula(t.cedula || '')
      if (!vehiculo) setVehiculo([t.marca, t.modelo, t.ano].filter(Boolean).join(' '))
      if (!tecnico) {
        const tec = TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))
        if (tec) setTecnico(tec.nombre)
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!placa) return
    onSave({ placa: placa.toUpperCase(), cliente, cedula, vehiculo, tecnico, km, items })
  }

  const categorias = [...new Set(items.map(i => i.categoria))]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Editar Inspeccion' : 'Nueva Inspeccion Digital'}</h3>
        <button className="btn btn-outline" onClick={onCancel}>Volver</button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-title">Datos del Vehiculo</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Placa *</label>
              <input className="form-input" value={placa} required placeholder="ABC123" style={{ textTransform: 'uppercase' }}
                onChange={e => { setPlaca(e.target.value); if (e.target.value.length >= 6) autoFill(e.target.value) }} />
            </div>
            <div className="form-group">
              <label className="form-label">Cliente</label>
              <input className="form-input" value={cliente} placeholder="Nombre" onChange={e => setCliente(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cedula</label>
              <input className="form-input" value={cedula} placeholder="Cedula cliente" onChange={e => setCedula(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Vehiculo</label>
              <input className="form-input" value={vehiculo} placeholder="Marca Modelo Año" onChange={e => setVehiculo(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tecnico</label>
              <select className="form-select" value={tecnico} onChange={e => setTecnico(e.target.value)}>
                <option value="">Seleccionar</option>
                {TECNICOS.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Kilometraje</label>
              <input className="form-input" type="number" value={km} placeholder="45000" onChange={e => setKm(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Items de inspeccion por categoria */}
        {categorias.map(cat => (
          <div key={cat} className="card">
            <div className="card-title">{cat}</div>
            {items.filter(i => i.categoria === cat).map(item => (
              <div key={item.id} className="dvi-item">
                <div className="dvi-item-header">
                  <span className="dvi-item-name">{item.nombre}</span>
                  <div className="dvi-item-states">
                    {Object.entries(ESTADO_COLORS).filter(([k]) => k !== 'no_aplica').map(([key, val]) => (
                      <button key={key} type="button"
                        className={`dvi-state-btn ${item.estado === key ? 'active' : ''}`}
                        style={{
                          background: item.estado === key ? val.bg : 'transparent',
                          color: item.estado === key ? val.color : 'var(--slate-400)',
                          borderColor: item.estado === key ? val.color : 'var(--slate-300)',
                        }}
                        onClick={() => updateItem(item.id, 'estado', key)}
                        title={val.label}
                      >
                        {val.icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dvi-item-body">
                  <input className="form-input" placeholder="Comentarios..." value={item.comentario}
                    onChange={e => updateItem(item.id, 'comentario', e.target.value)}
                    style={{ fontSize: 12, padding: '6px 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', fontSize: 11 }}>
                      + Foto
                      <input type="file" accept="image/*" multiple hidden onChange={e => addFoto(item.id, e.target.files)} />
                    </label>
                    {(item.fotos || []).map(f => (
                      <img key={f.id} src={f.dataUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-card)' }} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary">{isEdit ? 'Actualizar' : 'Guardar Inspeccion'}</button>
        </div>
      </form>
    </div>
  )
}

// Vista detalle de inspeccion (lo que ve el cliente)
export function InspeccionDetalle({ inspeccion, onVolver }) {
  const urgentes = (inspeccion.items || []).filter(i => i.estado === ESTADO_ITEM.URGENTE)
  const sugeridos = (inspeccion.items || []).filter(i => i.estado === ESTADO_ITEM.SUGERIDO)
  const buenos = (inspeccion.items || []).filter(i => i.estado === ESTADO_ITEM.BUENO)
  const totalItems = (inspeccion.items || []).filter(i => i.estado !== ESTADO_ITEM.NO_APLICA).length
  const pct = totalItems > 0 ? Math.round((buenos.length / totalItems) * 100) : 0

  const [expandido, setExpandido] = useState({ urgente: true, sugerido: true, bueno: false })

  return (
    <div>
      {onVolver && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn btn-outline" onClick={onVolver}>Volver</button>
        </div>
      )}

      {/* Header */}
      <div className="card" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>SEGUIMIENTO EN LINEA</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'left', marginTop: 16 }}>
          <div><span className="text-sm text-muted">Orden:</span> <strong>{inspeccion.id}</strong></div>
          <div><span className="text-sm text-muted">Tecnico:</span> <strong>{inspeccion.tecnico || '—'}</strong></div>
          <div><span className="text-sm text-muted">Vehiculo:</span> <strong>{inspeccion.vehiculo || '—'}</strong></div>
          <div><span className="text-sm text-muted">Placa:</span> <strong>{inspeccion.placa}</strong></div>
        </div>
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 14 }}>Estado del vehiculo:</div>
          <div style={{ fontSize: 42, fontWeight: 800, color: pct >= 80 ? 'var(--green-500)' : pct >= 50 ? 'var(--amber-500)' : 'var(--red-500)' }}>{pct}%</div>
        </div>
      </div>

      {/* Resumen */}
      <div className="card">
        <div className="card-title">Resumen de Diagnostico</div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Buen estado', count: buenos.length, color: '#166534', bg: '#dcfce7' },
            { label: 'Reparacion sugerida', count: sugeridos.length, color: '#92400e', bg: '#fef3c7' },
            { label: 'Reparacion urgente', count: urgentes.length, color: '#991b1b', bg: '#fee2e2' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{s.count}</div>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Items urgentes */}
      {urgentes.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--red-500)' }}>
          <div className="card-title" style={{ cursor: 'pointer', color: 'var(--red-500)' }} onClick={() => setExpandido(e => ({ ...e, urgente: !e.urgente }))}>
            Items Reparacion Urgente ({urgentes.length}) {expandido.urgente ? '▾' : '▸'}
          </div>
          {expandido.urgente && urgentes.map(item => (
            <InspeccionItemView key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Items sugeridos */}
      {sugeridos.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--amber-500)' }}>
          <div className="card-title" style={{ cursor: 'pointer', color: 'var(--amber-500)' }} onClick={() => setExpandido(e => ({ ...e, sugerido: !e.sugerido }))}>
            Items Reparacion Sugerida ({sugeridos.length}) {expandido.sugerido ? '▾' : '▸'}
          </div>
          {expandido.sugerido && sugeridos.map(item => (
            <InspeccionItemView key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Items buenos */}
      {buenos.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--green-500)' }}>
          <div className="card-title" style={{ cursor: 'pointer', color: 'var(--green-500)' }} onClick={() => setExpandido(e => ({ ...e, bueno: !e.bueno }))}>
            Items en Buen Estado ({buenos.length}) {expandido.bueno ? '▾' : '▸'}
          </div>
          {expandido.bueno && buenos.map(item => (
            <InspeccionItemView key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function InspeccionItemView({ item }) {
  const est = ESTADO_COLORS[item.estado] || ESTADO_COLORS.bueno
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: est.bg, color: est.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{est.icon}</div>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{item.nombre}</span>
        <span className="badge" style={{ background: est.bg, color: est.color, fontSize: 10 }}>{est.label}</span>
      </div>
      {item.comentario && <p className="text-sm" style={{ marginLeft: 30, color: 'var(--slate-600)' }}><strong>Comentarios:</strong> {item.comentario}</p>}
      {item.fotos?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginLeft: 30, marginTop: 6, flexWrap: 'wrap' }}>
          {item.fotos.map(f => (
            <div key={f.id} style={{ textAlign: 'center' }}>
              <img src={f.dataUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-card)' }} />
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>{new Date(f.fecha).toLocaleDateString('es-CO')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
