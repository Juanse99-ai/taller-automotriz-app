# 🔧 Guía de Diagnóstico - Taller Automotriz

## 📋 Orden de Pruebas (¡SÍGUELO EXACTAMENTE!)

### ✅ **PASO 1: Verificación Básica**
1. **Abre el archivo `simple.html`** (¡Este debe funcionar!)
   - Doble click en `simple.html`
   - Deberías ver una pantalla de login
   - Ingresa: `admin` / `admin`
   - Debería mostrar "Bienvenido" y redireccionar

### ✅ **PASO 2: Diagnóstico Completo**
1. **Abre el archivo `diagnostico.html`**
   - Verifica que aparezcan todas las pruebas en ✅ verde
   - Si alguna aparece en ❌ rojo, ese es tu problema

### ✅ **PASO 3: Archivos Individuales**
1. **Abre `assets/css/styles.css`** en el navegador
   - Deberías ver el código CSS
   - Si no, hay problema con la ruta de archivos

2. **Abre `assets/js/app.js`** en el navegador
   - Deberías ver el código JavaScript
   - Si no, hay problema con la ruta de archivos

### ✅ **PASO 4: Aplicación Principal**
1. **Abre `index.html`**
   - Debería cargar la aplicación completa
   - Si no funciona, es un problema de JavaScript

## 🚨 **Problemas Comunes y Soluciones**

### **PROBLEMA:** "No se abre nada"
**SOLUCIÓN:**
1. Verifica que estés en la carpeta correcta (`taller-automotriz-app/`)
2. Intenta abrir `simple.html` primero
3. Verifica que tu navegador soporte JavaScript

### **PROBLEMA:** "Aparece una página en blanco"
**SOLUCIÓN:**
1. Presiona **F12** (herramientas de desarrollador)
2. Ve a la pestaña **Console**
3. ¿Aparecen errores en rojo? Compártelos conmigo

### **PROBLEMA:** "Se abre pero no funciona el login"
**SOLUCIÓN:**
1. Prueba con las credenciales exactas:
   - Usuario: `admin`
   - Contraseña: `admin`
2. Verifica que no haya espacios extra

### **PROBLEMA:** "Error de archivos no encontrados"
**SOLUCIÓN:**
1. Verifica que todos los archivos estén en las rutas correctas:
   ```
   taller-automotriz-app/
   ├── index.html
   ├── simple.html
   ├── diagnostico.html
   ├── demo.html
   └── assets/
       ├── css/
       │   └── styles.css
       └── js/
           └── app.js
   ```

## 🆘 **Si Nada Funciona**

Crea un archivo nuevo en tu escritorio llamado `test-emergencia.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Test Emergencia</title></head>
<body>
    <h1>✅ Si ves esto, tu navegador funciona</h1>
    <script>
        document.body.innerHTML += '<p>🚀 JavaScript también funciona</p>';
        localStorage.setItem('test', 'ok');
        document.body.innerHTML += '<p>📁 LocalStorage funciona</p>';
    </script>
</body>
</html>
```

## 📞 **Información para Reportar**

Si reportas un problema, incluye:

1. **¿Qué archivo abriste primero?**
2. **¿Qué pasó exactamente?**
3. **¿Tienes algún error en la consola? (F12 → Console)**
4. **¿Qué navegador usas?** (Chrome, Firefox, Edge, Safari)
5. **¿Qué sistema operativo?** (Windows, Mac, Linux)

## 🎯 **Próximos Pasos**

Una vez que identifiques qué funciona:
- ✅ Si `simple.html` funciona → El problema es con la aplicación completa
- ✅ Si `diagnostico.html` muestra errores → Identificamos el error específico
- ✅ Si solo faltan archivos → Reorganizamos las carpetas
- ✅ Si todo funciona → ¡Listo para GitHub y Vercel!

---

**💡 TIP:** Siempre prueba con `simple.html` primero. Si eso no funciona, es un problema de tu navegador o sistema, no del código.