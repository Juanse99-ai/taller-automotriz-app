import { useState, useMemo } from 'react'
import { fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre } from '../utils/helpers'
import { TECNICOS, ESTADOS } from '../utils/constants'
import { useClientes } from '../hooks/useClientes'

export default function Recepcion({ hook, notify }) {
  const { trabajos, agregarTrabajo } = hook
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()

  const pendientes = useMemo(() =>
    trabajos.filter(t => t.estado === ESTADOS.PENDIENTE || t.estado === ESTADOS.EN_PROGRESO)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [trabajos])

  const [form, setForm] = useState({
    cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
    placa: '', marca: '', modelo: '', ano: new Date().getFullYear(),
    kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(),
    programar: false,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const seleccionarCliente = (c) => {
    set('cedula', normalizarDoc(c))
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', c.telefono || c.phone || '')
    set('emailCliente', c.email || c.correo || '')
    set('clienteId', c.id || '')
    setResultados([])
  }

  const handleRecibir = async (e) => {
    e.preventDefault()
    if (!form.placa || !form.cliente) {
      notify('Placa y cliente son obligatorios', 'error')
      return
    }
    await agregarTrabajo({
      ...form,
      placa: form.placa.toUpperCase(),
      ano: parseInt(form.ano) || new Date().getFullYear(),
      kilometraje: parseInt(form.kilometraje) || 0,
      tecnicoId: parseInt(form.tecnicoId) || null,
      items: [],
      subtotalSinIva: 0, totalIva: 0, total: 0,
      estado: form.programar ? ESTADOS.PROGRAMADO : ESTADOS.PENDIENTE,
      generarOt: form.programar,
      fecha: new Date(form.fecha + 'T12:00:00').toISOString(),
    })
    notify('Vehiculo recibido exitosamente', 'success')
    setForm({
      cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
      placa: '', marca: '', modelo: '', ano: new Date().getFullYear(),
      kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(), programar: false,
    })
  }

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--amber-500)' }}>{pendientes.length}</div>
          <div className="metric-label">Vehiculos en Taller</div>
        </div>
      </div>

      {/* Formulario rapido */}
      <div className="card">
        <div className="card-title">Recibir Vehiculo</div>
        <form onSubmit={handleRecibir}>
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
                    </div>
                  ))}
                </div>
              )}
              {buscando && <span className="text-xs text-muted mt-2" style={{ display: 'block' }}>Buscando...</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Nombre del Cliente *</label>
              <input className="form-input" value={form.cliente} required placeholder="Nombre completo"
                onChange={e => { set('cliente', e.target.value); buscarDebounced(e.target.value) }} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefono</label>
              <input className="form-input" value={form.telefonoCliente} placeholder="300..."
                onChange={e => set('telefonoCliente', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Placa *</label>
              <input className="form-input" value={form.placa} required placeholder="ABC123" style={{ textTransform: 'uppercase' }}
                onChange={e => set('placa', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Marca</label>
              <input className="form-input" value={form.marca} placeholder="Toyota, Mazda..."
                onChange={e => set('marca', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Modelo</label>
              <input className="form-input" value={form.modelo} placeholder="Corolla, CX-5..."
                onChange={e => set('modelo', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ano</label>
              <input className="form-input" type="number" value={form.ano} min="1980" max="2030"
                onChange={e => set('ano', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Kilometraje</label>
              <input className="form-input" type="number" value={form.kilometraje} min="0" placeholder="45000"
                onChange={e => set('kilometraje', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tecnico Asignado</label>
              <select className="form-select" value={form.tecnicoId} onChange={e => set('tecnicoId', e.target.value)}>
                <option value="">Sin asignar</option>
                {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones / Diagnostico inicial</label>
            <textarea className="form-textarea" value={form.observaciones} placeholder="Motivo de ingreso, diagnostico previo, daños visibles..."
              onChange={e => set('observaciones', e.target.value)} />
          </div>

          <div className="form-row" style={{ alignItems: 'center' }}>
            <label className="form-label" style={{ marginRight: 8 }}>Programar (genera OT)</label>
            <input type="checkbox" checked={form.programar} onChange={e => set('programar', e.target.checked)} />
            <span className="text-xs text-muted" style={{ marginLeft: 8 }}>Crea orden OT y deja estado "Programado"</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Recibir Vehiculo</button>
          </div>
        </form>
      </div>

      {/* Vehiculos en taller */}
      {pendientes.length > 0 && (
        <div className="card">
          <div className="card-title">Vehiculos en Taller ({pendientes.length})</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th>Vehiculo</th>
                  <th>Tecnico</th>
                  <th>Estado</th>
                  <th>Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map(t => {
                  const tecNombre = TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))?.nombre || 'Sin asignar'
                  const bc = t.estado === ESTADOS.EN_PROGRESO ? 'badge-info' : 'badge-warning'
                  return (
                    <tr key={t.id}>
                      <td className="text-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                      <td>{t.cliente || '—'}</td>
                      <td className="text-sm">{[t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || '—'}</td>
                      <td className="text-sm">{tecNombre}</td>
                      <td><span className={`badge ${bc}`}>{t.estado}</span></td>
                      <td className="text-sm text-muted">{fmtDate(t.fecha)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
