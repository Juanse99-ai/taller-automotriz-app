import { useState, useMemo } from 'react'
import { uid, fmtDate } from '../utils/helpers'
import { INSPECCION_CATEGORIAS } from '../utils/vehiculos'
import { TECNICOS } from '../utils/constants'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, IconEdit, IconTrash } from '../components/ui'

const ESTADO_ITEM = { BUENO: 'bueno', SUGERIDO: 'sugerido', URGENTE: 'urgente', NO_APLICA: 'no_aplica' }

// --- Iconos locales (Lucide inline: 24x24, sin fill, trazo 2, puntas redondas).
// Lucide no esta instalado y '../components/ui' no trae camara ni chevron.
const svgIc = (d, w = 15, sw = 2) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const IcChevronR = (p) => svgIc(<path d="m9 18 6-6-6-6" />, p?.w || 14, 2.2)
const IcChevronD = (p) => svgIc(<path d="m6 9 6 6 6-6" />, p?.w || 14, 2.2)
const IcCam = (p) => svgIc(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>, p?.w || 15)
const IcTick = (p) => svgIc(<path d="M20 6 9 17l-5-5" />, p?.w || 15, 2.6)
const IcCross = (p) => svgIc(<path d="M18 6 6 18M6 6l12 12" />, p?.w || 13, 2.8)
const IcBack = () => svgIc(<path d="M19 12H5M12 19l-7-7 7-7" />, 14, 2.2)

// Colores THEME-AWARE: --soft-* es tinte claro en modo claro y translúcido en
// oscuro; el texto --*-700 se aclara en oscuro. Así el chip se lee en ambos temas
// (antes eran hex claros fijos → isla clara sobre fondo oscuro).
const ESTADO_COLORS = {
  bueno: { bg: 'var(--soft-green)', color: 'var(--green-700)', icon: '✓', label: 'Buen estado' },
  sugerido: { bg: 'var(--soft-amber)', color: 'var(--amber-700)', icon: '!', label: 'Reparacion sugerida' },
  urgente: { bg: 'var(--soft-red)', color: 'var(--red-700)', icon: '✕', label: 'Atencion urgente' },
  no_aplica: { bg: 'var(--fill)', color: 'var(--text-3)', icon: '—', label: 'No aplica' },
}

export default function Inspecciones({ trabajos, notify, onVincularInspeccion, inspeccionesHook }) {
  const { inspecciones, guardar } = inspeccionesHook || {}
  const [vista, setVista] = useState('lista')
  const [editId, setEditId] = useState(null)
  const [confirmCfg, setConfirmCfg] = useState(null)

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
    <>
    <div>
      {/* Barra de titulo del handoff: las dos tarjetas KPI ocupaban una franja
          entera para dos numeros. El total baja al subtitulo y solo queda como
          cifra grande lo que exige actuar hoy: las inspecciones con urgentes. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Inspecciones digitales</h1>
          <div className="hd-head__sub">
            {stats.total} {stats.total === 1 ? 'inspección registrada' : 'inspecciones registradas'}
            {sorted[0] ? <> · última {fmtDate(sorted[0].fecha)}</> : null}
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-fig" style={{'--fg': stats.conUrgentes ? 'var(--bad-fg)' : 'var(--text-4)'}}>
            <div className="hd-fig__l">CON URGENTES</div>
            <div className="hd-fig__v">{stats.conUrgentes}</div>
            <div className="hd-fig__s">de {stats.total}</div>
          </div>
          <div className="hd-head__div" />
          <Button variant="primary" onClick={() => setVista('nueva')}>+ Nueva inspección</Button>
        </div>
      </div>

      <div className="hd-card" style={{marginTop:14}}>
        <div className="hd-tbl">
          <div className="hd-tbl__h">
            <span style={{width:112}}>PLACA · ID</span>
            <span style={{flex:1,minWidth:0}}>CLIENTE · VEHÍCULO</span>
            <span style={{width:118}}>TÉCNICO</span>
            <span style={{width:132}}>ESTADO</span>
            <span style={{width:58,textAlign:'right'}}>% BIEN</span>
            <span style={{width:78,textAlign:'right'}}>FECHA</span>
            <span style={{width:122}} />
          </div>
          <div className="hd-tbl__b">
            {sorted.length === 0 ? (
              <div className="hd-void">
                <div className="hd-void__t">Sin inspecciones</div>
                <div className="hd-void__s">No hay inspecciones registradas.</div>
              </div>
            ) : sorted.map(i => {
              const urgentes = (i.items || []).filter(it => it.estado === ESTADO_ITEM.URGENTE).length
              const sugeridos = (i.items || []).filter(it => it.estado === ESTADO_ITEM.SUGERIDO).length
              const buenos = (i.items || []).filter(it => it.estado === ESTADO_ITEM.BUENO).length
              const totalItems = (i.items || []).filter(it => it.estado !== ESTADO_ITEM.NO_APLICA).length
              const pct = totalItems > 0 ? Math.round((buenos / totalItems) * 100) : 0
              // minHeight (no height) + wrap: bajo 960px la fila crece y se reparte
              // en varias lineas en vez de exprimir las celdas. Con height fijo el
              // nombre del cliente se comprimia a 0px de ancho.
              return (
                <div key={i.id} className="hd-row" style={{minHeight:44,flexWrap:'wrap'}} onClick={() => { setEditId(i.id); setVista('detalle') }}>
                  {/* La placa manda; el ID de la inspeccion baja a linea de apoyo */}
                  <div style={{width:112,minWidth:0}}>
                    <div className="hd-plate" style={{fontSize:12.5,color:i.placa ? 'var(--text)' : 'var(--text-empty)'}}>{i.placa || '—'}</div>
                    <div className="hd-sub hd-mono hd-clip">{i.id}</div>
                  </div>
                  {/* base de 140px: con `flex:1` (base 0) esta celda era la
                      primera en ceder y desaparecia entera en pantalla chica. */}
                  <div style={{flex:'1 1 140px',minWidth:0,paddingRight:10}}>
                    <div className={`hd-clip${i.cliente ? '' : ' hd-empty'}`} style={{fontSize:12.5,lineHeight:1.15,fontWeight:700,color:i.cliente ? 'var(--text)' : undefined}}>{i.cliente || '—'}</div>
                    <div className="hd-clip hd-sub">{i.vehiculo || '—'}</div>
                  </div>
                  <div style={{width:118,minWidth:0}}>
                    <div className={`hd-clip${i.tecnico ? '' : ' hd-empty'}`} style={{fontSize:11.5,color:i.tecnico ? 'var(--text-2)' : undefined}}>{i.tecnico || '—'}</div>
                  </div>
                  <div style={{width:132,display:'flex',alignItems:'center',gap:4}}>
                    {buenos > 0 && <span className="hd-chip hd-chip--ok" title="En buen estado">{buenos}</span>}
                    {sugeridos > 0 && <span className="hd-chip hd-chip--warn" title="Reparación sugerida">{sugeridos}</span>}
                    {urgentes > 0 && <span className="hd-chip hd-chip--bad" title="Atención urgente">{urgentes}</span>}
                    {buenos + sugeridos + urgentes === 0 && <span className="hd-empty" style={{fontSize:12}}>—</span>}
                  </div>
                  <div className="hd-n hd-strong" style={{width:58,color:pct >= 80 ? 'var(--ok-fg)' : pct >= 50 ? 'var(--warn-fg)' : 'var(--bad-fg)'}}>{pct}%</div>
                  <div className="hd-n" style={{width:78,fontSize:12,color:'var(--text-3)'}}>{fmtDate(i.fecha)}</div>
                  <div style={{width:122,display:'flex',gap:4,justifyContent:'flex-end'}}>
                    <Button variant="outline" size="sm" className="btn-icon" aria-label="Editar" title="Editar" onClick={e => { e.stopPropagation(); setEditId(i.id); setVista('editar') }}><IconEdit /></Button>
                    <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); vincularATrabajo(i) }} title="Vincular al trabajo">OT</Button>
                    <Button variant="ghost" size="sm" className="btn-icon" aria-label="Eliminar" title="Eliminar" onClick={e => { e.stopPropagation(); setConfirmCfg({ title: 'Eliminar inspección', lead: 'No se puede deshacer.', confirmLabel: 'Eliminar', tone: 'danger', onConfirm: () => { guardar(inspecciones.filter(x => x.id !== i.id)); notify('Inspeccion eliminada', 'info') } }); return }}><IconTrash /></Button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="hd-tbl__f">
            <span>{sorted.length} {sorted.length === 1 ? 'inspección' : 'inspecciones'}</span>
            <span className="hd-bar__sp" />
            <span>Con urgentes</span>
            <b style={{color:stats.conUrgentes ? 'var(--bad-fg)' : undefined}}>{stats.conUrgentes}</b>
          </div>
        </div>
      </div>
    </div>
    <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </>
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
  // Solo presentacion: que seccion esta desplegada. No se guarda ni viaja con
  // los datos. null = aun no se ha tocado nada -> se abre la primera; '' = todas
  // cerradas. Antes las 7 secciones estaban abiertas a la vez (~3.400px de scroll).
  const [abierta, setAbierta] = useState(null)

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
  // null = todavia no se ha tocado nada, se abre la primera seccion.
  const seccionAbierta = abierta === null ? (categorias[0] || '') : abierta

  // Ficha del trabajo que ya tiene esta placa. Solo se LEE, para poder decir de
  // que campos ya sabemos la respuesta ("DE LA FICHA"). No escribe nada: el
  // autorrelleno sigue siendo el mismo handler de antes.
  const fichaTrabajo = placa.length >= 3
    ? (trabajos || []).find(t => (t.placa || '').toUpperCase() === placa.toUpperCase())
    : null
  const fichaVehiculo = fichaTrabajo ? [fichaTrabajo.marca, fichaTrabajo.modelo, fichaTrabajo.ano].filter(Boolean).join(' ') : ''
  const fichaTecnico = fichaTrabajo ? (TECNICOS.find(tc => tc.id === parseInt(fichaTrabajo.tecnicoId))?.nombre || '') : ''
  const deLaFicha = (valor, valorFicha) => !!valor && !!valorFicha && String(valor).trim() === String(valorFicha).trim()

  // Conteos de cabecera. Todos salen de `items`, que ya existe.
  const nTotal = items.length
  const nMarcadosTot = items.filter(i => i.estado === ESTADO_ITEM.SUGERIDO || i.estado === ESTADO_ITEM.URGENTE).length
  const nBienTot = items.filter(i => i.estado === ESTADO_ITEM.BUENO).length
  const nFotosTot = items.reduce((a, i) => a + (i.fotos?.length || 0), 0)
  const pctBien = nTotal > 0 ? Math.round((nBienTot / nTotal) * 100) : 0

  const LBL = { fontSize:10, lineHeight:1, fontWeight:600, letterSpacing:'.5px', color:'var(--text-4)', marginBottom:5, display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }
  const CAMPO = { height:44, width:'100%', padding:'0 12px', background:'var(--bg-subtle)', border:'1px solid var(--border-input)', borderRadius:11, fontSize:13.5, color:'var(--text)', fontFamily:'inherit', outline:'none' }
  const chipFicha = <span style={{fontSize:8.5,fontWeight:700,letterSpacing:'.4px',color:'var(--ok-fg)',background:'var(--ok-bg)',padding:'3px 6px',borderRadius:'var(--radius-pill)'}}>DE LA FICHA</span>
  const TONO = {
    bueno: { bg:'var(--ok-bg)', fg:'var(--ok-fg)' },
    sugerido: { bg:'var(--warn-bg)', fg:'var(--warn-fg)' },
    urgente: { bg:'var(--bad-bg)', fg:'var(--bad-fg)' },
  }

  return (
    <div>
      {/* Barra de titulo del handoff. El progreso vive junto a Guardar porque es
          lo que decide si ya se puede guardar. */}
      <div className="hd-head">
        <div style={{display:'flex',alignItems:'center',gap:14,minWidth:0}}>
          <Button variant="outline" size="sm" icon={<IcBack />} onClick={onCancel}>Volver</Button>
          <div className="hd-head__t" style={{minWidth:0}}>
            <h1>{isEdit ? 'Editar inspección' : 'Nueva inspección digital'}</h1>
            <div className="hd-head__sub">
              {nTotal} ítems en {categorias.length} secciones
              {nFotosTot > 0 ? <> · {nFotosTot} {nFotosTot === 1 ? 'foto' : 'fotos'}</> : null}
            </div>
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-fig" style={{'--fg': nMarcadosTot ? 'var(--warn-fg)' : 'var(--text-4)'}}>
            <div className="hd-fig__l">REQUIEREN ATENCIÓN</div>
            <div className="hd-fig__v">{nMarcadosTot}</div>
            <div className="hd-fig__s">de {nTotal} ítems</div>
          </div>
          <div className="hd-head__div" />
          <div style={{display:'flex',alignItems:'center',gap:9,paddingBottom:5}}>
            <span style={{display:'block',width:140,height:8,borderRadius:'var(--radius-pill)',background:'var(--chip)',overflow:'hidden',flex:'none'}}>
              <span style={{display:'block',width:`${pctBien}%`,height:8,borderRadius:'var(--radius-pill)',background:'var(--accent)'}} />
            </span>
            <span style={{fontSize:12.5,fontWeight:600,color:'var(--text-2)',whiteSpace:'nowrap'}}>{nBienTot} de {nTotal} en bien</span>
          </div>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form="insp-form" variant="primary">{isEdit ? 'Actualizar' : 'Guardar inspección'}</Button>
        </div>
      </div>

      <form id="insp-form" onSubmit={handleSubmit}>
        {/* Datos del vehiculo: la placa es lo unico obligatorio y por eso va
            destacada en mono con borde de acento. Los campos que ya sabemos por
            la OT lo declaran con la marca verde en vez de parecer escritos a mano. */}
        <div className="hd-card" style={{margin:'14px 0 10px',padding:'14px 18px'}}>
          <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:11,flexWrap:'wrap'}}>
            <span style={{fontSize:13.5,fontWeight:700,color:'var(--text)'}}>Datos del vehículo</span>
            <span className="hd-sub">Solo la placa es obligatoria</span>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
            <div style={{flex:'0 0 auto',width:168}}>
              <div style={LBL}>PLACA <span style={{color:'var(--bad-fg)',fontWeight:700}}>*</span></div>
              <input value={placa} required placeholder="ABC123"
                style={{...CAMPO, background:'var(--bg-raised)', border:'1.5px solid var(--accent)', fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize:16, fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase'}}
                onChange={e => { setPlaca(e.target.value); if (e.target.value.length >= 6) autoFill(e.target.value) }}/>
            </div>
            <div style={{flex:'1 1 180px',minWidth:0}}>
              <div style={LBL}>CLIENTE {deLaFicha(cliente, fichaTrabajo?.cliente) && chipFicha}</div>
              <input value={cliente} placeholder="Nombre" style={CAMPO} onChange={e => setCliente(e.target.value)}/>
            </div>
            <div style={{flex:'1 1 140px',minWidth:0}}>
              <div style={LBL}>CÉDULA {deLaFicha(cedula, fichaTrabajo?.cedula) && chipFicha}</div>
              <input value={cedula} placeholder="Cédula cliente" style={CAMPO} onChange={e => setCedula(e.target.value)}/>
            </div>
            <div style={{flex:'1 1 180px',minWidth:0}}>
              <div style={LBL}>VEHÍCULO {deLaFicha(vehiculo, fichaVehiculo) && chipFicha}</div>
              <input value={vehiculo} placeholder="Marca Modelo Año" style={CAMPO} onChange={e => setVehiculo(e.target.value)}/>
            </div>
            <div style={{flex:'1 1 170px',minWidth:0}}>
              <div style={LBL}>TÉCNICO {deLaFicha(tecnico, fichaTecnico) && chipFicha}</div>
              <select value={tecnico} style={{...CAMPO, cursor:'pointer'}} onChange={e => setTecnico(e.target.value)}>
                <option value="">Seleccionar...</option>
                {TECNICOS.filter(t => t.activo !== false || t.nombre === tecnico).map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
              </select>
            </div>
            <div style={{flex:'1 1 130px',minWidth:0}}>
              <div style={LBL}>KILOMETRAJE</div>
              <input type="number" value={km} placeholder="45000" style={{...CAMPO, fontVariantNumeric:'tabular-nums'}} onChange={e => setKm(e.target.value)}/>
            </div>
          </div>
        </div>

        {/* Una seccion abierta a la vez. Las cerradas conservan SIEMPRE nombre y
            contador de items, y dicen que paso adentro: todo bien / N requieren
            atencion / N urgentes / N fotos. Nada se pierde, solo se colapsa. */}
        {categorias.map(cat => {
          const its = items.filter(i => i.categoria === cat)
          const nUrg = its.filter(i => i.estado === ESTADO_ITEM.URGENTE).length
          const nSug = its.filter(i => i.estado === ESTADO_ITEM.SUGERIDO).length
          const nBien = its.filter(i => i.estado === ESTADO_ITEM.BUENO).length
          const nMarc = nUrg + nSug
          const nFot = its.reduce((a, i) => a + (i.fotos?.length || 0), 0)
          const abiertaEsta = seccionAbierta === cat

          if (!abiertaEsta) {
            return (
              <button key={cat} type="button" onClick={() => setAbierta(cat)}
                style={{width:'100%',minHeight:44,display:'flex',alignItems:'center',gap:11,padding:'6px 16px',marginBottom:7,
                  background:'var(--bg-raised)',border:'1px solid var(--border)',borderRadius:13,cursor:'pointer',
                  textAlign:'left',fontFamily:'inherit',flexWrap:'wrap'}}>
                <span style={{color:'var(--text-5)',display:'flex',flex:'none'}}><IcChevronR /></span>
                <span style={{fontSize:13.5,fontWeight:700,color:'var(--text)'}}>{cat}</span>
                <span className="hd-chip hd-chip--mute">{its.length} ÍTEMS</span>
                <span style={{flex:1}} />
                {nMarc > 0 ? (
                  <span className="hd-chip hd-chip--warn">{nMarc} {nMarc === 1 ? 'REQUIERE' : 'REQUIEREN'} ATENCIÓN</span>
                ) : nBien === its.length ? (
                  <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,color:'var(--ok-fg)',whiteSpace:'nowrap'}}><IcTick /> todo bien</span>
                ) : (
                  <span className="hd-sub">sin marcar</span>
                )}
                {nUrg > 0 && <span className="hd-chip hd-chip--bad">{nUrg} {nUrg === 1 ? 'URGENTE' : 'URGENTES'}</span>}
                {nFot > 0 && (
                  <span style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'var(--text-3)',whiteSpace:'nowrap'}}><IcCam w={14} />{nFot}</span>
                )}
              </button>
            )
          }

          return (
            <div key={cat} className="hd-card" style={{marginBottom:7,border:'1.5px solid var(--accent)'}}>
              <button type="button" onClick={() => setAbierta('')}
                style={{display:'flex',alignItems:'center',gap:11,minHeight:46,padding:'6px 16px',width:'100%',
                  background:'var(--accent-soft)',border:'none',borderBottom:'1px solid var(--border)',
                  cursor:'pointer',textAlign:'left',fontFamily:'inherit',flexWrap:'wrap'}}>
                <span style={{color:'var(--accent)',display:'flex',flex:'none'}}><IcChevronD /></span>
                <span style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{cat}</span>
                <span className="hd-chip" style={{background:'var(--accent-tint)',color:'var(--accent)'}}>{its.length} ÍTEMS</span>
                <span style={{flex:1}} />
                <span style={{fontSize:12,color:'var(--text-3)',whiteSpace:'nowrap'}}>
                  {nMarc} {nMarc === 1 ? 'marcado' : 'marcados'} · {nBien} en bien{nUrg > 0 ? ` · ${nUrg} ${nUrg === 1 ? 'urgente' : 'urgentes'}` : ''}{nFot > 0 ? ` · ${nFot} ${nFot === 1 ? 'foto' : 'fotos'}` : ''}
                </span>
              </button>
              {/* min(340px,100%): por debajo de 340px de ancho la columna fija
                  desbordaba y `.hd-card{overflow:hidden}` recortaba el boton de foto. */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(340px,100%),1fr))'}}>
                {its.map(item => {
                  const nf = item.fotos?.length || 0
                  const marcado = item.estado !== ESTADO_ITEM.BUENO
                  return (
                    <div key={item.id} style={{borderBottom:'1px solid var(--row-line)',padding:'4px 14px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,minHeight:46,flexWrap:'wrap'}}>
                        <span style={{flex:'1 1 150px',minWidth:0,fontSize:12.5,lineHeight:1.25,fontWeight:marcado ? 600 : 400,color:marcado ? 'var(--text)' : 'var(--text-2)'}}>{item.nombre}</span>
                        <div style={{display:'flex',alignItems:'center',gap:3,padding:3,background:'var(--chip)',borderRadius:'var(--radius-pill)',flex:'none'}}>
                          {Object.entries(ESTADO_COLORS).filter(([k]) => k !== 'no_aplica').map(([key, val]) => {
                            const active = item.estado === key
                            const t = TONO[key]
                            return (
                              <button key={key} type="button" title={val.label} aria-label={val.label} aria-pressed={active}
                                style={{width:46,height:38,display:'grid',placeItems:'center',borderRadius:'var(--radius-pill)',border:'none',cursor:'pointer',
                                  background:active ? t.bg : 'transparent', color:active ? t.fg : 'var(--text-5)', fontSize:15, fontWeight:800, fontFamily:'inherit'}}
                                onClick={() => updateItem(item.id, 'estado', key)}>
                                {key === 'bueno' ? <IcTick w={16} /> : key === 'urgente' ? <IcCross w={14} /> : '!'}
                              </button>
                            )
                          })}
                        </div>
                        <label title={nf ? `${nf} foto(s) · agregar otra` : 'Agregar foto'}
                          aria-label={nf ? `${item.nombre}: ${nf} foto(s), agregar otra` : `Agregar foto a ${item.nombre}`}
                          style={{position:'relative',flex:'none',width:44,height:44,display:'grid',placeItems:'center',borderRadius:11,cursor:'pointer',
                            background:nf ? 'var(--accent-soft)' : 'var(--chip)', color:nf ? 'var(--accent)' : 'var(--text-3)'}}>
                          <IcCam w={17} />
                          {nf > 0 && (
                            <span style={{position:'absolute',top:-4,right:-4,minWidth:17,height:17,padding:'0 4px',borderRadius:'var(--radius-pill)',
                              background:'var(--accent)',color:'#fff',fontSize:9.5,fontWeight:700,lineHeight:'17px',textAlign:'center'}}>{nf}</span>
                          )}
                          <input type="file" accept="image/*" multiple hidden onChange={e => addFoto(item.id, e.target.files)}/>
                        </label>
                      </div>
                      {item.comentario && (
                        <div style={{display:'flex',gap:8,margin:'0 0 8px',padding:'9px 11px',background:'var(--warn-bg-2)',border:'1px solid var(--warn-bg)',borderRadius:10}}>
                          <span style={{flex:'none',fontSize:9,fontWeight:700,letterSpacing:'.4px',color:'var(--warn-fg-2)',paddingTop:2}}>NOTA</span>
                          <span style={{fontSize:12.5,lineHeight:1.4,color:'var(--text-2)'}}>{item.comentario}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
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
            <Button variant="outline" size="sm" onClick={onVolver}><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Volver</Button>
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
