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

  const seleccionar = (vehiculo) => setVehiculoSeleccionado(vehiculo)
  const volver = () => setVehiculoSeleccionado(null)

  // --- VISTA DETALLE ---
  if (vehiculoSeleccionado) {
    const propietarioCedula = vehiculoSeleccionado.cedulaPropietario
    const propietarioNombre = nombrePropietario(propietarioCedula)
    const historial = vehiculoSeleccionado.historial || []
    const historialOrdenado = [...historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

    return (
      <div>
        <div className="pagehd">
          <div>
            <h2>{vehiculoSeleccionado.placa}</h2>
            <p className="sub">{vehiculoSeleccionado.marca} {vehiculoSeleccionado.modelo} {vehiculoSeleccionado.ano}</p>
          </div>
          <div className="actions">
            <button className="btn btn-outline btn-sm" onClick={volver}>← Volver</button>
          </div>
        </div>

        {/* Info del vehiculo + Propietario */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginBottom: 16 }}>
          <div className="card">
            <div className="card__h"><h3>Informacion del Vehiculo</h3></div>
            <div className="card__b">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Placa</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.placa || '--'}</div></div>
                <div className="field"><label>Marca</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.marca || '--'}</div></div>
                <div className="field"><label>Modelo</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.modelo || '--'}</div></div>
                <div className="field"><label>Ano</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.ano || '--'}</div></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__h"><h3>Propietario</h3></div>
            <div className="card__b">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Cedula</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{propietarioCedula || '--'}</div></div>
                <div className="field"><label>Nombre</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{propietarioNombre}</div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Historial de Servicio */}
        <div className="card">
          <div className="card__h"><h3>Historial de Servicio</h3><span className="badge badge-n">{historial.length}</span></div>
          <div className="card__b">
            {historialOrdenado.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <p>Sin historial de servicio</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {historialOrdenado.map((h, idx) => (
                  <div key={h.id || idx} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 16,
                    borderLeft: '3px solid var(--accent)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{fmtDate(h.fecha)}</span>
                      {h.estado && <span className="badge badge-n">{h.estado}</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, fontSize: 13 }}>
                      <div><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Km: </span><span className="mono">{h.kilometraje != null ? h.kilometraje.toLocaleString('es-CO') : '--'}</span></div>
                      <div><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Tecnico: </span><span>{h.tecnico || '--'}</span></div>
                      <div><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Total: </span><span className="mono" style={{ fontWeight: 700, color: 'var(--green-600)' }}>{fmt(h.total)}</span></div>
                    </div>
                    {h.observaciones && (
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>
                        <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Obs: </span>{h.observaciones}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- VISTA LISTA ---
  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>Vehiculos</h2>
          <p className="sub">Historial y seguimiento vehicular</p>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi__head"><span>Total Vehiculos</span><span className="kpi__ic blue">🚗</span></div>
          <div className="kpi__v">{totalVehiculos}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><span>Con Historial</span><span className="kpi__ic green">📋</span></div>
          <div className="kpi__v">{conHistorial}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><span>Marcas Unicas</span><span className="kpi__ic purple">🏷</span></div>
          <div className="kpi__v">{marcasUnicas}</div>
        </div>
      </div>

      {/* Busqueda */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__b" style={{ padding: '12px 16px' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <input
              className="input"
              placeholder="Buscar por placa, marca o propietario..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        <div className="card__h"><h3>Vehiculos</h3><span className="badge badge-n">{vehiculosFiltrados.length}</span></div>
        <div className="card__b" style={{ padding: 0 }}>
          {vehiculosFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🚗</div>
              <p>No se encontraron vehiculos</p>
            </div>
          ) : (
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Ano</th>
                    <th>Propietario</th>
                    <th>Visitas</th>
                    <th>Ultimo Servicio</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {vehiculosFiltrados.map(v => {
                    const ultimo = ultimoServicio(v)
                    return (
                      <tr key={v.placa}>
                        <td><span className="mono" style={{ fontWeight: 700 }}>{v.placa}</span></td>
                        <td>{v.marca || '--'}</td>
                        <td>{v.modelo || '--'}</td>
                        <td>{v.ano || '--'}</td>
                        <td>{nombrePropietario(v.cedulaPropietario)}</td>
                        <td><span className="badge badge-n">{(v.historial || []).length}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          {ultimo ? fmtDate(ultimo.fecha) : fmtDate(v.fechaUltimoServicio)}
                        </td>
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={() => seleccionar(v)}>
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
    </div>
  )
}
