# 🚀 Quick Start - Herramienta de Debug (30 segundos)

## 3 Pasos para Probar Todo

### 1️⃣ Abre Consola
```
Presiona: F12
Haz clic en: Console
```

### 2️⃣ Escribe Comando
```javascript
debugHelp()
```
**Presiona ENTER** ↵

### 3️⃣ Elige lo que Quieres Probar

---

## 🎯 Opciones Principales

### Opción A: Verificar TODO (Recomendado)
```javascript
runAllTests()
```
Espera resultado. Te dirá ✅ o ❌ para cada test.

### Opción B: Buscar Cliente Específico
```javascript
await testSearchCuentti('1098765432')
```
Cambia `1098765432` por cédula real.

### Opción C: Probar Modal Completo
```javascript
await testModal('1098765432')
```
Se abre modal automáticamente. Verás cliente si existe.

### Opción D: Ver Config
```javascript
testConfig()
```
Muestra si CUENTTI está configurado correctamente.

### Opción E: Conectar a CUENTTI
```javascript
await testRequest()
```
Prueba si la conexión funciona.

---

## 📊 Resultados Esperados

### ✅ SI FUNCIONA
```
✅ Cliente encontrado en CUENTTI
✅ 12/12 pruebas pasaron
✅ Modal muestra cliente en verde
```

### ❌ SI NO FUNCIONA
```
Verás error en consola
Lee el mensaje
Sigue pasos en DEBUG_GUIA_COMPLETA.md
```

---

## 📚 Documentación Completa

Abre cualquiera de estos archivos:
- **`DEBUG_GUIA_COMPLETA.md`** - Guía completa (¡léela!)
- **`RESUMEN_CAMBIOS_DEBUG.md`** - Qué cambió y por qué
- **`BUSQUEDA_CLIENTES_CUENTTI.md`** - Búsqueda específicamente

---

## ✨ Atajos Rápidos

Copia/pega en consola:

```javascript
// VER AYUDA
debugHelp()

// PROBAR TODO
runAllTests()

// BUSCAR CLIENTE
await testSearchCuentti('1098765432')

// VER CONFIGURACIÓN
console.log(window.cuenttiConfig)

// VER CLIENTES SINCRONIZADOS
console.log(window.cuenttiClientes)

// VER COLA DE SINCRONIZACIÓN
console.log(JSON.parse(localStorage.getItem('cuentti_cola_sync')))
```

---

## 🎬 Video: Cómo Funciona

### Manual paso a paso:

1. **Abre app** → URL en navegador
2. **Presiona F12** → Consola abierta
3. **Escribe**: `runAllTests()`
4. **Espera** → 3-5 segundos
5. **Ve resultado** → ✅ o ❌
6. **Si falla** → Ejecuta test individual

### Ejemplo real:
```
> runAllTests()
🚀 INICIANDO TODAS LAS PRUEBAS CUENTTI

✅ TEST 1: CONFIGURACIÓN ✅
✅ TEST 2: FUNCIONES EXPORTADAS
✅ TEST 3: VARIABLES GLOBALES
...
✅ TOTAL: 12/12 pruebas pasaron
```

---

## 🆘 Problemas Comunes

| Problema | Solución |
|----------|----------|
| Error: `debugHelp is not defined` | Recarga la página (F5) e intenta de nuevo |
| `Cannot access uninitialized variable` | Ejecuta `testConfig()` para ver qué falta |
| Cliente no encontrado | Verifica cédula en CUENTTI |
| Conexión rechazada (401) | Token inválido en `cuentti.config.json` |

---

## 🎯 Meta

Después de 30 segundos, sabrás:
- ✅ Si CUENTTI está conectado
- ✅ Si búsqueda de clientes funciona
- ✅ Si hay errores específicos a corregir

---

**¡Listo! Ahora prueba el Debug Tool. 🚀**

