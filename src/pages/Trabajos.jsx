import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre, fmtTelefono } from '../utils/helpers'
import { TECNICOS, ESTADOS, IVA_DEFAULT, DIAS_ESTANCADO, TALLER, COMISION } from '../utils/constants'
import { loadLogo as loadPdfLogo, drawHeader, drawSectionHeader, drawDataBlock, drawTotalsBox, drawSignatures, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS } from '../utils/pdfTheme'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { useClientes } from '../hooks/useClientes'
import { useInventario, formatCacheAge } from '../hooks/useInventario'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import Switch from '../components/Switch'

// ¿La fecha cae dentro del rango elegido? (hoy / semana = últimos 7 días / mes = mes actual)
function dentroDeFecha(fecha, modo, now) {
  if (!fecha) return false
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return false
  if (modo === 'hoy') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }
  if (modo === 'semana') {
    const ini = new Date(now); ini.setDate(now.getDate() - 6); ini.setHours(0, 0, 0, 0)
    return d >= ini
  }
  if (modo === 'mes') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  return true
}

export default function Trabajos({ hook, vehiculosHook, clientesHook, notify, onAutoFacturar }) {
  const { trabajos, agregarTrabajo, actualizarTrabajo, eliminarTrabajo } = hook
  const [vista, setVista] = useState('lista') // lista | nuevo | editar | kanban
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  // Cockpit desktop: trabajo seleccionado para el panel de detalle (solo ≥1200px)
  const [selId, setSelId] = useState(null)
  const [previewId, setPreviewId] = useState(null) // vista previa de una OT (modal) antes de editar
  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width:1200px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width:1200px)')
    const fn = e => setIsWide(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  // Kanban: arrastrar tarjetas entre columnas para cambiar el estado de la OT.
  const dragIdRef = useRef(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const dropEnColumna = (estado) => {
    const id = dragIdRef.current
    dragIdRef.current = null
    setDragOverCol(null)
    if (!id) return
    const t = trabajos.find(x => x.id === id)
    if (t && t.estado !== estado) {
      actualizarTrabajo(id, { estado })
      notify?.(`${t.otCodigo || 'OT'} → ${estado}`, 'info')
    }
  }

  // Filtros
  // Default: 'activos' = todos los que NO estan terminados (Completado/Cancelado).
  // Asi al abrir Trabajos solo ves los que estan en proceso, no los ya cerrados.
  const [filtroEstado, setFiltroEstado] = useState('activos')
  const [filtroTecnico, setFiltroTecnico] = useState('todos')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  // Filtro de fecha de la LISTA (el kanban siempre muestra todo el trabajo activo).
  // Por defecto 'hoy' → al abrir Trabajos solo se ven las OT del día.
  const [filtroFecha, setFiltroFecha] = useState('hoy')

  const stats = useMemo(() => {
    const total = trabajos.length
    const comp = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO).length
    const pend = trabajos.filter(t => t.estado === ESTADOS.PENDIENTE).length
    const prog = trabajos.filter(t => t.estado === ESTADOS.EN_PROGRESO).length
    return { total, comp, pend, prog }
  }, [trabajos])

  const filtered = useMemo(() => {
    let list = [...trabajos]
    if (filtroEstado === 'activos') {
      // Activos = todo lo que NO esta cerrado
      list = list.filter(t => t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO)
    } else if (filtroEstado !== 'todos') {
      list = list.filter(t => t.estado === filtroEstado)
    }
    if (filtroTecnico !== 'todos') list = list.filter(t => String(t.tecnicoId) === filtroTecnico)
    if (filtroBusqueda.trim()) {
      const q = filtroBusqueda.toLowerCase()
      list = list.filter(t =>
        (t.placa || '').toLowerCase().includes(q) ||
        (t.cliente || '').toLowerCase().includes(q) ||
        (t.otCodigo || '').toLowerCase().includes(q)
      )
    }
    // Filtro por fecha — solo aplica en la vista lista. El kanban muestra todo el
    // trabajo activo sin importar el día (si no, se esconderían carros en proceso).
    if (vista !== 'kanban' && filtroFecha !== 'todas') {
      const now = new Date()
      list = list.filter(t => dentroDeFecha(t.fecha, filtroFecha, now))
    }
    return list.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [trabajos, filtroEstado, filtroTecnico, filtroBusqueda, filtroFecha, vista])

  const tecNombre = (id) => TECNICOS.find(t => t.id === parseInt(id))?.nombre || '—'

  const [showFacturarModal, setShowFacturarModal] = useState(null)

  const handleCompletar = async (id) => {
    await actualizarTrabajo(id, { estado: ESTADOS.COMPLETADO })
    notify('Trabajo marcado como completado', 'success')
    // Ofrecer facturar
    const t = trabajos.find(x => x.id === id)
    if (t) setShowFacturarModal(t)
  }

  const handleEliminar = async (id) => {
    await eliminarTrabajo(id)
    setConfirmDel(null)
    notify('Trabajo eliminado', 'info')
  }

  const loadLogo = async () => {
    try {
      const res = await fetch('/logo.png')
      if (!res.ok) return null
      const type = res.headers.get('content-type') || ''
      if (!type.includes('image')) return null
      const blob = await res.blob()
      return await new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  const imprimirOT = async (t) => {
    const doc = new jsPDF()
    const { MARGIN, CONTENT_W } = PDF_LAYOUT
    const { NAVY, SLATE_300, SLATE_400, SLATE_500, AMBER } = PDF_COLORS
    const logoData = await loadPdfLogo()

    // ============= HEADER (logo real + tildes) =============
    const dateRows = [{ lbl: 'Fecha emisión', val: fmtDate(t.fecha) }]
    if (t.fechaEntrega) dateRows.push({ lbl: 'Entrega', val: fmtDate(t.fechaEntrega) })

    drawHeader(doc, {
      logoData,
      docType: 'ORDEN DE TRABAJO',
      docNumber: t.otCodigo || '—',
      badge: { label: t.estado || 'Pendiente', estado: t.estado || 'Pendiente' },
      dateRows,
    })

    // ============= CLIENTE =============
    let cursorY = 47
    cursorY = drawSectionHeader(doc, 'Cliente', cursorY)
    cursorY = drawDataBlock(doc, [
      { label: 'Nombre', value: t.cliente, bold: true },
      { label: 'Cédula / NIT', value: t.cedula },
      { label: 'Teléfono', value: t.telefonoCliente },
      { label: 'Email', value: t.emailCliente },
    ], cursorY)
    cursorY += 3

    // ============= VEHÍCULO =============
    cursorY = drawSectionHeader(doc, 'Vehículo', cursorY)
    cursorY = drawDataBlock(doc, [
      { label: 'Placa', value: (t.placa || '').toUpperCase(), bold: true },
      { label: 'Marca', value: t.marca },
      { label: 'Modelo', value: t.modelo },
      { label: 'Año', value: String(t.ano || '—') },
      { label: 'Kilometraje', value: t.kilometraje ? `${Number(t.kilometraje).toLocaleString('es-CO')} km` : '—' },
      { label: 'Técnico', value: tecNombre(t.tecnicoId) },
    ], cursorY)
    cursorY += 3

    // ============= DIAGNÓSTICO =============
    if (t.observaciones) {
      cursorY = drawSectionHeader(doc, 'Diagnóstico inicial · motivo de ingreso', cursorY)
      const obsLines = doc.splitTextToSize(t.observaciones, CONTENT_W - 6)
      const obsHeight = Math.max(11, obsLines.length * 3.8 + 6)
      doc.setDrawColor(...SLATE_300)
      doc.setLineWidth(0.2)
      doc.rect(MARGIN, cursorY, CONTENT_W, obsHeight)
      doc.setFontSize(8)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'normal')
      doc.text(obsLines, MARGIN + 3, cursorY + 4.5)
      cursorY += obsHeight + 3
    }

    // ============= TRABAJOS AUTORIZADOS =============
    if (t.items?.length) {
      cursorY = drawSectionHeader(doc, 'Trabajos autorizados', cursorY)

      const itemSkus = t.items.map(i => i.sku || i.codigo || '')
      const itemRows = t.items.map((i, idx) => [
        String(idx + 1),
        i.nombre || '—',
        String(i.cantidad || 1),
        fmt(parseFloat(i.precio) || 0),
        i.iva > 0 ? `${i.iva}%` : '—',
        fmt((parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1)),
      ])
      const hasSkus = itemSkus.some(s => s)

      autoTable(doc, {
        startY: cursorY,
        head: [['#', 'DESCRIPCIÓN', 'CANT.', 'V. UNIT.', 'IVA', 'TOTAL']],
        body: itemRows,
        ...tableStylesItems,
        styles: { ...tableStylesItems.styles, cellPadding: { top: 3, right: 3, bottom: hasSkus ? 7 : 3, left: 3 } },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8, textColor: SLATE_400 },
          1: { cellWidth: 'auto', fontStyle: 'bold' },
          2: { halign: 'center', cellWidth: 16 },
          3: { halign: 'right', cellWidth: 24 },
          4: { halign: 'center', cellWidth: 14 },
          5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
        },
        margin: { left: MARGIN, right: MARGIN },
        didDrawCell: (data) => {
          if (data.row.section === 'body' && data.column.index === 1) {
            const sku = itemSkus[data.row.index]
            if (sku) {
              doc.setFontSize(6.5)
              doc.setTextColor(...SLATE_400)
              doc.setFont('courier', 'normal')
              doc.text(`SKU ${sku}`, data.cell.x + 3, data.cell.y + data.cell.height - 2)
              doc.setFont(undefined, 'normal')
            }
          }
        },
      })

      cursorY = doc.lastAutoTable.finalY + 3
      doc.setFontSize(7)
      doc.setTextColor(...SLATE_500)
      doc.setFont(undefined, 'italic')
      doc.text('Cualquier trabajo adicional será autorizado por el cliente antes de su ejecución.', MARGIN, cursorY + 3)
      doc.setFont(undefined, 'normal')
      cursorY += 9

      // ===== Observaciones ingreso (izq, opcional) + Totales (der) =====
      const subtotal = t.subtotalSinIva || 0
      const iva = t.totalIva || 0
      const total = t.total || 0
      // M.O. y repuestos del desglose: calculados desde los items para que SIEMPRE
      // cuadren con el total (OTs viejas no guardaban "repuestos"). La mano de obra
      // mostrada al cliente = solo líneas marcadas Servicio (no la comisión interna).
      let manoObra = 0, repuestos = 0
      ;(t.items || []).forEach(i => {
        const linea = (parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1)
        if (i.esServicio) manoObra += linea
        else repuestos += linea
      })
      manoObra = Math.round(manoObra)
      repuestos = Math.round(repuestos)

      const obsIngresoReal = t.observacionesIngreso || t.estadoIngreso || ''
      let leftBlockH = 0
      if (obsIngresoReal && obsIngresoReal.trim().length > 0) {
        const lines = doc.splitTextToSize(obsIngresoReal, 100)
        leftBlockH = Math.max(40, lines.length * 4 + 10)
        doc.setDrawColor(...SLATE_300)
        doc.rect(MARGIN, cursorY, 104, leftBlockH)
        doc.setFontSize(7)
        doc.setTextColor(...SLATE_500)
        doc.setFont(undefined, 'bold')
        doc.text('OBSERVACIONES DE INGRESO', MARGIN + 3, cursorY + 4)
        doc.setFontSize(8)
        doc.setTextColor(...NAVY)
        doc.setFont(undefined, 'normal')
        doc.text(lines, MARGIN + 3, cursorY + 9)
      }

      // Próximo cambio de aceite / mantenimiento — recuadro amber a la izquierda.
      // Si no se registró el km manualmente pero ES un cambio de aceite, se sugiere
      // automáticamente: km actual + intervalo (sintético 10.000 · resto 5.000).
      let proxKm = parseInt(t.proximoKm) || 0
      const proxFecha = t.proximaVisita ? fmtDate(t.proximaVisita) : ''
      if (!proxKm && t.kilometraje) {
        const nombres = (t.items || []).map(i => (i.nombre || '').toLowerCase()).join(' ')
        const esCambioAceite = (t.tipoAceite && t.tipoAceite !== 'no_aplica') || nombres.includes('aceite')
        if (esCambioAceite) {
          const intervalo = t.tipoAceite === 'sintetico' ? 10000 : 5000
          proxKm = (parseInt(t.kilometraje) || 0) + intervalo
        }
      }
      if (proxKm > 0 || proxFecha) {
        const py = cursorY + (leftBlockH ? leftBlockH + 4 : 0)
        const ph = 17
        doc.setFillColor(254, 243, 199) // amber-100
        doc.setDrawColor(...AMBER)
        doc.setLineWidth(0.4)
        doc.roundedRect(MARGIN, py, 104, ph, 1.5, 1.5, 'FD')
        doc.setFontSize(7)
        doc.setTextColor(180, 83, 9) // amber-800
        doc.setFont(undefined, 'bold')
        doc.text('PRÓXIMO CAMBIO DE ACEITE', MARGIN + 4, py + 6)
        const partes = []
        if (proxKm > 0) partes.push(`${proxKm.toLocaleString('es-CO')} km`)
        if (proxFecha) partes.push(proxFecha)
        doc.setFontSize(11)
        doc.setTextColor(...NAVY)
        doc.text(partes.join('   ·   '), MARGIN + 4, py + 13)
        doc.setFont(undefined, 'normal')
        doc.setLineWidth(0.2)
        leftBlockH = (leftBlockH ? leftBlockH + 4 : 0) + ph
      }

      // Caja de totales (usa helper unificado)
      const rows = [
        { lbl: 'Mano de obra', val: fmt(manoObra) },
        { lbl: 'Repuestos', val: fmt(repuestos) },
        { lbl: 'Subtotal', val: fmt(subtotal) },
      ]
      if (iva > 0) rows.push({ lbl: 'IVA (19%)', val: fmt(iva) })
      const boxEndY = drawTotalsBox(doc, {
        y: cursorY, x: 122, w: 74,
        rows,
        finalLabel: 'Total a pagar',
        finalValue: fmt(total),
      })

      cursorY = Math.max(cursorY + leftBlockH, boxEndY) + 8
    }

    // ============= FIRMAS (altura fija para no flotar) =============
    const firmaY = Math.max(cursorY + 16, 250)
    drawSignatures(doc, {
      y: firmaY,
      blocks: [
        { label: 'Recibido por (cliente)', sub: 'Nombre, documento, fecha' },
        { label: 'Técnico responsable', sub: 'Nombre, documento, fecha' },
      ],
    })

    drawFooter(doc, { page: 1, total: 1, leftText: `${TALLER.razonSocial || TALLER.nombre} · NIT ${TALLER.nit}` })
    doc.save(`${t.otCodigo || 'OT'}.pdf`)
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
        allTrabajos={trabajos}
        vehiculosHook={vehiculosHook}
        onSave={async (data) => {
          // Helper: registrar/actualizar cliente y vehiculo en BD local
          // (se ejecuta tanto al crear como al editar)
          const sincronizarClienteVehiculo = () => {
            const placa = (data.placa || '').trim().toUpperCase()
            if (vehiculosHook && placa) {
              vehiculosHook.agregarVehiculo({
                placa,
                marca: data.marca || '',
                modelo: data.modelo || '',
                ano: parseInt(data.ano) || 0,
                cedulaPropietario: data.cedula || '',
              })
            }
            if (clientesHook && data.cedula) {
              clientesHook.guardarCliente({
                cedula: data.cedula,
                nombre: data.cliente || '',
                telefono: data.telefonoCliente || '',
                email: data.emailCliente || '',
              })
              if (placa) clientesHook.vincularVehiculo(data.cedula, placa)
            }
          }

          if (vista === 'editar') {
            await actualizarTrabajo(editId, data)
            sincronizarClienteVehiculo()
            notify('Trabajo actualizado', 'success')
          } else {
            await agregarTrabajo(data)
            sincronizarClienteVehiculo()
            notify('Trabajo creado', 'success')
          }
          setVista('lista')
          setEditId(null)
        }}
        onCancel={() => { setVista('lista'); setEditId(null) }}
      />
    )
  }

  const estadoBadge = (estado) => {
    if (estado === ESTADOS.COMPLETADO) return 'badge-s'
    if (estado === ESTADOS.CANCELADO) return 'badge-d'
    if (estado === ESTADOS.EN_PROGRESO || estado === ESTADOS.EN_PRUEBA) return 'badge-i'
    if (estado === ESTADOS.PENDIENTE || estado === ESTADOS.ESPERANDO_REPUESTOS) return 'badge-w'
    if (estado === ESTADOS.EN_DIAGNOSTICO || estado === ESTADOS.PROGRAMADO) return 'badge-n'
    return 'badge-w'
  }

  const tecIniciales = (id) => {
    const nombre = tecNombre(id)
    if (nombre === '—') return '?'
    const parts = nombre.split(' ')
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : nombre.slice(0, 2).toUpperCase()
  }

  const statesTabs = [
    ['activos', 'Activos'],
    [ESTADOS.PENDIENTE, 'Pendientes'],
    [ESTADOS.EN_DIAGNOSTICO, 'Diagnostico'],
    [ESTADOS.EN_PROGRESO, 'En Progreso'],
    [ESTADOS.ESPERANDO_REPUESTOS, 'Esperando Rep.'],
    [ESTADOS.EN_PRUEBA, 'En Prueba'],
    [ESTADOS.COMPLETADO, 'Completados'],
    [ESTADOS.CANCELADO, 'Cancelados'],
    ['todos', 'Todas'],
  ]

  const selTrabajo = trabajos.find(t => t.id === selId) || null

  return (
    <div>
      {/* Page header */}
      <div className="pagehd">
        <div>
          <h2>Ordenes de trabajo</h2>
          <p className="sub">{stats.total} OT registradas</p>
        </div>
        <div className="actions">
          <button className={`btn ${vista === 'lista' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVista('lista')}>Lista</button>
          <button className={`btn ${vista === 'kanban' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVista('kanban')}>Kanban</button>
          <button className="btn btn-primary" onClick={() => setVista('nuevo')}>+ Nueva OT</button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 18 }}>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg></div>
            <div className="kpi__lbl">Total OTs</div>
          </div>
          <div className="kpi__v">{stats.total}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic green"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg></div>
            <div className="kpi__lbl">Completados</div>
          </div>
          <div className="kpi__v">{stats.comp}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic amber"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
            <div className="kpi__lbl">Pendientes</div>
          </div>
          <div className="kpi__v">{stats.pend}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div>
            <div className="kpi__lbl">En Progreso</div>
          </div>
          <div className="kpi__v">{stats.prog}</div>
        </div>
      </div>

      {/* Tabs + search/filter bar */}
      <div className="tabs" style={{ marginBottom: 12 }}>
        {statesTabs.map(([key, label]) => (
          <button key={key} className={filtroEstado === key ? 'on' : ''} onClick={() => setFiltroEstado(key)}>{label}</button>
        ))}
      </div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
        {vista !== 'kanban' && (
          <div className="segctl" style={{ marginBottom: 10 }}>
            {[['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['todas', 'Todas']].map(([k, l]) => (
              <button key={k} type="button" className={filtroFecha === k ? 'on' : ''} onClick={() => setFiltroFecha(k)}>{l}</button>
            ))}
          </div>
        )}
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
            <input className="form-input" placeholder="Buscar placa, cliente, OT..." value={filtroBusqueda}
              onChange={e => setFiltroBusqueda(e.target.value)} style={{ fontSize: 13 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select className="form-select" value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)} style={{ fontSize: 13 }}>
              <option value="todos">Todos los técnicos</option>
              {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}{t.activo === false ? ' (inactivo)' : ''}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Vista Kanban */}
      {vista === 'kanban' ? (
        <div className="kanban-board">
          {[ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.EN_PROGRESO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.EN_PRUEBA, ESTADOS.COMPLETADO].map(estado => {
            const col = filtered.filter(t => t.estado === estado)
            const bc = estado === ESTADOS.COMPLETADO ? 'var(--green-500)'
              : estado === ESTADOS.EN_PROGRESO ? 'var(--blue-500)'
              : estado === ESTADOS.ESPERANDO_REPUESTOS ? 'var(--amber-500)'
              : estado === ESTADOS.EN_DIAGNOSTICO ? 'var(--purple-500)'
              : estado === ESTADOS.EN_PRUEBA ? 'var(--blue-500)' : 'var(--amber-400)'
            return (
              <div key={estado} className="kanban-column"
                onDragOver={e => { e.preventDefault(); if (dragOverCol !== estado) setDragOverCol(estado) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(c => (c === estado ? null : c)) }}
                onDrop={e => { e.preventDefault(); dropEnColumna(estado) }}
                style={dragOverCol === estado ? { outline: '2px dashed var(--blue-600)', outlineOffset: -2, background: 'rgba(30,58,138,.05)', borderRadius: 12 } : undefined}
              >
                <div className="kanban-column-header" style={{ borderTopColor: bc }}>
                  <span>{estado}</span>
                  <span className="kanban-count">{col.length}</span>
                </div>
                <div className="kanban-cards">
                  {col.map(t => {
                    const diasSinMover = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
                    const estancado = t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO && diasSinMover >= DIAS_ESTANCADO
                    return (
                      <div key={t.id} className="card"
                        draggable
                        onDragStart={() => { dragIdRef.current = t.id }}
                        onDragEnd={() => { dragIdRef.current = null; setDragOverCol(null) }}
                        style={{ padding: '12px 14px', marginBottom: 8, cursor: 'grab', ...(estancado ? { borderColor: 'rgba(220,38,38,.32)', background: 'rgba(220,38,38,.04)' } : {}) }} onClick={() => setPreviewId(t.id)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ color: 'var(--blue-600)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 13 }}>{t.otCodigo || '—'}</span>
                          <span className="text-mono" style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.5px' }}>{t.placa}</span>
                        </div>
                        <div className="text-sm" style={{ marginBottom: 6, fontWeight: 500 }}>{t.cliente || 'Sin cliente'}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`av av-${(parseInt(t.tecnicoId) || 0) % 6}`} style={{ width: 22, height: 22, fontSize: 10 }}>{tecIniciales(t.tecnicoId)}</span>
                            <span className="text-xs text-muted">{tecNombre(t.tecnicoId)}</span>
                          </div>
                          <span className="text-mono" style={{ fontWeight: 700, fontSize: 13 }}>{fmt(t.total)}</span>
                        </div>
                        {estancado && <div style={{ marginTop: 6 }}><span className="badge badge-d" style={{ fontSize: 10 }}>{diasSinMover}d sin movimiento</span></div>}
                      </div>
                    )
                  })}
                  {col.length === 0 && (
                    <div className="empty" style={{ padding: 24 }}>
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ opacity: .4, marginBottom: 6 }}><path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                      <span className="text-xs text-muted">Sin trabajos</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ opacity: .35, marginBottom: 12 }}><path d="M11.42 15.17l-5.71-5.71a8 8 0 1111.31 0l-5.6 5.71z"/><circle cx="12" cy="10" r="3"/></svg>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{trabajos.length === 0 ? 'No hay trabajos registrados' : 'No hay trabajos con estos filtros'}</p>
          <p className="text-sm text-muted">{trabajos.length === 0 ? 'Crea una nueva OT para comenzar.' : 'Prueba cambiar el filtro de fecha (Hoy / Semana / Todas) o el estado.'}</p>
        </div>
      ) : isWide ? (
        <div className="trab-cockpit">
          <div className="card trab-cockpit__list" style={{ padding: 0 }}>
            <div className="card__h"><span style={{ fontWeight: 600, fontSize: 14 }}>{filtered.length} trabajo{filtered.length !== 1 ? 's' : ''}</span></div>
            <div className="trab-cklist">
              {filtered.map(t => {
                const dias = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
                const estancado = t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO && dias >= DIAS_ESTANCADO
                return (
                  <button key={t.id} type="button" className={`trab-ckrow${t.id === selId ? ' sel' : ''}`} onClick={() => setSelId(t.id)}>
                    <span className="r1">
                      <span className="ot">{t.otCodigo || '—'}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {estancado && <span className="badge badge-d" style={{ fontSize: 9, padding: '1px 6px' }}>{dias}d</span>}
                        <span className={`badge ${estadoBadge(t.estado)}`}>{t.estado}</span>
                      </span>
                    </span>
                    <span className="r2"><strong>{t.placa}</strong> · {t.cliente || '—'}</span>
                    <span className="r3">{fmt(t.total)}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <aside className="trab-cockpit__detail">
            {selTrabajo ? (
              <div className="card" style={{ position: 'sticky', top: 80 }}>
                <div className="card__h" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue-600)', fontSize: 14 }}>{selTrabajo.otCodigo || '—'} · {selTrabajo.placa}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{selTrabajo.cliente || 'Sin cliente'} · {[selTrabajo.marca, selTrabajo.modelo].filter(Boolean).join(' ') || '—'}</span>
                </div>
                <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge ${estadoBadge(selTrabajo.estado)}`}>{selTrabajo.estado}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtDate(selTrabajo.fecha)}</span>
                  </div>

                  {selTrabajo.telefonoCliente && (() => {
                    const tel = String(selTrabajo.telefonoCliente).replace(/\D/g, '')
                    const wa = tel.length === 10 ? `57${tel}` : tel
                    return (
                      <div className="ck-d-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selTrabajo.cliente || 'Cliente'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{fmtTelefono(selTrabajo.telefonoCliente)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <a href={`tel:${tel}`} className="btn btn-outline btn-sm" style={{ height: 32, padding: '0 12px' }}>Llamar</a>
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ height: 32, padding: '0 12px', background: 'var(--green-600)', color: '#fff' }}>WhatsApp</a>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="ck-d-grid">
                    <div className="ck-d-cell"><div className="l">Técnico</div><div className="v">{tecNombre(selTrabajo.tecnicoId)}</div></div>
                    <div className="ck-d-cell"><div className="l">Total</div><div className="v">{fmt(selTrabajo.total)}</div></div>
                  </div>

                  {selTrabajo.estado !== ESTADOS.COMPLETADO && selTrabajo.estado !== ESTADOS.CANCELADO && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Cambiar estado</div>
                      <div className="segctl">
                        {[
                          [ESTADOS.PENDIENTE, 'Pendiente'],
                          [ESTADOS.EN_DIAGNOSTICO, 'Diagnóstico'],
                          [ESTADOS.EN_PROGRESO, 'En progreso'],
                          [ESTADOS.ESPERANDO_REPUESTOS, 'Esperando rep.'],
                          [ESTADOS.EN_PRUEBA, 'En prueba'],
                        ].map(([k, l]) => (
                          <button key={k} type="button" className={selTrabajo.estado === k ? 'on' : ''}
                            onClick={() => { if (selTrabajo.estado !== k) { actualizarTrabajo(selTrabajo.id, { estado: k }); notify?.(`OT ${selTrabajo.otCodigo || ''} → ${l}`, 'info') } }}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(selTrabajo.items || []).length > 0 && (
                    <div className="ck-d-cell">
                      <div className="l" style={{ marginBottom: 6 }}>Ítems</div>
                      {(selTrabajo.items || []).slice(0, 8).map((it, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
                          <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre || 'Ítem'}</span>
                          <span className="mono" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{fmt((parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 1))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => handleEditar(selTrabajo.id)}>Editar</button>
                    {selTrabajo.otCodigo && <button className="btn btn-outline btn-sm" onClick={() => imprimirOT(selTrabajo)}>PDF</button>}
                    {selTrabajo.estado !== ESTADOS.COMPLETADO && <button className="btn btn-primary btn-sm" onClick={() => handleCompletar(selTrabajo.id)}>Marcar listo</button>}
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-600)' }} onClick={() => { if (window.confirm('¿Eliminar este trabajo?')) handleEliminar(selTrabajo.id) }}>Eliminar</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ position: 'sticky', top: 80 }}>
                <div className="card__b" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32, fontSize: 13 }}>
                  Selecciona un trabajo de la lista para ver su detalle aquí.
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="card__h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead>
                <tr>
                  <th>OT</th>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th>Vehiculo</th>
                  <th>Tecnico</th>
                  <th>Estado</th>
                  <th className="c-right">Total</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const bc = estadoBadge(t.estado)
                  const diasSinMover = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
                  const estancado = t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO && diasSinMover >= DIAS_ESTANCADO
                  return (
                    <tr key={t.id} style={estancado ? { background: 'rgba(220,38,38,.06)', boxShadow: 'inset 0 0 0 1px rgba(220,38,38,.18)' } : {}}>
                      <td className="c-mono" data-label="OT" style={{ color: 'var(--blue-600)', fontWeight: 700 }}>{t.otCodigo || '—'}</td>
                      <td className="c-mono" data-label="Placa" style={{ fontWeight: 700 }}>{t.placa}</td>
                      <td className="c-name">{t.cliente || '—'}</td>
                      <td className="c-muted" data-label="Vehículo">{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td data-label="Técnico">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span className={`av av-${(parseInt(t.tecnicoId) || 1) % 5 + 1}`} style={{ width: 26, height: 26, fontSize: 10 }}>{tecIniciales(t.tecnicoId)}</span>
                          <span style={{ fontSize: 12.5 }}>{tecNombre(t.tecnicoId)}</span>
                        </div>
                      </td>
                      <td data-label="Estado">
                        <span className={`badge ${bc}`}>{t.estado}</span>
                        {estancado && <span className="badge badge-d" style={{ marginLeft: 4, fontSize: 10 }}>{diasSinMover}d</span>}
                      </td>
                      <td className="c-mono c-right" data-label="Total" style={{ fontWeight: 700 }}>{fmt(t.total)}</td>
                      <td className="c-mono c-muted" data-label="Fecha" style={{ fontSize: 12 }}>{fmtDate(t.fecha)}</td>
                      <td className="c-right td-actions">
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleEditar(t.id)}>Editar</button>
                          {t.otCodigo && <button className="btn btn-ghost btn-sm" onClick={() => imprimirOT(t)}>PDF</button>}
                          {t.estado !== ESTADOS.COMPLETADO && (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--green-600)' }} onClick={() => handleCompletar(t.id)}>✓</button>
                          )}
                          {confirmDel === t.id ? (
                            <>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-600)' }} onClick={() => handleEliminar(t.id)}>Si</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(null)}>No</button>
                            </>
                          ) : (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-500)' }} onClick={() => setConfirmDel(t.id)}>
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
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

      {/* Vista previa de una OT (al hacer clic) — antes de saltar a editar */}
      {previewId && (() => {
        const t = trabajos.find(x => x.id === previewId)
        if (!t) return null
        const tel = String(t.telefonoCliente || '').replace(/\D/g, '')
        const wa = tel.length === 10 ? `57${tel}` : tel
        return (
          <div className="modal-overlay" onClick={() => setPreviewId(null)}>
            <div className="modal" style={{ maxWidth: 470 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="modal-title" style={{ fontFamily: 'var(--mono)', color: 'var(--blue-600)' }}>{t.otCodigo || '—'} · {t.placa}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{t.cliente || 'Sin cliente'} · {[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</div>
                </div>
                <button className="icobtn" onClick={() => setPreviewId(null)} aria-label="Cerrar" style={{ flexShrink: 0 }}>✕</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${estadoBadge(t.estado)}`}>{t.estado}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtDate(t.fecha)}</span>
                </div>
                {tel && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg-subtle)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.cliente || 'Cliente'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{fmtTelefono(t.telefonoCliente)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <a href={`tel:${tel}`} className="btn btn-outline btn-sm" style={{ height: 32, padding: '0 12px' }}>Llamar</a>
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ height: 32, padding: '0 12px', background: 'var(--green-600)', color: '#fff' }}>WhatsApp</a>
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}><div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Técnico</div><div style={{ fontSize: 13, fontWeight: 600 }}>{tecNombre(t.tecnicoId)}</div></div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}><div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Total</div><div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(t.total)}</div></div>
                </div>
                {(t.items || []).length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Ítems</div>
                    {(t.items || []).slice(0, 8).map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
                        <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre || 'Ítem'}</span>
                        <span className="mono" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{fmt((parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 1))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {t.otCodigo && <button className="btn btn-outline btn-sm" onClick={() => imprimirOT(t)}>PDF</button>}
                {t.estado !== ESTADOS.COMPLETADO && <button className="btn btn-outline btn-sm" onClick={() => { handleCompletar(t.id); setPreviewId(null) }}>Marcar listo</button>}
                <button className="btn btn-primary btn-sm" onClick={() => { setPreviewId(null); handleEditar(t.id) }}>Editar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal auto-facturar */}
      {showFacturarModal && (
        <div className="modal-overlay" onClick={() => setShowFacturarModal(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Trabajo Completado</div>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, marginBottom: 8 }}>
                <strong>{showFacturarModal.placa}</strong> — {showFacturarModal.cliente || 'Sin cliente'}
              </p>
              <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                Total: <strong className="text-mono">{fmt(showFacturarModal.total)}</strong>
              </p>
              <p style={{ fontSize: 14 }}>Deseas facturar este trabajo en Cuentti?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowFacturarModal(null)}>Despues</button>
              <button className="btn btn-primary" onClick={() => {
                setShowFacturarModal(null)
                if (onAutoFacturar) onAutoFacturar(showFacturarModal)
                else notify('Ve a la pestana Cuentti para facturar', 'info')
              }}>Ir a Facturar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Chevron para secciones plegables
function Chevron({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, color: 'var(--text-3)', transition: 'transform .22s var(--ease)', transform: open ? 'rotate(180deg)' : 'none' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// ========================
// FORMULARIO DE TRABAJO
// ========================
function TrabajoForm({ trabajo, onSave, onCancel, allTrabajos = [], vehiculosHook }) {
  const isEdit = !!trabajo
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()
  const [campoActivo, setCampoActivo] = useState('cedula') // cuál campo de búsqueda de cliente está enfocado

  const [form, setForm] = useState({
    cedula: trabajo?.cedula || '',
    cliente: trabajo?.cliente || '',
    telefonoCliente: trabajo?.telefonoCliente || '',
    emailCliente: trabajo?.emailCliente || '',
    clienteId: trabajo?.clienteId || '',
    sinVehiculo: trabajo?.sinVehiculo || false,
    placa: trabajo?.placa || '',
    marca: trabajo?.marca || '',
    modelo: trabajo?.modelo || '',
    ano: trabajo?.ano || new Date().getFullYear(),
    kilometraje: trabajo?.kilometraje || '',
    tecnicoId: trabajo?.tecnicoId || '',
    observaciones: trabajo?.observaciones || '',
    // Mano de obra manual: solo se usa cuando NO hay líneas marcadas "Servicio"
    // (ej. cambio de aceite). Base para la comisión del técnico, no se cobra al cliente.
    manoObra: trabajo?.manoObra ? String(trabajo.manoObra) : '',
    estado: trabajo?.estado || ESTADOS.PENDIENTE,
    fecha: trabajo?.fecha ? trabajo.fecha.slice(0, 10) : hoyISO(),
    // Evidencias unificadas: TODAS las fotos del trabajo (antes/durante/después).
    // Migra datos viejos que estaban separados en ingreso/entrega a una sola lista.
    evidenciasIngreso: [...(trabajo?.evidenciasIngreso || []), ...(trabajo?.evidenciasEntrega || [])],
    evidenciasEntrega: [],
    // Próximo mantenimiento (opcional, para CRM)
    tipoAceite: trabajo?.tipoAceite || '',  // '' | 'mineral' | 'sintetico' | 'no_aplica'
    proximoKm: trabajo?.proximoKm || '',
    proximaVisita: trabajo?.proximaVisita ? trabajo.proximaVisita.slice(0, 10) : '',
    notasProximoMant: trabajo?.notasProximoMant || '',
  })

  const [items, setItems] = useState(trabajo?.items || [])
  // Secciones opcionales plegables: cerradas al crear, abiertas si ya traen datos (edición)
  const [showEvid, setShowEvid] = useState(
    (trabajo?.evidenciasIngreso?.length || 0) + (trabajo?.evidenciasEntrega?.length || 0) > 0
  )
  const [showMant, setShowMant] = useState(
    !!(trabajo?.tipoAceite || trabajo?.proximoKm || trabajo?.proximaVisita || trabajo?.notasProximoMant)
  )
  const addFotos = (campo, files) => {
    if (!files?.length) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        setForm(f => ({
          ...f,
          [campo]: [...(f[campo] || []), { id: uid(), nombre: file.name, dataUrl: reader.result, nota: '' }],
        }))
      }
      reader.readAsDataURL(file)
    })
  }

  const actualizarNotaFoto = (campo, id, nota) => {
    setForm(f => ({
      ...f,
      [campo]: f[campo].map(x => x.id === id ? { ...x, nota } : x),
    }))
  }

  const quitarFoto = (campo, id) => {
    setForm(f => ({ ...f, [campo]: f[campo].filter(x => x.id !== id) }))
  }

  // Inventario centralizado desde Cuentti (con cache + auto-refresh + estado)
  const {
    inventario,
    loading: invLoading,
    refreshing: invRefreshing,
    error: invError,
    cacheAge: invCacheAge,
    isStale: invIsStale,
    refresh: refrescarInventario,
  } = useInventario()
  const [itemSearch, setItemSearch] = useState({}) // { [itemId]: { query, results, show } }
  // Tick para que el "hace Xs" se actualice cada 10s sin re-fetch
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 10000)
    return () => clearInterval(id)
  }, [])

  // Debounce timers ref
  const searchTimers = useRef({})

  const buscarEnInventario = useCallback((itemId, query) => {
    // Clear previous debounce
    if (searchTimers.current[itemId]) clearTimeout(searchTimers.current[itemId])

    if (!query || query.length < 2) {
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results: [], show: false } }))
      return
    }

    // Debounce 150ms
    searchTimers.current[itemId] = setTimeout(() => {
      const q = query.toLowerCase().trim()
      const scored = []

      for (const p of inventario) {
        const nombre = (p.nombre || '').toLowerCase()
        const codigo = (p.codigo || '').toLowerCase()
        const sku = (p.sku || '').toLowerCase()
        const barras = (p.codigoBarras || '').toLowerCase()

        let score = 0
        // Exact match on code/sku/barcode = highest priority (POS scanner)
        if (codigo === q || sku === q || barras === q) score = 100
        // Starts with on code/sku
        else if (codigo.startsWith(q) || sku.startsWith(q) || barras.startsWith(q)) score = 80
        // Exact name match
        else if (nombre === q) score = 70
        // Name starts with query
        else if (nombre.startsWith(q)) score = 60
        // Name contains query (word boundary)
        else if (nombre.includes(' ' + q)) score = 50
        // Name contains query
        else if (nombre.includes(q)) score = 40
        // Code/sku contains query
        else if (codigo.includes(q) || sku.includes(q) || barras.includes(q)) score = 30
        else continue

        // Boost products with stock
        if (p.stock > 0) score += 5
        scored.push({ ...p, _score: score })
      }

      scored.sort((a, b) => b._score - a._score)
      const results = scored
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results, show: results.length > 0 } }))
    }, 150)
  }, [inventario])

  const seleccionarProducto = (itemId, producto) => {
    // Guardar el nombre original del producto del inventario por separado
    // para que la descripcion (item.nombre) sea editable libremente sin perder
    // la referencia al SKU. nombreInventario sirve para mostrar "Cambiar producto".
    updateItem(itemId, 'nombre', producto.nombre)
    updateItem(itemId, 'nombreInventario', producto.nombre)
    updateItem(itemId, 'precio', producto.precio)
    updateItem(itemId, 'iva', producto.iva)
    updateItem(itemId, 'codigo', producto.codigo || producto.sku || '')
    updateItem(itemId, 'sku', producto.sku || '')
    updateItem(itemId, 'esServicio', !!producto.esServicio)
    // _bloqueado evita que el siguiente onChange del input dispare otra busqueda
    updateItem(itemId, '_bloqueado', true)
    setItemSearch(prev => ({ ...prev, [itemId]: { query: '', results: [], show: false } }))
  }

  const cambiarProducto = (itemId) => {
    // Permite volver a buscar otro producto: limpia bloqueo y SKU
    updateItem(itemId, '_bloqueado', false)
    updateItem(itemId, 'nombreInventario', '')
    updateItem(itemId, 'sku', '')
    updateItem(itemId, 'codigo', '')
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const modelosTrabajo = useMemo(() => getModelos(form.marca), [form.marca])

  // Seleccionar cliente de resultados
  const seleccionarCliente = (c) => {
    const ced = normalizarDoc(c)
    set('cedula', ced)
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', fmtTelefono(c.telefono || c.phone || ''))
    set('emailCliente', c.email || c.correo || '')
    set('clienteId', c.id || '')
    setResultados([])
    cargarVehiculoDeCliente(ced)
  }

  // Trae el vehiculo mas reciente del cliente y precarga placa/marca/modelo/año/km
  // SOLO si esos campos estan vacios. Asi, al elegir un cliente que ya tiene carro
  // registrado, no toca volver a digitarlo. Fuentes: tabla de vehiculos (por cedula
  // del propietario) + trabajos anteriores del mismo cliente.
  const cargarVehiculoDeCliente = (cedula) => {
    if (!cedula) return
    const candidatos = []
    if (vehiculosHook?.buscarPorCedula) {
      for (const v of vehiculosHook.buscarPorCedula(cedula)) {
        if (v.placa) candidatos.push({ placa: v.placa, marca: v.marca, modelo: v.modelo, ano: v.ano, kilometraje: v.kilometraje, _t: v.actualizadoEn || v.creadoEn || 0 })
      }
    }
    for (const t of allTrabajos) {
      if ((t.cedula || '') === cedula && t.placa) {
        candidatos.push({ placa: t.placa, marca: t.marca, modelo: t.modelo, ano: t.ano, kilometraje: t.kilometraje, _t: t.fecha || t.creadoEn || 0 })
      }
    }
    if (!candidatos.length) return
    candidatos.sort((a, b) => (new Date(b._t).getTime() || 0) - (new Date(a._t).getTime() || 0))
    const v = candidatos[0]
    setForm(prev => ({
      ...prev,
      placa: prev.placa || (v.placa || '').toUpperCase(),
      marca: prev.marca || v.marca || '',
      modelo: prev.modelo || v.modelo || '',
      ano: prev.ano || v.ano || prev.ano,
      kilometraje: prev.kilometraje || v.kilometraje || '',
    }))
  }

  // Items
  const addItem = () => {
    setItems(prev => [...prev, {
      id: uid(), codigo: '', nombre: '', precio: 0, cantidad: 1, iva: IVA_DEFAULT, esServicio: false,
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
    let subtotal = 0, iva = 0, total = 0, manoObra = 0, repuestos = 0
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
      if (i.esServicio) manoObra += lineaTotal
      else repuestos += lineaTotal
    })
    return {
      subtotal: Math.round(subtotal),
      iva: Math.round(iva),
      total: Math.round(total),
      manoObra: Math.round(manoObra),
      repuestos: Math.round(repuestos),
    }
  }, [items])

  // Mano de obra efectiva (base de la comisión del técnico):
  //  - Si hay líneas marcadas "Servicio", manda esa suma (igual que siempre).
  //  - Si no hay (ej. cambio de aceite), se usa la mano de obra escrita a mano.
  const hayServicios = totales.manoObra > 0
  const manoObraEf = hayServicios ? totales.manoObra : Math.max(0, parseFloat(form.manoObra) || 0)
  const comisionTecnico = Math.round(manoObraEf * COMISION.TOTAL)

  const handleSubmit = (e) => {
    e.preventDefault()
    if ((!form.placa && !form.sinVehiculo) || !form.cliente) return
    onSave({
      ...form,
      placa: (form.placa || (form.sinVehiculo ? 'SERVICIO' : '')).toUpperCase(),
      ano: parseInt(form.ano) || new Date().getFullYear(),
      kilometraje: parseInt(form.kilometraje) || 0,
      tecnicoId: parseInt(form.tecnicoId) || null,
      items,
      subtotalSinIva: totales.subtotal,
      totalIva: totales.iva,
      total: totales.total,
      manoObra: manoObraEf,
      repuestos: totales.repuestos,
      estado: form.estado || trabajo?.estado || ESTADOS.PENDIENTE,
      fecha: new Date(form.fecha + 'T12:00:00').toISOString(),
      evidenciasIngreso: form.evidenciasIngreso,
      evidenciasEntrega: form.evidenciasEntrega,
      // Próximo mantenimiento (CRM)
      tipoAceite: form.tipoAceite || null,
      proximoKm: form.proximoKm ? parseInt(form.proximoKm) : null,
      proximaVisita: form.proximaVisita ? new Date(form.proximaVisita + 'T12:00:00').toISOString() : null,
      notasProximoMant: form.notasProximoMant || '',
    })
  }

  // Auto-calcular próximo km y fecha cuando cambia el tipo de aceite
  const setTipoAceite = (tipo) => {
    setForm(f => {
      const kmActual = parseInt(f.kilometraje) || 0
      let proximoKm = f.proximoKm
      let proximaVisita = f.proximaVisita
      if (tipo === 'mineral' && kmActual > 0) {
        proximoKm = kmActual + 5000
      } else if (tipo === 'sintetico' && kmActual > 0) {
        proximoKm = kmActual + 10000
      }
      // Calcular fecha estimada
      if (tipo === 'mineral') {
        const d = new Date()
        d.setMonth(d.getMonth() + 4)
        proximaVisita = d.toISOString().slice(0, 10)
      } else if (tipo === 'sintetico') {
        const d = new Date()
        d.setMonth(d.getMonth() + 6)
        proximaVisita = d.toISOString().slice(0, 10)
      }
      return { ...f, tipoAceite: tipo, proximoKm: String(proximoKm || ''), proximaVisita }
    })
  }

  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>{isEdit ? 'Editar Trabajo' : 'Nuevo Trabajo'}</h2>
          {isEdit && trabajo && (
            <div className="pagehd__meta">
              {trabajo.otCodigo && <span className="pagehd__ot">{trabajo.otCodigo}</span>}
              {trabajo.fecha && <><span className="pagehd__sep">·</span><span>Creado {fmtDate(trabajo.fecha)}</span></>}
              {trabajo.estado && <><span className="pagehd__sep">·</span><span className={`badge ${
                trabajo.estado === ESTADOS.COMPLETADO ? 'badge-success' :
                trabajo.estado === ESTADOS.EN_PROGRESO ? 'badge-info' :
                trabajo.estado === ESTADOS.PENDIENTE ? 'badge-warning' :
                'badge-neutral'
              }`}>{trabajo.estado}</span></>}
            </div>
          )}
        </div>
        <div className="actions"><button className="btn btn-outline" onClick={onCancel}>Volver</button></div>
      </div>

      <form onSubmit={handleSubmit} className="form-stack">
        {/* CLIENTE + VEHICULO en 2 columnas */}
        <div className="form-grid-2">
        {/* CLIENTE */}
        <div className="card">
          <div className="card__h"><h3>Cliente</h3></div>
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field" style={{ position: 'relative' }}>
              <label>Cedula / NIT <span className="req">*</span></label>
              <input className="input" value={form.cedula} placeholder="Buscar por documento..."
                onFocus={() => setCampoActivo('cedula')}
                onChange={e => { set('cedula', e.target.value); buscarDebounced(e.target.value) }} />
              {resultados.length > 0 && campoActivo === 'cedula' && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                  {resultados.map((c, i) => (
                    <div key={i} onClick={() => seleccionarCliente(c)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <strong>{normalizarDoc(c)}</strong> — {normalizarNombre(c)}
                      {c.telefono && <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>{fmtTelefono(c.telefono)}</span>}
                    </div>
                  ))}
                </div>
              )}
              {buscando && <span className="help">Buscando en Cuentti...</span>}
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>Nombre del Cliente</label>
              <input className="input" value={form.cliente} required placeholder="Nombre o documento..."
                onFocus={() => setCampoActivo('nombre')}
                onChange={e => { set('cliente', e.target.value); buscarDebounced(e.target.value) }} />
              {resultados.length > 0 && campoActivo === 'nombre' && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                  {resultados.map((c, i) => (
                    <div key={i} onMouseDown={() => seleccionarCliente(c)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <strong>{normalizarNombre(c)}</strong> <span style={{ color: 'var(--text-3)' }}>· {normalizarDoc(c)}</span>
                      {c.telefono && <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>{fmtTelefono(c.telefono)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Telefono</label>
              <input className="input" value={form.telefonoCliente} placeholder="300..." onChange={e => set('telefonoCliente', e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.emailCliente} placeholder="email@..." onChange={e => set('emailCliente', e.target.value)} />
            </div>
          </div>
        </div>

        {/* VEHICULO */}
        <div className="card">
          <div className="card__h" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h3>Vehiculo</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
              <Switch checked={!!form.sinVehiculo} onChange={v => set('sinVehiculo', v)} ariaLabel="Servicio sin vehículo" />
              <span style={{ cursor: 'pointer' }} onClick={() => set('sinVehiculo', !form.sinVehiculo)}>Servicio sin vehículo (no entra carro)</span>
            </div>
          </div>
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {form.sinVehiculo && (
              <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>
                Servicio sin vehículo: no se piden placa ni datos del carro. Elige el técnico que lo hizo y agrega los ítems abajo.
              </div>
            )}
            <div className="field">
              <label>Placa {!form.sinVehiculo && <span className="req">*</span>}</label>
              <input className="input" value={form.placa} required={!form.sinVehiculo} disabled={form.sinVehiculo} placeholder={form.sinVehiculo ? 'No aplica' : 'ABC123'} style={{ textTransform: 'uppercase' }}
                onChange={e => {
                  const placa = e.target.value.toUpperCase()
                  set('placa', placa)
                  if (placa.length >= 6) {
                    const prev = allTrabajos.find(t => (t.placa || '').toUpperCase() === placa && t.id !== trabajo?.id)
                    if (prev) {
                      if (!form.marca && prev.marca) set('marca', prev.marca)
                      if (!form.modelo && prev.modelo) set('modelo', prev.modelo)
                      if (!form.cliente && prev.cliente) set('cliente', prev.cliente)
                      if (!form.cedula && prev.cedula) set('cedula', prev.cedula)
                      if (!form.telefonoCliente && prev.telefonoCliente) set('telefonoCliente', prev.telefonoCliente)
                    }
                  }
                }} />
            </div>
            <div className="field">
              <label>Marca {!form.sinVehiculo && <span className="req">*</span>}</label>
              <select className="input" value={form.marca} required={!form.sinVehiculo} disabled={form.sinVehiculo} onChange={e => { set('marca', e.target.value); set('modelo', '') }}>
                <option value="">Seleccionar...</option>
                {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Modelo</label>
              <select className="input" value={form.modelo} onChange={e => set('modelo', e.target.value)} disabled={form.sinVehiculo || !form.marca}>
                <option value="">Seleccionar...</option>
                {modelosTrabajo.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Año</label>
              <input className="input" type="number" value={form.ano} min="1980" max="2030" disabled={form.sinVehiculo} onChange={e => set('ano', e.target.value)} />
            </div>
            <div className="field">
              <label>Kilometraje</label>
              <input className="input" type="number" value={form.kilometraje} min="0" placeholder="45000" disabled={form.sinVehiculo} onChange={e => set('kilometraje', e.target.value)} />
            </div>
            <div className="field">
              <label>Técnico</label>
              <select className="input" value={form.tecnicoId} onChange={e => set('tecnicoId', e.target.value)}>
                <option value="">Seleccionar</option>
                {TECNICOS.filter(t => t.activo !== false || t.id === parseInt(form.tecnicoId)).map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}{t.activo === false ? ' (inactivo)' : ''}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        </div>{/* /form-grid-2 */}

        {/* HISTORIAL POR PLACA */}
        {form.placa.length >= 6 && (() => {
          const historial = allTrabajos.filter(t =>
            (t.placa || '').toUpperCase() === form.placa.toUpperCase() && t.id !== trabajo?.id
          ).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
          if (!historial.length) return null
          return (
            <div className="card" style={{ borderColor: 'rgba(37,99,235,.28)', background: 'rgba(37,99,235,.04)' }}>
              <div className="card-title" style={{ color: 'var(--blue-700)' }}>Historial de {form.placa.toUpperCase()} ({historial.length} trabajos anteriores)</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>OT</th>
                      <th>Estado</th>
                      <th>Tecnico</th>
                      <th className="text-right">Total</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.slice(0, 5).map(h => (
                      <tr key={h.id}>
                        <td className="text-mono text-sm">{h.otCodigo || '—'}</td>
                        <td><span className={`badge ${h.estado === 'Completado' ? 'badge-success' : 'badge-warning'}`}>{h.estado}</span></td>
                        <td className="text-sm">{TECNICOS.find(t => t.id === parseInt(h.tecnicoId))?.nombre || '—'}</td>
                        <td className="text-right text-mono">{fmt(h.total)}</td>
                        <td className="text-sm text-muted">{fmtDate(h.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* EVIDENCIAS */}
        <div className="card">
          <button type="button" className="card__h card__h--toggle" onClick={() => setShowEvid(v => !v)}>
            <h3>Evidencias del trabajo
              {form.evidenciasIngreso.length > 0 && (
                <span className="sec-count">{form.evidenciasIngreso.length}</span>
              )}
            </h3>
            <Chevron open={showEvid} />
          </button>
          {showEvid && (
          <div className="card__b">
            <div className="field">
              <label>Fotos de la orden de trabajo</label>
              <span className="help">Todas las que necesites: cómo llega el vehículo, durante la reparación, daños, repuestos cambiados y la entrega final.</span>
              <input type="file" accept="image/*" multiple onChange={e => addFotos('evidenciasIngreso', e.target.files)} />
              <ThumbGrid fotos={form.evidenciasIngreso} onNota={(id, nota) => actualizarNotaFoto('evidenciasIngreso', id, nota)} onRemove={id => quitarFoto('evidenciasIngreso', id)} />
            </div>
          </div>
          )}
        </div>

        {/* ITEMS */}
        <div className="card">
          <div className="card__h" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ flex: '0 0 auto' }}>Repuestos y Servicios {invLoading
              ? <span className="count">Cargando...</span>
              : (invError && inventario.length === 0)
                ? <button type="button" className="count" onClick={refrescarInventario} style={{ cursor: 'pointer', background: 'rgba(220,38,38,.1)', color: 'var(--red-700,#b91c1c)', border: '1px solid rgba(220,38,38,.3)' }}>⚠ No cargó · Reintentar</button>
                : <span className="count">{inventario.length} productos</span>
            }</h3>
            {/* Indicador del estado del inventario Cuentti */}
            {!invLoading && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11.5, color: 'var(--text-3)',
                padding: '4px 10px', borderRadius: 999,
                background: invIsStale ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.10)',
                border: `1px solid ${invIsStale ? 'rgba(245,158,11,.4)' : 'rgba(34,197,94,.3)'}`,
              }} title={`Inventario sincronizado con Cuentti ${formatCacheAge(invCacheAge)}${invIsStale ? ' (recomendado refrescar)' : ''}`}>
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: invRefreshing ? 'var(--blue-500)' : (invIsStale ? 'var(--amber-500)' : 'var(--green-500)'),
                  animation: invRefreshing ? 'pulse 1s infinite' : 'none',
                }} />
                <span style={{ fontWeight: 600 }}>
                  {invRefreshing ? 'Sincronizando…' : `Cuentti ${formatCacheAge(invCacheAge)}`}
                </span>
                <button type="button"
                  onClick={refrescarInventario}
                  disabled={invRefreshing}
                  style={{ background: 'none', border: 'none', color: 'var(--blue-600)', cursor: 'pointer', fontWeight: 700, padding: 0, fontSize: 11.5 }}>
                  ↻ Refrescar
                </button>
              </div>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={addItem} style={{ marginLeft: 'auto' }}>+ Agregar linea</button>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13.5 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .55 }}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              <div style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: 14 }}>Sin repuestos ni servicios</div>
              <div style={{ marginTop: 5, fontSize: 13 }}>Usa el botón <strong>+ Agregar línea</strong> para añadir ítems.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Descripcion</th>
                    <th style={{ width: '15%' }}>Precio</th>
                    <th style={{ width: '10%' }}>Cant.</th>
                    <th style={{ width: '10%' }}>IVA %</th>
                    <th style={{ width: '10%' }}>Servicio</th>
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
                          <div style={{ position: 'relative' }}>
                            <input className="form-input" value={item.nombre} placeholder={item._bloqueado ? 'Edita la descripcion libremente...' : 'Producto, código o referencia...'}
                              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name={`it-desc-${item.id}`}
                              onChange={e => {
                                updateItem(item.id, 'nombre', e.target.value)
                                // Solo dispara busqueda si el item NO ha sido bloqueado por una seleccion previa
                                if (!item._bloqueado) buscarEnInventario(item.id, e.target.value)
                              }}
                              onFocus={() => {
                                if (!item._bloqueado && item.nombre && item.nombre.length >= 2) buscarEnInventario(item.id, item.nombre)
                              }}
                              onBlur={() => setTimeout(() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } })), 250)}
                              onKeyDown={e => {
                                if (e.key === 'Escape') setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))
                              }}
                              style={{ padding: '6px 32px 6px 10px', fontSize: 13 }} />
                            {invLoading && !item._bloqueado && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#999' }}>...</span>}
                            {item._bloqueado && (
                              <button type="button" onClick={() => cambiarProducto(item.id)}
                                title={`Cambiar producto (actual: ${item.nombreInventario || item.sku || 'sin SKU'})`}
                                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--blue-600)', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}>
                                🔄
                              </button>
                            )}
                          </div>
                          {item._bloqueado && item.sku && (
                            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                              SKU: {item.sku}{item.nombreInventario && item.nombreInventario !== item.nombre ? ` · ${item.nombreInventario}` : ''}
                            </div>
                          )}
                          {/* Command Palette — Product Search */}
                          {searchState?.show && searchState.results.length > 0 && (
                            <div className="cmd-backdrop" onClick={() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>
                              <div className="cmd-palette" onClick={e => e.stopPropagation()}>
                                {/* Search header */}
                                <div className="cmd-header">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                                  </svg>
                                  <span className="cmd-header__query">{searchState.query}</span>
                                  <span className="cmd-header__count">
                                    <strong>{searchState.results.length}</strong> resultados
                                    {(form.marca || form.modelo) && <> &middot; {form.marca} {form.modelo} {form.ano}</>}
                                  </span>
                                  <kbd className="cmd-kbd" onClick={() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>ESC</kbd>
                                </div>

                                {/* Results */}
                                <div className="cmd-results">
                                  {searchState.results.map((p, i) => {
                                    const q = (searchState.query || '').toLowerCase()
                                    const nombre = p.nombre || ''
                                    const idx = nombre.toLowerCase().indexOf(q)
                                    return (
                                      <div key={p.id} className="cmd-row"
                                        onClick={() => seleccionarProducto(item.id, p)}>
                                        <div className="cmd-row__info">
                                          <div className="cmd-row__name">
                                            {idx >= 0 && q.length >= 2
                                              ? <>{nombre.slice(0, idx)}<mark>{nombre.slice(idx, idx + q.length)}</mark>{nombre.slice(idx + q.length)}</>
                                              : nombre}
                                          </div>
                                          <div className="cmd-row__meta">
                                            {p.codigoBarras && <span>Cod: {p.codigoBarras}</span>}
                                            {p.sku && <span>SKU: {p.sku}</span>}
                                            {(!p.codigoBarras && !p.sku && p.codigo) && <span>Ref: {p.codigo}</span>}
                                            {p.precioBase > 0 && <><span>&middot;</span><span>Base: {fmt(p.precioBase)}</span></>}
                                            {p.iva > 0 && <><span>&middot;</span><span>IVA {p.iva}%</span></>}
                                          </div>
                                        </div>
                                        <div className="cmd-row__price">
                                          <div className="cmd-row__price-val">{fmt(p.precio)}</div>
                                          <div className="cmd-row__price-lbl">P. venta</div>
                                        </div>
                                        <div className="cmd-row__stock">
                                          <span className={`badge ${p.esServicio ? 'badge-info' : p.stock > 3 ? 'badge-success' : p.stock > 0 ? 'badge-warning' : 'badge-danger'}`}
                                            style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                                            {p.esServicio ? 'Servicio' : `${p.stock} und`}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                {/* Footer shortcuts */}
                                <div className="cmd-footer">
                                  <span><kbd className="cmd-kbd-sm">&uarr;&darr;</kbd> navegar</span>
                                  <span><kbd className="cmd-kbd-sm">&crarr;</kbd> seleccionar</span>
                                  <span style={{ marginLeft: 'auto', opacity: .7 }}>Inventario sincronizado con Cuentti</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          <input className="form-input" type="number" value={Math.round(parseFloat(item.precio) || 0)} min="0"
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
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={!!item.esServicio}
                            onChange={e => updateItem(item.id, 'esServicio', e.target.checked)}
                            title="Marcar como mano de obra / servicio"
                          />
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

          {/* MANO DE OBRA MANUAL — solo cuando no hay línea marcada "Servicio" (ej. cambio de aceite) */}
          {!hayServicios && (
            <div className="mo-manual">
              <div className="mo-manual__row">
                <div className="field" style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <label htmlFor="mo-manual-input">Mano de obra del técnico <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>(opcional)</span></label>
                  <input id="mo-manual-input" className="input" type="number" min="0" inputMode="numeric"
                    value={form.manoObra} onChange={e => set('manoObra', e.target.value)} placeholder="0" />
                </div>
                <div className="mo-manual__com">
                  <span className="mo-manual__com-lbl">Comisión técnico ({COMISION.TOTAL * 100}%)</span>
                  <span className="mo-manual__com-val">{fmt(comisionTecnico)}</span>
                </div>
              </div>
              <span className="help">Para servicios sin mano de obra cobrada aparte (ej. cambio de aceite). No se le suma al total del cliente; solo define cuánto se le liquida al técnico.</span>
            </div>
          )}

          {/* Totales — totalizer redesigned (M.O./Repuestos breakdown + Total destacado) */}
          <div className="ot-totals">
            <div className="ot-totals__group">
              <span className="ot-stat"><span className="ot-stat__lbl">M.O.</span><span className="ot-stat__val">{fmt(manoObraEf)}</span></span>
              <span className="ot-stat"><span className="ot-stat__lbl">Repuestos</span><span className="ot-stat__val">{fmt(totales.repuestos)}</span></span>
            </div>
            <div className="ot-totals__group">
              <span className="ot-stat"><span className="ot-stat__lbl">Subtotal</span><span className="ot-stat__val">{fmt(totales.subtotal)}</span></span>
              <span className="ot-stat"><span className="ot-stat__lbl">IVA</span><span className="ot-stat__val">{fmt(totales.iva)}</span></span>
              <span className="ot-stat ot-stat--big"><span className="ot-stat__lbl">Total</span><span className="ot-stat__val">{fmt(totales.total)}</span></span>
            </div>
          </div>
        </div>

        {/* PROXIMO MANTENIMIENTO (opcional, alimenta CRM) */}
        <div className="card">
          <button type="button" className="card__h card__h--toggle" onClick={() => setShowMant(v => !v)}>
            <h3>Próximo mantenimiento <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginLeft: 6 }}>(opcional · alimenta CRM)</span></h3>
            <Chevron open={showMant} />
          </button>
          {showMant && (
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Tipo de aceite usado en este servicio</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  ['', 'Sin especificar'],
                  ['mineral', 'Mineral / Semisintético (5,000 km)'],
                  ['sintetico', 'Full sintético (10,000 km)'],
                  ['no_aplica', 'No se cambió aceite'],
                ].map(([val, lbl]) => (
                  <label key={val || 'none'} style={{
                    flex: '1 1 200px',
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                    border: `1.5px solid ${form.tipoAceite === val ? 'var(--blue-600)' : 'var(--border)'}`,
                    background: form.tipoAceite === val ? 'var(--blue-50,#eff6ff)' : 'var(--bg-raised)',
                    borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  }}>
                    <input type="radio" name="tipoAceite" value={val} checked={form.tipoAceite === val}
                      onChange={() => setTipoAceite(val)} style={{ margin: 0 }} />
                    {lbl}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Si no eliges nada, el CRM detecta el tipo automáticamente leyendo los items facturados.
              </div>
            </div>
            <div className="field">
              <label>Próximo cambio (km)</label>
              <input className="input" type="number" value={form.proximoKm}
                onChange={e => set('proximoKm', e.target.value)}
                placeholder={form.kilometraje ? `Sugerido: ${(parseInt(form.kilometraje) || 0) + 5000}` : 'Ej: 95000'} />
            </div>
            <div className="field">
              <label>Próxima visita estimada</label>
              <input className="input" type="date" value={form.proximaVisita} onChange={e => set('proximaVisita', e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Notas para el próximo servicio (opcional)</label>
              <input className="input" value={form.notasProximoMant}
                onChange={e => set('notasProximoMant', e.target.value)}
                placeholder="Ej: revisar pastillas, alineación pendiente..." />
            </div>
          </div>
          )}
        </div>

        {/* OBSERVACIONES */}
        <div className="card">
          <div className="card__h"><h3>Observaciones</h3></div>
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr 1fr' : '1fr', gap: 14 }}>
            <div className="field">
              <label>Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
            </div>
            {isEdit && (
              <div className="field">
                <label>Estado</label>
                <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}>
                  {Object.values(ESTADOS).map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Diagnostico / Notas</label>
              <textarea className="input" value={form.observaciones} placeholder="Diagnostico, notas, recomendaciones..."
                onChange={e => set('observaciones', e.target.value)} style={{ minHeight: 88, resize: 'vertical' }} />
            </div>
          </div>
        </div>

        {/* ACCIONES */}
        <div className="form-actionbar">
          <div className="form-actionbar__total">
            <span className="lbl">Total OT</span>
            <span className="val">{fmt(totales.total)}</span>
          </div>
          <div className="form-actionbar__btns">
            <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{isEdit ? 'Actualizar OT' : `Guardar OT · ${fmt(totales.total)}`}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

function ThumbGrid({ fotos = [], onNota, onRemove }) {
  if (!fotos.length) return null
  return (
    <div className="thumb-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8, marginTop: 10 }}>
      {fotos.map(fv => (
        <div key={fv.id} style={{ border: '1px solid var(--slate-200)', borderRadius: 8, padding: 6 }}>
          <div style={{ position: 'relative', paddingBottom: '70%', overflow: 'hidden', borderRadius: 6, marginBottom: 6 }}>
            <img src={fv.dataUrl} alt={fv.nombre} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <input className="form-input text-xs" placeholder="Nota breve" value={fv.nota || ''}
            onChange={e => onNota?.(fv.id, e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove?.(fv.id)} style={{ width: '100%', marginTop: 4 }}>Eliminar</button>
        </div>
      ))}
    </div>
  )
}
