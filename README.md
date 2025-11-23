# 🔧 Sistema de Gestión Multidiagnósticos AS

Sistema completo de gestión para talleres automotrices con integración a CUENTTI (clientes e inventario) y Supabase (órdenes de trabajo), diseñado para administrar trabajos, mecánicos, finanzas y liquidaciones de manera eficiente.

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
- Búsqueda de clientes por cédula (integración con CUENTTI)
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
- Integración con CUENTTI para datos reales de inventario

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
  - CUENTTI (Clientes e Inventario)
  - Supabase (PostgreSQL) - Solo para órdenes de trabajo
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

4. **Preparar tu configuración privada de CUENTTI (no se sube a GitHub):**
   - Duplica `cuentti.example.json` como `cuentti.config.json`.
   - Pega el token entregado por CUENTTI en el campo `token` y ajusta los demás datos de la empresa.
   - Este archivo ya está en `.gitignore` para que el token no se publique.

5. **Actualizar el token en la colección de Postman (para pruebas):**
   - Abre `integracion boot de ventas mejor.postman_collection.json` en Postman.
   - Crea un Environment en Postman con las variables `id_empresa` y `x_api_key` (usa el token proporcionado).
   - Asocia el Environment a la colección y verifica las peticiones `Maestros` y `Ventas`.

6. **Subir el proyecto a tu repositorio privado en GitHub:**
   - Si ya tienes un repositorio **privado**, usa ese mismo (no es necesario crear otro). Verifica si ya tienes configurado el remoto (deberías ver `origin`):
     ```bash
     git remote -v
     ```
   - Si el remoto **no** existe, agrégalo apuntando a tu repo privado (puede ser HTTPS o SSH):
     ```bash
     # Opción SSH (recomendada si ya configuraste llaves)
     git remote add origin git@github.com:TU_USUARIO/TU_REPO_PRIVADO.git

     # Opción HTTPS (se te pedirá token/pat al hacer push)
     git remote add origin https://github.com/TU_USUARIO/TU_REPO_PRIVADO.git
     ```
   - Sube la rama de trabajo `work` (si es la primera vez, usa `-u` para dejarla enlazada):
     ```bash
     git push -u origin work
     ```
   - Antes de hacer `git add`, confirma que `cuentti.config.json` siga sin trackearse con `git status`.

7. **Desplegar o probar en la nube (Vercel):**
   - En [Vercel](https://vercel.com/import), importa el repositorio privado y selecciona la rama `work`.
   - Deja el framework como **Static Site**; el build command puede ir vacío y el output directory en `.` (raíz) o `assets` según prefieras servir.
   - Una vez desplegado, comprueba en la URL de vista previa que la app carga y que las peticiones CUENTTI funcionan con tu token configurado en el entorno (si aplica).

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

> **⚠️ IMPORTANTE:** A partir de esta versión, Supabase **solo se usa para almacenar órdenes de trabajo**. Los clientes e inventario ahora vienen de CUENTTI.

### ¿Qué código debo correr en Supabase?

1. **Ejecuta `supabase_trabajos.sql` en el SQL Editor de tu proyecto:**
   - Carga el archivo completo y presiona “Run”.
   - El script habilita la extensión `pgcrypto` y crea:
     - Tabla principal `trabajos` (órdenes de trabajo).
     - Respaldos locales `clientes`, `inventario` y `vehiculos` para cuando CUENTTI no esté disponible.
   - Incluye índices, triggers de `updated_at` y comentarios en todas las tablas.

2. **Si necesitas seguridad:**
   - Habilita RLS en las tablas (están comentadas al final del script).
   - Ajusta o descomenta las políticas de ejemplo incluidas para lectura/inserción según tu caso de uso.

3. **¿Cuándo volver a ejecutar el script?**
   - Solo si actualizas `supabase_trabajos.sql` y quieres aplicar esos cambios en Supabase.
   - No hay migraciones adicionales; todo está centralizado en este archivo.

### ⚠️ Migración desde Versión Anterior

Si tenías clientes e inventario en Supabase:
- **Clientes e Inventario:** Ahora se cargan desde CUENTTI automáticamente
- **Trabajos:** Se guardan en Supabase en la tabla `trabajos`
- **Datos locales:** Se mantienen en LocalStorage como respaldo

### Variables de Configuración

Usa `supabase.config.json` para evitar credenciales en el código fuente:

```bash
cp supabase.config.example.json supabase.config.json
# Rellena url y anonKey con los valores de tu proyecto
```

El frontend leerá automáticamente este archivo (o variables inyectadas en la ruta) al cargar y recreará el cliente de Supabase con esa configuración.

## 💼 Configuración de CUENTTI

- **Plantilla incluida:** usa `cuentti.example.json` como referencia para los campos necesarios (`baseUrl`, `token`, `companyId`, `branchId`, `endpoints`).
- **Archivo real fuera de Git:** guarda tu archivo privado como `cuentti.config.json` y **no lo subas al repositorio** (está ignorado en `.gitignore`).
- **Carga segura:** si tu frontend es estático, monta un backend/proxy que lea `cuentti.config.json` en el servidor y haga las peticiones a CUENTTI usando el token, en lugar de exponerlo en el navegador.
- **Variables de entorno:** en despliegues como Vercel/Render, puedes almacenar el contenido del JSON en variables de entorno y generar `cuentti.config.json` al arrancar el backend o servirlo desde un endpoint protegido.

### Dónde pegar tu API Token de CUENTTI

1. Duplica el archivo de ejemplo y nómbralo `cuentti.config.json` (se mantiene fuera de Git):

   ```bash
   cp cuentti.example.json cuentti.config.json
   ```

2. Abre `cuentti.config.json` y reemplaza el campo `"token"` con tu token real de CUENTTI (por ejemplo, el que compartiste). El resto de campos (`baseUrl`, `companyId`, `branchId`) deben corresponder a tu cuenta/empresa.

   ```json
   {
     "baseUrl": "https://api.cuentti.com/v1",
     "token": "TU_TOKEN_REAL",
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

3. No compartas ese archivo ni el token en GitHub ni en clientes públicos. En producción, lo ideal es que el token viva en el servidor (o en variables de entorno) y las llamadas a CUENTTI pasen por tu backend para no exponerlo en el navegador.

- Si el repositorio permanece **privado** y controlas los accesos, puedes versionar `cuentti.config.json` con tu token para despliegues automatizados. Si en algún momento el repositorio se hace público, rota el token y vuelve a usar `.gitignore` para evitar exponerlo.

### Colección de integración CUENTTI (Postman)

- Archivo incluido: `integracion boot de ventas mejor.postman_collection.json`.
- Importa la colección en Postman (File → Import) para probar los endpoints con tus credenciales.
- Actualiza la variable `token` de la colección con el valor de `cuentti.config.json` o con el token que te entregó CUENTTI.

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
