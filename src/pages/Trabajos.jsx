import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre, fmtTelefono } from '../utils/helpers'
import { TECNICOS, ESTADOS, IVA_DEFAULT, DIAS_ESTANCADO, TALLER, COMISION } from '../utils/constants'
import { loadLogo as loadPdfLogo, drawHeader, drawSectionHeader, drawDataBlock, drawTotalsBox, drawSignatures, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS } from '../utils/pdfTheme'
import FichaTecnico from '../components/FichaTecnico'
import IngresoVehiculo from '../components/IngresoVehiculo'
import { ingresoVacio, labelInventario, etiquetaCombustible, ingresoTieneAlgo } from '../utils/ingreso'
import { exportarFichasTecnico } from '../utils/fichaPdf'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { useClientes } from '../hooks/useClientes'
import { useInventario, formatCacheAge } from '../hooks/useInventario'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { subirVideoEvidencia, borrarVideoEvidencia } from '../services/supabase'
import Switch from '../components/Switch'
import MoneyInput from '../components/MoneyInput'
import SignaturePad from '../components/SignaturePad'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, Badge, IconX, IconEdit, IconTrash, IconPdf, IconPhone, IconChat, IconCheck } from '../components/ui'

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

// Opciones de cilindraje del motor (litros): 0.8 a 5.0 en pasos de 0.1
const CILINDRAJES = Array.from({ length: 43 }, (_, i) => (0.8 + i * 0.1).toFixed(1))

// Etiqueta de tipo de servicio derivada de los ítems/diagnóstico de la OT (Kanban)
const SERVICIO_TAGS = [
  { re: /aceite|filtro|lubric/i, label: 'Aceite', color: '#f59e0b' },
  { re: /freno|pastilla|banda|disco|zapata/i, label: 'Frenos', color: '#2563eb' },
  { re: /aline|balance|suspensi|amortigua|r[oó]tula|terminal|barra estab/i, label: 'Suspensión', color: '#16a34a' },
  { re: /sincron|diagn|escan|scanner|el[eé]ctric|fusible|bater|luz|luces|sensor|bobina|buj[ií]a/i, label: 'Eléctrico', color: '#7c3aed' },
  { re: /llanta|neum|\brin\b|caucho/i, label: 'Llantas', color: '#db2777' },
  { re: /motor|distribuci|correa|empaque|culata|inyect|clutch|embrague|caja/i, label: 'Motor', color: '#ea580c' },
  { re: /lavado|detail|pulido|polichad/i, label: 'Lavado', color: '#0891b2' },
]
function tipoServicio(t) {
  const txt = ((t?.items || []).map(i => i?.nombre || '').join(' ') + ' ' + (t?.diagnostico || t?.observaciones || '')).toLowerCase()
  for (const s of SERVICIO_TAGS) if (s.re.test(txt)) return s
  if (t?.tipoAceite && t.tipoAceite !== 'no_aplica') return SERVICIO_TAGS[0]
  return null
}

export default function Trabajos({ hook, vehiculosHook, clientesHook, notify, onAutoFacturar }) {
  const { trabajos, agregarTrabajo, actualizarTrabajo, eliminarTrabajo, puedeCrearOT } = hook
  const [vista, setVista] = useState('lista') // lista | nuevo | editar | kanban
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmCfg, setConfirmCfg] = useState(null) // diálogo de confirmación (cockpit)
  // Cockpit desktop: trabajo seleccionado para el panel de detalle (solo ≥1200px)
  const [selId, setSelId] = useState(null)
  const [previewId, setPreviewId] = useState(null) // vista previa de una OT (modal) antes de editar
  const [fichaId, setFichaId] = useState(null) // OT abierta en la Ficha del técnico
  const [firmando, setFirmando] = useState(false) // capturando firma del cliente en la vista previa
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
      // Soltar en "Completados" debe ofrecer facturar, igual que "Marcar listo":
      // antes el kanban solo cambiaba el estado y no aparecía la opción de factura.
      if (estado === ESTADOS.COMPLETADO) { handleCompletar(id); return }
      actualizarTrabajo(id, { estado })
      notify?.(`${t.otCodigo || 'OT'} → ${estado}`, 'info')
    }
  }

  // Filtros
  // Default: 'activos' = todos los que NO estan terminados (Completado/Cancelado).
  // Asi al abrir Trabajos solo ves los que estan en proceso, no los ya cerrados.
  // Los filtros se RECUERDAN entre navegaciones/recargas (localStorage). La
  // búsqueda de texto (filtroBusqueda) se deja transitoria a propósito.
  const [filtroEstado, setFiltroEstado] = useState(() => lsGet('mda:trab_estado', 'activos'))
  const [filtroTecnico, setFiltroTecnico] = useState(() => lsGet('mda:trab_tecnico', 'todos'))
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  // Filtro de fecha de la LISTA (el kanban siempre muestra todo el trabajo activo).
  // Por defecto 'hoy' → al abrir Trabajos solo se ven las OT del día.
  const [filtroFecha, setFiltroFecha] = useState(() => lsGet('mda:trab_fecha', 'hoy'))
  useEffect(() => {
    lsSet('mda:trab_estado', filtroEstado); lsSet('mda:trab_tecnico', filtroTecnico); lsSet('mda:trab_fecha', filtroFecha)
  }, [filtroEstado, filtroTecnico, filtroFecha])

  // Base: aplica técnico + búsqueda + fecha, pero NO el estado (así se cuenta cuántos
  // hay en cada estado para los chips, y los conteos siempre cuadran con la lista).
  const baseFiltrado = useMemo(() => {
    let list = [...trabajos]
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
    return list
  }, [trabajos, filtroTecnico, filtroBusqueda, filtroFecha, vista])

  const filtered = useMemo(() => {
    let list = baseFiltrado
    if (filtroEstado === 'activos') {
      // Activos = todo lo que NO esta cerrado
      list = list.filter(t => t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO)
    } else if (filtroEstado !== 'todos') {
      list = list.filter(t => t.estado === filtroEstado)
    }
    return [...list].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [baseFiltrado, filtroEstado])

  // Conteos por estado para los chips de las pestañas.
  const conteos = useMemo(() => {
    const c = { activos: 0, todos: baseFiltrado.length }
    for (const t of baseFiltrado) {
      if (t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO) c.activos++
      c[t.estado] = (c[t.estado] || 0) + 1
    }
    return c
  }, [baseFiltrado])

  // KPIs del encabezado: cuentan sobre la lista FILTRADA (la misma que se ve abajo),
  // para que cambien al aplicar búsqueda/estado/técnico/fecha.
  const stats = useMemo(() => {
    const total = filtered.length
    const comp = filtered.filter(t => t.estado === ESTADOS.COMPLETADO).length
    const pend = filtered.filter(t => t.estado === ESTADOS.PENDIENTE).length
    const prog = filtered.filter(t => t.estado === ESTADOS.EN_PROGRESO).length
    return { total, comp, pend, prog }
  }, [filtered])

  const tecNombre = (id) => TECNICOS.find(t => t.id === parseInt(id))?.nombre || '—'

  const [showFacturarModal, setShowFacturarModal] = useState(null)

  const handleCompletar = async (id) => {
    await actualizarTrabajo(id, { estado: ESTADOS.COMPLETADO })
    notify('Trabajo marcado como completado', 'success')
    // Ofrecer facturar. Se construye el objeto con el estado YA completado (no el
    // snapshot viejo del closure `trabajos`, que aún lo tiene sin completar).
    const t = trabajos.find(x => x.id === id)
    if (t) setShowFacturarModal({ ...t, estado: ESTADOS.COMPLETADO })
  }

  const handleEliminar = async (id) => {
    const t = trabajos.find(x => x.id === id)
    const videos = (t?.evidenciasIngreso || []).filter(e => e?.tipo === 'video')
    // ELIMINAR primero (soft-delete: deleted=true) y LUEGO borrar los videos del
    // bucket: el endpoint solo borra archivos no referenciados por trabajos activos.
    await eliminarTrabajo(id)
    videos.forEach(v => { borrarVideoEvidencia(v) }) // silencioso, no bloquea
    setConfirmDel(null)
    notify('Trabajo eliminado', 'info')
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
    // Próximo cambio de aceite: usa lo registrado, o lo sugiere si ES cambio de
    // aceite (km actual + intervalo: sintético 10.000 · resto 5.000). Se muestra
    // como un dato más del vehículo (no como tarjeta resaltada).
    let proxKm = parseInt(t.proximoKm) || 0
    let proxFechaCorta = ''
    if (t.proximaVisita) {
      const dpv = new Date(t.proximaVisita)
      if (!Number.isNaN(dpv.getTime())) proxFechaCorta = dpv.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })
    }
    if (!proxKm && t.kilometraje) {
      const nombresItems = (t.items || []).map(i => (i.nombre || '').toLowerCase()).join(' ')
      const esCambioAceite = (t.tipoAceite && t.tipoAceite !== 'no_aplica') || nombresItems.includes('aceite')
      if (esCambioAceite) {
        const intervalo = t.tipoAceite === 'sintetico' ? 10000 : 5000
        proxKm = (parseInt(t.kilometraje) || 0) + intervalo
      }
    }
    const proxCambioVal = [proxKm > 0 ? `${proxKm.toLocaleString('es-CO')} km` : '', proxFechaCorta].filter(Boolean).join(' · ')
    const vehFields = [
      { label: 'Placa', value: (t.placa || '').toUpperCase(), bold: true },
      { label: 'Marca', value: t.marca },
      { label: 'Modelo', value: t.modelo },
      { label: 'Año', value: String(t.ano || '—') },
      { label: 'Cilindraje', value: t.cilindraje || '—' },
      { label: 'Kilometraje', value: t.kilometraje ? `${Number(t.kilometraje).toLocaleString('es-CO')} km` : '—' },
      { label: 'Técnico', value: tecNombre(t.tecnicoId) },
    ]
    if (proxCambioVal) vehFields.push({ label: 'Próx. cambio', value: proxCambioVal })
    cursorY = drawDataBlock(doc, vehFields, cursorY)
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

    // ============= ESTADO DE INGRESO DEL VEHÍCULO =============
    // Registro de responsabilidad: combustible, daños visibles e inventario recibido.
    if (ingresoTieneAlgo(t.ingreso)) {
      const ing = t.ingreso
      const presentes = (ing.inventario || []).map(labelInventario)
      const partes = []
      if (ing.combustible != null) partes.push(`Combustible: ${etiquetaCombustible(ing.combustible)}.`)
      if (ing.estado && ing.estado.trim()) partes.push(`Danos/estado: ${ing.estado.trim()}.`)
      partes.push(`Inventario recibido: ${presentes.length ? presentes.join(', ') : 'ninguno marcado'}.`)
      cursorY = drawSectionHeader(doc, 'Estado de ingreso del vehiculo', cursorY)
      const inLines = doc.splitTextToSize(partes.join('   '), CONTENT_W - 6)
      const inH = Math.max(11, inLines.length * 3.8 + 6)
      doc.setDrawColor(...SLATE_300)
      doc.setLineWidth(0.2)
      doc.rect(MARGIN, cursorY, CONTENT_W, inH)
      doc.setFontSize(8)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'normal')
      doc.text(inLines, MARGIN + 3, cursorY + 4.5)
      cursorY += inH + 3
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
              doc.text(`Codigo ${sku}`, data.cell.x + 3, data.cell.y + data.cell.height - 2)
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

    // Firma digital del cliente embebida sobre la línea de "Recibido por (cliente)"
    if (t.firmaCliente) {
      try {
        const blockW = CONTENT_W / 2
        const imgW = blockW - 12
        const imgH = 15
        doc.addImage(t.firmaCliente, 'PNG', MARGIN + 2, firmaY - imgH - 1, imgW, imgH, undefined, 'FAST')
      } catch { /* firma inválida: se ignora */ }
    }

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
        notify={notify}
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
                cilindraje: data.cilindraje || '',
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
            const videosAntes = [...(trabajo?.evidenciasIngreso || []), ...(trabajo?.evidenciasEntrega || [])].filter(e => e?.tipo === 'video')
            const urlsAhora = new Set((data.evidenciasIngreso || []).filter(e => e?.tipo === 'video').map(e => e.url))
            // GUARDAR primero (des-referencia el video), LUEGO borrar del bucket: así
            // el endpoint de borrado (que rechaza archivos aún referenciados) no falla.
            await actualizarTrabajo(editId, data)
            videosAntes.forEach(v => { if (!urlsAhora.has(v.url)) borrarVideoEvidencia(v) })
            sincronizarClienteVehiculo()
            notify('Trabajo actualizado', 'success')
          } else {
            // No numerar una OT nueva si aún no sabemos el consecutivo real del
            // servidor (arrancaría en OT-0001 y pisaría códigos existentes).
            if (!puedeCrearOT()) { notify('Sin conexión con el servidor: no se puede numerar la OT todavía. Reintenta en un momento.', 'error'); return }
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
    [ESTADOS.EN_DIAGNOSTICO, 'Diagnóstico'],
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
          <h2>Órdenes de trabajo</h2>
        </div>
        <div className="actions">
          <div className="segctl">
            <button type="button" className={vista === 'lista' ? 'on' : ''} onClick={() => setVista('lista')}>Lista</button>
            <button type="button" className={vista === 'kanban' ? 'on' : ''} onClick={() => setVista('kanban')}>Kanban</button>
          </div>
          <Button variant="primary" onClick={() => setVista('nuevo')}>+ Nueva OT</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 18 }}>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg></div>
            <div className="kpi__lbl">En vista</div>
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
          <button key={key} className={filtroEstado === key ? 'on' : ''} onClick={() => setFiltroEstado(key)}>
            {label}{conteos[key] ? <span className="tab-count">{conteos[key]}</span> : null}
          </button>
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
          {filtroTecnico !== 'todos' && filtered.length > 0 && (
            <Button variant="outline" size="sm" title="Un PDF con la ficha de cada OT de este técnico (sin precios)"
              onClick={() => {
                const nom = (TECNICOS.find(x => String(x.id) === filtroTecnico)?.nombre || 'tecnico').split(' ')[0]
                exportarFichasTecnico(filtered, tecNombre, `fichas_${nom}.pdf`)
              }}>Imprimir fichas ({filtered.length})</Button>
          )}
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
                <div className="kanban-column-header">
                  <span className="kdot" style={{ background: bc }}></span>
                  <span>{estado}</span>
                  <span className="kanban-count">{col.length}</span>
                  <button type="button" className="kadd" onClick={() => setVista('nuevo')} aria-label="Nueva OT">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                </div>
                <div className="kanban-cards">
                  {col.map(t => {
                    const diasSinMover = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
                    const estancado = t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO && diasSinMover >= DIAS_ESTANCADO
                    const tipo = tipoServicio(t)
                    return (
                      <div key={t.id} className={`kanban-card${estancado ? ' estancado' : ''}`}
                        draggable
                        onDragStart={() => { dragIdRef.current = t.id }}
                        onDragEnd={() => { dragIdRef.current = null; setDragOverCol(null) }}
                        onClick={() => setPreviewId(t.id)}>
                        <div className="kc-top">
                          <span className="kc-id"><span className="kdot" style={{ background: estancado ? 'var(--red-500)' : bc }}></span>{t.otCodigo || '—'}</span>
                          <span className={`av av-${(parseInt(t.tecnicoId) || 0) % 6}`} title={tecNombre(t.tecnicoId)}>{tecIniciales(t.tecnicoId)}</span>
                        </div>
                        <div className="kc-title">{t.placa || 'Sin placa'} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>· {t.cliente || 'Sin cliente'}</span></div>
                        <div className="kc-foot">
                          {tipo && <span className="kc-tag"><span className="kdot" style={{ background: tipo.color }}></span>{tipo.label}</span>}
                          {estancado && <span className="kc-tag kc-tag--warn">{diasSinMover} días</span>}
                          <span className="kc-total">{fmt(t.total)}</span>
                        </div>
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
                        {estancado && <Badge tone="d" style={{ fontSize: 9, padding: '1px 6px' }}>{dias}d</Badge>}
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
                          <a href={`tel:${tel}`} className="btn btn-outline btn-sm btn-icon" aria-label="Llamar" title="Llamar" style={{ height: 32, width: 32 }}><IconPhone /></a>
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-icon" aria-label="WhatsApp" title="WhatsApp" style={{ height: 32, width: 32, background: 'var(--green-600)', color: '#fff' }}><IconChat /></a>
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
                      <div className="segctl segctl--full">
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
                  <Button variant="outline" size="sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => setFichaId(selTrabajo.id)}>Ficha del técnico</Button>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="outline" size="sm" className="btn-icon" aria-label="Editar" title="Editar" onClick={() => handleEditar(selTrabajo.id)}><IconEdit /></Button>
                    {selTrabajo.otCodigo && <Button variant="outline" size="sm" className="btn-icon" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => imprimirOT(selTrabajo)}><IconPdf /></Button>}
                    {selTrabajo.estado !== ESTADOS.COMPLETADO && <Button variant="primary" size="sm" className="btn-icon" aria-label="Marcar listo" title="Marcar listo" onClick={() => handleCompletar(selTrabajo.id)}><IconCheck /></Button>}
                    <Button variant="ghost" size="sm" className="btn-icon" aria-label="Eliminar" title="Eliminar" style={{ color: 'var(--red-600)' }} onClick={() => setConfirmCfg({ title: 'Eliminar OT', confirmLabel: 'Eliminar', tone: 'danger', onConfirm: () => handleEliminar(selTrabajo.id) })}><IconTrash /></Button>
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
                  <th>Vehículo</th>
                  <th>Técnico</th>
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
                        {estancado && <Badge tone="d" style={{ marginLeft: 4, fontSize: 10 }}>{diasSinMover}d</Badge>}
                      </td>
                      <td className="c-mono c-right" data-label="Total" style={{ fontWeight: 700 }}>{fmt(t.total)}</td>
                      <td className="c-mono c-muted" data-label="Fecha" style={{ fontSize: 12 }}>{fmtDate(t.fecha)}</td>
                      <td className="c-right td-actions">
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          <Button variant="ghost" size="sm" className="btn-icon" aria-label="Editar" title="Editar" onClick={() => handleEditar(t.id)}><IconEdit /></Button>
                          {t.otCodigo && <Button variant="ghost" size="sm" className="btn-icon" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => imprimirOT(t)}><IconPdf /></Button>}
                          {t.estado !== ESTADOS.COMPLETADO && (
                            <Button variant="ghost" size="sm" aria-label="Marcar completado" style={{ color: 'var(--green-600)' }} onClick={() => handleCompletar(t.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></Button>
                          )}
                          {confirmDel === t.id ? (
                            <>
                              <Button variant="ghost" size="sm" style={{ color: 'var(--red-600)' }} onClick={() => handleEliminar(t.id)}>Si</Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>No</Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="sm" style={{ color: 'var(--red-500)' }} onClick={() => setConfirmDel(t.id)}>
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </Button>
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
          <div className="modal-overlay" onClick={() => { setPreviewId(null); setFirmando(false) }}>
            <div className="modal" style={{ maxWidth: 470 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="modal-title" style={{ fontFamily: 'var(--mono)', color: 'var(--blue-600)' }}>{t.otCodigo || '—'} · {t.placa}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{t.cliente || 'Sin cliente'} · {[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</div>
                </div>
                <button className="icobtn" onClick={() => { setPreviewId(null); setFirmando(false) }} aria-label="Cerrar" style={{ flexShrink: 0 }}><IconX /></button>
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
                      <a href={`tel:${tel}`} className="btn btn-outline btn-sm btn-icon" aria-label="Llamar" title="Llamar" style={{ height: 32, width: 32 }}><IconPhone /></a>
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-icon" aria-label="WhatsApp" title="WhatsApp" style={{ height: 32, width: 32, background: 'var(--green-600)', color: '#fff' }}><IconChat /></a>
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
                {/* Firma del cliente (recibido) */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Firma del cliente (recibido)</div>
                  {firmando ? (
                    <SignaturePad initial={t.firmaCliente}
                      onSave={async (dataUrl) => { await actualizarTrabajo(t.id, { firmaCliente: dataUrl }); setFirmando(false); notify('Firma guardada', 'success') }}
                      onCancel={() => setFirmando(false)} />
                  ) : t.firmaCliente ? (
                    <div>
                      <img src={t.firmaCliente} alt="Firma del cliente" style={{ width: '100%', maxHeight: 130, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }} />
                      <Button variant="outline" size="sm" type="button" style={{ marginTop: 8 }} onClick={() => setFirmando(true)}>Firmar de nuevo</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" type="button" onClick={() => setFirmando(true)}
                      icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>}>Firmar recibido</Button>
                  )}
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {t.otCodigo && <Button variant="outline" size="sm" onClick={() => imprimirOT(t)}>PDF</Button>}
                {t.estado !== ESTADOS.COMPLETADO && <Button variant="outline" size="sm" onClick={() => { handleCompletar(t.id); setPreviewId(null) }}>Marcar listo</Button>}
                <Button variant="primary" size="sm" onClick={() => { setPreviewId(null); handleEditar(t.id) }}>Editar</Button>
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
              <Button variant="outline" onClick={() => setShowFacturarModal(null)}>Después</Button>
              <Button variant="primary" onClick={() => {
                setShowFacturarModal(null)
                if (onAutoFacturar) onAutoFacturar(showFacturarModal)
                else notify('Ve a la pestaña Cuentti para facturar', 'info')
              }}>Ir a Facturar</Button>
            </div>
          </div>
        </div>
      )}

      {fichaId && (() => {
        const tf = trabajos.find(x => x.id === fichaId)
        return tf ? <FichaTecnico trabajo={tf} tecNombre={tecNombre} onClose={() => setFichaId(null)} guardar={(changes) => actualizarTrabajo(fichaId, changes)} /> : null
      })()}

      <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
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
function TrabajoForm({ trabajo, onSave, onCancel, allTrabajos = [], vehiculosHook, notify }) {
  const isEdit = !!trabajo
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()
  const [campoActivo, setCampoActivo] = useState('cedula') // cuál campo de búsqueda de cliente está enfocado
  const [confirmCfg, setConfirmCfg] = useState(null) // diálogo de confirmación

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
    cilindraje: trabajo?.cilindraje || '',
    kilometraje: trabajo?.kilometraje || '',
    tecnicoId: trabajo?.tecnicoId || '',
    observaciones: trabajo?.observaciones || '',
    // Mano de obra manual: solo se usa cuando NO hay líneas marcadas "Servicio"
    // (ej. cambio de aceite). Base para la comisión del técnico, no se cobra al cliente.
    manoObra: trabajo?.manoObra ? String(trabajo.manoObra) : '',
    // M.O. adicional (no facturada): se SUMA a la comisión aunque ya haya líneas de
    // servicio (ej. la mano de obra del cambio de aceite además de la reparación).
    // Nunca entra al total del cliente.
    manoObraExtra: trabajo?.manoObraExtra ? String(trabajo.manoObraExtra) : '',
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
    // Estado de ingreso del vehículo (inventario + combustible + daños)
    ingreso: trabajo?.ingreso || ingresoVacio(),
  })

  const [items, setItems] = useState(trabajo?.items || [])
  // Evidencias: abierta por defecto para que el botón de subir fotos sea visible.
  const [showEvid, setShowEvid] = useState(true)
  const [showHistorial, setShowHistorial] = useState(false) // historial por placa: cerrado por defecto
  const [showMant, setShowMant] = useState(
    !!(trabajo?.tipoAceite || trabajo?.proximoKm || trabajo?.proximaVisita || trabajo?.notasProximoMant)
  )
  // Comprime la imagen (máx 1100px, JPEG) antes de guardarla: así pesa poco
  // para localStorage, el PDF y el portal del cliente. Cae al original si falla.
  const comprimirImagen = (file, maxDim = 1100, quality = 0.62) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
          else { width = Math.round(width * maxDim / height); height = maxDim }
        }
        try {
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          canvas.getContext('2d').drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch { resolve(reader.result) }
      }
      img.onerror = () => resolve(reader.result)
      img.src = reader.result
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })

  const addFotos = (campo, files) => {
    if (!files?.length) return
    Array.from(files).forEach(async file => {
      const dataUrl = await comprimirImagen(file)
      if (!dataUrl) return
      setForm(f => ({
        ...f,
        [campo]: [...(f[campo] || []), { id: uid(), nombre: file.name, dataUrl, nota: '' }],
      }))
    })
  }

  // Video de evidencia (máx 30s). No cabe en la columna: se sube al bucket de
  // Storage y en la evidencia solo se guarda el link ({ tipo:'video', url }).
  const MAX_VIDEO_SEG = 30
  const MAX_VIDEO_BYTES = 75 * 1024 * 1024
  const [subiendoVideo, setSubiendoVideo] = useState(false)
  // Videos subidos al bucket en ESTA sesión de edición (aún no persistidos en el
  // trabajo). Si se cancela, o si se quitan antes de guardar, hay que borrarlos del
  // bucket para no dejar huérfanos.
  const videosSesionRef = useRef([])
  const addVideo = async (campo, file) => {
    if (!file) return
    if (!file.type?.startsWith('video/')) { notify?.('Ese archivo no es un video.', 'error'); return }
    if (file.size > MAX_VIDEO_BYTES) { notify?.('El video pesa más de 75 MB. Grábalo más corto o en menor calidad.', 'error'); return }
    // Duración: se lee del propio archivo antes de subir.
    const dur = await new Promise(resolve => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => { const d = v.duration || 0; URL.revokeObjectURL(v.src); resolve(d) }
      v.onerror = () => { URL.revokeObjectURL(v.src); resolve(0) }
      v.src = URL.createObjectURL(file)
    })
    if (dur > MAX_VIDEO_SEG + 0.5) { notify?.(`El video dura ${Math.round(dur)}s. El máximo son ${MAX_VIDEO_SEG} segundos.`, 'error'); return }
    setSubiendoVideo(true)
    try {
      // Carpeta por OT: el `form` no tiene otCodigo/id, se toman del trabajo (o placa).
      const carpeta = trabajo?.otCodigo || trabajo?.id || form.placa || 'nueva'
      const { url, path } = await subirVideoEvidencia(file, carpeta)
      videosSesionRef.current.push({ url, path })
      setForm(f => ({ ...f, [campo]: [...(f[campo] || []), { id: uid(), nombre: file.name, tipo: 'video', url, path, nota: '' }] }))
      notify?.('Video subido.', 'success')
    } catch (e) {
      notify?.(`No se pudo subir el video: ${e.message}`, 'error')
    } finally {
      setSubiendoVideo(false)
    }
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
      const terms = q.split(/\s+/).filter(Boolean)
      const scored = []

      for (const p of inventario) {
        const nombre = (p.nombre || '').toLowerCase()
        const codigo = (p.codigo || '').toLowerCase()
        const sku = (p.sku || '').toLowerCase()
        const barras = (p.codigoBarras || '').toLowerCase()

        // Multi-palabra: TODAS las palabras deben aparecer (en cualquier orden)
        const hay = `${nombre} ${codigo} ${sku} ${barras}`
        if (!terms.every(t => hay.includes(t))) continue

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
        // Multi-palabra: todas presentes pero no como frase exacta
        else score = 35

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
        if (v.placa) candidatos.push({ placa: v.placa, marca: v.marca, modelo: v.modelo, ano: v.ano, cilindraje: v.cilindraje, kilometraje: v.kilometraje, _t: v.actualizadoEn || v.creadoEn || 0 })
      }
    }
    for (const t of allTrabajos) {
      if ((t.cedula || '') === cedula && t.placa) {
        candidatos.push({ placa: t.placa, marca: t.marca, modelo: t.modelo, ano: t.ano, cilindraje: t.cilindraje, kilometraje: t.kilometraje, _t: t.fecha || t.creadoEn || 0 })
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
      cilindraje: prev.cilindraje || v.cilindraje || '',
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
    let subtotal = 0, iva = 0, total = 0, manoObra = 0, manoObraBase = 0, repuestos = 0
    items.forEach(i => {
      const precio = parseFloat(i.precio) || 0
      const cant = parseInt(i.cantidad) || 1
      const ivaPct = parseFloat(i.iva) || 0
      const lineaTotal = precio * cant
      const lineaBase = ivaPct > 0 ? lineaTotal / (1 + ivaPct / 100) : lineaTotal
      if (ivaPct > 0) {
        subtotal += lineaBase
        iva += lineaTotal - lineaBase
      } else {
        subtotal += lineaTotal
      }
      total += lineaTotal
      if (i.esServicio) { manoObra += lineaTotal; manoObraBase += lineaBase }
      else repuestos += lineaTotal
    })
    return {
      subtotal: Math.round(subtotal),
      iva: Math.round(iva),
      total: Math.round(total),
      manoObra: Math.round(manoObra),
      manoObraBase: Math.round(manoObraBase), // M.O. de servicios SIN IVA = base de la comisión
      repuestos: Math.round(repuestos),
    }
  }, [items])

  // Mano de obra efectiva (base de la comisión del técnico):
  //  - Si hay líneas marcadas "Servicio", manda esa suma (igual que siempre).
  //  - Si no hay (ej. cambio de aceite), se usa la mano de obra escrita a mano.
  const hayServicios = totales.manoObra > 0
  // M.O. adicional (no facturada): base extra que se SUMA a la comisión aunque ya
  // haya líneas de servicio. Ya es sin IVA (no se factura). No toca el total.
  const manoObraExtra = Math.max(0, parseFloat(form.manoObraExtra) || 0)
  // Mano de obra "de línea" (SIN el extra): las líneas de servicio o, si no hay, la
  // M.O. manual. Es lo que se guarda en `manoObra`; el extra va en su propio campo
  // y getManoObra/manoObraBase lo VUELVEN a sumar → guardarlo aquí lo duplicaría.
  const manoObraLinea = hayServicios ? totales.manoObra : Math.max(0, parseFloat(form.manoObra) || 0)
  const manoObraEf = manoObraLinea + manoObraExtra // solo para mostrar (la M.O. total acreditada)
  // La comisión se calcula sobre la base SIN IVA (igual que Liquidación, que es lo
  // que realmente cobra el técnico). El M.O. manual y el extra ya vienen sin IVA.
  const baseComision = (hayServicios ? totales.manoObraBase : Math.max(0, parseFloat(form.manoObra) || 0)) + manoObraExtra
  const comisionTecnico = Math.round(baseComision * COMISION.TOTAL)
  // Comisión que aporta solo el extra (para el preview de su propio campo).
  const comisionExtra = Math.round(manoObraExtra * COMISION.TOTAL)

  // Guardado real de la OT. skipAviso salta el aviso de M.O.=0 (patrón skipConfirm).
  const guardar = (skipAviso = false) => {
    if ((!form.placa && !form.sinVehiculo) || !form.cliente) return
    // Aviso: OT con valor pero sin mano de obra (ninguna línea "Servicio" ni M.O.
    // manual) → el técnico asignado quedaría con comisión $0, que solo se descubre
    // al liquidar días después.
    if (!skipAviso && totales.total > 0 && baseComision === 0 && form.tecnicoId) {
      setConfirmCfg({
        title: 'Sin mano de obra',
        lead: 'El técnico no recibirá comisión.',
        confirmLabel: 'Guardar igual',
        tone: 'danger',
        onConfirm: () => guardar(true),
      })
      return
    }
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
      manoObra: manoObraLinea, // SIN el extra (el extra va aparte y se re-suma al liquidar)
      manoObraExtra,
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
    // Videos subidos esta sesión que NO quedaron en el trabajo (agregados y luego
    // quitados antes de guardar) → borrarlos del bucket. Los que sí quedan ya están
    // persistidos; los que estaban en el trabajo original y se quitaron los borra el
    // diff del onSave del padre.
    const urlsFinal = new Set((form.evidenciasIngreso || []).filter(e => e?.tipo === 'video').map(e => e.url))
    videosSesionRef.current.filter(v => !urlsFinal.has(v.url)).forEach(v => borrarVideoEvidencia(v))
    videosSesionRef.current = []
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    guardar()
  }

  // Cancelar: nada se guardó, así que se borran del bucket los videos subidos en
  // ESTA sesión (si no, quedan huérfanos, sobre todo en una OT nueva descartada).
  const cancelar = () => {
    videosSesionRef.current.forEach(v => borrarVideoEvidencia(v))
    videosSesionRef.current = []
    onCancel()
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
        <div className="actions"><Button variant="outline" onClick={cancelar}>Volver</Button></div>
      </div>

      <form onSubmit={handleSubmit} className="form-stack">
        {/* ¿QUIÉN ATIENDE? — lo primero de la OT: se asigna el técnico de una.
           Con solo 3 técnicos, tocar un chip es más rápido que abrir un menú. */}
        <div className="card">
          <div className="card__h"><h3>¿Quién atiende esta orden? <span className="req">*</span></h3></div>
          <div className="card__b">
            <div className="tec-chips">
              {TECNICOS.filter(t => t.activo !== false || String(t.id) === String(form.tecnicoId)).map(t => {
                const sel = String(form.tecnicoId) === String(t.id)
                return (
                  <button type="button" key={t.id} className={`tec-chip${sel ? ' on' : ''}`} aria-pressed={sel}
                    onClick={() => set('tecnicoId', String(t.id))}>
                    <span className={`av av-${((parseInt(t.id) || 1) - 1) % 5 + 1}`}>{tecIniciales(t.id)}</span>
                    <span>{(t.nombre || '').split(' ')[0]}{t.activo === false ? ' (inactivo)' : ''}</span>
                    {sel && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, marginRight: 2 }}><path d="M20 6 9 17l-5-5" /></svg>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* CLIENTE + VEHICULO en 2 columnas */}
        <div className="form-grid-2">
        {/* CLIENTE */}
        <div className="card">
          <div className="card__h"><h3>Cliente</h3></div>
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field" style={{ position: 'relative' }}>
              <label>Cédula / NIT <span className="req">*</span></label>
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
              <label>Teléfono</label>
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
            <h3>Vehículo</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
              <Switch checked={!!form.sinVehiculo} onChange={v => set('sinVehiculo', v)} ariaLabel="Servicio sin vehículo" />
              <span style={{ cursor: 'pointer' }} onClick={() => set('sinVehiculo', !form.sinVehiculo)}>Servicio sin vehículo (no entra carro)</span>
            </div>
          </div>
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
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
              <label>Cilindraje</label>
              <select className="input" value={form.cilindraje} disabled={form.sinVehiculo} onChange={e => set('cilindraje', e.target.value)}>
                <option value="">Seleccionar</option>
                {form.cilindraje && !CILINDRAJES.some(c => `${c}L` === form.cilindraje) && <option value={form.cilindraje}>{form.cilindraje}</option>}
                {CILINDRAJES.map(c => <option key={c} value={`${c}L`}>{c} L</option>)}
              </select>
            </div>
            <div className="field">
              <label>Kilometraje</label>
              <input className="input" type="number" value={form.kilometraje} min="0" placeholder="45000" disabled={form.sinVehiculo} onChange={e => set('kilometraje', e.target.value)} />
            </div>
          </div>
        </div>
        </div>{/* /form-grid-2 */}

        {/* ===== Dos paneles: contexto (derecha) + plata (izquierda) ===== */}
        <div className="ot-grid">
        {/* Columna DERECHA — vehículo y contexto (el grid la manda a la derecha) */}
        <div className="ot-col ot-col--side">

        {!form.sinVehiculo && (
          <div className="card">
            <div className="card__h"><h3>Estado de ingreso del vehículo <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginLeft: 6 }}>(inventario · combustible · daños)</span></h3></div>
            <div className="card__b">
              <IngresoVehiculo value={form.ingreso} onChange={v => set('ingreso', v)} />
            </div>
          </div>
        )}

        {/* HISTORIAL POR PLACA */}
        {form.placa.length >= 6 && (() => {
          const historial = allTrabajos.filter(t =>
            (t.placa || '').toUpperCase() === form.placa.toUpperCase() && t.id !== trabajo?.id
          ).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
          if (!historial.length) return null
          return (
            <div className="card" style={{ borderColor: 'rgba(37,99,235,.28)', background: 'rgba(37,99,235,.04)' }}>
              <button type="button" className="card__h card__h--toggle" onClick={() => setShowHistorial(v => !v)} style={{ background: 'none' }}>
                <h3 style={{ color: 'var(--blue-700)' }}>Historial de {form.placa.toUpperCase()} <span style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--blue-600)' }}>· {historial.length} anteriores</span></h3>
                <Chevron open={showHistorial} />
              </button>
              {showHistorial && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>OT</th>
                        <th>Estado</th>
                        <th>Técnico</th>
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
              )}
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
              <label>Fotos y videos de la orden de trabajo</label>
              <input type="file" accept="image/*" multiple onChange={e => addFotos('evidenciasIngreso', e.target.files)} />
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label className="btn btn-outline btn-sm" style={{ cursor: subiendoVideo ? 'wait' : 'pointer', margin: 0 }}>
                  {subiendoVideo ? 'Subiendo video…' : '+ Agregar video (máx 30s)'}
                  <input type="file" accept="video/*" capture="environment" disabled={subiendoVideo}
                    onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; addVideo('evidenciasIngreso', file) }}
                    style={{ display: 'none' }} />
                </label>
                {subiendoVideo && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No cierres esta ventana hasta que termine.</span>}
              </div>
              <ThumbGrid fotos={form.evidenciasIngreso} onNota={(id, nota) => actualizarNotaFoto('evidenciasIngreso', id, nota)} onRemove={id => quitarFoto('evidenciasIngreso', id)} />
            </div>
          </div>
          )}
        </div>
        </div>{/* /ot-col side */}

        {/* Columna IZQUIERDA — la orden y la plata */}
        <div className="ot-col ot-col--main">

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
            <Button variant="outline" size="sm" type="button" onClick={addItem} style={{ marginLeft: 'auto' }}>+ Agregar línea</Button>
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
                    <th style={{ width: '35%' }}>Descripción</th>
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
                            <input className="form-input" value={item.nombre} placeholder={item._bloqueado ? 'Edita la descripción libremente...' : 'Producto, código o referencia...'}
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
                            {invLoading && !item._bloqueado && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-3)' }}>...</span>}
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
                                  {searchState.results.map((p) => {
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
                          <MoneyInput className="form-input" value={Math.round(parseFloat(item.precio) || 0)}
                            onChange={v => updateItem(item.id, 'precio', v)}
                            inputStyle={{ padding: '6px 10px 6px 22px', fontSize: 13, textAlign: 'right' }} />
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
                          <Button variant="ghost" size="sm" type="button" aria-label="Eliminar ítem" onClick={() => removeItem(item.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* MANO DE OBRA MANUAL — cuando no hay línea marcada "Servicio" (ej. cambio de aceite) */}
          {!hayServicios && (
            <div className="mo-manual">
              <div className="mo-manual__row">
                <div className="field" style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <label htmlFor="mo-manual-input">Mano de obra del técnico <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>(opcional)</span></label>
                  <MoneyInput id="mo-manual-input" value={form.manoObra} onChange={v => set('manoObra', v)} placeholder="0" />
                </div>
                <div className="mo-manual__com">
                  <span className="mo-manual__com-lbl">Comisión técnico ({COMISION.TOTAL * 100}%)</span>
                  <span className="mo-manual__com-val">{fmt(comisionTecnico)}</span>
                </div>
              </div>
            </div>
          )}

          {/* M.O. ADICIONAL (no facturada) — cuando YA hay línea de Servicio pero se
              hizo trabajo extra que se le paga al técnico sin cobrarlo al cliente
              (ej. la mano de obra del cambio de aceite además de la reparación). */}
          {hayServicios && (
            <div className="mo-manual">
              <div className="mo-manual__row">
                <div className="field" style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <label htmlFor="mo-extra-input">M.O. adicional del técnico <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>(no se factura)</span></label>
                  <MoneyInput id="mo-extra-input" value={form.manoObraExtra} onChange={v => set('manoObraExtra', v)} placeholder="0" />
                </div>
                <div className="mo-manual__com">
                  <span className="mo-manual__com-lbl">Comisión adicional ({COMISION.TOTAL * 100}%)</span>
                  <span className="mo-manual__com-val">{fmt(comisionExtra)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Totales — totalizer redesigned (M.O./Repuestos breakdown + Total destacado) */}
          <div className="ot-totals">
            <div className="ot-totals__group">
              <span className="ot-stat"><span className="ot-stat__lbl">Mano de obra</span><span className="ot-stat__val">{fmt(manoObraEf)}</span></span>
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
              <label>Diagnóstico / Notas</label>
              <textarea className="input" value={form.observaciones} placeholder="Diagnóstico, notas, recomendaciones..."
                onChange={e => set('observaciones', e.target.value)} style={{ minHeight: 88, resize: 'vertical' }} />
            </div>
          </div>
        </div>
        </div>{/* /ot-col main */}
        </div>{/* /ot-grid */}

        {/* ACCIONES */}
        <div className="form-actionbar">
          <div className="form-actionbar__total">
            <span className="lbl">Total OT</span>
            <span className="val">{fmt(totales.total)}</span>
          </div>
          <div className="form-actionbar__btns">
            <Button variant="outline" type="button" onClick={cancelar}>Cancelar</Button>
            <Button variant="primary" type="submit">{isEdit ? 'Actualizar OT' : `Guardar OT · ${fmt(totales.total)}`}</Button>
          </div>
        </div>
      </form>
      <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </div>
  )
}

function ThumbGrid({ fotos = [], onNota, onRemove }) {
  if (!fotos.length) return null
  return (
    <div className="thumb-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8, marginTop: 10 }}>
      {fotos.map(fv => (
        <div key={fv.id} style={{ border: '1px solid var(--slate-200)', borderRadius: 8, padding: 6 }}>
          <div style={{ position: 'relative', paddingBottom: '70%', overflow: 'hidden', borderRadius: 6, marginBottom: 6, background: '#000' }}>
            {fv.tipo === 'video'
              ? <video src={fv.url} controls preload="metadata" playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src={fv.dataUrl} alt={fv.nombre} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <input className="form-input text-xs" placeholder="Nota breve" value={fv.nota || ''}
            onChange={e => onNota?.(fv.id, e.target.value)} />
          <Button variant="ghost" size="sm" type="button" onClick={() => onRemove?.(fv.id)} style={{ width: '100%', marginTop: 4 }}>Eliminar</Button>
        </div>
      ))}
    </div>
  )
}
