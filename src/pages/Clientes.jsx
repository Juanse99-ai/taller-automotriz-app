import { useState, useMemo, useEffect } from 'react'
import Fuse from 'fuse.js'
import { fmtDate } from '../utils/helpers'
import { TIPOS_IDENTIFICACION, TIPOS_PERSONA, REGIMENES, buscarClientePorCedula } from '../services/cuentti'

// Quita acentos: "FERNÁNDEZ" → "fernandez"
const _sinAcentos = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
// Para cedulas: quita puntos, guiones, espacios, lowercase. "30.897.042" → "30897042"
const _normCedula = (s) => (s || '').toString().replace(/[\s.\-_]/g, '').toLowerCase()
// Para nombres: lowercase + sin acentos (mantiene espacios)
const _normNombre = (s) => _sinAcentos(s)
// Solo digitos (para detectar si se busca por cedula)
const soloDigitos = (s) => (s || '').toString().replace(/\D/g, '')

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
  const [creando, setCreando] = useState(false)
  const [nuevoForm, setNuevoForm] = useState({
    cedula: '', nombre: '', telefono: '', email: '', direccion: '',
    tipoIdentificacion: '3', tipoPersona: '1', regimen: 2,
  })
  // Estado de busqueda en Cuentti (auto-fallback cuando no hay match local)
  const [buscandoCuentti, setBuscandoCuentti] = useState(false)
  const [resultadoCuentti, setResultadoCuentti] = useState(null)

  // Metricas
  const totalClientes = clientesTable.length
  const conCuenttiId = useMemo(() => clientesTable.filter(c => c.cuenttiId).length, [clientesTable])
  const conVehiculos = useMemo(() => clientesTable.filter(c => c.vehiculos && c.vehiculos.length > 0).length, [clientesTable])

  // Ordenamiento de columnas (clickeable). null = orden natural por scoring de busqueda.
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const toggleSort = (col) => {
    if (sortBy !== col) { setSortBy(col); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else { setSortBy(null); setSortDir('asc') }
  }
  const sortIcon = (col) => {
    if (sortBy !== col) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 4 }}>↕</span>
    return sortDir === 'asc'
      ? <span style={{ color: 'var(--blue-600)', fontSize: 10, marginLeft: 4 }}>▲</span>
      : <span style={{ color: 'var(--blue-600)', fontSize: 10, marginLeft: 4 }}>▼</span>
  }

  // FUSE.JS: búsqueda fuzzy con scoring automático, soporta acentos y typos
  // El indice se reconstruye cuando cambia la lista de clientes
  const fuse = useMemo(() => new Fuse(clientesTable, {
    keys: [
      { name: 'nombre', weight: 0.7 },
      { name: 'cedula', weight: 0.3 },
    ],
    threshold: 0.3,        // 0 = match exacto, 1 = match laxo. 0.3 es buen balance
    ignoreLocation: true,  // permite match en cualquier posición del string
    minMatchCharLength: 2, // mínimo 2 caracteres para empezar a matchear
    includeScore: true,
    findAllMatches: true,
    // Normaliza acentos (Fuse 7+)
    getFn: (obj, path) => {
      const value = Fuse.config.getFn(obj, path)
      if (Array.isArray(value)) {
        return value.map(v => (v || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase())
      }
      return (value || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    },
  }), [clientesTable])

  // FILTRO PRINCIPAL: usa Fuse.js cuando hay búsqueda, sino lista completa
  const clientesFiltrados = useMemo(() => {
    const termRaw = busqueda.trim()

    // Comparador para ordenamiento de columnas
    const cmp = (a, b) => {
      let av, bv
      switch (sortBy) {
        case 'cedula': av = (a.cedula || ''); bv = (b.cedula || ''); break
        case 'nombre': av = _normNombre(a.nombre); bv = _normNombre(b.nombre); break
        case 'telefono': av = (a.telefono || ''); bv = (b.telefono || ''); break
        case 'email': av = (a.email || '').toLowerCase(); bv = (b.email || '').toLowerCase(); break
        case 'veh': av = (a.vehiculos || []).length; bv = (b.vehiculos || []).length; break
        case 'visita': av = a.fechaUltimaVisita ? new Date(a.fechaUltimaVisita).getTime() : 0; bv = b.fechaUltimaVisita ? new Date(b.fechaUltimaVisita).getTime() : 0; break
        case 'cuentti': av = a.cuenttiId ? 1 : 0; bv = b.cuenttiId ? 1 : 0; break
        default: return 0
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    }

    // Sin búsqueda → lista completa (con sort opcional)
    if (!termRaw) {
      return sortBy ? [...clientesTable].sort(cmp) : clientesTable
    }

    // Búsqueda con Fuse.js — devuelve resultados ordenados por score (mejor primero)
    const results = fuse.search(termRaw)
    let list = results.map(r => r.item)

    // Si hay sortBy explicito, sobrescribe el orden de Fuse
    if (sortBy) list = [...list].sort(cmp)

    return list
  }, [clientesTable, busqueda, sortBy, sortDir, fuse])

  // Auto-buscar en Cuentti cuando no hay resultados locales y el termino parece cedula
  useEffect(() => {
    setResultadoCuentti(null)
    const termRaw = busqueda.trim()
    if (!termRaw || clientesFiltrados.length > 0) return
    const ced = soloDigitos(termRaw)
    // Solo buscar en Cuentti si parece cedula (>=5 digitos)
    if (ced.length < 5) return

    let cancelled = false
    const timer = setTimeout(async () => {
      setBuscandoCuentti(true)
      try {
        const apiResult = await buscarClientePorCedula(ced)
        if (!cancelled && apiResult) {
          setResultadoCuentti(apiResult)
        }
      } catch { /* ignorar */ }
      finally { if (!cancelled) setBuscandoCuentti(false) }
    }, 600) // debounce 600ms

    return () => { cancelled = true; clearTimeout(timer) }
  }, [busqueda, clientesFiltrados.length])

  // Importar el cliente de Cuentti a la BD local
  const importarDeCuentti = (apiResult) => {
    if (!apiResult) return
    const ced = (apiResult.identificacion || apiResult.cedula || '').toString().trim()
    const nom = (apiResult.nombre || apiResult.nombre_cliente || '').toString().trim()
    if (!ced || !nom) {
      notify('El resultado de Cuentti no tiene cedula o nombre validos', 'error')
      return
    }
    const importado = guardarCliente({
      cedula: ced,
      nombre: nom,
      telefono: apiResult.telefono1 || apiResult.telefono || '',
      email: apiResult.email || '',
      direccion: apiResult.direccion || '',
      cuenttiId: apiResult.id_cliente || apiResult.id || null,
    })
    if (importado) {
      notify(`Cliente "${nom}" importado de Cuentti`, 'success')
      setResultadoCuentti(null)
      setBusqueda(ced) // re-filtrar para que aparezca en la lista
    }
  }

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

  const setNuevo = (k, v) => setNuevoForm(f => ({ ...f, [k]: v }))

  const handleCrearCliente = async () => {
    if (!nuevoForm.cedula || !nuevoForm.nombre) {
      notify('Cedula y nombre son obligatorios', 'error')
      return
    }
    // Verificar si ya existe localmente
    const existe = obtenerCliente(nuevoForm.cedula)
    if (existe) {
      notify('Ya existe un cliente con esa cedula', 'error')
      return
    }
    // Guardar localmente
    const local = guardarCliente({
      cedula: nuevoForm.cedula,
      nombre: nuevoForm.nombre,
      telefono: nuevoForm.telefono,
      email: nuevoForm.email,
      direccion: nuevoForm.direccion,
    })
    // Guardar en Cuentti
    setGuardandoCuentti(true)
    try {
      const result = await guardarEnCuentti({
        cedula: nuevoForm.cedula,
        nombre: nuevoForm.nombre,
        telefono: nuevoForm.telefono,
        email: nuevoForm.email,
        direccion: nuevoForm.direccion,
        tipoIdentificacion: nuevoForm.tipoIdentificacion,
        tipoPersona: nuevoForm.tipoPersona,
        regimen: nuevoForm.regimen,
      })
      if (result.success) {
        notify('Cliente creado y guardado en Cuentti', 'success')
        setCreando(false)
        setNuevoForm({ cedula: '', nombre: '', telefono: '', email: '', direccion: '', tipoIdentificacion: '3', tipoPersona: '1', regimen: 2 })
        if (result.data) seleccionar(result.data)
      } else {
        notify('Cliente guardado local. Error Cuentti: ' + (result.error || 'desconocido'), 'warning')
        setCreando(false)
        setNuevoForm({ cedula: '', nombre: '', telefono: '', email: '', direccion: '', tipoIdentificacion: '3', tipoPersona: '1', regimen: 2 })
        if (local) seleccionar(local)
      }
    } catch {
      notify('Cliente guardado localmente. No se pudo conectar con Cuentti', 'warning')
      setCreando(false)
      if (local) seleccionar(local)
    } finally {
      setGuardandoCuentti(false)
    }
  }

  // --- VISTA CREAR NUEVO ---
  if (creando) {
    return (
      <div>
        <div className="pagehd">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button className="btn btn-outline btn-sm" onClick={() => setCreando(false)}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div><h2>Nuevo Cliente</h2><p className="sub">Crear cliente y sincronizar con Cuentti</p></div>
          </div>
        </div>

        <div className="card">
          <div className="card__h"><h3>Datos Tributarios</h3></div>
          <div className="card__b">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
              <div className="field">
                <label>Tipo Persona</label>
                <select className="input" value={nuevoForm.tipoPersona} onChange={e => setNuevo('tipoPersona', e.target.value)}>
                  {TIPOS_PERSONA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Tipo Identificacion</label>
                <select className="input" value={nuevoForm.tipoIdentificacion} onChange={e => setNuevo('tipoIdentificacion', e.target.value)}>
                  {TIPOS_IDENTIFICACION.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Regimen</label>
                <select className="input" value={nuevoForm.regimen} onChange={e => setNuevo('regimen', parseInt(e.target.value))}>
                  {REGIMENES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__h"><h3>Informacion del Cliente</h3></div>
          <div className="card__b">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div className="field">
                <label>Identificacion *</label>
                <input className="input" value={nuevoForm.cedula} placeholder="Numero de documento"
                  onChange={e => setNuevo('cedula', e.target.value)} />
              </div>
              <div className="field">
                <label>Nombre Completo *</label>
                <input className="input" value={nuevoForm.nombre} placeholder="Nombre y apellidos / Razon social"
                  onChange={e => setNuevo('nombre', e.target.value)} />
              </div>
              <div className="field">
                <label>Telefono</label>
                <input className="input" value={nuevoForm.telefono} placeholder="300..."
                  onChange={e => setNuevo('telefono', e.target.value)} />
              </div>
              <div className="field">
                <label>Email</label>
                <input className="input" type="email" value={nuevoForm.email} placeholder="correo@ejemplo.com"
                  onChange={e => setNuevo('email', e.target.value)} />
              </div>
              <div className="field" style={{gridColumn:'1 / -1'}}>
                <label>Direccion</label>
                <input className="input" value={nuevoForm.direccion} placeholder="Calle / Carrera..."
                  onChange={e => setNuevo('direccion', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setCreando(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCrearCliente} disabled={guardandoCuentti}>
                {guardandoCuentti ? 'Guardando...' : 'Crear y Guardar en Cuentti'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- VISTA DETALLE ---
  if (clienteSeleccionado) {
    return (
      <div>
        <div className="pagehd">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button className="btn btn-outline btn-sm" onClick={volver}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div>
              <h2>{clienteSeleccionado.nombre || 'Cliente'}</h2>
              <p className="sub">CC/NIT {clienteSeleccionado.cedula}</p>
            </div>
          </div>
          <div className="actions" style={{display:'flex',alignItems:'center',gap:10}}>
            {clienteSeleccionado.cuenttiId && (
              <span className="badge badge-s">Cuentti #{clienteSeleccionado.cuenttiId}</span>
            )}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'start'}}>
          {/* Left column - Info */}
          <div className="card">
            <div className="card__h"><h3>Informacion del cliente</h3></div>
            <div className="card__b">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div className="field">
                  <label>Cedula / NIT</label>
                  <input className="input" value={clienteSeleccionado.cedula} disabled
                    style={{ background: 'var(--bg-subtle)', color: 'var(--text-3)' }} />
                </div>
                <div className="field">
                  <label>Nombre</label>
                  <input className="input" value={editForm.nombre}
                    onChange={e => setEdit('nombre', e.target.value)} />
                </div>
                <div className="field">
                  <label>Telefono</label>
                  <input className="input" value={editForm.telefono}
                    onChange={e => setEdit('telefono', e.target.value)} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" value={editForm.email} type="email"
                    onChange={e => setEdit('email', e.target.value)} />
                </div>
                <div className="field" style={{gridColumn:'1 / -1'}}>
                  <label>Direccion</label>
                  <input className="input" value={editForm.direccion}
                    onChange={e => setEdit('direccion', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleGuardarLocal}>
                  Guardar Cambios
                </button>
                <button className="btn btn-success" onClick={handleGuardarCuentti} disabled={guardandoCuentti}>
                  {guardandoCuentti ? 'Guardando...' : 'Guardar en Cuentti'}
                </button>
              </div>
            </div>
          </div>

          {/* Right column - Vehiculos */}
          <div className="card">
            <div className="card__h">
              <h3>Vehiculos del cliente</h3>
              <span className="count">{vehiculosCliente.length}</span>
            </div>
            {vehiculosCliente.length === 0 ? (
              <div className="card__b">
                <div className="empty"><h4>Sin vehiculos</h4><p>Este cliente no tiene vehiculos registrados.</p></div>
              </div>
            ) : (
              <div className="card__b card__b--flush">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Marca</th>
                      <th>Modelo</th>
                      <th>Año</th>
                      <th style={{textAlign:'center'}}># Visitas</th>
                      <th>Último Servicio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehiculosCliente.map(v => (
                      <tr key={v.placa}>
                        <td className="c-mono" style={{ fontWeight: 700 }}>{v.placa}</td>
                        <td>{v.marca || '--'}</td>
                        <td className="c-muted">{v.modelo || '--'}</td>
                        <td className="c-mono c-muted">{v.ano || '--'}</td>
                        <td style={{textAlign:'center'}}>
                          <span className="badge badge-i">{(v.historial || []).length}</span>
                        </td>
                        <td className="c-muted">{fmtDate(v.fechaUltimoServicio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
        <div><h2>Clientes</h2><p className="sub">{totalClientes} clientes en la base · {conCuenttiId} sincronizados con Cuentti</p></div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setCreando(true)}>+ Nuevo cliente</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:18}}>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div><div className="kpi__lbl">Total clientes</div></div><div className="kpi__v">{totalClientes}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic green"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg></div><div className="kpi__lbl">Sincronizados Cuentti</div></div><div className="kpi__v">{conCuenttiId}</div><div className="kpi__delta">{totalClientes > 0 ? Math.round(conCuenttiId/totalClientes*100) : 0}%</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__ic amber"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div><div className="kpi__lbl">Con vehiculos</div></div><div className="kpi__v">{conVehiculos}</div></div>
      </div>

      <div className="card">
        <div className="card__h" style={{display:'flex',alignItems:'center',gap:12}}>
          <h3 style={{flex:'none'}}>Buscar</h3>
          <div style={{flex:1,maxWidth:480,display:'flex',alignItems:'center',gap:8,background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 11px'}}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{opacity:.5}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="🔍 CC/NIT o nombre del cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{border:'none',outline:'none',background:'none',flex:1,fontSize:12.5}}/>
            {busqueda && <button onClick={() => setBusqueda('')} style={{background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',fontSize:14,padding:0}}>✕</button>}
          </div>
          <span className="count" style={{ background: clientesFiltrados.length === 0 && busqueda.trim() ? 'var(--red-100)' : undefined, color: clientesFiltrados.length === 0 && busqueda.trim() ? 'var(--red-700)' : undefined }}>
            {busqueda.trim() ? `${clientesFiltrados.length} de ${totalClientes}` : `${clientesFiltrados.length} clientes`}
          </span>
        </div>

        {/* Banner: encontrado en Cuentti pero NO en local */}
        {busqueda.trim() && clientesFiltrados.length === 0 && resultadoCuentti && (
          <div style={{padding:'12px 16px',margin:'0 16px 16px',background:'var(--blue-50,#eff6ff)',border:'1px solid var(--blue-300,#93c5fd)',borderRadius:8,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:12.5,fontWeight:700,color:'var(--blue-700,#1e40af)',marginBottom:2}}>
                ✓ Encontrado en Cuentti (no en BD local)
              </div>
              <div style={{fontSize:13,fontWeight:600}}>
                {(resultadoCuentti.nombre || resultadoCuentti.nombre_cliente || '').toString()}
              </div>
              <div style={{fontSize:11.5,color:'var(--text-3)',marginTop:2}}>
                CC <span className="mono">{resultadoCuentti.identificacion || resultadoCuentti.cedula}</span>
                {(resultadoCuentti.telefono1 || resultadoCuentti.telefono) && <> · Tel <span className="mono">{resultadoCuentti.telefono1 || resultadoCuentti.telefono}</span></>}
                {resultadoCuentti.email && <> · {resultadoCuentti.email}</>}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => importarDeCuentti(resultadoCuentti)}>
              ⬇ Importar a la app
            </button>
          </div>
        )}

        {/* Banner: buscando en Cuentti */}
        {busqueda.trim() && clientesFiltrados.length === 0 && buscandoCuentti && !resultadoCuentti && (
          <div style={{padding:'10px 16px',margin:'0 16px 16px',background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:8,fontSize:12.5,color:'var(--text-3)'}}>
            🔍 Buscando "{busqueda}" en Cuentti...
          </div>
        )}

        <div className="card__b card__b--flush">
          {clientesFiltrados.length === 0 ? (
            <div className="empty">
              <h4>Sin resultados en la BD local</h4>
              <p>
                {soloDigitos(busqueda).length >= 5
                  ? (resultadoCuentti
                      ? 'Hay un cliente en Cuentti con esa cedula. Click en "Importar" arriba.'
                      : (buscandoCuentti ? 'Consultando Cuentti...' : 'Tampoco se encontro en Cuentti.'))
                  : 'No se encontro ningun cliente. Prueba con la cedula completa.'}
              </p>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('cedula')} style={{ cursor: 'pointer', userSelect: 'none' }}>CC/NIT{sortIcon('cedula')}</th>
                  <th onClick={() => toggleSort('nombre')} style={{ cursor: 'pointer', userSelect: 'none' }}>Nombre{sortIcon('nombre')}</th>
                  <th onClick={() => toggleSort('telefono')} style={{ cursor: 'pointer', userSelect: 'none' }}>Teléfono{sortIcon('telefono')}</th>
                  <th onClick={() => toggleSort('email')} style={{ cursor: 'pointer', userSelect: 'none' }}>Email{sortIcon('email')}</th>
                  <th onClick={() => toggleSort('veh')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>Veh.{sortIcon('veh')}</th>
                  <th onClick={() => toggleSort('visita')} style={{ cursor: 'pointer', userSelect: 'none' }}>Última Visita{sortIcon('visita')}</th>
                  <th onClick={() => toggleSort('cuentti')} style={{ cursor: 'pointer', userSelect: 'none' }}>Cuentti{sortIcon('cuentti')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(c => (
                  <tr key={c.id || c.cedula} style={{cursor:'pointer'}} onClick={() => seleccionar(c)}>
                    <td className="c-mono" style={{fontSize:12.5}}>{c.cedula || '--'}</td>
                    <td className="c-name">{c.nombre || '--'}</td>
                    <td className="c-mono">{c.telefono || '--'}</td>
                    <td className="c-muted">{c.email || '--'}</td>
                    <td style={{textAlign:'center'}}>
                      <span className={`badge ${(c.vehiculos || []).length > 0 ? 'badge-i' : 'badge-w'}`}>
                        {(c.vehiculos || []).length}
                      </span>
                    </td>
                    <td className="c-muted">{fmtDate(c.fechaUltimaVisita)}</td>
                    <td>{c.cuenttiId ? <span className="badge badge-s">OK</span> : <span className="badge badge-w">Pendiente</span>}</td>
                    <td style={{opacity:.5}}>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
