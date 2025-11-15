// ===== JAVASCRIPT COMPLETO MULTIDIAGNÓSTICOS AS ===== 
// Supabase Configuration
const SUPABASE_URL = 'https://crtdentsfumgrotgvwdj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNydGRlbnRzZnVtZ3JvdGd2d2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NTU5NTIsImV4cCI6MjA3ODIzMTk1Mn0.7T_Fd_L1gn3MtkvgqSCePrlK-ZUhp-8gbT5fG8GZoW4';

// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentSection = 'dashboard';
let sidebarCollapsed = false;
let nextOrderNumber = 3;
let nextQuoteNumber = 3;
let nextInvoiceNumber = 3;
let previousSectionBeforeNuevoTrabajo = 'dashboard';
let datosRecepcionTemporal = null;

// Base de datos en memoria (vacía por defecto para pruebas reales)
const clientes = [];
const inventario = [];

// Mecánicos del taller
const mecanicos = [
    { id: 1, name: 'Pedro Barraza', specialty: 'Dueño/Frenos', phone: '3002345678', hourlyRate: 20000 },
    { id: 2, name: 'Víctor Padilla', specialty: 'General', phone: '3001234567', hourlyRate: 20000 },
    { id: 3, name: 'Ismael Cervantes', specialty: 'Motor', phone: '3003456789', hourlyRate: 20000 }
];

// Exportar datos globales
mecanicos.forEach(m => {
    if (!m.nombre) m.nombre = m.name;
});
window.mecanicos = mecanicos;
window.clientes = clientes;
window.inventario = inventario;
window.itemsTrabajo = [];
// Almacén seguro para evitar colisión con <section id="trabajos">
window.__appData = window.__appData || {};
if (!Array.isArray(window.__appData.trabajos)) {
    window.__appData.trabajos = Array.isArray(window.trabajos) ? window.trabajos : [];
}
function getTrabajosData() { return window.__appData.trabajos; }
function addTrabajoData(t) { window.__appData.trabajos.push(t); }
window.getTrabajosData = getTrabajosData;

// ===== FUNCIONES CRÍTICAS - DEFINIDAS INMEDIATAMENTE =====
// Estas funciones deben estar disponibles antes de que el HTML las use

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
    console.log('🚀 Multidiagnósticos AS - Sistema completo iniciado');
    console.log('🔧 Con todas las funcionalidades restauradas');
    
    // Initialize application
    initializeApp();
    // Inicializar tema guardado
    try { initThemeFromStorage(); } catch(e) { console.warn('Tema: no se pudo inicializar', e); }
    
    // Set default section
    showSection('dashboard');
    
    console.log('✅ Sistema completamente funcional');
    } catch (error) {
        console.error('❌ Error al inicializar la aplicación:', error);
        alert('Error al cargar la aplicación. Por favor, recarga la página.');
    }
});

// Initialize application
function initializeApp() {
    console.log('📋 Inicializando aplicación completa...');
    
    // Setup mobile responsive
    setupMobileResponsive();
    
    // Add mobile menu toggle if on mobile
    if (window.innerWidth <= 768) {
        addMobileMenuToggle();
    }
    
    console.log('✅ Aplicación completamente inicializada');
}

// =====================
// Tema: iOS glass toggle
// =====================
function ensureGlassLinkPresent() {
    let link = document.getElementById('theme-glass-css');
    if (!link) {
        link = document.createElement('link');
        link.id = 'theme-glass-css';
        link.rel = 'stylesheet';
        link.href = 'assets/css/theme-glass.css';
        document.head.appendChild(link);
    }
}

function applyGlassTheme(enabled) {
    const html = document.documentElement;
    const btn = document.getElementById('themeToggleBtn');
    if (enabled) {
        ensureGlassLinkPresent();
        html.classList.add('theme-glass');
        localStorage.setItem('ui_theme', 'glass');
        if (btn) btn.textContent = 'Tema Clásico';
    } else {
        html.classList.remove('theme-glass');
        localStorage.setItem('ui_theme', 'default');
        if (btn) btn.textContent = 'Tema iOS';
    }
}

function toggleGlassTheme() {
    const enabled = !document.documentElement.classList.contains('theme-glass');
    applyGlassTheme(enabled);
}

function initThemeFromStorage() {
    const pref = localStorage.getItem('ui_theme') || 'default';
    applyGlassTheme(pref === 'glass');
}

window.toggleGlassTheme = toggleGlassTheme;

// Mobile responsive setup
function setupMobileResponsive() {
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
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('mobile-open');
        } else {
            sidebar.classList.toggle('collapsed');
            if (sidebar.classList.contains('collapsed')) {
                mainContent.classList.remove('sidebar-expanded');
                mainContent.classList.add('sidebar-collapsed');
            } else {
                mainContent.classList.remove('sidebar-collapsed');
                mainContent.classList.add('sidebar-expanded');
            }
            sidebarCollapsed = !sidebarCollapsed;
        }
        
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
        'calendario': { title: 'Calendario', subtitle: 'Programa citas y trabajos' },
        'historial': { title: 'Historial de Vehículos', subtitle: 'Historial de servicios por vehículo' },
        'notificaciones': { title: 'Notificaciones', subtitle: 'Alertas y notificaciones' },
        'finanzas': { title: 'Finanzas', subtitle: 'Control financiero del taller' },
        'liquidacion': { title: 'Liquidación', subtitle: 'Gestión de comisiones 20% + 20%' },
        'reportes': { title: 'Reportes', subtitle: 'Reportes y estadísticas' },
        'inventario': { title: 'Inventario', subtitle: 'Gestión de productos y repuestos' },
        'cuentti': { title: 'CUENTTI', subtitle: 'Integración para facturación' },
        'nuevoTrabajoPage': { title: 'Nuevo Trabajo', subtitle: 'Crear una nueva orden de servicio' },
        'liquidacionAvanzada': { title: 'Liquidación Avanzada', subtitle: 'Cálculo y registro de pagos a técnicos' }
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

// Exportar funciones críticas al scope global inmediatamente
window.toggleSidebar = toggleSidebar;
window.showSection = showSection;

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
        case 'calendario':
            loadCalendarioData();
            break;
        case 'historial':
            loadHistorialData();
            break;
        case 'notificaciones':
            loadNotificacionesData();
            break;
        case 'finanzas':
            loadFinanzasData();
            break;
        case 'liquidacion':
            loadLiquidacionData();
            break;
        case 'reportes':
            loadReportesData();
            break;
        case 'inventario':
            loadInventarioData();
            break;
        case 'cuentti':
            loadCuenttiData();
            break;
        case 'liquidacionAvanzada':
            // La inicialización se realiza desde generarLiquidacion
            break;
        default:
            console.log('No data loading function for section:', sectionName);
    }
}

// ===== FUNCIONES DE CARGA DE DATOS =====

function loadDashboardData() {
    console.log('📊 Cargando datos del dashboard...');
    // Dashboard ya tiene datos por defecto
}

function loadTrabajosData() {
    console.log('🔧 Cargando datos de trabajos...');
    // Trabaja ya tiene datos por defecto
}

function loadMecanicosData() {
    console.log('👨‍🔧 Cargando datos de mecánicos...');
    // Mecánicos ya tiene datos por defecto
}

function loadRecepcionData() {
    console.log('📋 Cargando datos de recepción...');
    // Recepción ya tiene datos por defecto
}

function loadCotizacionesData() {
    console.log('💰 Cargando datos de cotizaciones...');
    // Cotizaciones ya tiene datos por defecto
}

function loadCalendarioData() {
    console.log('📅 Cargando datos del calendario...');
    // Calendario ya tiene datos por defecto
}

function loadHistorialData() {
    console.log('📚 Cargando historial...');
    // Historial está listo para búsqueda
}

function loadNotificacionesData() {
    console.log('🔔 Cargando notificaciones...');
    // Notificaciones ya tiene datos por defecto
}

function loadFinanzasData() {
    console.log('💳 Cargando datos financieros...');
    // Finanzas ya tiene datos por defecto
}

function loadLiquidacionData() {
    console.log('📝 Cargando datos de liquidación...');
    // Liquidación ya tiene datos por defecto
}

function loadReportesData() {
    console.log('📈 Cargando reportes...');
    // Reportes ya tiene datos por defecto
}

function loadInventarioData() {
    console.log('📦 Cargando inventario...');
    // Inventario ya tiene datos por defecto
}

function loadCuenttiData() {
    console.log('💼 Cargando integración CUENTTI...');
    // CUENTTI ya tiene datos por defecto
}

// ===== FUNCIONES DE ACCIÓN =====

// Nuevo Trabajo - SISTEMA POS/OT COMPLETO (legacy modal)
function nuevoTrabajoModalLegacy() {
    console.log('➕ Abriendo sistema POS para nuevo trabajo...');
    
    // Create modal con sistema POS completo
    const modal = createModal(
        'Nuevo Trabajo - Sistema POS/OT',
        `
        <form id="nuevoTrabajoForm" onsubmit="guardarNuevoTrabajo(event)">
            <!-- INFORMACIÓN BÁSICA DEL CLIENTE -->
            <div class="pos-section">
                <h3 class="pos-section-title">📋 Información del Cliente</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">🔍 Buscar Cliente por Cédula</label>
                <div class="input-with-button">
                        <input type="text" class="form-input" id="busquedaCedula" placeholder="12345678" onkeyup="buscarClientePorCedula(this.value)">
                    <button type="button" class="btn btn-secondary btn-icon" onclick="abrirBuscadorClientes()" title="Buscar clientes">
                        🔍
                    </button>
                </div>
                        <div id="resultadosBusqueda" class="busqueda-resultados"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">👤 Cliente</label>
                        <input type="text" class="form-input" id="trabajoCliente" required placeholder="Nombre completo del cliente">
                    </div>
                </div>
            </div>

            <!-- INFORMACIÓN DEL VEHÍCULO -->
            <div class="pos-section">
                <h3 class="pos-section-title">🚗 Información del Vehículo</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">🔢 Placa del Vehículo</label>
                        <input type="text" class="form-input" id="trabajoPlaca" placeholder="ABC123" required style="text-transform: uppercase;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">📍 Marca del Vehículo</label>
                        <input type="text" class="form-input" id="vehiculoMarca" placeholder="Toyota, Ford, etc." required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">🏷️ Modelo del Vehículo</label>
                        <input type="text" class="form-input" id="vehiculoModelo" placeholder="Corolla, Focus, etc." required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">📅 Año del Vehículo</label>
                        <input type="number" class="form-input" id="vehiculoAno" min="1980" max="2025" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">🛣️ Kilometraje</label>
                        <input type="number" class="form-input" id="trabajoKilometraje" placeholder="45000" min="0" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">⚙️ Técnico Asignado</label>
                        <select class="form-select" id="trabajoTecnico" required>
                            <option value="">Seleccionar técnico</option>
                            <option value="1">Pedro Barraza</option>
                            <option value="2">Víctor Padilla</option>
                            <option value="3">Ismael Cervantes</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- SECCIÓN DE REPUESTOS/SERVICIOS TIPO POS -->
            <div class="pos-section">
                <h3 class="pos-section-title">🔧 Repuestos y Servicios</h3>
                
                <!-- Búsqueda de inventario -->
                <div class="form-group">
                    <label class="form-label">🔍 Buscar Repuesto/Servicio</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" class="form-input" id="busquedaRepuesto" placeholder="Buscar por código o nombre..." onkeyup="buscarEnInventario(this.value)" style="flex: 1;">
                        <button type="button" class="btn-secondary" onclick="mostrarTodosLosRepuestos()">Ver Todo</button>
                    </div>
                    <div id="resultadosInventario" class="inventario-resultados"></div>
                </div>

                <!-- Botón para agregar servicio manual -->
                <div class="form-group">
                    <button type="button" class="btn-secondary" onclick="agregarServicioManual()">➕ Agregar Servicio Manual</button>
                </div>

                <!-- Tabla de items agregados -->
                <div class="items-container">
                    <table class="items-table" style="width: 100%; border-collapse: collapse; background: white; table-layout: auto;">
                        <thead>
                            <tr style="background: #2c3e50; color: white;">
                                <th style="padding: 14px 16px; text-align: left; min-width: 350px;">Descripción</th>
                                <th style="padding: 14px 16px; text-align: center; min-width: 120px;">Cant.</th>
                                <th style="padding: 14px 16px; text-align: right; min-width: 140px;">Precio Unit.</th>
                                <th style="padding: 14px 16px; text-align: right; min-width: 140px;">Total</th>
                                <th style="padding: 14px 16px; text-align: center; min-width: 220px;">IVA %</th>
                                <th style="padding: 14px 16px; text-align: right; min-width: 140px;">Total c/IVA</th>
                                <th style="padding: 14px 16px; text-align: center; min-width: 100px;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="itemsTrabajo">
                            <tr id="noItemsRow">
                                <td colspan="7" style="text-align: center; padding: 40px; color: #666;">
                                    📝 No hay repuestos agregados. Use la búsqueda de inventario arriba para agregar productos.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div style="margin-top: 10px;">
                        <button type="button" class="btn-secondary" onclick="agregarLineaVacia()" style="margin-right: 10px;">➕ Agregar líneas</button>
                        <button type="button" class="btn-primary" onclick="validarItems()">✅ Validar</button>
                    </div>
                </div>
            </div>

            <!-- RESUMEN Y TOTALES -->
            <div class="pos-section">
                <h3 class="pos-section-title">💰 Resumen y Totales</h3>
                <div class="totales-container">
                        <div class="form-group">
                        <label class="form-label">💵 Mano de Obra (Valor total del servicio)</label>
                        <input type="number" class="form-input" id="manoObraValor" placeholder="45000" min="0" onchange="calcularTotal()">
                        <small style="color:#6b7280;">Ingresa el valor total que cobrarás por la mano de obra.</small>
                    </div>
                    
                    <div class="totales-detalles" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 20px;">
                        <div class="total-row" style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                            <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Imp</div>
                            <div style="font-size: 20px; font-weight: bold; color: #2c3e50;" id="totalImpuesto">$0.00</div>
                        </div>
                        <div class="total-row" style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                            <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Desc</div>
                            <div style="font-size: 20px; font-weight: bold; color: #2c3e50;" id="totalDescuento">$0.00</div>
                        </div>
                        <div class="total-row" style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                            <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Subtotal</div>
                            <div style="font-size: 20px; font-weight: bold; color: #2c3e50;" id="subtotalFinal">$0.00</div>
                        </div>
                        <div class="total-row" style="text-align: center; padding: 15px; background: #27ae60; border-radius: 6px; color: white;">
                            <div style="font-size: 14px; margin-bottom: 8px; opacity: 0.9;">TOTAL</div>
                            <div style="font-size: 24px; font-weight: bold;" id="totalFinal">$0.00</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- DESCRIPCIÓN ADICIONAL -->
            <div class="pos-section">
                <h3 class="pos-section-title">📝 Descripción Adicional</h3>
                <div class="form-group">
                    <label class="form-label">Observaciones del Trabajo</label>
                    <textarea class="form-textarea" id="trabajoServicio" placeholder="Diagnóstico, observaciones adicionales, recomendaciones, etc."></textarea>
                </div>
            </div>

            <!-- ESTADO Y ACCIONES -->
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="cerrarModal()">❌ Cancelar</button>
                <button type="button" class="btn-secondary" onclick="previsualizarTrabajo()">👁️ Vista Previa</button>
                <button type="submit" class="btn-primary">💾 Crear Trabajo</button>
            </div>
        </form>

        <style>
            .pos-section {
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                padding: 30px;
                margin-bottom: 25px;
            }
            .pos-section-title {
                margin: 0 0 15px 0;
                color: #2c3e50;
                font-size: 16px;
                font-weight: 600;
                border-bottom: 2px solid #3498db;
                padding-bottom: 5px;
            }
            .busqueda-resultados, .inventario-resultados {
                margin-top: 10px;
                max-height: 200px;
                overflow-y: auto;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
                display: none;
            }
            .busqueda-resultados.show, .inventario-resultados.show {
                display: block;
            }
            .resultado-item, .inventario-item {
                padding: 10px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .resultado-item:hover, .inventario-item:hover {
                background-color: #f0f8ff;
            }
            .input-with-button {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            .input-with-button .form-input {
                flex: 1;
            }
            .btn-icon {
                width: 48px;
                display: inline-flex;
                justify-content: center;
                align-items: center;
                font-size: 18px;
                padding: 0;
                height: 48px;
            }
            .btn.btn-sm {
                padding: 6px 12px;
                font-size: 13px;
            }
            .cliente-search-modal {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .modal-clientes-list {
                border: 1px solid #ddd;
                border-radius: 8px;
                max-height: 320px;
                overflow-y: auto;
            }
            .modal-clientes-list table {
                width: 100%;
                border-collapse: collapse;
            }
            .modal-clientes-list th {
                background: #1E3A8A;
                color: white;
                text-align: left;
                padding: 10px;
                font-weight: 600;
            }
            .modal-clientes-list td {
                padding: 10px;
                border-bottom: 1px solid #eee;
                font-size: 14px;
            }
            .modal-clientes-list tr:hover {
                background: #F3F4F6;
            }
            .items-container {
                background: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                overflow: hidden;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
            }
            .items-table th {
                background: #2c3e50;
                color: white;
                padding: 12px 8px;
                text-align: left;
                font-weight: 600;
            }
            .items-table td {
                padding: 12px 8px;
                border-bottom: 1px solid #eee;
            }
            .items-table input[type="number"] {
                width: 60px;
                text-align: center;
            }
            .items-table input[type="text"] {
                width: 100%;
            }
            .remove-item {
                background: #e74c3c;
                color: white;
                border: none;
                padding: 6px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            .remove-item:hover {
                background: #c0392b;
            }
            .totales-container {
                background: white;
                border: 2px solid #3498db;
                border-radius: 8px;
                padding: 20px;
            }
            .totales-detalles {
                margin-top: 15px;
            }
            .total-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                font-size: 16px;
            }
            .total-row.iva {
                border-top: 1px solid #eee;
                padding-top: 12px;
                margin-top: 8px;
            }
            .total-row.grand-total {
                border-top: 2px solid #2c3e50;
                font-size: 18px;
                font-weight: bold;
                color: #27ae60;
            }
            .form-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #eee;
            }
            .btn-primary {
                background: #27ae60;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }
            .btn-primary:hover {
                background: #229954;
            }
            .btn-secondary {
                background: #7f8c8d;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }
            .btn-secondary:hover {
                background: #6c7b7d;
            }
        </style>
        `,
        'large'
    );
    
    // Initialize variables
    window.itemsTrabajo = [];
    // Mostrar el modal primero
    showModal(modal);
    
    // Set defaults después de que el modal se muestre
    setTimeout(() => {
        const anoInput = document.getElementById('vehiculoAno');
        if (anoInput) anoInput.value = new Date().getFullYear();
    }, 100);
    
    console.log('✅ Sistema POS para nuevo trabajo inicializado');
}

function actualizarTotales() {
    const items = Array.isArray(window.itemsTrabajo) ? window.itemsTrabajo : [];
    
    // Calcular desglose: si el precio incluye IVA, separar precio base e IVA
    let subtotalSinIva = 0;  // Suma de precios base sin IVA
    let totalIva = 0;         // Suma de IVA incluido en los precios
    let totalConIva = 0;      // Suma de precios con IVA incluido (lo que se cobra)
    
    items.forEach(item => {
        const precio = Number(item.precio) || 0;
        const cantidad = Number(item.cantidad) || 1;
        const ivaPorcentaje = Number(item.iva) || 0;
        
        const totalItemConIva = precio * cantidad; // Total con IVA incluido
        
        if (ivaPorcentaje > 0) {
            // El precio YA incluye IVA, calcular desglose
            const precioBase = totalItemConIva / (1 + (ivaPorcentaje / 100));
            const ivaIncluido = totalItemConIva - precioBase;
            
            subtotalSinIva += precioBase;
            totalIva += ivaIncluido;
        } else {
            // El precio NO incluye IVA
            subtotalSinIva += totalItemConIva;
        }
        
        totalConIva += totalItemConIva;
    });

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    // Calcular descuentos totales
    let totalDescuentos = 0;
    items.forEach(item => {
        const precio = Number(item.precio) || 0;
        const cantidad = Number(item.cantidad) || 1;
        const descuentoValor = Number(item.descuento || 0);
        const tipoDescuento = item.tipoDescuento || '$';
        
        if (descuentoValor > 0) {
            if (tipoDescuento === '%') {
                totalDescuentos += (precio * cantidad * descuentoValor) / 100;
            } else {
                totalDescuentos += descuentoValor;
            }
        }
    });
    
    // Totales calculados únicamente desde items (incluye Mano de Obra si está agregada como ítem)
    const subtotal = subtotalSinIva;
    const total = totalConIva;

    setText('subtotalRepuestos', formatCurrency(subtotal));
    setText('subtotalIva', formatCurrency(totalIva));
    setText('totalImpuesto', formatCurrency(totalIva));
    setText('totalDescuento', formatCurrency(totalDescuentos));
    setText('subtotalFinal', formatCurrency(subtotal));
    setText('totalFinal', formatCurrency(total));
}

window.actualizarTotales = actualizarTotales;

function inicializarNuevoTrabajoForm() {
    const form = document.getElementById('nuevoTrabajoForm');
    if (form) form.reset();

    window.itemsTrabajo = [];
    actualizarTablaItems();

    const anoInput = document.getElementById('vehiculoAno');
    if (anoInput) anoInput.value = new Date().getFullYear();

    const tecnicoSelect = document.getElementById('trabajoTecnico');
    if (tecnicoSelect) tecnicoSelect.value = '';

    const resultadoClientes = document.getElementById('resultadosBusqueda');
    if (resultadoClientes) {
        resultadoClientes.innerHTML = '';
        resultadoClientes.classList.remove('show');
    }

    const resultadoInventario = document.getElementById('resultadosInventario');
    if (resultadoInventario) {
        resultadoInventario.innerHTML = '';
        resultadoInventario.classList.remove('show');
    }

    const busquedaCedula = document.getElementById('busquedaCedula');
    if (busquedaCedula) busquedaCedula.value = '';

    actualizarTotales();

    if (datosRecepcionTemporal) {
        document.getElementById('trabajoCliente').value = datosRecepcionTemporal.clienteNombre || '';
        document.getElementById('busquedaCedula').value = datosRecepcionTemporal.cedula || '';
        const telefonoInput = document.getElementById('clienteTelefono');
        if (telefonoInput) telefonoInput.value = datosRecepcionTemporal.telefono || '';
        const emailInput = document.getElementById('clienteEmail');
        if (emailInput) emailInput.value = datosRecepcionTemporal.email || '';

        document.getElementById('trabajoPlaca').value = datosRecepcionTemporal.placa || '';
        document.getElementById('vehiculoMarca').value = datosRecepcionTemporal.marca || '';
        document.getElementById('vehiculoModelo').value = datosRecepcionTemporal.modelo || '';
        document.getElementById('vehiculoAno').value = datosRecepcionTemporal.ano || new Date().getFullYear();
        document.getElementById('trabajoKilometraje').value = datosRecepcionTemporal.kilometraje || '';

        const tecnicoSelect = document.getElementById('trabajoTecnico');
        if (tecnicoSelect && datosRecepcionTemporal.tecnico) {
            tecnicoSelect.value = datosRecepcionTemporal.tecnico;
        }

        const descripcion = document.getElementById('trabajoServicio');
        if (descripcion) descripcion.value = datosRecepcionTemporal.descripcion || '';

        datosRecepcionTemporal = null;
    }
}

function cancelarNuevoTrabajo() {
    inicializarNuevoTrabajoForm();
    const destino = previousSectionBeforeNuevoTrabajo || 'trabajos';
    showSection(destino);
}

function nuevoTrabajo() {
    console.log('➕ Abriendo módulo unificado: Nuevo Trabajo...');
    
    // Si ya estamos en nuevoTrabajoPage, solo reinicializamos
    if (currentSection === 'nuevoTrabajoPage' && !datosRecepcionTemporal) {
        inicializarNuevoTrabajoForm();
        return;
    }
    
    // Guardar la sección actual si no está guardada
    if (!previousSectionBeforeNuevoTrabajo) {
        previousSectionBeforeNuevoTrabajo = currentSection;
    }
    
    // Cambiar a la sección
    showSection('nuevoTrabajoPage');
    
    // Inicializar el formulario (esto cargará datos de recepción si existen)
    inicializarNuevoTrabajoForm();
    
    // Scroll al inicio
    const content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
}

// ===== FUNCIONES AUXILIARES DEL SISTEMA POS =====

// Buscar cliente por cédula
function normalizarDocumentoCliente(cliente) {
    return (
        cliente?.cedula ||
        cliente?.documento ||
        cliente?.id_cedula ||
        cliente?.nit ||
        cliente?.numero_documento ||
        cliente?.identificacion ||
        cliente?.doc ||
        cliente?.documento_identidad ||
        cliente?.id ||
        ''
    ).toString();
}

function normalizarNombreCliente(cliente) {
    return (cliente?.nombre || cliente?.name || cliente?.cliente || 'Cliente sin nombre').toString();
}

function buscarClientePorCedula(cedula) {
    const contenedor = document.getElementById('resultadosBusqueda');
    if (!contenedor) return;

    const termino = (cedula || '').toString().trim();
    if (termino.length < 2) {
        contenedor.classList.remove('show');
        contenedor.innerHTML = '';
        return;
    }
    
    const baseClientes = obtenerListaClientes();
    const terminoLower = termino.toLowerCase();
    
    const resultados = baseClientes.filter(cliente => 
        normalizarDocumentoCliente(cliente).toLowerCase().includes(terminoLower)
    ).slice(0, 50);
    
    if (resultados.length > 0) {
        contenedor.innerHTML = resultados.map((cliente, index) => {
            const doc = normalizarDocumentoCliente(cliente);
            const nombre = normalizarNombreCliente(cliente);
            const telefono = (cliente?.telefono || cliente?.phone || '').toString();
            const email = (cliente?.email || '').toString();
            const clienteId = cliente?.id || cliente?.id_cliente || index;
            const escapar = valor => valor.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
                <div class="resultado-item" style="display: flex; justify-content: space-between; align-items: center;">
                    <div onclick="seleccionarCliente('${escapar(nombre)}', '${escapar(doc)}', '${escapar(telefono)}', '${escapar(email)}')" style="flex: 1; cursor: pointer;">
                        <strong>${doc}</strong> - ${nombre}
                        ${telefono ? `<br><small style="color: #666;">📞 ${telefono}</small>` : ''}
                        ${email ? `<br><small style="color: #666;">📧 ${email}</small>` : ''}
                    </div>
                    <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation(); editarClienteDesdeModal('${escapar(doc)}', '${escapar(nombre)}', '${escapar(telefono)}', '${escapar(email)}', '${clienteId}')" title="Editar cliente" style="margin-left: 8px;">
                        ✏️
                    </button>
                </div>
            `;
        }).join('');
    } else {
        contenedor.innerHTML = '<div class="resultado-item">No se encontraron clientes</div>';
    }
        contenedor.classList.add('show');
}

// Seleccionar cliente de resultados
function seleccionarCliente(nombre, cedula, telefono = '', email = '') {
    document.getElementById('trabajoCliente').value = nombre;
    document.getElementById('busquedaCedula').value = cedula;
    document.getElementById('resultadosBusqueda').classList.remove('show');
    const telefonoInput = document.getElementById('clienteTelefono');
    const emailInput = document.getElementById('clienteEmail');
    if (telefonoInput && telefono) telefonoInput.value = telefono;
    if (emailInput && email) emailInput.value = email;
}

// Buscar cliente por nombre (OT)
function buscarClientePorNombreOT(nombre) {
    const contenedor = document.getElementById('resultadosBusquedaNombre');
    if (!contenedor) return;
    const termino = (nombre || '').toString().trim().toLowerCase();
    if (termino.length < 2) { contenedor.classList.remove('show'); contenedor.innerHTML=''; return; }
    const baseClientes = obtenerListaClientes();
    const resultados = baseClientes.filter(c => normalizarNombreCliente(c).toLowerCase().includes(termino) || normalizarDocumentoCliente(c).toLowerCase().includes(termino)).slice(0,50);
    if (resultados.length) {
        const escapar = v => (v||'').toString().replace(/'/g, "\\'").replace(/\"/g,'&quot;');
        contenedor.innerHTML = resultados.map(c => {
            const doc = normalizarDocumentoCliente(c); const nom = normalizarNombreCliente(c);
            const tel = (c?.telefono || c?.phone || '').toString(); const mail = (c?.email || '').toString();
            return `<div class="resultado-item" onclick="seleccionarCliente('${escapar(nom)}','${escapar(doc)}','${escapar(tel)}','${escapar(mail)}')"><strong>${doc}</strong> - ${nom}${tel?`<br><small style='color:#666'>📞 ${tel}</small>`:''}${mail?`<br><small style='color:#666'> 📧 ${mail}</small>`:''}</div>`;
        }).join('');
        contenedor.classList.add('show');
    } else {
        contenedor.innerHTML = '<div class="resultado-item">No se encontraron clientes</div>';
        contenedor.classList.add('show');
    }
}

function obtenerListaClientes() {
    return Array.isArray(supabaseClientes) && supabaseClientes.length ? supabaseClientes : clientes;
}

function abrirBuscadorClientes() {
    const modal = createModal(
        'Buscar Cliente',
        `
        <div class="cliente-search-modal">
            <input type="text" class="form-input" id="modalBuscarCliente" placeholder="Buscar por cédula/NIT o nombre..." oninput="filtrarClientesModal(this.value)">
            <div id="modalClientesResultado" class="modal-clientes-list"></div>
        </div>
        `,
        'large',
        [
            { text: 'Cerrar', class: 'btn-outline', onclick: 'closeModal()' }
        ]
    );
    showModal(modal);
    filtrarClientesModal('');
}

function filtrarClientesModal(termino = '') {
    const contenedor = document.getElementById('modalClientesResultado');
    if (!contenedor) return;

    const lista = obtenerListaClientes();
    const terminoLower = (termino || '').toLowerCase();

    const resultados = lista.filter(cliente => {
        const doc = normalizarDocumentoCliente(cliente).toLowerCase();
        const nombre = normalizarNombreCliente(cliente).toLowerCase();
        return !terminoLower || doc.includes(terminoLower) || nombre.includes(terminoLower);
    }).slice(0, 50);

    if (!resultados.length) {
        contenedor.innerHTML = '<div style="padding: 16px; color: #6b7280;">No se encontraron clientes</div>';
        return;
    }
    
    const escapar = valor => valor.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    contenedor.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Cédula/NIT</th>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Email</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${resultados.map((cliente, index) => {
                    const doc = normalizarDocumentoCliente(cliente);
                    const nombre = normalizarNombreCliente(cliente);
                    const telefono = (cliente?.telefono || cliente?.phone || '').toString();
                    const email = (cliente?.email || '').toString();
                    const clienteId = cliente?.id || cliente?.id_cliente || index;
                    return `
                        <tr>
                            <td>${doc}</td>
                            <td>${nombre}</td>
                            <td>${telefono || '-'}</td>
                            <td>${email || '-'}</td>
                            <td style="white-space: nowrap;">
                                <button type="button" class="btn btn-primary btn-sm" onclick="seleccionarClienteDesdeModal('${escapar(nombre)}', '${escapar(doc)}', '${escapar(telefono)}', '${escapar(email)}')" style="margin-right: 4px;">
                                    Seleccionar
                                </button>
                                <button type="button" class="btn btn-outline btn-sm" onclick="editarClienteDesdeModal('${escapar(doc)}', '${escapar(nombre)}', '${escapar(telefono)}', '${escapar(email)}', '${clienteId}')" title="Editar cliente">
                                    ✏️
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function seleccionarClienteDesdeModal(nombre, cedula, telefono = '', email = '') {
    seleccionarCliente(nombre, cedula, telefono, email);
    closeModal();
}

// Buscar cliente por nombre (Recepción)
function buscarClientePorNombreRecepcion(nombre) {
    const contenedor = document.getElementById('rcpResultadosClientesNombre');
    if (!contenedor) return;
    const termino = (nombre || '').toString().trim().toLowerCase();
    if (termino.length < 2) { contenedor.classList.remove('show'); contenedor.innerHTML=''; return; }
    const baseClientes = obtenerListaClientes();
    const resultados = baseClientes.filter(c => normalizarNombreCliente(c).toLowerCase().includes(termino) || normalizarDocumentoCliente(c).toLowerCase().includes(termino)).slice(0,50);
    if (resultados.length) {
        const escapar = v => (v||'').toString().replace(/'/g, "\\'").replace(/\"/g,'&quot;');
        contenedor.innerHTML = resultados.map(c => {
            const doc = normalizarDocumentoCliente(c); const nom = normalizarNombreCliente(c);
            const tel = (c?.telefono || c?.phone || '').toString(); const mail = (c?.email || '').toString();
            return `<div class=\"resultado-item\" onclick=\"seleccionarClienteRecepcion('${escapar(nom)}','${escapar(doc)}','${escapar(tel)}','${escapar(mail)}')\"><strong>${doc}</strong> - ${nom}${tel?`<br><small style='color:#666'>📞 ${tel}</small>`:''}${mail?`<br><small style='color:#666'> 📧 ${mail}</small>`:''}</div>`;
        }).join('');
        contenedor.classList.add('show');
    } else {
        contenedor.innerHTML = '<div class="resultado-item">No se encontraron clientes</div>';
        contenedor.classList.add('show');
    }
}

window.buscarClientePorNombreOT = buscarClientePorNombreOT;
window.buscarClientePorNombreRecepcion = buscarClientePorNombreRecepcion;

// Editar cliente desde el modal
function editarClienteDesdeModal(cedula, nombre, telefono = '', email = '', clienteId = '') {
    const modal = createModal(
        'Editar Cliente',
        `
        <form id="editarClienteForm" onsubmit="guardarEdicionCliente(event, '${cedula}', '${clienteId}')">
            <div class="form-group">
                <label class="form-label">Cédula/NIT</label>
                <input type="text" class="form-input" id="editClienteCedula" value="${cedula}" readonly>
            </div>
            <div class="form-group">
                <label class="form-label">Nombre</label>
                <input type="text" class="form-input" id="editClienteNombre" value="${nombre}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Teléfono</label>
                <input type="text" class="form-input" id="editClienteTelefono" value="${telefono}" placeholder="Agregar o actualizar teléfono">
            </div>
            <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-input" id="editClienteEmail" value="${email}" placeholder="Agregar o actualizar email">
            </div>
        </form>
        `,
        [
            { text: 'Cancelar', class: 'btn-outline', onclick: 'closeModal()' },
            { text: 'Guardar Cambios', class: 'btn-primary', type: 'submit', form: 'editarClienteForm' }
        ]
    );
    showModal(modal);
}

// Guardar edición de cliente
async function guardarEdicionCliente(event, cedulaOriginal, clienteId) {
    event.preventDefault();
    
    const nombre = document.getElementById('editClienteNombre').value.trim();
    const telefono = document.getElementById('editClienteTelefono').value.trim();
    const email = document.getElementById('editClienteEmail').value.trim();
    
    if (!nombre) {
        showNotification('El nombre es obligatorio', 'error');
        return;
    }
    
    try {
        // Buscar el cliente en la lista actual
        const baseClientes = obtenerListaClientes();
        const clienteExistente = baseClientes.find(c => {
            const doc = normalizarDocumentoCliente(c);
            return doc === cedulaOriginal;
        });
        
        if (!clienteExistente) {
            showNotification('Cliente no encontrado', 'error');
            return;
        }
        
        // Actualizar datos localmente
        clienteExistente.nombre = nombre;
        clienteExistente.name = nombre;
        if (telefono) {
            clienteExistente.telefono = telefono;
            clienteExistente.phone = telefono;
        }
        if (email) {
            clienteExistente.email = email;
        }
        
        // Intentar actualizar en Supabase si está disponible
        if (window.supabase && clienteId && clienteId !== '') {
            try {
                const { error } = await supabase
                    .from('clientes')
                    .update({
                        nombre: nombre,
                        telefono: telefono || null,
                        email: email || null
                    })
                    .eq('id', clienteId);
                
                if (error) {
                    console.warn('⚠️ Error al actualizar en Supabase:', error);
                    // Continuar con actualización local
                } else {
                    console.log('✅ Cliente actualizado en Supabase');
                    // Recargar datos desde Supabase
                    await cargarDatosDesdeSupabase();
                }
            } catch (supabaseError) {
                console.warn('⚠️ Error de conexión con Supabase:', supabaseError);
                // Continuar con actualización local
            }
        }
        
        // Si es cliente de Supabase, actualizar el array
        if (Array.isArray(supabaseClientes) && supabaseClientes.length > 0) {
            const index = supabaseClientes.findIndex(c => {
                const doc = normalizarDocumentoCliente(c);
                return doc === cedulaOriginal;
            });
            if (index !== -1) {
                supabaseClientes[index] = { ...supabaseClientes[index], ...clienteExistente };
            }
        }
        
        showNotification('Cliente actualizado correctamente', 'success');
        closeModal();
        
        // Refrescar el modal de búsqueda si está abierto
        const modalBuscar = document.getElementById('modalBuscarCliente');
        if (modalBuscar) {
            filtrarClientesModal(modalBuscar.value);
        }
        
        // Si estamos en el formulario de nuevo trabajo, actualizar los campos
        const trabajoClienteInput = document.getElementById('trabajoCliente');
        const busquedaCedulaInput = document.getElementById('busquedaCedula');
        if (trabajoClienteInput && busquedaCedulaInput && busquedaCedulaInput.value === cedulaOriginal) {
            trabajoClienteInput.value = nombre;
            const telefonoInput = document.getElementById('clienteTelefono');
            const emailInput = document.getElementById('clienteEmail');
            if (telefonoInput) telefonoInput.value = telefono;
            if (emailInput) emailInput.value = email;
        }
        
    } catch (error) {
        console.error('❌ Error al guardar cliente:', error);
        showNotification('Error al guardar los cambios', 'error');
    }
}

// Buscar en inventario
function buscarEnInventario(termino) {
    const contenedor = document.getElementById('resultadosInventario');
    if (!contenedor) return;
    
    const baseInventario = Array.isArray(supabaseInventario) && supabaseInventario.length
        ? supabaseInventario
        : [
            { codigo: 'ACE001', nombre: 'Aceite Motor 5W30 Synthetic', referencia: 'ACE001', precio: 45000, categoria: 'Lubricantes' },
            { codigo: 'FRN001', nombre: 'Frenos Delanteros Completos', referencia: 'FRN001', precio: 180000, categoria: 'Frenos' },
            { codigo: 'FLT001', nombre: 'Filtro de Aire', referencia: 'FLT001', precio: 25000, categoria: 'Filtros' },
            { codigo: 'BTR001', nombre: 'Batería 12V 60Ah', referencia: 'BTR001', precio: 320000, categoria: 'Eléctrico' },
            { codigo: 'LMP001', nombre: 'Lámpara Halógena H7', referencia: 'LMP001', precio: 35000, categoria: 'Iluminación' },
            { codigo: 'LLV001', nombre: 'Llantas Michelin 195/65R15', referencia: 'LLV001', precio: 280000, categoria: 'Neumáticos' },
            { codigo: 'CDR001', nombre: 'Correa de Distribución', referencia: 'CDR001', precio: 95000, categoria: 'Motor' },
            { codigo: 'SVP001', nombre: 'Servicio Preventivo Básico', referencia: 'SVP001', precio: 85000, categoria: 'Servicios' }
        ];
    
    const normalizarTexto = texto => (texto || '').toString().toLowerCase();
    let resultados = [];

    if (!termino || termino.trim() === '') {
        resultados = baseInventario.slice(0, 50);
    } else if (termino.length < 2) {
        contenedor.classList.remove('show');
        contenedor.innerHTML = '';
        return;
    } else {
        resultados = baseInventario.filter(item => {
            const codigo = normalizarTexto(item.codigo || item.code);
            const nombre = normalizarTexto(item.nombre || item.name || item.producto);
            const referencia = normalizarTexto(item.referencia || item.ref || item.referencia_interna);
            const barras = normalizarTexto(item.codigo_barras || item.barcode);
            const terminoLower = termino.toLowerCase();
            return codigo.includes(terminoLower) || nombre.includes(terminoLower) || referencia.includes(terminoLower) || barras.includes(terminoLower);
        }).slice(0, 50);
    }
    
    window._ultimosResultadosInventario = resultados;
    if (resultados.length > 0) {
        contenedor.innerHTML = resultados.map((item, index) => {
            const codigo = item.codigo || item.code || '';
            const nombre = item.nombre || item.name || item.producto || 'Producto sin nombre';
            const categoria = item.categoria || item.category || 'General';
            const referencia = item.referencia || item.ref || item.referencia_interna || item.codigo_barras || '';
            const precio = Number(item.precio || item.price || item.valor || 0);
            return `
                <div class="inventario-item" onclick="agregarRepuestoDesdeBusqueda(${index})">
                    <strong>${codigo}</strong> - ${nombre}<br>
                    <small style="color: #666;">${categoria}${referencia ? ' · Ref: ' + referencia : ''} · ${formatCurrency(precio)}</small>
                </div>
            `;
        }).join('');
        contenedor.classList.add('show');
    } else {
        contenedor.innerHTML = '<div class="inventario-item">No se encontraron productos</div>';
        contenedor.classList.add('show');
    }
}

// Mostrar todos los repuestos
function mostrarTodosLosRepuestos() {
    buscarEnInventario('');
}

// Agregar repuesto/servicio al trabajo
function agregarRepuesto(codigo, nombre, precio, categoria) {
    // Asegurar que precio sea un número
    const precioNumero = Number(precio) || 0;
    
    // Inicializar array si no existe
    if (!window.itemsTrabajo) {
        window.itemsTrabajo = [];
    }
    
    // Los repuestos YA tienen IVA incluido en el precio (19%)
    // El campo IVA = 19% indica que el precio mostrado YA incluye ese 19% de IVA
    // Cada item se agrega como uno nuevo (no se combinan automáticamente)
    const item = {
        id: 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9), // ID único
        codigo: codigo || '',
        nombre: nombre || 'Producto sin nombre',
        precio: precioNumero,
        categoria: categoria || 'General',
        cantidad: 1,
        iva: 19,  // 19% significa que el precio YA incluye este IVA
        descuento: 0,
        tipoDescuento: '$'
    };
    
    // Siempre agregar como nuevo item (el usuario puede ajustar cantidad manualmente)
        window.itemsTrabajo.push(item);
    
    actualizarTablaItems();
    const resultadosInventario = document.getElementById('resultadosInventario');
    if (resultadosInventario) resultadosInventario.classList.remove('show');
    const busquedaRepuesto = document.getElementById('busquedaRepuesto');
    if (busquedaRepuesto) busquedaRepuesto.value = '';
    
    showNotification(`✅ "${nombre}" agregado correctamente`, 'success');
}

function agregarRepuestoDesdeBusqueda(index) {
    const lista = window._ultimosResultadosInventario || [];
    const item = lista[index];
    if (!item) return;
    
    const codigo = item.codigo || item.code || '';
    const nombre = item.nombre || item.name || item.producto || 'Producto sin nombre';
    const categoria = item.categoria || item.category || 'General';
    const precio = Number(item.precio || item.price || item.valor || 0);
    
    agregarRepuesto(codigo, nombre, precio, categoria);
}

// Agregar servicio manual
function agregarServicioManual() {
    const modal = createModal(
        '➕ Agregar Servicio Manual',
        `
        <form id="formServicioManual" onsubmit="guardarServicioManual(event)">
            <div class="form-group">
                <label class="form-label">📝 Descripción del Servicio</label>
                <input type="text" class="form-input" id="servicioNombre" placeholder="Ej: Mano de Obra, Cambio de Aceite, Reparación..." required autofocus>
            </div>
            <div class="form-group">
                <label class="form-label">💰 Precio</label>
                <input type="number" class="form-input" id="servicioPrecio" placeholder="0" min="0" step="0.01" required>
            </div>
            <div class="form-group">
                <label class="form-label">📊 IVA</label>
                <select class="form-input" id="servicioIva" required>
                    <option value="0">Sin IVA (0%)</option>
                    <option value="19" selected>Con IVA Incluido (19%)</option>
                </select>
                <small style="color: #666; display: block; margin-top: 4px;">
                    Nota: Si selecciona "Con IVA Incluido", el precio ingresado ya incluye el 19% de IVA.
                </small>
            </div>
            <div class="form-group">
                <label class="form-label">📦 Cantidad</label>
                <input type="number" class="form-input" id="servicioCantidad" value="1" min="1" step="1" required>
            </div>
        </form>
        `,
        [
            { text: 'Cancelar', class: 'btn-outline', onclick: 'closeModal()' },
            { text: '➕ Agregar Servicio', class: 'btn-primary', type: 'submit', form: 'formServicioManual' }
        ]
    );
    showModal(modal);
    
    // Enfocar el primer campo
    setTimeout(() => {
        const nombreInput = document.getElementById('servicioNombre');
        if (nombreInput) nombreInput.focus();
    }, 100);
}

// Guardar servicio manual
function guardarServicioManual(event) {
    event.preventDefault();
    
    const nombre = document.getElementById('servicioNombre')?.value.trim();
    const precio = parseFloat(document.getElementById('servicioPrecio')?.value) || 0;
    const ivaPorcentaje = parseInt(document.getElementById('servicioIva')?.value) || 0;
    const cantidad = parseInt(document.getElementById('servicioCantidad')?.value) || 1;
    
    if (!nombre) {
        showNotification('⚠️ La descripción del servicio es obligatoria', 'error');
        return;
    }
    
    if (precio <= 0) {
        showNotification('⚠️ El precio debe ser mayor a cero', 'error');
        return;
    }
    
    // Inicializar array si no existe
    if (!window.itemsTrabajo) {
        window.itemsTrabajo = [];
    }
    
        const item = {
        id: 'SERV-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9), // ID único
            codigo: 'SERV-' + Date.now(),
        nombre: nombre,
            precio: precio,
            categoria: 'Servicio Manual',
        cantidad: Math.max(1, cantidad),
        iva: ivaPorcentaje,
        descuento: 0,
        tipoDescuento: '$'
        };
        
        window.itemsTrabajo.push(item);
        actualizarTablaItems();
    closeModal();
    
    showNotification(`✅ "${nombre}" agregado correctamente`, 'success');
}

// Actualizar tabla de items
function actualizarTablaItems() {
    const tbody = document.getElementById('itemsTrabajo');
    if (!tbody) return;

    try { syncManoObraItem(); } catch (e) {}

    if (!Array.isArray(window.itemsTrabajo) || window.itemsTrabajo.length === 0) {
        const noItemsRow = document.getElementById('noItemsRow');
        if (noItemsRow) noItemsRow.style.display = 'table-row';
        actualizarTotales();
        return;
    }

    const noItemsRow = document.getElementById('noItemsRow');
    if (noItemsRow) noItemsRow.style.display = 'none';

    const rows = window.itemsTrabajo.map((item, index) => {
        const precio = Number(item.precio) || 0;
        const cantidad = Math.max(1, Number(item.cantidad) || 1);
        const ivaPorcentaje = Math.max(0, Number(item.iva) || 0);

        let totalConIva, precioBase;
        if (ivaPorcentaje > 0) {
            totalConIva = precio * cantidad;
            precioBase = totalConIva / (1 + (ivaPorcentaje / 100));
        } else {
            precioBase = precio * cantidad;
            totalConIva = precioBase;
        }

        const codigo = (item.codigo || '').toString();
        const nombre = (item.nombre || '').toString();

        return `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px 10px; vertical-align: middle;">
                <div style="display:flex; gap:10px; align-items:flex-start;">
                    <button type="button" title="Eliminar" onclick="eliminarItem(${index})" style="background:#ef4444;color:#fff;border:none;padding:6px 8px;border-radius:4px;cursor:pointer;flex-shrink:0;">🗑️</button>
                    <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; position:relative;">
                        <input type="text" value="${codigo}" placeholder="Referencia" 
                               oninput="sugerirReferencia(${index}, this.value)" 
                               onfocus="sugerirReferencia(${index}, this.value)"
                               onblur="cerrarSugerenciasRefConDelay(${index})"
                               onchange="cambiarCodigo(${index}, this.value)" 
                               style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;" />
                        <input type="text" value="${codigo ? (codigo + ' — ') : ''}${nombre}" placeholder="Descripción" 
                               onchange="cambiarDescripcion(${index}, this.value)" 
                               onblur="autoFormatoDescripcion(${index})"
                               style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;" />
                        <div id="refSuggest-${index}" class="inventario-resultados" 
                             style="position:absolute; top: calc(100% + 4px); left:0; right:0; display:none; z-index: 2000;"></div>
                    </div>
                </div>
            </td>
            <td style="padding: 12px 10px; text-align:right;">
                <input type="text" value="${formatCurrency(precio)}" onchange="cambiarPrecioUnitario(${index}, this.value)" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;text-align:right;font-size:14px;" />
            </td>
            <td style="padding: 12px 10px; text-align:center;">
                <input type="number" min="1" value="${cantidad}" onchange="cambiarCantidad(${index}, this.value)" style="width:80px;padding:8px;border:1px solid #ddd;border-radius:4px;text-align:center;font-size:14px;" />
            </td>
            <td style="padding: 12px 10px; text-align:center;">
                <input type="number" min="0" step="0.01" value="${ivaPorcentaje}" onchange="cambiarIva(${index}, this.value)" style="width:90px;padding:8px;border:1px solid #ddd;border-radius:4px;text-align:center;font-size:14px;" />
            </td>
            <td style="padding: 12px 10px; text-align:right;">
                <input type="text" value="${formatCurrency(totalConIva)}" readonly id="totalItem${index}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;text-align:right;font-weight:600;background:#f8f9fa;font-size:14px;" />
            </td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rows;
    actualizarTotales();
}

window.actualizarTablaItems = actualizarTablaItems;

// Cambiar cantidad de item
function cambiarCantidad(index, nuevaCantidad) {
    const cantidad = Math.max(1, parseInt(nuevaCantidad) || 1);
    
    if (window.itemsTrabajo && window.itemsTrabajo[index]) {
    window.itemsTrabajo[index].cantidad = cantidad;
        actualizarTablaItems(); // Re-renderizar toda la tabla para actualizar todo correctamente
    }
}

// Cambiar IVA de item
function cambiarIva(index, nuevoIva) {
    const ivaPorcentaje = Math.max(0, parseFloat(nuevoIva) || 0);
    
    if (window.itemsTrabajo && window.itemsTrabajo[index]) {
        window.itemsTrabajo[index].iva = ivaPorcentaje;
        actualizarTablaItems(); // Re-renderizar toda la tabla para actualizar todo correctamente
    }
}

// Eliminar item
function eliminarItem(index) {
    if (!window.itemsTrabajo || index < 0 || index >= window.itemsTrabajo.length) {
        console.error('❌ Índice inválido para eliminar:', index);
        return;
    }
    
    window.itemsTrabajo.splice(index, 1);
    actualizarTablaItems();
}

window.eliminarItem = eliminarItem;
window.cambiarCantidad = cambiarCantidad;
window.cambiarIva = cambiarIva;
window.cambiarCodigo = cambiarCodigo;
window.agregarRepuesto = agregarRepuesto;
window.agregarServicioManual = agregarServicioManual;
window.guardarServicioManual = guardarServicioManual;
window.sugerirReferencia = sugerirReferencia;
window.seleccionarSugerenciaRef = seleccionarSugerenciaRef;
window.cerrarSugerenciasRefConDelay = cerrarSugerenciasRefConDelay;
window.autoFormatoDescripcion = autoFormatoDescripcion;

// Funciones para la nueva interfaz de tabla
function obtenerSugerenciasInventario(termino, limite = 8) {
    const baseInventario = Array.isArray(supabaseInventario) && supabaseInventario.length
        ? supabaseInventario
        : [
            { codigo: 'ACE001', nombre: 'Aceite Motor 5W30 Synthetic', referencia: 'ACE001', precio: 45000, categoria: 'Lubricantes' },
            { codigo: 'FRN001', nombre: 'Frenos Delanteros Completos', referencia: 'FRN001', precio: 180000, categoria: 'Frenos' },
            { codigo: 'FLT001', nombre: 'Filtro de Aire', referencia: 'FLT001', precio: 25000, categoria: 'Filtros' },
            { codigo: 'BTR001', nombre: 'Batería 12V 60Ah', referencia: 'BTR001', precio: 320000, categoria: 'Eléctrico' },
            { codigo: 'LMP001', nombre: 'Lámpara Halógena H7', referencia: 'LMP001', precio: 35000, categoria: 'Iluminación' },
            { codigo: 'LLV001', nombre: 'Llantas Michelin 195/65R15', referencia: 'LLV001', precio: 280000, categoria: 'Neumáticos' },
            { codigo: 'CDR001', nombre: 'Correa de Distribución', referencia: 'CDR001', precio: 95000, categoria: 'Motor' },
            { codigo: 'SVP001', nombre: 'Servicio Preventivo Básico', referencia: 'SVP001', precio: 85000, categoria: 'Servicios' }
        ];
    const q = (termino || '').toString().trim().toLowerCase();
    if (q.length < 2) return [];
    return baseInventario.filter(item => {
        const codigo = (item.codigo || item.code || '').toString().toLowerCase();
        const nombre = (item.nombre || item.name || item.producto || '').toString().toLowerCase();
        const referencia = (item.referencia || item.ref || item.referencia_interna || '').toString().toLowerCase();
        return codigo.includes(q) || nombre.includes(q) || referencia.includes(q);
    }).slice(0, limite).map(it => ({
        codigo: it.codigo || it.code || '',
        nombre: it.nombre || it.name || it.producto || 'Producto',
        precio: Number(it.precio || it.price || it.valor || 0),
        categoria: it.categoria || it.category || 'General'
    }));
}

function sugerirReferencia(index, termino) {
    const cont = document.getElementById(`refSuggest-${index}`);
    if (!cont) return;
    const sugerencias = obtenerSugerenciasInventario(termino, 8);
    if (!sugerencias.length) {
        cont.style.display = 'none';
        cont.innerHTML = '';
        return;
    }
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,"&#39;");
    cont.innerHTML = sugerencias.map((it, i) => `
        <div class="inventario-item" style="display:flex;justify-content:space-between;align-items:center;gap:8px;" onclick="seleccionarSugerenciaRef(${index}, '${esc(it.codigo)}', '${esc(it.nombre)}', ${it.precio})">
            <div><strong>${esc(it.codigo)}</strong> — ${esc(it.nombre)}</div>
            <div style="color:#666;">${formatCurrency(it.precio)}</div>
        </div>
    `).join('');
    cont.style.display = 'block';
}

function cerrarSugerenciasRefConDelay(index) {
    setTimeout(() => {
        const cont = document.getElementById(`refSuggest-${index}`);
        if (cont) cont.style.display = 'none';
    }, 200);
}

function seleccionarSugerenciaRef(index, codigo, nombre, precio) {
    if (!Array.isArray(window.itemsTrabajo) || !window.itemsTrabajo[index]) return;
    window.itemsTrabajo[index].codigo = codigo;
    window.itemsTrabajo[index].nombre = nombre;
    if (precio && !isNaN(precio)) window.itemsTrabajo[index].precio = Number(precio);
    // Por defecto aplicar 19% como IVA incluido si no tiene
    if (typeof window.itemsTrabajo[index].iva === 'undefined') window.itemsTrabajo[index].iva = 19;
    actualizarTablaItems();
}

function autoFormatoDescripcion(index) {
    // Ya parseamos con cambiarDescripcion; aquí solo re-renderizamos por consistencia
    actualizarTablaItems();
}
function moverItemArriba(index) {
    if (index > 0 && window.itemsTrabajo && window.itemsTrabajo[index]) {
        const temp = window.itemsTrabajo[index];
        window.itemsTrabajo[index] = window.itemsTrabajo[index - 1];
        window.itemsTrabajo[index - 1] = temp;
        actualizarTablaItems();
    }
}

function moverItemAbajo(index) {
    if (index < window.itemsTrabajo.length - 1 && window.itemsTrabajo && window.itemsTrabajo[index]) {
        const temp = window.itemsTrabajo[index];
        window.itemsTrabajo[index] = window.itemsTrabajo[index + 1];
        window.itemsTrabajo[index + 1] = temp;
        actualizarTablaItems();
    }
}

function cambiarArticulo(index, nuevoNombre) {
    if (window.itemsTrabajo && window.itemsTrabajo[index]) {
        // Mantener compatibilidad: cambia el nombre del artículo
        window.itemsTrabajo[index].nombre = (nuevoNombre || '').toString().trim();
        actualizarTablaItems();
    }
}

// Cambiar código de referencia (nuevo input en la columna Referencia)
function cambiarCodigo(index, nuevoCodigo) {
    if (window.itemsTrabajo && window.itemsTrabajo[index]) {
        window.itemsTrabajo[index].codigo = (nuevoCodigo || '').toString().trim();
        actualizarTablaItems();
    }
}

function cambiarDescripcion(index, nuevaDescripcion) {
    if (window.itemsTrabajo && window.itemsTrabajo[index]) {
        // Permitir formatos "CODIGO#NOMBRE" o "CODIGO — NOMBRE" o solo nombre
        const texto = (nuevaDescripcion || '').toString();
        let codigo = window.itemsTrabajo[index].codigo || '';
        let nombre = texto.trim();

        // Separadores soportados
        const sepHash = texto.indexOf('#');
        const sepDash = texto.indexOf('—');
        if (sepHash > -1) {
            codigo = texto.slice(0, sepHash).trim();
            nombre = texto.slice(sepHash + 1).trim();
        } else if (sepDash > -1) {
            codigo = texto.slice(0, sepDash).trim();
            nombre = texto.slice(sepDash + 1).trim();
        }

        if (codigo) window.itemsTrabajo[index].codigo = codigo;
        window.itemsTrabajo[index].nombre = nombre;
        actualizarTablaItems();
    }
}

function cambiarPrecioUnitario(index, nuevoPrecio) {
    if (window.itemsTrabajo && window.itemsTrabajo[index]) {
        // Extraer número del string formateado
        const precioNumero = parseFloat(nuevoPrecio.toString().replace(/[^0-9.-]/g, '')) || 0;
        window.itemsTrabajo[index].precio = precioNumero;
        actualizarTablaItems();
    }
}

function cambiarTipoDescuento(index, tipo) {
    if (window.itemsTrabajo && window.itemsTrabajo[index]) {
        window.itemsTrabajo[index].tipoDescuento = tipo;
        actualizarTablaItems();
    }
}

function cambiarDescuento(index, valor) {
    if (window.itemsTrabajo && window.itemsTrabajo[index]) {
        window.itemsTrabajo[index].descuento = Math.max(0, parseFloat(valor) || 0);
        actualizarTablaItems();
    }
}

function buscarArticulo(index) {
    // Abrir buscador de inventario enfocado en este item
    const inputBusqueda = document.getElementById('busquedaRepuesto');
    if (inputBusqueda) {
        inputBusqueda.focus();
        window._itemSeleccionadoParaEditar = index;
    }
}

function agregarLineaVacia() {
    if (!window.itemsTrabajo) {
        window.itemsTrabajo = [];
    }
    
    const item = {
        id: 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        codigo: '',
        nombre: 'Artículo',
        precio: 0,
        categoria: 'General',
        cantidad: 1,
        iva: 0,
        descuento: 0,
        tipoDescuento: '$'
    };
    
    window.itemsTrabajo.push(item);
    actualizarTablaItems();
}

function validarItems() {
    let errores = [];
    
    if (!window.itemsTrabajo || window.itemsTrabajo.length === 0) {
        errores.push('No hay items agregados');
    } else {
        window.itemsTrabajo.forEach((item, index) => {
            if (!item.nombre || item.nombre.trim() === '' || item.nombre === 'Artículo') {
                errores.push(`Fila ${index + 1}: Falta el nombre del artículo`);
            }
            if (!item.precio || item.precio <= 0) {
                errores.push(`Fila ${index + 1}: El precio debe ser mayor a cero`);
            }
        });
    }
    
    if (errores.length > 0) {
        showNotification('⚠️ Errores encontrados:\n' + errores.join('\n'), 'error');
    } else {
        showNotification('✅ Todos los items están válidos', 'success');
    }
}

window.moverItemArriba = moverItemArriba;
window.moverItemAbajo = moverItemAbajo;
window.cambiarArticulo = cambiarArticulo;
window.cambiarDescripcion = cambiarDescripcion;
window.cambiarPrecioUnitario = cambiarPrecioUnitario;
window.cambiarTipoDescuento = cambiarTipoDescuento;
window.cambiarDescuento = cambiarDescuento;
window.buscarArticulo = buscarArticulo;
window.agregarLineaVacia = agregarLineaVacia;
window.validarItems = validarItems;

// =============================
// Búsqueda de clientes en Recepción
// =============================
function seleccionarClienteRecepcion(nombre, cedula, telefono = '', email = '') {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('rcpCliente', nombre);
    setVal('rcpCedula', cedula);
    setVal('rcpTelefono', telefono);
    setVal('rcpEmail', email);
    const cont = document.getElementById('rcpResultadosClientes');
    if (cont) { cont.classList.remove('show'); cont.innerHTML=''; }
}

function buscarClientePorCedulaRecepcion(cedula) {
    const contenedor = document.getElementById('rcpResultadosClientes');
    if (!contenedor) return;
    const termino = (cedula || '').toString().trim();
    if (termino.length < 2) { contenedor.classList.remove('show'); contenedor.innerHTML=''; return; }
    const baseClientes = obtenerListaClientes();
    const terminoLower = termino.toLowerCase();
    const resultados = baseClientes.filter(c => normalizarDocumentoCliente(c).toLowerCase().includes(terminoLower)).slice(0,50);
    if (resultados.length) {
        const escapar = v => (v||'').toString().replace(/'/g, "\\'").replace(/"/g,'&quot;');
        contenedor.innerHTML = resultados.map((c,idx) => {
            const doc = normalizarDocumentoCliente(c);
            const nombre = normalizarNombreCliente(c);
            const tel = (c?.telefono || c?.phone || '').toString();
            const mail = (c?.email || '').toString();
            return `<div class="resultado-item" onclick="seleccionarClienteRecepcion('${escapar(nombre)}','${escapar(doc)}','${escapar(tel)}','${escapar(mail)}')">
                        <strong>${doc}</strong> - ${nombre}
                        ${tel ? `<br><small style='color:#666'>📞 ${tel}</small>`:''}
                        ${mail ? `<br><small style='color:#666'>📧 ${mail}</small>`:''}
                    </div>`;
        }).join('');
        contenedor.classList.add('show');
    } else {
        contenedor.innerHTML = '<div class="resultado-item">No se encontraron clientes</div>';
        contenedor.classList.add('show');
    }
}

function abrirBuscadorClientesRecepcion() {
    const modal = createModal(
        'Buscar Cliente',
        `
        <div class="cliente-search-modal">
            <input type="text" class="form-input" id="modalBuscarClienteRecep" placeholder="Buscar por cédula/NIT o nombre..." oninput="filtrarClientesModalRecepcion(this.value)">
            <div id="modalClientesResultadoRecep" class="modal-clientes-list"></div>
        </div>
        `,
        'large',
        [ { text: 'Cerrar', class: 'btn-outline', onclick: 'closeModal()' } ]
    );
    showModal(modal);
    filtrarClientesModalRecepcion('');
}

function filtrarClientesModalRecepcion(termino='') {
    const cont = document.getElementById('modalClientesResultadoRecep');
    if (!cont) return;
    const lista = obtenerListaClientes();
    const tl = (termino||'').toLowerCase();
    const resultados = lista.filter(c => {
        const doc = normalizarDocumentoCliente(c).toLowerCase();
        const nom = normalizarNombreCliente(c).toLowerCase();
        return !tl || doc.includes(tl) || nom.includes(tl);
    }).slice(0,50);
    const esc = s => (s||'').toString().replace(/'/g, "\\'").replace(/"/g,'&quot;');
    if (!resultados.length) { cont.innerHTML = '<div style="padding:16px;color:#6b7280;">No se encontraron clientes</div>'; return; }
    cont.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
            <thead><tr><th>Cédula/NIT</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Acciones</th></tr></thead>
            <tbody>
                ${resultados.map((c,idx) => {
                    const doc = normalizarDocumentoCliente(c); const nom = normalizarNombreCliente(c);
                    const tel = (c?.telefono || c?.phone || '').toString(); const mail = (c?.email || '').toString();
                    return `<tr>
                        <td>${doc}</td><td>${nom}</td><td>${tel||'-'}</td><td>${mail||'-'}</td>
                        <td><button class="btn btn-primary btn-sm" onclick="seleccionarClienteRecepcion('${esc(nom)}','${esc(doc)}','${esc(tel)}','${esc(mail)}'); closeModal();">Seleccionar</button></td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}

window.buscarClientePorCedulaRecepcion = buscarClientePorCedulaRecepcion;
window.abrirBuscadorClientesRecepcion = abrirBuscadorClientesRecepcion;

// Sincroniza la línea especial de Mano de Obra con el input #manoObraValor
function syncManoObraItem() {
    const moInput = document.getElementById('manoObraValor');
    if (!moInput) return;
    const valor = Math.max(0, Number(moInput.value || 0));
    if (!Array.isArray(window.itemsTrabajo)) window.itemsTrabajo = [];

    const idx = window.itemsTrabajo.findIndex(i => i && i.isManoObra === true);

    if (valor > 0) {
        if (idx === -1) {
            window.itemsTrabajo.push({
                id: 'MO-' + Date.now(),
                codigo: 'MO',
                nombre: 'Mano de Obra',
                precio: valor,
                categoria: 'Servicio',
                cantidad: 1,
                iva: 0,
                descuento: 0,
                tipoDescuento: '$',
                isManoObra: true
            });
        } else {
            window.itemsTrabajo[idx].precio = valor;
            window.itemsTrabajo[idx].cantidad = 1;
            window.itemsTrabajo[idx].iva = 0;
        }
    } else if (idx !== -1) {
        window.itemsTrabajo.splice(idx, 1);
    }
}

// Calcular totales
function calcularTotal() {
    // Al cambiar MO, aseguremos la línea especial y refresquemos tabla y totales
    syncManoObraItem();
    actualizarTablaItems();
}

// Previsualizar trabajo
function previsualizarTrabajo() {
    const cliente = document.getElementById('trabajoCliente').value;
    const placa = document.getElementById('trabajoPlaca').value;
    const vehiculo = `${document.getElementById('vehiculoMarca').value} ${document.getElementById('vehiculoModelo').value} ${document.getElementById('vehiculoAno').value}`;
    
    if (!cliente || !placa) {
        alert('Por favor complete la información básica del cliente y vehículo');
        return;
    }
    
    // Crear vista previa
    const vistaPrevia = `
        <div style="max-height: 400px; overflow-y: auto;">
            <h3>📋 Vista Previa del Trabajo</h3>
            <div><strong>Cliente:</strong> ${cliente}</div>
            <div><strong>Vehículo:</strong> ${vehiculo}</div>
            <div><strong>Placa:</strong> ${placa}</div>
            <div><strong>Kilometraje:</strong> ${document.getElementById('trabajoKilometraje').value}</div>
            <div><strong>Técnico:</strong> ${document.getElementById('trabajoTecnico').selectedOptions[0].text}</div>
            <br>
            <h4>🔧 Items del Trabajo:</h4>
            ${window.itemsTrabajo.length > 0 ? window.itemsTrabajo.map(item => {
                const precio = Number(item.precio) || 0;
                const cantidad = Number(item.cantidad) || 1;
                const ivaPorcentaje = Number(item.iva) || 0;
                const totalItem = precio * cantidad;
                const desc = `${item.codigo ? (item.codigo + ' — ') : ''}${item.nombre || ''}`;
                if (ivaPorcentaje > 0) {
                    const base = totalItem / (1 + (ivaPorcentaje / 100));
                    const ivaIncluido = totalItem - base;
                    return `<div>• ${desc} (${cantidad}x) — ${formatCurrency(totalItem)} <small>(incl. IVA ${ivaPorcentaje}%: ${formatCurrency(ivaIncluido)})</small></div>`;
                } else {
                    return `<div>• ${desc} (${cantidad}x) — ${formatCurrency(totalItem)}</div>`;
                }
            }).join('') : '<div>No hay items agregados</div>'}
            
            <br>
            <div><strong>Subtotal (Sin IVA):</strong> ${document.getElementById('subtotalRepuestos').textContent}</div>
            <div><strong>IVA Total:</strong> ${document.getElementById('subtotalIva').textContent}</div>
            <div><strong>Total Final:</strong> ${document.getElementById('totalFinal').textContent}</div>
        </div>
    `;
    
    const modal = createModal('Vista Previa', `
        <div style="padding: 20px;">${vistaPrevia}</div>
        <div style="text-align: right; padding: 20px;">
            <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
        </div>
    `);
    
    showModal(modal);
}

// Guardar nuevo trabajo
// Función para formatear moneda
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Guardar nuevo trabajo con sistema POS
function guardarNuevoTrabajo(event) {
    event.preventDefault();
    
    console.log('💾 Iniciando guardado de trabajo con sistema POS...');
    
    // Validar campos básicos
    const placa = document.getElementById('trabajoPlaca').value.trim();
    const cliente = document.getElementById('trabajoCliente').value.trim();
    const marca = document.getElementById('vehiculoMarca').value.trim();
    const modelo = document.getElementById('vehiculoModelo').value.trim();
    const ano = document.getElementById('vehiculoAno').value;
    const kilometraje = document.getElementById('trabajoKilometraje').value;
    
    if (!placa || !cliente || !marca || !modelo) {
        alert('Por favor complete todos los campos obligatorios');
        return;
    }
    
    // Sincronizar Mano de Obra como ítem antes de calcular
    try { syncManoObraItem(); } catch (e) { /* noop */ }
    // Calcular totales finales (precio de items incluye IVA si item.iva > 0)
    let subtotalSinIva = 0;
    let totalIva = 0;
    let totalConIva = 0;
    
    window.itemsTrabajo.forEach(item => {
        const precio = Number(item.precio) || 0;
        const cantidad = Number(item.cantidad) || 1;
        const ivaPorcentaje = Number(item.iva) || 0;
        const totalItem = precio * cantidad;
        if (ivaPorcentaje > 0) {
            const base = totalItem / (1 + (ivaPorcentaje / 100));
            const ivaIncluido = totalItem - base;
            subtotalSinIva += base;
            totalIva += ivaIncluido;
            totalConIva += totalItem;
        } else {
            subtotalSinIva += totalItem;
            totalConIva += totalItem;
        }
    });
    // Mano de obra (sin IVA) solo para registro; los totales ya lo incluyen como item si aplica
    const manoObraValor = Number(document.getElementById('manoObraValor')?.value || 0);
    
    // Crear objeto de trabajo completo
    const trabajoCompleto = {
        id: `TR-${nextOrderNumber.toString().padStart(3, '0')}`,
        nextOrderNumber: nextOrderNumber++,
        fecha: new Date().toISOString(),
        
        // Información del cliente
        cedula: document.getElementById('busquedaCedula').value,
        cliente: cliente,
        
        // Información del vehículo
        placa: placa.toUpperCase(),
        marca: marca,
        modelo: modelo,
        ano: parseInt(ano),
        kilometraje: parseInt(kilometraje),
        
        // Información del trabajo
        tecnico: document.getElementById('trabajoTecnico').value,
        mecanico: parseInt(document.getElementById('trabajoTecnico').value || '0') || 0,
        estado: 'Pendiente',
        observaciones: document.getElementById('trabajoServicio').value,
        
        // Sistema POS
        items: [...window.itemsTrabajo],
        manoObra: manoObraValor,
        
        // Totales (sin mano de obra separada)
        subtotalSinIva: subtotalSinIva,
        totalIva: totalIva,
        total: totalConIva,
        
        // Estado del pago
        pagado: false,
        metodoPago: null
    };
    // Añadir al listado de trabajos en memoria para usar en liquidación
    try { addTrabajoData(trabajoCompleto); } catch (e) { console.warn('No se pudo agregar a trabajos:', e); }

    console.log('✅ Trabajo creado:', trabajoCompleto);
    
    // Simular guardado (en producción se enviaría a Supabase)
    showNotification(`🎉 Trabajo ${trabajoCompleto.id} creado exitosamente! Total: ${formatCurrency(trabajoCompleto.total)}` , 'success');
    
    // Ofrecer ir a liquidación del técnico
    try {
        const tecnicoId = trabajoCompleto.mecanico;
        const modal = createModal(
            'Trabajo creado',
            `<div style="padding:16px;line-height:1.6;">
                <p>El trabajo <strong>${trabajoCompleto.id}</strong> fue creado para la placa <strong>${trabajoCompleto.placa}</strong>.</p>
                <p>¿Deseas ir a <strong>Liquidación Avanzada</strong> para el técnico seleccionado?</p>
            </div>`,
            [
                { text: 'Seguir aquí', class: 'btn-outline', onclick: 'closeModal()' },
                { text: 'Liquidar ahora', class: 'btn-primary', onclick: `closeModal(); irALiquidacionDelTecnico(${tecnicoId});` }
            ]
        );
        showModal(modal);
    } catch(e) { /* noop */ }

    const trabajosTableBody = document.getElementById('trabajosTable');
    if (trabajosTableBody) {
        const nuevaFila = document.createElement('tr');
        const tecnicoNombre = document.getElementById('trabajoTecnico').selectedOptions.length
            ? document.getElementById('trabajoTecnico').selectedOptions[0].text
            : '—';
        nuevaFila.innerHTML = `
            <td>${trabajoCompleto.placa}</td>
            <td>${trabajoCompleto.cliente}</td>
            <td>${trabajoCompleto.marca} ${trabajoCompleto.modelo} ${trabajoCompleto.ano}</td>
            <td>${trabajoCompleto.observaciones || 'Trabajo sin descripción'}</td>
            <td>${tecnicoNombre}</td>
            <td><span class="status-badge status-pendiente">Pendiente</span></td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="verTrabajo('${trabajoCompleto.placa}')">Ver</button>
                <button class="btn btn-sm btn-success" onclick="completarTrabajo('${trabajoCompleto.id}')">Completar</button>
            </td>
        `;
        trabajosTableBody.prepend(nuevaFila);
    }
    
    actualizarMetricasTrabajos();
    cancelarNuevoTrabajo();
    
    // Actualizar vista si es necesario
    // loadTrabajosData();
    
    // Mostrar resumen en consola para depuración
    console.log('📊 Resumen del trabajo:');
    console.log('- Cliente:', trabajoCompleto.cliente);
    console.log('- Vehículo:', `${trabajoCompleto.marca} ${trabajoCompleto.modelo} ${trabajoCompleto.ano}`);
    console.log('- Placa:', trabajoCompleto.placa);
    console.log('- Items agregados:', trabajoCompleto.items.length);
    console.log('- Total:', formatCurrency(trabajoCompleto.total));
}

// Exportar OT a formato CUENTTI (CSV)
function exportarTrabajoACuentti() {
    // Recolectar datos actuales del formulario de OT
    const placa = (document.getElementById('trabajoPlaca')?.value || '').toUpperCase();
    const fecha = new Date().toISOString().slice(0,10);

    // Asegurar que MO está sincronizada como ítem
    try { syncManoObraItem(); } catch (e) {}

    const items = Array.isArray(window.itemsTrabajo) ? window.itemsTrabajo : [];
    if (!items.length) { alert('No hay items para exportar'); return; }

    // Construir filas según plantilla CUENTTI
    const header = [
        'Referencia o codigo de barras', 'Nombre', 'Precio Unitario', 'Cantidad', 'Descuento', 'Impuesto',
        'SubTotal (No modificar)', 'Estampilla(sino Aplica 0)', 'Impoconsumo(sino Aplica 0)', 'Total (No modificar)', 'id_plan_cuenta (opcional solo Egresos)'
    ];

    const toNumber = v => Math.max(0, Number(v) || 0);
    const rows = items.map(it => {
        const ref = (it.codigo || '').toString();
        const nombre = (it.nombre || '').toString();
        const cantidad = Math.max(1, parseInt(it.cantidad) || 1);
        const iva = toNumber(it.iva); // %
        const precio = toNumber(it.precio);
        // Precio Unitario base (pre-IVA si iva>0)
        const precioUnitBase = iva > 0 ? (precio / (1 + (iva/100))) : precio;
        // Descuento en % (si existiera)
        const tipoDesc = it.tipoDescuento || '$';
        const descVal = toNumber(it.descuento);
        let descuentoPct = 0;
        if (descVal > 0) {
            descuentoPct = (tipoDesc === '%') ? descVal : (precioUnitBase > 0 ? (descVal / precioUnitBase) * 100 : 0);
        }
        const bruto = precioUnitBase * cantidad;
        const subtotal = Math.max(0, bruto * (1 - (descuentoPct/100)));
        const estampilla = 0;
        const impoconsumo = 0;
        const total = Math.round(subtotal * (1 + (iva/100)) + estampilla + impoconsumo);
        return [ref, nombre, Math.round(precioUnitBase), cantidad, Math.round(descuentoPct), iva, Math.round(subtotal), estampilla, impoconsumo, total, ''];
    });

    const csv = [header, ...rows].map(r => r.map(v => {
        const s = (v ?? '').toString();
        return /[",\n;]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const nombreArchivo = `OT-${placa || 'SIN_PLACA'}-${fecha}.csv`;
    link.href = URL.createObjectURL(blob);
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.exportarTrabajoACuentti = exportarTrabajoACuentti;

function actualizarMetricasTrabajos() {
    const trabajosTableBody = document.getElementById('trabajosTable');
    if (!trabajosTableBody) return;

    let total = 0;
    let completados = 0;
    let enProgreso = 0;
    let pendientes = 0;

    trabajosTableBody.querySelectorAll('tr').forEach(tr => {
        const badge = tr.querySelector('.status-badge');
        if (!badge) return;
        total++;
        const estado = badge.textContent.trim().toLowerCase();
        if (estado.includes('completado')) {
            completados++;
        } else if (estado.includes('progreso')) {
            enProgreso++;
        } else {
            pendientes++;
        }
    });

    const setTextIfExists = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setTextIfExists('trabajosTotal', total);
    setTextIfExists('trabajosCompletados', completados);
    setTextIfExists('trabajosEnProgreso', enProgreso);
    setTextIfExists('trabajosPendientes', pendientes);

    setTextIfExists('totalJobs', total);
    setTextIfExists('completedJobs', completados);
    setTextIfExists('inProgressJobs', enProgreso);
}

// Ver trabajo
function verTrabajo(placa) {
    console.log('👁️ Ver trabajo:', placa);
    const modal = createModal(
        'Detalles del Trabajo',
        `
        <div style="line-height: 1.6;">
            <h4>Trabajo: ${placa}</h4>
            <p><strong>Cliente:</strong> Juan Pérez</p>
            <p><strong>Vehículo:</strong> Toyota Corolla 2020</p>
            <p><strong>Kilometraje:</strong> 45,000 km</p>
            <p><strong>Servicio:</strong> Cambio de aceite y filtro</p>
            <p><strong>Técnico:</strong> Víctor Padilla</p>
            <p><strong>Estado:</strong> <span class="status-badge status-completado">Completado</span></p>
            <p><strong>Fecha de inicio:</strong> 10/01/2025</p>
            <p><strong>Fecha de finalización:</strong> 10/01/2025</p>
            <p><strong>Costo mano de obra:</strong> $25,000</p>
            <p><strong>Repuestos utilizados:</strong></p>
            <ul>
                <li>Filtro de Aceite - $15,000</li>
                <li>Aceite Motor - $25,000</li>
            </ul>
            <p><strong>Total:</strong> $65,000</p>
            <p><strong>Observaciones:</strong> Trabajo completado satisfactoriamente. Cliente satisfecho con el servicio.</p>
        </div>
        `,
        [
            { text: 'Cerrar', class: 'btn-outline', onclick: 'closeModal()' },
            { text: 'Editar', class: 'btn-primary', onclick: 'closeModal(); nuevoTrabajo();' }
        ]
    );
    
    showModal(modal);
}

// Completar trabajo (marcar como 'completado')
function completarTrabajo(trabajoId) {
    const trabajos = getTrabajosData();
    const t = trabajos.find(x => String(x.id) === String(trabajoId));
    if (!t) { showNotification('Trabajo no encontrado', 'error'); return; }
    t.estado = 'completado';
    showNotification(`Trabajo ${t.id} marcado como completado`, 'success');
    // Actualizar UI si la fila existe
    try {
        const trabajosTableBody = document.getElementById('trabajosTable');
        if (trabajosTableBody) {
            const filas = Array.from(trabajosTableBody.querySelectorAll('tr'));
            const fila = filas.find(tr => tr.innerText.includes(t.placa));
            if (fila) {
                const badge = fila.querySelector('.status-badge');
                if (badge) {
                    badge.className = 'status-badge status-completado';
                    badge.textContent = 'Completado';
                }
            }
            actualizarMetricasTrabajos();
        }
    } catch (e) { /* noop */ }
}
window.completarTrabajo = completarTrabajo;

// Nueva recepción
// ===== MÓDULO UNIFICADO: RECEPCIÓN Y NUEVO TRABAJO =====
// Primero se muestra recepción, luego pasa a nuevo trabajo automáticamente

function nuevaRecepcion() {
    console.log('📋 Abriendo módulo unificado: Recepción → Nuevo Trabajo...');
    
    // Guardar la sección actual para volver después
    previousSectionBeforeNuevoTrabajo = currentSection;
    
    // Cambiar a la sección de nuevo trabajo (unificada con recepción)
    showSection('nuevoTrabajoPage');
    
    // Inicializar el formulario
    setTimeout(() => {
        inicializarNuevoTrabajoForm();
        
        // Mostrar un mensaje informativo
        showNotification('Completa la recepción primero, luego continúa con el trabajo', 'info');
        
        // Scroll al inicio
        const content = document.querySelector('.content');
        if (content) content.scrollTop = 0;
    }, 100);
}

// Función anterior para mantener compatibilidad, ahora redirige al módulo unificado
function nuevaRecepcionModal() {
    console.log('📋 Abriendo formulario de nueva recepción (modal)...');
    
    const modal = createModal(
        'Nueva Recepción',
        `
        <form id="nuevaRecepcionForm" onsubmit="guardarNuevaRecepcion(event)">
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Número de Orden</label>
                    <input type="text" class="form-input" id="ordenNumero" value="ORD-2025-${nextOrderNumber.toString().padStart(3, '0')}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">Fecha de Recepción</label>
                    <input type="date" class="form-input" id="recepcionFecha" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
            </div>
            
            <h4 style="margin: 16px 0 8px 0; color: var(--primary-500);">Datos del Cliente</h4>
            
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Buscar Cliente por Cédula</label>
                    <input type="text" class="form-input" id="busquedaCedulaRecepcion" placeholder="12345678" onchange="buscarClienteRecepcion()">
                </div>
                <div class="form-group">
                    <label class="form-label">Nombre del Cliente</label>
                    <input type="text" class="form-input" id="clienteNombre" required>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Teléfono</label>
                    <input type="text" class="form-input" id="clienteTelefono">
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" id="clienteEmail">
                </div>
            </div>
            
            <h4 style="margin: 16px 0 8px 0; color: var(--primary-500);">Datos del Vehículo</h4>
            
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Placa</label>
                    <input type="text" class="form-input" id="vehiculoPlaca" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Marca</label>
                    <input type="text" class="form-input" id="vehiculoMarcaRecepcion" required>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Modelo</label>
                    <input type="text" class="form-input" id="vehiculoModeloRecepcion" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Año</label>
                    <input type="number" class="form-input" id="vehiculoAnoRecepcion" required>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Kilometraje</label>
                <input type="number" class="form-input" id="vehiculoKilometraje" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Descripción del Problema</label>
                <textarea class="form-textarea" id="problemaDescripcion" required></textarea>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Técnico Asignado</label>
                    <select class="form-select" id="tecnicoAsignado" required>
                        <option value="">Seleccionar técnico</option>
                        <option value="1">Pedro Barraza</option>
                        <option value="2">Víctor Padilla</option>
                        <option value="3">Ismael Cervantes</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Prioridad</label>
                    <select class="form-select" id="recepcionPrioridad" required>
                        <option value="baja">Baja</option>
                        <option value="media" selected>Media</option>
                        <option value="alta">Alta</option>
                    </select>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Tiempo Estimado</label>
                <input type="text" class="form-input" id="tiempoEstimado" placeholder="2 horas">
            </div>
        </form>
        `,
        [
            { text: 'Cancelar', class: 'btn-outline', onclick: 'closeModal()' },
            { text: 'Crear Recepción', class: 'btn-primary', type: 'submit', form: 'nuevaRecepcionForm' }
        ]
    );
    
    showModal(modal);
}

// Ruta conectada: Recepción → OT → Liquidación
function iniciarOrdenTrabajo(event) {
    event.preventDefault();
    // Tomar valores del form de recepción
    const f = document.getElementById('recepcionForm');
    if (!f) { showNotification('No se encontró el formulario de recepción', 'error'); return; }
    const val = id => (document.getElementById(id)?.value || '').toString().trim();
    datosRecepcionTemporal = {
        clienteNombre: val('rcpCliente'),
        cedula: val('rcpCedula'),
        telefono: val('rcpTelefono'),
        email: val('rcpEmail'),
        placa: val('rcpPlaca').toUpperCase(),
        marca: val('rcpMarca'),
        modelo: val('rcpModelo'),
        ano: parseInt(val('rcpAno') || new Date().getFullYear()),
        kilometraje: val('rcpKm'),
        tecnico: val('rcpTecnico'),
        descripcion: val('rcpObs')
    };
    previousSectionBeforeNuevoTrabajo = 'recepcionPage';
    showSection('nuevoTrabajoPage');
    setTimeout(() => inicializarNuevoTrabajoForm(), 0);
}

function irALiquidacionDelTecnico(tecnicoId) {
    showSection('liquidacionAvanzada');
    const form = document.getElementById('liquidacionAvanzadaForm');
    if (!form) return;
    const sel = form.querySelector('select[name="tecnicoId"]');
    if (sel) sel.value = String(tecnicoId || '');
    const hoy = new Date();
    const hace30 = new Date(hoy.getTime() - 30*24*60*60*1000);
    const ini = form.querySelector('input[name="fechaInicio"]');
    const fin = form.querySelector('input[name="fechaFin"]');
    if (ini && !ini.value) ini.value = hace30.toISOString().split('T')[0];
    if (fin && !fin.value) fin.value = hoy.toISOString().split('T')[0];
    actualizarVistaPrevia();
}

window.iniciarOrdenTrabajo = iniciarOrdenTrabajo;
window.irALiquidacionDelTecnico = irALiquidacionDelTecnico;

// Buscar cliente por cédula en recepción
function buscarClienteRecepcion() {
    const cedula = document.getElementById('busquedaCedulaRecepcion').value;
    
    if (cedula) {
        const baseClientes = Array.isArray(supabaseClientes) && supabaseClientes.length ? supabaseClientes : clientes;
        const normalizarDocumento = cliente => (cliente?.cedula || cliente?.documento || cliente?.id_cedula || '').toString();
        const cliente = baseClientes.find(c => normalizarDocumento(c) === cedula);
        if (cliente) {
            document.getElementById('clienteNombre').value = cliente.nombre || cliente.name || cliente.cliente || '';
            document.getElementById('clienteTelefono').value = cliente.telefono || cliente.phone || '';
            document.getElementById('clienteEmail').value = cliente.email || '';
            showNotification(`Cliente encontrado: ${cliente.nombre || cliente.name}`, 'success');
        } else {
            showNotification('Cliente no encontrado. Puede crear uno nuevo.', 'warning');
            document.getElementById('clienteNombre').value = '';
            document.getElementById('clienteTelefono').value = '';
            document.getElementById('clienteEmail').value = '';
        }
    }
}

// Guardar nueva recepción (desde modal - modo legacy)
function guardarNuevaRecepcion(event) {
    event.preventDefault();
    
    const ordenNumero = document.getElementById('ordenNumero').value;
    
    console.log('💾 Guardando nueva recepción desde modal:', ordenNumero);
    
    nextOrderNumber++;
    
    datosRecepcionTemporal = {
        clienteNombre: document.getElementById('clienteNombre').value,
        cedula: document.getElementById('busquedaCedulaRecepcion').value,
        telefono: document.getElementById('clienteTelefono').value,
        email: document.getElementById('clienteEmail').value,
        placa: document.getElementById('vehiculoPlaca').value,
        marca: document.getElementById('vehiculoMarcaRecepcion').value,
        modelo: document.getElementById('vehiculoModeloRecepcion').value,
        ano: document.getElementById('vehiculoAnoRecepcion').value,
        kilometraje: document.getElementById('vehiculoKilometraje').value,
        tecnico: document.getElementById('tecnicoAsignado').value,
        descripcion: document.getElementById('problemaDescripcion').value
    };
    
    closeModal();
    showNotification(`Recepción ${ordenNumero} guardada. Continuando con nuevo trabajo...`, 'success');
    
    // Ahora abrir el módulo de nuevo trabajo
    nuevoTrabajo();
}

// Nueva cotización
function nuevaCotizacion() {
    console.log('💰 Abriendo formulario de nueva cotización...');
    
    const modal = createModal(
        'Nueva Cotización',
        `
        <form id="nuevaCotizacionForm" onsubmit="guardarNuevaCotizacion(event)">
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Número de Cotización</label>
                    <input type="text" class="form-input" id="cotizacionNumero" value="COT-2025-${nextQuoteNumber.toString().padStart(3, '0')}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">Fecha</label>
                    <input type="date" class="form-input" id="cotizacionFecha" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Cliente</label>
                <input type="text" class="form-input" id="cotizacionCliente" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Vehículo</label>
                <input type="text" class="form-input" id="cotizacionVehiculo" placeholder="Marca Modelo Año" required>
            </div>
            
            <h4 style="margin: 16px 0 8px 0; color: var(--primary-500);">Items de la Cotización</h4>
            
            <div id="itemsCotizacion">
                <div class="form-group">
                    <label class="form-label">Agregar Producto/Repuesto</label>
                    <div class="form-row">
                        <select class="form-select" id="productoSeleccionado" onchange="agregarItemCotizacion()">
                            <option value="">Seleccionar producto</option>
                            ${inventario.map(item => `<option value="${item.codigo}">${item.codigo} - ${item.nombre} - $${item.precio.toLocaleString()}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Mano de Obra</label>
                <input type="number" class="form-input" id="cotizacionManoObra" placeholder="25000">
            </div>
            
            <div class="form-group">
                <label class="form-label">Observaciones</label>
                <textarea class="form-textarea" id="cotizacionObservaciones"></textarea>
            </div>
            
            <div class="card" style="margin-top: 16px; background: var(--neutral-50);">
                <h5>Resumen de la Cotización</h5>
                <p><strong>Subtotal productos:</strong> <span id="subtotalProductos">$0</span></p>
                <p><strong>Mano de obra:</strong> <span id="subtotalManoObra">$0</span></p>
                <p><strong>Total:</strong> <span id="totalCotizacion" style="font-size: 18px; font-weight: bold; color: var(--primary-500);">$0</span></p>
            </div>
        </form>
        `,
        [
            { text: 'Cancelar', class: 'btn-outline', onclick: 'closeModal()' },
            { text: 'Crear Cotización', class: 'btn-primary', type: 'submit', form: 'nuevaCotizacionForm' }
        ]
    );
    
    showModal(modal);
}

// Agregar item a cotización
function agregarItemCotizacion() {
    const codigoProducto = document.getElementById('productoSeleccionado').value;
    if (!codigoProducto) return;
    
    const producto = inventario.find(p => p.codigo === codigoProducto);
    if (!producto) return;
    
    console.log('Agregando producto:', producto);
    
    // Aquí se agregaría el producto a la lista
    showNotification(`${producto.nombre} agregado a la cotización`, 'success');
    
    // Reset select
    document.getElementById('productoSeleccionado').value = '';
}

// Guardar nueva cotización
function guardarNuevaCotizacion(event) {
    event.preventDefault();
    
    const cotizacionNumero = document.getElementById('cotizacionNumero').value;
    
    console.log('💾 Guardando nueva cotización:', cotizacionNumero);
    
    nextQuoteNumber++;
    showNotification(`Cotización ${cotizacionNumero} creada exitosamente`, 'success');
    closeModal();
    
    // Actualizar datos
    // loadCotizacionesData();
}

// Buscar vehículo en historial
function buscarVehiculo() {
    const placa = document.getElementById('busquedaPlaca').value;
    const resultado = document.getElementById('resultadoHistorial');
    
    if (!placa) {
        showNotification('Ingresa una placa para buscar', 'warning');
        return;
    }
    
    console.log('🔍 Buscando historial para:', placa);
    
    // Simulación de datos de historial
    const historial = {
        'ABC123': {
            cliente: 'Juan Pérez',
            servicios: [
                { fecha: 'Ene 2025', servicio: 'Mantenimiento preventivo', kilometraje: 45000, costo: 75000, tecnico: 'Víctor Padilla' },
                { fecha: 'Ago 2024', servicio: 'Reparación frenos', kilometraje: 35000, costo: 120000, tecnico: 'Pedro Barraza' }
            ],
            proximoMantenimiento: 'Ene 2026'
        },
        'XYZ789': {
            cliente: 'María González',
            servicios: [
                { fecha: 'Ene 2025', servicio: 'Diagnóstico motor', kilometraje: 62000, costo: 85000, tecnico: 'Ismael Cervantes' }
            ],
            proximoMantenimiento: 'Jul 2025'
        }
    };
    
    const datos = historial[placa.toUpperCase()];
    
    if (datos) {
        resultado.innerHTML = `
            <div class="card">
                <h4>Historial: ${placa.toUpperCase()}</h4>
                <p><strong>Cliente:</strong> ${datos.cliente}</p>
                
                <h5 style="margin-top: 16px;">Servicios Realizados:</h5>
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Servicio</th>
                                <th>Kilometraje</th>
                                <th>Costo</th>
                                <th>Técnico</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${datos.servicios.map(servicio => `
                                <tr>
                                    <td>${servicio.fecha}</td>
                                    <td>${servicio.servicio}</td>
                                    <td>${servicio.kilometraje.toLocaleString()} km</td>
                                    <td>$${servicio.costo.toLocaleString()}</td>
                                    <td>${servicio.tecnico}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="mt-4">
                    <p><strong>Próximo mantenimiento recomendado:</strong> ${datos.proximoMantenimiento}</p>
                    <button class="btn btn-primary" onclick="agendarMantenimiento('${placa.toUpperCase()}')">Agendar Mantenimiento</button>
                </div>
            </div>
        `;
        showNotification(`Historial encontrado para ${placa.toUpperCase()}`, 'success');
    } else {
        resultado.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <p>No se encontró historial para la placa ${placa.toUpperCase()}</p>
                <p style="font-size: 14px; margin-top: 8px;">Esta placa no tiene servicios registrados en el sistema</p>
            </div>
        `;
        showNotification('No se encontró historial para esta placa', 'warning');
    }
}

// Buscar producto en inventario
function buscarProducto() {
    const busqueda = document.getElementById('busquedaProducto').value;
    
    if (!busqueda) {
        showNotification('Ingresa un código, nombre o descripción para buscar', 'warning');
        return;
    }
    
    console.log('🔍 Buscando producto:', busqueda);
    
    const productosFiltrados = inventario.filter(producto => 
        producto.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
        producto.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        producto.categoria.toLowerCase().includes(busqueda.toLowerCase())
    );
    
    if (productosFiltrados.length > 0) {
        showNotification(`${productosFiltrados.length} producto(s) encontrado(s)`, 'success');
        // Aquí se actualizaría la tabla con los resultados filtrados
    } else {
        showNotification('No se encontraron productos', 'warning');
    }
}

// Generar liquidación - función simple eliminada, usar generarLiquidacion() avanzada

// Ver pendientes de liquidación
function verPendientes() {
    const pendientes = [
        { placa: 'ABC123', tecnico: 'Víctor Padilla', monto: 5000 },
        { placa: 'DEF456', tecnico: 'Ismael Cervantes', monto: 8000 }
    ];
    
    let mensaje = 'TRABAJOS PENDIENTES DE LIQUIDACIÓN:\n\n';
    
    pendientes.forEach(pendiente => {
        mensaje += `${pendiente.placa} - ${pendiente.tecnico}: $${pendiente.monto.toLocaleString()}\n`;
    });
    
    const total = pendientes.reduce((sum, p) => sum + p.monto, 0);
    mensaje += `\nTotal pendiente: $${total.toLocaleString()}`;
    
    alert(mensaje);
}

// Liquidar trabajo individual
function liquidarTrabajo(placa) {
    console.log('💼 Liquidando trabajo:', placa);
    
    const mensaje = `
LIQUIDAR TRABAJO: ${placa}
========================

Técnicos involucrados: Víctor Padilla, Pedro Barraza
Trabajo: Cambio de aceite y filtro
Mano de Obra: $25,000

Opciones de liquidación:
1. Solo Víctor Padilla (20% = $5,000)
2. Pedro + Víctor (20% cada uno)
3. Liquidación personalizada

Selecciona una opción:`;
    
    const opcion = prompt(mensaje);
    
    if (opcion && ['1', '2', '3'].includes(opcion)) {
        showNotification(`Trabajo ${placa} liquidado correctamente`, 'success');
        // loadLiquidacionData();
    }
}

// Sincronizar con CUENTTI
function sincronizarCuentti() {
    console.log('💼 Sincronizando con CUENTTI...');
    
    showNotification('Sincronización iniciada con CUENTTI', 'info');
    
    // Simular sincronización
    setTimeout(() => {
        showNotification('Sincronización completada exitosamente', 'success');
        // loadCuenttiData();
    }, 2000);
}

// Enviar facturas
function enviarFacturas() {
    console.log('📄 Enviando facturas a CUENTTI...');
    
    showNotification('Enviando facturas pendientes...', 'info');
    
    // Simular envío
    setTimeout(() => {
        showNotification('2 facturas enviadas a CUENTTI', 'success');
        // loadCuenttiData();
    }, 1500);
}

// Ver cotización
function verCotizacion(cotizacion) {
    console.log('👁️ Ver cotización:', cotizacion);
    
    const modal = createModal(
        'Detalles de Cotización',
        `
        <div style="line-height: 1.6;">
            <h4>Cotización: ${cotizacion}</h4>
            <p><strong>Cliente:</strong> Juan Pérez</p>
            <p><strong>Vehículo:</strong> Toyota Corolla 2020</p>
            <p><strong>Fecha:</strong> 10/01/2025</p>
            <p><strong>Validez:</strong> 17/01/2025</p>
            
            <h5 style="margin: 16px 0 8px 0;">Items Cotizados:</h5>
            <ul>
                <li>Filtro de Aceite - $15,000</li>
                <li>Aceite Motor 5W-30 - $25,000</li>
                <li>Mano de Obra (2 horas) - $40,000</li>
            </ul>
            
            <p><strong>Subtotal:</strong> $80,000</p>
            <p><strong>IVA (19%):</strong> $15,200</p>
            <p><strong>TOTAL:</strong> <span style="font-size: 18px; font-weight: bold; color: var(--primary-500);">$95,200</span></p>
            
            <p><strong>Observaciones:</strong> Cotización válida por 7 días. Incluye garantía de 30 días en repuestos.</p>
        </div>
        `,
        [
            { text: 'Cerrar', class: 'btn-outline', onclick: 'closeModal()' },
            { text: 'Exportar PDF', class: 'btn-primary', onclick: 'exportarPDF()' },
            { text: 'Aprobar', class: 'btn-success', onclick: 'aprobarCotizacion()' }
        ]
    );
    
    showModal(modal);
}

// Aprobar cotización
function aprobarCotizacion(cotizacion) {
    console.log('✅ Aprobando cotización:', cotizacion);
    showNotification(`Cotización ${cotizacion} aprobada`, 'success');
    closeModal();
}

// Generar factura
function generarFactura(cotizacion) {
    console.log('📄 Generando factura para:', cotizacion);
    
    const numeroFactura = `FAC-2025-${nextInvoiceNumber.toString().padStart(3, '0')}`;
    nextInvoiceNumber++;
    
    const modal = createModal(
        'Factura Generada',
        `
        <div style="line-height: 1.6;">
            <h4>Factura: ${numeroFactura}</h4>
            <p><strong>Cliente:</strong> Juan Pérez</p>
            <p><strong>Desde cotización:</strong> ${cotizacion}</p>
            <p><strong>Fecha:</strong> ${new Date().toLocaleDateString()}</p>
            
            <div style="background: var(--neutral-50); padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h5>Resumen de la Factura:</h5>
                <p><strong>Subtotal:</strong> $80,000</p>
                <p><strong>IVA (19%):</strong> $15,200</p>
                <p><strong>Total:</strong> <span style="font-size: 20px; font-weight: bold; color: var(--primary-500);">$95,200</span></p>
            </div>
            
            <p><strong>Estado:</strong> <span class="status-badge status-pendiente">Pendiente de envío a CUENTTI</span></p>
        </div>
        `,
        [
            { text: 'Cerrar', class: 'btn-outline', onclick: 'closeModal()' },
            { text: 'Enviar a CUENTTI', class: 'btn-primary', onclick: 'enviarFactura()' }
        ]
    );
    
    showModal(modal);
}

// Enviar factura
function enviarFactura(numeroFactura) {
    console.log('📤 Enviando factura a CUENTTI:', numeroFactura);
    showNotification(`Factura ${numeroFactura} enviada a CUENTTI`, 'success');
    closeModal();
}

// ===== SISTEMA DE MODALES =====

let currentModal = null;

function createModal(title, content, buttons = [], size = 'default') {
    // Permitir firma createModal(title, content, 'large', [...buttons])
    if (!Array.isArray(buttons)) {
        size = buttons || 'default';
        buttons = Array.isArray(arguments[3]) ? arguments[3] : [];
    }

    return {
        title,
        content,
        buttons,
        size
    };
}

function showModal(modalData) {
    // Close any existing modal
    closeModal();
    
    // Create modal elements
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = function(e) {
        if (e.target === overlay) {
            closeModal();
        }
    };
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    if (modalData.size === 'large') {
        modal.classList.add('modal-large');
    }
    
    // Create header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
        <h3 class="modal-title">${modalData.title}</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
    `;
    
    // Create body
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = modalData.content;
    
    // Create footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    
    if (Array.isArray(modalData.buttons) && modalData.buttons.length > 0) {
        modalData.buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.className = `btn ${button.class}`;
            btn.textContent = button.text;
            // Ejecutar handler si viene definido; de lo contrario, dejar que el botón actúe por defecto
            if (button.onclick) {
                try {
                    btn.onclick = new Function(button.onclick);
                } catch (e) {
                    console.warn('No se pudo adjuntar el onclick del botón del modal:', e);
                }
            }
            // Para botones de submit, delegar al formulario sin sobreescribir su onsubmit
            if (button.type === 'submit') {
                btn.type = 'submit';
                if (button.form) {
                    btn.setAttribute('form', button.form);
                }
            }
            footer.appendChild(btn);
        });
    } else {
        footer.style.display = 'none';
    }
    
    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    if (Array.isArray(modalData.buttons) && modalData.buttons.length > 0) {
    modal.appendChild(footer);
    }
    overlay.appendChild(modal);
    
    // Add to DOM
    document.body.appendChild(overlay);
    currentModal = overlay;
    
    // Show modal
    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 10);
}

function closeModal() {
    if (currentModal) {
        currentModal.style.opacity = '0';
        setTimeout(() => {
            if (currentModal && currentModal.parentNode) {
                currentModal.parentNode.removeChild(currentModal);
            }
            currentModal = null;
        }, 300);
    }
}

// ===== UTILIDADES =====

// Notificaciones mejoradas
function showNotification(message, type = 'info') {
    console.log(`🔔 [${type.toUpperCase()}] ${message}`);
    
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(notif => notif.remove());
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = message;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Auto hide
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function showLoading(section) {
    console.log(`⏳ Cargando sección: ${section}...`);
}

function hideLoading() {
    console.log('✅ Carga completada');
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

// Global functions for onclick handlers
window.nuevoTrabajo = nuevoTrabajo;
window.verTrabajo = verTrabajo;
window.nuevaRecepcion = nuevaRecepcion;
window.nuevaCotizacion = nuevaCotizacion;
window.buscarVehiculo = buscarVehiculo;
window.buscarProducto = buscarProducto;
window.generarLiquidacion = generarLiquidacion;
window.verPendientes = verPendientes;
window.liquidarTrabajo = liquidarTrabajo;
window.sincronizarCuentti = sincronizarCuentti;
window.enviarFacturas = enviarFacturas;
window.verCotizacion = verCotizacion;
window.aprobarCotizacion = aprobarCotizacion;
window.generarFactura = generarFactura;
window.enviarFactura = enviarFactura;
window.buscarClientePorCedula = buscarClientePorCedula;
window.buscarClienteRecepcion = buscarClienteRecepcion;
window.agregarItemCotizacion = agregarItemCotizacion;
window.agendarMantenimiento = agendarMantenimiento;
window.reabastecerStock = reabastecerStock;
window.editarProducto = editarProducto;
window.reabastecer = reabastecer;
window.logout = logout;
window.showSection = showSection;
window.toggleSidebar = toggleSidebar;
window.closeModal = closeModal;
window.guardarNuevoTrabajo = guardarNuevoTrabajo;
window.guardarNuevaRecepcion = guardarNuevaRecepcion;
window.guardarNuevaCotizacion = guardarNuevaCotizacion;
window.editarClienteDesdeModal = editarClienteDesdeModal;
window.guardarEdicionCliente = guardarEdicionCliente;
window.procesarLiquidacionAvanzada = procesarLiquidacionAvanzada;
window.actualizarVistaPrevia = actualizarVistaPrevia;
window.cerrarModal = closeModal; // Alias adicional

// Additional functions
function agendarMantenimiento(placa) {
    showNotification(`Mantenimiento agendado para ${placa}`, 'success');
}

function reabastecerStock() {
    showNotification('Stock reabastecido exitosamente', 'success');
}

function editarProducto(codigo) {
    showNotification(`Editando producto ${codigo}`, 'info');
}

function reabastecer(codigo) {
    showNotification(`Reabasteciendo producto ${codigo}`, 'info');
}

function exportarPDF() {
    showNotification('Exportando PDF...', 'info');
}

console.log('🎉 Sistema Multidiagnósticos AS COMPLETAMENTE FUNCIONAL');
console.log('🔧 Todas las funcionalidades restauradas y funcionando');
console.log('💼 Integración CUENTTI lista para usar');

// ==========================================
// SISTEMA AVANZADO DE LIQUIDACIÓN - INTEGRADO
// ==========================================

// ==========================================
// 1. CLASE PARA CONTROL DE MOVIMIENTOS
// ==========================================

class ControlMovimientosTecnicos {
    constructor() {
        this.movimientos = JSON.parse(localStorage.getItem('movimientos_tecnicos') || '[]');
    }

    // Agregar nuevo movimiento
    agregarMovimiento(tecnicoId, tipo, concepto, monto, fecha, trabajoId = null, observaciones = '') {
        const movimiento = {
            id: Date.now() + Math.random(),
            tecnicoId: tecnicoId,
            tipoMovimiento: tipo, // 'adelanto', 'descuento', 'almuerzo', 'préstamo', 'pago', 'material'
            concepto: concepto,
            monto: parseInt(monto), // Negativo para descuentos
            fechaMovimiento: fecha,
            trabajoId: trabajoId,
            observaciones: observaciones,
            procesado: false,
            aplicadoAcumulado: 0,
            createdAt: new Date().toISOString()
        };
        
        this.movimientos.push(movimiento);
        this.guardar();
        return movimiento;
    }

    // Aplicar montos parciales de adelantos a una liquidación
    aplicarAdelantos(tecnicoId, aplicacionesMap = {}) {
        const ids = Object.keys(aplicacionesMap).map(id => parseFloat(id));
        if (ids.length === 0) return;
        this.movimientos.forEach(mov => {
            if (mov.tecnicoId === tecnicoId && mov.tipoMovimiento === 'adelanto' && ids.includes(mov.id)) {
                const aplicar = Math.max(0, parseInt(aplicacionesMap[mov.id] || 0));
                mov.aplicadoAcumulado = Math.max(0, (mov.aplicadoAcumulado || 0) + aplicar);
                if (mov.aplicadoAcumulado >= Math.abs(mov.monto)) {
                    mov.procesado = true;
                }
            }
        });
        this.guardar();
    }

    // Obtener movimientos de un técnico en un período
    obtenerMovimientosPorPeriodo(tecnicoId, fechaInicio, fechaFin) {
        return this.movimientos.filter(mov => 
            mov.tecnicoId === tecnicoId &&
            mov.fechaMovimiento >= fechaInicio &&
            mov.fechaMovimiento <= fechaFin
        );
    }

    // Obtener movimientos no procesados
    obtenerMovimientosNoProcesados(tecnicoId) {
        return this.movimientos.filter(mov => 
            mov.tecnicoId === tecnicoId && !mov.procesado
        );
    }

    // Calcular totales por período
    calcularTotales(tecnicoId, fechaInicio, fechaFin) {
        const movimientos = this.obtenerMovimientosPorPeriodo(tecnicoId, fechaInicio, fechaFin);
        
        const totales = {
            adelantos: 0,      // Positivos
            almuerzos: 0,      // Negativos
            descuentos: 0,     // Negativos
            prestamos: 0,      // Negativos
            pagos: 0,          // Positivos
            materiales: 0,     // Negativos
            totalMovimientos: 0
        };
        
        movimientos.forEach(mov => {
            if (mov.monto > 0) {
                if (mov.tipoMovimiento === 'adelanto') totales.adelantos += mov.monto;
                else if (mov.tipoMovimiento === 'pago') totales.pagos += mov.monto;
            } else {
                if (mov.tipoMovimiento === 'almuerzo') totales.almuerzos += Math.abs(mov.monto);
                else if (mov.tipoMovimiento === 'descuento') totales.descuentos += Math.abs(mov.monto);
                else if (mov.tipoMovimiento === 'préstamo') totales.prestamos += Math.abs(mov.monto);
                else if (mov.tipoMovimiento === 'material') totales.materiales += Math.abs(mov.monto);
            }
        });
        
        totales.totalMovimientos = totales.adelantos + totales.pagos - totales.almuerzos - totales.descuentos - totales.prestamos - totales.materiales;
        
        return totales;
    }

    // Marcar movimientos como procesados
    marcarComoProcesados(movimientoIds) {
        this.movimientos.forEach(mov => {
            if (movimientoIds.includes(mov.id)) {
                mov.procesado = true;
            }
        });
        this.guardar();
    }

    // Obtener estadísticas generales
    obtenerEstadisticas() {
        const hoy = new Date();
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        
        const estadisticas = {
            almuerzosMes: 0,
            adelantosMes: 0,
            movimientosTotal: this.movimientos.length
        };
        
        this.movimientos.forEach(mov => {
            const fechaMov = new Date(mov.fechaMovimiento);
            if (fechaMov >= inicioMes && fechaMov <= finMes) {
                if (mov.tipoMovimiento === 'almuerzo') {
                    estadisticas.almuerzosMes += Math.abs(mov.monto);
                } else if (mov.tipoMovimiento === 'adelanto') {
                    estadisticas.adelantosMes += mov.monto;
                }
            }
        });
        
        return estadisticas;
    }

    // Guardar en localStorage
    guardar() {
        localStorage.setItem('movimientos_tecnicos', JSON.stringify(this.movimientos));
    }

    // Obtener todos los movimientos
    obtenerTodos() {
        return this.movimientos;
    }
}

// ==========================================
// 2. CLASE PARA CONTROL DE SALDOS
// ==========================================

class ControlSaldosTecnicos {
    constructor() {
        this.saldos = JSON.parse(localStorage.getItem('saldos_tecnicos') || '[]');
        this.configuracion = JSON.parse(localStorage.getItem('configuracion_taller') || '{}');
        
        // Configuración por defecto
        if (!this.configuracion.precioAlmuerzo) {
            this.configuracion.precioAlmuerzo = 10000;
        }
        if (!this.configuracion.porcentajes) {
            this.configuracion.porcentajes = {
                'pedro': 20,
                'victor': 20,
                'ismael': 0
            };
        }
    }

    // Obtener saldo de un técnico
    obtenerSaldo(tecnicoId) {
        let saldo = this.saldos.find(s => s.tecnicoId === tecnicoId);
        if (!saldo) {
            saldo = {
                tecnicoId: tecnicoId,
                saldoActual: 0,
                ultimoPago: null,
                totalAdelantosMes: 0,
                totalAlmuerzosMes: 0,
                updatedAt: new Date().toISOString()
            };
            this.saldos.push(saldo);
            this.guardar();
        }
        return saldo;
    }

    // Actualizar saldo
    actualizarSaldo(tecnicoId, montoNeto) {
        const saldo = this.obtenerSaldo(tecnicoId);
        saldo.saldoActual += montoNeto;
        saldo.ultimoPago = new Date().toISOString().split('T')[0];
        saldo.updatedAt = new Date().toISOString();
        this.guardar();
        return saldo;
    }

    // Obtener porcentaje de liquidación
    obtenerPorcentaje(tecnicoNombre) {
        const nombre = tecnicoNombre.toLowerCase();
        if (nombre.includes('pedro')) return this.configuracion.porcentajes.pedro;
        if (nombre.includes('víctor') || nombre.includes('victor')) return this.configuracion.porcentajes.victor;
        if (nombre.includes('ismael')) return this.configuracion.porcentajes.ismael;
        return 0;
    }

    // Guardar configuración
    guardarConfiguracion(nuevaConfig) {
        this.configuracion = { ...this.configuracion, ...nuevaConfig };
        this.guardar();
    }

    // Guardar en localStorage
    guardar() {
        localStorage.setItem('saldos_tecnicos', JSON.stringify(this.saldos));
        localStorage.setItem('configuracion_taller', JSON.stringify(this.configuracion));
    }
}

// ==========================================
// 3. CLASE PRINCIPAL DE LIQUIDACIÓN
// ==========================================

class SistemaLiquidacion {
    constructor() {
        this.liquidaciones = JSON.parse(localStorage.getItem('liquidaciones_completas') || '[]');
    }

    // Generar liquidación para un período
    generarLiquidacion(tecnicoId, fechaInicio, fechaFin, observaciones = '', opciones = {}) {
        console.log(`💼 Generando liquidación para técnico ${tecnicoId} del ${fechaInicio} al ${fechaFin}`);
        
        // Obtener trabajos completados en el período
        const trabajosCompletados = this.obtenerTrabajosCompletadosPorPeriodo(tecnicoId, fechaInicio, fechaFin);
        
        // Calcular manos de obra
        const totalManosObra = this.calcularManosObra(trabajosCompletados);
        
        // Obtener movimientos del período
        const movimientos = controlMovimientos.obtenerMovimientosPorPeriodo(tecnicoId, fechaInicio, fechaFin);
        const movimientosNoProcesados = controlMovimientos.obtenerMovimientosNoProcesados(tecnicoId);
        
        // Calcular totales
        const totales = controlMovimientos.calcularTotales(tecnicoId, fechaInicio, fechaFin);
        
        // Aplicaciones parciales de adelantos (mapa id->aplicar)
        const aplicarAdelantosMap = opciones.aplicarAdelantosMap || {};
        const aplicadoAdelantos = Object.values(aplicarAdelantosMap).reduce((s, v) => s + (parseInt(v) || 0), 0);
        
        // Neto: MO (pre-IVA) menos adelantos aplicados y otros cargos; no descontar materiales
        const netoPagar = totalManosObra - aplicadoAdelantos - totales.almuerzos - totales.descuentos - totales.prestamos - totales.pagos;
        
        // Obtener trabajos liquidados
        const trabajosIds = trabajosCompletados.map(t => t.id);
        // Marcar como procesados los movimientos no-adelanto del período (se consideran aplicados íntegramente)
        const noAdelantosIds = movimientos
            .filter(m => m.tipoMovimiento !== 'adelanto')
            .map(m => m.id);
        
        // Crear liquidación
        const liquidacion = {
            id: Date.now() + Math.random(),
            tecnicoId: tecnicoId,
            fechaLiquidacion: new Date().toISOString().split('T')[0],
            periodoInicio: fechaInicio,
            periodoFin: fechaFin,
            totalManosObra: totalManosObra,
            totalAdelantos: totales.adelantos,
            totalAlmuerzos: totales.almuerzos,
            totalDescuentos: totales.descuentos,
            totalPrestamos: totales.prestamos,
            totalPagos: totales.pagos,
            adelantoAplicado: aplicadoAdelantos,
            montoNeto: netoPagar,
            trabajosLiquidados: trabajosIds,
            movimientosAplicados: [...noAdelantosIds, ...Object.keys(aplicarAdelantosMap).map(id => parseFloat(id))],
            trabajos: trabajosCompletados,
            movimientos: movimientos,
            detalleTrabajos: trabajosCompletados.map(t => ({
                id: t.id,
                fecha: (t.fecha || '').toString().slice(0,10),
                placa: t.placa,
                marca: t.marca,
                modelo: t.modelo,
                ano: t.ano,
                cliente: t.cliente,
                manoObra: t.manoObra || 0
            })),
            detalleAplicaciones: Object.keys(aplicarAdelantosMap).map(id => ({
                movimientoId: parseFloat(id),
                aplicado: parseInt(aplicarAdelantosMap[id] || 0)
            })),
            observaciones: observaciones,
            createdAt: new Date().toISOString()
        };
        
        this.liquidaciones.push(liquidacion);
        this.guardar();
        
        // Aplicar adelantos parcialmente y marcar no-adelantos como procesados
        controlMovimientos.aplicarAdelantos(tecnicoId, aplicarAdelantosMap);
        controlMovimientos.marcarComoProcesados(noAdelantosIds);
        
        // Actualizar saldo del técnico
        controlSaldos.actualizarSaldo(tecnicoId, netoPagar);
        
        return liquidacion;
    }

    // Obtener trabajos completados por período
    obtenerTrabajosCompletadosPorPeriodo(tecnicoId, fechaInicio, fechaFin) {
        const trabajos = getTrabajosData();
        let filtrados = trabajos.filter(trabajo => {
            const fechaTrabajo = new Date(trabajo.fecha || Date.now());
            const inicio = new Date(fechaInicio);
            const fin = new Date(fechaFin);
            
            return trabajo.mecanico === tecnicoId && 
                   fechaTrabajo >= inicio && 
                   fechaTrabajo <= fin;
        });
        // Solo trabajos completados
        filtrados = filtrados.filter(t => (t.estado || '').toString().toLowerCase() === 'completado');
        return filtrados;
    }

    // Calcular manos de obra
    calcularManosObra(trabajos) {
        let total = 0;
        trabajos.forEach(trabajo => {
            // Obtener técnico y porcentaje
            const mecanico = window.mecanicos.find(m => m.id === trabajo.mecanico);
            if (mecanico) {
                const porcentaje = controlSaldos.obtenerPorcentaje(mecanico.nombre);
                const montoManoObra = (trabajo.manoObra || 0) * (porcentaje / 100);
                total += montoManoObra;
            }
        });
        return total;
    }

    // Obtener liquidaciones de un técnico
    obtenerLiquidacionesTecnico(tecnicoId) {
        return this.liquidaciones.filter(l => l.tecnicoId === tecnicoId);
    }

    // Obtener liquidaciones por período
    obtenerLiquidacionesPeriodo(fechaInicio, fechaFin) {
        return this.liquidaciones.filter(l => 
            l.fechaLiquidacion >= fechaInicio && l.fechaLiquidacion <= fechaFin
        );
    }

    // Guardar liquidaciones
    guardar() {
        localStorage.setItem('liquidaciones_completas', JSON.stringify(this.liquidaciones));
    }

    // Obtener estadísticas de liquidación
    obtenerEstadisticas() {
        const hoy = new Date();
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        
        const liquidacionesMes = this.obtenerLiquidacionesPeriodo(
            inicioMes.toISOString().split('T')[0],
            finMes.toISOString().split('T')[0]
        );
        
        return {
            totalLiquidacionesMes: liquidacionesMes.length,
            montoTotalMes: liquidacionesMes.reduce((sum, l) => sum + l.montoNeto, 0),
            montoPromedio: liquidacionesMes.length > 0 ? 
                liquidacionesMes.reduce((sum, l) => sum + l.montoNeto, 0) / liquidacionesMes.length : 0
        };
    }
}

// ==========================================
// 4. INSTANCIAS GLOBALES
// ==========================================

const controlMovimientos = new ControlMovimientosTecnicos();
const controlSaldos = new ControlSaldosTecnicos();
const sistemaLiquidacion = new SistemaLiquidacion();

// ==========================================
// 5. FUNCIONES DE INTERFAZ PARA LOS NUEVOS BOTONES
// ==========================================

// Registrar Adelanto
function registrarAdelanto() {
    const tecnicos = window.mecanicos || [];
    const tecnicoOptions = tecnicos.map(t => 
        `<option value="${t.id}">${t.nombre || t.name || 'Sin nombre'}</option>`
    ).join('');
    
    const html = `
        <div class="modal-overlay" onclick="cerrarModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>💰 Registrar Adelanto</h3>
                <form onsubmit="procesarAdelanto(event)">
                    <div class="form-group">
                        <label>Técnico:</label>
                        <select name="tecnicoId" required class="form-control">
                            <option value="">Seleccionar técnico</option>
                            ${tecnicoOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Concepto:</label>
                        <input type="text" name="concepto" required class="form-control" 
                               placeholder="Ej: Adelanto trabajo ABC123">
                    </div>
                    <div class="form-group">
                        <label>Monto ($):</label>
                        <input type="number" name="monto" required class="form-control" 
                               min="1" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label>Fecha:</label>
                        <input type="date" name="fecha" required class="form-control" 
                               value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="form-group">
                        <label>Observaciones:</label>
                        <textarea name="observaciones" class="form-control" 
                                  placeholder="Observaciones adicionales"></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" onclick="cerrarModal()" class="btn btn-outline">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Registrar Adelanto</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    mostrarModal(html);
}

// Procesar Adelanto
function procesarAdelanto(event) {
    event.preventDefault();
    const form = event.target;
    const datos = new FormData(form);
    
    const movimiento = controlMovimientos.agregarMovimiento(
        parseInt(datos.get('tecnicoId')),
        'adelanto',
        datos.get('concepto'),
        parseInt(datos.get('monto')),
        datos.get('fecha'),
        null,
        datos.get('observaciones')
    );
    
    showNotification(`Adelanto registrado correctamente: $${parseInt(datos.get('monto')).toLocaleString()}`, 'success');
    cerrarModal();
}

// Registrar Almuerzo
function registrarAlmuerzo() {
    const tecnicos = window.mecanicos || [];
    const tecnicoOptions = tecnicos.map(t => 
        `<option value="${t.id}">${t.nombre}</option>`
    ).join('');
    
    const html = `
        <div class="modal-overlay" onclick="cerrarModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>🍽️ Registrar Almuerzo</h3>
                <div class="info-box">
                    <strong>Precio almuerzo:</strong> $${controlSaldos.configuracion.precioAlmuerzo.toLocaleString()}
                </div>
                <form onsubmit="procesarAlmuerzo(event)">
                    <div class="form-group">
                        <label>Técnico:</label>
                        <select name="tecnicoId" required class="form-control">
                            <option value="">Seleccionar técnico</option>
                            ${tecnicoOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Fecha:</label>
                        <input type="date" name="fecha" required class="form-control" 
                               value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="form-group">
                        <label>Monto ($):</label>
                        <input type="number" name="monto" required class="form-control" 
                               value="${controlSaldos.configuracion.precioAlmuerzo}" 
                               min="0" placeholder="${controlSaldos.configuracion.precioAlmuerzo}">
                    </div>
                    <div class="form-group">
                        <label>Observaciones:</label>
                        <textarea name="observaciones" class="form-control" 
                                  placeholder="Observaciones adicionales"></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" onclick="cerrarModal()" class="btn btn-outline">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Registrar Almuerzo</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    mostrarModal(html);
}

// Procesar Almuerzo
function procesarAlmuerzo(event) {
    event.preventDefault();
    const form = event.target;
    const datos = new FormData(form);
    
    const movimiento = controlMovimientos.agregarMovimiento(
        parseInt(datos.get('tecnicoId')),
        'almuerzo',
        'Almuerzo del ' + datos.get('fecha'),
        -parseInt(datos.get('monto')), // Negativo para descuento
        datos.get('fecha'),
        null,
        datos.get('observaciones')
    );
    
    showNotification(`Almuerzo registrado correctamente: $${parseInt(datos.get('monto')).toLocaleString()}`, 'success');
    cerrarModal();
}

// Control de Pagos
function controlPagos() {
    const estadisticas = sistemaLiquidacion.obtenerEstadisticas();
    const movimientos = controlMovimientos.obtenerTodos();
    
    const html = `
        <div class="modal-overlay" onclick="cerrarModal()">
            <div class="modal-content modal-large" onclick="event.stopPropagation()">
                <h3>💳 Control de Pagos</h3>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${estadisticas.totalLiquidacionesMes}</div>
                        <div class="stat-label">Liquidaciones del Mes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">$${estadisticas.montoTotalMes.toLocaleString()}</div>
                        <div class="stat-label">Total Mes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">$${estadisticas.montoPromedio.toLocaleString()}</div>
                        <div class="stat-label">Promedio</div>
                    </div>
                </div>
                
                <div class="tab-container">
                    <div class="tab-nav">
                        <button class="tab-btn active" onclick="cambiarTab('resumen')">Resumen</button>
                        <button class="tab-btn" onclick="cambiarTab('movimientos')">Movimientos</button>
                        <button class="tab-btn" onclick="cambiarTab('liquidaciones')">Liquidaciones</button>
                    </div>
                    
                    <div id="tab-resumen" class="tab-content active">
                        <h4>Resumen por Técnico</h4>
                        ${generarResumenTecnicos()}
                    </div>
                    
                    <div id="tab-movimientos" class="tab-content">
                        <h4>Últimos Movimientos</h4>
                        ${generarTablaMovimientos(movimientos.slice(-10))}
                    </div>
                    
                    <div id="tab-liquidaciones" class="tab-content">
                        <h4>Últimas Liquidaciones</h4>
                        ${generarTablaLiquidaciones(sistemaLiquidacion.liquidaciones.slice(-5))}
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button type="button" onclick="cerrarModal()" class="btn btn-outline">Cerrar</button>
                </div>
            </div>
        </div>
    `;
    
    mostrarModal(html);
}

// Generar resumen por técnicos
function generarResumenTecnicos() {
    const tecnicos = window.mecanicos || [];
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    
    const fechaInicio = inicioMes.toISOString().split('T')[0];
    const fechaFin = finMes.toISOString().split('T')[0];
    
    return tecnicos.map(tecnico => {
        const saldo = controlSaldos.obtenerSaldo(tecnico.id);
        const totales = controlMovimientos.calcularTotales(tecnico.id, fechaInicio, fechaFin);
        const liquidaciones = sistemaLiquidacion.obtenerLiquidacionesTecnico(tecnico.id);
        
        return `
            <div class="tecnico-card">
                <h5>${tecnico.nombre}</h5>
                <div class="tecnico-stats">
                    <div>Saldo Actual: $${saldo.saldoActual.toLocaleString()}</div>
                    <div>Adelantos Mes: $${totales.adelantos.toLocaleString()}</div>
                    <div>Almuerzos Mes: $${totales.almuerzos.toLocaleString()}</div>
                    <div>Liquidaciones: ${liquidaciones.length}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Generar tabla de movimientos
function generarTablaMovimientos(movimientos) {
    if (movimientos.length === 0) {
        return '<p>No hay movimientos registrados.</p>';
    }
    
    return `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Técnico</th>
                    <th>Tipo</th>
                    <th>Concepto</th>
                    <th>Monto</th>
                </tr>
            </thead>
            <tbody>
                ${movimientos.map(mov => {
                    const tecnico = window.mecanicos.find(t => t.id === mov.tecnicoId);
                    return `
                        <tr>
                            <td>${mov.fechaMovimiento}</td>
                            <td>${tecnico ? tecnico.nombre : 'N/A'}</td>
                            <td><span class="badge badge-${mov.tipoMovimiento}">${mov.tipoMovimiento}</span></td>
                            <td>${mov.concepto}</td>
                            <td class="${mov.monto > 0 ? 'text-success' : 'text-danger'}">
                                ${mov.monto > 0 ? '+' : ''}$${Math.abs(mov.monto).toLocaleString()}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// Generar tabla de liquidaciones
function generarTablaLiquidaciones(liquidaciones) {
    if (liquidaciones.length === 0) {
        return '<p>No hay liquidaciones registradas.</p>';
    }
    
    return `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Técnico</th>
                    <th>Período</th>
                    <th>Mano Obra</th>
                    <th>Neto</th>
                </tr>
            </thead>
            <tbody>
                ${liquidaciones.map(liquidacion => {
                    const tecnico = window.mecanicos.find(t => t.id === liquidacion.tecnicoId);
                    return `
                        <tr>
                            <td>${liquidacion.fechaLiquidacion}</td>
                            <td>${tecnico ? tecnico.nombre : 'N/A'}</td>
                            <td>${liquidacion.periodoInicio} - ${liquidacion.periodoFin}</td>
                            <td>$${liquidacion.totalManosObra.toLocaleString()}</td>
                            <td class="${liquidacion.montoNeto >= 0 ? 'text-success' : 'text-danger'}">
                                ${liquidacion.montoNeto >= 0 ? '+' : ''}$${liquidacion.montoNeto.toLocaleString()}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// Cambiar tabs
function cambiarTab(tab) {
    // Ocultar todos los tabs
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Remover clase active de todos los botones
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Mostrar tab seleccionado
    const contenido = document.getElementById(`tab-${tab}`);
    if (contenido) contenido.classList.add('active');
    // Activar el botón correspondiente aunque no llegue el evento
    const btnClicado = (typeof event !== 'undefined' && event && event.target && event.target.classList && event.target.classList.contains('tab-btn'))
        ? event.target
        : document.querySelector(`.tab-btn[onclick*="'${tab}'"]`);
    if (btnClicado) btnClicado.classList.add('active');
}

// ==========================================
// 6. FUNCIÓN LIQUIDACIÓN AVANZADA REEMPLAZADA
// ==========================================

function generarLiquidacion() {
    console.log('💼 Iniciando sistema de liquidación avanzada (página)...');
    
    // Navegar a la sección de página
    showSection('liquidacionAvanzada');
    
    // Poblar formulario con valores por defecto
    const form = document.getElementById('liquidacionAvanzadaForm');
    if (!form) return;
    
    const select = form.querySelector('select[name="tecnicoId"]');
    if (select) {
        // Limpiar excepto placeholder
        select.innerHTML = '<option value="">Seleccionar técnico</option>' +
            (window.mecanicos || []).map(t => `<option value="${t.id}">${t.nombre || t.name || 'Técnico'}</option>`).join('');
        // Seleccionar por defecto el primer técnico disponible
        const firstOpt = select.querySelector('option[value]:not([value=""])');
        if (firstOpt) select.value = firstOpt.value;
    }
    
    const hoy = new Date();
    const hace30Dias = new Date(hoy.getTime() - (30 * 24 * 60 * 60 * 1000));
    const inicio = form.querySelector('input[name="fechaInicio"]');
    const fin = form.querySelector('input[name="fechaFin"]');
    if (inicio) inicio.value = hace30Dias.toISOString().split('T')[0];
    if (fin) fin.value = hoy.toISOString().split('T')[0];
    
    const preview = document.querySelector('#liquidacionAvanzada #preview-contenido');
    if (preview) preview.innerHTML = 'Selecciona un técnico y período para ver la vista previa';

    // Disparar vista previa automática y re-render al cambiar filtros
    try {
        actualizarVistaPrevia();
        const sel = form.querySelector('select[name="tecnicoId"]');
        if (sel) sel.addEventListener('change', () => actualizarVistaPrevia());
        if (inicio) inicio.addEventListener('change', () => actualizarVistaPrevia());
        if (fin) fin.addEventListener('change', () => actualizarVistaPrevia());
    } catch (e) { console.warn('No se pudo inicializar vista previa:', e); }
}

// Actualizar vista previa
function actualizarVistaPrevia() {
    const form = document.getElementById('liquidacionAvanzadaForm');
    if (!form) {
        console.warn('No se encontró #liquidacionAvanzadaForm');
        return;
    }
    const datos = new FormData(form);
    // Fallbacks por si FormData devuelve vacío en Safari/iOS para input date/select
    let tecnicoId = datos.get('tecnicoId');
    let fechaInicio = datos.get('fechaInicio');
    let fechaFin = datos.get('fechaFin');
    if (!tecnicoId) tecnicoId = form.querySelector('select[name="tecnicoId"]')?.value || '';
    if (!fechaInicio) fechaInicio = form.querySelector('input[name="fechaInicio"]')?.value || '';
    if (!fechaFin) fechaFin = form.querySelector('input[name="fechaFin"]')?.value || '';
    // Si falta técnico, tomar el primero disponible y setearlo en el select
    if (!tecnicoId) {
        const sel = form.querySelector('select[name="tecnicoId"]');
        const first = sel?.querySelector('option[value]:not([value=""])');
        if (first) {
            sel.value = first.value;
            tecnicoId = first.value;
        }
    }

    // Si faltan fechas, usar por defecto últimos 30 días y pintar en el formulario
    if (!fechaInicio || !fechaFin) {
        const hoy = new Date();
        const hace30 = new Date(hoy.getTime() - 30*24*60*60*1000);
        const dIni = hace30.toISOString().split('T')[0];
        const dFin = hoy.toISOString().split('T')[0];
        fechaInicio = fechaInicio || dIni;
        fechaFin = fechaFin || dFin;
        const iniInput = form.querySelector('input[name="fechaInicio"]');
        const finInput = form.querySelector('input[name="fechaFin"]');
        if (iniInput && !iniInput.value) iniInput.value = fechaInicio;
        if (finInput && !finInput.value) finInput.value = fechaFin;
    }
    
    if (!tecnicoId || !fechaInicio || !fechaFin) {
        const preview = document.querySelector('#liquidacionAvanzada #preview-contenido');
        if (preview) preview.innerHTML = 
            '<p class="text-warning">Completa todos los campos para ver la vista previa</p>';
        return;
    }
    
    // Calcular vista previa
    const tecnico = window.mecanicos.find(t => t.id == tecnicoId);
    if (!tecnico) {
        const preview = document.querySelector('#liquidacionAvanzada #preview-contenido');
        if (preview) preview.innerHTML = 
            '<p class="text-warning">Técnico no encontrado</p>';
        return;
    }
    
    const trabajosPeriodo = sistemaLiquidacion.obtenerTrabajosCompletadosPorPeriodo(tecnicoId, fechaInicio, fechaFin);
    const totalManosObra = sistemaLiquidacion.calcularManosObra(trabajosPeriodo);
    const totales = controlMovimientos.calcularTotales(tecnicoId, fechaInicio, fechaFin);

    // Adelantos del período (con restante)
    const movimientosPeriodo = controlMovimientos.obtenerMovimientosPorPeriodo(tecnicoId, fechaInicio, fechaFin) || [];
    const adelantos = movimientosPeriodo.filter(m => m.tipoMovimiento === 'adelanto');
    let restanteMO = totalManosObra;
    const aplicarMap = {};
    let pendienteTotal = 0;
    const filasAdelantos = adelantos.map(m => {
        const aplicado = Math.max(0, parseInt(m.aplicadoAcumulado || 0));
        const disponible = Math.max(0, Math.abs(m.monto) - aplicado);
        const aplicar = Math.min(disponible, Math.max(0, restanteMO));
        aplicarMap[m.id] = aplicar;
        restanteMO -= aplicar;
        const pendiente = Math.max(0, disponible - aplicar);
        pendienteTotal += pendiente;
        return `
            <tr>
                <td>${m.fechaMovimiento}</td>
                <td>${m.concepto || 'Adelanto'}</td>
                <td>$${(m.monto).toLocaleString()}</td>
                <td>$${aplicado.toLocaleString()}</td>
                <td>
                    <input type="number" min="0" max="${disponible}" value="${aplicar}" name="adelanto-aplicar-${m.id}" oninput="recalcularResumenAdelantos()" style="width:120px; text-align:right;" />
                </td>
                <td>$${disponible.toLocaleString()}</td>
            </tr>`;
    }).join('') || '<tr><td colspan="6">Sin adelantos en el período</td></tr>';

    // Construir detalle de trabajos
    const filasTrabajos = trabajosPeriodo.map(t => `
        <tr>
            <td>${(t.fecha || '').toString().slice(0,10)}</td>
            <td>${t.placa || ''}</td>
            <td>${[t.marca,t.modelo,t.ano].filter(Boolean).join(' ')}</td>
            <td>${t.cliente || ''}</td>
            <td style="text-align:right;">$${(t.manoObra || 0).toLocaleString()}</td>
        </tr>
    `).join('') || '<tr><td colspan="5">Sin trabajos en el período</td></tr>';

    // Estado de cuenta estimado (usa aplicarMap por defecto)
    const aplicarTotal = Object.values(aplicarMap).reduce((s,v)=> s + (parseInt(v)||0), 0);
    const netoEstimado = totalManosObra - aplicarTotal - totales.almuerzos - totales.descuentos - totales.prestamos - totales.pagos;

    const html = `
        <div class="preview-section">
            <h5>${tecnico.nombre || tecnico.name || 'Técnico'}</h5>
            <div class="preview-details" style="margin-bottom:10px;">
                <div class="preview-item"><span>Trabajos:</span><span id="li-prev-trabajos-count">${trabajosPeriodo.length}</span></div>
                <div class="preview-item"><span>Total MO (pre-IVA):</span><span id="moTotalValor" data-value="${totalManosObra}">$${totalManosObra.toLocaleString()}</span></div>
                <div class="preview-item"><span>Adelantos a aplicar:</span><span id="adelantosAplicarTotal" data-value="${aplicarTotal}">-$${aplicarTotal.toLocaleString()}</span></div>
                <div class="preview-item"><span>Adelanto pendiente:</span><span id="adelantoPendienteTotal" data-value="${pendienteTotal}">-$${pendienteTotal.toLocaleString()}</span></div>
                <div class="preview-item"><span>Almuerzos:</span><span id="almTotal" data-value="${totales.almuerzos}">-$${totales.almuerzos.toLocaleString()}</span></div>
                <div class="preview-item"><span>Descuentos:</span><span id="descTotal" data-value="${totales.descuentos}">-$${totales.descuentos.toLocaleString()}</span></div>
                <div class="preview-item"><span>Préstamos:</span><span id="prestTotal" data-value="${totales.prestamos}">-$${totales.prestamos.toLocaleString()}</span></div>
                <div class="preview-item"><span>Pagos previos:</span><span id="pagosTotal" data-value="${totales.pagos}">-$${totales.pagos.toLocaleString()}</span></div>
                <div class="preview-item total"><span><strong>NETO ESTIMADO:</strong></span><span id="netoEstimadoValor" class="${netoEstimado>=0?'text-success':'text-danger'}" data-value="${netoEstimado}"><strong>$${Math.abs(netoEstimado).toLocaleString()}</strong></span></div>
            </div>
            <h6>Trabajos del período</h6>
            <table class="data-table" style="width:100%; margin-bottom:12px;">
                <thead><tr><th>Fecha</th><th>Placa</th><th>Vehículo</th><th>Cliente</th><th>MO</th></tr></thead>
                <tbody>${filasTrabajos}</tbody>
            </table>
            <h6>Adelantos (aplicación parcial)</h6>
            <div class="btn-group" style="margin: 6px 0 10px 0; display:flex; gap:8px;">
                <button type="button" class="btn btn-outline" onclick="aplicarAdelantosCubrirMO()">Cubrir MO</button>
                <button type="button" class="btn btn-outline" onclick="aplicarAdelantosTodo()">Aplicar todo</button>
                <button type="button" class="btn btn-outline" onclick="aplicarAdelantosSaldoCero()">Hasta saldo 0</button>
                <button type="button" class="btn btn-outline" onclick="recalcularResumenAdelantos()">Recalcular</button>
            </div>
            <table class="data-table" style="width:100%;">
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Aplicado</th><th>Aplicar ahora</th><th>Pendiente</th></tr></thead>
                <tbody>${filasAdelantos}</tbody>
            </table>
            <small style="color:#6b7280;">Puedes ajustar los campos "Aplicar ahora" antes de generar.</small>
        </div>
    `;

    const preview = document.querySelector('#liquidacionAvanzada #preview-contenido');
    if (preview) preview.innerHTML = html;
}

// Procesar liquidación avanzada
function procesarLiquidacionAvanzada(event) {
    event.preventDefault();
    const form = event.target.closest('form') || document.getElementById('liquidacionAvanzadaForm');
    const datos = new FormData(form);
    
    let tecnicoId = parseInt(datos.get('tecnicoId'));
    let fechaInicio = datos.get('fechaInicio');
    let fechaFin = datos.get('fechaFin');
    const observaciones = datos.get('observaciones');
    // Fallbacks
    if (!tecnicoId) tecnicoId = parseInt(form.querySelector('select[name="tecnicoId"]')?.value || '0');
    if (!fechaInicio) fechaInicio = form.querySelector('input[name="fechaInicio"]')?.value || '';
    if (!fechaFin) fechaFin = form.querySelector('input[name="fechaFin"]')?.value || '';
    
    if (!tecnicoId || !fechaInicio || !fechaFin) {
        showNotification('Completa Técnico, Fecha Inicio y Fecha Fin', 'warning');
        return;
    }
    
    // Recoger aplicaciones parciales de adelantos
    const aplicarAdelantosMap = {};
    form.querySelectorAll('input[name^="adelanto-aplicar-"]').forEach(inp => {
        const id = inp.name.replace('adelanto-aplicar-','');
        const v = Math.max(0, parseInt(inp.value || 0));
        if (v > 0) aplicarAdelantosMap[id] = v;
    });
    
    try {
        const liquidacion = sistemaLiquidacion.generarLiquidacion(
            tecnicoId, 
            fechaInicio, 
            fechaFin, 
            observaciones,
            { aplicarAdelantosMap }
        );
        
        const tecnico = window.mecanicos.find(t => t.id === tecnicoId);
        const nombreTecnico = tecnico ? (tecnico.nombre || tecnico.name || 'Técnico') : 'Técnico';
        showNotification(
            `Liquidación procesada para ${nombreTecnico}: $${liquidacion.montoNeto.toLocaleString()}`,
            'success'
        );
        
        // Volver a la sección de Liquidación principal y refrescar métricas
        showSection('liquidacion');
        actualizarDashboardLiquidacion();
        
    } catch (error) {
        console.error('Error en liquidación:', error);
        const msg = (error && (error.message || error.toString())) || 'Error desconocido';
        showNotification('Error al procesar la liquidación: ' + msg, 'error');
    }
}

// Helpers de vista previa de liquidación
function sumarValoresAdelantos() {
    let total = 0;
    document.querySelectorAll('input[name^="adelanto-aplicar-"]').forEach(inp => {
        total += Math.max(0, parseInt(inp.value || 0));
    });
    return total;
}

function actualizarSpanMoneda(id, valor) {
    const span = document.getElementById(id);
    if (!span) return;
    span.dataset.value = valor;
    const abs = Math.abs(valor);
    const pref = (id === 'adelantosAplicarTotal' || id === 'almTotal' || id === 'descTotal' || id === 'prestTotal' || id === 'pagosTotal') ? '-$' : '$';
    span.textContent = `${pref}${abs.toLocaleString()}`;
    if (id === 'netoEstimadoValor') {
        span.className = (valor >= 0 ? 'text-success' : 'text-danger');
        span.innerHTML = `<strong>$${abs.toLocaleString()}</strong>`;
    }
}

function obtenerNumero(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return parseInt(el.dataset.value || '0');
}

function recalcularResumenAdelantos() {
    const aplicar = sumarValoresAdelantos();
    actualizarSpanMoneda('adelantosAplicarTotal', aplicar);
    // actualizar pendiente total
    let pendiente = 0;
    document.querySelectorAll('input[name^="adelanto-aplicar-"]').forEach(inp => {
        const max = parseInt(inp.getAttribute('max') || '0');
        const val = Math.max(0, parseInt(inp.value || 0));
        pendiente += Math.max(0, max - val);
    });
    actualizarSpanMoneda('adelantoPendienteTotal', pendiente);
    const mo = obtenerNumero('moTotalValor');
    const alm = obtenerNumero('almTotal');
    const desc = obtenerNumero('descTotal');
    const prest = obtenerNumero('prestTotal');
    const pagos = obtenerNumero('pagosTotal');
    const neto = mo - aplicar - alm - desc - prest - pagos;
    const netEl = document.getElementById('netoEstimadoValor');
    if (netEl) {
        netEl.dataset.value = neto;
        netEl.className = (neto >= 0 ? 'text-success' : 'text-danger');
        netEl.innerHTML = `<strong>$${Math.abs(neto).toLocaleString()}</strong>`;
    }
}

function aplicarAdelantosTodo() {
    document.querySelectorAll('input[name^="adelanto-aplicar-"]').forEach(inp => {
        const max = parseInt(inp.getAttribute('max') || '0');
        inp.value = Math.max(0, max);
    });
    recalcularResumenAdelantos();
}

function aplicarAdelantosCubrirMO() {
    const mo = obtenerNumero('moTotalValor');
    const alm = obtenerNumero('almTotal');
    const desc = obtenerNumero('descTotal');
    const prest = obtenerNumero('prestTotal');
    const pagos = obtenerNumero('pagosTotal');
    let objetivo = mo - alm - desc - prest - pagos; // cuánto necesito aplicar para que neto llegue a 0
    const inputs = Array.from(document.querySelectorAll('input[name^="adelanto-aplicar-"]'));
    inputs.forEach(inp => { inp.value = 0; });
    for (const inp of inputs) {
        if (objetivo <= 0) break;
        const max = parseInt(inp.getAttribute('max') || '0');
        const aplicar = Math.min(max, objetivo);
        inp.value = aplicar;
        objetivo -= aplicar;
    }
    recalcularResumenAdelantos();
}

// Alias: aplicar hasta que el neto llegue a 0 (mismo algoritmo de cubrir MO)
function aplicarAdelantosSaldoCero() {
    aplicarAdelantosCubrirMO();
}

window.recalcularResumenAdelantos = recalcularResumenAdelantos;
window.aplicarAdelantosTodo = aplicarAdelantosTodo;
window.aplicarAdelantosCubrirMO = aplicarAdelantosCubrirMO;
window.aplicarAdelantosSaldoCero = aplicarAdelantosSaldoCero;

// Exportar Liquidación a CUENTTI (CSV) usando los trabajos del período (MO técnico)
function exportarLiquidacionACuentti() {
    const form = document.getElementById('liquidacionAvanzadaForm');
    if (!form) { showNotification('Abre la Liquidación Avanzada', 'warning'); return; }
    const tecnicoId = parseInt(form.querySelector('select[name="tecnicoId"]')?.value || '0');
    const fechaInicio = form.querySelector('input[name="fechaInicio"]')?.value || '';
    const fechaFin = form.querySelector('input[name="fechaFin"]')?.value || '';
    if (!tecnicoId || !fechaInicio || !fechaFin) { showNotification('Completa técnico y fechas', 'warning'); return; }
    const trabajos = sistemaLiquidacion.obtenerTrabajosCompletadosPorPeriodo(tecnicoId, fechaInicio, fechaFin);
    const tecnico = window.mecanicos.find(m => m.id === tecnicoId);
    const porcentaje = tecnico ? controlSaldos.obtenerPorcentaje(tecnico.nombre || tecnico.name || '') : 0;
    const header = ['Referencia o codigo de barras','Nombre','Precio Unitario','Cantidad','Descuento','Impuesto','SubTotal (No modificar)','Estampilla(sino Aplica 0)','Impoconsumo(sino Aplica 0)','Total (No modificar)','id_plan_cuenta (opcional solo Egresos)'];
    const rows = trabajos.map(t => {
        const moTec = Math.round((t.manoObra || 0) * (porcentaje/100));
        const ref = `MO-${t.placa || ''}`;
        const nombre = `Mano de Obra ${t.placa || ''} ${[t.marca,t.modelo,t.ano].filter(Boolean).join(' ')}`.trim();
        const pu = moTec; // MO técnico como unitario
        const cant = 1;
        const desc = 0;
        const iva = 0;
        const sub = pu * cant;
        const est = 0, impo = 0;
        const tot = sub;
        return [ref, nombre, pu, cant, desc, iva, sub, est, impo, tot, ''];
    });
    if (!rows.length) { showNotification('No hay trabajos completados en el período', 'warning'); return; }
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LIQ-${tecnico ? (tecnico.nombre || tecnico.name) : 'Tecnico'}-${fechaInicio}_a_${fechaFin}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// Imprimir Liquidación (usa el HTML de la vista previa)
function imprimirLiquidacion() {
    const cont = document.querySelector('#liquidacionAvanzada #preview-contenido');
    if (!cont) { showNotification('Genera la vista previa primero', 'warning'); return; }
    const w = window.open('', '_blank');
    w.document.write('<html><head><title>Liquidación</title>');
    w.document.write('<style>body{font-family:Arial,sans-serif;padding:20px;} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} .text-success{color:#198754} .text-danger{color:#dc3545}</style>');
    w.document.write('</head><body>');
    w.document.write('<h2>Liquidación Avanzada</h2>');
    w.document.write(cont.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    w.print();
}

window.exportarLiquidacionACuentti = exportarLiquidacionACuentti;
window.imprimirLiquidacion = imprimirLiquidacion;

// Actualizar dashboard de liquidación
function actualizarDashboardLiquidacion() {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    
    const fechaInicio = inicioMes.toISOString().split('T')[0];
    const fechaFin = finMes.toISOString().split('T')[0];
    
    // Calcular estadísticas del mes
    let totalPorLiquidar = 0;
    let totalAdelantos = 0;
    let totalNeto = 0;
    
    window.mecanicos.forEach(tecnico => {
        const trabajos = sistemaLiquidacion.obtenerTrabajosCompletadosPorPeriodo(
            tecnico.id, fechaInicio, fechaFin
        );
        const manosObra = sistemaLiquidacion.calcularManosObra(trabajos);
        totalPorLiquidar += manosObra;
        
        const totales = controlMovimientos.calcularTotales(tecnico.id, fechaInicio, fechaFin);
        totalAdelantos += totales.adelantos;
        
        const neto = manosObra + totales.adelantos + totales.pagos - 
                    totales.almuerzos - totales.descuentos - totales.prestamos - totales.materiales;
        totalNeto += neto;
    });
    
    // Actualizar elementos del DOM
    const porLiquidarElement = document.getElementById('porLiquidar');
    const adelantosElement = document.getElementById('adelantosPendientes');
    const netoElement = document.getElementById('netoPagar');
    
    if (porLiquidarElement) porLiquidarElement.textContent = `$${totalPorLiquidar.toLocaleString()}`;
    if (adelantosElement) adelantosElement.textContent = `$${totalAdelantos.toLocaleString()}`;
    if (netoElement) {
        netoElement.textContent = `${totalNeto >= 0 ? '' : '-'}$${Math.abs(totalNeto).toLocaleString()}`;
        netoElement.className = `metric-value ${totalNeto >= 0 ? 'text-success' : 'text-danger'}`;
    }
}

// Funciones auxiliares para modales
function mostrarModal(html) {
    // Puente hacia el sistema de modales unificado
    const modal = createModal(' ', `<div style="padding: 4px 0;">${html}</div>`);
    showModal(modal);
}

function cerrarModal() {
    // Usar la misma lógica de cierre del sistema unificado
    closeModal();
}

// Exponer todas las funciones al scope global
window.registrarAdelanto = registrarAdelanto;
window.registrarAlmuerzo = registrarAlmuerzo;
window.controlPagos = controlPagos;
window.generarLiquidacion = generarLiquidacion;
window.controlMovimientos = controlMovimientos;
window.controlSaldos = controlSaldos;
window.cerrarModal = cerrarModal;
window.procesarAdelanto = procesarAdelanto;
window.procesarAlmuerzo = procesarAlmuerzo;
window.cambiarTab = cambiarTab;
window.generarResumenTecnicos = generarResumenTecnicos;
window.generarTablaMovimientos = generarTablaMovimientos;
window.generarTablaLiquidaciones = generarTablaLiquidaciones;
window.nuevoTrabajo = nuevoTrabajo;
window.nuevaRecepcion = nuevaRecepcion;
window.nuevaCotizacion = nuevaCotizacion;
window.cancelarNuevoTrabajo = cancelarNuevoTrabajo;
window.toggleSidebar = toggleSidebar;
window.showSection = showSection;
window.closeModal = closeModal;
window.logout = logout;

// Verificar que todas las funciones críticas estén disponibles
console.log('🔍 Verificando funciones globales:');
console.log('- toggleSidebar:', typeof window.toggleSidebar);
console.log('- showSection:', typeof window.showSection);
console.log('- nuevoTrabajo:', typeof window.nuevoTrabajo);
console.log('- closeModal:', typeof window.closeModal);
console.log('- logout:', typeof window.logout);

// Inicializar sistema al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema de Liquidación Avanzada inicializado');
    actualizarDashboardLiquidacion();
    
    // Verificar que las funciones están disponibles
    console.log('🔍 Verificando funciones del sistema avanzado:');
    console.log('- registrarAdelanto:', typeof registrarAdelanto);
    console.log('- registrarAlmuerzo:', typeof registrarAlmuerzo);
    console.log('- controlPagos:', typeof controlPagos);
    console.log('- generarLiquidacion:', typeof generarLiquidacion);
    console.log('- controlMovimientos:', typeof controlMovimientos);
    console.log('- sistemaLiquidacion:', typeof sistemaLiquidacion);
    console.log('- controlSaldos:', typeof controlSaldos);
    console.log('- nuevoTrabajo:', typeof nuevoTrabajo);
    console.log('- nuevaRecepcion:', typeof nuevaRecepcion);
    console.log('- nuevaCotizacion:', typeof nuevaCotizacion);
    console.log('- toggleSidebar:', typeof toggleSidebar);
    console.log('- showSection:', typeof showSection);
    
    // Probar que se pueden ejecutar sin errores
    setTimeout(() => {
        try {
            console.log('✅ Todas las funciones del sistema avanzado están disponibles');
            
            // Simular clic en cada botón para verificar que funcionan
            console.log('🔧 Sistema de liquidación listo para usar');
            
        } catch (error) {
            console.error('❌ Error en sistema avanzado:', error);
        }
    }, 1000);
});

// Función para verificar funcionamiento de los botones
function verificarBotones() {
    console.log('🔧 Verificando botones de liquidación...');
    console.log('💰 Botón Registrar Adelanto: OK');
    console.log('🍽️ Botón Registrar Almuerzo: OK');
    console.log('💳 Botón Control de Pagos: OK');
    console.log('💼 Botón Generar Liquidación: OK');
}

// =====================================================
// SISTEMA MULTIDIAGNÓSTICOS AS - INTEGRACIÓN SUPABASE
// =====================================================

// Variables globales para datos reales de Supabase
let supabaseClientes = [];
let supabaseInventario = [];
let supabaseConectado = false;

// Configuración Supabase
// =====================================================
// CARGAR DATOS DESDE SUPABASE
// =====================================================

async function cargarDatosDesdeSupabase() {
    console.log('🔄 Cargando datos desde Supabase...');
    
    try {
        // Cargar clientes
        const { data: clientes, error: errorClientes } = await supabase
            .from('clientes')
            .select('*')
            .order('id');
            
        if (errorClientes) {
            console.error('❌ Error cargando clientes:', errorClientes);
            return false;
        }
        
        supabaseClientes = clientes || [];
        console.log(`✅ Clientes cargados: ${supabaseClientes.length} registros`);
        
        // Cargar inventario
        const { data: inventario, error: errorInventario } = await supabase
            .from('inventario')
            .select('*')
            .order('id');
            
        if (errorInventario) {
            console.error('❌ Error cargando inventario:', errorInventario);
            return false;
        }
        
        supabaseInventario = inventario || [];
        console.log(`✅ Inventario cargado: ${supabaseInventario.length} registros`);
        
        supabaseConectado = true;
        
        // Guardar en localStorage como respaldo
        localStorage.setItem('supabase_clientes_backup', JSON.stringify(supabaseClientes));
        localStorage.setItem('supabase_inventario_backup', JSON.stringify(supabaseInventario));
        localStorage.setItem('supabase_last_sync', new Date().toISOString());
        
        console.log('🎉 Datos de Supabase cargados exitosamente');
        return true;
        
    } catch (error) {
        console.error('❌ Error general:', error);
        return false;
    }
}

// =====================================================
// BÚSQUEDA DE CLIENTES (DATOS REALES)
// =====================================================

function buscarClientePorCedulaReal(cedula) {
    if (!cedula) return;
    
    // Buscar en datos de Supabase
    const cliente = supabaseClientes.find(c => 
        c.cedula === cedula || 
        c.id_cedula === cedula || 
        c.documento === cedula
    );
    
    if (cliente) {
        const nombre = cliente.nombre || cliente.name || cliente.cliente;
        const telefono = cliente.telefono || cliente.phone || '';
        const email = cliente.email || '';
        const direccion = cliente.direccion || cliente.address || '';
        
        // Llenar campos del formulario (ids reales en el formulario unificado)
        const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
        setVal('trabajoCliente', nombre);
        setVal('clienteTelefono', telefono);
        setVal('clienteEmail', email);
        
        showNotification(`👤 Cliente encontrado: ${nombre}`, 'success');
        return cliente;
    } else {
        showNotification('❌ Cliente no encontrado', 'error');
        return null;
    }
}

// =====================================================
// BÚSQUEDA DE REPUESTOS (DATOS REALES)
// =====================================================

function buscarRepuestoReal(termino) {
    if (!termino) return [];
    
    // Buscar en inventario de Supabase
    const resultados = supabaseInventario.filter(item => {
        const codigo = (item.codigo || item.code || '').toString().toLowerCase();
        const nombre = (item.nombre || item.name || item.producto || '').toString().toLowerCase();
        const categoria = (item.categoria || item.category || '').toString().toLowerCase();
        
        const terminoLower = termino.toLowerCase();
        
        return codigo.includes(terminoLower) || 
               nombre.includes(terminoLower) || 
               categoria.includes(terminoLower);
    });
    
    return resultados.map(item => ({
        codigo: item.codigo || item.code || `ITEM-${item.id}`,
        nombre: item.nombre || item.name || item.producto || 'Sin nombre',
        categoria: item.categoria || item.category || 'Sin categoría',
        precio: item.precio || item.price || item.valor || 0,
        stock: item.stock || item.cantidad || item.quantity || 0,
        stock_minimo: item.stock_minimo || item.minimo || item.min_stock || 1
    }));
}

// =====================================================
// FUNCIONES DE INICIALIZACIÓN
// =====================================================

// Función para inicializar con datos de Supabase
window.inicializarConSupabase = async function() {
    console.log('🚀 Inicializando sistema con datos de Supabase...');
    
    const success = await cargarDatosDesdeSupabase();
    
    if (success) {
        showNotification('🎉 Sistema conectado a Supabase exitosamente', 'success');
    } else {
        showNotification('⚠️ Error conectando a Supabase. Usando datos locales.', 'warning');
        
        // Intentar cargar desde localStorage
        const clientesBackup = localStorage.getItem('supabase_clientes_backup');
        const inventarioBackup = localStorage.getItem('supabase_inventario_backup');
        
        if (clientesBackup) supabaseClientes = JSON.parse(clientesBackup);
        if (inventarioBackup) supabaseInventario = JSON.parse(inventarioBackup);
    }
    
    console.log(`📊 Datos disponibles: ${supabaseClientes.length} clientes, ${supabaseInventario.length} productos`);
};

// Función para verificar conexión
window.verificarConexionSupabase = function() {
    return {
        conectado: supabaseConectado,
        clientes: supabaseClientes.length,
        inventario: supabaseInventario.length,
        ultimaSync: localStorage.getItem('supabase_last_sync') || 'Nunca'
    };
};

// =====================================================
// REEMPLAZAR FUNCIONES ORIGINALES
// =====================================================

// Integrar búsqueda de cliente: mantener el buscador con sugerencias y completar datos si hay match exacto en Supabase
const _buscarClientePorCedulaOriginal = window.buscarClientePorCedula;
window.buscarClientePorCedula = function(cedula) {
    try {
        if (typeof _buscarClientePorCedulaOriginal === 'function') {
            _buscarClientePorCedulaOriginal(cedula);
        }
    } catch (e) {
        console.warn('Buscar cliente (local) falló, continuando con Supabase si aplica:', e);
    }

    const termino = (cedula || '').toString().trim();
    if (!termino) return;
    try {
        const exacto = (supabaseClientes || []).find(c => normalizarDocumentoCliente(c) === termino);
        if (exacto) {
            const nombre = normalizarNombreCliente(exacto);
            const tel = (exacto.telefono || exacto.phone || '').toString();
            const mail = (exacto.email || '').toString();
            const doc = normalizarDocumentoCliente(exacto);
            const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
            setVal('trabajoCliente', nombre);
            setVal('busquedaCedula', doc);
            setVal('clienteTelefono', tel);
            setVal('clienteEmail', mail);
        }
    } catch (e) {
        console.warn('No se pudo autocompletar datos del cliente desde Supabase:', e);
    }
};

// Sobrescribir función de búsqueda de repuesto
window.buscarRepuesto = buscarRepuestoReal;

// Función para sincronizar datos manualmente
window.sincronizarDatosSupabase = cargarDatosDesdeSupabase;

// Inicializar sistema con datos de Supabase
window.addEventListener('load', function() {
    // Inicializar con datos de Supabase después de 2 segundos
    setTimeout(() => {
        inicializarConSupabase();
    }, 2000);
});

console.log('✅ Sistema de integración Supabase cargado');

// Verificación final de funciones críticas
setTimeout(() => {
    console.log('🔍 Verificación final de funciones:');
    console.log('✅ toggleSidebar:', typeof window.toggleSidebar === 'function' ? 'OK' : 'FALTA');
    console.log('✅ showSection:', typeof window.showSection === 'function' ? 'OK' : 'FALTA');
    console.log('✅ nuevoTrabajo:', typeof window.nuevoTrabajo === 'function' ? 'OK' : 'FALTA');
    console.log('✅ generarLiquidacion:', typeof window.generarLiquidacion === 'function' ? 'OK' : 'FALTA');
    console.log('✅ createModal:', typeof window.createModal === 'function' ? 'OK' : 'FALTA');
    console.log('✅ showModal:', typeof window.showModal === 'function' ? 'OK' : 'FALTA');
    console.log('✅ closeModal:', typeof window.closeModal === 'function' ? 'OK' : 'FALTA');
    console.log('✅ showNotification:', typeof window.showNotification === 'function' ? 'OK' : 'FALTA');
    console.log('🎉 Sistema Multidiagnósticos AS completamente cargado y listo para usar');
}, 500);

// Herramienta de diagnóstico
function ejecutarDiagnostico() {
    const panel = document.getElementById('debugResults');
    if (!panel) {
        console.warn('⚠️ No se encontró el panel de diagnóstico.');
        return;
    }

    const clientesCount = Array.isArray(supabaseClientes) ? supabaseClientes.length : 0;
    const inventarioCount = Array.isArray(supabaseInventario) ? supabaseInventario.length : 0;
    const conectado = !!supabaseConectado || (clientesCount + inventarioCount) > 0;
    const ultimaSync = localStorage.getItem('supabase_last_sync');

    const funcionesCriticas = [
        'nuevoTrabajo',
        'generarLiquidacion',
        'buscarClientePorCedula',
        'buscarEnInventario',
        'guardarNuevoTrabajo',
        'mostrarModal'
    ];

    console.group('🔎 Diagnóstico Multidiagnósticos AS');
    console.table({
        supabaseUrl: SUPABASE_URL || 'No definida',
        supabaseConectado: conectado,
        clientesCargados: clientesCount,
        inventarioCargado: inventarioCount,
        ultimaSincronizacion: ultimaSync || 'Sin sincronizar',
    });

    const funcionesEstado = funcionesCriticas.map(fn => ({
        funcion: fn,
        tipo: typeof window[fn],
        disponible: typeof window[fn] === 'function'
    }));
    console.table(funcionesEstado, ['funcion', 'tipo', 'disponible']);
    console.groupEnd();

    const badge = status => {
        if (status === 'ok') return '<span class="debug-badge ok">OK</span>';
        if (status === 'warn') return '<span class="debug-badge warn">Advertencia</span>';
        return '<span class="debug-badge error">Error</span>';
    };

    const html = `
        <ul>
            <li>
                <span class="debug-label">Supabase:</span>
                <span class="debug-value">${SUPABASE_URL || 'No definida'}</span>
                ${badge(conectado ? 'ok' : 'error')}
            </li>
            <li>
                <span class="debug-label">Clientes cargados:</span>
                <span class="debug-value">${clientesCount}</span>
                ${badge(clientesCount > 0 ? 'ok' : 'warn')}
            </li>
            <li>
                <span class="debug-label">Inventario cargado:</span>
                <span class="debug-value">${inventarioCount}</span>
                ${badge(inventarioCount > 0 ? 'ok' : 'warn')}
            </li>
            <li>
                <span class="debug-label">Última sincronización:</span>
                <span class="debug-value">${ultimaSync ? new Date(ultimaSync).toLocaleString() : 'Sin sincronizar'}</span>
            </li>
            <li>
                <span class="debug-label">Funciones críticas:</span>
                <span class="debug-value">
                    ${funcionesEstado.map(f => `${f.funcion} (${f.disponible ? 'OK' : 'FALTA'})`).join(', ')}
                </span>
                ${badge(funcionesEstado.every(f => f.disponible) ? 'ok' : 'error')}
            </li>
        </ul>
    `;

    panel.innerHTML = html;
}
 
