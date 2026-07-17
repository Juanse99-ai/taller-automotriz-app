import { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { InspeccionDetalle } from './Inspecciones'
import { ESTADOS, TECNICOS, TALLER } from '../utils/constants'
import { fmtDate, fmt } from '../utils/helpers'
import { drawHeader, drawSectionHeader, drawDataBlock, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS, SEVERITY_HEAD } from '../utils/pdfTheme'

// Capitaliza el nombre del cliente que viene en MAYÚSCULAS ("TRANSPORTES
// MAJAGUA S.A.S." → "Transportes Majagua S.A.S."). Se muestra COMPLETO, no solo
// la primera palabra. Las siglas jurídicas (con punto, o SAS/SA/LTDA/CIA/EU) se
// dejan en mayúscula; el resto va con inicial mayúscula (respeta ñ/tildes).
const tituloCliente = (s) => String(s || '').trim().split(/\s+/).map(w => {
  if (/\./.test(w) || /^(sas|sa|ltda|cia|eu)$/i.test(w)) return w.toUpperCase()
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}).join(' ')

const ESTADO_TRABAJO_DISPLAY = {
  [ESTADOS.PENDIENTE]: { label: 'Recibido', color: '#64748b', icon: '1', pct: 15 },
  [ESTADOS.EN_DIAGNOSTICO]: { label: 'En Diagnostico', color: '#2563eb', icon: '2', pct: 30 },
  [ESTADOS.ESPERANDO_REPUESTOS]: { label: 'Esperando Repuestos', color: '#d97706', icon: '3', pct: 45 },
  [ESTADOS.EN_PROGRESO]: { label: 'En Reparacion', color: '#2563eb', icon: '4', pct: 60 },
  [ESTADOS.EN_PRUEBA]: { label: 'En Prueba', color: '#7c3aed', icon: '5', pct: 80 },
  [ESTADOS.COMPLETADO]: { label: 'Listo para Entrega', color: '#16a34a', icon: '6', pct: 100 },
  [ESTADOS.PROGRAMADO]: { label: 'Programado', color: '#64748b', icon: '—', pct: 10 },
  [ESTADOS.CANCELADO]: { label: 'Cancelado', color: '#dc2626', icon: '✕', pct: 0 },
}

// Columnas que el portal SÍ necesita. Se piden explícitamente (en vez de SELECT *)
// para NO exponer datos sensibles del cliente (telefono_cliente, email_cliente,
// firma_cliente) a cualquiera que conozca/adivine una cédula. 'inspeccion' se omite
// a propósito: no es una columna real (pedirla haría fallar la consulta).
const SELECT_PORTAL = [
  'id', 'fecha', 'created_at', 'cedula_cliente', 'cliente', 'placa', 'marca', 'modelo',
  'ano', 'kilometraje', 'tecnico_id', 'estado', 'observaciones', 'items', 'total',
  'ot_codigo', 'tipo_aceite', 'proximo_km', 'proxima_visita', 'notas_proximo_mant', 'evidencias',
].join(',')

// Consulta directa a Supabase via proxy (funciona desde cualquier dispositivo)
async function buscarTrabajosPorCedula(cedula) {
  try {
    const url = `/api/supabase?table=trabajos&cedula_cliente=eq.${encodeURIComponent(cedula)}&select=${SELECT_PORTAL}&order=fecha.desc`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Error consultando')
    const rows = await res.json()
    return rows.map(r => ({
      id: r.id,
      fecha: r.fecha || r.created_at,
      cedula: r.cedula_cliente,
      cliente: r.cliente,
      placa: r.placa,
      marca: r.marca,
      modelo: r.modelo,
      ano: r.ano,
      kilometraje: r.kilometraje,
      tecnicoId: r.tecnico_id,
      estado: r.estado || 'Pendiente',
      observaciones: r.observaciones,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
      total: parseFloat(r.total) || 0,
      otCodigo: r.ot_codigo || '',
      // Próximo mantenimiento: se le recuerda al cliente en el detalle del servicio
      tipoAceite: r.tipo_aceite || '',
      proximoKm: r.proximo_km || '',
      proximaVisita: r.proxima_visita || '',
      notasProximoMant: r.notas_proximo_mant || '',
      inspeccion: typeof r.inspeccion === 'string' ? JSON.parse(r.inspeccion) : (r.inspeccion || null),
      evidencias: (() => {
        try { const v = r.evidencias; return typeof v === 'string' ? (JSON.parse(v) || []) : (Array.isArray(v) ? v : []) } catch { return [] }
      })(),
    }))
  } catch (e) {
    console.warn('Portal: error buscando trabajos', e.message)
    return []
  }
}

export default function PortalCliente() {
  // Leer ?c=<cedula> de la URL al montar (link prellenado para el cliente)
  const urlParams = new URLSearchParams(window.location.search)
  const cedulaInicial = urlParams.get('c') || ''

  const [cedula, setCedula] = useState(cedulaInicial)
  const [autenticado, setAutenticado] = useState(false)
  const [datos, setDatos] = useState(null)
  const [vistaInspeccion, setVistaInspeccion] = useState(null)
  const [vistaServicio, setVistaServicio] = useState(null) // detalle (mini-factura) de un servicio del historial
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [galeria, setGaleria] = useState(null) // array de fotos para el visor
  const [galIdx, setGalIdx] = useState(0)

  const ejecutarBusqueda = async (cedulaInput) => {
    const cedulaLimpia = (cedulaInput || '').trim().replace(/[.\-\s]/g, '')
    if (!cedulaLimpia) return

    setCargando(true)
    setError('')

    const misTrab = await buscarTrabajosPorCedula(cedulaLimpia)

    // Extraer inspecciones embebidas en trabajos
    const misInsp = misTrab
      .filter(t => t.inspeccion && t.inspeccion.items)
      .map(t => ({
        ...t.inspeccion,
        placa: t.inspeccion.placa || t.placa,
        cliente: t.inspeccion.cliente || t.cliente,
        vehiculo: t.inspeccion.vehiculo || [t.marca, t.modelo, t.ano].filter(Boolean).join(' '),
        fecha: t.inspeccion.fecha || t.fecha,
      }))

    setCargando(false)

    if (misTrab.length === 0) {
      setError('No se encontraron registros para este documento. Verifica el numero e intenta de nuevo.')
      setDatos(null)
      setAutenticado(false)
      return
    }

    setDatos({ trabajos: misTrab, inspecciones: misInsp, cedula: cedulaLimpia })
    setAutenticado(true)
  }

  // Si vino con ?c= en URL, autobuscar al montar
  useEffect(() => {
    if (cedulaInicial) {
      ejecutarBusqueda(cedulaInicial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buscar = (e) => {
    e.preventDefault()
    ejecutarBusqueda(cedula)
  }

  const salir = () => {
    setAutenticado(false)
    setDatos(null)
    setCedula('')
    setError('')
    // Limpiar ?c= de la URL para que no quede expuesta al cerrar sesion
    if (window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }

  const descargarPDF = (insp) => {
    const doc = new jsPDF()
    const { MARGIN, CONTENT_W } = PDF_LAYOUT

    const items = insp.items || []
    const urgentes = items.filter(i => i.estado === 'urgente')
    const sugeridos = items.filter(i => i.estado === 'sugerido')
    const buenos = items.filter(i => i.estado === 'bueno')
    const total = items.filter(i => i.estado !== 'no_aplica').length
    const pct = total > 0 ? Math.round((buenos.length / total) * 100) : 0

    // Estado general → badge
    let estado = 'good', estadoLbl = 'BUEN ESTADO'
    if (urgentes.length > 0) { estado = 'red'; estadoLbl = 'REQUIERE ATENCIÓN' }
    else if (sugeridos.length > 0) { estado = 'amber'; estadoLbl = 'CON OBSERVACIONES' }
    else { estado = 'green'; estadoLbl = 'EN BUEN ESTADO' }

    drawHeader(doc, {
      docType: 'INSPECCIÓN VEHICULAR',
      docNumber: (insp.placa || '').toUpperCase(),
      badge: { label: estadoLbl, color: estado === 'red' ? 'red' : estado === 'amber' ? 'amber' : 'green' },
      dateRows: [{ lbl: 'FECHA', val: fmtDate(insp.fecha) }],
    })

    let y = 47
    y = drawSectionHeader(doc, 'Datos de la inspección', y)
    y = drawDataBlock(doc, [
      { label: 'Cliente', value: insp.cliente, bold: true },
      { label: 'Vehículo', value: insp.vehiculo },
      { label: 'Placa', value: (insp.placa || '').toUpperCase(), bold: true },
      { label: 'Técnico', value: insp.tecnico },
    ], y)
    y += 4

    // Card de "Estado general" — barra de salud visual
    doc.setDrawColor(...PDF_COLORS.SLATE_300)
    doc.setLineWidth(0.2)
    doc.rect(MARGIN, y, CONTENT_W, 22)
    doc.setFontSize(7)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(...PDF_COLORS.SLATE_500)
    doc.text('ESTADO GENERAL', MARGIN + 4, y + 5)
    doc.setFontSize(24)
    doc.setTextColor(pct >= 80 ? PDF_COLORS.GREEN_600[0] : pct >= 50 ? PDF_COLORS.AMBER_500[0] : PDF_COLORS.RED_600[0],
                     pct >= 80 ? PDF_COLORS.GREEN_600[1] : pct >= 50 ? PDF_COLORS.AMBER_500[1] : PDF_COLORS.RED_600[1],
                     pct >= 80 ? PDF_COLORS.GREEN_600[2] : pct >= 50 ? PDF_COLORS.AMBER_500[2] : PDF_COLORS.RED_600[2])
    doc.text(`${pct}%`, MARGIN + 4, y + 17)

    // Barra de progreso
    const barX = MARGIN + 38
    const barW = CONTENT_W - 42 - 60
    const barY = y + 10
    doc.setFillColor(...PDF_COLORS.SLATE_100)
    doc.roundedRect(barX, barY, barW, 5, 1, 1, 'F')
    doc.setFillColor(...(pct >= 80 ? PDF_COLORS.GREEN_600 : pct >= 50 ? PDF_COLORS.AMBER_500 : PDF_COLORS.RED_600))
    doc.roundedRect(barX, barY, barW * (pct / 100), 5, 1, 1, 'F')

    // Stats al lado derecho
    const statsX = MARGIN + CONTENT_W - 56
    doc.setFontSize(7)
    doc.setTextColor(...PDF_COLORS.SLATE_500)
    doc.setFont(undefined, 'bold')
    doc.text('URGENTES', statsX, y + 5)
    doc.text('SUGERIDOS', statsX, y + 11)
    doc.text('BUENOS', statsX, y + 17)
    doc.setFont(undefined, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...PDF_COLORS.RED_600);   doc.text(String(urgentes.length), statsX + 52, y + 5, { align: 'right' })
    doc.setTextColor(...PDF_COLORS.AMBER_500); doc.text(String(sugeridos.length), statsX + 52, y + 11, { align: 'right' })
    doc.setTextColor(...PDF_COLORS.GREEN_600); doc.text(String(buenos.length), statsX + 52, y + 17, { align: 'right' })

    y += 28

    // Tablas por categoría
    if (urgentes.length > 0) {
      y = drawSectionHeader(doc, 'Atención urgente · reparar pronto', y)
      autoTable(doc, {
        startY: y,
        head: [['ITEM', 'OBSERVACIONES']],
        body: urgentes.map(i => [i.nombre, i.comentario || '—']),
        ...tableStylesItems,
        headStyles: { ...SEVERITY_HEAD.urgent, fontSize: 7.2, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 'auto' } },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    if (sugeridos.length > 0) {
      y = drawSectionHeader(doc, 'Reparación sugerida · próximo servicio', y)
      autoTable(doc, {
        startY: y,
        head: [['ITEM', 'OBSERVACIONES']],
        body: sugeridos.map(i => [i.nombre, i.comentario || '—']),
        ...tableStylesItems,
        headStyles: { ...SEVERITY_HEAD.warn, fontSize: 7.2, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 'auto' } },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    if (buenos.length > 0) {
      y = drawSectionHeader(doc, 'En buen estado', y)
      autoTable(doc, {
        startY: y,
        head: [['ITEM', 'OBSERVACIONES']],
        body: buenos.map(i => [i.nombre, i.comentario || '—']),
        ...tableStylesItems,
        headStyles: { ...SEVERITY_HEAD.good, fontSize: 7.2, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 'auto' } },
        margin: { left: MARGIN, right: MARGIN },
      })
    }

    drawFooter(doc, { page: 1, total: 1 })
    doc.save(`inspeccion_${insp.placa}_${insp.fecha?.slice(0, 10) || 'reporte'}.pdf`)
  }

  // Vista de detalle de inspeccion
  if (vistaInspeccion) {
    return (
      <div style={{maxWidth:780,margin:'0 auto',display:'flex',flexDirection:'column',gap:20,padding:'20px 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--text-3)'}}>
          <img src="/logo.png" alt="MDA" style={{width:28,height:28,objectFit:'contain'}}/>
          Multidiagnosticos AS
        </div>
        <InspeccionDetalle inspeccion={vistaInspeccion} onVolver={() => setVistaInspeccion(null)} />
        <div style={{textAlign:'center',marginTop:8}}>
          <button className="btn btn-primary" onClick={() => descargarPDF(vistaInspeccion)}>
            Descargar Reporte PDF
          </button>
        </div>
      </div>
    )
  }

  // Vista login por cedula
  if (!autenticado) {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:20}}>
        <div style={{width:'100%',maxWidth:420}}>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'28px 32px 22px',background:'var(--navy-900)',color:'#fff',textAlign:'center'}}>
              <img src="/logo.png" alt="MDA" style={{width:50,height:50,objectFit:'contain',borderRadius:12,background:'#fff',padding:4,marginBottom:12}}/>
              <h1 style={{fontSize:20,fontWeight:800,margin:'0 0 4px',letterSpacing:'.02em'}}>Multidiagnosticos AS</h1>
              <p style={{fontSize:13,opacity:.65,margin:0}}>Seguimiento en linea de su vehiculo</p>
            </div>
            <div style={{padding:'24px 32px 28px'}}>
              <form onSubmit={buscar} style={{display:'flex',flexDirection:'column',gap:16}}>
                <div className="field">
                  <label>Número de cédula o NIT</label>
                  <input
                    className="input"
                    value={cedula}
                    onChange={e => setCedula(e.target.value)}
                    placeholder="Ej: 1234567890"
                    inputMode="numeric"
                    autoComplete="off"
                    style={{fontSize:16,padding:'14px 16px',textAlign:'center'}}
                    autoFocus
                  />
                </div>
                {error && (
                  <div style={{background:'var(--red-50,#fef2f2)',color:'var(--red-700,#991b1b)',padding:'10px 14px',borderRadius:8,fontSize:13}}>
                    {error}
                  </div>
                )}
                <button type="submit" className="btn btn-primary" style={{width:'100%',padding:'14px',fontSize:15}} disabled={cargando}>
                  {cargando ? 'Consultando...' : 'Consultar Estado'}
                </button>
              </form>
              <p style={{fontSize:12,color:'var(--text-4)',textAlign:'center',marginTop:20}}>
                Su numero de documento es la clave de acceso para ver el estado de sus vehiculos.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Vista principal del cliente
  const trabajoActivo = datos.trabajos.find(t =>
    t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO
  )

  const tecNombre = (id) => TECNICOS.find(t => t.id === parseInt(id))?.nombre || ''

  // Timeline steps for active work
  const pasos = [
    {lbl:'Recibido',pct:15},{lbl:'Diagnostico',pct:30},{lbl:'Repuestos',pct:45},
    {lbl:'Reparacion',pct:60},{lbl:'Prueba',pct:80},{lbl:'Entrega',pct:100},
  ]

  return (
    <div className="portal-main">
      {/* Hero card */}
      <div className="card portal-full" style={{padding:0,overflow:'hidden'}}>
        <div style={{padding:'22px 26px',background:'var(--navy-900)',color:'#fff',position:'relative'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',opacity:.7,marginBottom:8}}>
              <img src="/logo.png" alt="MDA" style={{width:20,height:20,objectFit:'contain',borderRadius:4}}/> Multidiagnosticos AS
            </div>
            <button className="btn btn-ghost btn-sm" style={{color:'rgba(255,255,255,.7)',border:'1px solid rgba(255,255,255,.15)'}}
              onClick={salir}>
              Salir
            </button>
          </div>
          {trabajoActivo ? (
            <>
              <div style={{fontSize:13,opacity:.75,marginBottom:2}}>Hola, {tituloCliente(datos.trabajos[0]?.cliente)}</div>
              <h2 style={{fontSize:22,fontWeight:700,letterSpacing:'-.01em',marginBottom:4}}>
                {[trabajoActivo.marca,trabajoActivo.modelo].filter(Boolean).join(' ') || 'Su vehiculo'}
              </h2>
              <div style={{fontSize:13,opacity:.75}}>
                Placa <span className="mono" style={{fontWeight:700}}>{trabajoActivo.placa}</span>
                {trabajoActivo.otCodigo && <> · Orden <span className="mono">{trabajoActivo.otCodigo}</span></>}
              </div>
            </>
          ) : (
            <>
              <div style={{fontSize:13,opacity:.75,marginBottom:2}}>Hola, {tituloCliente(datos.trabajos[0]?.cliente)}</div>
              <h2 style={{fontSize:22,fontWeight:700,letterSpacing:'-.01em'}}>Historial de servicios</h2>
            </>
          )}
        </div>
        {trabajoActivo && (
          <div style={{padding:'20px 26px',background:'var(--bg-raised)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:8}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:4}}>Estado actual</div>
                <div style={{fontSize:18,fontWeight:700,color:ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.color||'var(--text)'}}>
                  {ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.label || trabajoActivo.estado}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:4}}>Ingreso</div>
                <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{fmtDate(trabajoActivo.fecha)}</div>
              </div>
            </div>
            <div style={{height:8,background:'var(--bg-subtle)',borderRadius:99,overflow:'hidden',marginTop:14}}>
              <div style={{width:`${ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct||0}%`,height:'100%',background:'var(--amber-500)',borderRadius:99,transition:'width .4s ease-out'}}/>
            </div>
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:6,fontWeight:600}}>{ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct||0}% completado</div>
          </div>
        )}
      </div>

      {/* Columna principal (avance) + columna lateral (técnico, fotos, insp) */}
      <div className="portal-col">
      {/* Timeline de avance primero (lo que más le importa al cliente) */}
      {trabajoActivo && (
        <div className="card">
          <div className="card__h"><h3>Avance del trabajo</h3></div>
          <div className="card__b">
            <div style={{position:'relative',paddingLeft:32}}>
              <div style={{position:'absolute',left:11,top:8,bottom:8,width:2,background:'var(--border)'}}/>
              {pasos.map((p,k)=>{
                const currentPct = ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct || 0
                const done = currentPct >= p.pct
                const active = currentPct >= p.pct - 15 && currentPct < p.pct
                return (
                  <div key={k} style={{position:'relative',paddingBottom:k<pasos.length-1?20:0}}>
                    <div style={{position:'absolute',left:-26,top:2,width:24,height:24,borderRadius:'50%',
                      background:done?'var(--green-500)':active?'var(--amber-500)':'var(--bg-raised)',
                      border:!done&&!active?'2px solid var(--border)':'none',
                      display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:12}}>
                      {done?<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>:active?<span style={{width:8,height:8,borderRadius:'50%',background:'#fff'}}/>:''}
                    </div>
                    <div style={{fontWeight:active?700:600,fontSize:14,color:!done&&!active?'var(--text-3)':'var(--text)'}}>
                      {p.lbl}
                      {active && <span className="badge badge-w" style={{marginLeft:8}}>En curso</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Observaciones */}
      {trabajoActivo?.observaciones && (
        <div className="card" style={{padding:'16px 20px',background:'var(--bg-subtle)',border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6}}>Observaciones</div>
          <div style={{fontSize:13.5,color:'var(--text)',lineHeight:1.55}}>{trabajoActivo.observaciones}</div>
        </div>
      )}
      </div>

      <div className="portal-col">
      {/* Tecnico asignado */}
      {trabajoActivo && tecNombre(trabajoActivo.tecnicoId) && (
        <div className="card">
          <div className="card__h"><h3>Tecnico asignado</h3></div>
          <div className="card__b" style={{display:'flex',gap:14,alignItems:'center'}}>
            <div style={{width:54,height:54,borderRadius:'50%',background:'var(--amber-500)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--navy-900)',fontWeight:800,fontSize:18,flexShrink:0}}>
              {tecNombre(trabajoActivo.tecnicoId).split(' ').map(x=>x[0]).slice(0,2).join('')}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15}}>{tecNombre(trabajoActivo.tecnicoId)}</div>
              <div style={{fontSize:12.5,color:'var(--text-3)'}}>Multidiagnosticos AS</div>
            </div>
          </div>
        </div>
      )}

      {/* Fotos del trabajo activo */}
      {trabajoActivo?.evidencias?.length > 0 && (
        <div className="card">
          <div className="card__h"><h3>Fotos de su servicio</h3><span className="count">{trabajoActivo.evidencias.length}</span></div>
          <div className="card__b" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(92px,1fr))',gap:8}}>
            {trabajoActivo.evidencias.map((f,i)=>(
              <button key={f.id||i} onClick={()=>{setGaleria(trabajoActivo.evidencias);setGalIdx(i)}}
                style={{padding:0,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',cursor:'pointer',aspectRatio:'1',background:'var(--bg-subtle)'}}>
                <img src={f.dataUrl} alt={f.nota||'Evidencia'} loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inspecciones */}
      {datos.inspecciones.length > 0 && (
        <div className="card">
          <div className="card__h"><h3>Inspecciones de su vehiculo</h3><span className="count">{datos.inspecciones.length}</span></div>
          <div className="card__b" style={{display:'flex',flexDirection:'column',gap:0}}>
            {datos.inspecciones.map((insp, idx) => {
              const items = insp.items || []
              const urgentes = items.filter(i => i.estado === 'urgente').length
              const sugeridos = items.filter(i => i.estado === 'sugerido').length
              const buenos = items.filter(i => i.estado === 'bueno').length
              const total = items.filter(i => i.estado !== 'no_aplica').length
              const pct = total > 0 ? Math.round((buenos / total) * 100) : 0

              return (
                <div key={insp.id || idx} style={{padding:'14px 0',borderBottom:idx<datos.inspecciones.length-1?'1px solid var(--border)':'none'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{insp.placa} <span style={{color:'var(--text-3)',fontWeight:400,fontSize:13}}>— {insp.vehiculo || ''}</span></div>
                      <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:2}}>{fmtDate(insp.fecha)}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{display:'flex',gap:4}}>
                        {buenos > 0 && <span className="badge badge-s">{buenos}</span>}
                        {sugeridos > 0 && <span className="badge badge-w">{sugeridos}</span>}
                        {urgentes > 0 && <span className="badge badge-d">{urgentes}</span>}
                      </div>
                      <span style={{fontWeight:700,fontSize:13,color:pct>=80?'var(--green-600)':pct>=50?'var(--amber-600)':'var(--red-600)'}}>{pct}%</span>
                      <button className="btn btn-outline btn-sm" onClick={() => setVistaInspeccion(insp)}>Ver</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => descargarPDF(insp)}>PDF</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      </div>{/* cierra columna lateral */}

      {/* Historial de trabajos — a lo ancho */}
      {datos.trabajos.length > 0 && (
        <div className="card portal-full">
          <div className="card__h"><h3>Historial de servicios</h3><span className="count">{datos.trabajos.length}</span></div>
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead>
                <tr><th>Fecha</th><th>Placa</th><th>Vehiculo</th><th>Estado</th><th>Fotos</th><th /></tr>
              </thead>
              <tbody>
                {datos.trabajos.map(t => (
                  <tr key={t.id}>
                    <td data-label="Fecha" style={{color:'var(--text-3)',fontSize:13}}>{fmtDate(t.fecha)}</td>
                    <td className="c-name mono" style={{fontWeight:700}}>{t.placa}</td>
                    <td data-label="Vehiculo" style={{color:'var(--text-3)',fontSize:13}}>{[t.marca,t.modelo].filter(Boolean).join(' ')||'—'}</td>
                    <td data-label="Estado">
                      <span className="badge" style={{
                        background:(ESTADO_TRABAJO_DISPLAY[t.estado]?.color||'#64748b')+'20',
                        color:ESTADO_TRABAJO_DISPLAY[t.estado]?.color||'#64748b'
                      }}>
                        {ESTADO_TRABAJO_DISPLAY[t.estado]?.label || t.estado}
                      </span>
                    </td>
                    <td data-label="Fotos">
                      {t.evidencias?.length > 0 ? (
                        <button className="btn btn-ghost btn-sm" onClick={()=>{setGaleria(t.evidencias);setGalIdx(0)}} style={{gap:5}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          {t.evidencias.length}
                        </button>
                      ) : <span style={{color:'var(--text-4)'}}>—</span>}
                    </td>
                    <td className="td-actions" style={{textAlign:'right'}}>
                      <button className="btn btn-outline btn-sm" onClick={()=>setVistaServicio(t)}>Ver detalle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!trabajoActivo && datos.trabajos.length === 0 && (
        <div className="empty portal-full">
          <p>No hay trabajos activos en este momento.</p>
        </div>
      )}

      <div className="portal-full" style={{textAlign:'center',fontSize:12,color:'var(--text-4)',padding:'8px 0 18px'}}>
        Multidiagnosticos AS · Sabanalarga, Atlantico
      </div>

      {/* Detalle de un servicio del historial (mini-factura del cliente) */}
      {vistaServicio && (() => {
        const t = vistaServicio
        const items = Array.isArray(t.items) ? t.items : []
        const linea = (i) => Math.round((parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1))
        const total = t.total || items.reduce((s, i) => s + linea(i), 0)
        const est = ESTADO_TRABAJO_DISPLAY[t.estado] || {}
        const tieneProx = t.tipoAceite || t.proximoKm || t.proximaVisita || t.notasProximoMant
        return (
          <div onClick={() => setVistaServicio(null)} role="presentation"
            style={{position:'fixed',inset:0,zIndex:900,background:'rgba(16,23,37,.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
            <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Detalle del servicio"
              style={{width:'min(560px,100%)',maxHeight:'88vh',overflowY:'auto',background:'var(--bg-raised)',borderRadius:16,boxShadow:'0 24px 60px -12px rgba(16,23,37,.35)'}}>

              <div style={{padding:'18px 20px 14px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12.5,color:'var(--text-3)'}}>{fmtDate(t.fecha)}{t.otCodigo ? ` · ${t.otCodigo}` : ''}</div>
                  <div className="mono" style={{fontSize:19,fontWeight:800,letterSpacing:'-.01em',marginTop:2}}>{t.placa}</div>
                  <div style={{fontSize:13,color:'var(--text-3)'}}>{[t.marca,t.modelo,t.ano].filter(Boolean).join(' ') || '—'}</div>
                </div>
                <span className="badge" style={{background:(est.color||'#64748b')+'20',color:est.color||'#64748b',flexShrink:0}}>{est.label || t.estado}</span>
              </div>

              <div style={{padding:'14px 20px 6px'}}>
                <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Trabajos realizados</div>
                {items.length === 0 ? (
                  <div style={{fontSize:13.5,color:'var(--text-3)',paddingBottom:8}}>Sin detalle registrado para este servicio.</div>
                ) : (
                  <div>
                    {items.map((i, k) => (
                      <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:600,lineHeight:1.35}}>{i.nombre || i.codigo || 'Ítem'}</div>
                          <div style={{fontSize:12,color:'var(--text-3)',marginTop:1}}>
                            {i.esServicio ? 'Mano de obra' : 'Repuesto'}
                            {(parseInt(i.cantidad) || 1) > 1 && <> · {parseInt(i.cantidad)} × {fmt(Math.round(parseFloat(i.precio) || 0))}</>}
                          </div>
                        </div>
                        <div className="mono" style={{fontSize:14,fontWeight:700,whiteSpace:'nowrap'}}>{fmt(linea(i))}</div>
                      </div>
                    ))}
                    <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',fontSize:15.5,fontWeight:800}}>
                      <span>Total</span>
                      <span className="mono" style={{color:'var(--green-600)'}}>{fmt(total)}</span>
                    </div>
                  </div>
                )}
              </div>

              {t.tecnicoId && tecNombre(t.tecnicoId) && (
                <div style={{margin:'0 20px 12px',display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:34,height:34,borderRadius:'50%',background:'var(--navy-800,#152544)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:12,flexShrink:0}}>
                    {tecNombre(t.tecnicoId).split(' ').map(x=>x[0]).slice(0,2).join('')}
                  </div>
                  <div>
                    <div style={{fontSize:13.5,fontWeight:700}}>{tecNombre(t.tecnicoId)}</div>
                    <div style={{fontSize:12,color:'var(--text-3)'}}>Técnico responsable</div>
                  </div>
                </div>
              )}

              {t.observaciones && (
                <div style={{margin:'0 20px 12px',padding:'11px 14px',background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:10}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Observaciones</div>
                  <div style={{fontSize:13.5,lineHeight:1.5}}>{t.observaciones}</div>
                </div>
              )}

              {tieneProx && (
                <div style={{margin:'0 20px 12px',padding:'11px 14px',background:'var(--blue-50,#eff6ff)',border:'1px solid rgba(37,99,235,.22)',borderRadius:10}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'var(--blue-600,#1E3A8A)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Próximo mantenimiento</div>
                  <div style={{fontSize:13.5,lineHeight:1.5}}>
                    {[
                      t.tipoAceite && `Aceite ${t.tipoAceite}`,
                      t.proximoKm && `próximo cambio a los ${Number(t.proximoKm) ? Number(t.proximoKm).toLocaleString('es-CO') : t.proximoKm} km`,
                      t.proximaVisita && `visita sugerida: ${fmtDate(t.proximaVisita)}`,
                    ].filter(Boolean).join(' · ')}
                    {t.notasProximoMant && <div style={{marginTop:3,color:'var(--text-2)'}}>{t.notasProximoMant}</div>}
                  </div>
                </div>
              )}

              {t.evidencias?.length > 0 && (
                <div style={{margin:'0 20px 12px'}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Fotos</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(84px,1fr))',gap:8}}>
                    {t.evidencias.map((f,i)=>(
                      <button key={f.id||i} onClick={()=>{setGaleria(t.evidencias);setGalIdx(i)}}
                        style={{padding:0,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',cursor:'pointer',aspectRatio:'1',background:'var(--bg-subtle)'}}>
                        <img src={f.dataUrl} alt={f.nota||'Foto del servicio'} loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{padding:'12px 20px 18px',display:'flex',justifyContent:'flex-end'}}>
                <button className="btn btn-outline" onClick={()=>setVistaServicio(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Visor de fotos (lightbox) */}
      {galeria && galeria.length > 0 && (
        <div onClick={()=>setGaleria(null)}
          style={{position:'fixed',inset:0,background:'rgba(6,11,26,.93)',zIndex:1000,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20}}>
          <img src={galeria[galIdx]?.dataUrl} alt={galeria[galIdx]?.nota||''} onClick={e=>e.stopPropagation()}
            style={{maxWidth:'100%',maxHeight:'78vh',objectFit:'contain',borderRadius:8,boxShadow:'0 10px 40px rgba(0,0,0,.5)'}}/>
          {galeria[galIdx]?.nota && (
            <div style={{color:'#fff',marginTop:12,fontSize:14,textAlign:'center',maxWidth:600}}>{galeria[galIdx].nota}</div>
          )}
          <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:12,marginTop:18,alignItems:'center',flexWrap:'wrap',justifyContent:'center'}}>
            {galeria.length > 1 && (
              <>
                <button style={{background:'rgba(255,255,255,.12)',color:'#fff',border:'1px solid rgba(255,255,255,.28)',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:600,cursor:'pointer'}}
                  onClick={()=>setGalIdx(i=>(i-1+galeria.length)%galeria.length)}>‹ Anterior</button>
                <span style={{color:'rgba(255,255,255,.7)',fontSize:13,fontWeight:600}}>{galIdx+1} / {galeria.length}</span>
                <button style={{background:'rgba(255,255,255,.12)',color:'#fff',border:'1px solid rgba(255,255,255,.28)',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:600,cursor:'pointer'}}
                  onClick={()=>setGalIdx(i=>(i+1)%galeria.length)}>Siguiente ›</button>
              </>
            )}
            <button className="btn btn-primary btn-sm" onClick={()=>setGaleria(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
