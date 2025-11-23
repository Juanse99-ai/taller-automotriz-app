# 🚀 Plan de Implementación - Próximos Pasos para Completar Integración CUENTTI

**Fecha:** 23 de noviembre de 2025  
**Prioridad:** 🔴 ALTA  
**Duración estimada:** 3-4 semanas para completar todo

---

## 📌 Tareas Ordenadas por Prioridad

### SEMANA 1: FUNCIONALIDADES CRÍTICAS

#### 🔴 TAREA 1: Envío de Facturas a CUENTTI (12-16 horas)

**Archivo:** `assets/js/main.js`  
**Ubicación actual:** Línea ~4284 (incompleto)  
**Dependencias:** Configuración CUENTTI funcionando (✅ lista)

**Tareas específicas:**

```
[ ] 1. Crear función enviarFacturaACuentti(factura)
[ ] 2. Mapear estructura de factura local a formato CUENTTI
[ ] 3. Hacer POST a /invoices con datos normalizados
[ ] 4. Guardar cuentti_invoice_id localmente
[ ] 5. Crear función reintentoFactura() con 3 reintentos
[ ] 6. Integrar en función guardarNuevaFactura()
[ ] 7. Mostrar notificación de éxito/error al usuario
[ ] 8. Probar con Postman (integracion boot de ventas mejor.postman_collection.json)
[ ] 9. Crear casos de prueba (síncrono, fallos, reintentos)
[ ] 10. Documentar formato de respuesta de CUENTTI
```

**Código base necesario:**

```javascript
// Insertar en main.js alrededor de línea 4284

async function enviarFacturaACuentti(factura) {
    if (!cuenttiConfig || !cuenttiConfig.token) {
        console.warn('⚠️ No hay configuración CUENTTI disponible');
        return false;
    }
    
    // TODO: Implementar mapeo de datos
    // TODO: Hacer POST a endpoints.invoices
    // TODO: Manejar respuesta y guardar ID
    // TODO: Reintentos automáticos
}

function guardarNuevaFactura() {
    // TODO: Integrar enviarFacturaACuentti()
    // TODO: Mostrar estado de sincronización
}
```

**Validación de éxito:**

```javascript
✓ Factura se crea en aplicación
✓ Se envía a CUENTTI automáticamente
✓ Aparece en CUENTTI con estado "draft"
✓ Se guarda invoice_id localmente
✓ Si falla, se reintenta automáticamente
✓ Usuario ve notificación de éxito/error
```

---

#### 🔴 TAREA 2: Crear Clientes en CUENTTI (8-10 horas)

**Archivo:** `assets/js/main.js`  
**Ubicación:** Nueva función después de línea 6164  
**Dependencias:** Función buscarClienteEnCuentti() (✅ lista)

**Tareas específicas:**

```
[ ] 1. Crear función crearClienteEnCuentti(clienteData)
[ ] 2. Validar campos obligatorios (cedula, nombre, teléfono)
[ ] 3. Hacer POST a /customers con datos
[ ] 4. Guardar customer_id devuelto por CUENTTI
[ ] 5. Integrar en búsqueda de cliente (si no existe, ofrecer crear)
[ ] 6. Mostrar modal de confirmación
[ ] 7. Probar caso: cliente no existe → crear → verificar en CUENTTI
[ ] 8. Manejar errores (cliente duplicado, datos inválidos)
```

**Código base necesario:**

```javascript
// Insertar en main.js

async function crearClienteEnCuentti(clienteData) {
    // TODO: Validar datos
    // TODO: Hacer POST a /customers
    // TODO: Guardar customer_id
    // TODO: Agregar a cuenttiClientes localmente
}

// Modificar buscarClientePorCedula para detectar cuando crear
function buscarClientePorCedula(cedula) {
    // ... código existente ...
    // TODO: Si no existe, preguntar si crear
    // TODO: Llamar a crearClienteEnCuentti()
}
```

**Validación de éxito:**

```javascript
✓ Cliente no existe en búsqueda
✓ Sistema ofrece crear nuevo
✓ Se crea en CUENTTI con customer_id
✓ Se puede buscar inmediatamente después
✓ Datos se sincronizaron correctamente
```

---

#### 🟠 TAREA 3: Sistema de Cola de Sincronización (12-15 horas)

**Archivo:** `assets/js/main.js`  
**Ubicación:** Nueva sección entre inicialización y funciones CUENTTI

**Tareas específicas:**

```
[ ] 1. Crear estructura sincronizacionPendiente = []
[ ] 2. Crear función agregarAColaDeSincronizacion(operacion)
[ ] 3. Guardar cola en localStorage
[ ] 4. Crear función procesarColaDeSincronizacion()
[ ] 5. Implementar reintentos exponenciales (1s → 2s → 4s → 8s → fallar)
[ ] 6. Detectar cambio de conexión y reintentar
[ ] 7. Mostrar indicador visual "⏳ Sincronizando..."
[ ] 8. Limpiar cola cuando operaciones tengan éxito
[ ] 9. Agregar log de operaciones fallidas
[ ] 10. Probar: crear trabajo → desconectar → reconectar → sincronizar
```

**Estructura de datos:**

```javascript
let sincronizacionPendiente = [];

// Estructura de operación pendiente
{
    id: 'uuid-unique',
    tipo: 'factura|cliente|pago|stock', // tipo de operación
    datos: { ...los datos a sincronizar },
    intentos: 0,
    proximoReintento: timestamp,
    errores: [],
    timestamp: new Date().toISOString()
}
```

**Pseudocódigo:**

```javascript
async function agregarAColaDeSincronizacion(tipo, datos) {
    const operacion = {
        id: generarUUID(),
        tipo,
        datos,
        intentos: 0,
        proximoReintento: Date.now(),
        errores: [],
        timestamp: new Date().toISOString()
    };
    
    sincronizacionPendiente.push(operacion);
    guardarColaSincronizacion();
    mostrarIndicadorSincronizacion();
}

async function procesarColaDeSincronizacion() {
    for (let operacion of sincronizacionPendiente) {
        if (Date.now() >= operacion.proximoReintento) {
            try {
                await ejecutarOperacion(operacion);
                // Éxito: eliminar de cola
                sincronizacionPendiente = sincronizacionPendiente.filter(op => op.id !== operacion.id);
            } catch (error) {
                // Error: incrementar intentos
                operacion.intentos++;
                operacion.errores.push({
                    timestamp: new Date().toISOString(),
                    error: error.message
                });
                
                if (operacion.intentos < 5) {
                    // Reintento exponencial
                    operacion.proximoReintento = Date.now() + (Math.pow(2, operacion.intentos) * 1000);
                } else {
                    // Falló después de 5 intentos
                    mostrarNotificacion(`⚠️ No se pudo sincronizar ${operacion.tipo}`, 'error');
                }
            }
        }
    }
    
    guardarColaSincronizacion();
}

// Ejecutar periódicamente
setInterval(procesarColaDeSincronizacion, 5000);

// Ejecutar cuando vuelva conexión
window.addEventListener('online', procesarColaDeSincronizacion);
```

**Validación de éxito:**

```javascript
✓ Operaciones se agregan a cola cuando falla CUENTTI
✓ Cola se reinicia después de desconexión
✓ Reintentos exponenciales funcionan correctamente
✓ Se limpian después de éxito
✓ Indicador visual muestra estado
✓ Usuario puede ver operaciones pendientes
```

---

### SEMANA 2: FUNCIONALIDADES IMPORTANTES

#### 🟠 TAREA 4: Descuento de Stock en CUENTTI (8-10 horas)

**Archivo:** `assets/js/main.js`  
**Ubicación:** Nueva función después de inventario

**Tareas específicas:**

```
[ ] 1. Crear función descontarStockEnCuentti(productoId, cantidad)
[ ] 2. Validar que hay stock disponible ANTES de crear trabajo
[ ] 3. Hacer PUT a /inventory/{id} con nuevo stock
[ ] 4. Agregar a cola de sincronización si falla
[ ] 5. Actualizar cuenttiInventario localmente
[ ] 6. Integrar en guardarNuevoTrabajo()
[ ] 7. Mostrar alerta si stock insuficiente
[ ] 8. Crear opción de permitir venta sin stock
[ ] 9. Auditar cambios (quién, cuándo, cuánto)
```

**Código base:**

```javascript
async function descontarStockEnCuentti(productoId, cantidad) {
    // TODO: Encontrar producto en cuenttiInventario
    // TODO: Validar stock disponible
    // TODO: Hacer PUT con nuevo stock
    // TODO: Actualizar localmente o agregar a cola si falla
}

function crearNuevoTrabajoConRepuestos(items) {
    // TODO: Para cada item, validar stock
    // TODO: Descontar stock en CUENTTI
    // TODO: Crear trabajo
    // TODO: Auditar cambios
}
```

**Validación de éxito:**

```javascript
✓ Stock se valida antes de crear trabajo
✓ Se descuenta correctamente en CUENTTI
✓ Aparece stock actualizado en siguiente consulta
✓ Si falla, se agrega a cola de sincronización
✓ Alerta si stock insuficiente
```

---

#### 🟠 TAREA 5: Actualizar Clientes en CUENTTI (6-8 horas)

**Archivo:** `assets/js/main.js`  
**Ubicación:** Nueva función después de crearClienteEnCuentti()

**Tareas específicas:**

```
[ ] 1. Crear función actualizarClienteEnCuentti(cliente)
[ ] 2. Detectar qué campos cambiaron
[ ] 3. Hacer PUT a /customers/{id}
[ ] 4. Agregar a cola si falla
[ ] 5. Integrar en formulario de edición de cliente
[ ] 6. Manejar conflictos (cambios simultáneos)
[ ] 7. Auditar cambios de cliente
```

**Validación de éxito:**

```javascript
✓ Cambios se sincronizan a CUENTTI
✓ Verificable en CUENTTI
✓ Versión local y remota consistentes
```

---

#### 🟠 TAREA 6: Registrar Pagos en CUENTTI (10-12 horas)

**Archivo:** `assets/js/main.js`  
**Ubicación:** Nueva función después de facturas

**Tareas específicas:**

```
[ ] 1. Crear función registrarPagoEnCuentti(pago)
[ ] 2. Vincular pago a invoice_id de CUENTTI
[ ] 3. Hacer POST a /payments con detalles
[ ] 4. Actualizar estado de factura en CUENTTI
[ ] 5. Soportar múltiples métodos (efectivo, tarjeta, banco)
[ ] 6. Integrar en formulario de liquidación
[ ] 7. Auditar pagos completos
[ ] 8. Agregar a cola si falla
```

**Validación de éxito:**

```javascript
✓ Pago se registra en CUENTTI
✓ Factura cambia a estado "paid"
✓ Método de pago registrado correctamente
```

---

### SEMANA 3-4: FUNCIONALIDADES SECUNDARIAS

#### 🟡 TAREA 7: Validación y Auditoría (8-10 horas)

```
[ ] 1. Crear tabla de auditoría en localStorage
[ ] 2. Registrar todas las operaciones de sync
[ ] 3. Crear sección de "Historial de Sincronización"
[ ] 4. Permitir revisar qué se sincronizó
[ ] 5. Mostrar errores y reintentos
[ ] 6. Exportar log de auditoría
```

---

#### 🟡 TAREA 8: Tests y Documentación (12-15 horas)

```
[ ] 1. Crear suite de tests para funciones CUENTTI
[ ] 2. Tests de: creación, actualización, sincronización
[ ] 3. Tests de error handling y reintentos
[ ] 4. Pruebas de integración (flujo completo)
[ ] 5. Documentación de cada función
[ ] 6. Guía de troubleshooting
[ ] 7. Ejemplos de uso
```

---

## 🧪 Plan de Testing Detallado

### Pruebas Manuales por Función

**Test 1: Envío de Facturas**

```javascript
// Precondiciones:
- CUENTTI conectado
- Cliente existente en CUENTTI
- Inventario con al menos 2 productos

// Pasos:
1. Crear trabajo con 2 repuestos
2. Generar factura
3. Verificar:
   - Notificación "Factura enviada a CUENTTI"
   - Factura tiene invoice_id
   - Factura aparece en CUENTTI

// Casos de error a probar:
- Desconectar internet → reintentará
- Token inválido → mostrará error
- Servidor lento → no debería colgar
```

**Test 2: Crear Cliente**

```javascript
// Pasos:
1. Buscar cliente inexistente
2. Sistema ofrece "Crear nuevo cliente"
3. Llenar datos y crear
4. Verificar:
   - Cliente creado en CUENTTI
   - Aparece en búsqueda siguiente
   - Se puede usar para trabajos
```

**Test 3: Descuento de Stock**

```javascript
// Pasos:
1. Tomar stock inicial de producto (ej: 10)
2. Crear trabajo con 3 unidades del producto
3. Verificar:
   - Stock actualizado a 7 en CUENTTI
   - Stock local también 7
   - Siguiente trabajo muestra 7 disponibles
```

---

## 📊 Matriz de Dependencias

```
Tarea 1 (Facturas) ←─ Configuración CUENTTI ✅
Tarea 2 (Clientes) ←─ Búsqueda cliente ✅
Tarea 3 (Cola) ←─ Tareas 1,2,4,5,6
Tarea 4 (Stock) ←─ Tarea 3 (Cola)
Tarea 5 (Actualizar cliente) ←─ Tarea 2
Tarea 6 (Pagos) ←─ Tarea 1 (Facturas)
Tarea 7 (Auditoría) ←─ Tareas 1-6
Tarea 8 (Tests) ←─ Tareas 1-7
```

---

## 📋 Checklist Semanal

### Semana 1 Completada ✅

```
Lunes-Martes:    [ ] TAREA 1 - Facturas
Miércoles:       [ ] TAREA 2 - Clientes  
Jueves-Viernes:  [ ] TAREA 3 - Cola
```

### Semana 2 Completada ✅

```
Lunes-Martes:    [ ] TAREA 4 - Stock
Miércoles:       [ ] TAREA 5 - Actualizar cliente
Jueves-Viernes:  [ ] TAREA 6 - Pagos + Testing
```

### Semana 3-4 Completada ✅

```
Semana 3:        [ ] TAREA 7 - Auditoría + Documentación
Semana 4:        [ ] TAREA 8 - Tests completos
```

---

## 🎯 Criterios de Aceptación

### Para cada tarea, validar:

```javascript
✓ Código escrito y funcional
✓ Sin errores en consola (F12)
✓ Funciona online y offline
✓ Se sincroniza con CUENTTI correctamente
✓ Reintentos funcionan si falla conexión
✓ Notificaciones claras al usuario
✓ Datos consistentes localmente y en CUENTTI
✓ Sin memory leaks
✓ Documentado y comentado
✓ Testeable y reproducible
```

---

## 🚨 Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mittigación |
|--------|-------------|--------|------------|
| API CUENTTI cambia formato | Media | Alto | Versionar API, validar respuestas |
| Token expira | Alta | Alto | Validar token, notificar usuario |
| Pérdida de conexión | Alta | Medio | Cola de sincronización |
| Datos duplicados | Media | Medio | Auditoría, validación única |
| Performance lenta | Media | Bajo | Throttling, caching, índices |

---

## ✅ Recursos Necesarios

### Documentación

- [ ] Spec de CUENTTI API (endpoints, formatos)
- [ ] Postman collection testeada
- [ ] Ejemplos de request/response
- [ ] Manejo de errores CUENTTI

### Herramientas

- [ ] Postman para testing API
- [ ] Browser DevTools (F12) para debugging
- [ ] VS Code con extensión de JavaScript
- [ ] Git para versionamiento

### Datos de Prueba

- [ ] Cuenta CUENTTI activa
- [ ] Clientes de prueba
- [ ] Productos de prueba
- [ ] Servidor de pruebas (sandbox) si existe

---

## 📞 Contactos y Soporte

| Necesidad | Recurso |
|-----------|---------|
| Documentación CUENTTI API | https://api.cuentti.com/v1/docs |
| Soporte CUENTTI | support@cuentti.com |
| Issues del código | GitHub Issues |
| Testing | Postman (Local) + Browser (F12) |

---

## 🎓 Referencias Útiles

### Código Existente

```
Funciones CUENTTI: assets/js/main.js líneas 5864-6461
Funciones Supabase: assets/js/main.js líneas 6028-6200
Notificaciones: función showNotification()
LocalStorage: funciones save*Data() y get*Data()
```

### Patrones a Seguir

- Usar `try-catch` para manejo de errores
- Logging con `console.log()`, `console.warn()`, `console.error()`
- Notificaciones con `showNotification()`
- Persistencia en localStorage
- Variables globales definidas al inicio

---

## 🏁 Conclusión

Este plan proporciona una hoja de ruta clara para completar la integración CUENTTI. 

**Tiempo total estimado:** 50-60 horas de desarrollo
**Resultado:** Sistema de gestión 100% funcional y sincronizado con CUENTTI

**Próximo paso:** Empezar con TAREA 1 (Envío de Facturas) que es la más crítica.

