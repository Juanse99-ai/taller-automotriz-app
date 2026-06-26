import { useState, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO } from '../utils/helpers'
import { COMISION, ESTADOS } from '../utils/constants'
import { lsGet, lsSet } from '../services/storage'
import { useTecnicos } from '../services/tecnicos'
import { loadLogo, drawHeader, drawSectionHeader, drawDataBlock, drawTotalsBox, drawSignatures, drawFooter, tableStylesItems, tableStylesMuted, PDF_LAYOUT } from '../utils/pdfTheme'

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
      const totalLinea = precio * cant
      const base = ivaPct > 0 ? totalLinea / (1 + ivaPct / 100) : totalLinea
      return s + base
    }, 0)
    // Si hay líneas marcadas "Servicio", esas mandan (comportamiento de siempre).
    // Si NO hay (ej. cambio de aceite), se cae al valor guardado de mano de obra
    // que se escribió a mano en la OT.
    if (suma > 0) return Math.round(suma)
  }
  // Fallback a campos directos (mano de obra manual de la OT)
  if (typeof t?.manoObra === 'number' && !Number.isNaN(t.manoObra)) return Math.round(Math.max(0, t.manoObra))
  if (typeof t?.mano_obra === 'number' && !Number.isNaN(t.mano_obra)) return Math.round(Math.max(0, t.mano_obra))
  return 0
}

export default function Liquidacion({ trabajos, notify, liquidacionHook }) {
  const TECNICOS = useTecnicos()
  const {
    movimientos, liquidados, compartidos, historial,
    agregarMovimiento: hookAgregarMov, eliminarMovimiento: hookEliminarMov,
    guardarLiquidados,
    toggleCompartido, setCompartidoPartner, agregarHistorial, guardarHistorial,
  } = liquidacionHook

  const [tecnicoSel, setTecnicoSel] = useState('')
  const [seleccionados, setSeleccionados] = useState({})
  const [verHistorial, setVerHistorial] = useState(false)
  const [verLiquidados, setVerLiquidados] = useState(false)
  // Ventanas del tecnico seleccionado: minimizables por header
  const [colapso, setColapso] = useState({ trabajos: false, movs: false })
  const toggleColapso = (k) => setColapso(c => ({ ...c, [k]: !c[k] }))
  const [movForm, setMovForm] = useState({
    tipo: 'adelanto',
    monto: '',
    nota: '',
    fecha: hoyISO(),
  })
  // "Diario": cargo fijo por día (mismo valor para todo el equipo, editable y
  // persistido). Tú escribes los días; se agrega como cargo y se descuenta del neto.
  const VALOR_DIARIO_KEY = 'valor_diario_taller'
  const [valorDiario, setValorDiario] = useState(() => Number(lsGet(VALOR_DIARIO_KEY, 30000)) || 0)
  const [diarioDias, setDiarioDias] = useState('')
  const cambiarValorDiario = (v) => { const n = Number(v) || 0; setValorDiario(n); lsSet(VALOR_DIARIO_KEY, n) }

  // compartidos[id] puede ser true (legacy, sin partner) o { partner: tecId }
  const compInfo = (id) => {
    const c = compartidos[id]
    if (!c) return { es: false, partner: null }
    return { es: true, partner: typeof c === 'object' ? (c.partner || null) : null }
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

  // Trabajos completados pendientes de liquidar
  const trabajosPendientes = useMemo(() => {
    return trabajos.filter(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return false
      if (liquidados.includes(t.id)) return false
      return true
    }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [trabajos, liquidados])

  // Mano de obra por trabajo, calculada una sola vez
  const moMap = useMemo(() => {
    const m = {}
    trabajosPendientes.forEach(t => { m[t.id] = getManoObra(t) })
    return m
  }, [trabajosPendientes])

  // Agrupar por tecnico.
  // Compartido = el 40% se divide 20/20 entre el tecnico ASIGNADO y el COMPANERO elegido.
  // (Antes el reparto estaba fijo a los tecnicos 1 y 2: una OT compartida del
  //  tecnico 3 desaparecia de su liquidacion. Bug corregido.)
  const porTecnico = useMemo(() => {
    const map = {}
    TECNICOS.forEach(t => {
      map[t.id] = { tecnico: t, trabajos: [], totalMO: 0, comision: 0 }
    })

    trabajosPendientes.forEach(t => {
      const tid = parseInt(t.tecnicoId)
      const manoObra = moMap[t.id] || 0
      const { es, partner } = compInfo(t.id)

      if (es) {
        const mitad = (manoObra * COMISION.TOTAL) / 2
        if (map[tid]) {
          map[tid].trabajos.push(t)
          map[tid].totalMO += manoObra
          map[tid].comision += mitad
        }
        if (partner && partner !== tid && map[partner]) {
          map[partner].trabajos.push(t)
          map[partner].totalMO += manoObra
          map[partner].comision += mitad
        }
      } else if (map[tid]) {
        map[tid].trabajos.push(t)
        map[tid].totalMO += manoObra
        map[tid].comision += manoObra * COMISION.TOTAL
      }
    })

    return map
  }, [trabajosPendientes, compartidos, moMap, TECNICOS])

  // KPIs calculados desde los trabajos (sin doble conteo de compartidos)
  const kpis = useMemo(() => {
    let facturado = 0, comisiones = 0, sinPartner = 0, sinTecnico = 0
    trabajosPendientes.forEach(t => {
      const mo = moMap[t.id] || 0
      facturado += mo
      comisiones += mo * COMISION.TOTAL
      const { es, partner } = compInfo(t.id)
      if (es && !partner) sinPartner++
      const tid = parseInt(t.tecnicoId)
      if (!TECNICOS.some(x => x.id === tid)) sinTecnico++
    })
    return {
      facturado: Math.round(facturado),
      comisiones: Math.round(comisiones),
      utilidad: Math.round(facturado - comisiones),
      sinPartner, sinTecnico,
    }
  }, [trabajosPendientes, compartidos, moMap, TECNICOS])

  // Datos del tecnico seleccionado
  const tecData = tecnicoSel ? porTecnico[parseInt(tecnicoSel)] : null
  const tecTrabajos = tecData?.trabajos || []
  const tecMovs = useMemo(() =>
    movimientos
      .filter(m => m.tecnicoId === parseInt(tecnicoSel))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [movimientos, tecnicoSel])

  // Totales de la seleccion actual
  const totalSeleccion = useMemo(() => {
    let manoObra = 0, comision = 0
    tecTrabajos.forEach(t => {
      if (!seleccionados[t.id]) return
      const mo = moMap[t.id] || 0
      const { es } = compInfo(t.id)
      manoObra += mo
      comision += es ? (mo * COMISION.TOTAL) / 2 : mo * COMISION.TOTAL
    })
    const cargos = tecMovs.reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
    // El cargo se descuenta de la MANO DE OBRA (base), no de la comisión: el
    // mecánico asume solo su parte (COMISION.TOTAL). Por eso el descuento real al
    // pago es cargos × comisión, y el neto = comisión − ese descuento.
    //   neto = (M.O. − cargos) × % = comisión − cargos × %
    const cargosEfectivos = Math.round(cargos * COMISION.TOTAL)
    return {
      manoObra: Math.round(manoObra),
      comision: Math.round(comision),
      cargos: Math.round(cargos),
      cargosEfectivos,
      neto: Math.round(comision - cargosEfectivos),
    }
  }, [tecTrabajos, seleccionados, compartidos, tecMovs, moMap])

  const cantSeleccionados = Object.keys(seleccionados).filter(id => seleccionados[id]).length

  // Resumen general por tecnico.
  // Inactivos solo aparecen si aun tienen pendientes por liquidar (cierre de cuentas).
  const resumenTecnicos = useMemo(() => {
    // Cargos por técnico (para el neto = comisión − cargos × comisión%)
    const cargosBy = {}
    for (const m of movimientos) {
      cargosBy[m.tecnicoId] = (cargosBy[m.tecnicoId] || 0) + (parseFloat(m.monto) || 0)
    }
    return TECNICOS.map(t => {
      const pendientes = (porTecnico[t.id]?.trabajos || []).length
      const moTotal = Math.round(porTecnico[t.id]?.totalMO || 0)
      const comisionTotal = Math.round(porTecnico[t.id]?.comision || 0)
      const cargos = Math.round(cargosBy[t.id] || 0)
      const cargosEf = Math.round(cargos * COMISION.TOTAL)
      return { ...t, pendientes, moTotal, comisionTotal, cargos, cargosEf, neto: comisionTotal - cargosEf }
    }).filter(t => !t.eliminado && (t.activo !== false || t.pendientes > 0))
  }, [porTecnico, TECNICOS, movimientos])

  // Total de la nómina (lo que se debe pagar a los técnicos con trabajos pendientes)
  const totalNomina = useMemo(
    () => resumenTecnicos.filter(t => t.pendientes > 0).reduce((s, t) => s + Math.max(0, t.neto), 0),
    [resumenTecnicos])

  const historialOrdenado = useMemo(() =>
    [...historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [historial])

  // --- ACCIONES ---
  const agregarMovimiento = (e) => {
    e?.preventDefault?.()
    const tid = parseInt(tecnicoSel)
    const monto = Math.abs(parseFloat(movForm.monto) || 0)
    if (!tid) { notify('Selecciona un técnico primero', 'error'); return }
    if (!monto) { notify('Ingresa el monto del movimiento', 'error'); return }
    hookAgregarMov({
      id: `MV-${uid()}`, tecnicoId: tid,
      tipo: movForm.tipo, monto, nota: movForm.nota, fecha: movForm.fecha,
    })
    setMovForm(f => ({ ...f, monto: '', nota: '' }))
    notify('Movimiento registrado', 'success')
  }

  // Agrega el "diario" como un cargo: monto = valor diario × días (que tú escribes).
  const agregarDiario = () => {
    const tid = parseInt(tecnicoSel)
    const dias = Math.floor(parseFloat(diarioDias) || 0)
    const monto = Math.round((Number(valorDiario) || 0) * dias)
    if (!tid) { notify('Selecciona un técnico primero', 'error'); return }
    if (dias <= 0) { notify('Escribe cuántos días', 'error'); return }
    if (monto <= 0) { notify('El valor diario debe ser mayor a 0', 'error'); return }
    hookAgregarMov({
      id: `MV-${uid()}`, tecnicoId: tid,
      tipo: 'diario', monto, nota: `Diario: ${dias} día(s) × ${fmt(valorDiario)}`,
      fecha: hoyISO(),
    })
    setDiarioDias('')
    notify(`Diario agregado: ${dias} día(s) = ${fmt(monto)}`, 'success')
  }

  const generarPago = () => {
    const ids = Object.keys(seleccionados).filter(id => seleccionados[id])
    if (ids.length === 0) { notify('Selecciona al menos un trabajo para liquidar', 'error'); return }
    if (!tecData) return

    // Neto negativo: la deuda no se borra, se arrastra como saldo anterior
    if (totalSeleccion.neto < 0) {
      const ok = confirm(
        `El neto es negativo (${fmt(totalSeleccion.neto)}): los cargos superan la comisión.\n\n` +
        `La deuda restante (${fmt(Math.abs(totalSeleccion.neto))}) quedará registrada como "saldo anterior" ` +
        `para descontar en la próxima liquidación. ¿Continuar?`
      )
      if (!ok) return
    }

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
      cargosEfectivos: totalSeleccion.cargosEfectivos,
      neto: totalSeleccion.neto,
      movimientos: tecMovs.map(m => ({ ...m })),
      detalleTrabajo: ids.map(id => {
        const t = trabajos.find(tr => tr.id === id)
        if (!t) return null
        const mo = moMap[t.id] ?? getManoObra(t)
        const { es } = compInfo(t.id)
        return { id: t.id, placa: t.placa, cliente: t.cliente, fecha: t.fecha, manoObra: mo, compartido: es }
      }).filter(Boolean),
    }

    agregarHistorial(registro)
    guardarLiquidados([...liquidados, ...ids])

    // Consumir movimientos del tecnico: borrado real (estado + Supabase).
    // Antes solo se filtraba el estado local y el sync de Supabase los
    // resucitaba: el adelanto se descontaba DOBLE en la siguiente liquidacion.
    tecMovs.forEach(m => hookEliminarMov(m.id))

    // Arrastre de deuda si quedo saldo en contra
    if (totalSeleccion.neto < 0) {
      hookAgregarMov({
        id: `MV-${uid()}`,
        tecnicoId: tecData.tecnico.id,
        tipo: 'saldo anterior',
        monto: Math.abs(totalSeleccion.neto),
        nota: `Arrastre de ${registro.id}`,
        fecha: hoyISO(),
      })
    }

    setSeleccionados({})
    notify(`Pago generado: ${fmt(totalSeleccion.neto)} para ${tecData.tecnico.nombre}`, 'success')
  }

  const exportPdfPago = async () => {
    if (cantSeleccionados === 0) { notify('Selecciona trabajos primero', 'error'); return }
    const doc = new jsPDF()
    const { MARGIN } = PDF_LAYOUT
    const logoData = await loadLogo()

    drawHeader(doc, {
      logoData,
      docType: 'LIQUIDACIÓN DE PAGO',
      docNumber: tecData.tecnico.nombre.split(' ').slice(0, 2).join(' '),
      badge: { label: cantSeleccionados === 1 ? '1 trabajo' : `${cantSeleccionados} trabajos`, color: 'neutral' },
      dateRows: [{ lbl: 'Fecha', val: fmtDate(new Date().toISOString()) }],
    })

    let y = 47
    y = drawSectionHeader(doc, 'Técnico', y)
    y = drawDataBlock(doc, [
      { label: 'Nombre completo', value: tecData.tecnico.nombre, bold: true },
      { label: 'Teléfono', value: tecData.tecnico.telefono || '—' },
      { label: 'Trabajos', value: String(cantSeleccionados), bold: true },
    ], y)
    y += 4

    const rows = []
    Object.keys(seleccionados).filter(id => seleccionados[id]).forEach(id => {
      const t = trabajos.find(tr => tr.id === id)
      if (!t) return
      const mo = moMap[t.id] ?? getManoObra(t)
      const { es } = compInfo(t.id)
      const com = es ? (mo * COMISION.TOTAL) / 2 : mo * COMISION.TOTAL
      rows.push([fmtDate(t.fecha), (t.placa || '').toUpperCase(), t.cliente || '—', es ? 'Sí (50%)' : 'No', fmt(mo), fmt(Math.round(com))])
    })

    y = drawSectionHeader(doc, 'Trabajos liquidados', y)
    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'PLACA', 'CLIENTE', 'COMP.', 'M.O.', 'COMISIÓN']],
      body: rows,
      ...tableStylesItems,
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 6

    if (tecMovs.length > 0) {
      y = drawSectionHeader(doc, 'Adelantos · cargos · descuentos', y)
      autoTable(doc, {
        startY: y,
        head: [['FECHA', 'TIPO', 'NOTA', 'MONTO']],
        body: tecMovs.map(m => [fmtDate(m.fecha), m.tipo, m.nota || '—', fmt(m.monto)]),
        ...tableStylesMuted,
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 28, fontStyle: 'bold' },
          2: { cellWidth: 'auto' },
          3: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    y = drawTotalsBox(doc, {
      y, x: 122, w: 74,
      rows: [
        { lbl: `Comisión (${COMISION.TOTAL * 100}% M.O.)`, val: fmt(totalSeleccion.comision) },
        { lbl: `Cargos ${fmt(totalSeleccion.cargos)} · tu ${COMISION.TOTAL * 100}%`, val: `- ${fmt(totalSeleccion.cargosEfectivos)}` },
      ],
      finalLabel: 'NETO A PAGAR',
      finalValue: fmt(totalSeleccion.neto),
    })
    y += 18

    drawSignatures(doc, {
      y: Math.max(y, 252),
      blocks: [
        { label: 'Firma del técnico', sub: 'Nombre, documento, fecha' },
        { label: 'Autorizado por', sub: 'Nombre, cargo, fecha' },
      ],
    })

    drawFooter(doc, { page: 1, total: 1 })
    doc.save(`liquidacion_${tecData.tecnico.nombre.replace(/\s+/g, '_')}_${hoyISO()}.pdf`)
    notify('PDF de pago exportado', 'success')
  }

  const exportPdfHistorial = async (reg) => {
    const doc = new jsPDF()
    const { MARGIN } = PDF_LAYOUT
    const logoData = await loadLogo()

    drawHeader(doc, {
      logoData,
      docType: 'ESTADO DE CUENTA',
      docNumber: `#${(reg.id || '').toString().slice(-6).toUpperCase()}`,
      badge: { label: 'HISTÓRICO', color: 'navy' },
      dateRows: [{ lbl: 'Fecha', val: fmtDate(reg.fecha) }],
    })

    let y = 47
    y = drawSectionHeader(doc, 'Técnico', y)
    y = drawDataBlock(doc, [
      { label: 'Nombre completo', value: reg.tecnico, bold: true },
      { label: 'Referencia', value: (reg.id || '').toString().slice(-6).toUpperCase() },
      { label: 'Trabajos liquidados', value: String((reg.detalleTrabajo || []).length) },
    ], y)
    y += 4

    const detRows = (reg.detalleTrabajo || []).map(d => {
      const com = d.compartido ? (d.manoObra * COMISION.TOTAL) / 2 : d.manoObra * COMISION.TOTAL
      return [fmtDate(d.fecha), (d.placa || '').toUpperCase(), d.cliente || '—', d.compartido ? 'Sí (50%)' : 'No', fmt(d.manoObra), fmt(Math.round(com))]
    })
    y = drawSectionHeader(doc, 'Trabajos liquidados', y)
    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'PLACA', 'CLIENTE', 'COMP.', 'M.O.', 'COMISIÓN']],
      body: detRows,
      ...tableStylesItems,
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 6

    if (reg.movimientos && reg.movimientos.length > 0) {
      y = drawSectionHeader(doc, 'Adelantos · cargos · descuentos', y)
      autoTable(doc, {
        startY: y,
        head: [['FECHA', 'TIPO', 'NOTA', 'MONTO']],
        body: reg.movimientos.map(m => [fmtDate(m.fecha), m.tipo, m.nota || '—', fmt(m.monto)]),
        ...tableStylesMuted,
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 28, fontStyle: 'bold' },
          2: { cellWidth: 'auto' },
          3: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    y = drawTotalsBox(doc, {
      y, x: 122, w: 74,
      rows: [
        { lbl: 'Mano de obra (sin IVA)', val: fmt(reg.manoObra || 0) },
        { lbl: `Comisión (${COMISION.TOTAL * 100}%)`, val: fmt(reg.comision || 0) },
        // Pagos nuevos guardan cargosEfectivos (cargo × %); los viejos descontaban el cargo completo.
        (reg.cargosEfectivos != null
          ? { lbl: `Cargos ${fmt(reg.cargos || 0)} · tu ${COMISION.TOTAL * 100}%`, val: `- ${fmt(reg.cargosEfectivos)}` }
          : { lbl: 'Cargos / adelantos', val: `- ${fmt(reg.cargos || 0)}` }),
      ],
      finalLabel: 'NETO PAGADO',
      finalValue: fmt(reg.neto || 0),
    })
    y += 18

    drawSignatures(doc, {
      y: Math.max(y, 252),
      blocks: [
        { label: 'Firma del técnico', sub: 'Nombre, documento, fecha' },
        { label: 'Autorizado por', sub: 'Nombre, cargo, fecha' },
      ],
    })

    drawFooter(doc, { page: 1, total: 1, leftText: 'Comprobante interno de liquidación de mano de obra · MDA' })
    doc.save(`pago_${reg.tecnico}_${reg.id}.pdf`)
    notify('PDF de pago exportado', 'success')
  }

  // Desliquidar UNO solo (reversible: vuelve a aparecer como pendiente). Con
  // confirmación para no marcarlo por error. (Se quitó el "Desliquidar todos".)
  const desliquidarUno = (id, t) => {
    const etiqueta = t ? [t.placa, t.cliente].filter(Boolean).join(' · ') || id : id
    if (!confirm(`¿Desliquidar este trabajo?\n${etiqueta}\n\nVolverá a aparecer como pendiente por liquidar.`)) return
    guardarLiquidados(liquidados.filter(x => x !== id))
    notify('Trabajo desliquidado', 'info')
  }

  // Trabajos liquidados (ocultos) que aún existen en la lista, para mostrarlos uno a uno.
  const trabajosLiquidados = useMemo(() => {
    const set = new Set(liquidados)
    return trabajos.filter(t => set.has(t.id))
  }, [trabajos, liquidados])

  // ===== RENDER =====
  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>Liquidación de comisiones</h2>
          <p className="sub">Cierre de periodo · {COMISION.TOTAL * 100}% comisión total · {COMISION.TOTAL * 50}% c/u si el trabajo es compartido</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar historial' : 'Ver historial'}</button>
        </div>
      </div>

      {/* KPIs — hero "Comisiones a pagar" + 2 mini (sin doble conteo de compartidos) */}
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi-hero" style={{
          background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '22px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 170,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Comisiones a pagar</span>
            {kpis.sinPartner > 0 && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--amber-600)', background: 'var(--amber-100)', padding: '3px 9px', borderRadius: 999 }}>
                {kpis.sinPartner} compartido{kpis.sinPartner !== 1 ? 's' : ''} sin compañero
              </span>
            )}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'clamp(32px, 4.8vw, 48px)', letterSpacing: '-1px', lineHeight: 1, color: 'var(--amber-600)' }}>
              {fmt(kpis.comisiones)}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-3)', marginTop: 8, fontWeight: 500 }}>
              {trabajosPendientes.length} OT{trabajosPendientes.length !== 1 ? 's' : ''} pendiente{trabajosPendientes.length !== 1 ? 's' : ''} de liquidar
              {kpis.sinTecnico > 0 && <span style={{ color: 'var(--red-600)' }}> · {kpis.sinTecnico} sin técnico asignado</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10 }}>
          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic blue" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>M.O. facturada</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 24, color: 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{fmt(kpis.facturado)}</div>
            </div>
          </div>

          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic green" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Utilidad taller</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 24, color: 'var(--green-600)', lineHeight: 1.1, marginTop: 2 }}>{fmt(kpis.utilidad)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Nómina: total a pagar + lista por técnico (cada fila es clicable) */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Nómina · {resumenTecnicos.filter(t => t.pendientes > 0).length} por liquidar</h3>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          Total a pagar <strong className="mono" style={{ color: 'var(--green-700)', fontSize: 16, marginLeft: 4 }}>{fmt(totalNomina)}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {resumenTecnicos.map((t, i) => {
          const activo = tecnicoSel === String(t.id)
          return (
            <button
              key={t.id}
              onClick={() => { setTecnicoSel(activo ? '' : String(t.id)); setSeleccionados({}); setColapso({ trabajos: false, movs: false }) }}
              disabled={t.pendientes === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                padding: '14px 18px', textAlign: 'left',
                background: activo ? 'rgba(30,58,138,.05)' : 'var(--bg-raised)',
                border: '1px solid', borderColor: activo ? 'var(--blue-600)' : 'var(--border)',
                borderRadius: 12, cursor: t.pendientes === 0 ? 'default' : 'pointer',
                opacity: t.pendientes === 0 ? .55 : 1,
                transition: 'border-color .15s, background .15s',
              }}
            >
              <span className={`av av-${(i % 5) + 1}`} style={{ width: 38, height: 38, fontSize: 13, flexShrink: 0 }}>
                {t.nombre.split(' ').map(x => x[0]).slice(0, 2).join('')}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.nombre}
                  {t.activo === false && <span className="badge badge-n">Inactivo</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 1 }}>{t.especialidad} · {t.pendientes} OT{t.pendientes !== 1 ? 's' : ''} pendiente{t.pendientes !== 1 ? 's' : ''}{t.activo === false ? ' · cierre de cuentas' : ''}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Neto a pagar</div>
                <div className="mono" style={{ fontSize: 19, fontWeight: 700, color: t.neto > 0 ? 'var(--green-700)' : 'var(--text-3)' }}>{fmt(t.neto)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 1 }}>
                  Com. {fmt(t.comisionTotal)}{t.cargosEf > 0 ? ` − ${fmt(t.cargosEf)}` : ''}
                </div>
              </div>
              {activo && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          )
        })}
      </div>

      {liquidados.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setVerLiquidados(v => !v)}
            style={{ fontSize: 12, padding: '4px 10px', color: 'var(--text-3)' }}
          >
            {verLiquidados ? '▾' : '▸'} {liquidados.length} trabajos ya liquidados (ocultos)
          </button>
          {verLiquidados && (
            <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxWidth: 560 }}>
              {trabajosLiquidados.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-3)' }}>
                  Los {liquidados.length} trabajos liquidados no están en la lista actual.
                </div>
              ) : trabajosLiquidados.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fmtDate(t.fecha)} · <strong>{t.placa || '—'}</strong> · {t.cliente || '—'}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => desliquidarUno(t.id, t)}
                    style={{ color: 'var(--amber-600)', fontSize: 11.5, padding: '2px 8px', flexShrink: 0 }}
                  >
                    Desliquidar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tecData && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card__h" style={{ cursor: 'pointer' }} onClick={() => toggleColapso('trabajos')}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: colapso.trabajos ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 200ms var(--ease-out)', flexShrink: 0, color: 'var(--text-3)' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                {tecData.tecnico.nombre} — Trabajos pendientes
              </h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                {!colapso.trabajos && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Selecciona los que vas a liquidar</span>}
                {colapso.trabajos && cantSeleccionados > 0 && <span className="count">{cantSeleccionados} seleccionados</span>}
                {!colapso.trabajos && (
                  <button className="btn btn-outline btn-sm" onClick={() => seleccionarTodos(tecTrabajos.map(t => t.id))}>
                    {tecTrabajos.length > 0 && tecTrabajos.every(t => seleccionados[t.id]) ? 'Deseleccionar' : 'Todos'}
                  </button>
                )}
              </div>
            </div>
            {!colapso.trabajos && (
            <div className="card__b card__b--flush">
              {tecTrabajos.length === 0 ? (
                <div className="empty"><h4>Sin pendientes</h4><p>No hay trabajos pendientes de liquidar.</p></div>
              ) : (
                <table className="tbl">
                  <thead><tr><th style={{ width: 40 }}></th><th>Fecha</th><th>OT</th><th>Placa</th><th>Cliente</th><th style={{ textAlign: 'center' }}>Compartido</th><th className="c-right">M.O.</th><th className="c-right">Comisión</th></tr></thead>
                  <tbody>
                    {tecTrabajos.map(t => {
                      const mano = moMap[t.id] || 0
                      const { es: esComp, partner } = compInfo(t.id)
                      const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
                      const selected = !!seleccionados[t.id]
                      const tidAsignado = parseInt(t.tecnicoId)
                      return (
                        <tr key={t.id} style={{ background: selected ? 'rgba(22,163,74,.06)' : undefined, cursor: 'pointer' }} onClick={() => toggleSeleccion(t.id)}>
                          <td style={{ textAlign: 'center' }}><input type="checkbox" checked={selected} onChange={() => {}} aria-label="Seleccionar trabajo"/></td>
                          <td className="c-muted">{fmtDate(t.fecha)}</td>
                          <td className="c-mono" style={{ color: 'var(--blue-600)', fontWeight: 700 }}>{t.otCodigo || t.id}</td>
                          <td className="c-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                          <td className="c-name">{t.cliente || '—'}</td>
                          <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={esComp} onChange={() => toggleCompartido(t.id)} aria-label="Trabajo compartido"/>
                            {esComp && (
                              <select
                                className="input"
                                value={partner || ''}
                                onChange={e => setCompartidoPartner(t.id, e.target.value)}
                                style={{ display: 'block', margin: '4px auto 0', width: 110, minHeight: 30, height: 30, fontSize: 12, padding: '2px 8px' }}
                                aria-label="Compañero del trabajo compartido"
                              >
                                <option value="">¿Con quién?</option>
                                {TECNICOS.filter(x => x.id !== tidAsignado && (x.activo !== false || x.id === partner)).map(x => (
                                  <option key={x.id} value={x.id}>{x.nombre.split(' ')[0]}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="c-mono c-right" style={mano === 0 ? { color: 'var(--red-600)', fontWeight: 700 } : undefined}>
                            {fmt(mano)}
                            {mano === 0 && <span style={{ display: 'block', fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>sin servicios</span>}
                          </td>
                          <td className="c-mono c-right" style={{ color: 'var(--green-600)', fontWeight: 600 }}>
                            {fmt(Math.round(com))}
                            {esComp && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>50/50</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card__h" style={{ cursor: 'pointer' }} onClick={() => toggleColapso('movs')}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: colapso.movs ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 200ms var(--ease-out)', flexShrink: 0, color: 'var(--text-3)' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                Adelantos / Cargos — {tecData.tecnico.nombre}
              </h3>
              {colapso.movs && tecMovs.length > 0 && (
                <span className="count">{tecMovs.length} mov · {fmt(totalSeleccion.cargos)}</span>
              )}
            </div>
            {!colapso.movs && (
            <div className="card__b">
              {/* DIARIO: cargo fijo por día (mismo valor para todos, editable y guardado). Tú escribes los días. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginBottom: 14, padding: 12, background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10 }}>
                <div className="field" style={{ flex: '0 0 150px' }}><label>Valor diario</label><input className="input" type="number" min="0" step="1000" value={valorDiario} onChange={e => cambiarValorDiario(e.target.value)} /></div>
                <div className="field" style={{ flex: '0 0 110px' }}><label>Días</label><input className="input" type="number" min="0" value={diarioDias} onChange={e => setDiarioDias(e.target.value)} placeholder="Ej. 6" /></div>
                <div style={{ flex: 1, minWidth: 130, fontSize: 13.5, color: 'var(--text-3)' }}>
                  Descuento del diario: <strong style={{ color: 'var(--amber-700)', fontFamily: 'var(--mono)' }}>{fmt((Number(valorDiario) || 0) * (parseInt(diarioDias) || 0))}</strong>
                </div>
                <button type="button" className="btn btn-outline" onClick={agregarDiario}>Agregar diario</button>
              </div>
              <form onSubmit={agregarMovimiento} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr auto', gap: 12, marginBottom: 12 }}>
                <div className="field"><label>Tipo</label><select className="input" value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}><option value="adelanto">Adelanto</option><option value="prestamo">Préstamo</option><option value="consumo">Consumo</option><option value="descuento">Descuento</option></select></div>
                <div className="field"><label>Monto</label><input className="input" type="number" min="0" value={movForm.monto} onChange={e => setMovForm(f => ({ ...f, monto: e.target.value }))} placeholder="0"/></div>
                <div className="field"><label>Fecha</label><input className="input" type="date" value={movForm.fecha} onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))}/></div>
                <div className="field"><label>Nota</label><input className="input" value={movForm.nota} onChange={e => setMovForm(f => ({ ...f, nota: e.target.value }))} placeholder="Almuerzo, anticipo..."/></div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}><button type="submit" className="btn btn-outline">Agregar</button></div>
              </form>
              {tecMovs.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Sin movimientos registrados.</p>
              ) : (
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Nota</th><th className="c-right">Monto</th><th></th></tr></thead>
                  <tbody>
                    {tecMovs.map(m => (
                      <tr key={m.id}>
                        <td className="c-muted">{fmtDate(m.fecha)}</td>
                        <td style={{ textTransform: 'capitalize' }}>{m.tipo}</td>
                        <td className="c-muted">{m.nota || '—'}</td>
                        <td className="c-mono c-right" style={{ color: 'var(--amber-600)' }}>{fmt(m.monto)}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => hookEliminarMov(m.id)} aria-label="Eliminar movimiento">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )}
          </div>

          {cantSeleccionados > 0 && (
            <div className="card" style={{ marginTop: 16, borderColor: 'rgba(22,163,74,.32)', background: 'rgba(22,163,74,.04)' }}>
              <div className="card__h" style={{ borderBottomColor: 'rgba(22,163,74,.18)' }}><h3 style={{ color: 'var(--green-700)' }}>Resumen del pago — {tecData.tecnico.nombre}</h3></div>
              <div className="card__b">
                <div className="kpi-bh" style={{ marginBottom: 16 }}>
                  {[[cantSeleccionados, 'Trabajos'], [fmt(totalSeleccion.manoObra), 'M.O. (sin IVA)'], [fmt(totalSeleccion.comision), 'Comisión', 'var(--green-700)'], [`− ${fmt(totalSeleccion.cargosEfectivos)}`, `Cargos (tu ${COMISION.TOTAL * 100}%)`, 'var(--amber-600)'], [fmt(totalSeleccion.neto), 'Neto a pagar', totalSeleccion.neto >= 0 ? 'var(--green-700)' : 'var(--red-700)']].map(([v, l, c], i) => (
                    <div key={i} className="kpi-bh__s">
                      <div className="kpi-bh__l">{l}</div>
                      <div className="kpi-bh__row"><span className="kpi-bh__v" style={{ fontSize: 20, color: c || 'var(--text)' }}>{v}</span></div>
                    </div>
                  ))}
                </div>
                {totalSeleccion.cargos > 0 && (
                  <div style={{ padding: '9px 13px', background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 9, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14 }}>
                    Cargo bruto <strong>{fmt(totalSeleccion.cargos)}</strong> — se descuenta de la mano de obra, así que el mecánico asume su parte ({COMISION.TOTAL * 100}% = <strong>{fmt(totalSeleccion.cargosEfectivos)}</strong>). Neto = comisión − {fmt(totalSeleccion.cargosEfectivos)}.
                  </div>
                )}
                {totalSeleccion.neto < 0 && (
                  <div style={{ padding: '10px 14px', background: 'rgba(220,38,38,.07)', border: '1px solid rgba(220,38,38,.28)', borderRadius: 9, fontSize: 13, color: 'var(--red-700)', fontWeight: 600, marginBottom: 14 }}>
                    Los cargos superan la comisión. Al generar el pago, la deuda restante se arrastrará como "saldo anterior".
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={exportPdfPago}>Exportar PDF</button>
                  <button className="btn btn-primary" onClick={generarPago}>Generar pago</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__h">
          <h3>Historial de pagos</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="count">{historial.length} pagos</span>
            <button className="btn btn-outline btn-sm" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar' : 'Ver'}</button>
          </div>
        </div>
        {verHistorial && (
          <div className="card__b">
            {historialOrdenado.length === 0 ? (
              <div className="empty"><h4>Sin pagos</h4><p>No hay pagos registrados.</p></div>
            ) : (
              <>
                {historialOrdenado.map(reg => (
                  <div key={reg.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--bg-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <div><span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{reg.id}</span><span className="badge badge-i" style={{ marginLeft: 8 }}>{reg.tecnico}</span></div>
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{fmtDate(reg.fecha)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 13.5 }}><strong>{reg.cantidadTrabajos}</strong> trabajos</span>
                      <span style={{ fontSize: 13.5 }}>M.O.: <strong className="mono">{fmt(reg.manoObra || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: 'var(--green-600)' }}>Comisión: <strong className="mono">{fmt(reg.comision || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: 'var(--amber-600)' }}>Cargos: <strong className="mono">{fmt(reg.cargos || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: reg.neto >= 0 ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 700 }}>Neto: <strong className="mono">{fmt(reg.neto || 0)}</strong></span>
                      <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportPdfHistorial(reg)}>PDF</button>
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: 'right', marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-600)' }} onClick={() => {
                    if (!historial.length) { notify('No hay historial para borrar', 'info'); return }
                    const r = prompt(`Esto borra los ${historial.length} pagos del historial y NO se puede deshacer.\n\nEscribe BORRAR para confirmar:`)
                    if (r && r.trim().toUpperCase() === 'BORRAR') { guardarHistorial([]); notify('Historial de pagos borrado', 'info') }
                  }}>Limpiar historial</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
