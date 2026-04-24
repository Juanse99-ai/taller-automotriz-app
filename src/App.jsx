import { useState, useCallback, Component } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Toast from './components/Toast'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import Trabajos from './pages/Trabajos'
import Recepcion from './pages/Recepcion'
import Mecanicos from './pages/Mecanicos'
import Cotizaciones from './pages/Cotizaciones'
import Inventario from './pages/Inventario'
import Liquidacion from './pages/Liquidacion'
import Reportes from './pages/Reportes'
import Inspecciones from './pages/Inspecciones'
import PortalCliente from './pages/PortalCliente'
import CuenttiPanel from './pages/CuenttiPanel'
import { useTrabajos } from './hooks/useTrabajos'
import { getSession, logout, getSeccionesPermitidas } from './services/auth'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24 }}>
          <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
            <h3 style={{ color: '#dc2626', marginBottom: 8 }}>Error en esta seccion</h3>
            <p style={{ fontSize: 14, color: '#64748b' }}>{this.state.error?.message || 'Error desconocido'}</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
              onClick={() => this.setState({ error: null })}>Reintentar</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const SECTIONS = {
  dashboard: { title: 'Dashboard', subtitle: 'Resumen general del taller' },
  trabajos: { title: 'Trabajos', subtitle: 'Gestion de ordenes de trabajo' },
  recepcion: { title: 'Recepcion', subtitle: 'Recepcion de vehiculos' },
  mecanicos: { title: 'Mecanicos', subtitle: 'Equipo de tecnicos' },
  cotizaciones: { title: 'Cotizaciones', subtitle: 'Gestionar cotizaciones' },
  inventario: { title: 'Inventario', subtitle: 'Productos y repuestos' },
  liquidacion: { title: 'Liquidacion', subtitle: 'Pagos a tecnicos' },
  reportes: { title: 'Reportes', subtitle: 'Estadisticas y exportacion' },
  inspecciones: { title: 'Inspecciones', subtitle: 'Inspecciones digitales DVI' },
  cuentti: { title: 'Cuentti', subtitle: 'Integracion de facturacion' },
}

export default function App() {
  // Portal de clientes (ruta publica)
  if (window.location.pathname === '/portal' || window.location.hash === '#portal') {
    return <PortalCliente />
  }

  const [user, setUser] = useState(() => getSession())
  const [section, setSection] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toast, setToast] = useState(null)
  const trabajosHook = useTrabajos()

  const notify = useCallback((msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const navigate = useCallback((s) => {
    setSection(s)
    setSidebarOpen(false)
  }, [])

  const handleLogout = useCallback(() => {
    logout()
    setUser(null)
    setSection('dashboard')
  }, [])

  const handleCrearTrabajoDesdeCotizacion = useCallback(async (cot) => {
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
  }, [trabajosHook, notify])

  // Si no hay sesion, mostrar login
  if (!user) {
    return <Login onLogin={(u) => setUser(u)} />
  }

  const seccionesPermitidas = getSeccionesPermitidas(user.rol)
  const sec = SECTIONS[section] || SECTIONS.dashboard

  const renderContent = () => {
    if (!seccionesPermitidas.includes(section)) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">🔒</div>
          <p>No tienes acceso a este modulo.</p>
        </div>
      )
    }
    switch (section) {
      case 'dashboard':
        return <Dashboard trabajos={trabajosHook.trabajos} loading={trabajosHook.loading} />
      case 'trabajos':
        return <Trabajos hook={trabajosHook} notify={notify} onAutoFacturar={() => navigate('cuentti')} />
      case 'recepcion':
        return <Recepcion hook={trabajosHook} notify={notify} />
      case 'mecanicos':
        return <Mecanicos trabajos={trabajosHook.trabajos} />
      case 'cotizaciones':
        return <Cotizaciones notify={notify} onCrearTrabajo={handleCrearTrabajoDesdeCotizacion} />
      case 'inventario':
        return <Inventario notify={notify} />
      case 'liquidacion':
        return <Liquidacion trabajos={trabajosHook.trabajos} notify={notify} />
      case 'reportes':
        return <Reportes trabajos={trabajosHook.trabajos} />
      case 'inspecciones':
        return <Inspecciones trabajos={trabajosHook.trabajos} notify={notify}
          onVincularInspeccion={(trabajoId, inspeccion) => {
            // Guarda la inspeccion dentro del trabajo para que el portal la muestre
            trabajosHook.actualizarTrabajo(trabajoId, { inspeccion })
          }} />
      case 'cuentti':
        return <CuenttiPanel trabajos={trabajosHook.trabajos} notify={notify} />
      default:
        return (
          <div className="empty-state">
            <div className="empty-state-icon">🔧</div>
            <p>Modulo <strong>{sec.title}</strong> en desarrollo.</p>
          </div>
        )
    }
  }

  if (trabajosHook.loading) {
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
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      <Sidebar
        active={section}
        onNavigate={navigate}
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        seccionesPermitidas={seccionesPermitidas}
        user={user}
        onLogout={handleLogout}
        trabajos={trabajosHook.trabajos}
      />
      <div className="main-area">
        <TopBar
          title={sec.title}
          subtitle={sec.subtitle}
          onHamburger={() => setSidebarOpen(!sidebarOpen)}
          user={user}
          onLogout={handleLogout}
          trabajos={trabajosHook.trabajos}
          onNavigate={navigate}
        />
        <div className="content">
          {trabajosHook.connectionError && (
            <div className="connection-error">
              <span>No se pudo conectar con el servidor. Mostrando datos guardados localmente.</span>
              <button onClick={trabajosHook.recargar}>Reintentar</button>
            </div>
          )}
          <ErrorBoundary key={section}>
            <div className="page-enter">
              {renderContent()}
            </div>
          </ErrorBoundary>
        </div>
      </div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}
