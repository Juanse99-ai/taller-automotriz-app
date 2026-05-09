import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre } from '../utils/helpers'
import { TECNICOS, IVA_DEFAULT, TALLER } from '../utils/constants'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { useClientes } from '../hooks/useClientes'
import { cargarInventarioCompleto } from '../services/cuentti'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

const ESTADO_COT = { PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' }

export default function Cotizaciones({ notify, trabajos = [], onCrearTrabajo, cotizacionesHook }) {
  const { cotizaciones, guardarUna, eliminar: eliminarHook } = cotizacionesHook || {}
  const [vista, setVista] = useState('lista')
  const [editId, setEditId] = useState(null)

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
    const doc = new jsPDF()
    const logo = await loadLogo()
    const NAVY = [13, 27, 53]
    const SLATE_50 = [248, 250, 252]
    const SLATE_500 = [100, 116, 139]
    const SLATE_700 = [51, 65, 85]
    const AMBER = [245, 158, 11]

    // ============= HEADER =============
    if (logo && logo.startsWith('data:image')) {
      try { doc.addImage(logo, 'PNG', 14, 10, 18, 18) } catch {}
    }

    doc.setTextColor(...NAVY)
    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text(TALLER.razonSocial || TALLER.nombre, 36, 14)
    doc.setFontSize(7.5)
    doc.setTextColor(...SLATE_500)
    doc.setFont(undefined, 'bold')
    doc.text('TALLER AUTOMOTRIZ', 36, 18)
    doc.setFont(undefined, 'normal')
    doc.text(`NIT ${TALLER.nit} · No responsable de IVA`, 36, 22)
    doc.text(TALLER.direccion, 36, 25.5)
    doc.text(`Cel. ${TALLER.celular} · ${TALLER.email}`, 36, 29)

    // Right side: doc type/number
    doc.setFontSize(8)
    doc.setTextColor(...SLATE_500)
    doc.setFont(undefined, 'bold')
    doc.text('COTIZACION', 196, 13, { align: 'right' })
    doc.setFontSize(15)
    doc.setTextColor(...NAVY)
    doc.text(c.id || '—', 196, 19, { align: 'right' })

    // Status badge
    const estado = c.estado || 'Pendiente'
    const badgeColors = {
      'Aprobada': { bg: [220, 252, 231], fg: [22, 101, 52], bd: [134, 239, 172] },
      'Rechazada': { bg: [254, 226, 226], fg: [153, 27, 27], bd: [252, 165, 165] },
      'Pendiente': { bg: [254, 243, 199], fg: [146, 64, 14], bd: [253, 230, 138] },
    }[estado] || { bg: [241, 245, 249], fg: [51, 65, 85], bd: [203, 213, 225] }
    const estadoUpper = estado.toUpperCase()
    doc.setFontSize(7.5)
    doc.setFont(undefined, 'bold')
    const badgeW = doc.getTextWidth(estadoUpper) + 6
    const badgeX = 196 - badgeW
    doc.setFillColor(...badgeColors.bg)
    doc.setDrawColor(...badgeColors.bd)
    doc.roundedRect(badgeX, 21, badgeW, 5, 1, 1, 'FD')
    doc.setTextColor(...badgeColors.fg)
    doc.text(estadoUpper, 196 - 3, 24.5, { align: 'right' })

    // Fecha
    doc.setFontSize(7.5)
    doc.setTextColor(...SLATE_500)
    doc.setFont(undefined, 'bold')
    doc.text('FECHA', 196 - 28, 30, { align: 'left' })
    doc.setTextColor(...NAVY)
    doc.text(fmtDate(c.fecha), 196, 30, { align: 'right' })

    doc.setDrawColor(...NAVY)
    doc.setLineWidth(0.6)
    doc.line(14, 33, 196, 33)
    doc.setLineWidth(0.2)

    // ============= SECTIONS =============
    let cursorY = 38
    const sectionHeader = (title, y) => {
      doc.setFillColor(...NAVY)
      doc.rect(14, y, 182, 5.5, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(7.5)
      doc.setFont(undefined, 'bold')
      doc.text(title, 17, y + 3.7)
      doc.setTextColor(...NAVY)
    }
    const dataRow = (items, y) => {
      doc.setFontSize(7)
      const colW = 182 / items.length
      items.forEach((it, i) => {
        const x = 14 + i * colW
        doc.setFont(undefined, 'bold')
        doc.setTextColor(...SLATE_500)
        doc.text((it.label || '').toUpperCase(), x + 3, y + 3)
        doc.setFont(undefined, it.bold ? 'bold' : 'normal')
        doc.setTextColor(...NAVY)
        doc.setFontSize(9)
        const val = (it.value || '—').toString()
        doc.text(val.length > 32 ? val.slice(0, 30) + '..' : val, x + 3, y + 7.5)
        doc.setFontSize(7)
      })
    }

    // Cliente
    sectionHeader('DATOS DEL CLIENTE', cursorY)
    cursorY += 5.5
    doc.setDrawColor(...[203, 213, 225])
    doc.rect(14, cursorY, 182, 11)
    dataRow([
      { label: 'Cliente', value: c.cliente, bold: true },
      { label: 'Documento', value: c.cedula },
      { label: 'Telefono', value: c.telefonoCliente },
    ], cursorY)
    cursorY += 14

    // Vehiculo
    sectionHeader('DATOS DEL VEHICULO', cursorY)
    cursorY += 5.5
    doc.rect(14, cursorY, 182, 11)
    dataRow([
      { label: 'Placa', value: (c.placa || '').toUpperCase(), bold: true },
      { label: 'Marca', value: c.marca },
      { label: 'Modelo', value: c.modelo },
      { label: 'Año', value: String(c.ano || '—') },
      ...(c.cilindraje ? [{ label: 'Cilindraje', value: c.cilindraje }] : []),
    ], cursorY)
    cursorY += 14

    // Items
    if (c.items?.length) {
      const itemRows = c.items.map((i, idx) => [
        String(idx + 1),
        i.nombre || '—',
        String(i.cantidad || 1),
        fmt(parseFloat(i.precio) || 0),
        `${i.iva || 0}%`,
        fmt((parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1)),
      ])
      autoTable(doc, {
        startY: cursorY,
        head: [['#', 'DESCRIPCION', 'CANT.', 'P. UNIT.', 'IVA', 'TOTAL']],
        body: itemRows,
        styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
        headStyles: {
          fillColor: SLATE_50,
          textColor: SLATE_700,
          fontSize: 7.5,
          fontStyle: 'bold',
          lineColor: NAVY,
          lineWidth: { bottom: 0.6 },
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8, textColor: SLATE_500 },
          1: { cellWidth: 'auto' },
          2: { halign: 'center', cellWidth: 14 },
          3: { halign: 'right', cellWidth: 28 },
          4: { halign: 'center', cellWidth: 14 },
          5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
      })

      cursorY = doc.lastAutoTable.finalY + 6

      // ============= TOTALS BOX =============
      const subtotal = c.subtotal || 0
      const iva = c.iva || 0
      const total = c.total || 0
      const boxX = 116
      const boxW = 80
      const boxY = cursorY

      // Validez (left)
      doc.setFontSize(8)
      doc.setTextColor(...SLATE_500)
      doc.setFont(undefined, 'bold')
      doc.text('VALIDEZ', 14, boxY + 3)
      doc.setFont(undefined, 'normal')
      doc.setTextColor(...NAVY)
      doc.text(`${c.validezDias || 15} dias desde la emision`, 14, boxY + 8)

      // Subtotal
      doc.setFontSize(8)
      doc.setTextColor(...SLATE_500)
      doc.setFont(undefined, 'normal')
      doc.text('Subtotal', boxX + 4, boxY + 4)
      doc.setTextColor(...NAVY)
      doc.text(fmt(subtotal), boxX + boxW - 4, boxY + 4, { align: 'right' })
      // IVA
      doc.setTextColor(...SLATE_500)
      doc.text('IVA', boxX + 4, boxY + 9)
      doc.setTextColor(...NAVY)
      doc.text(fmt(iva), boxX + boxW - 4, boxY + 9, { align: 'right' })
      // Separator
      doc.setDrawColor(203, 213, 225)
      doc.setLineDashPattern([0.5, 0.5], 0)
      doc.line(boxX, boxY + 11.5, boxX + boxW, boxY + 11.5)
      doc.setLineDashPattern([], 0)
      // TOTAL navy box
      doc.setFillColor(...NAVY)
      doc.rect(boxX, boxY + 13, boxW, 10, 'F')
      doc.setTextColor(...AMBER)
      doc.setFontSize(7.5)
      doc.setFont(undefined, 'bold')
      doc.text('TOTAL COTIZADO', boxX + 4, boxY + 19)
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(13)
      doc.setFont(undefined, 'bold')
      doc.text(fmt(total), boxX + boxW - 4, boxY + 20, { align: 'right' })

      cursorY = boxY + 28
    }

    // Observaciones
    if (c.observaciones) {
      sectionHeader('OBSERVACIONES', cursorY)
      cursorY += 5.5
      const obsLines = doc.splitTextToSize(c.observaciones, 178)
      const obsHeight = Math.max(12, obsLines.length * 4 + 6)
      doc.setDrawColor(...[203, 213, 225])
      doc.rect(14, cursorY, 182, obsHeight)
      doc.setFontSize(8.5)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'normal')
      doc.text(obsLines, 17, cursorY + 4.5)
      cursorY += obsHeight + 4
    }

    // Notas legales
    cursorY += 4
    doc.setFontSize(7.5)
    doc.setTextColor(...SLATE_500)
    doc.setFont(undefined, 'italic')
    doc.text(`* Esta cotizacion es valida por ${c.validezDias || 15} dias a partir de la fecha de emision.`, 14, cursorY)
    doc.text('* Precios sujetos a disponibilidad de repuestos al momento de la reparacion.', 14, cursorY + 4)
    doc.setFont(undefined, 'normal')

    // Firmas
    const firmaY = Math.max(cursorY + 22, 250)
    doc.setDrawColor(...SLATE_500)
    doc.setLineWidth(0.3)
    doc.line(20, firmaY, 85, firmaY)
    doc.line(120, firmaY, 185, firmaY)
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.setFont(undefined, 'bold')
    doc.text('Firma del Cliente', 52, firmaY + 4, { align: 'center' })
    doc.text('Autorizado por', 152, firmaY + 4, { align: 'center' })

    // Footer
    doc.setFontSize(7)
    doc.setTextColor(...SLATE_500)
    doc.setFont(undefined, 'normal')
    doc.text(`${TALLER.razonSocial || TALLER.nombre} · ${TALLER.direccion}`, 105, 287, { align: 'center' })
    doc.text(`Cel. ${TALLER.celular} · ${TALLER.email}`, 105, 290, { align: 'center' })

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

  const cambiarEstado = async (id, estado) => {
    const cot = cotizaciones.find(c => c.id === id)
    if (!cot) return
    try {
      await guardarUna({ ...cot, estado })
      notify(`Cotizacion ${estado.toLowerCase()}`, estado === ESTADO_COT.APROBADA ? 'success' : 'info')
    } catch (e) {
      notify(`No se pudo sincronizar: ${e.message}`, 'error')
    }
  }

  const eliminar = async (id) => {
    try {
      await eliminarHook(id)
      notify('Cotizacion eliminada', 'info')
    } catch (e) {
      notify(`No se pudo eliminar en la nube: ${e.message}`, 'error')
    }
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
              notify('Cotizacion actualizada y sincronizada', 'success')
            } else {
              const nueva = { ...data, id: `COT-${uid()}`, estado: ESTADO_COT.PENDIENTE, fecha: new Date().toISOString() }
              await guardarUna(nueva)
              notify('Cotizacion creada y sincronizada', 'success')
            }
            setVista('lista')
            setEditId(null)
          } catch (e) {
            // Quedo guardada en local pero no en la nube
            notify(`Guardada solo en este dispositivo. Sync fallo: ${e.message}`, 'error')
            setVista('lista')
            setEditId(null)
          }
        }}
        onCancel={() => { setVista('lista'); setEditId(null) }}
      />
    )
  }

  return (
    <div>
      <div className="pagehd">
        <div><h2>Cotizaciones</h2><p className="sub">{stats.total} cotizaciones · {stats.aprobadas} aprobadas</p></div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setVista('nueva')}>+ Nueva cotizacion</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(200px,1fr))', gap: 14, marginBottom: 18 }}>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
            <div className="kpi__lbl">Total</div>
          </div>
          <div className="kpi__v">{stats.total}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic amber"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
            <div className="kpi__lbl">Pendientes</div>
          </div>
          <div className="kpi__v" style={{ color: 'var(--amber-500)' }}>{stats.pendientes}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic green"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg></div>
            <div className="kpi__lbl">Aprobadas</div>
          </div>
          <div className="kpi__v" style={{ color: 'var(--green-600)' }}>{stats.aprobadas}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div>
            <div className="kpi__lbl">Valor pendiente</div>
          </div>
          <div className="kpi__v">{fmt(stats.valorPendiente)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card__h"><h3>Cotizaciones</h3><span className="count">{sorted.length}</span></div>
        <div className="card__b card__b--flush">
          {sorted.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--slate-400)' }}>
              <p>No hay cotizaciones registradas.</p>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Placa</th>
                  <th>Vehículo</th>
                  <th>Estado</th>
                  <th className="c-right">Total</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => {
                  const bc = c.estado === ESTADO_COT.APROBADA ? 'badge-s'
                    : c.estado === ESTADO_COT.RECHAZADA ? 'badge-d' : 'badge-w'
                  return (
                    <tr key={c.id}>
                      <td className="c-mono">{c.id}</td>
                      <td className="c-name">{c.cliente || '—'}</td>
                      <td className="c-mono" style={{ fontWeight: 700 }}>{c.placa || '—'}</td>
                      <td className="c-muted">{[c.marca, c.modelo, c.ano].filter(Boolean).join(' ') || '—'}</td>
                      <td><span className={`badge ${bc}`}>{c.estado}</span></td>
                      <td className="c-right c-mono">{fmt(c.total)}</td>
                      <td className="c-muted">{fmtDate(c.fecha)}</td>
                      <td>
                        <div className="actions-cell">
                          <button className="btn btn-outline btn-sm" onClick={() => imprimirCotizacion(c)}>PDF</button>
                          <button className="btn btn-outline btn-sm" onClick={() => { setEditId(c.id); setVista('editar') }}>Editar</button>
                          {c.estado === ESTADO_COT.PENDIENTE && (
                            <>
                              <button className="btn btn-success btn-sm" onClick={() => cambiarEstado(c.id, ESTADO_COT.APROBADA)}>Aprobar</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => cambiarEstado(c.id, ESTADO_COT.RECHAZADA)}>Rechazar</button>
                            </>
                          )}
                          {c.estado === ESTADO_COT.APROBADA && onCrearTrabajo && (
                            <button className="btn btn-primary btn-sm" onClick={() => onCrearTrabajo(c)}>Crear Trabajo</button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => eliminar(c.id)} title="Eliminar">X</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

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
  const [items, setItems] = useState(cotizacion?.items || [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const seleccionarCliente = (c) => {
    set('cedula', normalizarDoc(c))
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', c.telefono || c.phone || '')
    setResultados([])
  }

  // Inventario Cuentti
  const [inventario, setInventario] = useState([])
  const [invLoading, setInvLoading] = useState(true)
  const [itemSearch, setItemSearch] = useState({})
  const searchTimers = useRef({})

  useEffect(() => {
    const cached = lsGet(LS_KEYS.INVENTARIO_CACHE, [])
    if (cached.length > 0) { setInventario(cached); setInvLoading(false) }
    cargarInventarioCompleto().then(data => {
      if (data.length > 0) { setInventario(data); lsSet(LS_KEYS.INVENTARIO_CACHE, data) }
      setInvLoading(false)
    }).catch(() => setInvLoading(false))
  }, [])

  const buscarEnInventario = useCallback((itemId, query) => {
    if (searchTimers.current[itemId]) clearTimeout(searchTimers.current[itemId])
    if (!query || query.length < 2) {
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results: [], show: false } }))
      return
    }
    searchTimers.current[itemId] = setTimeout(() => {
      const q = query.toLowerCase().trim()
      const scored = []
      for (const p of inventario) {
        const nombre = (p.nombre || '').toLowerCase()
        const codigo = (p.codigo || '').toLowerCase()
        const sku = (p.sku || '').toLowerCase()
        const barras = (p.codigoBarras || '').toLowerCase()
        let score = 0
        if (codigo === q || sku === q || barras === q) score = 100
        else if (codigo.startsWith(q) || sku.startsWith(q) || barras.startsWith(q)) score = 80
        else if (nombre === q) score = 70
        else if (nombre.startsWith(q)) score = 60
        else if (nombre.includes(' ' + q)) score = 50
        else if (nombre.includes(q)) score = 40
        else if (codigo.includes(q) || sku.includes(q) || barras.includes(q)) score = 30
        else continue
        if (p.stock > 0) score += 5
        scored.push({ ...p, _score: score })
      }
      scored.sort((a, b) => b._score - a._score)
      const results = scored.slice(0, 12)
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results, show: results.length > 0 } }))
    }, 150)
  }, [inventario])

  const seleccionarProducto = (itemId, producto) => {
    updateItem(itemId, 'nombre', producto.nombre)
    updateItem(itemId, 'precio', producto.precio)
    updateItem(itemId, 'iva', producto.iva)
    updateItem(itemId, 'codigo', producto.codigo || producto.sku || '')
    updateItem(itemId, 'sku', producto.sku || '')
    updateItem(itemId, 'esServicio', !!producto.esServicio)
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
      const cant = parseInt(i.cantidad) || 1
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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.cliente) return
    onSave({ ...form, placa: (form.placa || '').toUpperCase(), ano: parseInt(form.ano) || null, items, ...totales })
  }

  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>{isEdit ? 'Editar Cotizacion' : 'Nueva Cotizacion'}</h2>
          {isEdit && cotizacion && (
            <div className="pagehd__meta">
              {cotizacion.id && <span className="pagehd__ot">{String(cotizacion.id).startsWith('COT-') ? cotizacion.id : `COT-${cotizacion.id}`}</span>}
              {cotizacion.fecha && <><span className="pagehd__sep">·</span><span>Creada {fmtDate(cotizacion.fecha)}</span></>}
              {cotizacion.validezDias && <><span className="pagehd__sep">·</span><span>Valida {cotizacion.validezDias} dias</span></>}
              {cotizacion.estado && <><span className="pagehd__sep">·</span><span className={`badge ${
                cotizacion.estado === ESTADO_COT.APROBADA ? 'badge-success' :
                cotizacion.estado === ESTADO_COT.RECHAZADA ? 'badge-danger' :
                'badge-warning'
              }`}>{cotizacion.estado}</span></>}
            </div>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>Volver</button>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card__h"><h3>Cliente</h3></div>
          <div className="card__b">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              <div className="field" style={{ position: 'relative' }}>
                <label>Cedula / NIT</label>
                <input className="input" value={form.cedula} placeholder="Buscar por documento..."
                  onChange={e => { set('cedula', e.target.value); buscarDebounced(e.target.value) }} />
                {resultados.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--slate-200)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                    {resultados.map((c, i) => (
                      <div key={i} onClick={() => seleccionarCliente(c)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--slate-100)', fontSize: 13 }}>
                        <strong>{normalizarDoc(c)}</strong> — {normalizarNombre(c)}
                      </div>
                    ))}
                  </div>
                )}
                {buscando && <span style={{ display: 'block', fontSize: 11, color: 'var(--slate-400)', marginTop: 4 }}>Buscando en Cuentti...</span>}
              </div>
              <div className="field">
                <label>Nombre del Cliente</label>
                <input className="input" value={form.cliente} required placeholder="Nombre completo"
                  onChange={e => { set('cliente', e.target.value); buscarDebounced(e.target.value) }} />
              </div>
              <div className="field">
                <label>Telefono</label>
                <input className="input" value={form.telefonoCliente} placeholder="300..." onChange={e => set('telefonoCliente', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__h"><h3>Vehiculo</h3></div>
          <div className="card__b">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
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
                <label>Marca</label>
                <select className="input" value={form.marca} onChange={e => { set('marca', e.target.value); set('modelo', '') }}>
                  <option value="">Seleccionar...</option>
                  {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Modelo</label>
                <select className="input" value={form.modelo} onChange={e => set('modelo', e.target.value)} disabled={!form.marca}>
                  <option value="">Seleccionar...</option>
                  {modelos.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 14 }}>
              <div className="field">
                <label>Año</label>
                <input className="input" type="number" value={form.ano} placeholder="2024" min="1950" max="2030"
                  onChange={e => set('ano', e.target.value)} />
              </div>
              <div className="field">
                <label>Cilindraje (cc)</label>
                <input className="input" value={form.cilindraje} placeholder="Ej: 1600, 2000, 3.0L"
                  onChange={e => set('cilindraje', e.target.value)} />
              </div>
              <div className="field" />
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Items</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ Agregar linea</button>
          </div>
          {invLoading && <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Cargando inventario Cuentti...</p>}
          {items.length === 0 ? (
            <p className="text-sm text-muted text-center" style={{ padding: 24 }}>Sin items. Agrega una linea y busca productos del inventario.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Descripcion</th>
                    <th style={{ width: '15%' }}>Precio</th>
                    <th style={{ width: '10%' }}>Cant.</th>
                    <th style={{ width: '10%' }}>IVA %</th>
                    <th style={{ width: '15%' }} className="text-right">Total</th>
                    <th style={{ width: '5%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const lineTotal = (parseFloat(item.precio) || 0) * (parseInt(item.cantidad) || 1)
                    const search = itemSearch[item.id] || {}
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ position: 'relative' }}>
                            <input className="form-input" value={item.nombre} placeholder="Buscar producto o escribir..."
                              onChange={e => { updateItem(item.id, 'nombre', e.target.value); buscarEnInventario(item.id, e.target.value) }}
                              onFocus={() => { if (item.nombre?.length >= 2) buscarEnInventario(item.id, item.nombre) }}
                              onBlur={() => setTimeout(() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } })), 250)}
                              onKeyDown={e => { if (e.key === 'Escape') setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } })) }}
                              style={{ padding: '6px 10px', fontSize: 13 }} />
                            {invLoading && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#999' }}>...</span>}
                          </div>
                          {search.show && search.results.length > 0 && (
                            <div style={{
                              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99,
                              background: 'rgba(0,0,0,.3)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 80
                            }} onClick={() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>
                              <div style={{
                                background: '#fff', borderRadius: 10, width: '90%', maxWidth: 700,
                                maxHeight: '70vh', display: 'flex', flexDirection: 'column',
                                boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden'
                              }} onClick={e => e.stopPropagation()}>
                                <div style={{ padding: '12px 16px', background: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700, fontSize: 14 }}>Buscar Producto</span>
                                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{search.results.length} resultados</span>
                                </div>
                                <div style={{
                                  display: 'grid', gridTemplateColumns: '1fr 100px 70px', gap: 8,
                                  padding: '8px 16px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0',
                                  fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px'
                                }}>
                                  <span>Articulo</span>
                                  <span style={{ textAlign: 'right' }}>P.Venta</span>
                                  <span style={{ textAlign: 'center' }}>Exist.</span>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                  {search.results.map((p, i) => (
                                    <div key={p.id || p.codigo}
                                      onClick={() => seleccionarProducto(item.id, p)}
                                      style={{
                                        display: 'grid', gridTemplateColumns: '1fr 100px 70px', gap: 8,
                                        padding: '10px 16px', cursor: 'pointer',
                                        borderBottom: '1px solid #f1f5f9',
                                        background: i === 0 ? '#1e40af' : 'transparent',
                                        color: i === 0 ? '#fff' : '#1e293b',
                                        transition: 'background .1s'
                                      }}
                                      onMouseEnter={e => { if (i !== 0) e.currentTarget.style.background = '#f1f5f9' }}
                                      onMouseLeave={e => { if (i !== 0) e.currentTarget.style.background = 'transparent' }}
                                    >
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {p.nombre}
                                        </div>
                                        <div style={{ fontSize: 11, opacity: .7, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                          {p.codigoBarras && <span>Cod: {p.codigoBarras}</span>}
                                          {p.sku && <span>Sku: {p.sku}</span>}
                                          {(!p.codigoBarras && !p.sku && p.codigo) && <span>Ref: {p.codigo}</span>}
                                          <span>- P.Venta+imp: {fmt(p.precio)}</span>
                                          {p.precioBase > 0 && <span>- P.Base: {fmt(p.precioBase)}</span>}
                                          {p.iva > 0 && <span>IVA: {p.iva}%</span>}
                                        </div>
                                      </div>
                                      <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, alignSelf: 'center' }}>
                                        {fmt(p.precio)}
                                      </div>
                                      <div style={{ textAlign: 'center', alignSelf: 'center' }}>
                                        <span style={{
                                          fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13,
                                          padding: '2px 8px', borderRadius: 4,
                                          background: i === 0 ? 'rgba(255,255,255,.2)' : p.esServicio ? '#dbeafe' : p.stock > 0 ? '#dcfce7' : '#fee2e2',
                                          color: i === 0 ? '#fff' : p.esServicio ? '#1d4ed8' : p.stock > 0 ? '#16a34a' : '#dc2626'
                                        }}>
                                          {p.esServicio ? '∞' : `(${p.stock})`}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td><input className="form-input" type="number" value={Math.round(parseFloat(item.precio) || 0)} min="0"
                          onChange={e => updateItem(item.id, 'precio', e.target.value)} style={{ padding: '6px 10px', fontSize: 13, textAlign: 'right' }} /></td>
                        <td><input className="form-input" type="number" value={item.cantidad} min="1"
                          onChange={e => updateItem(item.id, 'cantidad', e.target.value)} style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} /></td>
                        <td><input className="form-input" type="number" value={item.iva} min="0"
                          onChange={e => updateItem(item.id, 'iva', e.target.value)} style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} /></td>
                        <td className="text-right text-mono" style={{ fontWeight: 600 }}>{fmt(lineTotal)}</td>
                        <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)}>🗑</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Totalizer rediseñado */}
          <div className="ot-totals" style={{ marginTop: 14 }}>
            <div className="ot-totals__group">
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{items.length} {items.length === 1 ? 'item' : 'items'} · Validez <strong style={{ color: 'var(--text-2)' }}>{form.validezDias} dias</strong></span>
            </div>
            <div className="ot-totals__group">
              <span className="ot-stat"><span className="ot-stat__lbl">Subtotal</span><span className="ot-stat__val">{fmt(totales.subtotal)}</span></span>
              <span className="ot-stat"><span className="ot-stat__lbl">IVA</span><span className="ot-stat__val">{fmt(totales.iva)}</span></span>
              <span className="ot-stat ot-stat--big"><span className="ot-stat__lbl">Total</span><span className="ot-stat__val">{fmt(totales.total)}</span></span>
            </div>
          </div>
        </div>

        {/* Observaciones (2/3) + Validez (1/3) side-by-side */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <div className="card">
            <div className="card__h"><h3>Observaciones</h3></div>
            <div className="card__b">
              <div className="field">
                <label>Notas adicionales <span className="help" style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-3)' }}>(visibles en el PDF)</span></label>
                <textarea className="input" value={form.observaciones} placeholder="Condiciones, garantias, terminos especiales..."
                  rows={3}
                  onChange={e => set('observaciones', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card__h"><h3>Validez</h3></div>
            <div className="card__b">
              <div className="field">
                <label>Dias de vigencia</label>
                <input className="input" type="number" value={form.validezDias} min="1"
                  onChange={e => set('validezDias', parseInt(e.target.value) || 15)} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary">{isEdit ? 'Actualizar' : 'Crear Cotizacion'}</button>
        </div>
      </form>
    </div>
  )
}
