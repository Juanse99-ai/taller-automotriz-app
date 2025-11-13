// ===== JAVASCRIPT COMPLETO EMBEBIDO ===== 
// Supabase Configuration
const SUPABASE_URL = 'https://crtdentsfumgrotgvwdj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydGRlbnRzZnVtZ3JvdGd2d2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NTU5NTIsImV4cCI6MjA3ODIzMTk1Mn0.7T_Fd_L1gn3MtkvgqSCePrlK-ZUhp-8gbT5fG8GZoW4';

// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentSection = 'dashboard';
let sidebarCollapsed = false;

// Demo data
const demoData = {
    dashboard: {
        totalJobs: 12,
        completedJobs: 8,
        inProgressJobs: 3,
        monthlyRevenue: '$1,250,000',
        recentJobs: [
            { id: 'TR-001', cliente: 'Juan Pérez', vehiculo: 'Toyota Corolla 2020', servicio: 'Cambio de aceite y filtro', estado: 'Completado', fecha: '2025-01-10' },
            { id: 'TR-002', cliente: 'María García', vehiculo: 'Honda Civic 2019', servicio: 'Frenos delanteros', estado: 'En Progreso', fecha: '2025-01-11' },
            { id: 'TR-003', cliente: 'Carlos López', vehiculo: 'Nissan Sentra 2021', servicio: 'Revisión general', estado: 'Pendiente', fecha: '2025-01-12' }
        ]
    },
    trabajos: {
        total: 12,
        completed: 8,
        inProgress: 3,
        pending: 1,
        list: [
            { id: 'TR-001', cliente: 'Juan Pérez', vehiculo: 'Toyota Corolla 2020', servicio: 'Cambio de aceite y filtro', mecanico: 'Carlos Rodríguez', estado: 'Completado' },
            { id: 'TR-002', cliente: 'María García', vehiculo: 'Honda Civic 2019', servicio: 'Frenos delanteros', mecanico: 'Ana Martínez', estado: 'En Progreso' },
            { id: 'TR-003', cliente: 'Carlos López', vehiculo: 'Nissan Sentra 2021', servicio: 'Revisión general', mecanico: 'Miguel Hernández', estado: 'Pendiente' }
        ]
    },
    mecanicos: {
        total: 4,
        active: 3,
        avgExperience: 8.5,
        list: [
            { id: 'MC-001', nombre: 'Carlos Rodríguez', especialidad: 'Frenos y Suspensión', experiencia: '12 años', estado: 'Activo', trabajos: 2 },
            { id: 'MC-002', nombre: 'Ana Martínez', especialidad: 'Motor y Transmisión', experiencia: '8 años', estado: 'Activo', trabajos: 1 },
            { id: 'MC-003', nombre: 'Miguel Hernández', especialidad: 'Sistema Eléctrico', experiencia: '6 años', estado: 'Activo', trabajos: 0 },
            { id: 'MC-004', nombre: 'Laura Sánchez', especialidad: 'Diagnóstico Computarizado', experiencia: '10 años', estado: 'Disponible', trabajos: 0 }
        ]
    }
};

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Multidiagnósticos AS - Sistema iniciado');
    console.log('📱 Versión de archivos separados para GitHub');
    
    // Initialize application
    initializeApp();
    
    // Set default section
    showSection('dashboard');
    
    // Update dashboard with demo data
    updateDashboardData();
});

// Initialize application
function initializeApp() {
    console.log('📋 Inicializando aplicación...');
    
    // Setup mobile responsive
    setupMobileResponsive();
    
    console.log('✅ Aplicación inicializada correctamente');
}

// Mobile responsive setup
function setupMobileResponsive() {
    // Add mobile menu toggle if on mobile
    if (window.innerWidth <= 768) {
        addMobileMenuToggle();
    }
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth <= 768) {
            addMobileMenuToggle();
        }
    });
}

// Add mobile menu toggle
function addMobileMenuToggle() {
    const header = document.querySelector('.header-content');
    if (header && !header.querySelector('.mobile-menu-toggle')) {
        const mobileToggle = document.createElement('button');
        mobileToggle.className = 'mobile-menu-toggle btn btn-primary';
        mobileToggle.innerHTML = '☰';
        mobileToggle.onclick = toggleSidebar;
        header.appendChild(mobileToggle);
    }
}

// Toggle sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (sidebar && mainContent) {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('sidebar-collapsed');
        sidebarCollapsed = !sidebarCollapsed;
        
        console.log('🔄 Sidebar toggled:', sidebarCollapsed ? 'collapsed' : 'expanded');
    }
}

// Show section
function showSection(sectionName) {
    console.log('📄 Cambiando a sección:', sectionName);
    
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    // Show target section
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
        currentSection = sectionName;
        
        // Update page title
        updatePageTitle(sectionName);
        
        // Load section data
        loadSectionData(sectionName);
        
        console.log('✅ Sección mostrada:', sectionName);
    } else {
        console.error('❌ Sección no encontrada:', sectionName);
    }
    
    // Update active nav item
    updateActiveNavItem(sectionName);
    
    // Close mobile sidebar if open
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.remove('mobile-open');
        }
    }
}

// Update page title
function updatePageTitle(sectionName) {
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    
    const titles = {
        'dashboard': { title: 'Dashboard', subtitle: 'Resumen general del taller' },
        'trabajos': { title: 'Gestión de Trabajos', subtitle: 'Administra todos los trabajos del taller' },
        'mecanicos': { title: 'Mecánicos', subtitle: 'Gestiona el equipo de mecánicos' },
        'recepcion': { title: 'Recepción', subtitle: 'Procesa recepciones de vehículos' },
        'cotizaciones': { title: 'Cotizaciones', subtitle: 'Crea y gestiona cotizaciones' },
        'finanzas': { title: 'Finanzas', subtitle: 'Control financiero del taller' },
        'liquidacion': { title: 'Liquidación', subtitle: 'Finaliza y liquida trabajos' },
        'calendario': { title: 'Calendario', subtitle: 'Programa citas y trabajos' },
        'historial': { title: 'Historial', subtitle: 'Historial de servicios' },
        'notificaciones': { title: 'Notificaciones', subtitle: 'Alertas y notificaciones' },
        'reportes': { title: 'Reportes', subtitle: 'Reportes y estadísticas' }
    };
    
    const titleData = titles[sectionName] || titles['dashboard'];
    
    if (pageTitle) pageTitle.textContent = titleData.title;
    if (pageSubtitle) pageSubtitle.textContent = titleData.subtitle;
}

// Update active nav item
function updateActiveNavItem(sectionName) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    // Find and activate the current nav item
    const currentNavItem = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (currentNavItem) {
        currentNavItem.classList.add('active');
    }
}

// Load section data
function loadSectionData(sectionName) {
    console.log('📊 Cargando datos para sección:', sectionName);
    
    // This would typically fetch data from Supabase
    // For now, we'll just log the action
    switch (sectionName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'trabajos':
            loadTrabajosData();
            break;
        case 'mecanicos':
            loadMecanicosData();
            break;
        case 'recepcion':
            loadRecepcionData();
            break;
        case 'cotizaciones':
            loadCotizacionesData();
            break;
        case 'finanzas':
            loadFinanzasData();
            break;
        case 'liquidacion':
            loadLiquidacionData();
            break;
        case 'calendario':
            loadCalendarioData();
            break;
        case 'historial':
            loadHistorialData();
            break;
        case 'notificaciones':
            loadNotificacionesData();
            break;
        case 'reportes':
            loadReportesData();
            break;
        default:
            console.log('No data loading function for section:', sectionName);
    }
}

// Update dashboard with demo data
function updateDashboardData() {
    const data = demoData.dashboard;
    
    // Update metrics
    if (document.getElementById('totalJobs')) {
        document.getElementById('totalJobs').textContent = data.totalJobs;
    }
    if (document.getElementById('completedJobs')) {
        document.getElementById('completedJobs').textContent = data.completedJobs;
    }
    if (document.getElementById('inProgressJobs')) {
        document.getElementById('inProgressJobs').textContent = data.inProgressJobs;
    }
    if (document.getElementById('monthlyRevenue')) {
        document.getElementById('monthlyRevenue').textContent = data.monthlyRevenue;
    }
    
    // Update recent jobs table
    const tbody = document.getElementById('trabajosRecientes');
    if (tbody) {
        tbody.innerHTML = '';
        data.recentJobs.forEach(job => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${job.id}</td>
                <td>${job.cliente}</td>
                <td>${job.vehiculo}</td>
                <td>${job.servicio}</td>
                <td><span class="status-badge status-${job.estado.toLowerCase().replace(' ', '-')}">${job.estado}</span></td>
                <td>${job.fecha}</td>
            `;
            tbody.appendChild(row);
        });
    }
}

// Data loading functions
function loadDashboardData() {
    console.log('📊 Cargando datos del dashboard...');
    updateDashboardData();
}

function loadTrabajosData() {
    console.log('🔧 Cargando datos de trabajos...');
    const data = demoData.trabajos;
    
    // Update metrics in trabajos section
    const totalElement = document.getElementById('trabajosTotal');
    const completadosElement = document.getElementById('trabajosCompletados');
    const enProgresoElement = document.getElementById('trabajosEnProgreso');
    const pendientesElement = document.getElementById('trabajosPendientes');
    
    if (totalElement) totalElement.textContent = data.total;
    if (completadosElement) completadosElement.textContent = data.completed;
    if (enProgresoElement) enProgresoElement.textContent = data.inProgress;
    if (pendientesElement) pendientesElement.textContent = data.pending;
    
    // Update trabajos table
    const tbody = document.getElementById('trabajosTable');
    if (tbody) {
        tbody.innerHTML = '';
        data.list.forEach(trabajo => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${trabajo.id}</td>
                <td>${trabajo.cliente}</td>
                <td>${trabajo.vehiculo}</td>
                <td>${trabajo.servicio}</td>
                <td>${trabajo.mecanico}</td>
                <td><span class="status-badge status-${trabajo.estado.toLowerCase().replace(' ', '-')}">${trabajo.estado}</span></td>
                <td>
                    <button class="btn btn-outline" onclick="verTrabajo('${trabajo.id}')">Ver</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
}

function loadMecanicosData() {
    console.log('👨‍🔧 Cargando datos de mecánicos...');
    const data = demoData.mecanicos;
    
    // Update metrics in mecanicos section
    const totalElement = document.getElementById('mecanicosTotal');
    const activosElement = document.getElementById('mecanicosActivos');
    const experienciaElement = document.getElementById('mecanicosExperiencia');
    
    if (totalElement) totalElement.textContent = data.total;
    if (activosElement) activosElement.textContent = data.active;
    if (experienciaElement) experienciaElement.textContent = data.avgExperience;
    
    // Update mecanicos table
    const tbody = document.getElementById('mecanicosTable');
    if (tbody) {
        tbody.innerHTML = '';
        data.list.forEach(mecanico => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${mecanico.id}</td>
                <td>${mecanico.nombre}</td>
                <td>${mecanico.especialidad}</td>
                <td>${mecanico.experiencia}</td>
                <td><span class="status-badge status-${mecanico.estado.toLowerCase()}">${mecanico.estado}</span></td>
                <td>${mecanico.trabajos}</td>
            `;
            tbody.appendChild(row);
        });
    }
}

function loadRecepcionData() {
    console.log('📋 Cargando datos de recepción...');
    // Add demo data for reception section
    const receptionData = {
        enCola: 25,
        atendidosHoy: 8,
        promedioDiario: 15,
        satisfaccion: '92%'
    };
    
    if (document.getElementById('enCola')) document.getElementById('enCola').textContent = receptionData.enCola;
    if (document.getElementById('atendidosHoy')) document.getElementById('atendidosHoy').textContent = receptionData.atendidosHoy;
    if (document.getElementById('promedioDiario')) document.getElementById('promedioDiario').textContent = receptionData.promedioDiario;
    if (document.getElementById('satisfaccion')) document.getElementById('satisfaccion').textContent = receptionData.satisfaccion;
}

function loadCotizacionesData() {
    console.log('💰 Cargando datos de cotizaciones...');
    // Add demo data for cotizaciones section
    const cotizacionData = {
        activas: 18,
        valorTotal: '$450,000',
        tasaConversion: '75%'
    };
    
    if (document.getElementById('cotizacionesActivas')) document.getElementById('cotizacionesActivas').textContent = cotizacionData.activas;
    if (document.getElementById('valorTotal')) document.getElementById('valorTotal').textContent = cotizacionData.valorTotal;
    if (document.getElementById('tasaConversion')) document.getElementById('tasaConversion').textContent = cotizacionData.tasaConversion;
}

function loadFinanzasData() {
    console.log('💳 Cargando datos de finanzas...');
    // Add demo data for finanzas section
    const finanzasData = {
        ingresos: '$1,250,000',
        gastos: '$875,000',
        ganancia: '$375,000',
        margen: '30%'
    };
    
    if (document.getElementById('ingresosMes')) document.getElementById('ingresosMes').textContent = finanzasData.ingresos;
    if (document.getElementById('gastos')) document.getElementById('gastos').textContent = finanzasData.gastos;
    if (document.getElementById('gananciaNeta')) document.getElementById('gananciaNeta').textContent = finanzasData.ganancia;
    if (document.getElementById('margen')) document.getElementById('margen').textContent = finanzasData.margen;
}

function loadLiquidacionData() {
    console.log('📝 Cargando datos de liquidación...');
    // Add demo data for liquidacion section
    const liquidacionData = {
        paraLiquidar: 8,
        montoTotal: '$650,000',
        diasPromedio: 2.5
    };
    
    if (document.getElementById('paraLiquidar')) document.getElementById('paraLiquidar').textContent = liquidacionData.paraLiquidar;
    if (document.getElementById('montoTotal')) document.getElementById('montoTotal').textContent = liquidacionData.montoTotal;
    if (document.getElementById('diasPromedio')) document.getElementById('diasPromedio').textContent = liquidacionData.diasPromedio;
}

function loadCalendarioData() {
    console.log('📅 Cargando datos del calendario...');
    // Add demo data for calendario section
    const calendarioData = {
        citasHoy: 15,
        completadas: 8,
        pendientes: 5,
        canceladas: 2
    };
    
    if (document.getElementById('citasHoy')) document.getElementById('citasHoy').textContent = calendarioData.citasHoy;
    if (document.getElementById('citasCompletadas')) document.getElementById('citasCompletadas').textContent = calendarioData.completadas;
    if (document.getElementById('citasPendientes')) document.getElementById('citasPendientes').textContent = calendarioData.pendientes;
    if (document.getElementById('citasCanceladas')) document.getElementById('citasCanceladas').textContent = calendarioData.canceladas;
}

function loadHistorialData() {
    console.log('📚 Cargando datos del historial...');
    // Add demo data for historial section
    const historialData = {
        totalServicios: 2847,
        totalClientes: 1245,
        calificacion: 4.8
    };
    
    if (document.getElementById('totalServicios')) document.getElementById('totalServicios').textContent = historialData.totalServicios;
    if (document.getElementById('totalClientes')) document.getElementById('totalClientes').textContent = historialData.totalClientes;
    if (document.getElementById('calificacion')) document.getElementById('calificacion').textContent = historialData.calificacion;
}

function loadNotificacionesData() {
    console.log('🔔 Cargando datos de notificaciones...');
    // Add demo data for notificaciones section
    const notificacionData = {
        urgentes: 3,
        informacion: 7,
        recordatorios: 5
    };
    
    if (document.getElementById('urgentes')) document.getElementById('urgentes').textContent = notificacionData.urgentes;
    if (document.getElementById('informacion')) document.getElementById('informacion').textContent = notificacionData.informacion;
    if (document.getElementById('recordatorios')) document.getElementById('recordatorios').textContent = notificacionData.recordatorios;
}

function loadReportesData() {
    console.log('📈 Cargando datos de reportes...');
    // Add demo data for reportes section
    const reportesData = {
        productividad: '92%',
        satisfaccion: 4.6,
        promedioDiario: '$42,000',
        retencion: '87%'
    };
    
    if (document.getElementById('productividad')) document.getElementById('productividad').textContent = reportesData.productividad;
    if (document.getElementById('satisfaccionReportes')) document.getElementById('satisfaccionReportes').textContent = reportesData.satisfaccion;
    if (document.getElementById('promedioDiarioReportes')) document.getElementById('promedioDiarioReportes').textContent = reportesData.promedioDiario;
    if (document.getElementById('retencion')) document.getElementById('retencion').textContent = reportesData.retencion;
}

// Action functions
function nuevoTrabajo() {
    console.log('➕ Nuevo trabajo');
    
    // Crear modal para nuevo trabajo
    const modal = createModal('Nuevo Trabajo', `
        <form id="nuevoTrabajoForm">
            <div class="form-group">
                <label>Cliente:</label>
                <input type="text" id="cliente" required class="form-control" placeholder="Nombre del cliente">
            </div>
            <div class="form-group">
                <label>Vehículo:</label>
                <input type="text" id="vehiculo" required class="form-control" placeholder="Marca y modelo">
            </div>
            <div class="form-group">
                <label>Servicio:</label>
                <select id="servicio" required class="form-control">
                    <option value="">Seleccionar servicio</option>
                    <option value="Cambio de aceite">Cambio de aceite</option>
                    <option value="Revisión general">Revisión general</option>
                    <option value="Frenos">Frenos</option>
                    <option value="Suspensión">Suspensión</option>
                    <option value="Motor">Motor</option>
                </select>
            </div>
            <div class="form-group">
                <label>Mecánico:</label>
                <select id="mecanico" required class="form-control">
                    <option value="">Seleccionar mecánico</option>
                    <option value="Carlos Rodríguez">Carlos Rodríguez</option>
                    <option value="Ana Martínez">Ana Martínez</option>
                    <option value="Miguel Hernández">Miguel Hernández</option>
                    <option value="Laura Sánchez">Laura Sánchez</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Crear Trabajo</button>
            </div>
        </form>
    `);
    
    // Manejar envío del formulario
    document.getElementById('nuevoTrabajoForm').onsubmit = function(e) {
        e.preventDefault();
        const nuevoTrabajo = {
            id: 'TR-' + String(Date.now()).slice(-3),
            cliente: document.getElementById('cliente').value,
            vehiculo: document.getElementById('vehiculo').value,
            servicio: document.getElementById('servicio').value,
            mecanico: document.getElementById('mecanico').value,
            estado: 'Pendiente'
        };
        
        // Agregar a los datos demo
        demoData.trabajos.list.push(nuevoTrabajo);
        demoData.trabajos.total++;
        demoData.trabajos.pending++;
        
        // Actualizar la vista
        loadTrabajosData();
        showNotification('Trabajo creado exitosamente', 'success');
        closeModal();
    };
}

function verTrabajo(id) {
    console.log('👁️ Ver trabajo:', id);
    
    // Buscar el trabajo
    const trabajo = demoData.trabajos.list.find(t => t.id === id);
    if (!trabajo) {
        showNotification('Trabajo no encontrado', 'error');
        return;
    }
    
    // Crear modal para ver trabajo
    const modal = createModal(`Trabajo ${id}`, `
        <div class="trabajo-detalle">
            <p><strong>Cliente:</strong> ${trabajo.cliente}</p>
            <p><strong>Vehículo:</strong> ${trabajo.vehiculo}</p>
            <p><strong>Servicio:</strong> ${trabajo.servicio}</p>
            <p><strong>Mecánico:</strong> ${trabajo.mecanico}</p>
            <p><strong>Estado:</strong> <span class="status-badge status-${trabajo.estado.toLowerCase().replace(' ', '-')}">${trabajo.estado}</span></p>
        </div>
        <div class="form-actions">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cerrar</button>
            <button type="button" class="btn btn-primary" onclick="editarTrabajo('${id}')">Editar</button>
        </div>
    `);
}

function nuevoMecanico() {
    console.log('➕ Nuevo mecánico');
    showNotification('Función: Agregar Mecánico\nEn la versión completa se abriría un formulario para agregar un mecánico.', 'info');
}

function nuevaRecepcion() {
    console.log('➕ Nueva recepción');
    showNotification('Función: Nueva Recepción\nEn la versión completa se abriría un formulario para registrar un vehículo.', 'info');
}

function nuevaCotizacion() {
    console.log('➕ Nueva cotización');
    showNotification('Función: Nueva Cotización\nEn la versión completa se abriría un formulario para crear una cotización.', 'info');
}

// Función para crear modales
function createModal(title, content) {
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-content">
                ${content}
            </div>
        </div>
    `;
    
    // Agregar estilos del modal
    if (!document.querySelector('.modal-styles')) {
        const style = document.createElement('style');
        style.className = 'modal-styles';
        style.textContent = `
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            .modal {
                background: white;
                border-radius: 12px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
            }
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                border-bottom: 1px solid var(--neutral-400);
            }
            .modal-header h3 {
                margin: 0;
                color: var(--neutral-900);
            }
            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: var(--neutral-600);
            }
            .modal-content {
                padding: 20px;
            }
            .form-group {
                margin-bottom: 15px;
            }
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                color: var(--neutral-900);
            }
            .form-control {
                width: 100%;
                padding: 10px;
                border: 1px solid var(--neutral-400);
                border-radius: 8px;
                font-size: 14px;
            }
            .form-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 20px;
            }
            .trabajo-detalle p {
                margin-bottom: 10px;
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
    return overlay;
}

// Función para cerrar modales
function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

// Logout function
function logout() {
    console.log('👋 Cerrando sesión...');
    
    // Show confirmation
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
        // Here you would typically clear user session
        console.log('✅ Sesión cerrada');
        
        // Redirect to login or reload
        window.location.reload();
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    console.log(`🔔 [${type.toUpperCase()}] ${message}`);
    
    // Create a simple notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? 'var(--error)' : type === 'success' ? 'var(--success)' : 'var(--primary-500)'};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        max-width: 400px;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (document.body.contains(notification)) {
            document.body.removeChild(notification);
        }
    }, 3000);
}

function showLoading(section) {
    console.log(`⏳ Cargando sección: ${section}...`);
}

function hideLoading() {
    console.log('✅ Carga completada');
}

// Error handling
window.addEventListener('error', function(event) {
    console.error('❌ Error en la aplicación:', event.error);
    showNotification('Ha ocurrido un error en la aplicación', 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('❌ Promise rechazada:', event.reason);
    showNotification('Error de conexión o promesa no resuelta', 'error');
});

// Export functions for global access
window.showSection = showSection;
window.toggleSidebar = toggleSidebar;
window.logout = logout;
window.nuevoTrabajo = nuevoTrabajo;
window.verTrabajo = verTrabajo;
window.nuevoMecanico = nuevoMecanico;
window.nuevaRecepcion = nuevaRecepcion;
window.nuevaCotizacion = nuevaCotizacion;
window.closeModal = closeModal;
window.createModal = createModal;
window.editarTrabajo = function(id) {
    showNotification('Función: Editar Trabajo\nEn la versión completa se abriría el formulario de edición.', 'info');
};

console.log('🎉 JavaScript cargado completamente');
console.log('✅ Sistema de archivos separados funcionando perfectamente');
console.log('📁 Con rutas correctas para GitHub');
console.log('🚀 ¡Listo para usar!');
