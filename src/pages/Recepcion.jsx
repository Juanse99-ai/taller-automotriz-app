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

  const [paso, setPaso] = useState(1) // 1=Cliente, 2=Vehiculo, 3=Fotos, 4=Confirmar
  const [form, setForm] = useState({
    cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
    placa: '', marca: '', modelo: '', ano: new Date().getFullYear(),
    kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(),
    programar: false,
    evidenciasIngreso: [],
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
      evidenciasIngreso: form.evidenciasIngreso,
      fecha: new Date(form.fecha + 'T12:00:00').toISOString(),
    })
    notify('Vehiculo recibido exitosamente', 'success')
    setPaso(1)
    setForm({
      cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
      placa: '', marca: '', modelo: '', ano: new Date().getFullYear(),
      kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(), programar: false,
      evidenciasIngreso: [],
    })
  }

  const addFotosIngreso = (files) => {
    if (!files?.length) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        setForm(f => ({
          ...f,
          evidenciasIngreso: [
            ...f.evidenciasIngreso,
            { id: uid(), nombre: file.name, dataUrl: reader.result, nota: '' },
          ],
        }))
      }
      reader.readAsDataURL(file)
    })
  }

  const actualizarNotaFoto = (id, nota) => {
    setForm(f => ({
      ...f,
      evidenciasIngreso: f.evidenciasIngreso.map(fv => fv.id === id ? { ...fv, nota } : fv),
    }))
  }

  const quitarFoto = (id) => {
    setForm(f => ({ ...f, evidenciasIngreso: f.evidenciasIngreso.filter(fv => fv.id !== id) }))
  }

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--amber-500)' }}>{pendientes.length}</div>
          <div className="metric-label">Vehiculos en Taller</div>
        </div>
      </div>

      {/* Wizard Steps */}
      <div className="wizard-steps">
        {['Cliente', 'Vehiculo', 'Fotos', 'Confirmar'].map((label, i) => {
          const num = i + 1
          const cls = paso > num ? 'done' : paso === num ? 'active' : ''
          return [
            i > 0 && <div key={`line-${i}`} className="wizard-step-line" style={{ background: paso > num ? 'var(--green-500)' : paso === num ? 'var(--blue-500)' : undefined }} />,
            <div key={label} className={`wizard-step ${cls}`}>
              <div className="wizard-step-num">{paso > num ? '✓' : num}</div>
              <span className="sidebar-text-hide">{label}</span>
            </div>
          ]
        })}
      </div>

      <div className="card">
        <form onSubmit={handleRecibir}>
          {/* Paso 1: Cliente */}
          {paso === 1 && (
            <>
              <div className="card-title">Datos del Cliente</div>
              <div className="form-row">
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Cedula / NIT</label>
                  <input className="form-input" value={form.cedula} placeholder="Buscar por documento..."
                    onChange={e => { set('cedula', e.target.value); buscarDebounced(e.target.value) }} />
                  {resultados.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                      {resultados.map((c, i) => (
                        <div key={i} onClick={() => seleccionarCliente(c)}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-card)', fontSize: 13 }}>
                          <strong>{normalizarDoc(c)}</strong> — {normalizarNombre(c)}
                        </div>
                      ))}
                    </div>
                  )}
                  {buscando && <span className="text-xs text-muted mt-2" style={{ display: 'block' }}>Buscando...</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre del Cliente *</label>
                  <input className="form-input" value={form.cliente} placeholder="Nombre completo"
                    onChange={e => { set('cliente', e.target.value); buscarDebounced(e.target.value) }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefono</label>
                  <input className="form-input" value={form.telefonoCliente} placeholder="300..."
                    onChange={e => set('telefonoCliente', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => {
                  if (!form.cliente) { notify('Nombre del cliente es obligatorio', 'error'); return }
                  setPaso(2)
                }}>Siguiente</button>
              </div>
            </>
          )}

          {/* Paso 2: Vehiculo */}
          {paso === 2 && (
            <>
              <div className="card-title">Datos del Vehiculo</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Placa *</label>
                  <input className="form-input" value={form.placa} placeholder="ABC123" style={{ textTransform: 'uppercase' }}
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
                <textarea className="form-textarea" value={form.observaciones} placeholder="Motivo de ingreso, diagnostico previo..."
                  onChange={e => set('observaciones', e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                <button type="button" className="btn btn-outline" onClick={() => setPaso(1)}>Atras</button>
                <button type="button" className="btn btn-primary" onClick={() => {
                  if (!form.placa) { notify('La placa es obligatoria', 'error'); return }
                  setPaso(3)
                }}>Siguiente</button>
              </div>
            </>
          )}

          {/* Paso 3: Fotos */}
          {paso === 3 && (
            <>
              <div className="card-title">Evidencias de Ingreso</div>
              <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
                Toma fotos del vehiculo: frente, lados y parte trasera para evitar reclamos.
              </p>
              <input type="file" accept="image/*" multiple onChange={e => addFotosIngreso(e.target.files)} />
              {form.evidenciasIngreso.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8, marginTop: 10 }}>
                  {form.evidenciasIngreso.map(fv => (
                    <div key={fv.id} style={{ border: '1px solid var(--border-card)', borderRadius: 8, padding: 6 }}>
                      <div style={{ position: 'relative', paddingBottom: '70%', overflow: 'hidden', borderRadius: 6, marginBottom: 6 }}>
                        <img src={fv.dataUrl} alt={fv.nombre} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <input className="form-input text-xs" placeholder="Nota breve" value={fv.nota}
                        onChange={e => actualizarNotaFoto(fv.id, e.target.value)} />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitarFoto(fv.id)} style={{ width: '100%', marginTop: 4 }}>Eliminar</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                <button type="button" className="btn btn-outline" onClick={() => setPaso(2)}>Atras</button>
                <button type="button" className="btn btn-primary" onClick={() => setPaso(4)}>Siguiente</button>
              </div>
            </>
          )}

          {/* Paso 4: Confirmar */}
          {paso === 4 && (
            <>
              <div className="card-title">Confirmar Recepcion</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div><span className="text-sm text-muted">Cliente:</span> <strong>{form.cliente}</strong></div>
                <div><span className="text-sm text-muted">Documento:</span> <strong>{form.cedula || '—'}</strong></div>
                <div><span className="text-sm text-muted">Placa:</span> <strong>{form.placa.toUpperCase()}</strong></div>
                <div><span className="text-sm text-muted">Vehiculo:</span> <strong>{[form.marca, form.modelo, form.ano].filter(Boolean).join(' ')}</strong></div>
                <div><span className="text-sm text-muted">Km:</span> <strong>{form.kilometraje || '—'}</strong></div>
                <div><span className="text-sm text-muted">Tecnico:</span> <strong>{TECNICOS.find(t => t.id === parseInt(form.tecnicoId))?.nombre || 'Sin asignar'}</strong></div>
                <div style={{ gridColumn: '1/3' }}><span className="text-sm text-muted">Fotos:</span> <strong>{form.evidenciasIngreso.length} fotos</strong></div>
                {form.observaciones && <div style={{ gridColumn: '1/3' }}><span className="text-sm text-muted">Obs:</span> {form.observaciones}</div>}
              </div>
              <div className="form-row" style={{ alignItems: 'center', marginBottom: 12 }}>
                <label className="form-label" style={{ marginRight: 8, marginBottom: 0 }}>Programar (genera OT)</label>
                <input type="checkbox" checked={form.programar} onChange={e => set('programar', e.target.checked)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-outline" onClick={() => setPaso(3)}>Atras</button>
                <button type="submit" className="btn btn-primary">Recibir Vehiculo</button>
              </div>
            </>
          )}
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
