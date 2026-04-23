import { useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { InspeccionDetalle } from './Inspecciones'
import { ESTADOS, TECNICOS } from '../utils/constants'
import { fmtDate, fmt } from '../utils/helpers'

const ESTADO_TRABAJO_DISPLAY = {
  [ESTADOS.PENDIENTE]: { label: 'Recibido', color: '#64748b', icon: '1', pct: 15 },
  [ESTADOS.EN_DIAGNOSTICO]: { label: 'En Diagnostico', color: '#2563eb', icon: '2', pct: 30 },
  [ESTADOS.ESPERANDO_REPUESTOS]: { label: 'Esperando Repuestos', color: '#d97706', icon: '3', pct: 45 },
  [ESTADOS.EN_PROGRESO]: { label: 'En Reparacion', color: '#2563eb', icon: '4', pct: 60 },
  [ESTADOS.EN_PRUEBA]: { label: 'En Prueba', color: '#7c3aed', icon: '5', pct: 80 },
  [ESTADOS.COMPLETADO]: { label: 'Listo para Entrega', color: '#16a34a', icon: '6', pct: 100 },
  [ESTADOS.PROGRAMADO]: { label: 'Programado', color: '#64748b', icon: '—', pct: 10 },
  [ESTADOS.CANCELADO]: { label: 'Cancelado', color: '#dc2626', icon: '✕', pct: 0 },
}

// Consulta directa a Supabase via proxy (funciona desde cualquier dispositivo)
async function buscarTrabajosPorCedula(cedula) {
  try {
    const url = `/api/supabase?table=trabajos&cedula_cliente=eq.${encodeURIComponent(cedula)}&order=fecha.desc`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Error consultando')
    const rows = await res.json()
    return rows.map(r => ({
      id: r.id,
      fecha: r.fecha || r.created_at,
      cedula: r.cedula_cliente,
      cliente: r.cliente,
      placa: r.placa,
      marca: r.marca,
      modelo: r.modelo,
      ano: r.ano,
      kilometraje: r.kilometraje,
      tecnicoId: r.tecnico_id,
      estado: r.estado || 'Pendiente',
      observaciones: r.observaciones,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
      total: parseFloat(r.total) || 0,
      otCodigo: r.ot_codigo || '',
      inspeccion: typeof r.inspeccion === 'string' ? JSON.parse(r.inspeccion) : (r.inspeccion || null),
    }))
  } catch (e) {
    console.warn('Portal: error buscando trabajos', e.message)
    return []
  }
}

export default function PortalCliente() {
  const [cedula, setCedula] = useState('')
  const [autenticado, setAutenticado] = useState(false)
  const [datos, setDatos] = useState(null)
  const [vistaInspeccion, setVistaInspeccion] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const buscar = async (e) => {
    e.preventDefault()
    if (!cedula.trim()) return

    const cedulaLimpia = cedula.trim().replace(/[.\-\s]/g, '')
    setCargando(true)
    setError('')

    const misTrab = await buscarTrabajosPorCedula(cedulaLimpia)

    // Extraer inspecciones embebidas en trabajos
    const misInsp = misTrab
      .filter(t => t.inspeccion && t.inspeccion.items)
      .map(t => ({
        ...t.inspeccion,
        placa: t.inspeccion.placa || t.placa,
        cliente: t.inspeccion.cliente || t.cliente,
        vehiculo: t.inspeccion.vehiculo || [t.marca, t.modelo, t.ano].filter(Boolean).join(' '),
        fecha: t.inspeccion.fecha || t.fecha,
      }))

    setCargando(false)

    if (misTrab.length === 0) {
      setError('No se encontraron registros para este documento. Verifica el numero e intenta de nuevo.')
      setDatos(null)
      setAutenticado(false)
      return
    }

    setDatos({ trabajos: misTrab, inspecciones: misInsp, cedula: cedulaLimpia })
    setAutenticado(true)
  }

  const descargarPDF = (insp) => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('Reporte de Inspeccion Vehicular', 14, 16)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text(`Multidiagnosticos AS — ${new Date().toLocaleDateString('es-CO')}`, 14, 22)

    doc.setFontSize(11)
    doc.text(`Vehiculo: ${insp.vehiculo || insp.placa}`, 14, 32)
    doc.text(`Placa: ${insp.placa}`, 14, 38)
    doc.text(`Cliente: ${insp.cliente || '—'}`, 14, 44)
    doc.text(`Tecnico: ${insp.tecnico || '—'}`, 120, 32)
    doc.text(`Fecha: ${new Date(insp.fecha).toLocaleDateString('es-CO')}`, 120, 38)

    const items = insp.items || []
    const urgentes = items.filter(i => i.estado === 'urgente')
    const sugeridos = items.filter(i => i.estado === 'sugerido')
    const buenos = items.filter(i => i.estado === 'bueno')
    const total = items.filter(i => i.estado !== 'no_aplica').length
    const pct = total > 0 ? Math.round((buenos.length / total) * 100) : 0

    doc.setFontSize(14)
    doc.text(`Estado general: ${pct}%`, 14, 54)

    if (urgentes.length > 0) {
      autoTable(doc, {
        startY: 60,
        head: [['REPARACION URGENTE', 'Observaciones']],
        body: urgentes.map(i => [i.nombre, i.comentario || '—']),
        headStyles: { fillColor: [220, 38, 38] },
        styles: { fontSize: 9 },
      })
    }

    if (sugeridos.length > 0) {
      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 60) + 6,
        head: [['REPARACION SUGERIDA', 'Observaciones']],
        body: sugeridos.map(i => [i.nombre, i.comentario || '—']),
        headStyles: { fillColor: [217, 119, 6] },
        styles: { fontSize: 9 },
      })
    }

    if (buenos.length > 0) {
      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 60) + 6,
        head: [['BUEN ESTADO', 'Observaciones']],
        body: buenos.map(i => [i.nombre, i.comentario || '—']),
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 9 },
      })
    }

    doc.save(`inspeccion_${insp.placa}_${insp.fecha?.slice(0, 10) || 'reporte'}.pdf`)
  }

  // Vista de detalle de inspeccion
  if (vistaInspeccion) {
    return (
      <div className="portal-container">
        <div className="portal-header">
          <img src="/logo.png" alt="MDA" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <h1>Multidiagnosticos AS</h1>
        </div>
        <InspeccionDetalle inspeccion={vistaInspeccion} onVolver={() => setVistaInspeccion(null)} />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => descargarPDF(vistaInspeccion)}>
            Descargar Reporte PDF
          </button>
        </div>
      </div>
    )
  }

  // Vista login por cedula
  if (!autenticado) {
    return (
      <div className="portal-container">
        <div className="portal-login-card">
          <div className="portal-header">
            <img src="/logo.png" alt="MDA" style={{ width: 50, height: 50, objectFit: 'contain' }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '12px 0 4px' }}>Multidiagnosticos AS</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Seguimiento en linea de su vehiculo</p>
          </div>

          <form onSubmit={buscar} style={{ marginTop: 24 }}>
            <div className="form-group">
              <label className="form-label">Ingrese su numero de cedula o NIT</label>
              <input
                className="form-input"
                value={cedula}
                onChange={e => setCedula(e.target.value)}
                placeholder="Ej: 1234567890"
                style={{ fontSize: 16, padding: '14px 16px', textAlign: 'center' }}
                autoFocus
              />
            </div>
            {error && (
              <div style={{ background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 15 }} disabled={cargando}>
              {cargando ? 'Consultando...' : 'Consultar Estado'}
            </button>
          </form>

          <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>
            Su numero de documento es la clave de acceso para ver el estado de sus vehiculos.
          </p>
        </div>
      </div>
    )
  }

  // Vista principal del cliente
  const trabajoActivo = datos.trabajos.find(t =>
    t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO
  )

  const tecNombre = (id) => TECNICOS.find(t => t.id === parseInt(id))?.nombre || ''

  return (
    <div className="portal-container">
      <div className="portal-header">
        <img src="/logo.png" alt="MDA" style={{ width: 40, height: 40, objectFit: 'contain' }} />
        <h1>Multidiagnosticos AS</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => { setAutenticado(false); setDatos(null); setCedula('') }}
          style={{ position: 'absolute', right: 16, top: 16 }}>
          Salir
        </button>
      </div>

      {/* Trabajo activo - seguimiento */}
      {trabajoActivo && (
        <div className="card">
          <div className="card-title">Estado de su Vehiculo</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div><span className="text-sm text-muted">Placa:</span> <strong>{trabajoActivo.placa}</strong></div>
            <div><span className="text-sm text-muted">Vehiculo:</span> <strong>{[trabajoActivo.marca, trabajoActivo.modelo].filter(Boolean).join(' ') || '—'}</strong></div>
            <div><span className="text-sm text-muted">Ingreso:</span> <strong>{fmtDate(trabajoActivo.fecha)}</strong></div>
            <div><span className="text-sm text-muted">Tecnico:</span> <strong>{tecNombre(trabajoActivo.tecnicoId) || '—'}</strong></div>
            {trabajoActivo.otCodigo && <div><span className="text-sm text-muted">OT:</span> <strong>{trabajoActivo.otCodigo}</strong></div>}
          </div>

          {/* Barra de progreso */}
          <div className="portal-progress">
            <div className="portal-progress-bar">
              <div className="portal-progress-fill"
                style={{ width: `${ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct || 0}%`, background: ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.color }} />
            </div>
            <div className="portal-progress-label">
              <span style={{ color: ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.color, fontWeight: 700 }}>
                {ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.label || trabajoActivo.estado}
              </span>
              <span className="text-sm text-muted">{ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct || 0}%</span>
            </div>
          </div>

          {/* Pasos del proceso */}
          <div className="portal-steps">
            {['Recibido', 'Diagnostico', 'Repuestos', 'Reparacion', 'Prueba', 'Listo'].map((paso, i) => {
              const pctStep = [15, 30, 45, 60, 80, 100][i]
              const currentPct = ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct || 0
              const done = currentPct >= pctStep
              const active = currentPct >= pctStep - 15 && currentPct < pctStep
              return (
                <div key={paso} className={`portal-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                  <div className="portal-step-circle">{done ? '✓' : i + 1}</div>
                  <span className="portal-step-label">{paso}</span>
                </div>
              )
            })}
          </div>

          {trabajoActivo.observaciones && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, fontSize: 13 }}>
              <strong>Observaciones:</strong> {trabajoActivo.observaciones}
            </div>
          )}
        </div>
      )}

      {/* Inspecciones */}
      {datos.inspecciones.length > 0 && (
        <div className="card">
          <div className="card-title">Inspecciones de su Vehiculo</div>
          {datos.inspecciones.map((insp, idx) => {
            const items = insp.items || []
            const urgentes = items.filter(i => i.estado === 'urgente').length
            const sugeridos = items.filter(i => i.estado === 'sugerido').length
            const buenos = items.filter(i => i.estado === 'bueno').length
            const total = items.filter(i => i.estado !== 'no_aplica').length
            const pct = total > 0 ? Math.round((buenos / total) * 100) : 0

            return (
              <div key={insp.id || idx} style={{ padding: '14px 0', borderBottom: '1px solid var(--border-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{insp.placa}</strong> — {insp.vehiculo || ''}
                    <div className="text-sm text-muted">{fmtDate(insp.fecha)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {buenos > 0 && <span className="badge badge-success">{buenos}</span>}
                      {sugeridos > 0 && <span className="badge badge-warning">{sugeridos}</span>}
                      {urgentes > 0 && <span className="badge badge-danger">{urgentes}</span>}
                    </div>
                    <span style={{ fontWeight: 700, color: pct >= 80 ? 'var(--green-500)' : pct >= 50 ? 'var(--amber-500)' : 'var(--red-500)' }}>{pct}%</span>
                    <button className="btn btn-outline btn-sm" onClick={() => setVistaInspeccion(insp)}>Ver Detalle</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => descargarPDF(insp)}>PDF</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Historial de trabajos */}
      {datos.trabajos.length > 0 && (
        <div className="card">
          <div className="card-title">Historial de Servicios</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Placa</th>
                  <th>Vehiculo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.trabajos.map(t => (
                  <tr key={t.id}>
                    <td className="text-sm text-muted">{fmtDate(t.fecha)}</td>
                    <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                    <td className="text-sm">{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                    <td>
                      <span className="badge" style={{
                        background: (ESTADO_TRABAJO_DISPLAY[t.estado]?.color || '#64748b') + '20',
                        color: ESTADO_TRABAJO_DISPLAY[t.estado]?.color || '#64748b'
                      }}>
                        {ESTADO_TRABAJO_DISPLAY[t.estado]?.label || t.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!trabajoActivo && datos.trabajos.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🚗</div>
          <p>No hay trabajos activos en este momento.</p>
        </div>
      )}
    </div>
  )
}
