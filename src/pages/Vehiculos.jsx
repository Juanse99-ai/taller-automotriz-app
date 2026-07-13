import { useState, useMemo } from 'react'
import { fmtDate, fmt } from '../utils/helpers'
import { ESTADOS } from '../utils/constants'
import { useTecnicos } from '../services/tecnicos'

export default function Vehiculos({ vehiculos, clientes, trabajos = [], notify }) {
  const {
    vehiculos: vehiculosBase, buscarPorPlaca, buscarPorCedula,
    agregarVehiculo, agregarHistorial, actualizarVehiculo,
  } = vehiculos

  const { obtenerCliente, clientesTable } = clientes
  const TECNICOS = useTecnicos()

  // El historial de servicio se deriva de las OT COMPLETADAS de cada placa.
  // No se persiste en el vehiculo: siempre refleja los trabajos actuales.
  const historialPorPlaca = useMemo(() => {
    const nombreTecnico = (id) => {
      const t = TECNICOS.find(tc => tc.id === parseInt(id))
      return t ? t.nombre : ''
    }
    const map = {}
    trabajos.forEach(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return
      const placa = (t.placa || '').trim().toUpperCase()
      if (!placa) return
      ;(map[placa] || (map[placa] = [])).push({
        id: t.id,
        trabajoId: t.otCodigo || t.id,
        fecha: t.fecha,
        kilometraje: t.kilometraje ?? null,
        tecnico: nombreTecnico(t.tecnicoId),
        total: t.total || 0,
        estado: t.estado,
        observaciones: t.observaciones || '',
      })
    })
    return map
  }, [trabajos, TECNICOS])

  // Vehiculos con su historial derivado inyectado (reemplaza el campo vacio de BD)
  const vehiculosList = useMemo(
    () => vehiculosBase.map(v => ({
      ...v,
      historial: historialPorPlaca[(v.placa || '').trim().toUpperCase()] || [],
    })),
    [vehiculosBase, historialPorPlaca],
  )

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
                <div className="field"><label>Año</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.ano || '--'}</div></div>
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
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .8 }}>
                  <rect x="9" y="2" width="6" height="4" rx="1"/>
                  <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>
                </svg>
                <p>Sin historial de servicio</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {historialOrdenado.map((h, idx) => (
                  <div key={h.id || idx} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 16,
                    background: 'var(--bg-subtle)',
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

      {/* KPI hero + 2 mini */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-hero" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Total vehículos en BD</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', background: 'var(--bg-subtle)', padding: '4px 10px', borderRadius: 999 }}>
              {marcasUnicas} marcas
            </span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'clamp(36px, 5.5vw, 56px)', letterSpacing: '-1.2px', lineHeight: 1, color: 'var(--text)' }}>
                {totalVehiculos.toLocaleString('es-CO')}
              </div>
              <div style={{ fontSize: 14.5, color: 'var(--text-2)', fontWeight: 500 }}>
                placas registradas
              </div>
            </div>
            {totalVehiculos > 0 && (
              <div style={{ fontSize: 13.5, color: 'var(--text-3)', marginTop: 8, fontWeight: 500 }}>
                {conHistorial} con al menos un servicio registrado ({Math.round((conHistorial/totalVehiculos)*100)}%)
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10 }}>
          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic green" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Con historial</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 26, color: 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{conHistorial}</div>
            </div>
          </div>

          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic amber" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Marcas únicas</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 26, color: 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{marcasUnicas}</div>
            </div>
          </div>
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
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: .8 }}>
                <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
                <circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>
              </svg>
              <p>No se encontraron vehículos</p>
            </div>
          ) : (
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Año</th>
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
