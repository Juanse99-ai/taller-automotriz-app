# 🔍 Búsqueda de Clientes CUENTTI - Guía de Verificación

## Resumen de Cambios

Se han mejorado las funciones de búsqueda de clientes para integrar automáticamente con la API de CUENTTI:

### Funciones Actualizadas

1. **`filtrarClientesModal(termino)`** - Búsqueda en modal de OT
   - ✅ Ahora es `async`
   - ✅ Busca en CUENTTI primero
   - ✅ Cae a búsqueda local si no encuentra
   - ✅ Muestra resultados en tabla

2. **`buscarClientePorCedula(cedula)`** - Búsqueda rápida en página
   - ✅ Ahora es `async`
   - ✅ Busca en CUENTTI primero
   - ✅ Cae a búsqueda local si no encuentra
   - ✅ Resalta resultados CUENTTI en verde

3. **`filtrarClientesModalRecepcion(termino)`** - Búsqueda en modal de Recepción
   - ✅ Ahora es `async`
   - ✅ Busca en CUENTTI primero
   - ✅ Cae a búsqueda local si no encuentra

## 🧪 Plan de Pruebas

### Prueba 1: Búsqueda en Modal de OT
```
1. Abrir "Crear Nueva Orden de Trabajo"
2. Hacer clic en "Buscar Cliente"
3. Ingresa cédula de cliente CUENTTI (ej: 1098765432)
4. Esperar 2-3 segundos para que la API responda
5. ✅ Debe mostrar cliente de CUENTTI con borde verde
6. Hacer clic en cliente para seleccionar
7. ✅ Datos deben completarse correctamente
```

### Prueba 2: Búsqueda Rápida en Página
```
1. En la página principal, ir a sección "Búsqueda de Clientes"
2. Ingresa cédula completa (ej: 1098765432)
3. Esperar 2-3 segundos
4. ✅ Debe mostrar cliente con fondo verde
5. ✅ Debe mostrar: Cédula, Nombre, Teléfono, Email
6. Hacer clic para seleccionar
```

### Prueba 3: Fallback a Local
```
1. Ingresa cédula que NO existe en CUENTTI
2. ✅ Sistema debe buscar en clientes locales
3. ✅ Si existe localmente, mostrar con formato normal
4. ✅ Si no existe, mostrar "Cliente no encontrado"
```

### Prueba 4: Modal de Recepción
```
1. Ir a Recepción
2. Ingresa cédula en búsqueda
3. ✅ Debe buscar en CUENTTI primero
4. ✅ Debe mostrar en tabla
5. Hacer clic en "Seleccionar"
```

### Prueba 5: Flujo Completo
```
1. Buscar cliente CUENTTI por cédula
2. Crear OT con ese cliente
3. Agregar ítems al trabajo
4. Completar trabajo
5. ✅ Debe auto-generar factura
6. ✅ Debe auto-enviar a CUENTTI
7. ✅ Ver en consola: ✅ Factura enviada a CUENTTI
```

## 🔧 Debugging

### Abrir Consola
```
F12 → Pestaña Console
```

### Ver Logs de Búsqueda
```javascript
// En consola:
// Verás logs como:
🔍 Buscando cliente en CUENTTI: 1098765432
✅ Cliente encontrado en CUENTTI: {id: 123, cedula: '1098765432', ...}
```

### Ver Configuración CUENTTI
```javascript
// En consola:
console.log(cuenttiConfig)
// Debe mostrar: token, baseUrl, paths, etc.
```

### Probar Endpoint Manualmente
```javascript
// En consola, prueba directo:
await buscarClienteEnCuentti('1098765432')
// Debe retornar el cliente o null
```

## 📊 Comportamiento Esperado

### Caso 1: Cliente Existe en CUENTTI
```
Usuario ingresa: "1098765432"
     ↓
Sistema llama: buscarClienteEnCuentti("1098765432")
     ↓
CUENTTI API responde: {id: 123, cedula: "1098765432", nombre: "Juan Pérez", ...}
     ↓
✅ Muestra cliente con borde verde (CUENTTI)
     ↓
Usuario selecciona
     ↓
Se rellenan datos: Nombre, Teléfono, Email
```

### Caso 2: Cliente NO Existe en CUENTTI, Existe Localmente
```
Usuario ingresa: "1111111111"
     ↓
Sistema llama: buscarClienteEnCuentti("1111111111")
     ↓
CUENTTI API retorna: null
     ↓
Sistema busca localmente
     ↓
Encuentra: {cedula: "1111111111", nombre: "Local Client", ...}
     ↓
✅ Muestra cliente con formato normal (gris)
     ↓
Usuario selecciona
```

### Caso 3: Cliente NO Existe en Ningún Lugar
```
Usuario ingresa: "9999999999"
     ↓
Sistema llama: buscarClienteEnCuentti("9999999999")
     ↓
CUENTTI API retorna: null
     ↓
Sistema busca localmente
     ↓
No encuentra nada
     ↓
✅ Muestra: "❌ Cliente no encontrado en CUENTTI ni localmente"
```

## 🔄 Flujo de Integración

```
┌─────────────────────────────────────────────────────────────┐
│ Usuario abre modal y empieza a buscar                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Usuario ingresa:   │
        │ "1098765432"       │
        └────────────┬───────┘
                     │
                     ↓
        ┌────────────────────────────────────────┐
        │ filtrarClientesModal() se ejecuta      │
        │ (Ahora es ASYNC)                        │
        └────────────┬───────────────────────────┘
                     │
                     ↓
        ┌────────────────────────────────────────┐
        │ await buscarClienteEnCuentti()          │
        │ Busca en CUENTTI API                    │
        └────────────┬───────────────────────────┘
                     │
            ┌────────┴────────┐
            │                 │
       ENCONTRADO          NO ENCONTRADO
            │                 │
            ↓                 ↓
    ✅ Retorna         Busca en LOCAL
    Cliente CUENTTI    obtenerListaClientes()
            │                 │
            └────────┬────────┘
                     │
                     ↓
        ┌────────────────────────────────────┐
        │ Renderiza resultados en tabla       │
        │ - Verde si CUENTTI                  │
        │ - Gris si Local                     │
        └────────────┬───────────────────────┘
                     │
                     ↓
        ┌────────────────────────────────────┐
        │ Usuario hace clic en cliente        │
        │ seleccionarCliente() o similar      │
        └────────────┬───────────────────────┘
                     │
                     ↓
        ┌────────────────────────────────────┐
        │ Modal se cierra                     │
        │ Datos se cargan en formulario       │
        └────────────────────────────────────┘
```

## ✨ Mejoras Implementadas

### Antes ❌
- Solo buscaba clientes locales
- No integraba con CUENTTI API
- Búsqueda limitada
- Sin fallback

### Ahora ✅
- Busca en CUENTTI primero (API integrada)
- Fallback automático a búsqueda local
- Diferencia visual (verde para CUENTTI)
- Manejo de errores y timeout
- Async/await para mejor performance
- Soporta 3 puntos de búsqueda:
  - Modal OT
  - Búsqueda rápida página
  - Modal Recepción

## 📋 Checklist de Verificación

- [ ] Búsqueda en modal OT encuentra cliente CUENTTI
- [ ] Búsqueda rápida encuentra cliente CUENTTI con color verde
- [ ] Fallback local funciona cuando no hay en CUENTTI
- [ ] Modal Recepción busca en CUENTTI
- [ ] Seleccionar cliente rellena todos los datos
- [ ] Flujo completo: Buscar → Crear OT → Completar → Auto-factura
- [ ] Console no muestra errores (F12)
- [ ] Performance es rápido (< 3s respuesta CUENTTI)

## 🚀 Próximos Pasos

1. Abrir el navegador F12
2. Ejecutar las pruebas del Plan de Pruebas
3. Verificar logs en consola
4. Reportar cualquier error
5. Cuando todo funcione, hacer commit:
   ```bash
   git add -A
   git commit -m "✅ Integración de búsqueda de clientes CUENTTI en modales"
   git push
   ```

---

**Última actualización:** 2025
**Estado:** ✅ Código implementado, en espera de pruebas
