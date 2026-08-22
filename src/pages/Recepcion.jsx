import { useState, useMemo } from 'react'
import { fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre, fmtTelefono } from '../utils/helpers'
import { TECNICOS, ESTADOS } from '../utils/constants'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { ANIOS } from '../components/ui'
import { useClientes } from '../hooks/useClientes'
import Switch from '../components/Switch'
import IngresoVehiculo from '../components/IngresoVehiculo'
import { ingresoVacio } from '../utils/ingreso'
import { fotoParaSubir } from '../utils/imagen'
import { subirFotoEvidencia } from '../services/supabase'

// Iniciales del tecnico para el avatar de 19px de la lista del taller.
function tecIniciales(id) {
  const p = (TECNICOS.find(t => t.id === parseInt(id))?.nombre || '').split(' ').filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '—'
}

// El color de la pastilla es semantico y es el mismo que en Ordenes de trabajo:
// dice en que estado esta el carro, nunca decora.
function chipEstado(estado) {
  if (estado === ESTADOS.EN_PROGRESO) return 'info'
  if (estado === ESTADOS.PENDIENTE) return 'warn'
  if (estado === ESTADOS.PROGRAMADO) return 'purple'
  return 'mute'
}

// Cabecera de seccion: numero del paso + rotulo + filete + apoyo a la derecha.
// Los cuatro pasos viven en la MISMA tarjeta, asi que el filete es lo unico que
// los separa: nada de tarjetas dentro de tarjetas.
function SecHead({ n, titulo, apoyo, apoyoFuerte }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 9.5, lineHeight: 1, fontWeight: 700, letterSpacing: '1px', whiteSpace: 'nowrap', color: n != null ? 'var(--accent)' : 'var(--text-4)' }}>
        {n != null ? `${n} · ` : ''}{titulo}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--head-line)' }} />
      {apoyo && (
        <span style={{ fontSize: 10.5, lineHeight: 1, whiteSpace: 'nowrap', fontWeight: apoyoFuerte ? 700 : 400, color: apoyoFuerte ? 'var(--text-2)' : 'var(--text-3)' }}>{apoyo}</span>
      )}
    </div>
  )
}

// Dato ya capturado que se relee en el paso 4: rotulo arriba, valor abajo.
// Vacio no se esconde, se dice: raya apagada.
function Dato({ l, v, mono }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, lineHeight: 1, fontWeight: 700, letterSpacing: '.8px', color: 'var(--text-4)' }}>{l}</div>
      <div className={mono ? 'hd-plate' : ''} style={{ fontSize: 13, lineHeight: 1.25, fontWeight: 700, marginTop: 5, color: v ? 'var(--text)' : 'var(--text-empty)' }}>{v || '—'}</div>
    </div>
  )
}

export default function Recepcion({ hook, vehiculosHook, clientesHook, notify }) {
  const { trabajos, agregarTrabajo, puedeCrearOT } = hook
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()
  const [enviando, setEnviando] = useState(false) // anti doble-submit (evita 2 OT)

  const pendientes = useMemo(() =>
    trabajos.filter(t => t.estado === ESTADOS.PENDIENTE || t.estado === ESTADOS.EN_PROGRESO)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [trabajos])

  const [paso, setPaso] = useState(1) // 1=Cliente, 2=Vehiculo, 3=Fotos, 4=Confirmar
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
    if (!form.placa || !form.cliente) {
      notify('Placa y cliente son obligatorios', 'error')
      return
    }
    // No numerar una OT si aún no sabemos el consecutivo real (arrancaría en OT-0001).
    if (!puedeCrearOT()) { notify('Sin conexión con el servidor: no se puede numerar la OT todavía. Reintenta en un momento.', 'error'); return }
    const placaNorm = form.placa.toUpperCase()
    setEnviando(true)
    try {
    await agregarTrabajo({
      ...form,
      placa: placaNorm,
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
    if (vehiculosHook && placaNorm) {
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
      if (placaNorm) {
        clientesHook.vincularVehiculo(form.cedula, placaNorm)
      }
    }

    notify('Vehículo recibido exitosamente', 'success')
    setPaso(1)
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

  // Antes esto guardaba el archivo CRUDO en base64 dentro de la orden: una foto
  // de camara son 3-5 MB. Ahora se comprime y se sube al bucket, y en la orden
  // queda el enlace. Si la subida falla se queda el base64 comprimido, que ya es
  // mucho mejor que lo que habia.
  const addFotosIngreso = (files) => {
    if (!files?.length) return
    Array.from(files).forEach(async file => {
      const foto = await fotoParaSubir(file)
      if (!foto) return
      const idFoto = uid()
      setForm(f => ({
        ...f,
        evidenciasIngreso: [
          ...f.evidenciasIngreso,
          { id: idFoto, nombre: file.name, tipo: 'foto', dataUrl: foto.dataUrl, nota: '' },
        ],
      }))
      if (!foto.blob) return
      try {
        const { url, path } = await subirFotoEvidencia(foto.blob, form.placa || 'recepcion')
        setForm(f => ({
          ...f,
          evidenciasIngreso: (f.evidenciasIngreso || []).map(e => e.id === idFoto
            ? { id: idFoto, nombre: file.name, tipo: 'foto', url, path, nota: e.nota || '' }
            : e),
        }))
      } catch { /* se queda el base64 comprimido */ }
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

  // Cortes del panel navy. Se derivan de `pendientes`, que ya existe; no es un
  // contador nuevo ni una consulta nueva.
  const nPend = pendientes.filter(t => t.estado === ESTADOS.PENDIENTE).length
  const nProg = pendientes.length - nPend
  // La fecha de ingreso arranca en hoy. Se marca como deducida para que nadie
  // la lea como un dato que alguien escribio.
  const esHoy = form.fecha === hoyISO()
  const estadoInicial = form.programar ? ESTADOS.PROGRAMADO : ESTADOS.PENDIENTE

  // Que bloque ya tiene dato. Sale de lo que ya esta en `form`; no hay campo
  // nuevo ni consulta nueva. El paso 4 no se marca: es la accion, no un dato.
  const capturado = [!!form.cliente, !!form.placa, form.evidenciasIngreso.length > 0, false]
  // La tira de arriba ya no esconde nada, asi que un clic lleva a la seccion,
  // que sigue en pantalla, y mueve la marca de "aqui vas".
  const SECCIONES = ['rc-cliente', 'rc-vehiculo', 'rc-fotos', 'rc-confirmar']
  const irASeccion = (num) => {
    setPaso(num)
    // Sin 'smooth' a proposito: comprobado en el navegador que el desplazamiento
    // suave no se ejecutaba y el clic no llevaba a ninguna parte.
    document.getElementById(SECCIONES[num - 1])?.scrollIntoView({ block: 'start' })
  }

  const limpiarForm = () => {
    setPaso(1)
    setForm({
      cedula: '', cliente: '', telefonoCliente: '', emailCliente: '', clienteId: '',
      placa: '', marca: '', modelo: '', ano: '',
      kilometraje: '', tecnicoId: '', observaciones: '', fecha: hoyISO(), programar: false,
      evidenciasIngreso: [],
      ingreso: ingresoVacio(),
    })
  }

  return (
    <div>
      {/* Barra de titulo del handoff. Los tres valores que la pantalla DEDUCE
          sola (numero de OT reservado, fecha de ingreso = hoy, estado inicial)
          suben aqui marcados como tales: antes solo se veian abajo, en el
          resumen del lateral, cuando ya se habia llenado medio formulario. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Recibir vehículo</h1>
          <div className="hd-head__sub" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>Recepción de vehículos</span>
            <span style={{ color: 'var(--text-5)' }}>·</span>
            <span className="hd-mono" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{otNumber}</span>
            <span>se asigna al guardar</span>
            <span style={{ color: 'var(--text-5)' }}>·</span>
            <span>Ingreso {fmtDate(form.fecha)}</span>
            {esHoy && <span className="hd-chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>HOY</span>}
            <span style={{ color: 'var(--text-5)' }}>·</span>
            <span>Estado inicial</span>
            <span className={`hd-chip hd-chip--${form.programar ? 'purple' : 'warn'}`}>{estadoInicial}</span>
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <button className="btn btn-outline" onClick={limpiarForm}>Cancelar</button>
          <button className="btn btn-primary" disabled={enviando} onClick={handleRecibir}>{enviando ? 'Generando…' : 'Generar OT'}</button>
        </div>
      </div>

      {/* Indice de los cuatro pasos. Ya no esconde nada — los cuatro bloques
          estan abajo, en la misma pantalla — asi que ahora sirve para lo que
          de verdad se pregunta el mostrador: que quedo capturado en cada uno. */}
      <div className="rc-stepper" style={{ marginTop: 12 }}>
        {[
          ['Cliente', form.cliente || 'Busca por documento'],
          ['Vehículo', form.placa ? form.placa.toUpperCase() : 'Placa y técnico'],
          ['Fotos', `${form.evidenciasIngreso.length} de ${maxPhotos}`],
          ['Confirmar', `Queda ${estadoInicial.toLowerCase()}`],
        ].map(([label, sub], i) => {
          const num = i + 1
          const isActive = paso === num
          // El ✓ dice que ESE bloque ya tiene dato, no por donde paso el mouse:
          // sin los botones Siguiente, `paso` ya no avanza solo y los pasos 2, 3
          // y 4 quedaban apagados al 55% y muertos para siempre.
          const isDone = capturado[i]
          return [
            i > 0 && <span key={`sep-${i}`} className="rc-step__sep" aria-hidden="true" />,
            <a
              key={label}
              className={`rc-step ${isActive ? 'is-active' : ''}`}
              onClick={(e) => { e.preventDefault(); irASeccion(num) }}
              style={{ cursor: 'pointer', minHeight: 'var(--tap)' }}
            >
              <span className="rc-step__n">{isDone ? '✓' : num}</span>
              <span className="rc-step__l" style={{ minWidth: 0 }}>
                <span style={{ display: 'block', lineHeight: 1.2 }}>{label}</span>
                <span className="hd-clip" style={{ display: 'block', maxWidth: 140, fontSize: 10.5, fontWeight: 400, lineHeight: 1.2, color: 'var(--text-4)' }}>{sub}</span>
              </span>
            </a>,
          ]
        })}
      </div>

      {/* Formulario a la izquierda, taller a la derecha. Es flex con wrap y no
          grid a proposito: la columna derecha esta topada en 330px (antes era
          1fr de un 2fr/1fr y en pantalla ancha se comia espacio que necesitan
          los campos), y por debajo de ~790px baja entera en vez de estrangular
          el formulario a una sola columna. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        {/* Izquierda: los CUATRO pasos, uno debajo del otro, en UNA sola tarjeta.
            Antes cada paso tapaba a los otros tres y el paso 2 traia ademas tres
            tarjetas anidadas. */}
        <form onSubmit={handleRecibir} style={{ flex: '1 1 460px', minWidth: 0 }}>
          <div className="hd-card" style={{ padding: '16px 18px', gap: 20 }}>

            {/* ---------- 1 · CLIENTE ---------- */}
            <section id="rc-cliente">
              <SecHead n={1} titulo="CLIENTE" apoyo="Busca por documento y se llena solo" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(158px,1fr))', gap: 10 }}>
                <div className="field" style={{ position: 'relative' }}>
                  <label>Cédula / NIT<span className="req">*</span></label>
                  <input className="input" value={form.cedula} placeholder="Buscar por documento..."
                    onChange={e => { set('cedula', e.target.value); buscarDebounced(e.target.value) }} />
                  {resultados.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, maxHeight: 230, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                      {resultados.map((c, i) => (
                        <div key={i} onClick={() => seleccionarCliente(c)}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 'var(--tap)', padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--row-line)' }}>
                          <span className="hd-mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{normalizarDoc(c)}</span>
                          <span className="hd-clip" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{normalizarNombre(c)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {buscando && <span className="help">Buscando...</span>}
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
                  <label>Correo <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>opcional</span></label>
                  <input className="input" value={form.emailCliente} placeholder="opcional"
                    onChange={e => set('emailCliente', e.target.value)} />
                </div>
              </div>
            </section>

            {/* ---------- 2 · VEHÍCULO ---------- */}
            <section id="rc-vehiculo">
              <SecHead n={2} titulo="VEHÍCULO" apoyo="La placa es por lo que se busca después" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(158px,1fr))', gap: 10 }}>
                <div className="field">
                  <label>Placa<span className="req">*</span></label>
                  {/* La placa manda en toda la app: mono, mas grande y en pastilla. */}
                  <input className="input" value={form.placa} placeholder="ABC123"
                    style={{ textTransform: 'uppercase', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 16, fontWeight: 700, letterSpacing: '1px', borderRadius: 'var(--radius-pill)', borderWidth: 1.5, minHeight: 'var(--tap)' }}
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
                  <select className="input" value={form.ano} onChange={e => set('ano', e.target.value)}>
                    <option value="">Año</option>
                    {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Kilometraje <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>km</span></label>
                  <input className="input" type="number" value={form.kilometraje} min="0" placeholder="85.000"
                    onChange={e => set('kilometraje', e.target.value)} />
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
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 10, marginTop: 12 }}>
                <div className="field">
                  <label>Motivo de ingreso / Observaciones<span className="req">*</span></label>
                  <textarea className="input" rows={3} style={{ resize: 'vertical' }} value={form.observaciones}
                    placeholder="Daños visibles, síntomas que reporta el cliente, diagnóstico previo..."
                    onChange={e => set('observaciones', e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                  <div className="field">
                    <label>
                      Fecha de ingreso
                      {esHoy && <span className="hd-chip" style={{ marginLeft: 6, background: 'var(--accent-soft)', color: 'var(--accent)' }}>HOY</span>}
                    </label>
                    <input className="input" type="date" value={form.fecha}
                      onChange={e => set('fecha', e.target.value)} />
                  </div>
                  {/* El interruptor que decide el estado inicial estaba al final del
                      paso 4, a dos pantallas de la fecha que gobierna. Se pone al lado. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 'var(--tap)', padding: '6px 11px', border: '1px solid var(--border-input)', borderRadius: 10 }}>
                    <Switch checked={!!form.programar} onChange={v => set('programar', v)} ariaLabel="Programar (genera OT)" />
                    <span style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => set('programar', !form.programar)}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, color: 'var(--text)' }}>Programar (genera OT)</span>
                      <span style={{ display: 'block', fontSize: 11, lineHeight: 1.25, color: 'var(--text-3)' }}>Deja el estado en {ESTADOS.PROGRAMADO}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Estado de ingreso: sub-bloque del mismo paso 2. Antes era una
                  tarjeta dentro de la tarjeta del paso. */}
              <div style={{ marginTop: 16 }}>
                <SecHead titulo="ESTADO DE INGRESO DEL VEHÍCULO" apoyo="Combustible, daños e inventario" />
                <IngresoVehiculo value={form.ingreso} onChange={v => set('ingreso', v)} />
              </div>
            </section>

            {/* ---------- 3 · FOTOS ---------- */}
            <section id="rc-fotos">
              <SecHead n={3} titulo="FOTOS DE INGRESO" apoyo={`${form.evidenciasIngreso.length} / ${maxPhotos}`} apoyoFuerte />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
                {form.evidenciasIngreso.length < maxPhotos && (
                  <label style={{ flex: '1 1 240px', minWidth: 200, display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', border: '1.5px dashed var(--border-strong)', borderRadius: 12, background: 'var(--bg-subtle)', cursor: 'pointer' }}>
                    <span style={{ width: 38, height: 38, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-pill)', background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" />
                        <circle cx="12" cy="13" r="3.5" />
                      </svg>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Agregar fotos</span>
                      <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.35, color: 'var(--text-3)' }}>Sugerido: frente, lados y parte trasera para evitar reclamos.</span>
                    </span>
                    <input type="file" accept="image/*" multiple onChange={e => addFotosIngreso(e.target.files)} style={{ display: 'none' }} />
                  </label>
                )}
                {form.evidenciasIngreso.map(fv => (
                  <div key={fv.id} style={{ width: 146, flex: 'none', border: '1px solid var(--border)', borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <img src={fv.dataUrl || fv.url} alt={fv.nombre} style={{ width: '100%', height: 78, objectFit: 'cover', borderRadius: 8, display: 'block', background: 'var(--bg-subtle)' }} />
                    <input className="input" placeholder="Nota breve" value={fv.nota}
                      style={{ fontSize: 11.5, minHeight: 'var(--tap)', padding: '6px 8px', borderRadius: 7 }}
                      onChange={e => actualizarNotaFoto(fv.id, e.target.value)} />
                    {/* Eliminar deja de ser una X de 20px sobre la foto: el jefe de
                        taller usa el dedo y no hay hover en el que apoyarse. */}
                    <button type="button" onClick={() => quitarFoto(fv.id)} aria-label={`Quitar ${fv.nombre}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 'var(--tap)', border: 'none', borderRadius: 8, background: 'var(--bad-bg)', color: 'var(--bad-fg)', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" /></svg>
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* ---------- 4 · CONFIRMAR ---------- */}
            <section id="rc-confirmar">
              <SecHead n={4} titulo="CONFIRMAR" apoyo={`${otNumber} · ${estadoInicial}`} apoyoFuerte />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
                <Dato l="CLIENTE" v={form.cliente} />
                <Dato l="DOCUMENTO" v={form.cedula} />
                <Dato l="PLACA" v={form.placa.toUpperCase()} mono />
                <Dato l="VEHÍCULO" v={[form.marca, form.modelo, form.ano].filter(Boolean).join(' ')} />
                <Dato l="KILOMETRAJE" v={form.kilometraje} />
                <Dato l="TÉCNICO" v={tecnicoNombre} />
                <Dato l="FOTOS" v={`${form.evidenciasIngreso.length} de ${maxPhotos}`} />
                <Dato l="FECHA DE INGRESO" v={fmtDate(form.fecha)} />
              </div>
              {form.observaciones && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 9.5, lineHeight: 1, fontWeight: 700, letterSpacing: '.8px', color: 'var(--text-4)' }}>OBSERVACIONES</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 5, color: 'var(--text-2)' }}>{form.observaciones}</div>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                {/* Se cayo la linea "Se notificara al tecnico...": el handoff prohibe
                    texto explicativo, y ademas prometia un aviso que la app no manda
                    (no hay nada de notificacion en services/, hooks/ ni api/). */}
                <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? 'Recibiendo…' : 'Recibir vehículo'}</button>
              </div>
            </section>
          </div>
        </form>

        {/* Derecha: cuanto carro hay adentro y cual. Es lo que se consulta
            mientras se recibe: si la placa ya esta, no se abre una OT nueva. */}
        <div className="rc-side" style={{ flex: '1 1 300px', maxWidth: 330, gap: 12 }}>
          {/* La UNICA cifra en navy de esta pantalla. */}
          <div className="hd-neto" style={{ margin: 0 }}>
            <div className="hd-neto__l">VEHÍCULOS EN TALLER</div>
            <div className="hd-neto__v">{pendientes.length}</div>
            <div className="hd-neto__rows">
              <div className="hd-neto__r"><span>Pendientes</span><span>{nPend}</span></div>
              <div className="hd-neto__r"><span>En progreso</span><span>{nProg}</span></div>
            </div>
          </div>

          {/* Resumen de lo que va a quedar guardado */}
          <div className="hd-card" style={{ padding: '13px 15px', gap: 9 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Resumen</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>OT asignada</span>
              <span className="hd-mono" style={{ fontSize: 13, fontWeight: 700 }}>{otNumber}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>Fecha ingreso</span>
              <span style={{ fontSize: 12.5 }}>{fmtDate(form.fecha)}{esHoy && <span className="hd-chip" style={{ marginLeft: 6, background: 'var(--accent-soft)', color: 'var(--accent)' }}>HOY</span>}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>Estado inicial</span>
              <span className={`hd-chip hd-chip--${form.programar ? 'purple' : 'warn'}`}>{estadoInicial}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>Cliente</span>
              <span className="hd-clip" style={{ fontSize: 12.5, fontWeight: 700, color: form.cliente ? 'var(--text)' : 'var(--text-empty)' }}>{form.cliente || '—'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>Placa</span>
              <span className="hd-plate" style={{ fontSize: 12.5, color: form.placa ? 'var(--text)' : 'var(--text-empty)' }}>{form.placa ? form.placa.toUpperCase() : '—'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>Fotos</span>
              <span className="hd-n" style={{ fontSize: 12.5, fontWeight: 700 }}>{form.evidenciasIngreso.length} / {maxPhotos}</span>
            </div>
          </div>

          {/* Vehiculos en taller: baja del pie de pagina (donde habia que hacer
              scroll por todo el formulario para verla) al lateral. No pierde
              ninguna de las seis columnas: la fila es de dos lineas. */}
          <div className="hd-card hd-card--grow">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px 10px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Vehículos en taller</span>
              <span className="hd-chip hd-chip--mute" style={{ fontSize: 11 }}>{pendientes.length}</span>
            </div>
            <div className="hd-tbl">
              <div className="hd-tbl__h" style={{ padding: '0 14px' }}>
                <span style={{ width: 62 }}>PLACA</span>
                <span style={{ flex: 1, minWidth: 0 }}>CLIENTE · VEHÍCULO</span>
                <span style={{ width: 62, textAlign: 'right' }}>INGRESO</span>
              </div>
              <div className="hd-tbl__b" style={{ maxHeight: 340 }}>
                {pendientes.length === 0 ? (
                  <div className="hd-void">
                    <div className="hd-void__t">Sin vehículos en taller</div>
                    <div className="hd-void__s">Los que recibas aparecen aquí.</div>
                  </div>
                ) : pendientes.map(t => (
                  <div key={t.id} className="hd-row" style={{ display: 'block', height: 'auto', minHeight: 'var(--tap)', padding: '7px 14px', cursor: 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="hd-plate" style={{ width: 62, flex: 'none', fontSize: 12.5 }}>{t.placa || '—'}</span>
                      <span className="hd-clip" style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>{t.cliente || '—'}</span>
                      <span className="hd-n" style={{ width: 62, flex: 'none', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-3)' }}>{fmtDate(t.fecha)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, paddingLeft: 68 }}>
                      <span className="hd-clip" style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--text-3)' }}>{[t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || '—'}</span>
                      <span className={`hd-av av av-${(parseInt(t.tecnicoId) || 1) % 5 + 1}`}>{tecIniciales(t.tecnicoId)}</span>
                      <span className="hd-clip" style={{ flex: 'none', maxWidth: 84, fontSize: 10.5, color: 'var(--text-2)' }}>{TECNICOS.find(tc => tc.id === parseInt(t.tecnicoId))?.nombre || 'Sin asignar'}</span>
                      <span className={`hd-chip hd-chip--${chipEstado(t.estado)}`} style={{ flex: 'none', fontSize: 8.5 }}>{t.estado}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hd-tbl__f" style={{ padding: '0 14px' }}>
                <span>{pendientes.length} en taller</span>
                <span className="hd-bar__sp" />
                <span>{nPend} pend. · {nProg} en prog.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
