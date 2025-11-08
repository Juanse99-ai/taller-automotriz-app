        // Variables globales
        let currentUser = null;
        let jobs = JSON.parse(localStorage.getItem('taller-jobs') || '[]');
        let mechanics = JSON.parse(localStorage.getItem('taller-mechanics') || '[]');
        let payments = JSON.parse(localStorage.getItem('taller-payments') || '[]');
        
        // Nuevas variables para el flujo completo
        let receptions = JSON.parse(localStorage.getItem('taller-receptions') || '[]');
        let quotes = JSON.parse(localStorage.getItem('taller-quotes') || '[]');
        let calendarAppointments = JSON.parse(localStorage.getItem('taller-calendar') || '[]');
        let vehicleHistory = JSON.parse(localStorage.getItem('taller-vehicle-history') || '[]');
        let notifications = JSON.parse(localStorage.getItem('taller-notifications') || '[]');

        // Usuarios de prueba
        const users = {
            'admin': { password: 'admin', role: 'admin', name: 'Administrador' },
            'mecanico': { password: 'mecanico', role: 'mechanic', name: 'Juan Pérez' }
        };

        // Funciones de autenticación
        function login(event) {
            event.preventDefault();
            const username = document.getElementById('loginUser').value;
            const password = document.getElementById('loginPassword').value;
            const role = document.getElementById('loginRole').value;

            if (users[username] && users[username].password === password && users[username].role === role) {
                currentUser = { username, name: users[username].name, role };
                document.getElementById('userName').textContent = currentUser.name;
                document.getElementById('userRole').textContent = role === 'admin' ? 'Administrador' : 'Mecánico';
                document.getElementById('loginModal').classList.remove('active');
                
                // Ocultar funciones según el rol
                if (role === 'mechanic') {
                    document.getElementById('nav-finances').style.display = 'none';
                    document.getElementById('nav-reports').style.display = 'none';
                }
                
                initializeApp();
            } else {
                alert('Credenciales incorrectas');
            }
        }

        function logout() {
            currentUser = null;
            document.getElementById('loginModal').classList.add('active');
        }

        // Funciones de navegación
        function showSection(sectionName) {
            // Ocultar todas las secciones
            document.querySelectorAll('.section').forEach(section => {
                section.classList.remove('active');
            });
            
            // Mostrar sección seleccionada
            document.getElementById('section-' + sectionName).classList.add('active');
            
            // Actualizar navegación
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            document.getElementById('nav-' + sectionName).classList.add('active');
            
            // Cargar datos de la sección
            if (sectionName === 'dashboard') {
                loadDashboard();
            } else if (sectionName === 'jobs') {
                loadJobs();
            } else if (sectionName === 'mechanics') {
                loadMechanics();
            } else if (sectionName === 'finances') {
                loadFinances();
            } else if (sectionName === 'settlement') {
                loadSettlement();
            } else if (sectionName === 'reception') {
                loadReception();
            } else if (sectionName === 'quotes') {
                loadQuotes();
            } else if (sectionName === 'calendar') {
                loadCalendar();
            } else if (sectionName === 'vehicle-history') {
                loadVehicleHistory();
            } else if (sectionName === 'notifications') {
                loadNotifications();
            } else if (sectionName === 'reports') {
                loadReports();
            }
        }

        // Inicialización
        function initializeApp() {
            loadDashboard();
            
            // Poblar selectores de mecánicos
            populateMechanicSelectors();
            
            // Cargar datos iniciales si están vacíos
            if (mechanics.length === 0) {
                loadSampleData();
            }
            
            // Agregar event listeners para actualización automática de totales en cotizaciones
            document.addEventListener('input', function(e) {
                if (e.target.id === 'quoteLaborCost' || e.target.classList.contains('quote-item')) {
                    setTimeout(updateQuoteTotal, 100);
                }
            });
        }

        function loadSampleData() {
            // Mecánicos del taller
            mechanics = [
                { id: 1, name: 'Pedro Barraza', specialty: 'Dueño/Frenos', phone: '3002345678', hourlyRate: 20000 },
                { id: 2, name: 'Víctor Padilla', specialty: 'General', phone: '3001234567', hourlyRate: 20000 },
                { id: 3, name: 'Ismael Cervantes', specialty: 'Motor', phone: '3003456789', hourlyRate: 20000 }
            ];
            localStorage.setItem('taller-mechanics', JSON.stringify(mechanics));

            // Recepciones de vehículos
            receptions = [
                {
                    id: 1,
                    orderNumber: 'ORD-2025-001',
                    clientName: 'Juan Pérez',
                    clientPhone: '3001112233',
                    clientEmail: 'juan.perez@email.com',
                    vehiclePlate: 'ABC123',
                    vehicleBrand: 'Toyota',
                    vehicleModel: 'Corolla',
                    vehicleYear: 2020,
                    mileage: 45000,
                    problemDescription: 'Ruido extraño en el motor',
                    receptionDate: '2025-11-08',
                    assignedMechanic: 2, // Víctor
                    status: 'en_evaluacion',
                    estimatedTime: '2 horas',
                    priority: 'media'
                },
                {
                    id: 2,
                    orderNumber: 'ORD-2025-002',
                    clientName: 'María González',
                    clientPhone: '3004445566',
                    clientEmail: 'maria.gonzalez@email.com',
                    vehiclePlate: 'XYZ789',
                    vehicleBrand: 'Chevrolet',
                    vehicleModel: 'Spark',
                    vehicleYear: 2018,
                    mileage: 62000,
                    problemDescription: 'Frenos no responden bien',
                    receptionDate: '2025-11-08',
                    assignedMechanic: 1, // Pedro
                    status: 'presupuestado',
                    estimatedTime: '3 horas',
                    priority: 'alta'
                }
            ];
            localStorage.setItem('taller-receptions', JSON.stringify(receptions));

            // Cotizaciones
            quotes = [
                {
                    id: 1,
                    receptionId: 1,
                    quoteNumber: 'COT-2025-001',
                    clientName: 'Juan Pérez',
                    vehiclePlate: 'ABC123',
                    items: [
                        { description: 'Diagnóstico completo del motor', quantity: 1, unitPrice: 50000, total: 50000 },
                        { description: 'Filtro de aceite', quantity: 1, unitPrice: 25000, total: 25000 },
                        { description: 'Mano de obra', quantity: 2, unitPrice: 20000, total: 40000 }
                    ],
                    laborCost: 40000,
                    partsCost: 25000,
                    total: 115000,
                    status: 'pendiente',
                    createdDate: '2025-11-08',
                    validUntil: '2025-11-15'
                },
                {
                    id: 2,
                    receptionId: 2,
                    quoteNumber: 'COT-2025-002',
                    clientName: 'María González',
                    vehiclePlate: 'XYZ789',
                    items: [
                        { description: 'Cambio de pastillas de freno', quantity: 4, unitPrice: 35000, total: 140000 },
                        { description: 'Discos de freno', quantity: 2, unitPrice: 80000, total: 160000 },
                        { description: 'Mano de obra', quantity: 3, unitPrice: 20000, total: 60000 }
                    ],
                    laborCost: 60000,
                    partsCost: 300000,
                    total: 360000,
                    status: 'aprobada',
                    createdDate: '2025-11-08',
                    validUntil: '2025-11-15'
                }
            ];
            localStorage.setItem('taller-quotes', JSON.stringify(quotes));

            // Citas de calendario
            calendarAppointments = [
                {
                    id: 1,
                    date: '2025-11-09',
                    time: '09:00',
                    mechanicId: 1, // Pedro
                    type: 'trabajo',
                    description: 'Cambio de pastillas - XYZ789',
                    clientName: 'María González',
                    status: 'programada'
                },
                {
                    id: 2,
                    date: '2025-11-09',
                    time: '14:00',
                    mechanicId: 2, // Víctor
                    type: 'diagnostico',
                    description: 'Diagnóstico motor - ABC123',
                    clientName: 'Juan Pérez',
                    status: 'programada'
                },
                {
                    id: 3,
                    date: '2025-11-10',
                    time: '10:00',
                    mechanicId: 3, // Ismael
                    type: 'mantenimiento',
                    description: 'Mantenimiento preventivo - DEF456',
                    clientName: 'Carlos Rodríguez',
                    status: 'programada'
                }
            ];
            localStorage.setItem('taller-calendar', JSON.stringify(calendarAppointments));

            // Historial de vehículos
            vehicleHistory = [
                {
                    id: 1,
                    vehiclePlate: 'ABC123',
                    serviceDate: '2025-10-15',
                    serviceType: 'Mantenimiento preventivo',
                    description: 'Cambio de aceite y filtros',
                    mechanicId: 2,
                    parts: 'Filtro aceite, Filtro aire',
                    cost: 75000,
                    nextMaintenance: '2026-01-15',
                    mileage: 44000
                },
                {
                    id: 2,
                    vehiclePlate: 'ABC123',
                    serviceDate: '2025-08-20',
                    serviceType: 'Reparación',
                    description: 'Cambio de pastillas de freno',
                    mechanicId: 1,
                    parts: 'Pastillas freno',
                    cost: 120000,
                    nextMaintenance: null,
                    mileage: 41000
                }
            ];
            localStorage.setItem('taller-vehicle-history', JSON.stringify(vehicleHistory));

            // Notificaciones
            notifications = [
                {
                    id: 1,
                    type: 'mantenimiento',
                    title: 'Mantenimiento pendiente',
                    message: 'Vehículo ABC123 requiere mantenimiento preventivo',
                    vehiclePlate: 'ABC123',
                    dueDate: '2025-11-15',
                    status: 'pendiente',
                    priority: 'media',
                    createdDate: '2025-11-08'
                },
                {
                    id: 2,
                    type: 'stock',
                    title: 'Stock bajo',
                    message: 'Quedan 3 unidades de filtro de aceite',
                    item: 'Filtro de aceite',
                    currentStock: 3,
                    minStock: 10,
                    status: 'alerta',
                    priority: 'alta',
                    createdDate: '2025-11-08'
                }
            ];
            localStorage.setItem('taller-notifications', JSON.stringify(notifications));

            // Trabajos de ejemplo
            jobs = [
                {
                    id: 1,
                    plate: 'ABC123',
                    mileage: 50000,
                    description: 'Cambio de aceite y filtros',
                    mechanicId: 1,
                    parts: 'Filtro de aceite, Filtro de aire',
                    partsCost: 45000,
                    laborCost: 25000,
                    salePrice: 70000,
                    status: 'completado',
                    date: '2025-11-07'
                },
                {
                    id: 2,
                    plate: 'XYZ789',
                    mileage: 75000,
                    description: 'Reparación sistema de frenos',
                    mechanicId: 2,
                    parts: 'Pastillas, Discos',
                    partsCost: 120000,
                    laborCost: 80000,
                    salePrice: 200000,
                    status: 'enprogreso',
                    date: '2025-11-08'
                },
                {
                    id: 3,
                    plate: 'DEF456',
                    mileage: 30000,
                    description: 'Diagnóstico eléctrico',
                    mechanicId: 3,
                    parts: 'Fusible, Relé',
                    partsCost: 25000,
                    laborCost: 40000,
                    salePrice: 65000,
                    status: 'pendiente',
                    date: '2025-11-08'
                }
            ];
            localStorage.setItem('taller-jobs', JSON.stringify(jobs));

            // Pagos y movimientos financieros de ejemplo
            payments = [
                { id: 1, mechanicId: 1, type: 'pago', amount: 500000, description: 'Pago mensual', date: '2025-11-01' },
                { id: 2, mechanicId: 2, type: 'adelanto', amount: 100000, description: 'Adelanto familia', date: '2025-11-05' },
                { id: 3, mechanicId: 1, type: 'prestamo', amount: 200000, description: 'Préstamo personal', date: '2025-11-03' },
                { id: 4, mechanicId: 3, type: 'descuento', amount: 50000, description: 'Descuento por capacitación', date: '2025-11-04' }
            ];
            localStorage.setItem('taller-payments', JSON.stringify(payments));

            populateMechanicSelectors();
        }

        function populateMechanicSelectors() {
            const selectors = ['jobMechanic', 'paymentMechanic', 'filterMechanic', 'filterPaymentMechanic', 'filterSettlementMechanic', 'receptionAssignedMechanic'];
            
            selectors.forEach(selectorId => {
                const selector = document.getElementById(selectorId);
                if (selector) {
                    const currentValue = selector.value;
                    selector.innerHTML = selectorId.includes('filter') ? 
                        '<option value="">Todos los mecánicos</option>' : 
                        '<option value="">Seleccionar mecánico</option>';
                    
                    mechanics.forEach(mechanic => {
                        const option = document.createElement('option');
                        option.value = mechanic.id;
                        option.textContent = mechanic.name;
                        selector.appendChild(option);
                    });
                    
                    selector.value = currentValue;
                }
            });
        }

        // Dashboard
        function loadDashboard() {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            const monthlyJobs = jobs.filter(job => {
                const jobDate = new Date(job.date);
                return jobDate.getMonth() === currentMonth && jobDate.getFullYear() === currentYear;
            });
            
            const monthlyRevenue = monthlyJobs.reduce((sum, job) => sum + (job.salePrice || 0), 0);
            
            document.getElementById('totalJobs').textContent = jobs.length;
            document.getElementById('completedJobs').textContent = jobs.filter(j => j.status === 'completado').length;
            document.getElementById('inProgressJobs').textContent = jobs.filter(j => j.status === 'enprogreso').length;
            document.getElementById('totalRevenue').textContent = formatCurrency(monthlyRevenue);
            
            loadRecentJobs();
        }

        function loadRecentJobs() {
            const recentJobs = jobs
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 6);
            
            const container = document.getElementById('recentJobs');
            
            if (recentJobs.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔨</div>
                        <p>No hay trabajos registrados</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = recentJobs.map(job => createJobCard(job, true)).join('');
        }

        // Trabajos
        function loadJobs() {
            const container = document.getElementById('jobsList');
            
            if (jobs.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔨</div>
                        <p>No hay trabajos registrados</p>
                        <button class="btn btn-primary mt-sm" onclick="openJobModal()">Crear Primer Trabajo</button>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = jobs.map(job => createJobCard(job)).join('');
        }

        function createJobCard(job, isCompact = false) {
            const mechanic = mechanics.find(m => m.id == job.mechanicId);
            const mechanicName = mechanic ? mechanic.name : 'Sin asignar';
            
            const statusClass = `status-${job.status}`;
            const statusText = {
                'pendiente': 'Pendiente',
                'enprogreso': 'En Progreso',
                'completado': 'Completado',
                'entregado': 'Entregado'
            }[job.status] || job.status;
            
            if (isCompact) {
                return `
                    <div class="job-card" onclick="editJob(${job.id})">
                        <div class="job-header">
                            <div class="job-plate">${job.plate}</div>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <div class="job-details">
                            <div class="detail-row">
                                <span class="detail-label">Mecánico:</span>
                                <span class="detail-value">${mechanicName}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Trabajo:</span>
                                <span class="detail-value">${job.description.substring(0, 30)}...</span>
                            </div>
                        </div>
                        <div class="job-footer">
                            <div class="job-total">${formatCurrency(job.salePrice || 0)}</div>
                        </div>
                    </div>
                `;
            }
            
            return `
                <div class="job-card" onclick="editJob(${job.id})">
                    <div class="job-header">
                        <div class="job-plate">${job.plate}</div>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="job-details">
                        <div class="detail-row">
                            <span class="detail-label">Mecánico:</span>
                            <span class="detail-value">${mechanicName}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Kilometraje:</span>
                            <span class="detail-value">${job.mileage?.toLocaleString() || 'N/A'} km</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Fecha:</span>
                            <span class="detail-value">${formatDate(job.date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Trabajo:</span>
                            <span class="detail-value">${job.description}</span>
                        </div>
                        ${job.parts ? `
                        <div class="detail-row">
                            <span class="detail-label">Repuestos:</span>
                            <span class="detail-value">${job.parts}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="job-footer">
                        <div class="job-total">${formatCurrency(job.salePrice || 0)}</div>
                        <div class="job-actions">
                            <button class="btn-icon" onclick="event.stopPropagation(); changeJobStatus(${job.id})" title="Cambiar Estado">
                                🔄
                            </button>
                            <button class="btn-icon" onclick="event.stopPropagation(); deleteJob(${job.id})" title="Eliminar">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        function filterJobs() {
            const searchTerm = document.getElementById('searchJobs').value.toLowerCase();
            const statusFilter = document.getElementById('filterStatus').value;
            const mechanicFilter = document.getElementById('filterMechanic').value;
            
            let filteredJobs = jobs.filter(job => {
                const matchesSearch = job.plate.toLowerCase().includes(searchTerm) ||
                                    job.description.toLowerCase().includes(searchTerm);
                const matchesStatus = !statusFilter || job.status === statusFilter;
                const matchesMechanic = !mechanicFilter || job.mechanicId == mechanicFilter;
                
                return matchesSearch && matchesStatus && matchesMechanic;
            });
            
            const container = document.getElementById('jobsList');
            container.innerHTML = filteredJobs.map(job => createJobCard(job)).join('');
        }

        function openJobModal(jobId = null) {
            const modal = document.getElementById('jobModal');
            const title = document.getElementById('jobModalTitle');
            const form = document.getElementById('jobForm');
            
            if (jobId) {
                // Editar
                const job = jobs.find(j => j.id === jobId);
                title.textContent = 'Editar Trabajo';
                document.getElementById('jobId').value = job.id;
                document.getElementById('jobPlate').value = job.plate;
                document.getElementById('jobMileage').value = job.mileage;
                document.getElementById('jobMechanic').value = job.mechanicId;
                document.getElementById('jobStatus').value = job.status;
                document.getElementById('jobDescription').value = job.description;
                document.getElementById('jobParts').value = job.parts || '';
                document.getElementById('jobPartsCost').value = job.partsCost || 0;
                document.getElementById('jobLaborCost').value = job.laborCost || 0;
                document.getElementById('jobSalePrice').value = job.salePrice || 0;
            } else {
                // Nuevo
                title.textContent = 'Nuevo Trabajo';
                form.reset();
                document.getElementById('jobId').value = '';
                document.getElementById('jobStatus').value = 'pendiente';
                document.getElementById('jobDate').value = new Date().toISOString().split('T')[0];
            }
            
            modal.classList.add('active');
        }

        function closeJobModal() {
            document.getElementById('jobModal').classList.remove('active');
        }

        function saveJob(event) {
            event.preventDefault();
            
            const jobId = document.getElementById('jobId').value;
            const job = {
                id: jobId ? parseInt(jobId) : Date.now(),
                plate: document.getElementById('jobPlate').value,
                mileage: parseInt(document.getElementById('jobMileage').value),
                mechanicId: parseInt(document.getElementById('jobMechanic').value),
                status: document.getElementById('jobStatus').value,
                description: document.getElementById('jobDescription').value,
                parts: document.getElementById('jobParts').value,
                partsCost: parseFloat(document.getElementById('jobPartsCost').value) || 0,
                laborCost: parseFloat(document.getElementById('jobLaborCost').value) || 0,
                salePrice: parseFloat(document.getElementById('jobSalePrice').value) || 0,
                date: new Date().toISOString().split('T')[0]
            };
            
            if (jobId) {
                // Actualizar
                const index = jobs.findIndex(j => j.id === parseInt(jobId));
                jobs[index] = job;
            } else {
                // Crear
                jobs.push(job);
            }
            
            localStorage.setItem('taller-jobs', JSON.stringify(jobs));
            closeJobModal();
            loadJobs();
            loadDashboard();
            
            // Recargar filtros si es necesario
            populateMechanicSelectors();
        }

        function editJob(jobId) {
            openJobModal(jobId);
        }

        function changeJobStatus(jobId) {
            const job = jobs.find(j => j.id === jobId);
            const statuses = ['pendiente', 'enprogreso', 'completado', 'entregado'];
            const currentIndex = statuses.indexOf(job.status);
            const nextIndex = (currentIndex + 1) % statuses.length;
            
            job.status = statuses[nextIndex];
            localStorage.setItem('taller-jobs', JSON.stringify(jobs));
            loadJobs();
            loadDashboard();
        }

        function deleteJob(jobId) {
            if (confirm('¿Está seguro de eliminar este trabajo?')) {
                jobs = jobs.filter(j => j.id !== jobId);
                localStorage.setItem('taller-jobs', JSON.stringify(jobs));
                loadJobs();
                loadDashboard();
            }
        }

        // Mecánicos
        function loadMechanics() {
            const container = document.getElementById('mechanicsList');
            
            if (mechanics.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">👥</div>
                        <p>No hay mecánicos registrados</p>
                        <button class="btn btn-primary mt-sm" onclick="openMechanicModal()">Agregar Primer Mecánico</button>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = mechanics.map(mechanic => createMechanicCard(mechanic)).join('');
        }

        function createMechanicCard(mechanic) {
            const mechanicJobs = jobs.filter(j => j.mechanicId === mechanic.id);
            const totalRevenue = mechanicJobs.reduce((sum, job) => sum + (job.salePrice || 0), 0);
            
            return `
                <div class="job-card">
                    <div class="job-header">
                        <div class="job-plate">${mechanic.name}</div>
                        <span class="status-badge status-completado">${mechanic.specialty || 'General'}</span>
                    </div>
                    <div class="job-details">
                        <div class="detail-row">
                            <span class="detail-label">Teléfono:</span>
                            <span class="detail-value">${mechanic.phone || 'No especificado'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Tarifa/Hora:</span>
                            <span class="detail-value">${formatCurrency(mechanic.hourlyRate || 0)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Trabajos Asignados:</span>
                            <span class="detail-value">${mechanicJobs.length}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Ingresos Generados:</span>
                            <span class="detail-value">${formatCurrency(totalRevenue)}</span>
                        </div>
                    </div>
                    <div class="job-footer">
                        <div></div>
                        <div class="job-actions">
                            <button class="btn-icon" onclick="editMechanic(${mechanic.id})" title="Editar">
                                ✏️
                            </button>
                            <button class="btn-icon" onclick="deleteMechanic(${mechanic.id})" title="Eliminar">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        function openMechanicModal(mechanicId = null) {
            const modal = document.getElementById('mechanicModal');
            const title = document.getElementById('mechanicModalTitle');
            const form = document.getElementById('mechanicForm');
            
            if (mechanicId) {
                // Editar
                const mechanic = mechanics.find(m => m.id === mechanicId);
                title.textContent = 'Editar Mecánico';
                document.getElementById('mechanicId').value = mechanic.id;
                document.getElementById('mechanicName').value = mechanic.name;
                document.getElementById('mechanicSpecialty').value = mechanic.specialty || '';
                document.getElementById('mechanicPhone').value = mechanic.phone || '';
                document.getElementById('mechanicHourlyRate').value = mechanic.hourlyRate || 0;
            } else {
                // Nuevo
                title.textContent = 'Nuevo Mecánico';
                form.reset();
                document.getElementById('mechanicId').value = '';
            }
            
            modal.classList.add('active');
        }

        function closeMechanicModal() {
            document.getElementById('mechanicModal').classList.remove('active');
        }

        // Funciones de modal para Recepción
        function closeReceptionModal() {
            document.getElementById('receptionModal').classList.remove('active');
        }

        function openReceptionModal(receptionId = null) {
            if (receptionId) {
                // Editar recepción existente
                const reception = receptions.find(r => r.id === receptionId);
                if (!reception) return;
                
                document.getElementById('receptionModalTitle').textContent = 'Editar Recepción';
                document.getElementById('receptionId').value = reception.id;
                document.getElementById('receptionOrderNumber').value = reception.orderNumber;
                document.getElementById('receptionClientName').value = reception.clientName;
                document.getElementById('receptionClientPhone').value = reception.clientPhone;
                document.getElementById('receptionClientEmail').value = reception.clientEmail;
                document.getElementById('receptionVehiclePlate').value = reception.vehiclePlate;
                document.getElementById('receptionVehicleBrand').value = reception.vehicleBrand;
                document.getElementById('receptionVehicleModel').value = reception.vehicleModel;
                document.getElementById('receptionVehicleYear').value = reception.vehicleYear;
                document.getElementById('receptionMileage').value = reception.mileage;
                document.getElementById('receptionAssignedMechanic').value = reception.assignedMechanic;
                document.getElementById('receptionPriority').value = reception.priority;
                document.getElementById('receptionEstimatedTime').value = reception.estimatedTime;
                document.getElementById('receptionProblemDescription').value = reception.problemDescription;
            } else {
                // Nueva recepción
                document.getElementById('receptionModalTitle').textContent = 'Nueva Recepción';
                document.getElementById('receptionForm').reset();
                document.getElementById('receptionId').value = '';
                document.getElementById('receptionOrderNumber').value = `ORD-${new Date().getFullYear()}-${String(receptions.length + 1).padStart(3, '0')}`;
                document.getElementById('receptionDate').value = new Date().toISOString().split('T')[0];
            }
            
            document.getElementById('receptionModal').classList.add('active');
        }

        function saveReception(event) {
            event.preventDefault();
            
            const receptionId = document.getElementById('receptionId').value;
            const reception = {
                id: receptionId ? parseInt(receptionId) : Date.now(),
                orderNumber: document.getElementById('receptionOrderNumber').value,
                clientName: document.getElementById('receptionClientName').value,
                clientPhone: document.getElementById('receptionClientPhone').value,
                clientEmail: document.getElementById('receptionClientEmail').value,
                vehiclePlate: document.getElementById('receptionVehiclePlate').value.toUpperCase(),
                vehicleBrand: document.getElementById('receptionVehicleBrand').value,
                vehicleModel: document.getElementById('receptionVehicleModel').value,
                vehicleYear: parseInt(document.getElementById('receptionVehicleYear').value),
                mileage: parseInt(document.getElementById('receptionMileage').value),
                problemDescription: document.getElementById('receptionProblemDescription').value,
                receptionDate: document.getElementById('receptionDate')?.value || new Date().toISOString().split('T')[0],
                assignedMechanic: parseInt(document.getElementById('receptionAssignedMechanic').value),
                status: receptionId ? receptions.find(r => r.id === receptionId)?.status || 'nueva' : 'nueva',
                estimatedTime: document.getElementById('receptionEstimatedTime').value,
                priority: document.getElementById('receptionPriority').value
            };
            
            if (receptionId) {
                // Editar existente
                const index = receptions.findIndex(r => r.id === receptionId);
                receptions[index] = reception;
            } else {
                // Nueva recepción
                receptions.push(reception);
            }
            
            localStorage.setItem('taller-receptions', JSON.stringify(receptions));
            closeReceptionModal();
            loadReception();
            loadDashboard();
            
            alert(receptionId ? 'Recepción actualizada exitosamente' : 'Recepción creada exitosamente');
        }

        // Funciones de modal para Cotización
        function closeQuoteModal() {
            document.getElementById('quoteModal').classList.remove('active');
            // Limpiar items
            document.getElementById('quoteItemsList').innerHTML = '';
        }

        function openQuoteModal(quoteId = null) {
            if (quoteId) {
                // Editar cotización existente
                const quote = quotes.find(q => q.id === quoteId);
                if (!quote) return;
                
                document.getElementById('quoteModalTitle').textContent = 'Editar Cotización';
                document.getElementById('quoteId').value = quote.id;
                document.getElementById('quoteNumber').value = quote.quoteNumber;
                document.getElementById('quoteClientName').value = quote.clientName;
                document.getElementById('quoteVehiclePlate').value = quote.vehiclePlate;
                document.getElementById('quoteValidUntil').value = quote.validUntil;
                document.getElementById('quoteLaborCost').value = quote.laborCost;
                document.getElementById('quotePartsCost').value = quote.partsCost;
                document.getElementById('quoteTotal').value = quote.total;
                
                // Cargar items
                quote.items.forEach(item => {
                    addQuoteItem(item);
                });
            } else {
                // Nueva cotización
                document.getElementById('quoteModalTitle').textContent = 'Nueva Cotización';
                document.getElementById('quoteForm').reset();
                document.getElementById('quoteId').value = '';
                document.getElementById('quoteNumber').value = `COT-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(3, '0')}`;
                document.getElementById('quoteValidUntil').value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                // Agregar primer item por defecto
                addQuoteItem();
            }
            
            document.getElementById('quoteModal').classList.add('active');
        }

        function addQuoteItem(item = null) {
            const itemsList = document.getElementById('quoteItemsList');
            const itemId = Date.now() + Math.random();
            
            const itemHTML = `
                <div class="quote-item" id="item-${itemId}">
                    <input type="text" class="form-input" placeholder="Descripción" value="${item?.description || ''}">
                    <input type="number" class="form-input" placeholder="Cant." value="${item?.quantity || 1}" min="1">
                    <input type="number" class="form-input" placeholder="Precio unit." value="${item?.unitPrice || 0}" step="0.01">
                    <div style="display: flex; gap: 5px;">
                        <span class="form-input" style="padding: 8px; background: var(--gray-100);">${formatCurrency(item?.total || 0)}</span>
                        <button type="button" class="btn btn-sm" onclick="removeQuoteItem('${itemId}')">❌</button>
                    </div>
                </div>
            `;
            
            itemsList.insertAdjacentHTML('beforeend', itemHTML);
            updateQuoteTotal();
        }

        function removeQuoteItem(itemId) {
            document.getElementById(`item-${itemId}`).remove();
            updateQuoteTotal();
        }

        function updateQuoteTotal() {
            const items = document.querySelectorAll('.quote-item');
            let total = 0;
            
            items.forEach(item => {
                const inputs = item.querySelectorAll('input');
                const quantity = parseFloat(inputs[1].value) || 0;
                const unitPrice = parseFloat(inputs[2].value) || 0;
                const itemTotal = quantity * unitPrice;
                total += itemTotal;
                
                // Actualizar total del item
                inputs[3].querySelector('span').textContent = formatCurrency(itemTotal);
            });
            
            const laborCost = parseFloat(document.getElementById('quoteLaborCost').value) || 0;
            const partsCost = total;
            const grandTotal = laborCost + partsCost;
            
            document.getElementById('quotePartsCost').value = partsCost;
            document.getElementById('quoteTotal').value = grandTotal;
        }

        function saveQuote(event) {
            event.preventDefault();
            
            const quoteId = document.getElementById('quoteId').value;
            
            // Recopilar items
            const items = [];
            document.querySelectorAll('.quote-item').forEach(item => {
                const inputs = item.querySelectorAll('input');
                const description = inputs[0].value;
                const quantity = parseFloat(inputs[1].value) || 0;
                const unitPrice = parseFloat(inputs[2].value) || 0;
                const total = quantity * unitPrice;
                
                if (description && quantity > 0) {
                    items.push({ description, quantity, unitPrice, total });
                }
            });
            
            const quote = {
                id: quoteId ? parseInt(quoteId) : Date.now(),
                receptionId: null, // TODO: conectar con recepción
                quoteNumber: document.getElementById('quoteNumber').value,
                clientName: document.getElementById('quoteClientName').value,
                vehiclePlate: document.getElementById('quoteVehiclePlate').value.toUpperCase(),
                items: items,
                laborCost: parseFloat(document.getElementById('quoteLaborCost').value) || 0,
                partsCost: parseFloat(document.getElementById('quotePartsCost').value) || 0,
                total: parseFloat(document.getElementById('quoteTotal').value) || 0,
                status: 'pendiente',
                createdDate: new Date().toISOString().split('T')[0],
                validUntil: document.getElementById('quoteValidUntil').value
            };
            
            if (quoteId) {
                // Editar existente
                const index = quotes.findIndex(q => q.id === quoteId);
                quotes[index] = quote;
            } else {
                // Nueva cotización
                quotes.push(quote);
            }
            
            localStorage.setItem('taller-quotes', JSON.stringify(quotes));
            closeQuoteModal();
            loadQuotes();
            
            alert(quoteId ? 'Cotización actualizada exitosamente' : 'Cotización creada exitosamente');
        }

        function saveMechanic(event) {
            event.preventDefault();
            
            const mechanicId = document.getElementById('mechanicId').value;
            const mechanic = {
                id: mechanicId ? parseInt(mechanicId) : Date.now(),
                name: document.getElementById('mechanicName').value,
                specialty: document.getElementById('mechanicSpecialty').value,
                phone: document.getElementById('mechanicPhone').value,
                hourlyRate: parseFloat(document.getElementById('mechanicHourlyRate').value) || 0
            };
            
            if (mechanicId) {
                // Actualizar
                const index = mechanics.findIndex(m => m.id === parseInt(mechanicId));
                mechanics[index] = mechanic;
            } else {
                // Crear
                mechanics.push(mechanic);
            }
            
            localStorage.setItem('taller-mechanics', JSON.stringify(mechanics));
            closeMechanicModal();
            loadMechanics();
            populateMechanicSelectors();
        }

        function editMechanic(mechanicId) {
            openMechanicModal(mechanicId);
        }

        function deleteMechanic(mechanicId) {
            if (confirm('¿Está seguro de eliminar este mecánico?')) {
                // Verificar si tiene trabajos asignados
                const hasJobs = jobs.some(j => j.mechanicId === mechanicId);
                if (hasJobs) {
                    alert('No se puede eliminar un mecánico con trabajos asignados');
                    return;
                }
                
                mechanics = mechanics.filter(m => m.id !== mechanicId);
                localStorage.setItem('taller-mechanics', JSON.stringify(mechanics));
                loadMechanics();
                populateMechanicSelectors();
            }
        }

        // Finanzas
        function loadFinances() {
            updateFinancialStats();
            loadPayments();
        }

        function updateFinancialStats() {
            const totalPayments = payments.filter(p => p.type === 'pago').reduce((sum, p) => sum + p.amount, 0);
            const totalAdvance = payments.filter(p => p.type === 'adelanto').reduce((sum, p) => sum + p.amount, 0);
            const totalLoans = payments.filter(p => p.type === 'prestamo').reduce((sum, p) => sum + p.amount, 0);
            const totalDiscounts = payments.filter(p => p.type === 'descuento').reduce((sum, p) => sum + p.amount, 0);
            
            document.getElementById('totalPayments').textContent = formatCurrency(totalPayments);
            document.getElementById('totalAdvance').textContent = formatCurrency(totalAdvance);
            document.getElementById('totalLoans').textContent = formatCurrency(totalLoans);
            document.getElementById('totalDiscounts').textContent = formatCurrency(totalDiscounts);
        }

        function loadPayments() {
            const mechanicFilter = document.getElementById('filterPaymentMechanic').value;
            let filteredPayments = payments;
            
            if (mechanicFilter) {
                filteredPayments = payments.filter(p => p.mechanicId == mechanicFilter);
            }
            
            const container = document.getElementById('paymentsList');
            
            if (filteredPayments.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">💰</div>
                        <p>No hay pagos registrados</p>
                        <button class="btn btn-primary mt-sm" onclick="openPaymentModal()">Registrar Primer Pago</button>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = filteredPayments
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map(payment => createPaymentCard(payment))
                .join('');
        }

        function createPaymentCard(payment) {
            const mechanic = mechanics.find(m => m.id == payment.mechanicId);
            const mechanicName = mechanic ? mechanic.name : 'Mecánico eliminado';
            
            const typeConfig = {
                'pago': { text: 'Pago', class: 'text-success', icon: '💰' },
                'adelanto': { text: 'Adelanto', class: 'text-warning', icon: '⏰' },
                'prestamo': { text: 'Préstamo', class: 'text-error', icon: '💳' },
                'descuento': { text: 'Descuento', class: 'text-primary', icon: '📉' }
            };
            
            const config = typeConfig[payment.type] || typeConfig.pago;
            
            return `
                <div class="job-card">
                    <div class="job-header">
                        <div class="job-plate">${mechanicName}</div>
                        <span class="status-badge status-${payment.type}">
                            ${config.icon} ${config.text}
                        </span>
                    </div>
                    <div class="job-details">
                        <div class="detail-row">
                            <span class="detail-label">Monto:</span>
                            <span class="detail-value ${config.class}">${formatCurrency(payment.amount)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Fecha:</span>
                            <span class="detail-value">${formatDate(payment.date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Concepto:</span>
                            <span class="detail-value">${payment.description || 'Sin descripción'}</span>
                        </div>
                    </div>
                    <div class="job-footer">
                        <div></div>
                        <div class="job-actions">
                            <button class="btn-icon" onclick="editPayment(${payment.id})" title="Editar">
                                ✏️
                            </button>
                            <button class="btn-icon" onclick="deletePayment(${payment.id})" title="Eliminar">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        function filterPayments() {
            loadPayments();
        }

        function openPaymentModal(paymentId = null) {
            const modal = document.getElementById('paymentModal');
            const title = document.getElementById('paymentModalTitle');
            const form = document.getElementById('paymentForm');
            
            if (paymentId) {
                // Editar
                const payment = payments.find(p => p.id === paymentId);
                title.textContent = 'Editar Pago';
                document.getElementById('paymentId').value = payment.id;
                document.getElementById('paymentMechanic').value = payment.mechanicId;
                document.getElementById('paymentType').value = payment.type;
                document.getElementById('paymentAmount').value = payment.amount;
                document.getElementById('paymentDate').value = payment.date;
                document.getElementById('paymentDescription').value = payment.description || '';
                updatePaymentLabel();
            } else {
                // Nuevo
                title.textContent = 'Nuevo Pago';
                form.reset();
                document.getElementById('paymentId').value = '';
                document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
                updatePaymentLabel();
            }
            
            modal.classList.add('active');
        }

        function closePaymentModal() {
            document.getElementById('paymentModal').classList.remove('active');
        }

        function updatePaymentLabel() {
            const type = document.getElementById('paymentType').value;
            const label = document.getElementById('paymentAmountLabel');
            
            const labels = {
                'pago': 'Monto *',
                'adelanto': 'Monto Adelanto *',
                'prestamo': 'Monto Préstamo *',
                'descuento': 'Monto Descuento *'
            };
            
            label.textContent = labels[type] || 'Monto *';
        }

        function savePayment(event) {
            event.preventDefault();
            
            const paymentId = document.getElementById('paymentId').value;
            const payment = {
                id: paymentId ? parseInt(paymentId) : Date.now(),
                mechanicId: parseInt(document.getElementById('paymentMechanic').value),
                type: document.getElementById('paymentType').value,
                amount: parseFloat(document.getElementById('paymentAmount').value),
                date: document.getElementById('paymentDate').value,
                description: document.getElementById('paymentDescription').value
            };
            
            if (paymentId) {
                // Actualizar
                const index = payments.findIndex(p => p.id === parseInt(paymentId));
                payments[index] = payment;
            } else {
                // Crear
                payments.push(payment);
            }
            
            localStorage.setItem('taller-payments', JSON.stringify(payments));
            closePaymentModal();
            loadFinances();
        }

        function editPayment(paymentId) {
            openPaymentModal(paymentId);
        }

        function deletePayment(paymentId) {
            if (confirm('¿Está seguro de eliminar este pago?')) {
                payments = payments.filter(p => p.id !== paymentId);
                localStorage.setItem('taller-payments', JSON.stringify(payments));
                loadFinances();
            }
        }

        // Reportes
        function loadReports() {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            const monthlyJobs = jobs.filter(job => {
                const jobDate = new Date(job.date);
                return jobDate.getMonth() === currentMonth && jobDate.getFullYear() === currentYear;
            });
            
            const monthlyRevenue = monthlyJobs.reduce((sum, job) => sum + (job.salePrice || 0), 0);
            const averageJobValue = monthlyJobs.length > 0 ? monthlyRevenue / monthlyJobs.length : 0;
            
            // Encontrar mecánico top
            const mechanicStats = mechanics.map(mechanic => {
                const mechanicJobs = monthlyJobs.filter(j => j.mechanicId === mechanic.id);
                const revenue = mechanicJobs.reduce((sum, job) => sum + (job.salePrice || 0), 0);
                return { name: mechanic.name, revenue };
            });
            
            const topMechanic = mechanicStats.sort((a, b) => b.revenue - a.revenue)[0];
            
            document.getElementById('monthlyJobs').textContent = monthlyJobs.length;
            document.getElementById('monthlyRevenue').textContent = formatCurrency(monthlyRevenue);
            document.getElementById('averageJobValue').textContent = formatCurrency(averageJobValue);
            document.getElementById('topMechanic').textContent = topMechanic ? topMechanic.name : '-';
        }

        // Liquidación de trabajos - 40% de mano de obra
        function loadSettlement() {
            updateSettlementStats();
            loadSettlementJobs();
        }

        function updateSettlementStats() {
            // Filtrar trabajos completados y entregados que no han sido liquidados
            const pendingJobs = jobs.filter(job => 
                (job.status === 'completado' || job.status === 'entregado') && 
                !job.settled
            );

            const totalPendingSettlement = pendingJobs.reduce((sum, job) => {
                // Solo calcular liquidación para Pedro y Víctor (40% total: 20% + 20%)
                return sum + (job.laborCost * 0.40);
            }, 0);

            // Calcular adelantos y préstamos pendientes por técnico
            const totalAdvances = payments.filter(p => p.type === 'adelanto').reduce((sum, p) => sum + p.amount, 0);
            const totalLoans = payments.filter(p => p.type === 'prestamo').reduce((sum, p) => sum + p.amount, 0);
            
            // Neto a pagar = 40% de mano de obra (20% Pedro + 20% Víctor) - adelantos - préstamos + descuentos
            const totalDiscounts = payments.filter(p => p.type === 'descuento').reduce((sum, p) => sum + p.amount, 0);
            const netPayable = totalPendingSettlement - totalAdvances - totalLoans + totalDiscounts;

            document.getElementById('totalPendingSettlement').textContent = formatCurrency(totalPendingSettlement);
            document.getElementById('totalAdvances').textContent = formatCurrency(totalAdvances);
            document.getElementById('totalLoans').textContent = formatCurrency(totalLoans);
            document.getElementById('netPayable').textContent = formatCurrency(netPayable);
        }

        function loadSettlementJobs() {
            const mechanicFilter = document.getElementById('filterSettlementMechanic').value;
            const statusFilter = document.getElementById('filterSettlementStatus').value;
            
            let filteredJobs = jobs.filter(job => 
                (job.status === 'completado' || job.status === 'entregado') && !job.settled
            );

            if (mechanicFilter) {
                filteredJobs = filteredJobs.filter(job => job.mechanicId == mechanicFilter);
            }

            if (statusFilter) {
                filteredJobs = filteredJobs.filter(job => job.status === statusFilter);
            }

            const container = document.getElementById('settlementJobsList');
            
            if (filteredJobs.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">💼</div>
                        <p>No hay trabajos pendientes de liquidación</p>
                        <p style="font-size: 14px; margin-top: 8px;">Los trabajos se liquidan cuando están completados o entregados</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = filteredJobs.map(job => createSettlementJobCard(job)).join('');
        }

        function createSettlementJobCard(job) {
            const mechanic = mechanics.find(m => m.id == job.mechanicId);
            const mechanicName = mechanic ? mechanic.name : 'Técnico desconocido';
            
            // Calcular 40% de mano de obra
            const laborShare = (job.laborCost || 0) * 0.40;
            
            // División entre los 3 técnicos (13.33% cada uno)
            const individualShare = laborShare / 3;
            
            const statusClass = `status-${job.status}`;
            const statusText = {
                'completado': 'Completado',
                'entregado': 'Entregado'
            }[job.status] || job.status;
            
            return `
                <div class="job-card">
                    <div class="job-header">
                        <div class="job-plate">${job.plate}</div>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="job-details">
                        <div class="detail-row">
                            <span class="detail-label">Técnico:</span>
                            <span class="detail-value">${mechanicName}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Trabajo:</span>
                            <span class="detail-value">${job.description}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Costo Mano de Obra:</span>
                            <span class="detail-value">${formatCurrency(job.laborCost || 0)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">40% para Técnicos:</span>
                            <span class="detail-value text-success">${formatCurrency(laborShare)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Por Técnico (x3):</span>
                            <span class="detail-value text-primary">${formatCurrency(individualShare)} c/u</span>
                        </div>
                    </div>
                    <div class="job-footer">
                        <div class="job-total">${formatCurrency(laborShare)}</div>
                        <div class="job-actions">
                            <button class="btn-icon" onclick="settleJob(${job.id})" title="Liquidar Trabajo">
                                💼
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        function filterSettlementJobs() {
            loadSettlementJobs();
        }

        function generateSettlement() {
            const pendingJobs = jobs.filter(job => 
                (job.status === 'completado' || job.status === 'entregado') && !job.settled
            );

            if (pendingJobs.length === 0) {
                alert('No hay trabajos pendientes de liquidación');
                return;
            }

            let totalLaborShare = 0;
            let breakdown = [];
            
            // Para técnicos Pedro y Víctor calcular su parte (Ismael no participa)
            const activeTechnicians = ['Pedro Barraza', 'Víctor Padilla'];
            
            mechanics.forEach(mechanic => {
                if (!activeTechnicians.includes(mechanic.name)) return; // Saltar a Ismael (no participa)
                
                const mechanicJobs = pendingJobs.filter(job => job.mechanicId === mechanic.id);
                let mechanicTotal = 0;
                
                mechanicJobs.forEach(job => {
                    const laborShare = (job.laborCost || 0) * 0.20; // 20% para cada técnico
                    mechanicTotal += laborShare;
                    
                    breakdown.push({
                        mechanic: mechanic.name,
                        job: job.description,
                        plate: job.plate,
                        individualShare: laborShare
                    });
                });
                
                totalLaborShare += mechanicTotal;
                
                // Calcular movimientos financieros pendientes
                const advances = payments.filter(p => p.mechanicId === mechanic.id && p.type === 'adelanto');
                const loans = payments.filter(p => p.mechanicId === mechanic.id && p.type === 'prestamo');
                const discounts = payments.filter(p => p.mechanicId === mechanic.id && p.type === 'descuento');
                
                const totalAdvances = advances.reduce((sum, p) => sum + p.amount, 0);
                const totalLoans = loans.reduce((sum, p) => sum + p.amount, 0);
                const totalDiscounts = discounts.reduce((sum, p) => sum + p.amount, 0);
                const netAmount = mechanicTotal - totalAdvances - totalLoans + totalDiscounts;
                
                // Mostrar liquidación por técnico
                const message = `
LIQUIDACIÓN - ${mechanic.name}
=====================================

Trabajos Pendientes:
${mechanicJobs.map(j => `- ${j.plate}: ${formatCurrency((j.laborCost || 0) * 0.20)}`).join('\n')}

Subtotal: ${formatCurrency(mechanicTotal)}

Movimientos Financieros:
- Adelantos: ${formatCurrency(totalAdvances)}
- Préstamos: ${formatCurrency(totalLoans)}
- Descuentos: +${formatCurrency(totalDiscounts)}

NETO A PAGAR: ${formatCurrency(netAmount)}

¿Procesar liquidación?`;
                
                if (confirm(message)) {
                    // Marcar trabajos como liquidados
                    mechanicJobs.forEach(job => {
                        job.settled = true;
                        job.settledDate = new Date().toISOString().split('T')[0];
                        job.settledAmount = (job.laborCost || 0) * 0.20;
                    });
                    
                    // Registrar pago neto
                    if (netAmount > 0) {
                        const payment = {
                            id: Date.now() + mechanic.id,
                            mechanicId: mechanic.id,
                            type: 'liquidacion',
                            amount: netAmount,
                            description: `Liquidación ${mechanicJobs.length} trabajos`,
                            date: new Date().toISOString().split('T')[0]
                        };
                        payments.push(payment);
                    }
                }
            });
            
            localStorage.setItem('taller-jobs', JSON.stringify(jobs));
            localStorage.setItem('taller-payments', JSON.stringify(payments));
            
            loadSettlement();
            alert('Liquidación procesada correctamente');
        }

        function settleJob(jobId) {
            const job = jobs.find(j => j.id === jobId);
            if (!job) return;
            
            const mechanic = mechanics.find(m => m.id == job.mechanicId);
            
            // Verificar que sea Pedro o Víctor (Ismael no participa en liquidación)
            const activeTechnicians = ['Pedro Barraza', 'Víctor Padilla'];
            if (!activeTechnicians.includes(mechanic.name)) {
                alert('Este técnico no participa en la liquidación del 20%');
                return;
            }

            const laborShare = (job.laborCost || 0) * 0.20; // 20% para cada técnico
            
            const message = `
LIQUIDAR TRABAJO: ${job.plate}
====================================

Técnico: ${mechanic.name}
Trabajo: ${job.description}
20% Mano de Obra: ${formatCurrency(laborShare)}

¿Liquidar este trabajo?`;
            
            if (confirm(message)) {
                job.settled = true;
                job.settledDate = new Date().toISOString().split('T')[0];
                job.settledAmount = laborShare;
                
                localStorage.setItem('taller-jobs', JSON.stringify(jobs));
                loadSettlement();
                alert('Trabajo liquidado correctamente');
            }
        }

        function viewPendingJobs() {
            const pendingJobs = jobs.filter(job => 
                (job.status === 'completado' || job.status === 'entregado') && !job.settled
            );
            
            if (pendingJobs.length === 0) {
                alert('No hay trabajos pendientes de liquidación');
                return;
            }
            
            let message = 'TRABAJOS PENDIENTES DE LIQUIDACIÓN:\n\n';
            
            pendingJobs.forEach(job => {
                const mechanic = mechanics.find(m => m.id == job.mechanicId);
                const laborShare = (job.laborCost || 0) * 0.40;
                const individualShare = laborShare / 3;
                
                message += `${job.plate} - ${mechanic.name}: ${formatCurrency(individualShare)}\n`;
            });
            
            const totalPending = pendingJobs.reduce((sum, job) => {
                return sum + ((job.laborCost || 0) * 0.40 / 3);
            }, 0);
            
            message += `\nTotal Pendiente: ${formatCurrency(totalPending)}`;
            
            alert(message);
        }

        // Utilidades
        function formatCurrency(amount) {
            return new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0
            }).format(amount);
        }

        function formatDate(dateString) {
            return new Date(dateString).toLocaleDateString('es-CO');
        }

        // Funciones para el flujo completo de recepción
        
        // ===== RECEPCIÓN DE VEHÍCULOS =====
        function loadReception() {
            const container = document.getElementById('receptionList');
            
            if (receptions.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <p>No hay recepciones registradas</p>
                        <button class="btn btn-primary mt-sm" onclick="openReceptionModal()">Crear Primera Recepción</button>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = receptions.map(reception => createReceptionCard(reception)).join('');
        }
        
        function createReceptionCard(reception) {
            const mechanic = mechanics.find(m => m.id == reception.assignedMechanic);
            const mechanicName = mechanic ? mechanic.name : 'Sin asignar';
            
            const statusColors = {
                'nueva': 'status-pending',
                'en_evaluacion': 'status-inprogress', 
                'presupuestado': 'status-completed',
                'aprobada': 'status-completed',
                'en_proceso': 'status-inprogress',
                'completada': 'status-completed'
            };
            
            const statusLabels = {
                'nueva': 'Nueva',
                'en_evaluacion': 'En Evaluación',
                'presupuestado': 'Presupuestado',
                'aprobada': 'Aprobada',
                'en_proceso': 'En Proceso',
                'completada': 'Completada'
            };
            
            return `
                <div class="job-card">
                    <div class="job-header">
                        <h3 class="job-title">${reception.orderNumber}</h3>
                        <span class="status-badge ${statusColors[reception.status]}">${statusLabels[reception.status]}</span>
                    </div>
                    <div class="job-info">
                        <p><strong>Cliente:</strong> ${reception.clientName}</p>
                        <p><strong>Vehículo:</strong> ${reception.vehicleBrand} ${reception.vehicleModel} (${reception.vehicleYear}) - ${reception.vehiclePlate}</p>
                        <p><strong>Kilometraje:</strong> ${reception.mileage.toLocaleString()} km</p>
                        <p><strong>Problema:</strong> ${reception.problemDescription}</p>
                        <p><strong>Técnico:</strong> ${mechanicName}</p>
                        <p><strong>Fecha:</strong> ${formatDate(reception.receptionDate)}</p>
                        <p><strong>Prioridad:</strong> ${reception.priority}</p>
                    </div>
                    <div class="job-actions">
                        <button class="btn btn-sm" onclick="viewReception(${reception.id})">👁️ Ver</button>
                        <button class="btn btn-sm btn-primary" onclick="createQuoteFromReception(${reception.id})">💰 Cotizar</button>
                        <button class="btn btn-sm btn-secondary" onclick="scheduleAppointment(${reception.id})">📅 Agendar</button>
                        <button class="btn btn-sm" onclick="convertToJob(${reception.id})">🔨 Crear Trabajo</button>
                    </div>
                </div>
            `;
        }
        
        function openReceptionModal() {
            document.getElementById('receptionModalTitle').textContent = 'Nueva Recepción';
            document.getElementById('receptionForm').reset();
            document.getElementById('receptionId').value = '';
            document.getElementById('receptionModal').classList.add('active');
        }
        
        function viewReception(receptionId) {
            const reception = receptions.find(r => r.id === receptionId);
            if (!reception) return;
            
            alert(`
RECEPCIÓN ${reception.orderNumber}
================================
Cliente: ${reception.clientName}
Teléfono: ${reception.clientPhone}
Email: ${reception.clientEmail}

Vehículo:
- Placa: ${reception.vehiclePlate}
- Marca: ${reception.vehicleBrand} ${reception.vehicleModel}
- Año: ${reception.vehicleYear}
- Kilometraje: ${reception.mileage.toLocaleString()} km

Problema reportado: ${reception.problemDescription}
Técnico asignado: ${mechanics.find(m => m.id == reception.assignedMechanic)?.name}
Fecha de recepción: ${formatDate(reception.receptionDate)}
Prioridad: ${reception.priority}
Estado: ${reception.status}
            `);
        }
        
        function createQuoteFromReception(receptionId) {
            const reception = receptions.find(r => r.id === receptionId);
            if (!reception) return;
            
            alert(`Creando cotización para ${reception.clientName} - Vehículo ${reception.vehiclePlate}`);
            // TODO: Implementar creación de cotización desde recepción
        }
        
        function scheduleAppointment(receptionId) {
            const reception = receptions.find(r => r.id === receptionId);
            if (!reception) return;
            
            alert(`Agendando cita para ${reception.clientName} - ${reception.vehiclePlate}`);
            // TODO: Implementar agendamiento en calendario
        }
        
        function convertToJob(receptionId) {
            const reception = receptions.find(r => r.id === receptionId);
            if (!reception) return;
            
            // Convertir recepción a trabajo
            const newJob = {
                id: Date.now(),
                plate: reception.vehiclePlate,
                mileage: reception.mileage,
                description: reception.problemDescription,
                mechanicId: reception.assignedMechanic,
                parts: '',
                partsCost: 0,
                laborCost: 0,
                salePrice: 0,
                status: 'pendiente',
                date: reception.receptionDate,
                fromReception: receptionId
            };
            
            jobs.push(newJob);
            localStorage.setItem('taller-jobs', JSON.stringify(jobs));
            
            // Actualizar estado de recepción
            reception.status = 'en_proceso';
            localStorage.setItem('taller-receptions', JSON.stringify(receptions));
            
            alert('Recepción convertida a trabajo exitosamente');
            loadReception();
        }

        // ===== COTIZACIONES =====
        function loadQuotes() {
            // Actualizar estadísticas
            const pendingQuotes = quotes.filter(q => q.status === 'pendiente').length;
            const approvedQuotes = quotes.filter(q => q.status === 'aprobada').length;
            const totalValue = quotes.reduce((sum, q) => sum + q.total, 0);
            
            document.getElementById('pendingQuotes').textContent = pendingQuotes;
            document.getElementById('approvedQuotes').textContent = approvedQuotes;
            document.getElementById('totalQuoteValue').textContent = formatCurrency(totalValue);
            
            // Cargar lista
            const container = document.getElementById('quotesList');
            
            if (quotes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">💰</div>
                        <p>No hay cotizaciones registradas</p>
                        <button class="btn btn-primary mt-sm" onclick="openQuoteModal()">Crear Primera Cotización</button>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = quotes.map(quote => createQuoteCard(quote)).join('');
        }
        
        function createQuoteCard(quote) {
            const statusColors = {
                'pendiente': 'status-pending',
                'aprobada': 'status-completed',
                'rechazada': 'status-cancelled'
            };
            
            const statusLabels = {
                'pendiente': 'Pendiente',
                'aprobada': 'Aprobada',
                'rechazada': 'Rechazada'
            };
            
            return `
                <div class="job-card">
                    <div class="job-header">
                        <h3 class="job-title">${quote.quoteNumber}</h3>
                        <span class="status-badge ${statusColors[quote.status]}">${statusLabels[quote.status]}</span>
                    </div>
                    <div class="job-info">
                        <p><strong>Cliente:</strong> ${quote.clientName}</p>
                        <p><strong>Vehículo:</strong> ${quote.vehiclePlate}</p>
                        <p><strong>Items:</strong> ${quote.items.length} productos/servicios</p>
                        <p><strong>Costo Mano de Obra:</strong> ${formatCurrency(quote.laborCost)}</p>
                        <p><strong>Costo Repuestos:</strong> ${formatCurrency(quote.partsCost)}</p>
                        <p><strong>TOTAL:</strong> <strong>${formatCurrency(quote.total)}</strong></p>
                        <p><strong>Fecha:</strong> ${formatDate(quote.createdDate)}</p>
                        <p><strong>Válida hasta:</strong> ${formatDate(quote.validUntil)}</p>
                    </div>
                    <div class="job-actions">
                        <button class="btn btn-sm" onclick="viewQuote(${quote.id})">👁️ Ver</button>
                        <button class="btn btn-sm btn-primary" onclick="approveQuote(${quote.id})">✅ Aprobar</button>
                        <button class="btn btn-sm" onclick="exportQuotePDF(${quote.id})">📄 PDF</button>
                    </div>
                </div>
            `;
        }
        
        function openQuoteModal() {
            document.getElementById('quoteModalTitle').textContent = 'Nueva Cotización';
            document.getElementById('quoteForm').reset();
            document.getElementById('quoteId').value = '';
            document.getElementById('quoteModal').classList.add('active');
        }
        
        function viewQuote(quoteId) {
            const quote = quotes.find(q => q.id === quoteId);
            if (!quote) return;
            
            let itemsList = quote.items.map(item => 
                `- ${item.description}: ${item.quantity} x ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.total)}`
            ).join('\n');
            
            alert(`
COTIZACIÓN ${quote.quoteNumber}
================================
Cliente: ${quote.clientName}
Vehículo: ${quote.vehiclePlate}

ITEMS:
${itemsList}

RESUMEN:
- Costo Mano de Obra: ${formatCurrency(quote.laborCost)}
- Costo Repuestos: ${formatCurrency(quote.partsCost)}
- TOTAL: ${formatCurrency(quote.total)}

Fecha: ${formatDate(quote.createdDate)}
Válida hasta: ${formatDate(quote.validUntil)}
Estado: ${quote.status}
            `);
        }
        
        function approveQuote(quoteId) {
            const quote = quotes.find(q => q.id === quoteId);
            if (!quote) return;
            
            if (confirm(`¿Aprobar cotización ${quote.quoteNumber}?`)) {
                quote.status = 'aprobada';
                localStorage.setItem('taller-quotes', JSON.stringify(quotes));
                loadQuotes();
                alert('Cotización aprobada exitosamente');
            }
        }
        
        function exportQuotePDF(quoteId) {
            alert('Exportando cotización a PDF...');
            // TODO: Implementar exportación a PDF
        }
        
        function generateQuoteReport() {
            alert('Generando reporte de cotizaciones...');
            // TODO: Implementar reporte de cotizaciones
        }

        // ===== CALENDARIO =====
        function loadCalendar() {
            const currentWeek = new Date();
            document.getElementById('currentWeek').textContent = `Semana del ${formatDate(currentWeek.toISOString().split('T')[0])}`;
            
            // Generar calendario de 8 técnicos (usando los 3 disponibles + 5 vacíos)
            const calendarGrid = document.getElementById('calendarGrid');
            let calendarHTML = '';
            
            // Header con días de la semana
            calendarHTML += '<div class="calendar-row calendar-header">';
            calendarHTML += '<div class="calendar-cell mechanic-name">Técnico</div>';
            for (let i = 0; i < 7; i++) {
                const date = new Date(currentWeek);
                date.setDate(date.getDate() + i);
                const dayName = date.toLocaleDateString('es-CO', { weekday: 'short' });
                calendarHTML += `<div class="calendar-cell">${dayName}<br>${date.getDate()}</div>`;
            }
            calendarHTML += '</div>';
            
            // Filas para cada técnico
            for (let i = 0; i < 8; i++) {
                const mechanic = mechanics[i] || { id: i + 1, name: `Técnico ${i + 1}`, specialty: 'Disponible' };
                calendarHTML += `<div class="calendar-row">`;
                calendarHTML += `<div class="calendar-cell mechanic-name">${mechanic.name}<br><small>${mechanic.specialty}</small></div>`;
                
                for (let j = 0; j < 7; j++) {
                    const date = new Date(currentWeek);
                    date.setDate(date.getDate() + j);
                    const dateString = date.toISOString().split('T')[0];
                    
                    const dayAppointments = calendarAppointments.filter(apt => 
                        apt.date === dateString && apt.mechanicId === mechanic.id
                    );
                    
                    let cellContent = '';
                    dayAppointments.forEach(apt => {
                        cellContent += `<div class="appointment" onclick="viewAppointment(${apt.id})">${apt.time} - ${apt.description}</div>`;
                    });
                    
                    calendarHTML += `<div class="calendar-cell" onclick="addAppointment('${dateString}', ${mechanic.id})">${cellContent}</div>`;
                }
                calendarHTML += '</div>';
            }
            
            calendarGrid.innerHTML = calendarHTML;
        }
        
        function showPreviousWeek() {
            alert('Navegando a semana anterior...');
            // TODO: Implementar navegación de semanas
        }
        
        function showNextWeek() {
            alert('Navegando a siguiente semana...');
            // TODO: Implementar navegación de semanas
        }
        
        function viewAppointment(appointmentId) {
            const appointment = calendarAppointments.find(a => a.id === appointmentId);
            if (!appointment) return;
            
            const mechanic = mechanics.find(m => m.id == appointment.mechanicId);
            alert(`
CITA AGENDADA
=============
Fecha: ${formatDate(appointment.date)}
Hora: ${appointment.time}
Técnico: ${mechanic?.name}
Tipo: ${appointment.type}
Descripción: ${appointment.description}
Cliente: ${appointment.clientName}
Estado: ${appointment.status}
            `);
        }
        
        function addAppointment(date, mechanicId) {
            alert(`Agregar cita para ${formatDate(date)} con técnico ${mechanicId}`);
            // TODO: Implementar agregar cita
        }

        // ===== HISTORIAL DE VEHÍCULO =====
        function loadVehicleHistory() {
            const container = document.getElementById('vehicleHistoryContainer');
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🚗</div>
                    <p>Ingresa una placa para ver el historial completo del vehículo</p>
                </div>
            `;
        }
        
        function searchVehicleHistory() {
            const plateInput = document.getElementById('searchVehiclePlate');
            const plate = plateInput.value.trim().toUpperCase();
            
            if (plate.length < 3) {
                loadVehicleHistory();
                return;
            }
            
            const vehicleRecords = vehicleHistory.filter(record => 
                record.vehiclePlate.toUpperCase().includes(plate)
            );
            
            const container = document.getElementById('vehicleHistoryContainer');
            
            if (vehicleRecords.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <p>No se encontraron registros para la placa: ${plate}</p>
                    </div>
                `;
                return;
            }
            
            // Agrupar por vehículo
            const groupedByPlate = vehicleRecords.reduce((groups, record) => {
                const plate = record.vehiclePlate;
                if (!groups[plate]) {
                    groups[plate] = [];
                }
                groups[plate].push(record);
                return groups;
            }, {});
            
            let historyHTML = '';
            Object.keys(groupedByPlate).forEach(plateKey => {
                const records = groupedByPlate[plateKey].sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate));
                const lastMileage = records[0]?.mileage || 0;
                const nextMaintenance = records.find(r => r.nextMaintenance)?.nextMaintenance;
                
                historyHTML += `
                    <div class="vehicle-history-section">
                        <h3 class="vehicle-plate">${plateKey}</h3>
                        <div class="vehicle-summary">
                            <p><strong>Último kilometraje:</strong> ${lastMileage.toLocaleString()} km</p>
                            ${nextMaintenance ? `<p><strong>Próximo mantenimiento:</strong> ${formatDate(nextMaintenance)}</p>` : ''}
                            <p><strong>Total servicios:</strong> ${records.length}</p>
                        </div>
                        <div class="service-history">
                            ${records.map(record => createServiceRecord(record)).join('')}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = historyHTML;
        }
        
        function createServiceRecord(record) {
            const mechanic = mechanics.find(m => m.id == record.mechanicId);
            return `
                <div class="service-record">
                    <div class="service-header">
                        <span class="service-date">${formatDate(record.serviceDate)}</span>
                        <span class="service-type">${record.serviceType}</span>
                        <span class="service-cost">${formatCurrency(record.cost)}</span>
                    </div>
                    <div class="service-details">
                        <p><strong>Descripción:</strong> ${record.description}</p>
                        <p><strong>Técnico:</strong> ${mechanic?.name || 'No especificado'}</p>
                        <p><strong>Repuestos:</strong> ${record.parts}</p>
                        <p><strong>Kilometraje:</strong> ${record.mileage.toLocaleString()} km</p>
                        ${record.nextMaintenance ? `<p><strong>Próximo mantenimiento:</strong> ${formatDate(record.nextMaintenance)}</p>` : ''}
                    </div>
                </div>
            `;
        }

        // ===== NOTIFICACIONES =====
        function loadNotifications() {
            // Actualizar estadísticas
            const pendingMaintenance = notifications.filter(n => n.type === 'mantenimiento' && n.status === 'pendiente').length;
            const lowStockAlerts = notifications.filter(n => n.type === 'stock' && n.status === 'alerta').length;
            const followUpCalls = notifications.filter(n => n.type === 'seguimiento' && n.status === 'pendiente').length;
            
            document.getElementById('pendingMaintenance').textContent = pendingMaintenance;
            document.getElementById('lowStockAlerts').textContent = lowStockAlerts;
            document.getElementById('followUpCalls').textContent = followUpCalls;
            
            // Cargar lista de notificaciones
            const container = document.getElementById('notificationsList');
            
            if (notifications.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔔</div>
                        <p>No hay notificaciones pendientes</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = notifications.map(notification => createNotificationCard(notification)).join('');
        }
        
        function createNotificationCard(notification) {
            const priorityColors = {
                'alta': 'priority-high',
                'media': 'priority-medium', 
                'baja': 'priority-low'
            };
            
            const typeIcons = {
                'mantenimiento': '🔧',
                'stock': '📦',
                'seguimiento': '📞',
                'general': '📋'
            };
            
            return `
                <div class="notification-card ${priorityColors[notification.priority]}">
                    <div class="notification-header">
                        <span class="notification-icon">${typeIcons[notification.type] || '📋'}</span>
                        <h4 class="notification-title">${notification.title}</h4>
                        <span class="notification-date">${formatDate(notification.createdDate)}</span>
                    </div>
                    <div class="notification-content">
                        <p>${notification.message}</p>
                        ${notification.vehiclePlate ? `<p><strong>Vehículo:</strong> ${notification.vehiclePlate}</p>` : ''}
                        ${notification.dueDate ? `<p><strong>Fecha límite:</strong> ${formatDate(notification.dueDate)}</p>` : ''}
                        ${notification.currentStock ? `<p><strong>Stock actual:</strong> ${notification.currentStock} (mínimo: ${notification.minStock})</p>` : ''}
                    </div>
                    <div class="notification-actions">
                        <button class="btn btn-sm" onclick="markAsRead(${notification.id})">✅ Marcar leído</button>
                        <button class="btn btn-sm btn-primary" onclick="actionNotification(${notification.id})">🔄 Acción</button>
                    </div>
                </div>
            `;
        }
        
        function sendMaintenanceReminders() {
            const maintenanceNotifications = notifications.filter(n => n.type === 'mantenimiento' && n.status === 'pendiente');
            if (maintenanceNotifications.length === 0) {
                alert('No hay mantenimientos pendientes para enviar recordatorios');
                return;
            }
            
            alert(`Enviando recordatorios de mantenimiento para ${maintenanceNotifications.length} vehículos...`);
            // TODO: Implementar envío de recordatorios por email/SMS
        }
        
        function checkStockAlerts() {
            const stockNotifications = notifications.filter(n => n.type === 'stock' && n.status === 'alerta');
            if (stockNotifications.length === 0) {
                alert('No hay alertas de stock bajo');
                return;
            }
            
            alert(`Verificando stock para ${stockNotifications.length} productos...`);
            // TODO: Implementar verificación de stock en tiempo real
        }
        
        function markAsRead(notificationId) {
            const notification = notifications.find(n => n.id === notificationId);
            if (!notification) return;
            
            notification.status = 'leida';
            localStorage.setItem('taller-notifications', JSON.stringify(notifications));
            loadNotifications();
        }
        
        function actionNotification(notificationId) {
            const notification = notifications.find(n => n.id === notificationId);
            if (!notification) return;
            
            switch (notification.type) {
                case 'mantenimiento':
                    alert('Abriendo agenda de mantenimiento...');
                    break;
                case 'stock':
                    alert('Abriendo gestión de inventario...');
                    break;
                case 'seguimiento':
                    alert('Abriendo agenda de seguimiento...');
                    break;
                default:
                    alert('Realizando acción específica...');
            }
        }

        // Event listeners
        document.addEventListener('DOMContentLoaded', function() {
            // Si ya hay un usuario logueado, mostrar la app
            if (currentUser) {
                document.getElementById('loginModal').classList.remove('active');
                initializeApp();
            }
        });
