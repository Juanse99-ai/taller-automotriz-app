# 📋 Guía de Migración a CUENTTI

## ✅ Cambios Realizados

### 1. **Migración de Clientes e Inventario a CUENTTI**

**Antes:**
- Clientes almacenados en Supabase (tabla `clientes`)
- Inventario almacenado en Supabase (tabla `inventario`)

**Ahora:**
- ✅ Clientes cargados desde CUENTTI API
- ✅ Inventario cargado desde CUENTTI API
- ✅ Búsquedas en tiempo real en CUENTTI
- ✅ Respaldo local en LocalStorage

### 2. **Supabase Solo para Trabajos**

**Nuevo uso de Supabase:**
- ✅ Solo almacena órdenes de trabajo (tabla `trabajos`)
- ✅ Sincronización automática al crear/editar trabajos
- ✅ Respaldo en LocalStorage

### 3. **Funciones Implementadas**

#### CUENTTI:
- `cargarConfigCuentti()` - Carga configuración desde `cuentti.config.json`
- `cuenttiRequest()` - Función genérica para peticiones a CUENTTI
- `cargarClientesDesdeCuentti()` - Carga clientes desde API
- `cargarInventarioDesdeCuentti()` - Carga inventario desde API
- `buscarClienteEnCuentti()` - Búsqueda en tiempo real
- `buscarProductoEnCuentti()` - Búsqueda de productos en tiempo real
- `inicializarConCuentti()` - Inicialización completa del sistema

#### Supabase (Trabajos):
- `cargarTrabajosDesdeSupabase()` - Carga trabajos desde Supabase
- `guardarTrabajoEnSupabase()` - Guarda/actualiza trabajo en Supabase
- `inicializarTrabajosSupabase()` - Inicialización de trabajos

### 4. **Archivos Nuevos/Modificados**

**Nuevos:**
- `supabase_trabajos.sql` - Script SQL para crear tabla de trabajos
- `MIGRACION_CUENTTI.md` - Esta guía

**Modificados:**
- `assets/js/main.js` - Migración completa a CUENTTI
- `README.md` - Documentación actualizada

## 🚀 Pasos para Configurar

### Paso 1: Configurar CUENTTI

1. Duplica `cuentti.example.json` como `cuentti.config.json`
2. Agrega tu token de CUENTTI y configuración:
```json
{
  "baseUrl": "https://api.cuentti.com/v1",
  "token": "TU_TOKEN_AQUI",
  "companyId": "ID_EMPRESA",
  "branchId": "ID_SUCURSAL",
  "timeoutsMs": { "default": 10000 },
  "endpoints": {
    "inventory": "/inventory",
    "customers": "/customers",
    "invoices": "/invoices",
    "payments": "/payments"
  }
}
```

### Paso 2: Configurar Supabase para Trabajos

1. Ve a tu proyecto en Supabase Dashboard
2. Abre el Editor SQL
3. Ejecuta el contenido de `supabase_trabajos.sql`
4. Verifica que la tabla `trabajos` se haya creado correctamente

### Paso 3: Verificar Configuración

1. Abre la aplicación
2. Ve a la consola del navegador (F12)
3. Deberías ver:
   - ✅ "Configuración CUENTTI cargada"
   - ✅ "Clientes cargados desde CUENTTI: X registros"
   - ✅ "Inventario cargado desde CUENTTI: X productos"
   - ✅ "Trabajos cargados: X registros"

## 📊 Estructura de Datos

### CUENTTI - Clientes
```javascript
{
  id: "customer_id",
  cedula: "12345678",
  nombre: "Juan Pérez",
  telefono: "3001234567",
  email: "juan@example.com",
  direccion: "Calle 123",
  ciudad: "Bogotá"
}
```

### CUENTTI - Inventario
```javascript
{
  id: "product_id",
  codigo: "ACE001",
  nombre: "Aceite Motor 5W30",
  categoria: "Lubricantes",
  precio: 45000,
  stock: 10,
  stock_minimo: 5,
  iva: 19
}
```

### Supabase - Trabajos
```sql
{
  id: "TR-001",
  fecha: "2025-01-15T10:00:00Z",
  cedula_cliente: "12345678",
  cliente: "Juan Pérez",
  placa: "ABC123",
  marca: "Toyota",
  modelo: "Corolla",
  ano: 2020,
  items: [...], -- JSONB
  total: 150000,
  estado: "Pendiente"
}
```

## 🔄 Flujo de Datos

### Al Iniciar la Aplicación:
1. Carga configuración de CUENTTI
2. Carga clientes desde CUENTTI
3. Carga inventario desde CUENTTI
4. Carga trabajos desde Supabase
5. Sincroniza trabajos con LocalStorage

### Al Crear/Editar Trabajo:
1. Guarda en LocalStorage (inmediato)
2. Guarda en Supabase (en segundo plano)
3. Si falla Supabase, mantiene en LocalStorage

### Al Buscar Cliente:
1. Busca en cache local (cuenttiClientes)
2. Si no encuentra, busca en CUENTTI API
3. Actualiza cache local

### Al Buscar Producto:
1. Busca en cache local (cuenttiInventario)
2. Si no encuentra, busca en CUENTTI API
3. Actualiza cache local

## ⚠️ Consideraciones Importantes

1. **Token de CUENTTI:** Nunca subas `cuentti.config.json` a Git (está en `.gitignore`)

2. **Respaldo Local:** Los datos se guardan en LocalStorage como respaldo automático

3. **Sincronización:** 
   - CUENTTI se sincroniza al iniciar la app
   - Puedes sincronizar manualmente con `sincronizarDatosCuentti()`
   - Trabajos se guardan automáticamente en Supabase

4. **Offline:** 
   - La app funciona offline con datos de LocalStorage
   - Al reconectar, se sincronizan los cambios

## 🐛 Solución de Problemas

### Error: "Configuración CUENTTI no disponible"
- Verifica que `cuentti.config.json` existe
- Verifica que el token es válido
- Revisa la consola para más detalles

### Error: "No se pudieron cargar trabajos desde Supabase"
- Verifica que la tabla `trabajos` existe en Supabase
- Verifica las credenciales de Supabase en `main.js`
- Los trabajos se mantienen en LocalStorage como respaldo

### Los clientes/productos no aparecen
- Verifica la conexión a CUENTTI
- Revisa que el token tenga permisos de lectura
- Usa `sincronizarDatosCuentti()` para forzar recarga

## 📝 Notas Adicionales

- Los datos antiguos de Supabase (clientes/inventario) ya no se usan
- Puedes mantener esas tablas para referencia histórica
- Los trabajos nuevos se guardan solo en la nueva tabla `trabajos`
- El sistema es compatible hacia atrás con LocalStorage

---

**Última actualización:** Enero 2025  
**Versión:** 2.0.0

