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

export default function Inspecciones({ trabajos, notify, onVincularInspeccion, inspeccionesHook }) {
  const { inspecciones, guardar } = inspeccionesHook || {}
  const [vista, setVista] = useState('lista')
  const [editId, setEditId] = useState(null)

  // Vincular inspeccion al trabajo (para que el cliente la vea en el portal)
  const vincularATrabajo = (insp) => {
    if (!insp.placa) { notify('La inspeccion no tiene placa', 'error'); return }
    const trabajo = trabajos.find(t => (t.placa || '').toUpperCase() === insp.placa.toUpperCase())
    if (!trabajo) { notify(`No se encontro trabajo con placa ${insp.placa}`, 'error'); return }
    if (onVincularInspeccion) {
      onVincularInspeccion(trabajo.id, insp)
      notify(`Inspeccion vinculada a ${trabajo.otCodigo || trabajo.id}`, 'success')
    }
  }

  const sorted = useMemo(() =>
    [...inspecciones].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [inspecciones])

  const stats = useMemo(() => ({
    total: inspecciones.length,
    conUrgentes: inspecciones.filter(i => i.items?.some(it => it.estado === ESTADO_ITEM.URGENTE)).length,
  }), [inspecciones])

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

  return (
    <div>
      <div className="pagehd">
        <div><h2>Inspecciones digitales</h2><p className="sub">DVI · {stats.total} inspecciones realizadas · <b style={{color:'var(--red-600)'}}>{stats.conUrgentes}</b> con items urgentes</p></div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setVista('nueva')}>+ Nueva inspeccion</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,marginBottom:18}}>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg></div><div className="kpi__lbl">Total inspecciones</div></div><div className="kpi__v">{stats.total}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic red"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div className="kpi__lbl">Con urgentes</div></div><div className="kpi__v" style={{color:'var(--red-600)'}}>{stats.conUrgentes}</div></div>
      </div>

      <div className="card">
        <div className="card__h"><h3>Historial de inspecciones</h3><span className="count">{sorted.length}</span></div>
        <div className="card__b card__b--flush">
          {sorted.length === 0 ? (
            <div className="empty"><h4>Sin inspecciones</h4><p>No hay inspecciones registradas.</p></div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th>Técnico</th>
                  <th style={{textAlign:'center'}}>Estado</th>
                  <th>Fecha</th>
                  <th></th>
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
                    <tr key={i.id} style={{cursor:'pointer'}} onClick={() => { setEditId(i.id); setVista('detalle') }}>
                      <td className="c-mono" style={{fontSize:12}}>{i.id}</td>
                      <td className="c-mono" style={{fontWeight:700}}>{i.placa || '—'}</td>
                      <td className="c-name">{i.cliente || '—'}</td>
                      <td className="c-muted">{i.tecnico || '—'}</td>
                      <td>
                        <div style={{display:'flex',gap:4,justifyContent:'center',alignItems:'center'}}>
                          {buenos > 0 && <span className="badge badge-s">{buenos}</span>}
                          {sugeridos > 0 && <span className="badge badge-w">{sugeridos}</span>}
                          {urgentes > 0 && <span className="badge badge-d">{urgentes}</span>}
                          <span style={{fontSize:11,color:'var(--text-3)',marginLeft:4}}>{pct}%</span>
                        </div>
                      </td>
                      <td className="c-muted">{fmtDate(i.fecha)}</td>
                      <td>
                        <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                          <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); setEditId(i.id); setVista('editar') }}>Editar</button>
                          <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); vincularATrabajo(i) }} title="Vincular al trabajo">OT</button>
                          <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); guardar(inspecciones.filter(x => x.id !== i.id)); notify('Inspeccion eliminada', 'info') }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
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
      <div className="pagehd">
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button className="btn btn-outline btn-sm" onClick={onCancel}><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Volver</button>
          <div><h2>{isEdit ? 'Editar inspeccion' : 'Nueva inspeccion digital'}</h2><p className="sub">Recorre el checklist y marca cada item</p></div>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" form="insp-form" className="btn btn-primary">{isEdit ? 'Actualizar' : 'Guardar inspeccion'}</button>
        </div>
      </div>

      <form id="insp-form" onSubmit={handleSubmit}>
        <div className="card" style={{marginBottom:16}}>
          <div className="card__h"><h3>Datos del vehiculo</h3></div>
          <div className="card__b" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
            <div className="field"><label>Placa *</label><input className="input" value={placa} required placeholder="ABC123" style={{textTransform:'uppercase'}} onChange={e => { setPlaca(e.target.value); if (e.target.value.length >= 6) autoFill(e.target.value) }}/></div>
            <div className="field"><label>Cliente</label><input className="input" value={cliente} placeholder="Nombre" onChange={e => setCliente(e.target.value)}/></div>
            <div className="field"><label>Cedula</label><input className="input" value={cedula} placeholder="Cedula cliente" onChange={e => setCedula(e.target.value)}/></div>
            <div className="field"><label>Vehiculo</label><input className="input" value={vehiculo} placeholder="Marca Modelo Ano" onChange={e => setVehiculo(e.target.value)}/></div>
            <div className="field"><label>Técnico</label><select className="input" value={tecnico} onChange={e => setTecnico(e.target.value)}><option value="">Seleccionar...</option>{TECNICOS.filter(t => t.activo !== false || t.nombre === tecnico).map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}</select></div>
            <div className="field"><label>Kilometraje</label><input className="input" type="number" value={km} placeholder="45000" onChange={e => setKm(e.target.value)}/></div>
          </div>
        </div>

        {categorias.map(cat => (
          <div key={cat} className="card" style={{marginBottom:14}}>
            <div className="card__h"><h3>{cat}</h3><span className="count">{items.filter(i => i.categoria === cat).length} items</span></div>
            <div className="card__b" style={{display:'flex',flexDirection:'column',gap:0}}>
              {items.filter(i => i.categoria === cat).map((item, idx, arr) => (
                <div key={item.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 0',borderBottom:idx<arr.length-1?'1px solid var(--border)':'none'}}>
                  <span style={{flex:1,fontSize:13.5,color:'var(--text)'}}>{item.nombre}</span>
                  <div style={{display:'flex',gap:6}}>
                    {Object.entries(ESTADO_COLORS).filter(([k]) => k !== 'no_aplica').map(([key, val]) => {
                      const active = item.estado === key
                      const toneMap = { bueno: {bg:'var(--green-50)',c:'var(--green-700)',bd:'var(--green-200)'}, sugerido: {bg:'var(--amber-50)',c:'var(--amber-700)',bd:'var(--amber-200)'}, urgente: {bg:'var(--red-50)',c:'var(--red-700)',bd:'var(--red-200)'} }
                      const s = toneMap[key] || {bg:'var(--bg-subtle)',c:'var(--text-3)',bd:'var(--border)'}
                      return (
                        <button key={key} type="button" title={val.label}
                          style={{width:34,height:34,borderRadius:8,border:`1.5px solid ${active?s.c:s.bd}`,background:active?s.bg:'transparent',color:active?s.c:'var(--text-4)',fontSize:14,fontWeight:800,cursor:'pointer'}}
                          onClick={() => updateItem(item.id, 'estado', key)}>
                          {val.icon}
                        </button>
                      )
                    })}
                  </div>
                  <label className="btn btn-outline btn-sm" style={{cursor:'pointer'}}>
                    + Foto
                    <input type="file" accept="image/*" multiple hidden onChange={e => addFoto(item.id, e.target.files)}/>
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
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
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      {onVolver && (
        <div className="pagehd">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button className="btn btn-outline btn-sm" onClick={onVolver}><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Volver</button>
            <div><h2>Inspeccion {inspeccion.id}</h2><p className="sub">{inspeccion.vehiculo || ''} · placa <span className="mono" style={{fontWeight:700}}>{inspeccion.placa}</span></p></div>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:18}}>
        <div className="card" style={{textAlign:'center',padding:'8px 0'}}>
          <div className="card__b" style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--text-3)',textTransform:'uppercase'}}>Estado general del vehiculo</div>
            <div style={{position:'relative',width:160,height:160,marginTop:6}}>
              <svg viewBox="0 0 100 100" style={{transform:'rotate(-90deg)'}}>
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="9"/>
                <circle cx="50" cy="50" r="42" fill="none" stroke={pct>=80?'var(--green-500)':pct>=50?'var(--amber-500)':'var(--red-500)'} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${pct*2.64} 264`}/>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{fontSize:38,fontWeight:800,letterSpacing:'-.02em',color:pct>=80?'var(--green-600)':pct>=50?'var(--amber-600)':'var(--red-600)'}}>{pct}%</div>
                <div style={{fontSize:11,color:'var(--text-3)',fontWeight:600}}>en buen estado</div>
              </div>
            </div>
            <div style={{display:'flex',gap:18,marginTop:14,marginBottom:6}}>
              {[{n:buenos.length,l:'Buenos',c:'var(--green-600)'},{n:sugeridos.length,l:'Sugeridos',c:'var(--amber-600)'},{n:urgentes.length,l:'Urgentes',c:'var(--red-600)'}].map(s=>(
                <div key={s.l} style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:s.c,lineHeight:1}}>{s.n}</div><div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.04em',color:'var(--text-3)',textTransform:'uppercase',marginTop:3}}>{s.l}</div></div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__h"><h3>Datos de la inspeccion</h3></div>
          <div className="card__b" style={{display:'flex',flexDirection:'column',gap:12}}>
            {[['Cliente',inspeccion.cliente||'—'],['Vehiculo',inspeccion.vehiculo||'—'],['Kilometraje',inspeccion.km?`${inspeccion.km} km`:'—'],['Tecnico',inspeccion.tecnico||'—'],['Fecha',fmtDate(inspeccion.fecha)]].map(([l,v])=>(
              <div key={l}><div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4}}>{l}</div><div style={{fontSize:14,color:'var(--text)'}}>{v}</div></div>
            ))}
          </div>
        </div>
      </div>

      {urgentes.length > 0 && (
        <div className="card" style={{borderColor:'rgba(220,38,38,.32)',background:'rgba(220,38,38,.04)'}}>
          <div className="card__h" style={{cursor:'pointer',borderBottomColor:'rgba(220,38,38,.18)'}} onClick={() => setExpandido(e => ({...e, urgente: !e.urgente}))}>
            <h3 style={{color:'var(--red-700)'}}>Atención urgente</h3><span className="count">{urgentes.length} items {expandido.urgente ? '▾' : '▸'}</span>
          </div>
          {expandido.urgente && <div className="card__b" style={{display:'flex',flexDirection:'column',gap:0}}>
            {urgentes.map(item => <InspeccionItemView key={item.id} item={item} />)}
          </div>}
        </div>
      )}

      {sugeridos.length > 0 && (
        <div className="card" style={{borderColor:'rgba(245,158,11,.32)',background:'rgba(245,158,11,.04)'}}>
          <div className="card__h" style={{cursor:'pointer',borderBottomColor:'rgba(245,158,11,.18)'}} onClick={() => setExpandido(e => ({...e, sugerido: !e.sugerido}))}>
            <h3 style={{color:'var(--amber-600)'}}>Reparación sugerida</h3><span className="count">{sugeridos.length} items {expandido.sugerido ? '▾' : '▸'}</span>
          </div>
          {expandido.sugerido && <div className="card__b" style={{display:'flex',flexDirection:'column',gap:0}}>
            {sugeridos.map(item => <InspeccionItemView key={item.id} item={item} />)}
          </div>}
        </div>
      )}

      {buenos.length > 0 && (
        <div className="card" style={{borderColor:'rgba(22,163,74,.28)',background:'rgba(22,163,74,.04)'}}>
          <div className="card__h" style={{cursor:'pointer',borderBottomColor:'rgba(22,163,74,.16)'}} onClick={() => setExpandido(e => ({...e, bueno: !e.bueno}))}>
            <h3 style={{color:'var(--green-700)'}}>En buen estado</h3><span className="count">{buenos.length} items {expandido.bueno ? '▾' : '▸'}</span>
          </div>
          {expandido.bueno && <div className="card__b" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {buenos.map(item => (
              <div key={item.id} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:13}}>
                <span style={{width:18,height:18,borderRadius:'50%',background:'var(--green-50)',color:'var(--green-700)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>✓</span>
                <span style={{color:'var(--text-2)'}}>{item.categoria}: <b style={{color:'var(--text)'}}>{item.nombre}</b></span>
              </div>
            ))}
          </div>}
        </div>
      )}
    </div>
  )
}

function InspeccionItemView({ item }) {
  const est = ESTADO_COLORS[item.estado] || ESTADO_COLORS.bueno
  const ic = item.estado === 'urgente' ? '✕' : item.estado === 'sugerido' ? '!' : '✓'
  return (
    <div style={{display:'flex',gap:12,padding:'12px 0',borderBottom:'1px solid var(--border)',alignItems:'flex-start'}}>
      <span style={{width:24,height:24,borderRadius:'50%',background:est.bg,color:est.color,display:'inline-flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:12,flexShrink:0,marginTop:2}}>{ic}</span>
      <div style={{flex:1}}>
        <div style={{fontWeight:600,fontSize:13.5,color:'var(--text)'}}>{item.categoria}: {item.nombre}</div>
        {item.comentario && <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:3,lineHeight:1.5}}>{item.comentario}</div>}
        {item.fotos?.length > 0 && (
          <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
            {item.fotos.map(f => (
              <img key={f.id} src={f.dataUrl} alt="" style={{width:60,height:60,objectFit:'cover',borderRadius:6,border:'1px solid var(--border)'}}/>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
