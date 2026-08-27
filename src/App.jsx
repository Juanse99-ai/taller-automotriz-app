import { useState, useCallback, useEffect, useRef, Component, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Toast from './components/Toast'
import Login from './components/Login'
// Páginas por demanda (React.lazy): cada una es su propio chunk, así el bundle
// inicial baja y las libs pesadas (jspdf, gsap) viajan solo con la página que las usa.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Trabajos = lazy(() => import('./pages/Trabajos'))
const Recepcion = lazy(() => import('./pages/Recepcion'))
const Mecanicos = lazy(() => import('./pages/Mecanicos'))
const Cotizaciones = lazy(() => import('./pages/Cotizaciones'))
const Inventario = lazy(() => import('./pages/Inventario'))
const Liquidacion = lazy(() => import('./pages/Liquidacion'))
const Reportes = lazy(() => import('./pages/Reportes'))
const Inspecciones = lazy(() => import('./pages/Inspecciones'))
const CuenttiPanel = lazy(() => import('./pages/CuenttiPanel'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Vehiculos = lazy(() => import('./pages/Vehiculos'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const CRM = lazy(() => import('./pages/CRM'))

// Fallback mientras carga el chunk de una página.
function CargandoPagina() {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Cargando…</div>
}
import { useTrabajos } from './hooks/useTrabajos'
import { useClientes } from './hooks/useClientes'
import { useVehiculos } from './hooks/useVehiculos'
import { useCotizaciones } from './hooks/useCotizaciones'
import { useInspecciones } from './hooks/useInspecciones'
import { useLiquidacion } from './hooks/useLiquidacion'
import { getSession, logout, getSeccionesPermitidas, EVT_SESION_VENCIDA } from './services/auth'
import { cargarInventarioCompleto } from './services/cuentti'
import { lsGet, lsSet, LS_KEYS } from './services/storage'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24 }}>
          <div className="card" style={{ background: 'var(--red-100)', border: '1px solid rgba(220,38,38,.32)' }}>
            <div className="card__b">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red-600)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                <h3 style={{ color: 'var(--red-700)', margin: 0, fontSize: 16, fontWeight: 800 }}>Error en esta sección</h3>
              </div>
              <p style={{ fontSize: 14.5, color: 'var(--text-2)', marginBottom: 14 }}>{this.state.error?.message || 'Error desconocido'}</p>
              <button className="btn btn-primary btn-sm"
                onClick={() => this.setState({ error: null })}>Reintentar</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const SECTIONS = {
  dashboard: { title: 'Dashboard', subtitle: 'Resumen general del taller' },
  trabajos: { title: 'Trabajos', subtitle: 'Gestión de órdenes de trabajo' },
  recepcion: { title: 'Recepción', subtitle: 'Recepción de vehículos' },
  mecanicos: { title: 'Mecánicos', subtitle: 'Equipo de técnicos' },
  cotizaciones: { title: 'Cotizaciones', subtitle: 'Gestionar cotizaciones' },
  inventario: { title: 'Inventario', subtitle: 'Productos y repuestos' },
  liquidacion: { title: 'Liquidación', subtitle: 'Pagos a técnicos' },
  reportes: { title: 'Reportes', subtitle: 'Estadísticas y exportación' },
  inspecciones: { title: 'Inspecciones', subtitle: 'Inspecciones digitales DVI' },
  clientes: { title: 'Clientes', subtitle: 'Gestión de clientes' },
  vehiculos: { title: 'Vehículos', subtitle: 'Historial y seguimiento vehicular' },
  crm: { title: 'CRM', subtitle: 'Recordatorios y campañas de retención' },
  cuentti: { title: 'Cuentti', subtitle: 'Integración de facturación' },
  usuarios: { title: 'Usuarios', subtitle: 'Gestión de accesos al sistema' },
}

export default function App() {
  // El portal ya no se decide aqui: lo hace main.jsx antes de importar App. Asi
  // los hooks de abajo dejan de vivir detras de un return condicional.
  const [user, setUser] = useState(() => getSession())
  // Mensaje para la pantalla de entrada cuando el servidor tumba la sesion.
  const [avisoSesion, setAvisoSesion] = useState('')
  const [section, setSection] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // El rail del rediseño vive en 86px y se expande al pasar el cursor, así que
    // el reposo por defecto es colapsado. Solo queda expandido si el usuario lo
    // fijó a mano alguna vez.
    try { return localStorage.getItem('mda:sidebar') !== 'expanded' } catch { return true }
  })
  const [toast, setToast] = useState(null)
  // Si el servidor rechaza la sesion (401), salir a la pantalla de entrada
  // diciendo por que. Antes esto se veia como "No se pudo conectar con el
  // servidor" y Reintentar no podia arreglarlo: el usuario seguia sobre el
  // cache local creyendo que miraba la base.
  useEffect(() => {
    const alVencer = () => {
      logout()
      setUser(null)
      setAvisoSesion('Tu sesión venció por seguridad. Entra de nuevo.')
    }
    window.addEventListener(EVT_SESION_VENCIDA, alVencer)
    return () => window.removeEventListener(EVT_SESION_VENCIDA, alVencer)
  }, [])

  const trabajosHook = useTrabajos()
  const clientesHook = useClientes()
  const vehiculosHook = useVehiculos()
  const cotizacionesHook = useCotizaciones()
  const inspeccionesHook = useInspecciones()
  const liquidacionHook = useLiquidacion()

  // Sync retroactivo: registrar vehiculos Y CLIENTES de trabajos existentes
  const syncDone = useRef(false)
  useEffect(() => {
    if (syncDone.current || trabajosHook.loading || !trabajosHook.trabajos.length) return
    syncDone.current = true
    const vehiculosExistentes = new Set(vehiculosHook.vehiculos.map(v => v.placa))
    const clientesExistentes = new Set(
      (clientesHook.clientesTable || clientesHook.listarClientes?.() || []).map(c => c.cedula)
    )

    trabajosHook.trabajos.forEach(t => {
      const placa = (t.placa || '').trim().toUpperCase()
      const cedula = (t.cedula || '').toString().trim()

      // 1. Crear vehiculo si no existe
      if (placa && !vehiculosExistentes.has(placa)) {
        vehiculosHook.agregarVehiculo({
          placa,
          marca: t.marca || '',
          modelo: t.modelo || '',
          ano: parseInt(t.ano) || 0,
          cedulaPropietario: cedula,
        })
        vehiculosExistentes.add(placa)
      }

      // 2. Crear CLIENTE si no existe (NUEVO: antes solo se vinculaba)
      if (cedula && t.cliente && !clientesExistentes.has(cedula)) {
        clientesHook.guardarCliente({
          cedula,
          nombre: t.cliente,
          telefono: t.telefonoCliente || '',
          email: t.emailCliente || '',
          vehiculos: placa ? [placa] : [],
        })
        clientesExistentes.add(cedula)
      }

      // 3. Vincular vehiculo al cliente
      if (cedula && placa) {
        clientesHook.vincularVehiculo(cedula, placa)
      }
    })
  }, [trabajosHook.loading, trabajosHook.trabajos])

  const notify = useCallback((msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Pre-cargar inventario de Cuentti en background al iniciar la app y luego
  // cada 15 minutos (antes 2: paginaba TODO el inventario por /api/cuentti en cada
  // ciclo y sumaba Fast Origin Transfer). Con la pestaña oculta no se consulta.
  useEffect(() => {
    if (!user) return
    let active = true
    const sync = () => {
      if (document.hidden) return
      cargarInventarioCompleto()
        .then(data => {
          if (active && data && data.length > 0) {
            lsSet(LS_KEYS.INVENTARIO_CACHE, data)
            lsSet(LS_KEYS.INVENTARIO_TIMESTAMP, Date.now())
          }
        })
        .catch(() => { /* ignorar errores de red, seguimos con cache */ })
    }
    sync()
    const interval = setInterval(sync, 15 * 60 * 1000) // cada 15 min
    return () => { active = false; clearInterval(interval) }
  }, [user])

  // OT que viene del botón "Cobrar" de Trabajos: llega preseleccionada al panel
  // de Cuentti para no tener que buscarla otra vez en el selector.
  const [cobrarTrabajoId, setCobrarTrabajoId] = useState(null)

  const navigate = useCallback((s) => {
    setSection(s)
    setSidebarOpen(false)
    // El puente solo vale para el salto inmediato: si el usuario se va a otra
    // sección, la OT deja de estar preseleccionada.
    if (s !== 'cuentti') setCobrarTrabajoId(null)
  }, [])

  const irACobrar = useCallback((trabajo) => {
    setCobrarTrabajoId(trabajo?.id || null)
    setSection('cuentti')
    setSidebarOpen(false)
  }, [])

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed(c => {
      const v = !c
      try { localStorage.setItem('mda:sidebar', v ? 'collapsed' : 'expanded') } catch {}
      return v
    })
  }, [])

  const onToggleSidebar = useCallback(() => {
    if (window.matchMedia('(max-width:960px)').matches) {
      setSidebarOpen(o => !o)
    } else {
      toggleSidebarCollapse()
    }
  }, [toggleSidebarCollapse])

  const handleLogout = useCallback(() => {
    logout()
    setUser(null)
    setSection('dashboard')
  }, [])

  // Candado anti doble-click: el 23-jul-2026 clicks repetidos en "Crear trabajo"
  // generaron 22 OTs duplicadas (cada click era un agregarTrabajo nuevo). Mientras
  // hay una creación en vuelo, los demás clicks se ignoran.
  const creandoDesdeCotRef = useRef(false)
  const handleCrearTrabajoDesdeCotizacion = useCallback(async (cot) => {
    if (creandoDesdeCotRef.current) return
    creandoDesdeCotRef.current = true
    try {
    const data = {
      cedula: cot.cedula || '',
      cliente: cot.cliente || '',
      telefonoCliente: cot.telefonoCliente || '',
      emailCliente: cot.emailCliente || '',
      placa: cot.placa || '',
      marca: cot.marca || '',
      modelo: cot.modelo || '',
      items: cot.items || [],
      observaciones: `Creado desde cotizacion ${cot.id}. ${cot.observaciones || ''}`,
      total: cot.total || 0,
      subtotalSinIva: cot.subtotal || 0,
      totalIva: cot.iva || 0,
      estado: 'Pendiente',
      fecha: new Date().toISOString(),
    }
    await trabajosHook.agregarTrabajo(data)
    notify('Trabajo creado desde cotizacion', 'success')
    setSection('trabajos')
    } finally {
      creandoDesdeCotRef.current = false
    }
  }, [trabajosHook, notify])

  // Si no hay sesion, mostrar login
  if (!user) {
    return <Login aviso={avisoSesion} onLogin={(u) => {
      setAvisoSesion('')
      setUser(u)
      // Los hooks se montaron sin sesion, asi que no pidieron nada (ver
      // haySesion en services/auth). Al entrar hay que pedirlo YA: si no, la
      // app se queda con el cache local hasta el sondeo de los 60 segundos.
      trabajosHook.recargar()
      cotizacionesHook.recargar()
      inspeccionesHook.recargar()
      liquidacionHook.recargar()
    }} />
  }

  const seccionesPermitidas = getSeccionesPermitidas(user.rol)
  const sec = SECTIONS[section] || SECTIONS.dashboard

  const renderContent = () => {
    if (!seccionesPermitidas.includes(section)) {
      return (
        <div className="empty-state">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: .8 }}>
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <p>No tienes acceso a este módulo.</p>
        </div>
      )
    }
    switch (section) {
      case 'dashboard':
        return <Dashboard trabajos={trabajosHook.trabajos} loading={trabajosHook.loading} onNavigate={navigate} user={user} />
      case 'trabajos':
        {/* onAutoFacturar solo si el rol puede entrar a Cuentti: sin esto, el
           jefe de taller veía el botón "Cobrar" y aterrizaba en "No tienes
           acceso a este módulo", sin Cuentti en el menú para volver. */}
        return <Trabajos hook={trabajosHook} vehiculosHook={vehiculosHook} clientesHook={clientesHook} notify={notify} onAutoFacturar={seccionesPermitidas.includes('cuentti') ? irACobrar : null} />
      case 'recepcion':
        return <Recepcion hook={trabajosHook} vehiculosHook={vehiculosHook} clientesHook={clientesHook} notify={notify} />
      case 'mecanicos':
        return <Mecanicos trabajos={trabajosHook.trabajos} onNavigate={navigate} notify={notify} />
      case 'cotizaciones':
        return <Cotizaciones notify={notify} trabajos={trabajosHook.trabajos} onCrearTrabajo={handleCrearTrabajoDesdeCotizacion} cotizacionesHook={cotizacionesHook} />
      case 'inventario':
        return <Inventario notify={notify} />
      case 'liquidacion':
        return <Liquidacion trabajos={trabajosHook.trabajos} notify={notify} liquidacionHook={liquidacionHook} />
      case 'reportes':
        return <Reportes trabajos={trabajosHook.trabajos} loading={trabajosHook.loading} notify={notify} />
      case 'inspecciones':
        return <Inspecciones trabajos={trabajosHook.trabajos} notify={notify}
          inspeccionesHook={inspeccionesHook}
          onVincularInspeccion={(trabajoId, inspeccion) => {
            trabajosHook.actualizarTrabajo(trabajoId, { inspeccion })
          }} />
      case 'clientes':
        return <Clientes clientes={clientesHook} vehiculos={vehiculosHook} trabajos={trabajosHook.trabajos} notify={notify} />
      case 'vehiculos':
        return <Vehiculos vehiculos={vehiculosHook} clientes={clientesHook} trabajos={trabajosHook.trabajos} notify={notify} />
      case 'cuentti':
        return <CuenttiPanel trabajos={trabajosHook.trabajos} actualizarTrabajo={trabajosHook.actualizarTrabajo} notify={notify} trabajoPreseleccionado={cobrarTrabajoId} />
      case 'crm':
        return <CRM trabajos={trabajosHook.trabajos} clientes={clientesHook} vehiculos={vehiculosHook} notify={notify} actualizarTrabajo={trabajosHook.actualizarTrabajo} />
      case 'usuarios':
        return <Usuarios notify={notify} currentUser={user} />
      default:
        return (
          <div className="empty-state">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: .8 }}>
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            <p>Módulo <strong>{sec.title}</strong> en desarrollo.</p>
          </div>
        )
    }
  }

  // Solo mostrar pantalla de carga la primera vez (cuando no hay cache local)
  if (trabajosHook.loading && trabajosHook.trabajos.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-brand">
          <div className="loading-brand-mark">
            <img src="/logo.png" alt="MDA" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          </div>
          <span className="loading-brand-text">Multidiagnosticos AS</span>
        </div>
        <div className="spinner" />
        <p className="loading-label">Cargando datos del taller...</p>
      </div>
    )
  }

  return (
    <div className={`app${sidebarCollapsed ? ' has-collapsed' : ''}`}>
      <Sidebar
        active={section}
        onNavigate={navigate}
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onCollapse={toggleSidebarCollapse}
        seccionesPermitidas={seccionesPermitidas}
        user={user}
        onLogout={handleLogout}
        trabajos={trabajosHook.trabajos}
        cotizaciones={cotizacionesHook.cotizaciones}
        liquidados={liquidacionHook.liquidados}
      />
      <div className="main">
        <TopBar
          title={sec.title}
          subtitle={sec.subtitle}
          onToggleSidebar={onToggleSidebar}
          sidebarOpen={sidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          user={user}
          onLogout={handleLogout}
          trabajos={trabajosHook.trabajos}
          onNavigate={navigate}
        />
        <div className="content">
          {/* La franja amarilla de abajo habla de la LECTURA. Esta habla de la
              ESCRITURA, que es lo grave: una OT que se ve creada en pantalla y
              no existe en la base. No se pierde nada (el sync la reintenta
              solo), pero hasta ahora nadie se enteraba de que estaba en el aire. */}
          {trabajosHook.sinSubir?.length > 0 && (
            <div className="connection-error connection-error--grave">
              <span>
                <b>{trabajosHook.sinSubir.length}</b>
                {trabajosHook.sinSubir.length === 1
                  ? ' cambio guardado en este equipo todavía no llegó al servidor.'
                  : ' cambios guardados en este equipo todavía no llegaron al servidor.'}
                {' '}No cierres sesión ni limpies el navegador hasta que suba.
              </span>
              {/* sincronizar(), NO recargar(): recargar vuelve a LEER del servidor,
                  y lo que hace falta aqui es volver a SUBIR lo que quedo en el
                  aire. Es el unico que reintenta los pendientes. */}
              <button onClick={() => trabajosHook.sincronizar()}>Reintentar</button>
            </div>
          )}
          {(trabajosHook.connectionError || cotizacionesHook.connectionError || liquidacionHook.connectionError) && (
            <div className="connection-error">
              <span>No se pudo conectar con el servidor. Mostrando datos guardados localmente.</span>
              <button onClick={() => { trabajosHook.recargar(); cotizacionesHook.recargar(); liquidacionHook.recargar() }}>Reintentar</button>
            </div>
          )}
          <ErrorBoundary key={section}>
            <div className="page-enter">
              <Suspense fallback={<CargandoPagina />}>
                {renderContent()}
              </Suspense>
            </div>
          </ErrorBoundary>
        </div>
      </div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className={`scrim ${sidebarOpen ? 'on' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Mobile bottom tab bar */}
      <nav className="mob-tabbar">
        {[
          { id: 'dashboard', label: 'Inicio', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> },
          { id: 'trabajos', label: 'Trabajos', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> },
          { id: 'recepcion', label: 'Recibir', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="m9 14 2 2 4-4"/></svg> },
          { id: 'inventario', label: 'Stock', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
          { id: '_more', label: 'Mas', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
        ].map(tab => (
          <button key={tab.id}
            className={`mob-tab${section === tab.id ? ' active' : ''}`}
            onClick={() => {
              if (tab.id === '_more') { setSidebarOpen(true) }
              else { navigate(tab.id) }
            }}>
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
