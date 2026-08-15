import { useState, useEffect, useMemo, useRef } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, fmtTelefono, cantidadItem, fmtCant } from '../utils/helpers'
import { TECNICOS, ESTADOS, DIAS_ESTANCADO, TALLER, SIN_FACTURA } from '../utils/constants'
import { loadLogo as loadPdfLogo, drawHeader, drawSectionHeader, drawDataBlock, drawTotalsBox, drawSignatures, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS } from '../utils/pdfTheme'
import FichaTecnico from '../components/FichaTecnico'
import { labelInventario, etiquetaCombustible, ingresoTieneAlgo } from '../utils/ingreso'
import { exportarFichasTecnico } from '../utils/fichaPdf'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { borrarVideoEvidencia, fetchEvidenciasTrabajo } from '../services/supabase'
import SignaturePad from '../components/SignaturePad'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, Badge, IconX, IconEdit, IconTrash, IconPdf, IconPhone, IconChat, IconCheck } from '../components/ui'
import TrabajoForm from './TrabajoForm'

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

// ¿Ya se le cobró a este cliente? Es la pregunta del mostrador y hasta ahora la
// ficha de la OT no la contestaba: tocaba entrar a Cuentti a adivinar. Devuelve
// null cuando todavía no aplica (OT sin terminar), para no llenar de avisos.
function estadoCobro(t) {
  if (!t) return null
  if (t.cuenttiTransacionId === SIN_FACTURA) return { tone: 'success', label: 'Cobrada sin factura' }
  const facturada = !!(t.cuenttiTransacionId || t.facturadoEn)
  if (facturada) {
    // "Por cobrar" y no "Facturada · falta cobrar": la etiqueta larga desbordaba
    // la celda de estado en celular y sacaba scroll horizontal en toda la página,
    // y es justo el estado más frecuente.
    return t.pagado
      ? { tone: 'success', label: 'Cobrada' }
      : { tone: 'warning', label: 'Por cobrar' }
  }
  // Sin ítems no hay nada que facturar: el panel de Cuentti la descarta, así que
  // ofrecer "Cobrar" llevaba a un selector vacío y a un error al enviar.
  if (t.estado === ESTADOS.COMPLETADO) {
    const facturable = Array.isArray(t.items) && t.items.length > 0
    return facturable
      ? { tone: 'neutral', label: 'Sin facturar', porCobrar: true }
      : { tone: 'neutral', label: 'Sin ítems para facturar' }
  }
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
    // Las evidencias ya no viajan en la lista: se consultan aquí para poder borrar
    // los videos del bucket. Si la consulta falla solo quedaría un huérfano (no bloquea).
    let evid = t?.evidenciasIngreso || []
    try {
      const remotas = await fetchEvidenciasTrabajo(id)
      if (Array.isArray(remotas) && remotas.length) evid = remotas
    } catch { /* huérfano tolerable */ }
    const videos = evid.filter(e => e?.tipo === 'video')
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
        fmtCant(i),
        fmt(parseFloat(i.precio) || 0),
        i.iva > 0 ? `${i.iva}%` : '—',
        fmt((parseFloat(i.precio) || 0) * (cantidadItem(i))),
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
        const linea = (parseFloat(i.precio) || 0) * (cantidadItem(i))
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

  // El botón llama por aquí, no a imprimirOT directo. Motivo: imprimirOT es
  // async y se invocaba sin atrapar el error, así que si algo fallaba la promesa
  // se rompía en silencio — el usuario apretaba y no pasaba NADA, sin pista
  // alguna de qué había fallado. Ahora cualquier fallo se ve en pantalla.
  const descargarOT = (t) => {
    imprimirOT(t).catch((e) => {
      notify?.(`No se pudo generar el PDF de ${t.otCodigo || 'la OT'}: ${e?.message || e}`, 'error')
    })
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
        onSave={async (dataForm) => {
          // _evidAntes (lista de evidencias del servidor al abrir el form) solo
          // sirve para el diff de videos de aquí abajo: NO debe persistirse.
          const { _evidAntes, ...data } = dataForm
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
            // Videos que tenía la OT al abrirla: la lista del servidor (_evidAntes)
            // manda; el estado local ya no trae evidencias en el poll.
            const videosAntes = (_evidAntes ?? [...(trabajo?.evidenciasIngreso || []), ...(trabajo?.evidenciasEntrega || [])]).filter(e => e?.tipo === 'video')
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

      {/* Las pestañas de estado YA traen el conteo de cada una, asi que la franja
          de cuatro cifras que habia aqui encima decia lo mismo dos veces — y abria
          con cuatro ceros gigantes que parecian perdida de datos. Se quito.

          Los filtros pasan de TRES filas apiladas (estado / fecha / buscador) a
          una sola: antes habia que atravesar tres barras antes de ver un dato. */}
      <div className="tabs" style={{ marginBottom: 10 }}>
        {statesTabs.map(([key, label]) => (
          <button key={key} className={filtroEstado === key ? 'on' : ''} onClick={() => setFiltroEstado(key)}>
            {label}{conteos[key] ? <span className="tab-count">{conteos[key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="trab-filtros">
        {vista !== 'kanban' && (
          <div className="segctl" style={{ flexShrink: 0 }}>
            {[['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['todas', 'Todas']].map(([k, l]) => (
              <button key={k} type="button" className={filtroFecha === k ? 'on' : ''} onClick={() => setFiltroFecha(k)}>{l}</button>
            ))}
          </div>
        )}
        <input className="input trab-filtros__q" placeholder="Buscar placa, cliente, OT..." value={filtroBusqueda}
          onChange={e => setFiltroBusqueda(e.target.value)} />
        <select className="input trab-filtros__tec" value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}>
          <option value="todos">Todos los tecnicos</option>
          {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}{t.activo === false ? ' (inactivo)' : ''}</option>)}
        </select>
        {filtroTecnico !== 'todos' && filtered.length > 0 && (
          <Button variant="outline" size="sm" title="Un PDF con la ficha de cada OT de este tecnico (sin precios)"
            onClick={() => {
              const nom = (TECNICOS.find(x => String(x.id) === filtroTecnico)?.nombre || 'tecnico').split(' ')[0]
              exportarFichasTecnico(filtered, tecNombre, `fichas_${nom}.pdf`)
            }}>Imprimir fichas ({filtered.length})</Button>
        )}
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
                        {estancado && <Badge tone="d" style={{ fontSize: 12, padding: '1px 6px' }}>{dias}d</Badge>}
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
                    {(() => { const c = estadoCobro(selTrabajo); return c ? <Badge tone={c.tone}>{c.label}</Badge> : null })()}
                    <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtDate(selTrabajo.fecha)}</span>
                  </div>
                  {selTrabajo.cuenttiTransacionId && selTrabajo.cuenttiTransacionId !== SIN_FACTURA && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      Factura <span className="mono" style={{ color: 'var(--text)' }}>{selTrabajo.cuenttiTransacionId}</span>
                      {selTrabajo.facturadoEn && ` · ${fmtDate(selTrabajo.facturadoEn)}`}
                    </div>
                  )}

                  {selTrabajo.telefonoCliente && (() => {
                    const tel = String(selTrabajo.telefonoCliente).replace(/\D/g, '')
                    const wa = tel.length === 10 ? `57${tel}` : tel
                    return (
                      <div className="ck-d-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selTrabajo.cliente || 'Cliente'}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtTelefono(selTrabajo.telefonoCliente)}</div>
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
                      <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Cambiar estado</div>
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
                          <span className="mono" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{fmt((parseFloat(it.precio) || 0) * (cantidadItem(it)))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Puente al cobro: sin esto había que ir a "Cuentti" a mano y
                      buscar la OT en un selector, y nadie sabía que ahí se cobra. */}
                  {onAutoFacturar && estadoCobro(selTrabajo)?.porCobrar && (
                    <Button variant="primary" style={{ width: '100%' }}
                      onClick={() => { onAutoFacturar(selTrabajo) }}>
                      Cobrar {fmt(selTrabajo.total)}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => setFichaId(selTrabajo.id)}>Ficha del técnico</Button>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="outline" size="sm" className="btn-icon" aria-label="Editar" title="Editar" onClick={() => handleEditar(selTrabajo.id)}><IconEdit /></Button>
                    {selTrabajo.otCodigo && <Button variant="outline" size="sm" className="btn-icon" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => descargarOT(selTrabajo)}><IconPdf /></Button>}
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
                          <span className={`av av-${(parseInt(t.tecnicoId) || 1) % 5 + 1}`} style={{ width: 26, height: 26, fontSize: 12 }}>{tecIniciales(t.tecnicoId)}</span>
                          <span style={{ fontSize: 12.5 }}>{tecNombre(t.tecnicoId)}</span>
                        </div>
                      </td>
                      <td data-label="Estado">
                        <span className={`badge ${bc}`}>{t.estado}</span>
                        {estancado && <Badge tone="d" style={{ marginLeft: 4, fontSize: 12 }}>{diasSinMover}d</Badge>}
                        {/* En celular esta tabla ES la ficha: sin este badge no hay
                            dónde ver si a la OT ya se le cobró. */}
                        {(() => { const c = estadoCobro(t); return c ? <Badge tone={c.tone} style={{ marginLeft: 4, fontSize: 12 }}>{c.label}</Badge> : null })()}
                      </td>
                      <td className="c-mono c-right" data-label="Total" style={{ fontWeight: 700 }}>{fmt(t.total)}</td>
                      <td className="c-mono c-muted" data-label="Fecha" style={{ fontSize: 12 }}>{fmtDate(t.fecha)}</td>
                      <td className="c-right td-actions">
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          <Button variant="ghost" size="sm" className="btn-icon" aria-label="Editar" title="Editar" onClick={() => handleEditar(t.id)}><IconEdit /></Button>
                          {t.otCodigo && <Button variant="ghost" size="sm" className="btn-icon" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => descargarOT(t)}><IconPdf /></Button>}
                          {t.estado !== ESTADOS.COMPLETADO && (
                            <Button variant="ghost" size="sm" aria-label="Marcar completado" style={{ color: 'var(--green-600)' }} onClick={() => handleCompletar(t.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></Button>
                          )}
                          {onAutoFacturar && estadoCobro(t)?.porCobrar && (
                            <Button variant="primary" size="sm" title="Facturar y cobrar en Cuentti"
                              onClick={() => { onAutoFacturar(t) }}>Cobrar</Button>
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
                  {(() => { const c = estadoCobro(t); return c ? <Badge tone={c.tone}>{c.label}</Badge> : null })()}
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtDate(t.fecha)}</span>
                </div>
                {t.cuenttiTransacionId && t.cuenttiTransacionId !== SIN_FACTURA && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -4 }}>
                    Factura <span className="mono" style={{ color: 'var(--text)' }}>{t.cuenttiTransacionId}</span>
                    {t.facturadoEn && ` · ${fmtDate(t.facturadoEn)}`}
                  </div>
                )}
                {tel && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg-subtle)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.cliente || 'Cliente'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtTelefono(t.telefonoCliente)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <a href={`tel:${tel}`} className="btn btn-outline btn-sm btn-icon" aria-label="Llamar" title="Llamar" style={{ height: 32, width: 32 }}><IconPhone /></a>
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-icon" aria-label="WhatsApp" title="WhatsApp" style={{ height: 32, width: 32, background: 'var(--green-600)', color: '#fff' }}><IconChat /></a>
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}><div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Técnico</div><div style={{ fontSize: 13, fontWeight: 600 }}>{tecNombre(t.tecnicoId)}</div></div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}><div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Total</div><div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(t.total)}</div></div>
                </div>
                {(t.items || []).length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Ítems</div>
                    {(t.items || []).slice(0, 8).map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
                        <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre || 'Ítem'}</span>
                        <span className="mono" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{fmt((parseFloat(it.precio) || 0) * (cantidadItem(it)))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Firma del cliente (recibido) */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Firma del cliente (recibido)</div>
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
                {t.otCodigo && <Button variant="outline" size="sm" onClick={() => descargarOT(t)}>PDF</Button>}
                {t.estado !== ESTADOS.COMPLETADO && <Button variant="outline" size="sm" onClick={() => { handleCompletar(t.id); setPreviewId(null) }}>Marcar listo</Button>}
                {(() => {
                  const porCobrar = !!onAutoFacturar && !!estadoCobro(t)?.porCobrar
                  return (
                    <>
                      <Button variant={porCobrar ? 'outline' : 'primary'} size="sm" onClick={() => { setPreviewId(null); handleEditar(t.id) }}>Editar</Button>
                      {porCobrar && (
                        <Button variant="primary" size="sm"
                          onClick={() => { setPreviewId(null); onAutoFacturar(t) }}>
                          Cobrar {fmt(t.total)}
                        </Button>
                      )}
                    </>
                  )
                })()}
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
