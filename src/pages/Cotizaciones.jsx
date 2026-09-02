import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { cargarPdf } from '../utils/pdfLazy'
import { fmt, fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre, fmtTelefono, cantidadItem, fmtCant } from '../utils/helpers'
import { TECNICOS, IVA_DEFAULT, TALLER } from '../utils/constants'
import { loadLogo as loadPdfLogo, drawHeader, drawSectionHeader, drawDataBlock, drawTotalsBox, drawSignatures, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS } from '../utils/pdfTheme'
import { MARCAS, getModelos, CILINDRAJES } from '../utils/vehiculos'
import MoneyInput from '../components/MoneyInput'
import ConfirmDialog from '../components/ConfirmDialog'
import { useClientes } from '../hooks/useClientes'
import { useInventario, formatCacheAge } from '../hooks/useInventario'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { Button, Badge, IconX, IconEdit, IconTrash, IconPdf, ANIOS } from '../components/ui'
import { recordarCotizacionWhatsApp } from '../utils/portalLink'

const ESTADO_COT = { PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' }

// Dias que lleva esperando respuesta una cotizacion. Se cuenta desde su fecha,
// no desde created_at: la fecha es la que el cliente vio en el documento.
function diasEsperando(c) {
  const t = new Date(c?.fecha || 0).getTime()
  if (!t) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}
// Vencida = paso su propia validez. Ahi ya no toca "revisar": toca recordar.
function seEnfrio(c) {
  return c?.estado === ESTADO_COT.PENDIENTE && diasEsperando(c) > (c?.validezDias || 15)
}

// Referencia corta y legible. Conviven ids nuevos cortos (COT-0002) con uids
// aleatorios de 13 chars (COT-mskjp68522nbo) que se partían en dos líneas y no
// se pueden leer ni dictar por teléfono: de esos mostramos los últimos 6. Mismo
// criterio que liqRef() en Liquidacion.jsx. El id completo queda en el title.
const cotRef = (id) => {
  let s = (id || '').toString().replace(/^COT-/i, '')
  if (s.length > 11) s = s.slice(-6)
  return s.toUpperCase()
}

export default function Cotizaciones({ notify, trabajos = [], onCrearTrabajo, cotizacionesHook }) {
  const { cotizaciones, guardarUna, eliminar: eliminarHook } = cotizacionesHook || {}
  const [vista, setVista] = useState('lista')
  const [editId, setEditId] = useState(null)
  const [detalleId, setDetalleId] = useState(null)
  const [confirmCfg, setConfirmCfg] = useState(null)
  // Anti doble-click de "Crear trabajo": cada click extra creaba OTRA OT (el
  // 23-jul-2026 salieron 22 duplicadas). Mientras se crea, el botón se bloquea.
  const [creandoTrabajoId, setCreandoTrabajoId] = useState(null)

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

  const imprimirCotizacion = async (c) => {
    // 419 kB que solo viajan si alguien pide un PDF de verdad.
    const { jsPDF, autoTable } = await cargarPdf()
    const doc = new jsPDF()
    const { MARGIN, CONTENT_W } = PDF_LAYOUT
    const { NAVY, SLATE_300, SLATE_400, SLATE_500, SLATE_600 } = PDF_COLORS
    const logoData = await loadPdfLogo()

    // ============= HEADER (logo real + tildes) =============
    const estado = c.estado || 'Pendiente'
    const badge = estado === 'Aprobada'
      ? { label: 'Aprobada', color: 'green' }
      : estado === 'Rechazada'
        ? { label: 'Rechazada', color: 'red' }
        : { label: `Vigente · ${c.validezDias || 15} días`, color: 'amber' }

    const venceVal = c.validezDias
      ? fmtDate(new Date(new Date(c.fecha).getTime() + (c.validezDias || 15) * 24 * 60 * 60 * 1000).toISOString())
      : '—'

    drawHeader(doc, {
      logoData,
      docType: 'COTIZACIÓN',
      docNumber: c.id || '—',
      badge,
      dateRows: [
        { lbl: 'Fecha emisión', val: fmtDate(c.fecha) },
        { lbl: 'Vence', val: venceVal },
      ],
    })

    // ============= CLIENTE =============
    let cursorY = 47
    cursorY = drawSectionHeader(doc, 'Cliente', cursorY)
    cursorY = drawDataBlock(doc, [
      { label: 'Nombre', value: c.cliente, bold: true },
      { label: 'Cédula / NIT', value: c.cedula },
      { label: 'Teléfono', value: c.telefonoCliente },
    ], cursorY)
    cursorY += 3

    // ============= VEHÍCULO (solo si hay datos; si no, no se dibuja la sección) =============
    const hayVehiculo = [c.placa, c.marca, c.modelo, c.ano, c.cilindraje].some(v => v && String(v).trim())
    if (hayVehiculo) {
      cursorY = drawSectionHeader(doc, 'Vehículo', cursorY)
      cursorY = drawDataBlock(doc, [
        { label: 'Placa', value: (c.placa || '').toUpperCase(), bold: true },
        { label: 'Marca / Modelo', value: `${c.marca || '—'} ${c.modelo || ''}`.trim() },
        { label: 'Año', value: String(c.ano || '—') },
        { label: 'Cilindraje', value: c.cilindraje || '—' },
      ], cursorY)
      cursorY += 3
    }

    // ============= ITEMS =============
    if (c.items?.length) {
      cursorY = drawSectionHeader(doc, 'Ítems cotizados', cursorY)

      const itemSkus = c.items.map(i => i.sku || i.codigo || '')
      const hasSkus = itemSkus.some(s => s)
      const itemRows = c.items.map((i, idx) => [
        String(idx + 1),
        i.nombre || '—',
        fmtCant(i),
        fmt(parseFloat(i.precio) || 0),
        i.iva > 0 ? `${i.iva}%` : '—',
        fmt((parseFloat(i.precio) || 0) * (cantidadItem(i))),
      ])

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
              doc.text(`Código ${sku}`, data.cell.x + 3, data.cell.y + data.cell.height - 2)
              doc.setFont(undefined, 'normal')
            }
          }
        },
      })

      cursorY = doc.lastAutoTable.finalY + 6

      const subtotal = c.subtotal || 0
      const iva = c.iva || 0
      const total = c.total || 0

      // OBSERVACIONES (izquierda) — misma cabecera de sección liviana que el resto
      const obsText = c.observaciones || 'Precios sujetos a disponibilidad de inventario al momento de la aprobación. Tiempo estimado de entrega: 1 día hábil. Incluye garantía de 90 días en repuestos originales y mano de obra. Esta cotización no genera obligación de compra ni reserva de inventario.'
      drawSectionHeader(doc, 'Observaciones', cursorY, 104)

      const obsLines = doc.splitTextToSize(obsText, 96)
      const obsHeight = Math.max(40, obsLines.length * 3.8 + 6)
      doc.setDrawColor(...SLATE_300)
      doc.setLineWidth(0.2)
      doc.rect(MARGIN, cursorY + 5.4, 104, obsHeight)
      doc.setFontSize(8)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'normal')
      doc.text(obsLines, MARGIN + 3, cursorY + 9.5)

      // Caja de totales (derecha, helper unificado)
      const rows = [{ lbl: 'Subtotal', val: fmt(subtotal) }]
      if (iva > 0) {
        // El rotulo salia siempre "IVA (19%)" aunque la cotizacion llevara items
        // a otra tasa: en un documento que ve el cliente eso es un dato falso.
        const tasas = [...new Set((c.items || []).filter(i => (parseFloat(i.iva) || 0) > 0).map(i => parseFloat(i.iva)))]
        rows.push({ lbl: tasas.length === 1 ? `IVA (${tasas[0]}%)` : 'IVA', val: fmt(iva) })
      }
      const boxX = 122, boxW = 74
      let tY = drawTotalsBox(doc, {
        y: cursorY, x: boxX, w: boxW,
        rows,
        finalLabel: 'Total cotizado',
        finalValue: fmt(total),
      })

      // Card aprobación (debajo de la caja de totales)
      tY += 4
      doc.setFillColor(...PDF_COLORS.SLATE_50)
      doc.setDrawColor(...SLATE_300)
      doc.setLineWidth(0.3)
      doc.roundedRect(boxX, tY, boxW, 15, 1.5, 1.5, 'FD')
      doc.setLineWidth(0.2)
      doc.setFontSize(7)
      doc.setTextColor(...SLATE_600)
      doc.setFont(undefined, 'normal')
      doc.text('Para aprobar esta cotización', boxX + boxW / 2, tY + 5, { align: 'center' })
      doc.text('escríbanos por WhatsApp o llame al', boxX + boxW / 2, tY + 8.5, { align: 'center' })
      doc.setFont(undefined, 'bold')
      doc.setTextColor(...NAVY)
      doc.text(TALLER.celular, boxX + boxW / 2, tY + 12.5, { align: 'center' })

      cursorY += obsHeight + 12
    }

    // ============= FIRMAS =============
    const firmaY = Math.max(cursorY + 16, 250)
    drawSignatures(doc, {
      y: firmaY,
      blocks: [
        { label: 'Firma cliente · aprobación', sub: 'Nombre, documento, fecha' },
        { label: 'Asesor de servicio', sub: 'Nombre, documento, fecha' },
      ],
    })

    drawFooter(doc, { page: 1, total: 1, leftText: `${TALLER.razonSocial || TALLER.nombre} · NIT ${TALLER.nit}` })
    doc.save(`${c.id || 'Cotizacion'}.pdf`)
  }

  const sorted = useMemo(() =>
    [...cotizaciones].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [cotizaciones])

  const stats = useMemo(() => ({
    total: cotizaciones.length,
    pendientes: cotizaciones.filter(c => c.estado === ESTADO_COT.PENDIENTE).length,
    aprobadas: cotizaciones.filter(c => c.estado === ESTADO_COT.APROBADA).length,
    valorPendiente: cotizaciones.filter(c => c.estado === ESTADO_COT.PENDIENTE).reduce((s, c) => s + (c.total || 0), 0),
  }), [cotizaciones])

  // Qué cotizaciones ya tienen OT. El vínculo lo deja App.jsx en las
  // observaciones del trabajo ("Creado desde cotizacion COT-xxx"); es el único
  // rastro que existe. Sirve para no ofrecer "Crear trabajo" dos veces.
  const cotsConOT = useMemo(() => {
    const s = new Set()
    for (const t of trabajos) {
      const m = /Creado desde cotizacion\s+(\S+?)\.?(?:\s|$)/i.exec(t.observaciones || '')
      if (m) s.add(m[1])
    }
    return s
  }, [trabajos])

  const crearTrabajoDesde = async (c) => {
    if (creandoTrabajoId) return
    setCreandoTrabajoId(c.id)
    try { await onCrearTrabajo(c) } finally { setCreandoTrabajoId(null) }
  }

  const aplicarEstado = async (cot, estado) => {
    try {
      await guardarUna({ ...cot, estado })
      notify(`Cotizacion ${estado.toLowerCase()}`, estado === ESTADO_COT.APROBADA ? 'success' : 'info')
    } catch (e) {
      notify(`No se pudo sincronizar: ${e.message}`, 'error')
    }
  }

  const cambiarEstado = async (id, estado) => {
    const cot = cotizaciones.find(c => c.id === id)
    if (!cot) return
    if (String(estado).toLowerCase().includes('rechaz')) {
      // Con el detalle cerrado antes de confirmar, la pantalla no dejaba ni una
      // pista de QUÉ se está rechazando: hay que decirlo en el diálogo.
      setConfirmCfg({
        title: 'Rechazar cotización',
        lead: `${cot.cliente || 'Sin cliente'}${cot.placa ? ` · ${cot.placa}` : ''} · ${fmt(cot.total || 0)} · Ref. ${cotRef(cot.id)}`,
        confirmLabel: 'Rechazar', tone: 'danger', onConfirm: () => aplicarEstado(cot, estado),
      })
      return
    }
    await aplicarEstado(cot, estado)
  }

  const eliminar = (id) => {
    // El nombre del cliente identifica la cotización mucho mejor que el uid al
    // confirmar; la referencia corta va de apoyo.
    const cot = cotizaciones.find(c => c.id === id)
    setConfirmCfg({
      title: 'Eliminar cotización',
      lead: `${cot?.cliente || 'Sin cliente'} · Ref. ${cotRef(id)} · no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await eliminarHook(id)
          notify('Cotización eliminada', 'info')
        } catch (e) {
          notify(`No se pudo eliminar en la nube: ${e.message}`, 'error')
        }
      },
    })
  }

  if (vista === 'nueva' || vista === 'editar') {
    const cot = vista === 'editar' ? cotizaciones.find(c => c.id === editId) : null
    return (
      <CotizacionForm
        cotizacion={cot}
        trabajos={trabajos}
        onSave={async (data) => {
          try {
            if (vista === 'editar') {
              const original = cotizaciones.find(c => c.id === editId)
              await guardarUna({ ...original, ...data, id: editId })
              notify('Cotización actualizada y sincronizada', 'success')
            } else {
              const nueva = { ...data, id: `COT-${uid()}`, estado: ESTADO_COT.PENDIENTE, fecha: new Date().toISOString() }
              await guardarUna(nueva)
              notify('Cotización creada y sincronizada', 'success')
            }
            setVista('lista')
            setEditId(null)
          } catch (e) {
            // Quedo guardada en local pero no en la nube
            notify(`Guardada solo en este equipo, no llegó al servidor: ${e.message}`, 'error')
            setVista('lista')
            setEditId(null)
          }
        }}
        onCancel={() => { setVista('lista'); setEditId(null) }}
      />
    )
  }

  const detalle = detalleId ? cotizaciones.find(c => c.id === detalleId) : null

  return (
    <>
    <style>{ESTILOS}</style>
    <div>
      {/* Los cuatro contadores tenian el mismo tamaño, asi que ninguno mandaba.
          Pendientes y su valor son lo que hay que perseguir: van juntos en un
          bloque ambar, porque son el mismo hecho contado de dos formas. Total y
          aprobadas bajan a linea de apoyo — ya estan tambien en los filtros. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Cotizaciones</h1>
          <div className="hd-head__sub">
            {stats.total} en total · {stats.aprobadas} aprobada{stats.aprobadas !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          {stats.pendientes > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderRadius: 14, background: 'var(--warn-bg-2)', whiteSpace: 'nowrap' }}>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.7px', color: 'var(--warn-fg)' }}>PENDIENTES</div>
                <div style={{ fontSize: 22, lineHeight: 1.05, fontWeight: 700, color: 'var(--warn-fg)', marginTop: 5 }}>{stats.pendientes}</div>
              </div>
              <div style={{ width: 1, height: 34, background: 'var(--warn-fg)' }} />
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.7px', color: 'var(--warn-fg)' }}>VALOR PENDIENTE</div>
                <div className="hd-n" style={{ fontSize: 22, lineHeight: 1.05, fontWeight: 700, color: 'var(--warn-fg)', marginTop: 5 }}>{fmt(stats.valorPendiente)}</div>
              </div>
            </div>
          )}
          <Button variant="primary" onClick={() => setVista('nueva')}>+ Nueva cotizacion</Button>
        </div>
      </div>

      <div className="card">
        <div className="card__h"><h3>Cotizaciones</h3><span className="count">{sorted.length}</span></div>
        <div className="card__b card__b--flush">
          {/* tbl-cards--cot: en celular la fila se recompone en 3 lineas
              (ref+placa · total / cliente / estado + vehiculo·fecha + acciones)
              en vez de 7 pares etiqueta/valor apilados. Las clases td-* son solo
              anclajes de CSS: ningun dato cambia de contenido ni de orden. */}
          {sorted.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)' }}>
              <p>No hay cotizaciones registradas.</p>
            </div>
          ) : (
            <table className="tbl tbl-cards tbl-cards--cot">
              <thead>
                <tr>
                  <th>Ref.</th>
                  <th>Cliente</th>
                  <th>Placa</th>
                  <th>Vehículo</th>
                  <th>Estado</th>
                  <th className="c-right">Total</th>
                  <th>Fecha</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => {
                  const bc = c.estado === ESTADO_COT.APROBADA ? 'success'
                    : c.estado === ESTADO_COT.RECHAZADA ? 'danger' : 'warning'
                  const yaTieneOT = cotsConOT.has(c.id)
                  return (
                    <tr key={c.id} className="cot-row" onClick={() => setDetalleId(c.id)}>
                      <td className="c-mono td-ref" data-label="Ref." title={c.id}>{cotRef(c.id)}</td>
                      <td className="c-name">{c.cliente || '—'}</td>
                      <td className="c-mono td-placa" style={{ fontWeight: 700 }} data-label="Placa">{c.placa || '—'}</td>
                      <td className="c-muted td-veh" data-label="Vehículo">{[c.marca, c.modelo, c.ano].filter(Boolean).join(' ') || '—'}</td>
                      <td className="td-estado" data-label="Estado"><Badge tone={bc}>{c.estado}</Badge></td>
                      <td className="c-right c-mono td-total" data-label="Total">{fmt(c.total)}</td>
                      <td className="c-muted td-fecha" data-label="Fecha">
                        {fmtDate(c.fecha)}
                        {/* Una fecha sola no dice nada; los dias esperando, si. Sin esto
                            una cotizacion de hace dos meses se ve igual que la de ayer. */}
                        {c.estado === ESTADO_COT.PENDIENTE && diasEsperando(c) > 0 && (
                          <div className="cot-espera" data-fria={seEnfrio(c) ? '1' : undefined}>
                            {diasEsperando(c) === 1 ? 'hace 1 día' : `hace ${diasEsperando(c)} días`}
                          </div>
                        )}
                      </td>
                      {/* Una sola acción visible: la que toca ahora. Aprobar, rechazar,
                          PDF, editar y eliminar viven en el detalle o en el menú "⋯",
                          para que el tacho nunca quede al lado de algo que se usa a diario. */}
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        <div className="actions-cell">
                          {/* Sigue habiendo UNA sola accion visible, pero es la que toca
                              AHORA: mientras la cotizacion esta vigente, revisarla; cuando
                              ya paso su validez sin respuesta, lo que falta no es mirarla
                              otra vez, es recordarsela al cliente. */}
                          {c.estado === ESTADO_COT.PENDIENTE && !seEnfrio(c) && (
                            <Button variant="outline" size="sm" onClick={() => setDetalleId(c.id)}>Revisar</Button>
                          )}
                          {seEnfrio(c) && (
                            <Button variant="outline" size="sm" className="btn-wa"
                              title={c.telefonoCliente
                                ? `Recordar por WhatsApp al ${c.telefonoCliente}`
                                : 'Este cliente no tiene teléfono: se abrirá WhatsApp para elegir el contacto'}
                              onClick={() => recordarCotizacionWhatsApp(c)}>
                              Recordar
                            </Button>
                          )}
                          {c.estado === ESTADO_COT.APROBADA && onCrearTrabajo && !yaTieneOT && (
                            <Button variant="primary" size="sm" disabled={creandoTrabajoId !== null}
                              onClick={() => crearTrabajoDesde(c)}>
                              {creandoTrabajoId === c.id ? 'Creando…' : 'Crear trabajo'}</Button>
                          )}
                          <MenuFila
                            etiqueta={`Más acciones de la cotización ${cotRef(c.id)}`}
                            opciones={[
                              ...(seEnfrio(c) ? [{ label: 'Revisar', onSelect: () => setDetalleId(c.id) }] : []),
                              { label: 'Descargar PDF', icon: <IconPdf />, onSelect: () => imprimirCotizacion(c) },
                              { label: 'Editar', icon: <IconEdit />, onSelect: () => { setEditId(c.id); setVista('editar') } },
                              { separador: true },
                              { label: 'Eliminar', icon: <IconTrash />, peligro: true, onSelect: () => eliminar(c.id) },
                            ]}
                          />
                        </div>
                      </td>
                      <td className="td-chevron" aria-hidden="true">›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
    {detalle && (
      <DetalleCotizacion
        cot={detalle}
        yaTieneOT={cotsConOT.has(detalle.id)}
        creando={creandoTrabajoId === detalle.id}
        creandoAlguna={creandoTrabajoId !== null}
        onClose={() => setDetalleId(null)}
        onPdf={() => imprimirCotizacion(detalle)}
        onEditar={() => { setDetalleId(null); setEditId(detalle.id); setVista('editar') }}
        onAprobar={() => { setDetalleId(null); cambiarEstado(detalle.id, ESTADO_COT.APROBADA) }}
        onRechazar={() => { setDetalleId(null); cambiarEstado(detalle.id, ESTADO_COT.RECHAZADA) }}
        onCrearTrabajo={onCrearTrabajo ? () => crearTrabajoDesde(detalle) : null}
      />
    )}
    <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </>
  )
}

// Medidas del menú "⋯". Deben coincidir con .cot-menu del <style> de abajo:
// se usan para decidir si cabe en pantalla ANTES de pintarlo.
const ANCHO_MENU = 210
const ALTO_MENU = 210

// Menú "⋯" de una fila. Va en position:fixed porque el cuerpo de la tarjeta
// recorta con overflow-x y el desplegable de las últimas filas quedaría cortado.
// Teclado completo: Escape cierra y devuelve el foco, flechas recorren, Tab sale.
function MenuFila({ etiqueta, opciones }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const cerrar = useCallback((devolverFoco) => {
    setAbierto(false)
    if (devolverFoco) btnRef.current?.focus()
  }, [])

  // El menú se alinea al borde derecho del botón, pero se mantiene siempre
  // dentro de la pantalla: en celular el botón queda a la izquierda de la
  // tarjeta y alineado a la derecha se salía del viewport. Si no cabe abajo
  // (última fila), se despliega hacia arriba.
  const abrir = () => {
    const r = btnRef.current.getBoundingClientRect()
    const left = Math.min(Math.max(8, r.right - ANCHO_MENU), window.innerWidth - ANCHO_MENU - 8)
    const cabeAbajo = r.bottom + 6 + ALTO_MENU <= window.innerHeight
    setPos(cabeAbajo
      ? { top: r.bottom + 6, left }
      : { bottom: window.innerHeight - r.top + 6, left })
    setAbierto(true)
  }

  useEffect(() => {
    if (!abierto) return
    const items = () => Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])
    // preventScroll: enfocar sin mover la página, que además dispararía el
    // listener de scroll de abajo y cerraría el menú recién abierto.
    items()[0]?.focus({ preventScroll: true })

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(true); return }
      if (e.key === 'Tab') { cerrar(false); return }
      const list = items()
      if (!list.length) return
      const i = list.indexOf(document.activeElement)
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus() }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus() }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus() }
    }
    const fuera = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      cerrar(false)
    }
    const reposicionar = () => cerrar(false)

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('click', fuera, true)
    window.addEventListener('resize', reposicionar)
    window.addEventListener('scroll', reposicionar, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('click', fuera, true)
      window.removeEventListener('resize', reposicionar)
      window.removeEventListener('scroll', reposicionar, true)
    }
  }, [abierto, cerrar])

  return (
    <>
      <button
        ref={btnRef} type="button" className="icon-btn"
        aria-label={etiqueta} title="Más acciones"
        aria-haspopup="menu" aria-expanded={abierto}
        onClick={() => (abierto ? cerrar(false) : abrir())}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      {abierto && (
        <div ref={menuRef} className="cot-menu" role="menu" aria-label={etiqueta} style={pos}>
          {opciones.map((o, i) => o.separador ? (
            <hr key={`s${i}`} />
          ) : (
            <button key={o.label} type="button" role="menuitem"
              className={o.peligro ? 'peligro' : undefined}
              onClick={() => { cerrar(false); o.onSelect() }}>
              {o.icon}<span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// Detalle de la cotización: es lo que se abre al tocar la fila. Aquí viven las
// decisiones (aprobar / rechazar / crear trabajo), con los ítems a la vista, en
// vez de repartidas en 13 filas de la tabla.
function DetalleCotizacion({ cot, yaTieneOT, creando, creandoAlguna, onClose, onPdf, onEditar, onAprobar, onRechazar, onCrearTrabajo }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const tone = cot.estado === ESTADO_COT.APROBADA ? 'success'
    : cot.estado === ESTADO_COT.RECHAZADA ? 'danger' : 'warning'
  const vehiculo = [cot.marca, cot.modelo, cot.ano].filter(Boolean).join(' ')
  const datos = [
    { k: 'Cliente', v: cot.cliente || '—' },
    { k: 'Cédula / NIT', v: cot.cedula || '—' },
    { k: 'Teléfono', v: cot.telefonoCliente || '—' },
    { k: 'Placa', v: (cot.placa || '—').toUpperCase() },
    { k: 'Vehículo', v: vehiculo || '—' },
    { k: 'Fecha', v: fmtDate(cot.fecha) },
  ]

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal cot-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={`Cotización ${cotRef(cot.id)}`}>
        <div className="modal__h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
            <span className="mono" title={cot.id} style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
              COT · {cotRef(cot.id)}
            </span>
            <Badge tone={tone}>{cot.estado}</Badge>
            {yaTieneOT && <Badge tone="info">Ya tiene OT</Badge>}
          </div>
          <button className="icobtn" onClick={onClose} aria-label="Cerrar" style={{ flexShrink: 0 }}><IconX /></button>
        </div>

        <div className="modal__b">
          <div className="cot-dl">
            {datos.map(d => (
              <div key={d.k}><span className="eyebrow">{d.k}</span><span>{d.v}</span></div>
            ))}
          </div>

          {cot.items?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{cot.items.length} {cot.items.length === 1 ? 'ítem' : 'ítems'}</div>
              {/* tbl-cards, igual que el editor y que la lista: sin esa clase la
                  tabla hereda `.tbl,table{min-width:580px}` y dentro de la hoja de
                  640px se desborda 227px en un telefono. Es la pantalla donde se
                  aprueba o se rechaza, asi que el de mostrador tenia que arrastrar
                  la tabla de lado para ver por cuanto es cada linea. */}
              <table className="tbl tbl-cards tbl-cards--detalle">
                <tbody>
                  {cot.items.map((i, idx) => (
                    <tr key={i.id || idx}>
                      <td className="c-name" title={i.nombre || undefined}>{i.nombre || '—'}</td>
                      <td className="c-muted" data-label="Cantidad" style={{ whiteSpace: 'nowrap' }}>{fmtCant(i)} × {fmt(parseFloat(i.precio) || 0)}</td>
                      <td className="c-right c-mono" data-label="Total">{fmt((parseFloat(i.precio) || 0) * cantidadItem(i))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="cot-total">
            <span className="eyebrow">Total cotizado</span>
            <span className="mono">{fmt(cot.total)}</span>
          </div>

          {cot.observaciones && (
            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{cot.observaciones}</p>
          )}
        </div>

        <div className="modal__f" style={{ flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={onPdf}><IconPdf /> PDF</Button>
          <Button variant="outline" size="sm" onClick={onEditar}><IconEdit /> Editar</Button>
          <span style={{ flex: 1 }} />
          {cot.estado === ESTADO_COT.PENDIENTE && (
            <>
              <Button variant="outline" style={{ color: 'var(--red-600)' }} onClick={onRechazar}>Rechazar</Button>
              <Button variant="success" onClick={onAprobar}>Aprobar</Button>
            </>
          )}
          {cot.estado === ESTADO_COT.APROBADA && onCrearTrabajo && !yaTieneOT && (
            <Button variant="primary" disabled={creandoAlguna} onClick={onCrearTrabajo}>
              {creando ? 'Creando…' : 'Crear trabajo'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

const ESTILOS = `
.cot-row{cursor:pointer}
.cot-menu{position:fixed;z-index:120;width:210px;padding:6px;border-radius:var(--r-md);background:var(--bg-raised);border:1px solid var(--border);box-shadow:var(--shadow-lg)}
.cot-menu button{display:flex;align-items:center;gap:11px;width:100%;padding:11px 12px;border-radius:var(--r-sm);background:none;border:none;font:inherit;font-size:14.5px;font-weight:500;color:var(--text);text-align:left}
.cot-menu button:hover{background:var(--fill)}
.cot-menu button:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
.cot-menu button svg{width:16px;height:16px;flex-shrink:0;color:var(--text-3)}
.cot-menu button.peligro,.cot-menu button.peligro svg{color:var(--red-600)}
.cot-menu button.peligro:hover{background:var(--bad-bg)}
.cot-menu hr{margin:5px 8px;border:none;border-top:1px solid var(--border)}
.cot-dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px 18px}
.cot-dl>div{display:flex;flex-direction:column;gap:3px;min-width:0}
.cot-dl>div>span:last-child{font-size:15px;font-weight:600;color:var(--text);overflow-wrap:anywhere}
/* Con muchos ítems el detalle se desplaza; sin esto hay que bajar hasta el
   final para encontrar Aprobar/Rechazar, que es justo a lo que se entra. */
.cot-modal .modal__f{position:sticky;bottom:0;background:var(--bg-raised)}
.cot-modal .tbl tbody td:first-child{padding-left:0}
.cot-modal .tbl tbody td:last-child{padding-right:0}
.cot-total{display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-top:16px;padding-top:13px;border-top:1px solid var(--border)}
.cot-total .mono{font-size:22px;font-weight:700;color:var(--text);letter-spacing:-.02em}
`

function CotizacionForm({ cotizacion, trabajos = [], onSave, onCancel }) {
  const isEdit = !!cotizacion
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()

  const [form, setForm] = useState({
    cedula: cotizacion?.cedula || '',
    cliente: cotizacion?.cliente || '',
    telefonoCliente: cotizacion?.telefonoCliente || '',
    placa: cotizacion?.placa || '',
    marca: cotizacion?.marca || '',
    modelo: cotizacion?.modelo || '',
    ano: cotizacion?.ano || '',
    cilindraje: cotizacion?.cilindraje || '',
    observaciones: cotizacion?.observaciones || '',
    validezDias: cotizacion?.validezDias || 15,
  })
  // Un item que ya llega con descripcion entra BLOQUEADO: asi al tocarlo se puede
  // editar el texto sin que se reabra el buscador de inventario. Era el bug de
  // "no me deja editar la descripcion" en cotizaciones ya guardadas.
  const [items, setItems] = useState(() =>
    (cotizacion?.items || []).map(i => i.nombre?.trim() ? { ...i, _bloqueado: true } : i)
  )

  // Que campo del bloque Cliente tiene el cursor: decide bajo cual de los dos se
  // despliega la lista de resultados.
  const [campoActivo, setCampoActivo] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const seleccionarCliente = (c) => {
    set('cedula', normalizarDoc(c))
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', fmtTelefono(c.telefono || c.phone || ''))
    setResultados([])
  }

  // Inventario centralizado desde Cuentti
  const {
    inventario,
    loading: invLoading,
    refreshing: invRefreshing,
    cacheAge: invCacheAge,
    isStale: invIsStale,
    refresh: refrescarInventario,
  } = useInventario()
  const [itemSearch, setItemSearch] = useState({})
  const searchTimers = useRef({})
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 10000)
    return () => clearInterval(id)
  }, [])

  const buscarEnInventario = useCallback((itemId, query) => {
    if (searchTimers.current[itemId]) clearTimeout(searchTimers.current[itemId])
    if (!query || query.length < 2) {
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results: [], show: false } }))
      return
    }
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
        if (codigo === q || sku === q || barras === q) score = 100
        else if (codigo.startsWith(q) || sku.startsWith(q) || barras.startsWith(q)) score = 80
        else if (nombre === q) score = 70
        else if (nombre.startsWith(q)) score = 60
        else if (nombre.includes(' ' + q)) score = 50
        else if (nombre.includes(q)) score = 40
        else if (codigo.includes(q) || sku.includes(q) || barras.includes(q)) score = 30
        else score = 35
        if (p.stock > 0) score += 5
        scored.push({ ...p, _score: score })
      }
      scored.sort((a, b) => b._score - a._score)
      const results = scored.slice(0, 12)
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results, show: results.length > 0 } }))
    }, 150)
  }, [inventario])

  const cambiarProducto = (itemId) => {
    // Volver a buscar otro producto: limpia el bloqueo y la referencia al SKU.
    updateItem(itemId, '_bloqueado', false)
    updateItem(itemId, 'nombreInventario', '')
    updateItem(itemId, 'sku', '')
    updateItem(itemId, 'codigo', '')
  }

  const seleccionarProducto = (itemId, producto) => {
    updateItem(itemId, 'nombre', producto.nombre)
    updateItem(itemId, 'precio', producto.precio)
    updateItem(itemId, 'iva', producto.iva)
    updateItem(itemId, 'codigo', producto.codigo || producto.sku || '')
    updateItem(itemId, 'sku', producto.sku || '')
    updateItem(itemId, 'esServicio', !!producto.esServicio)
    updateItem(itemId, 'nombreInventario', producto.nombre)
    // _bloqueado evita que el proximo foco/tecla reabra el buscador. Sin esto,
    // tocar una linea ya elegida (ej. "MANO DE OBRA") reabria el overlay y no
    // dejaba editar la descripcion: era el bug reportado.
    updateItem(itemId, '_bloqueado', true)
    setItemSearch(prev => ({ ...prev, [itemId]: { query: '', results: [], show: false } }))
  }

  const modelos = useMemo(() => getModelos(form.marca), [form.marca])

  const addItem = () => setItems(prev => [...prev, { id: uid(), nombre: '', precio: 0, cantidad: 1, iva: IVA_DEFAULT }])
  const updateItem = (id, field, value) => setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id))

  const totales = useMemo(() => {
    let subtotal = 0, iva = 0, total = 0
    items.forEach(i => {
      const precio = parseFloat(i.precio) || 0
      const cant = cantidadItem(i)
      const ivaPct = parseFloat(i.iva) || 0
      const lineaTotal = precio * cant
      if (ivaPct > 0) {
        const base = lineaTotal / (1 + ivaPct / 100)
        subtotal += base; iva += lineaTotal - base
      } else { subtotal += lineaTotal }
      total += lineaTotal
    })
    return { subtotal: Math.round(subtotal), iva: Math.round(iva), total: Math.round(total) }
  }, [items])

  // Candado anti doble-click, igual que en Orden de Trabajo. Alli existe porque
  // el 23-jul-2026 clicks repetidos crearon 22 OT duplicadas; aqui faltaba, y una
  // cotizacion duplicada llega igual al cliente.
  const guardandoRef = useRef(false)
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (guardandoRef.current) return
    if (!form.cliente) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      // _bloqueado es solo estado de la interfaz: no debe viajar a la base.
      const itemsLimpios = items.map(item => {
        const resto = { ...item }
        delete resto._bloqueado
        return resto
      })
      await onSave({ ...form, placa: (form.placa || '').toUpperCase(), ano: parseInt(form.ano) || null, items: itemsLimpios, ...totales })
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div>
      {/* hd-head, el mismo encabezado que usan Orden de Trabajo y la LISTA de
          Cotizaciones. Antes este formulario usaba .pagehd, con h2 a 30px: al
          pasar de una pantalla a otra el titulo saltaba de 22px a 30px, y la
          incoherencia se notaba sin salir de Cotizaciones. La regla es
          `.hd-head__t h1`, asi que la etiqueta tiene que ser h1: con h2 el
          titulo se quedaria sin estilo ninguno. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>{isEdit ? 'Editar cotización' : 'Nueva cotización'}</h1>
          {isEdit && cotizacion && (
            <div className="hd-head__sub">
              {cotizacion.id && <span className="hd-mono" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{String(cotizacion.id).startsWith('COT-') ? cotizacion.id : `COT-${cotizacion.id}`}</span>}
              {cotizacion.fecha && <> · <span>Creada {fmtDate(cotizacion.fecha)}</span></>}
              {/* Ternario y no `&&`: con && , un validezDias en 0 imprimiria un
                  "0" suelto en el subtitulo. */}
              {cotizacion.validezDias ? <> · <span>Válida {cotizacion.validezDias} días</span></> : null}
              {cotizacion.estado && <> · <span className={`hd-chip hd-chip--${
                cotizacion.estado === ESTADO_COT.APROBADA ? 'ok' :
                cotizacion.estado === ESTADO_COT.RECHAZADA ? 'bad' :
                'warn'
              }`}>{cotizacion.estado}</span></>}
            </div>
          )}
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <Button type="button" variant="outline" onClick={onCancel}>Volver</Button>
        </div>
      </div>
      {/* marginTop:16 porque .hd-head no trae el margin-bottom:22px que si tenia
          .pagehd. Sin esto el titulo queda pegado a la primera tarjeta. Es lo
          mismo que hace TrabajoForm. */}
      <form onSubmit={handleSubmit} className="form-stack" style={{ marginTop: 16 }}>
        {/* Cliente + Vehiculo side-by-side at desktop */}
        <div className="form-row-2">
        <div className="card">
          <div className="card__h"><h3>Cliente</h3></div>
          <div className="card__b">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* campoActivo, igual que en Orden de Trabajo: la lista de clientes se
                  pinta debajo del campo donde se esta escribiendo. Sin esto salia
                  siempre bajo "Cedula / NIT" aunque la busqueda viniera del nombre. */}
              <div className="field" style={{ position: 'relative' }}>
                <label>Cédula / NIT</label>
                <input className="input" value={form.cedula} placeholder="Buscar por documento..."
                  onFocus={() => setCampoActivo('cedula')}
                  onChange={e => { set('cedula', e.target.value); buscarDebounced(e.target.value) }} />
                {resultados.length > 0 && campoActivo === 'cedula' && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                    {resultados.map((c, i) => (
                      <div key={i} onMouseDown={() => seleccionarCliente(c)}
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
                <label>Nombre del cliente <span className="req">*</span></label>
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
                <input className="input" value={form.telefonoCliente} placeholder="3001234567" onChange={e => set('telefonoCliente', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__h"><h3>Vehículo</h3></div>
          <div className="card__b">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label>Placa</label>
                <input className="input" value={form.placa} placeholder="ABC123" style={{ textTransform: 'uppercase' }}
                  onChange={e => {
                    const placa = e.target.value
                    set('placa', placa)
                    if (placa.length >= 6) {
                      const prev = trabajos.find(t => (t.placa || '').toUpperCase() === placa.toUpperCase())
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
                <label>Año</label>
                <select className="input" value={form.ano} onChange={e => set('ano', e.target.value)}>
                  <option value="">Año</option>
                  {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Marca</label>
                <select className="input" value={form.marca} onChange={e => { set('marca', e.target.value); set('modelo', '') }}>
                  <option value="">Seleccionar</option>
                  {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Modelo</label>
                <select className="input" value={form.modelo} onChange={e => set('modelo', e.target.value)} disabled={!form.marca}>
                  <option value="">Seleccionar</option>
                  {modelos.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Cilindraje</label>
                {/* Lista desplegable, igual que en Orden de Trabajo, en vez de
                    texto libre: asi el dato entra siempre con el mismo formato. */}
                <select className="input" value={form.cilindraje} onChange={e => set('cilindraje', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {form.cilindraje && !CILINDRAJES.some(c => `${c}L` === form.cilindraje) && <option value={form.cilindraje}>{form.cilindraje}</option>}
                  {CILINDRAJES.map(c => <option key={c} value={`${c}L`}>{c} L</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
        </div>{/* end Cliente+Vehiculo grid */}

        <div className="card">
          {/* card__h + h3, igual que Cliente, Vehiculo, Observaciones y Validez.
              Antes era un div suelto con .card-title y estilos en linea: quedaba
              sin el relleno ni la linea inferior de las demas tarjetas, y por eso
              se veia a medio terminar. (Nota: .card__h h3 tambien declara
              font-weight:700, igual que .card-title; no es el motivo del cambio.
              Se renderiza como 700 porque solo se cargan esos pesos de Plex.) */}
          <div className="card__h">
            <h3>Ítems</h3>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>+ Agregar línea</Button>
          </div>
          <div className="card__b">
          {invLoading && <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Cargando inventario de Cuentti...</p>}
          {items.length === 0 ? (
            /* Mismo bloque de estado vacio que usa Orden de Trabajo. Las clases
               importan: un <p> suelto pinta 15px/400 en vez de 13px/600, y
               .hd-sub (11px) no es lo mismo que .hd-void__s (12px). */
            <div className="hd-void">
              <div className="hd-void__t">Sin ítems todavía</div>
              <div className="hd-void__s">Agrega una línea y busca productos del inventario.</div>
            </div>
          ) : (
            // tbl-cards: en celular cada linea se vuelve una tarjeta con su rotulo
            // delante del dato, en vez de una tabla que hay que arrastrar de lado.
            // Sin esta clase, la regla `.tbl,table{min-width:580px}` de index.css
            // dejaba la tabla rigida en 580px dentro de una pantalla de 375: el
            // IVA, el Total y los precios quedaban fuera. Medido: 231px de exceso.
            <div className="table-wrap">
              <table className="tbl tbl-cards tbl-cards--items">
                <thead>
                  <tr>
                    <th style={{ width: '38%' }}>Descripción</th>
                    <th style={{ width: '16%' }}>Precio</th>
                    <th style={{ width: '10%' }}>Cant.</th>
                    <th style={{ width: '10%' }}>IVA %</th>
                    <th style={{ width: '16%' }} className="text-right">Total</th>
                    <th style={{ width: '5%' }}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const lineTotal = (parseFloat(item.precio) || 0) * (cantidadItem(item))
                    const search = itemSearch[item.id] || {}
                    return (
                      <tr key={item.id}>
                        <td className="c-name td-desc" data-label="Descripción">
                          {/* min-width:0 es lo que permite que la celda encoja. Sin el,
                              un nombre largo del inventario ("ACEITE WOLF OFFICIALTECH
                              5W40 C3 1L VW 511 00") empuja la columna y desborda: medido,
                              166px de exceso a 1024px de ancho y 242px a 375px. */}
                          <div style={{ position: 'relative', minWidth: 0 }}>
                            {/* title: el nombre completo al pasar el cursor. Los del
                                inventario llegan a 50 caracteres y no caben en la celda a
                                ningun ancho; recortar con puntos suspensivos y dar el
                                texto entero en el title es lo que deja leerlo sin romper
                                la tabla. */}
                            <input className="form-input" value={item.nombre}
                              title={item.nombre || undefined}
                              placeholder={item._bloqueado ? 'Editar descripción...' : 'Buscar producto o escribir...'}
                              autoComplete="off" spellCheck={false}
                              onChange={e => {
                                updateItem(item.id, 'nombre', e.target.value)
                                if (!item._bloqueado) buscarEnInventario(item.id, e.target.value)
                              }}
                              onFocus={() => { if (!item._bloqueado && item.nombre?.length >= 2) buscarEnInventario(item.id, item.nombre) }}
                              onBlur={() => setTimeout(() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } })), 250)}
                              onKeyDown={e => { if (e.key === 'Escape') setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } })) }}
                              style={{ padding: item._bloqueado ? '6px 36px 6px 10px' : '6px 10px', fontSize: 13, fontWeight: item._bloqueado ? 600 : 400 }} />
                            {invLoading && !item._bloqueado && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-3)' }}>...</span>}
                            {item._bloqueado && (
                              <button type="button" onClick={() => cambiarProducto(item.id)}
                                title={`Cambiar producto (actual: ${item.nombreInventario || item.sku || 'sin SKU'})`}
                                aria-label="Cambiar producto"
                                className="cot-cambiar-prod">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
                                </svg>
                              </button>
                            )}
                          </div>
                          {/* Mismo command palette que la pantalla de OT (clases cmd-*),
                              en vez del overlay propio: asi las dos pantallas se ven y se
                              comportan igual. */}
                          {search.show && search.results.length > 0 && (
                            <div className="cmd-backdrop" onClick={() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>
                              <div className="cmd-palette" onClick={e => e.stopPropagation()}>
                                <div className="cmd-header">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                                  </svg>
                                  <span className="cmd-header__query">{search.query || item.nombre}</span>
                                  <span className="cmd-header__count"><strong>{search.results.length}</strong> {search.results.length === 1 ? 'resultado' : 'resultados'}</span>
                                  <kbd className="cmd-kbd" onClick={() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>Esc</kbd>
                                </div>
                                <div className="cmd-results">
                                  {search.results.map((p) => {
                                    const q = (search.query || item.nombre || '').toLowerCase()
                                    const nombre = p.nombre || ''
                                    const idx = nombre.toLowerCase().indexOf(q)
                                    return (
                                      <div key={p.id || p.codigo} className="cmd-row" onClick={() => seleccionarProducto(item.id, p)}>
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
                                          <span className={`hd-chip hd-chip--${p.esServicio ? 'info' : p.stock > 3 ? 'ok' : p.stock > 0 ? 'warn' : 'bad'}`}
                                            style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                                            {p.esServicio ? 'Servicio' : `${p.stock} und`}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td data-label="Precio"><MoneyInput className="form-input" value={Math.round(parseFloat(item.precio) || 0)}
                          onChange={v => updateItem(item.id, 'precio', v)} inputStyle={{ padding: '6px 10px 6px 22px', fontSize: 13, textAlign: 'right' }} /></td>
                        {/* step="any": acepta media unidad (0,5), igual que la OT. */}
                        <td data-label="Cantidad"><input className="form-input" type="number" value={item.cantidad} min="0" step="any"
                          title="Acepta decimales: 0,5 = media unidad"
                          onChange={e => updateItem(item.id, 'cantidad', e.target.value)} style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} /></td>
                        <td data-label="IVA %"><input className="form-input" type="number" value={item.iva} min="0"
                          onChange={e => updateItem(item.id, 'iva', e.target.value)} style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} /></td>
                        <td className="text-right text-mono td-total-linea" data-label="Total" style={{ fontWeight: 600 }}>{fmt(lineTotal)}</td>
                        <td className="td-quitar"><Button type="button" variant="ghost" size="sm" aria-label="Eliminar ítem" onClick={() => removeItem(item.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></Button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>{/* fin card__b */}
          {/* El totalizador va FUERA del card__b, pegado al borde de la tarjeta:
              esta pensado como pie a sangre, con su propio fondo y borde superior. */}
          <div className="ot-totals">
            <div className="ot-totals__group">
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{items.length} {items.length === 1 ? 'ítem' : 'ítems'} · Validez <strong style={{ color: 'var(--text-2)' }}>{form.validezDias} días</strong></span>
            </div>
            <div className="ot-totals__group">
              <span className="ot-stat"><span className="ot-stat__lbl">Subtotal</span><span className="ot-stat__val">{fmt(totales.subtotal)}</span></span>
              <span className="ot-stat"><span className="ot-stat__lbl">IVA</span><span className="ot-stat__val">{fmt(totales.iva)}</span></span>
              <span className="ot-stat ot-stat--big"><span className="ot-stat__lbl">Total</span><span className="ot-stat__val">{fmt(totales.total)}</span></span>
            </div>
          </div>
        </div>

        {/* Observaciones (2/3) + Validez (1/3) side-by-side */}
        <div className="form-row-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div className="card">
            <div className="card__h"><h3>Observaciones</h3></div>
            <div className="card__b">
              <div className="field">
                <label>Notas adicionales <span className="help" style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-3)' }}>(visibles en el PDF)</span></label>
                <textarea className="input" value={form.observaciones} placeholder="Condiciones, garantías, términos especiales..."
                  rows={3}
                  onChange={e => set('observaciones', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card__h"><h3>Validez</h3></div>
            <div className="card__b">
              <div className="field">
                <label>Días de vigencia</label>
                <input className="input" type="number" value={form.validezDias} min="1"
                  onChange={e => set('validezDias', parseInt(e.target.value) || 15)} />
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          {/* El rotulo dice que esta pasando y por que no se puede pulsar, como
              manda DESIGN.md: un boton apagado y mudo no explica nada. */}
          <Button type="submit" variant="primary" disabled={guardando || !form.cliente}
            title={!form.cliente ? 'Escribe el nombre del cliente' : undefined}>
            {guardando ? 'Guardando…' : !form.cliente ? 'Falta el cliente' : (isEdit ? 'Actualizar' : 'Crear cotización')}
          </Button>
        </div>
      </form>
    </div>
  )
}
