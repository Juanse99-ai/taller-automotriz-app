import { useState, useMemo } from 'react'
import { fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre, fmtTelefono } from '../utils/helpers'
import { TECNICOS, ESTADOS } from '../utils/constants'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { useClientes } from '../hooks/useClientes'
import Switch from '../components/Switch'
import IngresoVehiculo from '../components/IngresoVehiculo'
import { ingresoVacio } from '../utils/ingreso'

export default function Recepcion({ hook, vehiculosHook, clientesHook, notify }) {
  const { trabajos, agregarTrabajo, puedeCrearOT } = hook
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()
  const [enviando, setEnviando] = useState(false) // anti doble-submit (evita 2 OT)

  const pendientes = useMemo(() =>
    trabajos.filter(t => t.estado === ESTADOS.PENDIENTE || t.estado === ESTADOS.EN_PROGRESO)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [trabajos])

  const [paso, setPaso] = useState(1) // 1=Cliente, 2=Vehiculo+motivo, 3=Confirmar
  // 97 de las 183 ordenes del taller (53%) son de mostrador: no entra un carro,
  // se vende un servicio o un repuesto. No habia camino para eso — habia que
  // inventarle una placa "SERVICIO" a mano al formulario que la pedia como
  // obligatoria. Con esto, la ficha del vehiculo simplemente no aplica.
  const [traeVehiculo, setTraeVehiculo] = useState(true)
  const [form, setForm] = useState({
    cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
    placa: '', marca: '', modelo: '', ano: '',
    kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(),
    programar: false,
    evidenciasIngreso: [],
    ingreso: ingresoVacio(),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const modelosRecepcion = useMemo(() => getModelos(form.marca), [form.marca])

  const seleccionarCliente = (c) => {
    set('cedula', normalizarDoc(c))
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', fmtTelefono(c.telefono || c.phone || ''))
    set('emailCliente', c.email || c.correo || '')
    // El id de CUENTTI, no el local: guardar c.id hacía que al facturar se
    // mandara el id interno de la app y Cuentti facturara a quien tuviera ese
    // número en SU base (ver buildFacturaPayload).
    set('clienteId', '')
    set('cuenttiId', c.cuenttiId || '')
    setResultados([])
  }

  const handleRecibir = async (e) => {
    e.preventDefault()
    if (enviando) return // ya se está enviando: ignora el 2º clic (no crear 2 OT)
    if (!form.cliente) { notify('El cliente es obligatorio', 'error'); return }
    if (traeVehiculo && !form.placa) { notify('La placa es obligatoria', 'error'); return }
    // No numerar una OT si aún no sabemos el consecutivo real (arrancaría en OT-0001).
    if (!puedeCrearOT()) { notify('Sin conexión con el servidor: no se puede numerar la OT todavía. Reintenta en un momento.', 'error'); return }
    // "SERVICIO" es el marcador que ya usa el resto de la app para una orden sin
    // carro (ver esMostrador en Liquidacion). Antes se escribia a mano.
    const placaNorm = traeVehiculo ? form.placa.toUpperCase() : 'SERVICIO'
    setEnviando(true)
    try {
    await agregarTrabajo({
      ...form,
      placa: placaNorm,
      sinVehiculo: !traeVehiculo,
      ano: parseInt(form.ano) || null,
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
    if (vehiculosHook && placaNorm && traeVehiculo) {
      vehiculosHook.agregarVehiculo({
        placa: placaNorm,
        marca: form.marca || '',
        modelo: form.modelo || '',
        ano: parseInt(form.ano) || null,
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
      if (placaNorm && traeVehiculo) {
        clientesHook.vincularVehiculo(form.cedula, placaNorm)
      }
    }

    notify(traeVehiculo ? 'Vehículo recibido' : 'Orden de mostrador creada', 'success')
    setPaso(1)
    setTraeVehiculo(true)
    setForm({
      cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
      placa: '', marca: '', modelo: '', ano: '',
      kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(), programar: false,
      evidenciasIngreso: [],
      ingreso: ingresoVacio(),
    })
    } finally {
      setEnviando(false)
    }
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

  // Vista previa del código: se deriva del MÁXIMO real (como nextOtCodigo), no de
  // trabajos.length+1 (que con OT borradas o huecos daba un número equivocado). Es
  // una estimación; el código definitivo lo asigna nextOtCodigo al crear.
  const otNumber = useMemo(() => {
    const max = trabajos.reduce((mx, t) => {
      const m = /OT-(\d+)/.exec(t.otCodigo || '')
      return m ? Math.max(mx, parseInt(m[1], 10)) : mx
    }, 0)
    return `OT-${String(max + 1).padStart(4, '0')}`
  }, [trabajos])
  const tecnicoNombre = TECNICOS.find(t => t.id === parseInt(form.tecnicoId))?.nombre || 'Sin asignar'

  return (
    <div>
      {/* Page Header */}
      <div className="pagehd">
        <div>
          {/* Se titulaba "Recibir vehículo" en una pantalla donde el 53% de las
             órdenes no traen vehículo. El menú siempre dijo "Nueva orden". */}
          <h2>Nueva orden</h2>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => {
            setPaso(1)
            setForm({
              cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
              placa: '', marca: '', modelo: '', ano: '',
              kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(), programar: false,
              evidenciasIngreso: [],
              ingreso: ingresoVacio(),
            })
          }}>Cancelar</button>
          <button className="btn btn-primary" disabled={enviando} onClick={handleRecibir}>{enviando ? 'Generando…' : 'Generar OT'}</button>
        </div>
      </div>

      {/* Stepper (parche-correcciones-tablet) */}
      <div className="rc-stepper">
        {/* Se quitó el paso "Fotos". Era un paso obligatorio del carril para algo
           que en toda la base se usó 3 veces, y además duplicaba exactamente el
           panel de evidencia de la derecha, que sigue disponible en cualquier
           paso (el propio código lo ocultaba durante el paso 3 para no mostrar
           el mismo título dos veces). */}
        {['Cliente', traeVehiculo ? 'Vehículo' : 'Motivo', 'Confirmar'].map((label, i) => {
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
                {/* La pregunta que decide el resto del paso. Va primero porque en
                   más de la mitad de las órdenes la respuesta es "no" y todo lo
                   de abajo sobra. */}
                <div className="card">
                  <div className="card__b" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>¿Entra un vehículo al taller?</span>
                    <div className="segctl" style={{ margin: 0 }}>
                      <button type="button" className={traeVehiculo ? 'on' : ''} onClick={() => setTraeVehiculo(true)}>Sí, con placa</button>
                      <button type="button" className={!traeVehiculo ? 'on' : ''} onClick={() => setTraeVehiculo(false)}>No, es de mostrador</button>
                    </div>
                    {!traeVehiculo && (
                      <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                        Se registra como servicio de mostrador, sin placa ni estado de ingreso.
                      </span>
                    )}
                  </div>
                </div>

                {traeVehiculo && (<>
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
                      <input className="input" type="number" value={form.ano} min="1980" max="2030" placeholder="Ej. 2018"
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
                  <div className="card__h"><h3>Estado de ingreso del vehículo</h3></div>
                  <div className="card__b">
                    <IngresoVehiculo value={form.ingreso} onChange={v => set('ingreso', v)} />
                  </div>
                </div>
                </>)}

                {/* Motivo, técnico y fecha aplican traiga carro o no: vivían
                   dentro del paso "Vehículo" y en una orden de mostrador eran lo
                   único que había que llenar. */}
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
                    if (traeVehiculo && !form.placa) { notify('La placa es obligatoria', 'error'); return }
                    setPaso(3)
                  }}>Siguiente</button>
                </div>
              </div>
            )}

            {/* Paso 3: Confirmar */}
            {paso === 3 && (
              <div className="card" id="rc-confirmar">
                <div className="card__h"><h3>Confirmar</h3></div>
                {/* En una orden de mostrador el resumen listaba Placa, Vehículo y
                   Km en blanco: tres renglones vacíos justo donde se revisa
                   antes de crear. Solo se muestran si hay carro. */}
                <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Cliente:</span> <strong>{form.cliente}</strong></div>
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Documento:</span> <strong>{form.cedula || '\u2014'}</strong></div>
                  {traeVehiculo ? (
                    <>
                      <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Placa:</span> <strong>{form.placa.toUpperCase()}</strong></div>
                      <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Vehículo:</span> <strong>{[form.marca, form.modelo, form.ano].filter(Boolean).join(' ') || '\u2014'}</strong></div>
                      {!!form.kilometraje && <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Km:</span> <strong>{form.kilometraje}</strong></div>}
                    </>
                  ) : (
                    <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Tipo:</span> <strong>Servicio de mostrador</strong></div>
                  )}
                  <div><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Técnico:</span> <strong>{tecnicoNombre}</strong></div>
                  {form.evidenciasIngreso.length > 0 && <div style={{ gridColumn: '1/3' }}><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Fotos:</span> <strong>{form.evidenciasIngreso.length}</strong></div>}
                  {form.observaciones && <div style={{ gridColumn: '1/3' }}><span style={{ fontSize: 13, color: 'var(--text-3)' }}>Motivo:</span> {form.observaciones}</div>}
                </div>
                <div style={{ padding: '0 16px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Switch checked={!!form.programar} onChange={v => set('programar', v)} ariaLabel="Programar (genera OT)" />
                    <span style={{ fontSize: 13, cursor: 'pointer' }} onClick={() => set('programar', !form.programar)}>Programar (genera OT)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" className="btn btn-outline" onClick={() => setPaso(2)}>Atrás</button>
                    <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? 'Creando…' : (traeVehiculo ? 'Recibir vehículo' : 'Crear orden')}</button>
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
              Antes habia ademas un paso 3 dedicado a fotos que pintaba este
              mismo panel: se quito (3 fotos en toda la base) y este queda como
              el unico sitio, disponible en cualquier paso. */}
          {(
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
                <>
                  {/* La nota por foto vivia en el paso 3, que se quito. Se
                     conserva aqui: es lo que sostiene un reclamo ("rayon en la
                     puerta derecha"), y perderla al plegar el paso habria sido
                     tirar un dato, no simplificar. Solo aparece cuando hay
                     fotos, que es raro. */}
                  {form.evidenciasIngreso.map(fv => (
                    <div key={fv.id} className="rc-foto">
                      <div className="rc-thumb">
                        <img src={fv.dataUrl} alt={fv.nombre} />
                        <button type="button" onClick={() => quitarFoto(fv.id)} aria-label={`Quitar ${fv.nombre}`}>×</button>
                      </div>
                      <input className="input" placeholder="Nota breve" value={fv.nota}
                        onChange={e => actualizarNotaFoto(fv.id, e.target.value)} />
                    </div>
                  ))}
                  {form.evidenciasIngreso.length < maxPhotos && (
                    <label className="rc-drop" style={{ marginTop: 10 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                      <div><strong>Agregar otra foto</strong></div>
                      <input type="file" accept="image/*" multiple onChange={e => addFotosIngreso(e.target.files)} style={{ display: 'none' }} />
                    </label>
                  )}
                </>
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
