// =====================================================================
// fichaPdf.js — PDF de la Ficha de Trabajo del técnico (SIN precios).
// Separado del componente FichaTecnico para no romper Fast Refresh (un
// archivo de componente solo debe exportar componentes).
// =====================================================================
import { cargarPdf } from './pdfLazy'
import { fmtCant } from './helpers'
import { loadLogo, drawHeader, drawSectionHeader, drawDataBlock, drawSignatures, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS } from './pdfTheme'
import { fmtDate } from './helpers'

// Dibuja UNA ficha (sin precios) en el doc. hechasSet = índices de tareas hechas.
// Con esPrimera=false agrega una página nueva antes (para varias OT en un PDF).
export async function dibujarUnaFicha(doc, t, tecNombre, hechasSet, logoData, esPrimera) {
  // Esta funcion recibe el `doc` ya hecho, pero dibuja la tabla ella misma, asi
  // que necesita autoTable aunque no cree el documento. cargarPdf cachea: pedirlo
  // aqui no vuelve a descargar nada.
  const { autoTable } = await cargarPdf()
  const { MARGIN, CONTENT_W } = PDF_LAYOUT
  const { NAVY, SLATE_300, SLATE_400, SLATE_600 } = PDF_COLORS
  const items = Array.isArray(t.items) ? t.items : []
  if (!esPrimera) doc.addPage()

  drawHeader(doc, {
    logoData,
    docType: 'ORDEN DE TRABAJO',
    docNumber: t.otCodigo || '—',
    badge: { label: t.estado || 'Pendiente', estado: t.estado || 'Pendiente' },
    dateRows: [
      { lbl: 'Fecha', val: fmtDate(t.fecha) },
      { lbl: 'Técnico', val: tecNombre?.(t.tecnicoId) || '—' },
    ],
  })

  let y = 47
  y = drawSectionHeader(doc, 'Vehículo y cliente', y)
  y = drawDataBlock(doc, [
    { label: 'Placa', value: (t.placa || '').toUpperCase(), bold: true },
    { label: 'Vehículo', value: [t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || '—' },
    { label: 'Kilometraje', value: t.kilometraje ? `${Number(t.kilometraje).toLocaleString('es-CO')} km` : '—' },
    { label: 'Cliente', value: t.cliente || '—' },
  ], y)
  y += 4

  if (t.observaciones) {
    y = drawSectionHeader(doc, 'Motivo / lo que reporta el cliente', y)
    const lines = doc.splitTextToSize(t.observaciones, CONTENT_W - 6)
    const h = Math.max(11, lines.length * 3.8 + 6)
    doc.setDrawColor(...SLATE_300); doc.setLineWidth(0.2); doc.rect(MARGIN, y, CONTENT_W, h)
    doc.setFontSize(8); doc.setTextColor(...NAVY); doc.setFont(undefined, 'normal')
    doc.text(lines, MARGIN + 3, y + 4.5)
    y += h + 4
  }

  if (items.length) {
    y = drawSectionHeader(doc, 'Trabajo a realizar (marca al terminar cada uno)', y)
    autoTable(doc, {
      startY: y,
      head: [['#', 'TAREA / REPUESTO', 'CANT.', 'HECHO']],
      body: items.map((it, idx) => [String(idx + 1), it.nombre || '—', fmtCant(it), '']),
      ...tableStylesItems,
      columnStyles: {
        0: { halign: 'center', cellWidth: 9, textColor: SLATE_400 },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'center', cellWidth: 20 },
      },
      margin: { left: MARGIN, right: MARGIN },
      didDrawCell: (d) => {
        if (d.section !== 'body' || d.column.index !== 3) return
        const cx = d.cell.x + d.cell.width / 2, cy = d.cell.y + d.cell.height / 2
        doc.setDrawColor(...SLATE_600); doc.setLineWidth(0.4)
        doc.rect(cx - 2.4, cy - 2.4, 4.8, 4.8)
        // Marca por id del ítem (o índice, para datos viejos guardados por índice).
        const itemRow = items[d.row.index]
        if (hechasSet.has(itemRow?.id) || hechasSet.has(d.row.index)) {
          doc.setLineWidth(0.7)
          doc.line(cx - 1.6, cy, cx - 0.4, cy + 1.5)
          doc.line(cx - 0.4, cy + 1.5, cx + 1.9, cy - 1.9)
        }
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  y = drawSectionHeader(doc, 'Notas del técnico', y)
  doc.setDrawColor(...SLATE_300); doc.setLineWidth(0.15)
  for (let i = 0; i < 3; i++) { doc.line(MARGIN, y + 6 + i * 7, MARGIN + CONTENT_W, y + 6 + i * 7) }
  y += 6 + 3 * 7 + 4

  drawSignatures(doc, {
    y: Math.min(Math.max(y, 250), PDF_LAYOUT.PAGE_H - 25),
    blocks: [
      { label: 'Firma del técnico', sub: 'Nombre y fecha' },
      { label: 'Recibido / revisado', sub: 'Nombre y fecha' },
    ],
  })
  drawFooter(doc, { page: 1, total: 1, leftText: 'Orden de trabajo interna · MDA (sin valores)' })
}

// Ficha de UNA OT → un PDF.
export async function imprimirFichaOT(t, tecNombre, hechasSet) {
  // 419 kB que solo viajan si alguien pide un PDF de verdad.
  const { jsPDF } = await cargarPdf()
  const doc = new jsPDF()
  const logoData = await loadLogo()
  await dibujarUnaFicha(doc, t, tecNombre, hechasSet || new Set(Array.isArray(t.tareasHechas) ? t.tareasHechas : []), logoData, true)
  doc.save(`ficha_${(t.otCodigo || t.id)}.pdf`)
}

// Varias OT (de un técnico) → un solo PDF, una ficha por página. Usa el avance
// guardado de cada OT (tareasHechas).
export async function exportarFichasTecnico(trabajos, tecNombre, nombreArchivo) {
  const lista = (trabajos || []).filter(Boolean)
  if (!lista.length) return
  // 419 kB que solo viajan si alguien pide un PDF de verdad.
  const { jsPDF } = await cargarPdf()
  const doc = new jsPDF()
  const logoData = await loadLogo()
  for (let i = 0; i < lista.length; i++) {
    const t = lista[i]
    await dibujarUnaFicha(doc, t, tecNombre, new Set(Array.isArray(t.tareasHechas) ? t.tareasHechas : []), logoData, i === 0)
  }
  doc.save(nombreArchivo || 'fichas.pdf')
}
