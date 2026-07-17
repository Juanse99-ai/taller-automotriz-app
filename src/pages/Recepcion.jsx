import { useState, useMemo } from 'react'
import { fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre, fmtTelefono } from '../utils/helpers'
import { TECNICOS, ESTADOS } from '../utils/constants'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { useClientes } from '../hooks/useClientes'
import Switch from '../components/Switch'

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
    set('telefonoCliente', fmtTelefono(c.telefono || c.phone || ''))
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

    notify('Vehículo recibido exitosamente', 'success')
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
          <h2>Recibir vehículo</h2>
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
        {['Cliente', 'Vehículo', 'Fotos', 'Confirmar'].map((label, i) => {
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
                    <label>Cédula / NIT<span className="req">*</span></label>
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
                    <label>Teléfono<span className="req">*</span></label>
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
                  <div className="card__h"><h3>Vehículo</h3></div>
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
                      <textarea className="input" value={form.observaciones} placeholder="Daños visibles, síntomas que reporta el cliente, diagnóstico previo..."
                        onChange={e => set('observaciones', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Técnico asignado</label>
                      <select className="input" value={form.tecnicoId} onChange={e => set('tecnicoId', e.target.value)}>
                        <option value="">Sin asignar</option>
                        {TECNICOS.filter(t => t.activo !== false || t.id === parseInt(form.tecnicoId)).map(t => (
                          <option key={t.id} value={t.id}>{t.nombre}{t.activo === false ? ' (inactivo)' : ''}</option>
                        ))}
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
                  <button type="button" className="btn btn-outline" onClick={() => setPaso(1)}>Atrás</button>
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
                <div className="card__h"><h3>Evidencia fotográfica</h3><span className="count">{form.evidenciasIngreso.length} / {maxPhotos}</span></div>
                <div className="card__b">
                  <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
                    Toma fotos del vehículo: frente, lados y parte trasera para evitar reclamos.
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
                  <button type="button" className="btn btn-outline" onClick={() => setPaso(2)}>Atrás</button>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Switch checked={!!form.programar} onChange={v => set('programar', v)} ariaLabel="Programar (genera OT)" />
                    <span style={{ fontSize: 13, cursor: 'pointer' }} onClick={() => set('programar', !form.programar)}>Programar (genera OT)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" className="btn btn-outline" onClick={() => setPaso(3)}>Atrás</button>
                    <button type="submit" className="btn btn-primary">Recibir Vehiculo</button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Right: Sidebar - Evidence + Summary.
            Sigue al scroll: el formulario de la izquierda crece por paso y antes
            el resumen quedaba fuera de vista justo cuando se va a confirmar. */}
        <div className="rc-side">
          {/* Evidencia: sin fotos es una sola zona compacta para agregar; con
              fotos, miniaturas + un boton. Antes se pintaban 6 cuadros vacios
              del ancho de la columna (~800px de alto) y por eso el paso 1
              dejaba un hueco enorme al lado.
              En el paso 3 se oculta: ese paso ya trae el panel completo (con
              nota por foto) y se veia el mismo titulo dos veces en pantalla. */}
          {paso !== 3 && (
          <div className="card">
            <div className="card__h">
              <h3>Evidencia fotográfica</h3>
              <span className="count">{form.evidenciasIngreso.length} / {maxPhotos}</span>
            </div>
            <div className="card__b">
              {form.evidenciasIngreso.length === 0 ? (
                <label className="rc-drop">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <div>
                    <strong>Agregar fotos</strong>
                    <span>Frente, lados y parte trasera</span>
                  </div>
                  <input type="file" accept="image/*" multiple onChange={e => addFotosIngreso(e.target.files)} style={{ display: 'none' }} />
                </label>
              ) : (
                <div className="rc-thumbs">
                  {form.evidenciasIngreso.map(fv => (
                    <div key={fv.id} className="rc-thumb">
                      <img src={fv.dataUrl} alt={fv.nombre} />
                      <button type="button" onClick={() => quitarFoto(fv.id)} aria-label={`Quitar ${fv.nombre}`}>×</button>
                    </div>
                  ))}
                  {form.evidenciasIngreso.length < maxPhotos && (
                    <label className="rc-thumb rc-thumb--add" title="Agregar fotos">
                      <span>+</span>
                      <input type="file" accept="image/*" multiple onChange={e => addFotosIngreso(e.target.files)} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

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
                Al generar la OT se notificará al técnico asignado y quedará registrado el ingreso del vehículo.
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
