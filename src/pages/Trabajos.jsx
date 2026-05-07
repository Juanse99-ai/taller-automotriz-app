import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre } from '../utils/helpers'
import { TECNICOS, ESTADOS, IVA_DEFAULT, DIAS_ESTANCADO } from '../utils/constants'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { useClientes } from '../hooks/useClientes'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { cargarInventarioCompleto } from '../services/cuentti'

export default function Trabajos({ hook, notify, onAutoFacturar }) {
  const { trabajos, agregarTrabajo, actualizarTrabajo, eliminarTrabajo } = hook
  const [vista, setVista] = useState('lista') // lista | nuevo | editar | kanban
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroTecnico, setFiltroTecnico] = useState('todos')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')

  const stats = useMemo(() => {
    const total = trabajos.length
    const comp = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO).length
    const pend = trabajos.filter(t => t.estado === ESTADOS.PENDIENTE).length
    const prog = trabajos.filter(t => t.estado === ESTADOS.EN_PROGRESO).length
    return { total, comp, pend, prog }
  }, [trabajos])

  const filtered = useMemo(() => {
    let list = [...trabajos]
    if (filtroEstado !== 'todos') list = list.filter(t => t.estado === filtroEstado)
    if (filtroTecnico !== 'todos') list = list.filter(t => String(t.tecnicoId) === filtroTecnico)
    if (filtroBusqueda.trim()) {
      const q = filtroBusqueda.toLowerCase()
      list = list.filter(t =>
        (t.placa || '').toLowerCase().includes(q) ||
        (t.cliente || '').toLowerCase().includes(q) ||
        (t.otCodigo || '').toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [trabajos, filtroEstado, filtroTecnico, filtroBusqueda])

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
    const logo = await loadLogo()

    // Header con logo y datos del taller
    if (logo && logo.startsWith('data:image')) {
      try { doc.addImage(logo, 'PNG', 14, 8, 30, 20) } catch {}
    }
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('ORDEN DE TRABAJO', 50, 14)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Multidiagnosticos AS', 50, 20)
    doc.text('Sabanalarga, Atlantico | Tel: 300 365 1525', 50, 25)
    doc.setFont(undefined, 'bold')
    doc.text(`OT: ${t.otCodigo || '—'}`, 155, 14)
    doc.setFont(undefined, 'normal')
    doc.text(`Fecha: ${fmtDate(t.fecha)}`, 155, 20)
    doc.text(`Estado: ${t.estado}`, 155, 25)

    doc.setDrawColor(200)
    doc.line(14, 30, 196, 30)

    // Cliente
    autoTable(doc, {
      startY: 34,
      head: [['DATOS DEL CLIENTE', '', '', '']],
      body: [
        ['Cliente:', t.cliente || '—', 'Documento:', t.cedula || '—'],
        ['Telefono:', t.telefonoCliente || '—', 'Email:', t.emailCliente || '—'],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 10 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 }, 2: { fontStyle: 'bold', cellWidth: 28 } },
    })

    // Vehiculo
    autoTable(doc, {
      head: [['DATOS DEL VEHICULO', '', '', '']],
      body: [
        ['Placa:', t.placa || '—', 'Marca:', t.marca || '—'],
        ['Modelo:', t.modelo || '—', 'Ano:', String(t.ano || '—')],
        ['Kilometraje:', `${t.kilometraje || 0} km`, 'Tecnico:', tecNombre(t.tecnicoId)],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 10 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 }, 2: { fontStyle: 'bold', cellWidth: 28 } },
      startY: doc.lastAutoTable.finalY + 4,
    })

    // Items (repuestos y servicios)
    if (t.items?.length) {
      const itemRows = t.items.map(i => [
        i.nombre || '—',
        i.esServicio ? 'Servicio' : 'Repuesto',
        String(i.cantidad || 1),
        fmt(parseFloat(i.precio) || 0),
        `${i.iva || 0}%`,
        fmt((parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1)),
      ])
      autoTable(doc, {
        head: [['Descripcion', 'Tipo', 'Cant.', 'P. Unit.', 'IVA', 'Total']],
        body: itemRows,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9 },
        columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
        startY: doc.lastAutoTable.finalY + 4,
      })

      // Totales
      autoTable(doc, {
        body: [
          ['', '', '', '', 'Subtotal:', fmt(t.subtotalSinIva || 0)],
          ['', '', '', '', 'IVA:', fmt(t.totalIva || 0)],
          ['', '', '', '', 'TOTAL:', fmt(t.total || 0)],
        ],
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: { 4: { fontStyle: 'bold', halign: 'right' }, 5: { fontStyle: 'bold', halign: 'right' } },
        startY: doc.lastAutoTable.finalY,
      })
    }

    // Observaciones
    if (t.observaciones) {
      autoTable(doc, {
        head: [['OBSERVACIONES']],
        body: [[t.observaciones]],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 10 },
        startY: doc.lastAutoTable.finalY + 4,
      })
    }

    // Firmas
    const firmaY = doc.lastAutoTable.finalY + 25
    doc.setDrawColor(100)
    doc.line(20, firmaY, 85, firmaY)
    doc.line(120, firmaY, 185, firmaY)
    doc.setFontSize(9)
    doc.text('Firma del Cliente', 38, firmaY + 6)
    doc.text('Firma del Tecnico', 138, firmaY + 6)
    doc.text('Documento: _______________', 25, firmaY + 14)
    doc.text('Fecha: _______________', 130, firmaY + 14)

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
        onSave={async (data) => {
          if (vista === 'editar') {
            await actualizarTrabajo(editId, data)
            notify('Trabajo actualizado', 'success')
          } else {
            await agregarTrabajo(data)
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
    ['todos', 'Todas'],
    [ESTADOS.PENDIENTE, 'Pendientes'],
    [ESTADOS.EN_DIAGNOSTICO, 'Diagnostico'],
    [ESTADOS.EN_PROGRESO, 'En Progreso'],
    [ESTADOS.ESPERANDO_REPUESTOS, 'Esperando Rep.'],
    [ESTADOS.EN_PRUEBA, 'En Prueba'],
    [ESTADOS.COMPLETADO, 'Completados'],
    [ESTADOS.CANCELADO, 'Cancelados'],
  ]

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
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
            <input className="form-input" placeholder="Buscar placa, cliente, OT..." value={filtroBusqueda}
              onChange={e => setFiltroBusqueda(e.target.value)} style={{ fontSize: 13 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select className="form-select" value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)} style={{ fontSize: 13 }}>
              <option value="todos">Todos los tecnicos</option>
              {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
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
              <div key={estado} className="kanban-column">
                <div className="kanban-column-header" style={{ borderTopColor: bc }}>
                  <span>{estado}</span>
                  <span className="kanban-count">{col.length}</span>
                </div>
                <div className="kanban-cards">
                  {col.map(t => {
                    const diasSinMover = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
                    const estancado = t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO && diasSinMover >= DIAS_ESTANCADO
                    return (
                      <div key={t.id} className="card" style={{ padding: '12px 14px', marginBottom: 8, cursor: 'pointer', borderLeft: estancado ? '3px solid var(--red-500)' : 'none' }} onClick={() => handleEditar(t.id)}>
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
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No hay trabajos registrados</p>
          <p className="text-sm text-muted">Crea una nueva OT para comenzar.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="card__h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card__b card__b--flush">
            <table className="tbl">
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
                    <tr key={t.id} style={estancado ? { borderLeft: '3px solid var(--red-500)', background: 'rgba(239,68,68,.04)' } : {}}>
                      <td className="c-mono" style={{ color: 'var(--blue-600)', fontWeight: 700 }}>{t.otCodigo || '—'}</td>
                      <td className="c-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                      <td className="c-name">{t.cliente || '—'}</td>
                      <td className="c-muted">{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span className={`av av-${(parseInt(t.tecnicoId) || 1) % 5 + 1}`} style={{ width: 26, height: 26, fontSize: 10 }}>{tecIniciales(t.tecnicoId)}</span>
                          <span style={{ fontSize: 12.5 }}>{tecNombre(t.tecnicoId)}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${bc}`}>{t.estado}</span>
                        {estancado && <span className="badge badge-d" style={{ marginLeft: 4, fontSize: 10 }}>{diasSinMover}d</span>}
                      </td>
                      <td className="c-mono c-right" style={{ fontWeight: 700 }}>{fmt(t.total)}</td>
                      <td className="c-mono c-muted" style={{ fontSize: 12 }}>{fmtDate(t.fecha)}</td>
                      <td className="c-right">
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

// ========================
// FORMULARIO DE TRABAJO
// ========================
function TrabajoForm({ trabajo, onSave, onCancel, allTrabajos = [] }) {
  const isEdit = !!trabajo
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()

  const [form, setForm] = useState({
    cedula: trabajo?.cedula || '',
    cliente: trabajo?.cliente || '',
    telefonoCliente: trabajo?.telefonoCliente || '',
    emailCliente: trabajo?.emailCliente || '',
    clienteId: trabajo?.clienteId || '',
    placa: trabajo?.placa || '',
    marca: trabajo?.marca || '',
    modelo: trabajo?.modelo || '',
    ano: trabajo?.ano || new Date().getFullYear(),
    kilometraje: trabajo?.kilometraje || '',
    tecnicoId: trabajo?.tecnicoId || '',
    observaciones: trabajo?.observaciones || '',
    estado: trabajo?.estado || ESTADOS.PENDIENTE,
    fecha: trabajo?.fecha ? trabajo.fecha.slice(0, 10) : hoyISO(),
    evidenciasIngreso: trabajo?.evidenciasIngreso || [],
    evidenciasEntrega: trabajo?.evidenciasEntrega || [],
  })

  const [items, setItems] = useState(trabajo?.items || [])
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

  // Inventario para busqueda de productos
  const [inventario, setInventario] = useState([])
  const [invLoading, setInvLoading] = useState(true)
  const [itemSearch, setItemSearch] = useState({}) // { [itemId]: { query, results, show } }

  useEffect(() => {
    const cached = lsGet(LS_KEYS.INVENTARIO_CACHE, [])
    if (cached.length > 0) {
      setInventario(cached)
      setInvLoading(false)
    }
    // Siempre cargar desde Cuentti para tener datos frescos
    cargarInventarioCompleto().then(data => {
      if (data.length > 0) {
        setInventario(data)
        // Guardar en cache para proxima vez
        lsSet(LS_KEYS.INVENTARIO_CACHE, data)
      }
      setInvLoading(false)
    }).catch(() => { setInvLoading(false) })
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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const modelosTrabajo = useMemo(() => getModelos(form.marca), [form.marca])

  // Seleccionar cliente de resultados
  const seleccionarCliente = (c) => {
    set('cedula', normalizarDoc(c))
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', c.telefono || c.phone || '')
    set('emailCliente', c.email || c.correo || '')
    set('clienteId', c.id || '')
    setResultados([])
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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.placa || !form.cliente) return
    onSave({
      ...form,
      placa: form.placa.toUpperCase(),
      ano: parseInt(form.ano) || new Date().getFullYear(),
      kilometraje: parseInt(form.kilometraje) || 0,
      tecnicoId: parseInt(form.tecnicoId) || null,
      items,
      subtotalSinIva: totales.subtotal,
      totalIva: totales.iva,
      total: totales.total,
      manoObra: totales.manoObra,
      repuestos: totales.repuestos,
      estado: form.estado || trabajo?.estado || ESTADOS.PENDIENTE,
      fecha: new Date(form.fecha + 'T12:00:00').toISOString(),
      evidenciasIngreso: form.evidenciasIngreso,
      evidenciasEntrega: form.evidenciasEntrega,
    })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Editar Trabajo' : 'Nuevo Trabajo'}</h3>
        <button className="btn btn-outline" onClick={onCancel}>Volver</button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* CLIENTE */}
        <div className="card">
          <div className="card-title">Cliente</div>
          <div className="form-row">
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Cedula / NIT</label>
              <input className="form-input" value={form.cedula} placeholder="Buscar por documento..."
                onChange={e => { set('cedula', e.target.value); buscarDebounced(e.target.value) }} />
              {resultados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--slate-200)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                  {resultados.map((c, i) => (
                    <div key={i} onClick={() => seleccionarCliente(c)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--slate-100)', fontSize: 13 }}>
                      <strong>{normalizarDoc(c)}</strong> — {normalizarNombre(c)}
                      {c.telefono && <span className="text-muted" style={{ marginLeft: 8 }}>{c.telefono}</span>}
                    </div>
                  ))}
                </div>
              )}
              {buscando && <span className="text-xs text-muted mt-2" style={{ display: 'block' }}>Buscando en Cuentti...</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Nombre del Cliente</label>
              <input className="form-input" value={form.cliente} required placeholder="Nombre completo"
                onChange={e => { set('cliente', e.target.value); buscarDebounced(e.target.value) }} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Telefono</label>
              <input className="form-input" value={form.telefonoCliente} placeholder="300..." onChange={e => set('telefonoCliente', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.emailCliente} placeholder="email@..." onChange={e => set('emailCliente', e.target.value)} />
            </div>
          </div>
        </div>

        {/* VEHICULO */}
        <div className="card">
          <div className="card-title">Vehiculo</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Placa *</label>
              <input className="form-input" value={form.placa} required placeholder="ABC123" style={{ textTransform: 'uppercase' }}
                onChange={e => {
                  const placa = e.target.value.toUpperCase()
                  set('placa', placa)
                  // Auto-fill vehicle data from previous work
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
            <div className="form-group">
              <label className="form-label">Marca *</label>
              <select className="form-select" value={form.marca} required onChange={e => { set('marca', e.target.value); set('modelo', '') }}>
                <option value="">Seleccionar...</option>
                {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Modelo</label>
              <select className="form-select" value={form.modelo} onChange={e => set('modelo', e.target.value)} disabled={!form.marca}>
                <option value="">Seleccionar...</option>
                {modelosTrabajo.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ano</label>
              <input className="form-input" type="number" value={form.ano} min="1980" max="2030" onChange={e => set('ano', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Kilometraje</label>
              <input className="form-input" type="number" value={form.kilometraje} min="0" placeholder="45000" onChange={e => set('kilometraje', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tecnico</label>
              <select className="form-select" value={form.tecnicoId} onChange={e => set('tecnicoId', e.target.value)}>
                <option value="">Seleccionar</option>
                {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* HISTORIAL POR PLACA */}
        {form.placa.length >= 6 && (() => {
          const historial = allTrabajos.filter(t =>
            (t.placa || '').toUpperCase() === form.placa.toUpperCase() && t.id !== trabajo?.id
          ).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
          if (!historial.length) return null
          return (
            <div className="card" style={{ borderLeft: '4px solid var(--blue-500)' }}>
              <div className="card-title">Historial de {form.placa.toUpperCase()} ({historial.length} trabajos anteriores)</div>
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
          <div className="card-title">Evidencias (ingreso y entrega)</div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Ingreso (como llega)</label>
              <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Frente, lados, parte trasera.</div>
              <input type="file" accept="image/*" multiple onChange={e => addFotos('evidenciasIngreso', e.target.files)} />
              <ThumbGrid fotos={form.evidenciasIngreso} onNota={(id, nota) => actualizarNotaFoto('evidenciasIngreso', id, nota)} onRemove={id => quitarFoto('evidenciasIngreso', id)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Entrega</label>
              <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Despues del trabajo.</div>
              <input type="file" accept="image/*" multiple onChange={e => addFotos('evidenciasEntrega', e.target.files)} />
              <ThumbGrid fotos={form.evidenciasEntrega} onNota={(id, nota) => actualizarNotaFoto('evidenciasEntrega', id, nota)} onRemove={id => quitarFoto('evidenciasEntrega', id)} />
            </div>
          </div>
        </div>

        {/* ITEMS */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Repuestos y Servicios</div>
              {invLoading ? (
                <span className="text-xs text-muted">Cargando inventario...</span>
              ) : (
                <span className="text-xs text-muted">({inventario.length} productos)</span>
              )}
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ Agregar linea</button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted text-center" style={{ padding: 24 }}>Sin items. Usa el boton para agregar repuestos o servicios.</p>
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
                            <input className="form-input" value={item.nombre} placeholder="Nombre, codigo o referencia..."
                              autoComplete="off"
                              onChange={e => {
                                updateItem(item.id, 'nombre', e.target.value)
                                buscarEnInventario(item.id, e.target.value)
                              }}
                              onFocus={() => {
                                if (item.nombre && item.nombre.length >= 2) buscarEnInventario(item.id, item.nombre)
                              }}
                              onBlur={() => setTimeout(() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } })), 250)}
                              onKeyDown={e => {
                                if (e.key === 'Escape') setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))
                              }}
                              style={{ padding: '6px 10px', fontSize: 13 }} />
                            {invLoading && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#999' }}>...</span>}
                          </div>
                          {/* Overlay POS */}
                          {searchState?.show && searchState.results.length > 0 && (
                            <div style={{
                              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99,
                              background: 'rgba(0,0,0,.3)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 80
                            }} onClick={() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>
                              <div style={{
                                background: '#fff', borderRadius: 10, width: '90%', maxWidth: 700,
                                maxHeight: '70vh', display: 'flex', flexDirection: 'column',
                                boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden'
                              }} onClick={e => e.stopPropagation()}>
                                {/* Header */}
                                <div style={{ padding: '12px 16px', background: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700, fontSize: 14 }}>Buscar Producto</span>
                                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{searchState.results.length} resultados</span>
                                </div>
                                {/* Column headers */}
                                <div style={{
                                  display: 'grid', gridTemplateColumns: '1fr 100px 70px', gap: 8,
                                  padding: '8px 16px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0',
                                  fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px'
                                }}>
                                  <span>Articulo</span>
                                  <span style={{ textAlign: 'right' }}>P.Venta</span>
                                  <span style={{ textAlign: 'center' }}>Exist.</span>
                                </div>
                                {/* Results list */}
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                  {searchState.results.map((p, i) => (
                                    <div key={p.id}
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

          {/* Totales */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--slate-200)', paddingTop: 14 }}>
            <div className="totals-row">
              <div className="text-sm">
                <span className="text-muted">M.O.:</span>{' '}
                <span className="text-mono">{fmt(totales.manoObra)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted">Repuestos:</span>{' '}
                <span className="text-mono">{fmt(totales.repuestos)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted">Subtotal:</span>{' '}
                <span className="text-mono">{fmt(totales.subtotal)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted">IVA:</span>{' '}
                <span className="text-mono">{fmt(totales.iva)}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                <span>Total: </span>
                <span className="text-mono" style={{ color: 'var(--green-500)' }}>{fmt(totales.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* OBSERVACIONES */}
        <div className="card">
          <div className="card-title">Observaciones</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input className="form-input" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
            </div>
            {isEdit && (
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-select" value={form.estado} onChange={e => set('estado', e.target.value)}>
                  {Object.values(ESTADOS).map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="form-group">
            <textarea className="form-textarea" value={form.observaciones} placeholder="Diagnostico, notas, recomendaciones..."
              onChange={e => set('observaciones', e.target.value)} />
          </div>
        </div>

        {/* ACCIONES */}
        <div className="flex gap-2" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary">{isEdit ? 'Actualizar' : 'Crear Trabajo'}</button>
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
