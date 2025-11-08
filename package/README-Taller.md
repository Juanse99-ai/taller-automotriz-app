# 🔧 Aplicación Web - Taller Automotriz

## Funcionalidades Principales

### ✅ **Gestión de Trabajos**
- **Información completa por trabajo:**
  - Placa del vehículo
  - Kilometraje de ingreso
  - Descripción del trabajo realizado
  - Mecánicos asignados
  - Repuestos e insumos
  - Costos (mano de obra, repuestos)
  - Valor de venta al cliente
  - Estado del trabajo

- **Estados de trabajo:**
  - 🔴 Pendiente
  - 🟡 En Progreso
  - 🟢 Completado
  - 🔵 Entregado

### ✅ **Sistema de Roles**
- **Administrador:** Acceso completo a todas las funciones
- **Mecánico:** Solo ve sus trabajos asignados y puede actualizar estados

### ✅ **Control Financiero**
- Registro de pagos a mecánicos
- Adelantos y préstamos
- Descuentos aplicados
- Seguimiento de movimientos financieros

### ✅ **Gestión de Mecánicos**
- Datos personales y de contacto
- Especialidades
- Tarifas por hora
- Estadísticas de trabajos

### ✅ **Dashboard y Reportes**
- Resumen general del taller
- Estadísticas de ingresos
- Trabajos recientes
- Análisis de rendimiento por mecánico

## 🚀 Cómo Usar la Aplicación

### **Acceso**
1. Abre el archivo `taller-automotriz.html` en tu navegador
2. Credenciales de prueba:
   - **Admin:** usuario `admin` / contraseña `admin`
   - **Mecánico:** usuario `mecanico` / contraseña `mecanico`

### **Crear un Trabajo**
1. Ve a la sección "Trabos"
2. Haz clic en "Nuevo Trabajo"
3. Completa todos los campos requeridos (marcados con *)
4. Guarda el trabajo

### **Gestionar Estados**
- En la lista de trabajos, haz clic en el botón 🔄 para cambiar el estado
- Los estados avanzan en orden: Pendiente → En Progreso → Completado → Entregado

### **Control de Pagos**
1. Ve a la sección "Finanzas"
2. Haz clic en "Nuevo Pago"
3. Selecciona el tipo de movimiento:
   - **Pago:** Salario regular
   - **Adelanto:** Dinero adelantado
   - **Préstamo:** Dinero prestado al mecánico
   - **Descuento:** Descuento aplicado

### **Agregar Mecánicos**
1. Ve a la sección "Mecánicos"
2. Haz clic en "Nuevo Mecánico"
3. Completa la información del mecánico

## 📊 Características Técnicas

### **Diseño Responsivo**
- Optimizado para tablets y móviles
- Se adapta automáticamente a diferentes tamaños de pantalla
- Ideal para usar en el taller

### **Almacenamiento Local**
- Los datos se guardan en el navegador
- No requiere servidor o base de datos
- Datos persisten entre sesiones

### **Interfaz Intuitiva**
- Diseño moderno y profesional
- Navegación fácil
- Colores semánticos para estados
- Iconos claros para acciones

## 💡 Consejos de Uso

### **Para el Administrador**
- Revisa el dashboard regularmente para ver el estado general
- Usa los filtros para encontrar trabajos específicos
- Controla los pagos financieramente para evitar desbalances
- Consulta los reportes para tomar decisiones

### **Para los Mecánicos**
- Actualiza el estado de los trabajos regularmente
- Registra todos los repuestos utilizados
- Anota observaciones importantes en las descripciones

## 🔧 Personalización

La aplicación está diseñada para ser fácil de modificar:

- **Colores:** Cambia las variables CSS en la sección `:root`
- **Estados:** Modifica los estados en las funciones de JavaScript
- **Campos:** Agrega nuevos campos en los formularios correspondientes
- **Roles:** Expande el sistema de roles según tus necesidades

## 📱 Optimizada para Taller

- **Modo Tablet:** Perfecta para usar en tablets en el área de trabajo
- **Carga Rápida:** Sin dependencias externas pesadas
- **Datos Locales:** Funciona sin conexión a internet
- **Interfaz Clara:** Fácil de leer en diferentes condiciones de luz

## 🚀 Instalación y Uso

1. **Descarga** el archivo `taller-automotriz.html`
2. **Abre** en cualquier navegador moderno (Chrome, Firefox, Safari, Edge)
3. **Comienza** a usar inmediatamente con las credenciales de prueba
4. **Agrega** tus mecánicos y trabajos reales

## 💾 Respaldo de Datos

Los datos se guardan automáticamente en el navegador. Para hacer respaldo:
1. Abre las herramientas de desarrollador (F12)
2. Ve a la pestaña "Aplicación" → "Almacenamiento" → "LocalStorage"
3. Copia los valores de `taller-jobs`, `taller-mechanics`, y `taller-payments`

---

**¡Tu aplicación está lista para usar en el taller!** 🎉

La aplicación incluye datos de ejemplo para que puedas explorar todas las funcionalidades antes de agregar tus datos reales.