# 🔧 Sistema de Gestión Multidiagnósticos AS

Sistema completo de gestión para talleres automotrices con integración a Supabase, diseñado para administrar trabajos, mecánicos, inventario, finanzas y liquidaciones de manera eficiente.

## 📋 Tabla de Contenidos

- [Características Principales](#-características-principales)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Uso del Sistema](#-uso-del-sistema)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Despliegue](#-despliegue)
- [Configuración de Supabase](#-configuración-de-supabase)
- [Personalización](#-personalización)

## ✨ Características Principales

### 📊 Dashboard
- Resumen general del taller con métricas en tiempo real
- Estadísticas de trabajos (completados, en progreso, pendientes)
- Ingresos mensuales
- Trabajos recientes

### 🔧 Gestión de Trabajos (Sistema POS/OT)
- **Sistema POS completo** para crear órdenes de trabajo
- Búsqueda de clientes por cédula (integración con Supabase)
- Registro completo de vehículos (placa, marca, modelo, año, kilometraje)
- Asignación de técnicos
- Gestión de repuestos e inventario
- Cálculo automático de:
  - Subtotal de repuestos
  - Mano de obra (horas × tarifa)
  - IVA (19%)
  - Total final
- Estados de trabajo: Pendiente, En Progreso, Completado

### 👨‍🔧 Gestión de Mecánicos
- Registro de técnicos con especialidades
- Tarifas por hora configurables
- Control de trabajos activos por mecánico
- Estadísticas de rendimiento

### 📋 Recepción de Vehículos
- Registro de órdenes de servicio
- Búsqueda de clientes existentes
- Asignación de prioridad y técnico
- Tiempo estimado de trabajo

### 💰 Cotizaciones
- Creación de cotizaciones detalladas
- Selección de productos del inventario
- Cálculo automático de totales
- Estados: Pendiente, Aprobada
- Generación de facturas desde cotizaciones aprobadas

### 📅 Calendario
- Vista de citas por técnico
- Programación de trabajos
- Control de ocupación
- Gestión de cancelaciones

### 📚 Historial de Vehículos
- Búsqueda por placa
- Historial completo de servicios realizados
- Próximos mantenimientos recomendados
- Seguimiento de kilometraje

### 🔔 Notificaciones
- Mantenimientos pendientes
- Alertas de stock bajo
- Seguimientos automáticos

### 💳 Control Financiero
- Ingresos y gastos mensuales
- Ganancia neta
- Flujo de caja
- Reportes financieros

### 📝 Sistema de Liquidación Avanzado
- **Liquidación de manos de obra con porcentajes configurables:**
  - Pedro Barraza: 20%
  - Víctor Padilla: 20%
  - Ismael Cervantes: 0% (dueño)
- **Gestión de movimientos financieros:**
  - 💰 Registrar adelantos
  - 🍽️ Registrar almuerzos (descuentos)
  - 💳 Control de pagos
  - Préstamos y descuentos
- Cálculo automático del neto a pagar
- Vista previa de liquidaciones
- Historial de liquidaciones procesadas

### 📦 Gestión de Inventario
- Búsqueda de productos por código, nombre o categoría
- Control de stock
- Alertas de stock bajo
- Valor total del inventario
- Integración con Supabase para datos reales

### 💼 Integración CUENTTI
- Sincronización con sistema de facturación CUENTTI
- Envío de facturas
- Control de facturas pendientes
- Seguimiento de estado de sincronización

## 🛠️ Tecnologías Utilizadas

- **Frontend:**
  - HTML5
  - CSS3 (Variables CSS, Flexbox, Grid)
  - JavaScript (ES6+)
  - Font: Inter (Google Fonts)

- **Backend/Database:**
  - Supabase (PostgreSQL)
  - LocalStorage (respaldo local)

- **Deployment:**
  - Vercel (recomendado)
  - GitHub Pages
  - Cualquier servidor estático

## 🚀 Instalación y Configuración

### Requisitos Previos
- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Cuenta de Supabase (opcional, para datos en la nube)
- Git (para control de versiones)

### Instalación Local

1. **Clonar o descargar el repositorio:**
```bash
git clone https://github.com/tu-usuario/taller-automotriz-app.git
cd taller-automotriz-app
```

2. **Abrir el archivo principal:**
```bash
# Opción 1: Abrir directamente
open index.html

# Opción 2: Servidor local (recomendado)
python -m http.server 8000
# Luego abrir: http://localhost:8000/index.html
```

3. **Configurar Supabase (Opcional):**
   - Edita las constantes en el archivo HTML:
   ```javascript
   const SUPABASE_URL = 'tu-url-de-supabase';
   const SUPABASE_ANON_KEY = 'tu-clave-anon';
   ```

## 📖 Uso del Sistema

### Crear un Nuevo Trabajo

1. Navega a la sección **"Trabajos"**
2. Haz clic en **"Nuevo Trabajo"**
3. Completa el formulario:
   - **Buscar Cliente:** Ingresa la cédula para buscar clientes existentes
   - **Información del Vehículo:** Placa, marca, modelo, año, kilometraje
   - **Técnico Asignado:** Selecciona el mecánico responsable
   - **Repuestos y Servicios:** 
     - Busca productos del inventario
     - Agrega servicios manuales si es necesario
     - Ajusta cantidades
   - **Mano de Obra:** Ingresa horas y precio por hora
4. Revisa el resumen con totales (IVA incluido)
5. Haz clic en **"Crear Trabajo"**

### Gestionar Liquidaciones

1. Ve a la sección **"Liquidación"**
2. **Registrar Adelantos:**
   - Haz clic en "💰 Registrar Adelanto"
   - Selecciona técnico, monto y concepto
3. **Registrar Almuerzos:**
   - Haz clic en "🍽️ Registrar Almuerzo"
   - Se aplica como descuento automático
4. **Generar Liquidación:**
   - Haz clic en "Generar Liquidación"
   - Selecciona técnico y período
   - Revisa la vista previa
   - Confirma para procesar

### Buscar Historial de Vehículo

1. Ve a la sección **"Historial"**
2. Ingresa la placa del vehículo
3. Haz clic en **"Buscar"**
4. Se mostrará:
   - Historial completo de servicios
   - Próximo mantenimiento recomendado
   - Opción para agendar mantenimiento

### Gestionar Inventario

1. Ve a la sección **"Inventario"**
2. **Buscar Producto:** Usa el buscador por código, nombre o categoría
3. **Ver Stock:** Revisa el stock disponible y alertas de stock bajo
4. **Editar Producto:** Haz clic en "Editar" para modificar información

## 📁 Estructura del Proyecto

```
taller-automotriz-app/
├── index.html                                         # Aplicación principal
├── assets/
│   ├── css/
│   │   ├── app.css                                   # Estilos base
│   │   └── theme-glass.css                           # Estilos alternativos
│   ├── js/
│   │   └── main.js                                   # Lógica principal
│   └── images/
│       └── logo-multidiagnosticos.png                # Logo del taller
├── .vscode/                                          # Configuración opcional de VS Code
├── .gitignore                                        # Reglas para archivos temporales
├── README.md                                         # Esta documentación
└── vercel.json                                       # Configuración Vercel
```

## 🌐 Despliegue

### Desplegar en Vercel (Recomendado)

1. **Sube el proyecto a GitHub:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-usuario/taller-automotriz-app.git
git push -u origin main
```

2. **En Vercel:**
   - Ve a [vercel.com](https://vercel.com)
   - Conecta tu cuenta de GitHub
   - Importa el repositorio
   - Framework: "Other"
   - Deploy automático

3. **Resultado:**
   - URL: `https://taller-automotriz-app.vercel.app`
   - Actualización automática en cada push

### Desplegar en GitHub Pages

1. Ve a Settings → Pages en tu repositorio
2. Selecciona la rama `main`
3. Carpeta: `/ (root)`
4. Guarda y espera el despliegue
5. URL: `https://tu-usuario.github.io/taller-automotriz-app/`

## 🔐 Configuración de Supabase

### Crear Tablas en Supabase

1. **Tabla `clientes`:**
```sql
CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255),
  cedula VARCHAR(50) UNIQUE,
  telefono VARCHAR(20),
  email VARCHAR(255),
  direccion TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

2. **Tabla `inventario`:**
```sql
CREATE TABLE inventario (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE,
  nombre VARCHAR(255),
  categoria VARCHAR(100),
  precio DECIMAL(10,2),
  stock INTEGER,
  stock_minimo INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
```

3. **Configurar Row Level Security (RLS):**
   - En Supabase Dashboard → Authentication → Policies
   - Habilita políticas para lectura pública (si es necesario)

### Variables de Configuración

Edita en el archivo HTML:
```javascript
const SUPABASE_URL = 'https://tu-proyecto.supabase.co';
const SUPABASE_ANON_KEY = 'tu-clave-anon-key';
```

## 🎨 Personalización

### Cambiar Colores Corporativos

Edita las variables CSS en el `<style>` del HTML:
```css
:root {
    --primary-500: #1E3A8A;    /* Color principal */
    --primary-700: #1E40AF;    /* Color hover */
    --success: #198754;         /* Éxito */
    --warning: #FFC107;         /* Advertencia */
    --error: #DC3545;           /* Error */
}
```

### Modificar Porcentajes de Liquidación

Edita en el código JavaScript:
```javascript
this.configuracion.porcentajes = {
    'pedro': 20,      // Pedro Barraza
    'victor': 20,     // Víctor Padilla
    'ismael': 0       // Ismael Cervantes (dueño)
};
```

### Agregar Nuevos Técnicos

Edita el array `mecanicos`:
```javascript
const mecanicos = [
    { id: 1, name: 'Pedro Barraza', specialty: 'Dueño/Frenos', phone: '3002345678', hourlyRate: 20000 },
    // Agrega más técnicos aquí
];
```

## 📱 Características Responsivas

- **Desktop:** Layout completo con sidebar expandido
- **Tablet:** Sidebar colapsable, optimizado para uso en taller
- **Mobile:** Menú lateral deslizable, interfaz adaptada

## 🔒 Seguridad

- Las credenciales de Supabase están en el código (cliente)
- Para producción, considera usar variables de entorno
- RLS (Row Level Security) configurado en Supabase
- Validación de datos en formularios

## 🐛 Solución de Problemas

### Los botones no funcionan
- Verifica que el JavaScript esté cargado (consola del navegador)
- Asegúrate de que las funciones estén en el scope global
- Revisa errores en la consola (F12)

### El logo no se muestra
- Verifica que la ruta `./assets/images/logo-multidiagnosticos.png` sea correcta
- El sistema mostrará un fallback con las iniciales "MA" si el logo no carga

### Error de conexión a Supabase
- Verifica que las credenciales sean correctas
- Revisa que las tablas existan en Supabase
- Comprueba las políticas RLS

## 📝 Notas Importantes

- El sistema funciona completamente offline (con datos locales)
- Supabase es opcional pero recomendado para sincronización
- Los datos se respaldan en LocalStorage del navegador
- Compatible con todos los navegadores modernos

## 🤝 Contribuciones

Este es un proyecto privado para Multidiagnósticos AS. Para sugerencias o mejoras, contacta al administrador del sistema.

## 📄 Licencia

Proyecto privado - Multidiagnósticos AS © 2025

## 👥 Créditos

Desarrollado para **Multidiagnósticos AS**  
Sistema de gestión integral para talleres automotrices

---

**Versión:** 1.0.0  
**Última actualización:** Enero 2025  
**Estado:** ✅ Producción
