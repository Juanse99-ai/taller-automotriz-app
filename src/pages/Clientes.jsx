import { useState, useMemo } from 'react'
import { fmtDate } from '../utils/helpers'

export default function Clientes({ clientes, vehiculos, notify }) {
  const {
    clientesTable, guardarCliente, obtenerCliente, listarClientes,
    vincularVehiculo, guardarEnCuentti, buscarDebounced, resultados,
    buscando, setResultados,
  } = clientes

  const { buscarPorCedula } = vehiculos

  const [busqueda, setBusqueda] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [editForm, setEditForm] = useState({ nombre: '', telefono: '', email: '', direccion: '' })
  const [guardandoCuentti, setGuardandoCuentti] = useState(false)

  // Metricas
  const totalClientes = clientesTable.length
  const conCuenttiId = useMemo(() => clientesTable.filter(c => c.cuenttiId).length, [clientesTable])
  const conVehiculos = useMemo(() => clientesTable.filter(c => c.vehiculos && c.vehiculos.length > 0).length, [clientesTable])

  // Filtrado por busqueda
  const clientesFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return clientesTable
    return clientesTable.filter(c =>
      (c.cedula || '').toLowerCase().includes(term) ||
      (c.nombre || '').toLowerCase().includes(term)
    )
  }, [clientesTable, busqueda])

  // Seleccionar cliente para ver detalle
  const seleccionar = (cliente) => {
    setClienteSeleccionado(cliente)
    setEditForm({
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      direccion: cliente.direccion || '',
    })
  }

  const volver = () => {
    setClienteSeleccionado(null)
    setEditForm({ nombre: '', telefono: '', email: '', direccion: '' })
  }

  const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const handleGuardarLocal = () => {
    if (!clienteSeleccionado) return
    const actualizado = guardarCliente({
      cedula: clienteSeleccionado.cedula,
      nombre: editForm.nombre,
      telefono: editForm.telefono,
      email: editForm.email,
      direccion: editForm.direccion,
    })
    if (actualizado) {
      setClienteSeleccionado(actualizado)
      notify('Cliente actualizado localmente', 'success')
    }
  }

  const handleGuardarCuentti = async () => {
    if (!clienteSeleccionado) return
    setGuardandoCuentti(true)
    try {
      const payload = {
        cedula: clienteSeleccionado.cedula,
        cuenttiId: clienteSeleccionado.cuenttiId,
        nombre: editForm.nombre,
        telefono: editForm.telefono,
        email: editForm.email,
        direccion: editForm.direccion,
      }
      const result = await guardarEnCuentti(payload)
      if (result.success) {
        setClienteSeleccionado(result.data)
        notify('Cliente guardado en Cuentti exitosamente', 'success')
      } else {
        notify('Error al guardar en Cuentti: ' + (result.error || 'Error desconocido'), 'error')
      }
    } finally {
      setGuardandoCuentti(false)
    }
  }

  // Vehiculos del cliente seleccionado
  const vehiculosCliente = useMemo(() => {
    if (!clienteSeleccionado) return []
    return buscarPorCedula(clienteSeleccionado.cedula)
  }, [clienteSeleccionado, buscarPorCedula])

  // --- VISTA DETALLE ---
  if (clienteSeleccionado) {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={volver}>
            Volver
          </button>
        </div>

        <div className="card">
          <div className="card-title">
            Informacion del Cliente
            {clienteSeleccionado.cuenttiId && (
              <span className="badge badge-success" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                Cuentti #{clienteSeleccionado.cuenttiId}
              </span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Cedula / NIT</label>
              <input className="form-input" value={clienteSeleccionado.cedula} disabled
                style={{ background: 'var(--slate-50)', color: 'var(--slate-500)' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input className="form-input" value={editForm.nombre}
                onChange={e => setEdit('nombre', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Telefono</label>
              <input className="form-input" value={editForm.telefono}
                onChange={e => setEdit('telefono', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={editForm.email} type="email"
                onChange={e => setEdit('email', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Direccion</label>
              <input className="form-input" value={editForm.direccion}
                onChange={e => setEdit('direccion', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleGuardarLocal}>
              Guardar Cambios
            </button>
            <button className="btn btn-success" onClick={handleGuardarCuentti} disabled={guardandoCuentti}>
              {guardandoCuentti ? 'Guardando...' : 'Guardar en Cuentti'}
            </button>
          </div>
        </div>

        {/* Vehiculos del cliente */}
        <div className="card">
          <div className="card-title">Vehiculos del Cliente ({vehiculosCliente.length})</div>
          {vehiculosCliente.length === 0 ? (
            <div className="empty-state">
              <p className="text-muted">Este cliente no tiene vehiculos registrados</p>
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
                    <th># Visitas</th>
                    <th>Ultimo Servicio</th>
                  </tr>
                </thead>
                <tbody>
                  {vehiculosCliente.map(v => (
                    <tr key={v.placa}>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{v.placa}</td>
                      <td>{v.marca || '--'}</td>
                      <td>{v.modelo || '--'}</td>
                      <td>{v.ano || '--'}</td>
                      <td className="text-center">
                        <span className="badge badge-info">{(v.historial || []).length}</span>
                      </td>
                      <td className="text-sm text-muted">{fmtDate(v.fechaUltimoServicio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div className="metric-value">{totalClientes}</div>
          <div className="metric-label">Total Clientes</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--green-500)' }}>{conCuenttiId}</div>
          <div className="metric-label">Con Cuentti ID</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--purple-500)' }}>{conVehiculos}</div>
          <div className="metric-label">Con Vehiculos</div>
        </div>
      </div>

      {/* Barra de busqueda */}
      <div className="card">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            className="form-input"
            placeholder="Buscar por cedula o nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {/* Tabla de clientes */}
      <div className="card">
        <div className="card-title">Clientes ({clientesFiltrados.length})</div>
        {clientesFiltrados.length === 0 ? (
          <div className="empty-state">
            <p className="text-muted">No se encontraron clientes</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cedula</th>
                  <th>Nombre</th>
                  <th>Telefono</th>
                  <th>Email</th>
                  <th># Vehiculos</th>
                  <th>Ultima Visita</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(c => (
                  <tr key={c.id || c.cedula}>
                    <td className="text-mono">{c.cedula || '--'}</td>
                    <td>{c.nombre || '--'}</td>
                    <td className="text-sm">{c.telefono || '--'}</td>
                    <td className="text-sm text-muted">{c.email || '--'}</td>
                    <td className="text-center">
                      <span className={`badge ${(c.vehiculos || []).length > 0 ? 'badge-success' : 'badge-warning'}`}>
                        {(c.vehiculos || []).length}
                      </span>
                    </td>
                    <td className="text-sm text-muted">{fmtDate(c.fechaUltimaVisita)}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => seleccionar(c)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
