// =====================================================================
// FichaTecnico.jsx — Orden de trabajo para el TÉCNICO (sin precios).
//
// Es la guía del trabajo asignado: qué vehículo, qué hacer y con qué
// repuestos. NUNCA muestra plata (ni valores, ni IVA, ni comisión).
//
// Fase 1: documento imprimible / PDF + vista en el celular.
// Fase 2: checklist interactivo (marca tareas, se guarda) + cronómetro
//         del trabajo (Iniciar/Pausar, se guarda). Persisten en el trabajo
//         (tareasHechas / cronoInicio / cronoAcumulado) vía actualizarTrabajo.
// =====================================================================
import { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { loadLogo, drawHeader, drawSectionHeader, drawDataBlock, drawSignatures, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS } from '../utils/pdfTheme'
import { fmtDate } from '../utils/helpers'
import { Button } from './ui'

// Segundos → "mm:ss" o "h:mm:ss".
const fmtTiempo = (seg) => {
  const s = Math.max(0, Math.floor(seg))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  const p = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`
}

export default function FichaTecnico({ trabajo: t, tecNombre, onClose, guardar }) {
  const items = Array.isArray(t.items) ? t.items : []
  const [hechas, setHechas] = useState(() => new Set(Array.isArray(t.tareasHechas) ? t.tareasHechas : []))
  const [cronoInicio, setCronoInicio] = useState(t.cronoInicio || null)
  const [acumulado, setAcumulado] = useState(t.cronoAcumulado || 0)
  const [ahora, setAhora] = useState(() => Date.now())

  // El cronómetro corre solo mientras cronoInicio está seteado.
  useEffect(() => {
    if (!cronoInicio) return
    const iv = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [cronoInicio])

  const corriendo = !!cronoInicio
  const segActuales = acumulado + (cronoInicio ? Math.floor((ahora - new Date(cronoInicio).getTime()) / 1000) : 0)

  const toggleTarea = (idx) => {
    setHechas(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      guardar?.({ tareasHechas: [...next] })
      return next
    })
  }
  const iniciarCrono = () => {
    const iso = new Date().toISOString()
    setCronoInicio(iso); setAhora(Date.now())
    guardar?.({ cronoInicio: iso })
  }
  const pausarCrono = () => {
    const seg = acumulado + Math.floor((Date.now() - new Date(cronoInicio).getTime()) / 1000)
    setAcumulado(seg); setCronoInicio(null)
    guardar?.({ cronoAcumulado: seg, cronoInicio: null })
  }

  // ---- PDF imprimible (sin precios) ----
  const imprimirFicha = async () => {
    const doc = new jsPDF()
    const { MARGIN, CONTENT_W } = PDF_LAYOUT
    const { NAVY, SLATE_300, SLATE_400, SLATE_600 } = PDF_COLORS
    const logoData = await loadLogo()

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
        body: items.map((it, idx) => [String(idx + 1), it.nombre || '—', String(it.cantidad || 1), '']),
        ...tableStylesItems,
        columnStyles: {
          0: { halign: 'center', cellWidth: 9, textColor: SLATE_400 },
          1: { cellWidth: 'auto', fontStyle: 'bold' },
          2: { halign: 'center', cellWidth: 18 },
          3: { halign: 'center', cellWidth: 20 },
        },
        margin: { left: MARGIN, right: MARGIN },
        // Casilla en la columna HECHO: cuadro vacío (para marcar a mano) o con
        // check si el técnico ya la marcó en la app.
        didDrawCell: (d) => {
          if (d.section !== 'body' || d.column.index !== 3) return
          const cx = d.cell.x + d.cell.width / 2, cy = d.cell.y + d.cell.height / 2
          doc.setDrawColor(...SLATE_600); doc.setLineWidth(0.4)
          doc.rect(cx - 2.4, cy - 2.4, 4.8, 4.8)
          if (hechas.has(d.row.index)) {
            doc.setLineWidth(0.7)
            doc.line(cx - 1.6, cy, cx - 0.4, cy + 1.5)
            doc.line(cx - 0.4, cy + 1.5, cx + 1.9, cy - 1.9)
          }
        },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    // Notas (renglones para escribir a mano)
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
    doc.save(`ficha_${(t.otCodigo || t.id)}.pdf`)
  }

  const totalTareas = items.length
  const listas = items.reduce((n, _it, idx) => n + (hechas.has(idx) ? 1 : 0), 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal__h">
          <div>
            <h3 style={{ margin: 0 }}>Ficha de trabajo</h3>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
              {t.otCodigo || t.id} · Técnico: <strong style={{ color: 'var(--text-2)' }}>{tecNombre?.(t.tecnicoId) || '—'}</strong>
            </div>
          </div>
          <button className="icobtn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="modal__b" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Vehículo */}
          <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Vehículo</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 14 }}>
              <span><strong className="mono">{(t.placa || '—').toUpperCase()}</strong></span>
              <span style={{ color: 'var(--text-3)' }}>{[t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || '—'}</span>
              {t.kilometraje ? <span style={{ color: 'var(--text-3)' }}>{Number(t.kilometraje).toLocaleString('es-CO')} km</span> : null}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Cliente: {t.cliente || '—'}</div>
          </div>

          {/* Motivo */}
          {t.observaciones ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Motivo / lo que reporta</div>
              <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{t.observaciones}</div>
            </div>
          ) : null}

          {/* Cronómetro */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: corriendo ? 'var(--accent-soft)' : 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Tiempo del trabajo</div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: corriendo ? 'var(--primary)' : 'var(--text)' }}>{fmtTiempo(segActuales)}</div>
            </div>
            {corriendo
              ? <Button variant="outline" onClick={pausarCrono} style={{ color: 'var(--amber-600)', borderColor: 'rgba(245,158,11,.4)' }}>Pausar</Button>
              : <Button variant="primary" onClick={iniciarCrono}>Iniciar</Button>}
          </div>

          {/* Checklist */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Trabajo a realizar</div>
              {totalTareas > 0 && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{listas}/{totalTareas} listas</span>}
            </div>
            {totalTareas === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Esta OT no tiene tareas/repuestos cargados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((it, idx) => {
                  const done = hechas.has(idx)
                  return (
                    <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: done ? 'var(--accent-soft)' : 'transparent' }}>
                      <input type="checkbox" checked={done} onChange={() => toggleTarea(idx)} style={{ width: 20, height: 20, accentColor: 'var(--primary)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--text-3)' : 'var(--text)' }}>{it.nombre || 'Ítem'}</span>
                      {(parseInt(it.cantidad) || 1) > 1 && <span className="mono" style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>x{parseInt(it.cantidad)}</span>}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="modal__f">
          <Button variant="outline" onClick={imprimirFicha}>Imprimir / PDF</Button>
          <Button variant="primary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  )
}
