import { useState, useCallback } from 'react'
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
import CuenttiPanel from './pages/CuenttiPanel'
import { useTrabajos } from './hooks/useTrabajos'
import { getSession, logout, getSeccionesPermitidas } from './services/auth'

const SECTIONS = {
  dashboard: { title: 'Dashboard', subtitle: 'Resumen general del taller' },
  trabajos: { title: 'Trabajos', subtitle: 'Gestion de ordenes de trabajo' },
  recepcion: { title: 'Recepcion', subtitle: 'Recepcion de vehiculos' },
  mecanicos: { title: 'Mecanicos', subtitle: 'Equipo de tecnicos' },
  cotizaciones: { title: 'Cotizaciones', subtitle: 'Gestionar cotizaciones' },
  inventario: { title: 'Inventario', subtitle: 'Productos y repuestos' },
  liquidacion: { title: 'Liquidacion', subtitle: 'Pagos a tecnicos' },
  reportes: { title: 'Reportes', subtitle: 'Estadisticas y exportacion' },
  cuentti: { title: 'Cuentti', subtitle: 'Integracion de facturacion' },
}

export default function App() {
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
        return <Trabajos hook={trabajosHook} notify={notify} />
      case 'recepcion':
        return <Recepcion hook={trabajosHook} notify={notify} />
      case 'mecanicos':
        return <Mecanicos trabajos={trabajosHook.trabajos} />
      case 'cotizaciones':
        return <Cotizaciones notify={notify} />
      case 'inventario':
        return <Inventario notify={notify} />
      case 'liquidacion':
        return <Liquidacion trabajos={trabajosHook.trabajos} notify={notify} />
      case 'reportes':
        return <Reportes trabajos={trabajosHook.trabajos} />
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
      />
      <div className="main-area">
        <TopBar
          title={sec.title}
          subtitle={sec.subtitle}
          onHamburger={() => setSidebarOpen(!sidebarOpen)}
          user={user}
          onLogout={handleLogout}
        />
        <div className="content">
          {trabajosHook.connectionError && (
            <div className="connection-error">
              <span>No se pudo conectar con el servidor. Mostrando datos guardados localmente.</span>
              <button onClick={trabajosHook.recargar}>Reintentar</button>
            </div>
          )}
          {renderContent()}
        </div>
      </div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}
