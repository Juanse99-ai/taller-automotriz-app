import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid } from '../utils/helpers'
import { TECNICOS, COMISION, ESTADOS, TALLER } from '../utils/constants'

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

export default function Liquidacion({ trabajos, notify, liquidacionHook }) {
  const {
    movimientos, liquidados, compartidos, historial,
    agregarMovimiento: hookAgregarMov, eliminarMovimiento: hookEliminarMov,
    guardarLiquidados, desliquidarTodos,
    toggleCompartido, agregarHistorial, guardarHistorial,
    guardarMovs,
  } = liquidacionHook

  const [tecnicoSel, setTecnicoSel] = useState('')
  const [seleccionados, setSeleccionados] = useState({})
  const [verHistorial, setVerHistorial] = useState(false)
  const [movForm, setMovForm] = useState({
    tecnicoId: '',
    tipo: 'adelanto',
    monto: '',
    nota: '',
    fecha: new Date().toISOString().slice(0, 10),
  })

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
    hookAgregarMov({
      id: `MV-${uid()}`, tecnicoId: parseInt(movForm.tecnicoId),
      tipo: movForm.tipo, monto, nota: movForm.nota, fecha: movForm.fecha,
    })
    setMovForm(f => ({ ...f, monto: '', nota: '' }))
    notify('Movimiento registrado', 'success')
  }

  const eliminarMovimiento = (id) => hookEliminarMov(id)

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

    agregarHistorial(registro)
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
    doc.setFont(undefined, 'bold')
    doc.text(`Estado de Cuenta — ${tecData.tecnico.nombre}`, titleX, 14)
    doc.setFontSize(9)
    doc.text(TALLER.razonSocial || TALLER.nombre, titleX, 20)
    doc.setFont(undefined, 'normal')
    doc.text(`NIT: ${TALLER.nit} · ${TALLER.direccion}`, titleX, 24)
    doc.text(`Cel: ${TALLER.celular} · ${TALLER.email}`, titleX, 28)
    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.text(`Fecha: ${fmtDate(new Date().toISOString())}`, titleX, 34)
    doc.setFont(undefined, 'normal')

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
      startY: 40,
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

  const exportPdfHistorial = async (reg) => {
    const doc = new jsPDF()
    const logoData = await loadLogo()
    if (logoData && typeof logoData === 'string' && logoData.startsWith('data:image')) {
      try { doc.addImage(logoData, 'PNG', 14, 10, 28, 18) } catch {}
    }
    const titleX = logoData ? 44 : 14
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('ESTADO DE CUENTA', titleX, 13)
    doc.setFontSize(9)
    doc.text(TALLER.razonSocial || TALLER.nombre, titleX, 18)
    doc.setFont(undefined, 'normal')
    doc.text(`NIT: ${TALLER.nit} · ${TALLER.direccion}`, titleX, 22)
    doc.text(`Cel: ${TALLER.celular} · ${TALLER.email}`, titleX, 26)
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text(`Tecnico: ${reg.tecnico}`, titleX, 32)
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text(`Ref: ${reg.id}`, titleX, 36)
    doc.text(`Fecha: ${fmtDate(reg.fecha)}`, 160, 13)

    // Detalle de trabajos
    const detRows = (reg.detalleTrabajo || []).map(d => {
      const com = d.compartido ? (d.manoObra * COMISION.TOTAL) / 2 : d.manoObra * COMISION.TOTAL
      return [fmtDate(d.fecha), d.placa, d.cliente || '—', d.compartido ? 'Si (50%)' : 'No', fmt(d.manoObra), fmt(Math.round(com))]
    })
    autoTable(doc, {
      startY: 42,
      head: [['Fecha', 'Placa', 'Cliente', 'Compartido', 'M.O. (sin IVA)', 'Comision']],
      body: detRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    })

    // Movimientos / descuentos
    if (reg.movimientos && reg.movimientos.length > 0) {
      doc.setFontSize(10)
      doc.text('Adelantos / Cargos / Descuentos:', 14, doc.lastAutoTable.finalY + 10)
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 14,
        head: [['Fecha', 'Tipo', 'Nota', 'Monto']],
        body: reg.movimientos.map(m => [fmtDate(m.fecha), m.tipo, m.nota || '—', fmt(m.monto)]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [230, 126, 34] },
      })
    }

    // Resumen final
    const resY = doc.lastAutoTable.finalY + 8
    autoTable(doc, {
      startY: resY,
      body: [
        [{ content: 'RESUMEN DEL PAGO', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [236, 240, 241], halign: 'center', fontSize: 10 } }],
        ['Mano de Obra (sin IVA):', fmt(reg.manoObra || 0)],
        [`Comision (${COMISION.TOTAL * 100}%):`, fmt(reg.comision || 0)],
        ['Adelantos / Cargos:', `- ${fmt(reg.cargos || 0)}`],
        [{ content: 'NETO A PAGAR:', styles: { fontStyle: 'bold', fontSize: 11 } },
         { content: fmt(reg.neto || 0), styles: { fontStyle: 'bold', fontSize: 11, textColor: reg.neto >= 0 ? [39, 174, 96] : [231, 76, 60] } }],
      ],
      columnStyles: { 0: { halign: 'right', cellWidth: 100 }, 1: { halign: 'right', fontStyle: 'bold', cellWidth: 60 } },
      styles: { fontSize: 9, cellPadding: 3 },
      theme: 'plain',
    })

    // Firmas
    const firmaY = doc.lastAutoTable.finalY + 30
    doc.setDrawColor(100)
    doc.line(20, firmaY, 85, firmaY)
    doc.line(120, firmaY, 185, firmaY)
    doc.setFontSize(9)
    doc.text('Firma del Tecnico', 38, firmaY + 6)
    doc.text('Autorizado por', 140, firmaY + 6)

    // Nota al pie
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text('Este documento es un comprobante interno de liquidacion de mano de obra.', 14, firmaY + 20)

    doc.save(`pago_${reg.tecnico}_${reg.id}.pdf`)
    notify('PDF de pago exportado', 'success')
  }

  const desliquidar = () => {
    desliquidarTodos()
    notify('Todos los trabajos desliquidados', 'info')
  }

  // ===== RENDER =====
  const totalFacturado = resumenTecnicos.reduce((s,t) => s + t.moTotal, 0)
  const totalComisiones = resumenTecnicos.reduce((s,t) => s + t.comisionTotal, 0)

  return (
    <div>
      <div className="pagehd">
        <div><h2>Liquidacion de comisiones</h2><p className="sub">Cierre de periodo · {COMISION.TOTAL*100}% comision total · {COMISION.TOTAL*50}% c/u si trabajo compartido</p></div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar historial' : 'Ver historial'}</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14,marginBottom:18}}>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div><div className="kpi__lbl">Facturado en OTs</div></div><div className="kpi__v" style={{fontSize:24}}>{fmt(totalFacturado)}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic amber"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div><div className="kpi__lbl">Comisiones a pagar</div></div><div className="kpi__v" style={{fontSize:24,color:'var(--amber-500)'}}>{fmt(totalComisiones)}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic green"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg></div><div className="kpi__lbl">Utilidad taller</div></div><div className="kpi__v" style={{fontSize:24,color:'var(--green-600)'}}>{fmt(totalFacturado - totalComisiones)}</div></div>
      </div>

      {/* Per-tech cards */}
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {resumenTecnicos.map((t, i) => (
          <div className="card" key={t.id}>
            <div className="card__h">
              <h3>
                <span className={`av av-${(i%5)+1}`} style={{width:30,height:30,marginLeft:-2}}>{t.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</span>
                {t.nombre} <span style={{fontSize:12,color:'var(--text-3)',fontWeight:500,marginLeft:4}}>· {t.especialidad}</span>
              </h3>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:11,color:'var(--text-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:.5}}>{t.pendientes} OTs · Comision</span>
                <span className="mono" style={{fontSize:17,fontWeight:800,color:'var(--green-600)',marginLeft:8}}>{fmt(t.comisionTotal)}</span>
                <button className="btn btn-primary btn-sm" style={{marginLeft:12}} onClick={()=>{setTecnicoSel(String(t.id));setSeleccionados({})}} disabled={t.pendientes===0}>
                  {tecnicoSel===String(t.id)?'Seleccionado':'Ver'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {liquidados.length > 0 && (
        <div style={{fontSize:12,color:'var(--text-3)',marginTop:8}}>
          {liquidados.length} trabajos ya liquidados (ocultos).{' '}
          <button className="btn btn-ghost btn-sm" onClick={desliquidar} style={{fontSize:11,padding:'2px 6px'}}>Desliquidar todos</button>
        </div>
      )}

      {tecData && (
        <>
          <div className="card" style={{marginTop:16}}>
            <div className="card__h">
              <h3>{tecData.tecnico.nombre} — Trabajos pendientes</h3>
              <div style={{display:'flex',gap:8}}>
                <span style={{fontSize:13,color:'var(--text-3)'}}>Selecciona los que vas a liquidar</span>
                <button className="btn btn-outline btn-sm" onClick={() => seleccionarTodos(tecTrabajos.map(t => t.id))}>
                  {tecTrabajos.every(t => seleccionados[t.id]) ? 'Deseleccionar' : 'Todos'}
                </button>
              </div>
            </div>
            <div className="card__b card__b--flush">
              {tecTrabajos.length === 0 ? (
                <div className="empty"><h4>Sin pendientes</h4><p>No hay trabajos pendientes de liquidar.</p></div>
              ) : (
                <table className="tbl">
                  <thead><tr><th style={{width:40}}></th><th>Fecha</th><th>OT</th><th>Placa</th><th>Cliente</th><th style={{textAlign:'center'}}>Comp.</th><th className="c-right">M.O.</th><th className="c-right">Comisión</th></tr></thead>
                  <tbody>
                    {tecTrabajos.map(t => {
                      const mano = getManoObra(t)
                      const esComp = compartidos[t.id] === true
                      const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
                      const selected = !!seleccionados[t.id]
                      return (
                        <tr key={t.id} style={{background:selected?'var(--green-50,#f0fdf4)':undefined,cursor:'pointer'}} onClick={() => toggleSeleccion(t.id)}>
                          <td style={{textAlign:'center'}}><input type="checkbox" checked={selected} onChange={() => {}}/></td>
                          <td className="c-muted">{fmtDate(t.fecha)}</td>
                          <td className="c-mono" style={{color:'var(--blue-600)',fontWeight:700}}>{t.otCodigo || t.id}</td>
                          <td className="c-mono" style={{fontWeight:700}}>{t.placa}</td>
                          <td className="c-name">{t.cliente || '—'}</td>
                          <td style={{textAlign:'center'}}><input type="checkbox" checked={esComp} onClick={e=>e.stopPropagation()} onChange={()=>toggleCompartido(t.id)}/></td>
                          <td className="c-mono c-right">{fmt(mano)}</td>
                          <td className="c-mono c-right" style={{color:'var(--green-600)',fontWeight:600}}>
                            {fmt(Math.round(com))}
                            {esComp && <span style={{display:'block',fontSize:10,color:'var(--text-3)'}}>50/50</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__h"><h3>Adelantos / Cargos — {tecData.tecnico.nombre}</h3></div>
            <div className="card__b">
              <form onSubmit={agregarMovimiento} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 2fr auto',gap:12,marginBottom:12}}>
                <input type="hidden" value={tecnicoSel}/>
                <div className="field"><label>Tipo</label><select className="input" value={movForm.tipo} onChange={e=>setMovForm(f=>({...f,tipo:e.target.value}))}><option value="adelanto">Adelanto</option><option value="prestamo">Prestamo</option><option value="consumo">Consumo</option><option value="descuento">Descuento</option></select></div>
                <div className="field"><label>Monto</label><input className="input" type="number" value={movForm.monto} onChange={e=>setMovForm(f=>({...f,monto:e.target.value}))} placeholder="0"/></div>
                <div className="field"><label>Fecha</label><input className="input" type="date" value={movForm.fecha} onChange={e=>setMovForm(f=>({...f,fecha:e.target.value}))}/></div>
                <div className="field"><label>Nota</label><input className="input" value={movForm.nota} onChange={e=>setMovForm(f=>({...f,nota:e.target.value}))} placeholder="Almuerzo, anticipo..."/></div>
                <div style={{display:'flex',alignItems:'flex-end'}}><button type="submit" className="btn btn-outline" onClick={()=>setMovForm(f=>({...f,tecnicoId:tecnicoSel}))}>Agregar</button></div>
              </form>
              {tecMovs.length === 0 ? (
                <p style={{fontSize:13,color:'var(--text-3)'}}>Sin movimientos registrados.</p>
              ) : (
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Nota</th><th className="c-right">Monto</th><th></th></tr></thead>
                  <tbody>
                    {tecMovs.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).map(m=>(
                      <tr key={m.id}>
                        <td className="c-muted">{fmtDate(m.fecha)}</td>
                        <td style={{textTransform:'capitalize'}}>{m.tipo}</td>
                        <td className="c-muted">{m.nota||'—'}</td>
                        <td className="c-mono c-right" style={{color:'var(--amber-500)'}}>{fmt(m.monto)}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={()=>eliminarMovimiento(m.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {cantSeleccionados > 0 && (
            <div className="card" style={{borderColor:'rgba(22,163,74,.32)',background:'rgba(22,163,74,.04)'}}>
              <div className="card__h" style={{borderBottomColor:'rgba(22,163,74,.18)'}}><h3 style={{color:'var(--green-700)'}}>Resumen del pago — {tecData.tecnico.nombre}</h3></div>
              <div className="card__b">
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:16}}>
                  {[[cantSeleccionados,'Trabajos'],[fmt(totalSeleccion.manoObra),'M.O. (sin IVA)'],[fmt(totalSeleccion.comision),'Comision','var(--green-600)'],[fmt(totalSeleccion.cargos),'Cargos','var(--amber-500)'],[fmt(totalSeleccion.neto),'NETO A PAGAR',totalSeleccion.neto>=0?'var(--green-600)':'var(--red-500)']].map(([v,l,c],i)=>(
                    <div key={i} style={{padding:'12px 14px',background:'var(--bg-subtle)',borderRadius:10,border:'1px solid var(--border)'}}>
                      <div className="mono" style={{fontSize:i===4?22:18,fontWeight:800,color:c||'var(--text)'}}>{v}</div>
                      <div style={{fontSize:10.5,color:'var(--text-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginTop:4}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                  <button className="btn btn-outline" onClick={exportPdfPago}>Exportar PDF</button>
                  <button className="btn btn-primary" onClick={generarPago}>Generar Pago</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="card" style={{marginTop:16}}>
        <div className="card__h">
          <h3>Historial de pagos</h3>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span className="count">{historial.length} pagos</span>
            <button className="btn btn-outline btn-sm" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar' : 'Ver'}</button>
          </div>
        </div>
        {verHistorial && (
          <div className="card__b">
            {historial.length === 0 ? (
              <div className="empty"><h4>Sin pagos</h4><p>No hay pagos registrados.</p></div>
            ) : (
              <>
                {historial.map(reg => (
                  <div key={reg.id} style={{border:'1px solid var(--border)',borderRadius:10,padding:14,marginBottom:10,background:'var(--bg-subtle)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8,marginBottom:8}}>
                      <div><span className="mono" style={{fontSize:12,fontWeight:700}}>{reg.id}</span><span className="badge badge-i" style={{marginLeft:8}}>{reg.tecnico}</span></div>
                      <span style={{fontSize:13,color:'var(--text-3)'}}>{fmtDate(reg.fecha)}</span>
                    </div>
                    <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
                      <span style={{fontSize:13}}><strong>{reg.cantidadTrabajos}</strong> trabajos</span>
                      <span style={{fontSize:13}}>M.O.: <strong className="mono">{fmt(reg.manoObra||0)}</strong></span>
                      <span style={{fontSize:13,color:'var(--green-600)'}}>Comision: <strong className="mono">{fmt(reg.comision||0)}</strong></span>
                      <span style={{fontSize:13,color:'var(--amber-500)'}}>Cargos: <strong className="mono">{fmt(reg.cargos||0)}</strong></span>
                      <span style={{fontSize:13,color:'var(--green-600)',fontWeight:700}}>Neto: <strong className="mono">{fmt(reg.neto||0)}</strong></span>
                      <button className="btn btn-outline btn-sm" style={{marginLeft:'auto'}} onClick={()=>exportPdfHistorial(reg)}>PDF</button>
                    </div>
                  </div>
                ))}
                <div style={{textAlign:'right',marginTop:8}}>
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--red-500)'}} onClick={()=>{if(confirm('Borrar todo el historial de pagos?'))guardarHistorial([])}}>Limpiar historial</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
