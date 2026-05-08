import { useState, useMemo } from 'react'
import { fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre } from '../utils/helpers'
import { TECNICOS, ESTADOS } from '../utils/constants'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { useClientes } from '../hooks/useClientes'

export default function Recepcion({ hook, vehiculosHook, clientesHook, notify }) {
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
  const modelosRecepcion = useMemo(() => getModelos(form.marca), [form.marca])

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
    const placaNorm = form.placa.toUpperCase()
    await agregarTrabajo({
      ...form,
      placa: placaNorm,
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

    // Registrar vehiculo en la tabla de vehiculos (vincula placa con cedula)
    if (vehiculosHook && placaNorm) {
      vehiculosHook.agregarVehiculo({
        placa: placaNorm,
        marca: form.marca || '',
        modelo: form.modelo || '',
        ano: parseInt(form.ano) || 0,
        cedulaPropietario: form.cedula || '',
      })
    }

    // Registrar/actualizar cliente en la tabla de clientes + vincular vehiculo
    if (clientesHook && form.cedula) {
      clientesHook.guardarCliente({
        cedula: form.cedula,
        nombre: form.cliente || '',
        telefono: form.telefonoCliente || '',
        email: form.emailCliente || '',
      })
      // Vincular placa al array de vehiculos del cliente
      if (placaNorm) {
        clientesHook.vincularVehiculo(form.cedula, placaNorm)
      }
    }

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

  const maxPhotos = 6
  const emptySlots = Math.max(0, maxPhotos - form.evidenciasIngreso.length)

  const otNumber = `OT-${String(trabajos.length + 1).padStart(4, '0')}`
  const tecnicoNombre = TECNICOS.find(t => t.id === parseInt(form.tecnicoId))?.nombre || 'Sin asignar'

  return (
    <div>
      {/* Page Header */}
      <div className="pagehd">
        <div>
          <h2>Recibir vehiculo</h2>
          <p className="sub">Registra un nuevo ingreso al taller</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => {
            setPaso(1)
            setForm({
              cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
              placa: '', marca: '', modelo: '', ano: new Date().getFullYear(),
              kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(), programar: false,
              evidenciasIngreso: [],
            })
          }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleRecibir}>Generar OT</button>
        </div>
      </div>

      {/* Stepper (parche-correcciones-tablet) */}
      <div className="rc-stepper">
        {['Cliente', 'Vehiculo', 'Fotos', 'Confirmar'].map((label, i) => {
          const num = i + 1
          const isActive = paso === num
          const isDone = paso > num
          const clickable = num <= paso || isDone
          return [
            i > 0 && <span key={`sep-${i}`} className="rc-step__sep" aria-hidden="true" />,
            <a
              key={label}
              className={`rc-step ${isActive ? 'is-active' : ''}`}
              onClick={(e) => { e.preventDefault(); if (clickable) setPaso(num) }}
              style={{ cursor: clickable ? 'pointer' : 'default', opacity: clickable ? 1 : 0.55 }}
            >
              <span className="rc-step__n">{isDone ? '\u2713' : num}</span>
              <span className="rc-step__l">{label}</span>
            </a>,
          ]
        })}
      </div>

      {/* 2-column layout: form + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Left: Form cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form onSubmit={handleRecibir}>
            {/* Paso 1: Cliente */}
            {paso === 1 && (
              <div className="card" id="rc-cliente">
                <div className="card__h"><h3>Cliente</h3></div>
                <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="field" style={{ position: 'relative' }}>
                    <label>Cedula / NIT<span className="req">*</span></label>
                    <input className="input" value={form.cedula} placeholder="Buscar por documento..."
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
                    {buscando && <span className="text-xs text-muted" style={{ display: 'block', marginTop: 4 }}>Buscando...</span>}
                  </div>
                  <div className="field">
                    <label>Nombre completo<span className="req">*</span></label>
                    <input className="input" value={form.cliente} placeholder="Ana Torres"
                      onChange={e => { set('cliente', e.target.value); buscarDebounced(e.target.value) }} />
                  </div>
                  <div className="field">
                    <label>Telefono<span className="req">*</span></label>
                    <input className="input" value={form.telefonoCliente} placeholder="300 ..."
                      onChange={e => set('telefonoCliente', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Correo</label>
                    <input className="input" value={form.emailCliente} placeholder="opcional"
                      onChange={e => set('emailCliente', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 16px' }}>
                  <button type="button" className="btn btn-primary" onClick={() => {
                    if (!form.cliente) { notify('Nombre del cliente es obligatorio', 'error'); return }
                    setPaso(2)
                  }}>Siguiente</button>
                </div>
              </div>
            )}

            {/* Paso 2: Vehiculo */}
            {paso === 2 && (
              <div id="rc-vehiculo" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                  <div className="card__h"><h3>Vehiculo</h3></div>
                  <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div className="field">
                      <label>Placa<span className="req">*</span></label>
                      <input className="input" value={form.placa} placeholder="ABC123" style={{ textTransform: 'uppercase' }}
                        onChange={e => set('placa', e.target.value)} />
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
                        {modelosRecepcion.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Año</label>
                      <input className="input" type="number" value={form.ano} min="1980" max="2030"
                        onChange={e => set('ano', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Kilometraje</label>
                      <input className="input" type="number" value={form.kilometraje} min="0" placeholder="85.000"
                        onChange={e => set('kilometraje', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card__h"><h3>Ingreso al taller</h3></div>
                  <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label>Motivo de ingreso / Observaciones<span className="req">*</span></label>
                      <textarea className="input" value={form.observaciones} placeholder="Danos visibles, sintomas que reporta el cliente, diagnostico previo..."
                        onChange={e => set('observaciones', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Tecnico asignado</label>
                      <select className="input" value={form.tecnicoId} onChange={e => set('tecnicoId', e.target.value)}>
                        <option value="">Sin asignar</option>
                        {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Fecha</label>
                      <input className="input" type="date" value={form.fecha}
                        onChange={e => set('fecha', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setPaso(1)}>Atras</button>
                  <button type="button" className="btn btn-primary" onClick={() => {
                    if (!form.placa) { notify('La placa es obligatoria', 'error'); return }
                    setPaso(3)
                  }}>Siguiente</button>
                </div>
              </div>
            )}

            {/* Paso 3: Fotos */}
            {paso === 3 && (
              <div className="card" id="rc-fotos">
                <div className="card__h"><h3>Evidencia fotografica</h3><span className="count">{form.evidenciasIngreso.length} / {maxPhotos}</span></div>
                <div className="card__b">
                  <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
                    Toma fotos del vehiculo: frente, lados y parte trasera para evitar reclamos.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                    {form.evidenciasIngreso.map(fv => (
                      <div key={fv.id} style={{ border: '1px solid var(--border-card)', borderRadius: 10, padding: 6 }}>
                        <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', borderRadius: 8, marginBottom: 6 }}>
                          <img src={fv.dataUrl} alt={fv.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button type="button" onClick={() => quitarFoto(fv.id)}
                            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            x
                          </button>
                        </div>
                        <input className="input" placeholder="Nota breve" value={fv.nota} style={{ fontSize: 12 }}
                          onChange={e => actualizarNotaFoto(fv.id, e.target.value)} />
                      </div>
                    ))}
                    {form.evidenciasIngreso.length < maxPhotos && (
                      <label style={{ aspectRatio: '1', border: '1.5px dashed var(--border-strong)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', background: 'var(--bg-subtle)', cursor: 'pointer', fontSize: 24 }}>
                        +
                        <input type="file" accept="image/*" multiple onChange={e => addFotosIngreso(e.target.files)} style={{ display: 'none' }} />
                      </label>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 16px 16px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setPaso(2)}>Atras</button>
                  <button type="button" className="btn btn-primary" onClick={() => setPaso(4)}>Siguiente</button>
                </div>
              </div>
            )}

            {/* Paso 4: Confirmar */}
            {paso === 4 && (
              <div className="card" id="rc-confirmar">
                <div className="card__h"><h3>Confirmar Recepcion</h3></div>
                <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Cliente:</span> <strong>{form.cliente}</strong></div>
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Documento:</span> <strong>{form.cedula || '\u2014'}</strong></div>
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Placa:</span> <strong>{form.placa.toUpperCase()}</strong></div>
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Vehiculo:</span> <strong>{[form.marca, form.modelo, form.ano].filter(Boolean).join(' ')}</strong></div>
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Km:</span> <strong>{form.kilometraje || '\u2014'}</strong></div>
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Tecnico:</span> <strong>{tecnicoNombre}</strong></div>
                  <div style={{ gridColumn: '1/3' }}><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Fotos:</span> <strong>{form.evidenciasIngreso.length} fotos</strong></div>
                  {form.observaciones && <div style={{ gridColumn: '1/3' }}><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Obs:</span> {form.observaciones}</div>}
                </div>
                <div style={{ padding: '0 16px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <input type="checkbox" checked={form.programar} onChange={e => set('programar', e.target.checked)} id="chk-programar" />
                    <label htmlFor="chk-programar" style={{ fontSize: 13, marginBottom: 0 }}>Programar (genera OT)</label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" className="btn btn-outline" onClick={() => setPaso(3)}>Atras</button>
                    <button type="submit" className="btn btn-primary">Recibir Vehiculo</button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Right: Sidebar - Evidence + Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Evidence photos grid */}
          <div className="card">
            <div className="card__h"><h3>Evidencia fotografica</h3><span className="count">{form.evidenciasIngreso.length} / {maxPhotos}</span></div>
            <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {form.evidenciasIngreso.map(fv => (
                <div key={fv.id} style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                  <img src={fv.dataUrl} alt={fv.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => quitarFoto(fv.id)}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    x
                  </button>
                </div>
              ))}
              {Array.from({ length: Math.max(0, maxPhotos - form.evidenciasIngreso.length) }).map((_, i) => (
                <label key={`empty-${i}`} style={{ aspectRatio: '1', border: '1.5px dashed var(--border-strong)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', background: 'var(--bg-subtle)', cursor: 'pointer' }}>
                  <span style={{ fontSize: 20 }}>+</span>
                  <input type="file" accept="image/*" multiple onChange={e => addFotosIngreso(e.target.files)} style={{ display: 'none' }} />
                </label>
              ))}
            </div>
          </div>

          {/* Summary card */}
          <div className="card">
            <div className="card__h"><h3>Resumen</h3></div>
            <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>OT asignada</span>
                <span className="mono" style={{ fontWeight: 700 }}>{otNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Fecha ingreso</span>
                <span className="mono">{fmtDate(form.fecha)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>Estado inicial</span>
                <span className="badge badge-warning">{form.programar ? 'Programado' : 'Pendiente'}</span>
              </div>
              {form.cliente && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Cliente</span>
                  <span style={{ fontWeight: 600 }}>{form.cliente}</span>
                </div>
              )}
              {form.placa && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Placa</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{form.placa.toUpperCase()}</span>
                </div>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                Al generar la OT se notificara al tecnico asignado y quedara registrado el ingreso del vehiculo.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vehiculos en taller */}
      {pendientes.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card__h"><h3>Vehiculos en Taller ({pendientes.length})</h3></div>
          <div className="card__b card__b--flush">
            <table className="tbl">
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
                      <td className="c-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                      <td>{t.cliente || '\u2014'}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-3)' }}>{[t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || '\u2014'}</td>
                      <td style={{ fontSize: 13 }}>{tecNombre}</td>
                      <td><span className={`badge ${bc}`}>{t.estado}</span></td>
                      <td style={{ fontSize: 13, color: 'var(--text-3)' }}>{fmtDate(t.fecha)}</td>
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
