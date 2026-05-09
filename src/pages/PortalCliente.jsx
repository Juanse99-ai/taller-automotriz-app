import { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { InspeccionDetalle } from './Inspecciones'
import { ESTADOS, TECNICOS, TALLER } from '../utils/constants'
import { fmtDate, fmt } from '../utils/helpers'

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

// Consulta directa a Supabase via proxy (funciona desde cualquier dispositivo)
async function buscarTrabajosPorCedula(cedula) {
  try {
    const url = `/api/supabase?table=trabajos&cedula_cliente=eq.${encodeURIComponent(cedula)}&order=fecha.desc`
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
      inspeccion: typeof r.inspeccion === 'string' ? JSON.parse(r.inspeccion) : (r.inspeccion || null),
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
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

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
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('Reporte de Inspeccion Vehicular', 14, 14)
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text(TALLER.razonSocial || TALLER.nombre, 14, 20)
    doc.setFont(undefined, 'normal')
    doc.text(`NIT: ${TALLER.nit} · ${TALLER.direccion}`, 14, 24)
    doc.text(`Cel: ${TALLER.celular} · ${TALLER.email}`, 14, 28)
    doc.setFontSize(10)
    doc.text(`Generado: ${new Date().toLocaleDateString('es-CO')}`, 14, 33)

    doc.setFontSize(11)
    doc.text(`Vehiculo: ${insp.vehiculo || insp.placa}`, 14, 42)
    doc.text(`Placa: ${insp.placa}`, 14, 48)
    doc.text(`Cliente: ${insp.cliente || '—'}`, 14, 54)
    doc.text(`Tecnico: ${insp.tecnico || '—'}`, 120, 42)
    doc.text(`Fecha: ${new Date(insp.fecha).toLocaleDateString('es-CO')}`, 120, 48)

    const items = insp.items || []
    const urgentes = items.filter(i => i.estado === 'urgente')
    const sugeridos = items.filter(i => i.estado === 'sugerido')
    const buenos = items.filter(i => i.estado === 'bueno')
    const total = items.filter(i => i.estado !== 'no_aplica').length
    const pct = total > 0 ? Math.round((buenos.length / total) * 100) : 0

    doc.setFontSize(14)
    doc.text(`Estado general: ${pct}%`, 14, 64)

    if (urgentes.length > 0) {
      autoTable(doc, {
        startY: 70,
        head: [['REPARACION URGENTE', 'Observaciones']],
        body: urgentes.map(i => [i.nombre, i.comentario || '—']),
        headStyles: { fillColor: [220, 38, 38] },
        styles: { fontSize: 9 },
      })
    }

    if (sugeridos.length > 0) {
      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 70) + 6,
        head: [['REPARACION SUGERIDA', 'Observaciones']],
        body: sugeridos.map(i => [i.nombre, i.comentario || '—']),
        headStyles: { fillColor: [217, 119, 6] },
        styles: { fontSize: 9 },
      })
    }

    if (buenos.length > 0) {
      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 70) + 6,
        head: [['BUEN ESTADO', 'Observaciones']],
        body: buenos.map(i => [i.nombre, i.comentario || '—']),
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 9 },
      })
    }

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
            <div style={{padding:'28px 32px 20px',background:'linear-gradient(135deg,#0d1b35,#152544)',color:'#fff',textAlign:'center'}}>
              <img src="/logo.png" alt="MDA" style={{width:50,height:50,objectFit:'contain',borderRadius:12,background:'#fff',padding:4,marginBottom:12}}/>
              <h1 style={{fontSize:20,fontWeight:800,margin:'0 0 4px',letterSpacing:'.02em'}}>Multidiagnosticos AS</h1>
              <p style={{fontSize:13,opacity:.65,margin:0}}>Seguimiento en linea de su vehiculo</p>
            </div>
            <div style={{padding:'24px 32px 28px'}}>
              <form onSubmit={buscar} style={{display:'flex',flexDirection:'column',gap:16}}>
                <div className="field">
                  <label>Numero de cedula o NIT</label>
                  <input
                    className="input"
                    value={cedula}
                    onChange={e => setCedula(e.target.value)}
                    placeholder="Ej: 1234567890"
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
    <div style={{maxWidth:780,margin:'0 auto',display:'flex',flexDirection:'column',gap:20,padding:'20px 16px'}}>
      {/* Hero card */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{padding:'22px 26px',background:'linear-gradient(135deg,#0d1b35,#152544)',color:'#fff',position:'relative'}}>
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
              <div style={{fontSize:13,opacity:.75,marginBottom:2}}>Hola, {datos.trabajos[0]?.cliente?.split(' ')[0] || ''}</div>
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
              <div style={{fontSize:13,opacity:.75,marginBottom:2}}>Hola, {datos.trabajos[0]?.cliente?.split(' ')[0] || ''}</div>
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
              <div style={{width:`${ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct||0}%`,height:'100%',background:`linear-gradient(90deg,var(--amber-500),var(--amber-400))`,borderRadius:99,transition:'width .4s'}}/>
            </div>
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:6,fontWeight:600}}>{ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct||0}% completado</div>
          </div>
        )}
      </div>

      {/* Tecnico asignado */}
      {trabajoActivo && tecNombre(trabajoActivo.tecnicoId) && (
        <div className="card">
          <div className="card__h"><h3>Tecnico asignado</h3></div>
          <div className="card__b" style={{display:'flex',gap:14,alignItems:'center'}}>
            <div style={{width:54,height:54,borderRadius:'50%',background:'linear-gradient(135deg,var(--amber-500),var(--amber-400))',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:18,flexShrink:0}}>
              {tecNombre(trabajoActivo.tecnicoId).split(' ').map(x=>x[0]).slice(0,2).join('')}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15}}>{tecNombre(trabajoActivo.tecnicoId)}</div>
              <div style={{fontSize:12.5,color:'var(--text-3)'}}>Multidiagnosticos AS</div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline de avance */}
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

      {/* Historial de trabajos */}
      {datos.trabajos.length > 0 && (
        <div className="card">
          <div className="card__h"><h3>Historial de servicios</h3><span className="count">{datos.trabajos.length}</span></div>
          <div className="card__b card__b--flush">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Placa</th><th>Vehiculo</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {datos.trabajos.map(t => (
                  <tr key={t.id}>
                    <td style={{color:'var(--text-3)',fontSize:13}}>{fmtDate(t.fecha)}</td>
                    <td className="mono" style={{fontWeight:700}}>{t.placa}</td>
                    <td style={{color:'var(--text-3)',fontSize:13}}>{[t.marca,t.modelo].filter(Boolean).join(' ')||'—'}</td>
                    <td>
                      <span className="badge" style={{
                        background:(ESTADO_TRABAJO_DISPLAY[t.estado]?.color||'#64748b')+'20',
                        color:ESTADO_TRABAJO_DISPLAY[t.estado]?.color||'#64748b'
                      }}>
                        {ESTADO_TRABAJO_DISPLAY[t.estado]?.label || t.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!trabajoActivo && datos.trabajos.length === 0 && (
        <div className="empty">
          <p>No hay trabajos activos en este momento.</p>
        </div>
      )}

      <div style={{textAlign:'center',fontSize:12,color:'var(--text-4)',padding:'8px 0 18px'}}>
        Multidiagnosticos AS · Sabanalarga, Atlantico
      </div>
    </div>
  )
}
