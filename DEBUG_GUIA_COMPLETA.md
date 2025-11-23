# 🔧 Guía Completa de Debug CUENTTI

## ¿Qué es esta herramienta?

Una suite completa de debugging integrada en la aplicación para:
- ✅ Verificar configuración CUENTTI
- ✅ Probar conexión a API
- ✅ Buscar clientes en CUENTTI
- ✅ Ver todos los datos sincronizados
- ✅ Simular operaciones completas
- ✅ Ver logs detallados

---

## 🚀 Cómo Empezar

### Paso 1: Abrir la Consola
1. Abre la app en el navegador
2. Presiona **F12** en tu teclado
3. Ve a la pestaña **Console** (Consola)

### Paso 2: Escribe el Comando
En la consola, escribe:
```javascript
debugHelp()
```

Presiona **Enter** y verás un menú con todos los comandos disponibles.

---

## 📋 Comandos Principales

### Ejecutar TODAS las pruebas
```javascript
runAllTests()
```
Esto ejecuta 12 pruebas diferentes y te muestra un resumen final con ✅ o ❌.

### Pruebas Individuales

#### 1. Verificar Configuración
```javascript
testConfig()
```
Muestra:
- ✅ Si cuenttiConfig está cargado
- Base URL
- Token (si existe)
- Company ID y Branch ID
- Todos los paths disponibles

#### 2. Verificar Funciones
```javascript
testFunctions()
```
Muestra cuáles funciones CUENTTI están disponibles:
- buscarClienteEnCuentti ✅ o ❌
- cuenttiRequest ✅ o ❌
- completarTrabajo ✅ o ❌
- etc.

#### 3. Ver Variables Globales
```javascript
testVariables()
```
Muestra:
- Cuántos clientes locales hay
- Cuántos clientes CUENTTI hay
- Cuántos trabajos hay
- Estado de todas las variables

#### 4. Buscar Cliente en CUENTTI
```javascript
// Buscar un cliente específico
await testSearchCuentti('1098765432')

// Puedes usar cualquier cédula
await testSearchCuentti('9876543210')
```

Resultado esperado:
```
✅ ENCONTRADO en CUENTTI
o
❌ NO encontrado
```

#### 5. Probar Conexión CUENTTI
```javascript
testRequest()
```

Esto intenta conectarse a CUENTTI y ver si la API responde. Si funciona:
```
✅ Respuesta recibida: {...datos...}
```

#### 6. Cargar Inventario
```javascript
await testInventory()
```

Carga todos los productos desde CUENTTI y muestra:
- Total de productos
- Primeros 3 productos con código, nombre, stock y precio

#### 7. Cargar Clientes
```javascript
await testClients()
```

Carga todos los clientes desde CUENTTI y muestra:
- Total de clientes
- Primeros 3 clientes

#### 8. Ver Cola de Sincronización
```javascript
testQueue()
```

Muestra todas las operaciones pendientes en la cola:
- ID
- Tipo (factura, cliente, pago, etc.)
- Status (pending, processing, etc.)
- Intentos
- Timestamp

#### 9. Generar Factura de Prueba
```javascript
testInvoice()
```

Crea una factura de prueba basada en el primer trabajo disponible.

#### 10. Abrir Modal de Búsqueda
```javascript
// Solo abrir
testModal()

// Abrir y buscar un cliente
await testModal('1098765432')
```

#### 11. Ver LocalStorage
```javascript
testStorage()
```

Muestra todo lo que está guardado en localStorage (backups, cola, etc.)

#### 12. Crear Cliente de Prueba
```javascript
await testCreateClient()
```

Intenta crear un nuevo cliente en CUENTTI con datos de prueba.

---

## 🧪 Plan de Pruebas Recomendado

### Test 1: Verificar Setup
```javascript
testConfig()
testFunctions()
testVariables()
```
**Resultado esperado:** Todos ✅

### Test 2: Conectividad
```javascript
await testRequest()
```
**Si falla:** Verificar token y URL en `cuentti.config.json`

### Test 3: Búsqueda de Cliente
```javascript
// Primero busca cédula de cliente real que conozcas
await testSearchCuentti('1098765432')  // cambia la cédula
```
**Si falla:** 
- Verificar que el cliente existe en CUENTTI
- Revisar logs en consola (scroll up)

### Test 4: Modal Funcionando
```javascript
await testModal('1098765432')
```
**Deberías ver:**
1. Modal se abre
2. Muestra cliente encontrado en verde
3. Puedes hacer clic para seleccionar

### Test 5: Flujo Completo
1. En la app, ir a "Crear Nueva OT"
2. Hacer clic en "Buscar Cliente"
3. Ingresa cédula real
4. Espera 2-3 segundos
5. Verifica que aparezca el cliente

---

## 🐛 Debugging Avanzado

### Ver Logs Detallados

En la consola, verás logs con emojis:

| Emoji | Significado |
|-------|-----------|
| 🔍 | Iniciando búsqueda |
| ✅ | Operación exitosa |
| ❌ | Error o falla |
| ⚠️ | Advertencia |
| 📡 | Petición HTTP |
| ✓ | Completado |
| ℹ️ | Información |
| 🔄 | Procesando |

### Ejemplo de Logs Correctos:
```
🔍 Búsqueda CUENTTI iniciada - Cédula: 1098765432
   Path: /jServerj4ErpPro/api/token/consultarClienteIdentificacion/1098765432
   URL completa: https://api.cuentti.com/v1/jServerj4ErpPro/api/token/consultarClienteIdentificacion/1098765432
📦 Respuesta CUENTTI: {...}
✅ Cliente ENCONTRADO en CUENTTI: {id: 123, cedula: "1098765432", ...}
```

### Solucionar Problemas

#### ❌ "Error: Cannot access uninitialized variable"
```javascript
// Verificar qué está faltando
testConfig()
testFunctions()
testVariables()
```

#### ❌ "CUENTTI API error: 401 Unauthorized"
- Token inválido o expirado
- Verificar `cuentti.config.json`
- Revisar token en CUENTTI

#### ❌ "Path not found: consultarPorIdentificacion"
- La configuración no tiene ese path
- Verificar `cuentti.config.json` tiene los paths
- Ejecutar `testConfig()` para ver qué falta

#### ⚠️ "Cliente encontrado pero vacío"
- La API devuelve datos incompletos
- Ejecutar: `await testSearchCuentti('cédula')` para ver respuesta completa

---

## 📊 Análisis de Respuestas

### Cuando Funciona TODO ✅

```
runAllTests()
```

Deberías ver al final:
```
📊 RESUMEN DE PRUEBAS
1. Configuración ✅
2. Funciones exportadas ✅
3. Variables globales ✅
4. Buscar cliente CUENTTI ✅
5. Request CUENTTI ✅
6. Cargar inventario ✅
7. Cargar clientes ✅
8. Cola sincronización ✅
9. Generar factura ✅
10. Modal búsqueda ✅
11. LocalStorage ✅
12. Crear cliente ✅

✅ TOTAL: 12/12 pruebas pasaron
```

### Cuando Algo Falla ❌

Identifica qué test falla y ejecuta ese test individualmente:

```javascript
// Si falla test 4 (Buscar cliente CUENTTI)
await testSearchCuentti('1098765432')

// Revisa logs en consola (scroll up/down con mouse)
```

---

## 💡 Comandos Útiles para Debugging

### Ver configuración completa
```javascript
console.log(window.cuenttiConfig)
```

### Ver todos los clientes locales
```javascript
console.log(window.clientes)
```

### Ver clientes sincronizados de CUENTTI
```javascript
console.log(window.cuenttiClientes)
```

### Ver todos los trabajos
```javascript
console.log(window.trabajos)
```

### Ver cola de sincronización
```javascript
console.log(JSON.parse(localStorage.getItem('cuentti_cola_sync')))
```

### Ver respaldo de clientes
```javascript
console.log(JSON.parse(localStorage.getItem('cuentti_clientes_backup')))
```

### Limpiar localStorage (⚠️ cuidado!)
```javascript
localStorage.clear()
```

---

## 🔗 Flujo Completo de Testing

```mermaid
Inicio
   ↓
debugHelp() → Ver menú
   ↓
testConfig() → Verificar setup
   ├─ ❌ FALLA → Revisar cuentti.config.json
   └─ ✅ OK
      ↓
testRequest() → Probar conexión
   ├─ ❌ FALLA → Revisar token
   └─ ✅ OK
      ↓
await testSearchCuentti('1234567890') → Buscar cliente
   ├─ ❌ NO ENCONTRADO → Cliente no existe en CUENTTI
   └─ ✅ ENCONTRADO
      ↓
await testModal('1234567890') → Abrir modal
   ├─ ❌ FALLA → Revisar filtrarClientesModal()
   └─ ✅ OK
      ↓
✅ TODO FUNCIONA
```

---

## 📝 Ejemplo Completo: Buscar Cliente y Crear OT

### En consola:
```javascript
// 1. Verificar configuración
testConfig()

// 2. Buscar cliente específico
const cliente = await testSearchCuentti('1098765432')
console.log('Cliente encontrado:', cliente)

// 3. Ver modal
await testModal('1098765432')
```

### En la app (después de console):
```
1. Ve a "Crear Nueva OT"
2. Haz clic en "Buscar Cliente"
3. Ingresa "1098765432"
4. Deberías ver el cliente en verde
5. Haz clic para seleccionar
6. Los datos se rellenan automáticamente
7. Crea la OT normalmente
8. Completa la OT
9. ✅ Factura se genera automáticamente
10. ✅ Se envía a CUENTTI
```

---

## 🆘 Soporte

Si algo no funciona:

1. Ejecuta `runAllTests()`
2. Anota qué test falla
3. Ejecuta ese test individualmente
4. Captura los logs (scroll y screenshot)
5. Revisa `cuentti.config.json` - ¿tiene token? ¿tiene paths?

---

## 📱 Accesos Rápidos

Guardar estos en marcadores o notas:

```javascript
// Abrir ayuda
debugHelp()

// Test rápido - TODO
runAllTests()

// Buscar cliente (cambiar cédula)
await testSearchCuentti('1098765432')

// Ver config
console.log(window.cuenttiConfig)

// Ver clientes CUENTTI
console.log(window.cuenttiClientes)

// Ver cola sync
console.log(JSON.parse(localStorage.getItem('cuentti_cola_sync')))
```

---

**Última actualización:** 2025
**Version:** Debug CUENTTI v1.0
