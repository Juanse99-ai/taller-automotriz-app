import { useState, useMemo } from 'react'
import { fmtDate, fmt } from '../utils/helpers'

export default function Vehiculos({ vehiculos, clientes, notify }) {
  const {
    vehiculos: vehiculosList, buscarPorPlaca, buscarPorCedula,
    agregarVehiculo, agregarHistorial, actualizarVehiculo,
  } = vehiculos

  const { obtenerCliente, clientesTable } = clientes

  const [busqueda, setBusqueda] = useState('')
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState(null)

  // Metricas
  const totalVehiculos = vehiculosList.length
  const conHistorial = useMemo(
    () => vehiculosList.filter(v => v.historial && v.historial.length > 0).length,
    [vehiculosList],
  )
  const marcasUnicas = useMemo(() => {
    const marcas = new Set(vehiculosList.map(v => (v.marca || '').toLowerCase()).filter(Boolean))
    return marcas.size
  }, [vehiculosList])

  // Obtener nombre propietario
  const nombrePropietario = (cedulaPropietario) => {
    if (!cedulaPropietario) return '--'
    const c = obtenerCliente(cedulaPropietario)
    return c ? (c.nombre || '--') : '--'
  }

  // Ultimo servicio de un vehiculo
  const ultimoServicio = (v) => {
    if (!v.historial || v.historial.length === 0) return null
    const sorted = [...v.historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    return sorted[0]
  }

  // Filtrado por busqueda
  const vehiculosFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return vehiculosList
    return vehiculosList.filter(v =>
      (v.placa || '').toLowerCase().includes(term) ||
      (v.marca || '').toLowerCase().includes(term) ||
      nombrePropietario(v.cedulaPropietario).toLowerCase().includes(term),
    )
  }, [vehiculosList, busqueda, clientesTable])

  const seleccionar = (vehiculo) => {
    setVehiculoSeleccionado(vehiculo)
  }

  const volver = () => {
    setVehiculoSeleccionado(null)
  }

  // Badge class segun estado
  const badgeEstado = (estado) => {
    if (!estado) return 'badge'
    const e = estado.toLowerCase()
    if (e === 'completado' || e === 'finalizado' || e === 'entregado') return 'badge badge-success'
    if (e === 'en proceso' || e === 'en progreso' || e === 'pendiente') return 'badge badge-warning'
    if (e === 'cancelado') return 'badge badge-danger'
    return 'badge badge-info'
  }

  // --- VISTA DETALLE ---
  if (vehiculoSeleccionado) {
    const propietarioCedula = vehiculoSeleccionado.cedulaPropietario
    const propietarioNombre = nombrePropietario(propietarioCedula)
    const historial = vehiculoSeleccionado.historial || []
    const historialOrdenado = [...historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={volver}>
            Volver
          </button>
        </div>

        {/* Info del vehiculo */}
        <div className="card">
          <div className="card-title">Informacion del Vehiculo</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Placa</label>
              <input className="form-input" value={vehiculoSeleccionado.placa || ''} disabled
                style={{ background: 'var(--slate-50)', color: 'var(--slate-500)' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Marca</label>
              <input className="form-input" value={vehiculoSeleccionado.marca || ''} disabled
                style={{ background: 'var(--slate-50)', color: 'var(--slate-500)' }} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Modelo</label>
              <input className="form-input" value={vehiculoSeleccionado.modelo || ''} disabled
                style={{ background: 'var(--slate-50)', color: 'var(--slate-500)' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Ano</label>
              <input className="form-input" value={vehiculoSeleccionado.ano || ''} disabled
                style={{ background: 'var(--slate-50)', color: 'var(--slate-500)' }} />
            </div>
          </div>
        </div>

        {/* Propietario */}
        <div className="card">
          <div className="card-title">Propietario</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Cedula</label>
              <input className="form-input" value={propietarioCedula || '--'} disabled
                style={{ background: 'var(--slate-50)', color: 'var(--slate-500)' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input className="form-input" value={propietarioNombre} disabled
                style={{ background: 'var(--slate-50)', color: 'var(--slate-500)' }} />
            </div>
          </div>
        </div>

        {/* Historial de Servicio */}
        <div className="card">
          <div className="card-title">Historial de Servicio ({historial.length})</div>
          {historialOrdenado.length === 0 ? (
            <div className="empty-state">
              <p className="text-muted">Sin historial de servicio</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {historialOrdenado.map((h, idx) => (
                <div key={h.id || idx} style={{
                  border: '1px solid var(--slate-200)',
                  borderRadius: 'var(--radius)',
                  padding: 16,
                  position: 'relative',
                  borderLeft: '3px solid var(--blue-500)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--slate-800)' }}>
                      {fmtDate(h.fecha)}
                    </span>
                    {h.estado && (
                      <span className={badgeEstado(h.estado)}>
                        {h.estado}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, fontSize: 13 }}>
                    <div>
                      <span className="text-muted" style={{ fontWeight: 600 }}>Kilometraje: </span>
                      <span>{h.kilometraje != null ? h.kilometraje.toLocaleString('es-CO') : '--'}</span>
                    </div>
                    <div>
                      <span className="text-muted" style={{ fontWeight: 600 }}>Tecnico: </span>
                      <span>{h.tecnico || '--'}</span>
                    </div>
                    <div>
                      <span className="text-muted" style={{ fontWeight: 600 }}>Total: </span>
                      <span style={{ fontWeight: 700, color: 'var(--green-600)' }}>{fmt(h.total)}</span>
                    </div>
                  </div>
                  {h.observaciones && (
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--slate-600)' }}>
                      <span className="text-muted" style={{ fontWeight: 600 }}>Observaciones: </span>
                      {h.observaciones}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- VISTA LISTA ---
  return (
    <div>
      {/* Metricas */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{totalVehiculos}</div>
          <div className="metric-label">Total Vehiculos</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--green-500)' }}>{conHistorial}</div>
          <div className="metric-label">Con Historial</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--purple-500)' }}>{marcasUnicas}</div>
          <div className="metric-label">Marcas Unicas</div>
        </div>
      </div>

      {/* Barra de busqueda */}
      <div className="card">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            className="form-input"
            placeholder="Buscar por placa, marca o propietario..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {/* Tabla de vehiculos */}
      <div className="card">
        <div className="card-title">Vehiculos ({vehiculosFiltrados.length})</div>
        {vehiculosFiltrados.length === 0 ? (
          <div className="empty-state">
            <p className="text-muted">No se encontraron vehiculos</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Ano</th>
                  <th>Propietario</th>
                  <th># Visitas</th>
                  <th>Ultimo Servicio</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {vehiculosFiltrados.map(v => {
                  const ultimo = ultimoServicio(v)
                  return (
                    <tr key={v.placa}>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{v.placa}</td>
                      <td>{v.marca || '--'}</td>
                      <td>{v.modelo || '--'}</td>
                      <td>{v.ano || '--'}</td>
                      <td>{nombrePropietario(v.cedulaPropietario)}</td>
                      <td className="text-center">
                        <span className="badge badge-info">{(v.historial || []).length}</span>
                      </td>
                      <td className="text-sm text-muted">
                        {ultimo ? fmtDate(ultimo.fecha) : fmtDate(v.fechaUltimoServicio)}
                      </td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => seleccionar(v)}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
