# 🚀 **Sistema de Gestión Taller Automotriz**

## **🎉 ESTADO: COMPLETAMENTE FUNCIONAL**

**✅ Compatible con Safari en macOS**  
**✅ Compatible con Chrome, Firefox, Edge**  
**✅ Listo para GitHub y Vercel**  
**✅ Versión estática (no requiere servidor)**

## **📱 Versiones Disponibles**

### **Versiones Principales:**
- **`index.html`** - Aplicación principal (optimizada para Safari)
- **`SAFARI.html`** - Versión específica para Safari en macOS
- **`index-SAFARI.html`** - App completa optimizada para Safari

### **Archivos de Diagnóstico:**
- **`TEST-INDEX.html`** - Test de carga de archivos
- **`simple.html`** - Versión simplificada
- **`EMERGENCIA.html`** - Test de emergencia

## **🧪 Credenciales de Prueba**
```
👤 admin / admin (Administrador)
👨‍🔧 mecanico / mecanico (Mecánico)
🔧 pedro / pedro (Pedro Barraza - 20% liquidación)
🔧 victor / victor (Víctor Padilla - 20% liquidación)
```

```
taller-automotriz-app/
├── index.html              # Página principal
├── assets/
│   ├── css/
│   │   └── styles.css      # Estilos CSS
│   └── js/
│       └── app.js          # JavaScript completo
├── README.md               # Esta documentación
└── vercel.json             # Configuración para Vercel
```

## **🔧 Cómo Ejecutar Localmente**

### **Opción 1: Abrir Directamente**
```bash
# Navegar a la carpeta del proyecto
cd taller-automotriz-app

# Abrir en el navegador (funciona con file://)
open index.html
# o
start index.html    # Windows
# o simplemente arrastrar index.html al navegador
```

### **Opción 2: Servidor Local Simple**
```bash
# Usar Python (si está instalado)
python -m http.server 8000

# O usar Node.js (si está instalado)
npx serve .

# Luego abrir: http://localhost:8000
```

## **🌐 Subir a GitHub**

### **1. Crear Repositorio en GitHub**
1. Ve a [github.com](https://github.com) y haz login
2. Click en "New repository"
3. Nombre: `taller-automotriz`
4. Descripción: `Sistema de gestión para taller automotriz`
5. **Mark**: Public o Private (según prefieras)
6. Click "Create repository"

### **2. Subir Código Local**
```bash
# En la carpeta taller-automotriz-app
git init
git add .
git commit -m "Initial commit: Sistema Taller Automotriz"

# Conectar con tu repositorio (reemplaza TU_USUARIO)
git remote add origin https://github.com/TU_USUARIO/taller-automotriz.git

# Subir código
git push -u origin main
```

### **3. Alternativa: Desde GitHub Desktop**
1. Descarga [GitHub Desktop](https://desktop.github.com/)
2. "Add an Existing Repository from your Hard Drive"
3. Selecciona la carpeta `taller-automotriz-app`
4. "Publish repository"

## **🚀 Desplegar en Vercel**

### **Opción 1: Desde GitHub (Recomendado)**

1. **Ir a [vercel.com](https://vercel.com)**
   - Sign up con tu cuenta de GitHub

2. **Importar Proyecto**
   - Click "New Project"
   - Conecta tu cuenta de GitHub
   - Busca el repositorio `taller-automotriz`
   - Click "Import"

3. **Configurar Despliegue**
   - Framework: "Other" (es HTML estático)
   - Root Directory: `./` (por defecto)
   - Build Command: (dejar vacío)
   - Output Directory: (dejar vacío)
   - Click "Deploy"

4. **¡Listo!**
   - Vercel te dará una URL como: `https://taller-automotriz.vercel.app`
   - Cada push a GitHub actualizará automáticamente la web

### **Opción 2: Subir Directamente a Vercel**

1. **Comprimir la carpeta**
   ```bash
   # En la carpeta taller-automotriz-app
   zip -r taller-automotriz.zip .
   ```

2. **En Vercel.com**
   - Click "New Project"
   - "Browse All Templates" → "Other" → "Deploy"
   - Arrastra el archivo `.zip`

## **🔐 Credenciales de Prueba**

```
ADMIN:
- Usuario: admin
- Contraseña: admin
- Rol: Administrador (acceso completo)

MECÁNICO:
- Usuario: mecanico  
- Contraseña: mecanico
- Rol: Mecánico (acceso limitado)
```

## **💾 Funcionalidades Disponibles**

### **📊 Dashboard**
- Resumen de trabajos del mes
- Estadísticas en tiempo real
- Trabajos recientes

### **🔨 Gestión de Trabajos**
- Crear, editar y eliminar trabajos
- Asignación a mecánicos
- Seguimiento de estados
- Cálculo de costos

### **👥 Gestión de Mecánicos**
- Registro de técnicos
- Especialidades y tarifas
- Historial de trabajos

### **💰 Control Financiero**
- Registro de pagos, adelantos, préstamos
- Control de descuentos
- Filtros por mecánico

### **💼 Sistema de Liquidación**
- **20% para Pedro Barraza**
- **20% para Víctor Padilla**
- **Ismael Cervantes (dueño) NO participa**
- Cálculo automático de 40% total de mano de obra

### **📋 Flujo Completo de Recepción**
1. **Recepción**: Registro de vehículo y cliente
2. **Cotización**: Presupuesto detallado
3. **Calendario**: Asignación a técnico
4. **Historial**: Seguimiento por vehículo
5. **Notificaciones**: Recordatorios automáticos

### **📅 Calendario de 8 Técnicos**
- Vista semanal independiente
- Asignación de citas
- Diferentes tipos de trabajo

### **🚗 Historial por Vehículo**
- Búsqueda por placa
- Historial completo de servicios
- Próximos mantenimientos

### **🔔 Sistema de Notificaciones**
- Mantenimientos pendientes
- Alertas de stock bajo
- Seguimientos automáticos

## **🔧 Personalización**

### **Cambiar Colores**
Edita `assets/css/styles.css`:
```css
:root {
    --primary-500: #0057B7;    /* Color principal */
    --success: #198754;         /* Color éxito */
    --warning: #FFC107;         /* Color advertencia */
    --error: #DC3545;           /* Color error */
}
```

### **Modificar Usuarios**
Edita `assets/js/app.js` línea ~1511:
```javascript
const users = {
    'admin': { password: 'admin', role: 'admin', name: 'Administrador' },
    'mecanico': { password: 'mecanico', role: 'mechanic', name: 'Juan Pérez' },
    // Agregar más usuarios aquí
};
```

### **Configurar Liquidación**
Edita `assets/js/app.js` línea ~2828:
```javascript
const activeTechnicians = ['Pedro Barraza', 'Víctor Padilla'];
// Cambiar aquí los técnicos que participan en liquidación
```

## **🌟 Ventajas de Vercel**

- ✅ **Gratis** para proyectos personales
- ✅ **HTTPS automático** (seguro)
- ✅ **Dominio personalizado** disponible
- ✅ **Actualizaciones automáticas** desde GitHub
- ✅ **Rendimiento optimizado**
- ✅ **Sin necesidad de servidor**

## **📞 Soporte**

Si tienes problemas:
1. Verifica que todos los archivos estén en las carpetas correctas
2. Asegúrate de que la estructura de archivos coincida
3. Revisa la consola del navegador (F12) para errores
4. El proyecto usa `localStorage`, no necesita base de datos

## **🔮 Próximas Mejoras**

- 🔄 **Sincronización en la nube**
- 📧 **Integración con Mailchimp**
- 📱 **App móvil para mecánicos**
- 📄 **Exportación a PDF**
- 🔐 **Autenticación más robusta**
- 💾 **Base de datos real**

---

**¡Tu sistema de taller automotriz está listo para usar! 🎉**