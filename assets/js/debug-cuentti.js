/**
 * ============================================
 * 🔧 HERRAMIENTA DE DEBUG CUENTTI
 * ============================================
 * Abre la consola (F12) y ejecuta los comandos de aquí
 * para verificar toda la integración CUENTTI
 */

console.log('📦 Herramienta de Debug CUENTTI cargada. Escribe "runAllTests()" para ejecutar todas las pruebas');

// ============================================
// 1. CONFIGURACIÓN
// ============================================

window.debugCuentti = {
    // Test 1: Verificar configuración cargada
    async testConfiguracion() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 1: CONFIGURACIÓN CUENTTI');
        console.log('='.repeat(60));
        
        try {
            if (!window.cuenttiConfig) {
                console.error('❌ cuenttiConfig no está definido');
                return false;
            }
            
            console.log('✅ cuenttiConfig existe');
            console.table({
                'Base URL': cuenttiConfig.baseUrl,
                'Token': cuenttiConfig.token ? '✅ Definido' : '❌ NO definido',
                'Company ID': cuenttiConfig.companyId || '❌ NO',
                'Branch ID': cuenttiConfig.branchId || '❌ NO',
                'Paths configurados': cuenttiConfig.paths ? '✅ SÍ' : '❌ NO'
            });
            
            if (cuenttiConfig.paths) {
                console.log('\n📍 PATHS DISPONIBLES:');
                console.log('  maestros:', Object.keys(cuenttiConfig.paths.maestros || {}));
                console.log('  productos:', Object.keys(cuenttiConfig.paths.productos || {}));
                console.log('  inventario:', Object.keys(cuenttiConfig.paths.inventario || {}));
                console.log('  clientes:', Object.keys(cuenttiConfig.paths.clientes || {}));
                console.log('  facturas:', Object.keys(cuenttiConfig.paths.facturas || {}));
            }
            
            return true;
        } catch (e) {
            console.error('❌ Error en TEST 1:', e.message);
            return false;
        }
    },

    // Test 2: Verificar funciones exportadas
    testFuncionesExportadas() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 2: FUNCIONES EXPORTADAS');
        console.log('='.repeat(60));
        
        const funciones = [
            'buscarClienteEnCuentti',
            'cuenttiRequest',
            'cargarClientesDesdeCuentti',
            'filtrarClientesModal',
            'buscarClientePorCedula',
            'completarTrabajo',
            'generarFacturaDesdeTrabajoCompleto',
            'obtenerListaClientes'
        ];
        
        const resultados = {};
        funciones.forEach(fn => {
            resultados[fn] = typeof window[fn] === 'function' ? '✅' : '❌';
        });
        
        console.table(resultados);
        return true;
    },

    // Test 3: Verificar variables globales
    testVariablesGlobales() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 3: VARIABLES GLOBALES');
        console.log('='.repeat(60));
        
        const variables = {
            'clientes (local)': Array.isArray(window.clientes) ? `✅ ${window.clientes.length} clientes` : '❌ NO array',
            'cuenttiClientes': Array.isArray(window.cuenttiClientes) ? `✅ ${window.cuenttiClientes.length} clientes` : '❌ NO array',
            'cuenttiConfig': window.cuenttiConfig ? '✅ Existe' : '❌ NO existe',
            'trabajos': Array.isArray(window.trabajos) ? `✅ ${window.trabajos.length} trabajos` : '❌ NO array',
            'facturas': Array.isArray(window.facturas) ? `✅ ${window.facturas.length} facturas` : '❌ NO array'
        };
        
        console.table(variables);
        
        // Mostrar primeros clientes
        console.log('\n👥 PRIMEROS CLIENTES LOCALES:');
        if (Array.isArray(window.clientes) && window.clientes.length > 0) {
            console.table(window.clientes.slice(0, 3).map(c => ({
                'Cédula': c.cedula || c.documento || c.id,
                'Nombre': c.nombre || c.name,
                'Teléfono': c.telefono || c.phone,
                'Email': c.email
            })));
        } else {
            console.log('❌ No hay clientes locales');
        }
        
        return true;
    },

    // Test 4: Probar búsqueda de cliente CUENTTI
    async testBuscarClienteCuentti(cedula = '1098765432') {
        console.log('\n' + '='.repeat(60));
        console.log(`✅ TEST 4: BUSCAR CLIENTE CUENTTI - ${cedula}`);
        console.log('='.repeat(60));
        
        try {
            console.log(`🔍 Buscando cliente con cédula: ${cedula}`);
            const cliente = await buscarClienteEnCuentti(cedula);
            
            if (cliente) {
                console.log('✅ Cliente encontrado:');
                console.table(cliente);
                return cliente;
            } else {
                console.log('⚠️ Cliente no encontrado en CUENTTI');
                return null;
            }
        } catch (e) {
            console.error('❌ Error buscando cliente:', e.message);
            return null;
        }
    },

    // Test 5: Probar request directo a CUENTTI
    async testRequestCuentti() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 5: PROBAR REQUEST DIRECTO A CUENTTI');
        console.log('='.repeat(60));
        
        try {
            if (!cuenttiConfig.paths?.maestros?.consultarSucursales) {
                console.error('❌ Path maestros.consultarSucursales no configurado');
                return null;
            }
            
            const endpoint = cuenttiConfig.paths.maestros.consultarSucursales
                .replace('{id_sucursal}', cuenttiConfig.branchId);
            
            console.log('📡 Endpoint:', endpoint);
            console.log('⏳ Esperando respuesta...');
            
            const response = await cuenttiRequest(endpoint, 'GET');
            console.log('✅ Respuesta recibida:');
            console.log(response);
            return response;
        } catch (e) {
            console.error('❌ Error en request:', e.message);
            return null;
        }
    },

    // Test 6: Cargar inventario CUENTTI
    async testCargarInventario() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 6: CARGAR INVENTARIO CUENTTI');
        console.log('='.repeat(60));
        
        try {
            console.log('⏳ Cargando inventario...');
            await cargarInventarioDesdeCuentti();
            console.log('✅ Inventario cargado');
            console.log(`Total de productos: ${window.inventario?.length || 0}`);
            
            if (window.inventario && window.inventario.length > 0) {
                console.log('📦 Primeros 3 productos:');
                console.table(window.inventario.slice(0, 3).map(p => ({
                    'Código': p.codigo || p.code,
                    'Nombre': p.nombre || p.name,
                    'Stock': p.stock || p.cantidad,
                    'Precio': p.precio || p.price
                })));
            }
            return true;
        } catch (e) {
            console.error('❌ Error cargando inventario:', e.message);
            return false;
        }
    },

    // Test 7: Cargar clientes CUENTTI
    async testCargarClientes() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 7: CARGAR CLIENTES CUENTTI');
        console.log('='.repeat(60));
        
        try {
            console.log('⏳ Cargando clientes...');
            await cargarClientesDesdeCuentti();
            console.log('✅ Clientes cargados');
            console.log(`Total de clientes: ${window.cuenttiClientes?.length || 0}`);
            
            if (window.cuenttiClientes && window.cuenttiClientes.length > 0) {
                console.log('👥 Primeros 3 clientes:');
                console.table(window.cuenttiClientes.slice(0, 3).map(c => ({
                    'Cédula': c.cedula || c.documento,
                    'Nombre': c.nombre || c.name,
                    'Email': c.email,
                    'Teléfono': c.telefono || c.phone
                })));
            }
            return true;
        } catch (e) {
            console.error('❌ Error cargando clientes:', e.message);
            return false;
        }
    },

    // Test 8: Verificar cola de sincronización
    testColaSincronizacion() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 8: COLA DE SINCRONIZACIÓN');
        console.log('='.repeat(60));
        
        try {
            const cola = localStorage.getItem('cuentti_cola_sync');
            if (cola) {
                const items = JSON.parse(cola);
                console.log(`✅ Cola tiene ${items.length} items`);
                console.table(items.map((item, idx) => ({
                    'ID': idx,
                    'Tipo': item.tipo,
                    'Status': item.status,
                    'Intentos': item.intentos,
                    'Timestamp': new Date(item.timestamp).toLocaleString()
                })));
            } else {
                console.log('✅ Cola vacía (nada pendiente)');
            }
            return true;
        } catch (e) {
            console.error('❌ Error leyendo cola:', e.message);
            return false;
        }
    },

    // Test 9: Probar generación de factura
    testGenerarFactura() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 9: GENERAR FACTURA DE PRUEBA');
        console.log('='.repeat(60));
        
        try {
            if (!window.trabajos || window.trabajos.length === 0) {
                console.log('⚠️ No hay trabajos disponibles para probar');
                return null;
            }
            
            const trabajo = window.trabajos[0];
            console.log('📋 Trabajo seleccionado:', trabajo.id);
            
            if (typeof generarFacturaDesdeTrabajoCompleto !== 'function') {
                console.error('❌ generarFacturaDesdeTrabajoCompleto no existe');
                return null;
            }
            
            const factura = generarFacturaDesdeTrabajoCompleto(trabajo);
            console.log('✅ Factura generada:');
            console.table({
                'ID Factura': factura.id,
                'Cliente': factura.clienteNombre,
                'Subtotal': factura.subtotal,
                'IVA': factura.iva,
                'Total': factura.total,
                'Items': factura.items?.length
            });
            console.log('Factura completa:', factura);
            return factura;
        } catch (e) {
            console.error('❌ Error generando factura:', e.message);
            return null;
        }
    },

    // Test 10: Probar modal de búsqueda
    async testModalBusqueda(cedula = '') {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 10: MODAL DE BÚSQUEDA');
        console.log('='.repeat(60));
        
        try {
            console.log('📋 Abriendo modal de búsqueda...');
            window.abrirBuscadorClientes();
            console.log('✅ Modal abierto');
            
            if (cedula) {
                console.log(`🔍 Buscando: ${cedula}`);
                await window.filtrarClientesModal(cedula);
                console.log('✅ Búsqueda completada, revisa el modal');
            }
            return true;
        } catch (e) {
            console.error('❌ Error:', e.message);
            return false;
        }
    },

    // Test 11: Ver localStorage
    testLocalStorage() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 11: CONTENIDO LOCALSTORAGE');
        console.log('='.repeat(60));
        
        const keys = [
            'cuentti_cola_sync',
            'cuentti_clientes_backup',
            'cuentti_inventario_backup'
        ];
        
        keys.forEach(key => {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    console.log(`\n📦 ${key}:`);
                    if (Array.isArray(parsed)) {
                        console.log(`  └─ ${parsed.length} items`);
                    } else {
                        console.log('  └─', parsed);
                    }
                } else {
                    console.log(`📦 ${key}: (vacío)`);
                }
            } catch (e) {
                console.log(`📦 ${key}: ERROR - ${e.message}`);
            }
        });
        
        return true;
    },

    // Test 12: Crear cliente de prueba
    async testCrearCliente() {
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST 12: CREAR CLIENTE DE PRUEBA EN CUENTTI');
        console.log('='.repeat(60));
        
        try {
            const cedula = `TEST${Date.now()}`;
            const nombre = `Cliente Prueba ${new Date().toLocaleTimeString()}`;
            
            console.log('📝 Datos de prueba:');
            console.log(`  Cédula: ${cedula}`);
            console.log(`  Nombre: ${nombre}`);
            
            if (!window.crearClienteEnCuenttiReal) {
                console.log('⚠️ Función crearClienteEnCuenttiReal no encontrada, usando cola');
            }
            
            console.log('⏳ Creando cliente...');
            const resultado = await crearClienteEnCuentti(cedula, nombre, '3001234567', 'test@example.com');
            console.log('✅ Cliente creado:');
            console.log(resultado);
            return resultado;
        } catch (e) {
            console.error('❌ Error:', e.message);
            return null;
        }
    },

    // Ejecutar todas las pruebas
    async runAll() {
        console.clear();
        console.log('\n🚀 INICIANDO TODAS LAS PRUEBAS CUENTTI\n');
        
        const resultados = [];
        
        // Test 1-3: Sin esperar (sincronos)
        resultados.push({ test: '1. Configuración', ok: await this.testConfiguracion() });
        resultados.push({ test: '2. Funciones exportadas', ok: this.testFuncionesExportadas() });
        resultados.push({ test: '3. Variables globales', ok: this.testVariablesGlobales() });
        
        // Test 4-7: Esperar cada uno
        resultados.push({ test: '4. Buscar cliente CUENTTI', ok: await this.testBuscarClienteCuentti() !== null });
        resultados.push({ test: '5. Request CUENTTI', ok: await this.testRequestCuentti() !== null });
        resultados.push({ test: '6. Cargar inventario', ok: await this.testCargarInventario() });
        resultados.push({ test: '7. Cargar clientes', ok: await this.testCargarClientes() });
        
        // Test 8-11: Varios
        resultados.push({ test: '8. Cola sincronización', ok: this.testColaSincronizacion() });
        resultados.push({ test: '9. Generar factura', ok: this.testGenerarFactura() !== null });
        resultados.push({ test: '10. Modal búsqueda', ok: await this.testModalBusqueda() });
        resultados.push({ test: '11. LocalStorage', ok: this.testLocalStorage() });
        
        // Resumen
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMEN DE PRUEBAS');
        console.log('='.repeat(60));
        console.table(resultados);
        
        const ok = resultados.filter(r => r.ok).length;
        console.log(`\n✅ TOTAL: ${ok}/${resultados.length} pruebas pasaron\n`);
    }
};

// Hacer accesible globalmente
window.runAllTests = () => window.debugCuentti.runAll();
window.testConfig = () => window.debugCuentti.testConfiguracion();
window.testFunctions = () => window.debugCuentti.testFuncionesExportadas();
window.testVariables = () => window.debugCuentti.testVariablesGlobales();
window.testSearchCuentti = (cedula) => window.debugCuentti.testBuscarClienteCuentti(cedula);
window.testRequest = () => window.debugCuentti.testRequestCuentti();
window.testInventory = () => window.debugCuentti.testCargarInventario();
window.testClients = () => window.debugCuentti.testCargarClientes();
window.testQueue = () => window.debugCuentti.testColaSincronizacion();
window.testInvoice = () => window.debugCuentti.testGenerarFactura();
window.testModal = (cedula) => window.debugCuentti.testModalBusqueda(cedula);
window.testStorage = () => window.debugCuentti.testLocalStorage();
window.testCreateClient = () => window.debugCuentti.testCrearCliente();

// Mostrar menú de ayuda
window.debugHelp = () => {
    console.clear();
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║         🔧 DEBUG CUENTTI - COMANDOS DISPONIBLES               ║
╚════════════════════════════════════════════════════════════════╝

🚀 EJECUTAR TODO:
   runAllTests()              - Ejecutar todas las pruebas

📋 TESTS INDIVIDUALES:
   testConfig()               - Verificar configuración
   testFunctions()            - Verificar funciones exportadas
   testVariables()            - Verificar variables globales
   testSearchCuentti('1234')  - Buscar cliente por cédula
   testRequest()              - Probar request a CUENTTI
   testInventory()            - Cargar inventario
   testClients()              - Cargar clientes
   testQueue()                - Ver cola de sincronización
   testInvoice()              - Generar factura de prueba
   testModal('1234')          - Abrir modal de búsqueda
   testStorage()              - Ver localStorage
   testCreateClient()         - Crear cliente de prueba

📝 EJEMPLOS:
   
   // Buscar cliente específico
   await testSearchCuentti('1098765432')
   
   // Abrir modal y buscar
   await testModal('1098765432')
   
   // Ver todo
   runAllTests()
   
🔍 DEBUGGING:
   console.log(window.cuenttiConfig)      - Ver configuración
   console.log(window.clientes)           - Ver clientes locales
   console.log(window.cuenttiClientes)    - Ver clientes CUENTTI
   console.log(window.trabajos)           - Ver trabajos
   localStorage.getItem('cuentti_cola_sync') - Ver cola

═══════════════════════════════════════════════════════════════════
    `);
};

// Mostrar ayuda al cargar
console.log('📦 Debug CUENTTI cargado. Escribe: debugHelp()');
