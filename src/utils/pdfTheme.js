// =====================================================================
// pdfTheme.js — Sistema unificado de diseño para todos los PDFs.
//
// Usa una paleta y tipografía coherente con la app (Geist en pantalla;
// Helvetica en PDF porque jsPDF la trae built-in y se ve casi igual).
//
// Helpers:
//   - drawHeader(doc, opts)        → chip MDA + taller + tipo doc + nº + fechas
//   - drawSectionHeader(doc, t, y) → barra navy con título
//   - drawDataBlock(doc, items, y) → grid de columnas con label arriba / valor abajo
//   - drawTotalsBox(doc, opts)     → caja de totales con TOTAL navy
//   - drawSignatures(doc, opts)    → bloques de firma
//   - drawFooter(doc, opts)        → línea separadora + autor + paginación
//   - tableStyles                  → estilos para autoTable consistentes
// =====================================================================

import { TALLER } from './constants'

// Carga /logo.png como dataURL para embeber en el PDF.
// Devuelve null si falla (el header cae al chip "MDA").
export async function loadLogo(path = '/logo.png') {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (!type.includes('image')) return null
    const blob = await res.blob()
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
    if (!dataUrl) return null
    // Dimensiones naturales para preservar proporción en el PDF (no aplastar el logo)
    const dims = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ w: 0, h: 0 })
      img.src = dataUrl
    })
    return { dataUrl, w: dims.w, h: dims.h }
  } catch {
    return null
  }
}

// Paleta (alineada con index.css)
export const PDF_COLORS = {
  NAVY: [13, 27, 53],
  NAVY_700: [31, 50, 87],
  AMBER: [245, 158, 11],
  AMBER_500: [217, 119, 6],
  AMBER_100: [254, 243, 199],
  AMBER_TEXT: [146, 64, 14],
  RED_600: [220, 38, 38],
  RED_100: [254, 226, 226],
  RED_TEXT: [153, 27, 27],
  GREEN_600: [22, 163, 74],
  GREEN_100: [220, 252, 231],
  GREEN_TEXT: [22, 101, 52],
  BLUE_600: [37, 99, 235],
  BLUE_100: [219, 234, 254],
  BLUE_TEXT: [30, 64, 175],
  SLATE_50: [248, 250, 252],
  SLATE_100: [241, 245, 249],
  SLATE_200: [226, 232, 240],
  SLATE_300: [203, 213, 225],
  SLATE_400: [148, 163, 184],
  SLATE_500: [100, 116, 139],
  SLATE_600: [71, 85, 105],
  SLATE_700: [51, 65, 85],
  WHITE: [255, 255, 255],
}

// Geometría (en mm para A4)
export const PDF_LAYOUT = {
  PAGE_W: 210,
  PAGE_H: 297,
  MARGIN: 14,
  CONTENT_W: 182, // 210 - 14 - 14
  HEADER_BOTTOM_Y: 42, // donde termina el bloque header
}

// Mapa de colores de badges por estado
const BADGE_COLOR_MAP = {
  'Completado':           { bg: PDF_COLORS.GREEN_100, fg: PDF_COLORS.GREEN_TEXT, bd: [134, 239, 172] },
  'En Progreso':          { bg: PDF_COLORS.BLUE_100,  fg: PDF_COLORS.BLUE_TEXT,  bd: [147, 197, 253] },
  'En Prueba':            { bg: PDF_COLORS.BLUE_100,  fg: PDF_COLORS.BLUE_TEXT,  bd: [147, 197, 253] },
  'Pendiente':            { bg: PDF_COLORS.AMBER_100, fg: PDF_COLORS.AMBER_TEXT, bd: [253, 230, 138] },
  'En Diagnostico':       { bg: PDF_COLORS.AMBER_100, fg: PDF_COLORS.AMBER_TEXT, bd: [253, 230, 138] },
  'Esperando Repuestos':  { bg: PDF_COLORS.AMBER_100, fg: PDF_COLORS.AMBER_TEXT, bd: [253, 230, 138] },
  'Cancelado':            { bg: PDF_COLORS.RED_100,   fg: PDF_COLORS.RED_TEXT,   bd: [252, 165, 165] },
}

const DEFAULT_BADGE = { bg: PDF_COLORS.SLATE_100, fg: PDF_COLORS.SLATE_700, bd: PDF_COLORS.SLATE_300 }

// ----- HEADER ---------------------------------------------------------
// opts: { docType, docNumber, badge, dateRows, withLogo, logoData }
//  - docType:   "ORDEN DE TRABAJO" | "COTIZACION" | "REPORTE" | etc.
//  - docNumber: string visible a la derecha bajo docType
//  - badge:     {label, color?: 'green'|'amber'|'red'|'blue'|'navy'|'neutral'} | null
//                o bien {label, estado} (estado mapea a BADGE_COLOR_MAP)
//  - dateRows:  [{lbl, val}]  (FECHA EMISION, ENTREGA…)
export function drawHeader(doc, opts = {}) {
  const { docType = '', docNumber = '', badge = null, dateRows = [], logoData = null } = opts
  const { NAVY, AMBER, SLATE_200, SLATE_500 } = PDF_COLORS
  const { MARGIN, CONTENT_W } = PDF_LAYOUT

  // Logo: imagen real con proporción preservada (no se aplasta ni recorta).
  // Acepta string (compat) u objeto {dataUrl, w, h} devuelto por loadLogo.
  const logo = typeof logoData === 'string' ? { dataUrl: logoData } : (logoData || {})
  const logoUrl = logo.dataUrl
  const logoY = 10
  let logoBoxW = 20 // ancho real ocupado por el logo (para posicionar el texto)
  if (logoUrl && typeof logoUrl === 'string' && logoUrl.startsWith('data:image')) {
    const aspect = (logo.w && logo.h) ? (logo.w / logo.h) : 1
    const maxH = 20, maxW = 34
    let h = maxH, w = h * aspect
    if (w > maxW) { w = maxW; h = w / aspect }
    try {
      const fmtImg = logoUrl.includes('image/png') ? 'PNG' : 'JPEG'
      doc.addImage(logoUrl, fmtImg, MARGIN, logoY, w, h, undefined, 'FAST')
      logoBoxW = w
    } catch { /* si falla, sin logo */ }
  } else {
    doc.setFillColor(...AMBER)
    doc.roundedRect(MARGIN, logoY, 20, 20, 2, 2, 'F')
    doc.setTextColor(...NAVY)
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text('MDA', MARGIN + 10, logoY + 11.5, { align: 'center' })
    logoBoxW = 20
  }

  // Razón social + datos taller
  const infoX = MARGIN + logoBoxW + 5
  doc.setTextColor(...NAVY)
  doc.setFontSize(13)
  doc.setFont(undefined, 'bold')
  doc.text(TALLER.razonSocial || TALLER.nombre, infoX, 16.5)
  doc.setFontSize(7)
  doc.setTextColor(...SLATE_500)
  doc.setFont(undefined, 'bold')
  doc.text('TALLER AUTOMOTRIZ', infoX, 20.5)
  doc.setFont(undefined, 'normal')
  doc.text(`NIT ${TALLER.nit} · No responsable de IVA — Régimen Simple`, infoX, 24)
  doc.text(TALLER.direccion, infoX, 27.5)
  doc.text(`Cel. ${TALLER.celular} · ${TALLER.email}`, infoX, 31)

  // Tipo de documento (derecha, esquina superior)
  const rightX = MARGIN + CONTENT_W
  if (docType) {
    doc.setFontSize(8)
    doc.setTextColor(...SLATE_500)
    doc.setFont(undefined, 'bold')
    doc.text(docType, rightX, 14, { align: 'right' })
  }
  if (docNumber) {
    doc.setFontSize(15)
    doc.setTextColor(...NAVY)
    doc.setFont(undefined, 'bold')
    doc.text(docNumber, rightX, 21, { align: 'right' })
  }

  // Badge de estado (derecha, debajo del número)
  if (badge && badge.label) {
    const colors = badge.estado
      ? (BADGE_COLOR_MAP[badge.estado] || DEFAULT_BADGE)
      : (badge.color ? colorFromName(badge.color) : DEFAULT_BADGE)
    const label = badge.label.toUpperCase()
    doc.setFontSize(7)
    doc.setFont(undefined, 'bold')
    const w = doc.getTextWidth(label) + 8
    doc.setFillColor(...colors.bg)
    doc.setDrawColor(...colors.bd)
    doc.roundedRect(rightX - w, 23.5, w, 5, 0.8, 0.8, 'FD')
    doc.setTextColor(...colors.fg)
    doc.text(label, rightX - 4, 27, { align: 'right' })
  }

  // Fechas (derecha, formato label/value en dos columnas)
  if (dateRows.length) {
    doc.setFontSize(7)
    let y = 32
    dateRows.forEach(r => {
      doc.setTextColor(...SLATE_500)
      doc.setFont(undefined, 'bold')
      doc.text(r.lbl.toUpperCase(), rightX - 48, y)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'normal')
      doc.text(r.val, rightX, y, { align: 'right' })
      y += 4
    })
  }

  // Línea separadora navy
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, PDF_LAYOUT.HEADER_BOTTOM_Y, MARGIN + CONTENT_W, PDF_LAYOUT.HEADER_BOTTOM_Y)
  doc.setLineWidth(0.2)
  doc.setFont(undefined, 'normal')
}

function colorFromName(name) {
  switch (name) {
    case 'green':   return { bg: PDF_COLORS.GREEN_100, fg: PDF_COLORS.GREEN_TEXT, bd: [134, 239, 172] }
    case 'red':     return { bg: PDF_COLORS.RED_100,   fg: PDF_COLORS.RED_TEXT,   bd: [252, 165, 165] }
    case 'amber':   return { bg: PDF_COLORS.AMBER_100, fg: PDF_COLORS.AMBER_TEXT, bd: [253, 230, 138] }
    case 'blue':    return { bg: PDF_COLORS.BLUE_100,  fg: PDF_COLORS.BLUE_TEXT,  bd: [147, 197, 253] }
    case 'navy':    return { bg: PDF_COLORS.NAVY,      fg: PDF_COLORS.AMBER,      bd: PDF_COLORS.NAVY }
    case 'neutral':
    default:        return DEFAULT_BADGE
  }
}

// ----- SECTION HEADER -------------------------------------------------
export function drawSectionHeader(doc, title, y, width = PDF_LAYOUT.CONTENT_W) {
  const { NAVY, WHITE } = PDF_COLORS
  doc.setFillColor(...NAVY)
  doc.rect(PDF_LAYOUT.MARGIN, y, width, 5.4, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(7.2)
  doc.setFont(undefined, 'bold')
  doc.text(title.toUpperCase(), PDF_LAYOUT.MARGIN + 3, y + 3.6)
  doc.setTextColor(...NAVY)
  doc.setFont(undefined, 'normal')
  return y + 5.4
}

// ----- DATA BLOCK -----------------------------------------------------
// items: [{ label, value, bold?, size? }]
export function drawDataBlock(doc, items, y, height = 11) {
  const { NAVY, SLATE_300, SLATE_500 } = PDF_COLORS
  const { MARGIN, CONTENT_W } = PDF_LAYOUT

  doc.setDrawColor(...SLATE_300)
  doc.setLineWidth(0.2)
  doc.rect(MARGIN, y, CONTENT_W, height)
  const colW = CONTENT_W / items.length

  items.forEach((it, i) => {
    const x = MARGIN + i * colW
    const maxW = colW - 8
    doc.setFontSize(6.5)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(...SLATE_500)
    doc.text((it.label || '').toUpperCase(), x + 4, y + 3.6)

    doc.setFont(undefined, it.bold ? 'bold' : 'normal')
    doc.setTextColor(...NAVY)
    const baseSize = it.size || 9
    let fontSize = baseSize
    let val = (it.value ?? '—').toString()
    doc.setFontSize(fontSize)
    while (doc.getTextWidth(val) > maxW && fontSize > 7) {
      fontSize -= 0.5
      doc.setFontSize(fontSize)
    }
    while (doc.getTextWidth(val) > maxW && val.length > 4) {
      val = val.slice(0, -2) + '..'
    }
    doc.text(val, x + 4, y + 8.3)
  })

  doc.setFont(undefined, 'normal')
  return y + height
}

// ----- TOTALS BOX -----------------------------------------------------
// opts: { x, w, rows: [{lbl, val}], finalLabel, finalValue, y }
// Returns new y after box
export function drawTotalsBox(doc, opts) {
  const { x = 122, w = 74, rows = [], finalLabel = 'TOTAL', finalValue = '', y } = opts
  const { NAVY, AMBER, SLATE_300, SLATE_500, WHITE } = PDF_COLORS

  let tY = y + 4
  doc.setFontSize(8.5)
  rows.forEach(r => {
    doc.setTextColor(...SLATE_500)
    doc.setFont(undefined, 'normal')
    doc.text(r.lbl, x + 4, tY)
    doc.setTextColor(...NAVY)
    doc.text(r.val, x + w - 4, tY, { align: 'right' })
    doc.setDrawColor(...SLATE_300)
    doc.setLineDashPattern([0.5, 0.5], 0)
    doc.line(x + 4, tY + 2, x + w - 4, tY + 2)
    doc.setLineDashPattern([], 0)
    tY += 6
  })

  // Caja TOTAL navy
  doc.setFillColor(...NAVY)
  doc.rect(x, tY, w, 11, 'F')
  doc.setTextColor(...AMBER)
  doc.setFontSize(7)
  doc.setFont(undefined, 'bold')
  doc.text(finalLabel.toUpperCase(), x + 4, tY + 6.5)
  doc.setTextColor(...WHITE)
  doc.setFontSize(12.5)
  doc.text(finalValue, x + w - 4, tY + 7, { align: 'right' })
  doc.setFont(undefined, 'normal')

  return tY + 11
}

// ----- SIGNATURES -----------------------------------------------------
// opts: { y, blocks: [{label, sub?}] }
export function drawSignatures(doc, opts) {
  const { y, blocks = [] } = opts
  const { NAVY, SLATE_400 } = PDF_COLORS
  const { MARGIN, CONTENT_W } = PDF_LAYOUT
  const blockW = CONTENT_W / blocks.length

  doc.setDrawColor(...SLATE_400)
  doc.setLineWidth(0.3)
  blocks.forEach((b, i) => {
    const x = MARGIN + i * blockW
    const lineEnd = x + blockW - 8
    doc.line(x, y, lineEnd, y)
    doc.setFontSize(7.5)
    doc.setTextColor(...NAVY)
    doc.setFont(undefined, 'bold')
    doc.text((b.label || '').toUpperCase(), x, y + 4)
    if (b.sub) {
      doc.setFontSize(7)
      doc.setTextColor(...SLATE_400)
      doc.setFont(undefined, 'normal')
      doc.text(b.sub, x, y + 8)
    }
  })
  doc.setFont(undefined, 'normal')
}

// ----- FOOTER ---------------------------------------------------------
export function drawFooter(doc, { page = 1, total = 1, leftText = '' } = {}) {
  const { SLATE_300, SLATE_400 } = PDF_COLORS
  const { MARGIN, CONTENT_W, PAGE_H } = PDF_LAYOUT
  doc.setDrawColor(...SLATE_300)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, PAGE_H - 12, MARGIN + CONTENT_W, PAGE_H - 12)
  doc.setFontSize(6.5)
  doc.setTextColor(...SLATE_400)
  doc.setFont(undefined, 'normal')
  const left = leftText || `Generado por taller-automotriz-app.vercel.app · ${TALLER.razonSocial || TALLER.nombre}`
  doc.text(left, MARGIN, PAGE_H - 7)
  doc.text(`Página ${page} de ${total}`, MARGIN + CONTENT_W, PAGE_H - 7, { align: 'right' })
}

// ----- ESTILOS PARA autoTable ----------------------------------------
// Estilo "factura" para tablas de items (productos / servicios)
export const tableStylesItems = {
  styles: { fontSize: 8.5, cellPadding: 3, lineColor: PDF_COLORS.SLATE_100, lineWidth: 0.1 },
  headStyles: {
    fillColor: PDF_COLORS.SLATE_50,
    textColor: PDF_COLORS.SLATE_600,
    fontSize: 7,
    fontStyle: 'bold',
    lineColor: PDF_COLORS.NAVY,
    lineWidth: { bottom: 0.6 },
  },
}

// Estilo "data" para tablas de datos secundarios (resúmenes, listados)
export const tableStylesData = {
  styles: {
    fontSize: 8.5,
    cellPadding: 3,
    lineColor: PDF_COLORS.SLATE_100,
    lineWidth: 0.1,
    textColor: PDF_COLORS.SLATE_700,
  },
  headStyles: {
    fillColor: PDF_COLORS.NAVY,
    textColor: PDF_COLORS.WHITE,
    fontSize: 7.2,
    fontStyle: 'bold',
    lineWidth: 0,
  },
  alternateRowStyles: { fillColor: PDF_COLORS.SLATE_50 },
}

// Estilo "muted" para subtablas más sutiles
export const tableStylesMuted = {
  styles: { fontSize: 8, cellPadding: 2.5, lineColor: PDF_COLORS.SLATE_100, lineWidth: 0.1, textColor: PDF_COLORS.SLATE_600 },
  headStyles: {
    fillColor: PDF_COLORS.SLATE_100,
    textColor: PDF_COLORS.SLATE_700,
    fontSize: 7,
    fontStyle: 'bold',
    lineColor: PDF_COLORS.SLATE_300,
    lineWidth: { bottom: 0.4 },
  },
}

// Helper rápido para badges con color por severidad
export const SEVERITY_HEAD = {
  urgent: { fillColor: PDF_COLORS.RED_600, textColor: PDF_COLORS.WHITE },
  warn:   { fillColor: PDF_COLORS.AMBER_500, textColor: PDF_COLORS.WHITE },
  good:   { fillColor: PDF_COLORS.GREEN_600, textColor: PDF_COLORS.WHITE },
  info:   { fillColor: PDF_COLORS.BLUE_600, textColor: PDF_COLORS.WHITE },
  neutral:{ fillColor: PDF_COLORS.NAVY,     textColor: PDF_COLORS.WHITE },
}
