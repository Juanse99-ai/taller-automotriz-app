# 🤝 **Plan de Integración - Bases de Datos y Mailchimp**

## **📊 Integración con tu Base de Datos de Clientes**

### **Opciones de Integración:**

#### **1. API REST (Recomendado)**
Si ya tienes una base de datos de clientes, podemos conectarla mediante API:

```javascript
// Función para obtener clientes de tu sistema
async function fetchClients() {
    try {
        const response = await fetch('TU_API_URL/api/clients');
        const clients = await response.json();
        return clients;
    } catch (error) {
        console.error('Error fetching clients:', error);
        return [];
    }
}

// Usar en la recepción
function populateClientSelector() {
    fetchClients().then(clients => {
        const selector = document.getElementById('receptionClientName');
        selector.innerHTML = '<option value="">Seleccionar cliente</option>';
        clients.forEach(client => {
            selector.innerHTML += `<option value="${client.name}">${client.name} - ${client.phone}</option>`;
        });
    });
}
```

#### **2. Import/Export de CSV**
- **Exportar**: Generar CSV desde tu sistema → Importar a la app
- **Sincronización**: Subir archivo actualizado periódicamente

#### **3. Sincronización Manual**
- Formulario para agregar clientes manualmente
- Backup/export a tu sistema existente

### **Datos que necesitas sincronizar:**
- ✅ Nombre completo
- ✅ Teléfono
- ✅ Email
- ✅ Dirección
- ✅ Vehículos registrados
- ✅ Historial de servicios

---

## **📦 Integración con tu Inventario de Repuestos**

### **API de Inventario**
```javascript
// Consultar stock de repuestos
async function checkPartAvailability(partName) {
    try {
        const response = await fetch(`TU_API_URL/api/parts/search?name=${partName}`);
        const parts = await response.json();
        return parts;
    } catch (error) {
        console.error('Error checking parts:', error);
        return [];
    }
}

// Usar en cotizaciones
function autoCompleteParts(query) {
    checkPartAvailability(query).then(parts => {
        // Mostrar sugerencias
        showPartSuggestions(parts);
    });
}
```

### **Funcionalidades de Inventario:**
- 🔍 **Búsqueda automática** de repuestos
- 📊 **Stock en tiempo real**
- 💰 **Precios actualizados**
- ⚠️ **Alertas de stock bajo**
- 📋 **Lista de repuestos recomendados por vehículo**

---

## **📧 Integración con Mailchimp**

### **Funcionalidades Específicas de Mailchimp:**

#### **1. Recordatorios de Mantenimiento Automáticos**
```javascript
// Configurar recordatorios automáticos
function setupMaintenanceReminders() {
    // Obtener vehículos con mantenimiento próximo
    const vehicles = getVehiclesWithMaintenanceDue();
    
    vehicles.forEach(vehicle => {
        sendMaintenanceReminder({
            clientEmail: vehicle.client.email,
            clientName: vehicle.client.name,
            vehiclePlate: vehicle.plate,
            maintenanceType: vehicle.nextMaintenance.type,
            dueDate: vehicle.nextMaintenance.dueDate
        });
    });
}
```

#### **2. Campañas de Promociones**
```javascript
// Campaña de ofertas estacionales
function createPromotionalCampaign() {
    const campaign = {
        subject: '🎉 Ofertas de Verano - Mantenimiento Preventivo',
        template: 'promotional-template',
        segment: 'vehicles-over-1-year',
        content: {
            title: 'Mantenimiento Preventivo 20% OFF',
            description: 'Cuida tu vehículo con nuestros servicios especializados',
            cta: 'Agenda tu cita hoy'
        }
    };
    sendMailchimpCampaign(campaign);
}
```

#### **3. Seguimiento Post-Servicio**
```javascript
// Seguimiento automático después del servicio
function setupPostServiceFollowUp(serviceId) {
    const service = getServiceById(serviceId);
    
    // Programar seguimiento en 3 días
    setTimeout(() => {
        sendFollowUpEmail({
            to: service.client.email,
            clientName: service.client.name,
            vehiclePlate: service.vehicle.plate,
            serviceType: service.type,
            satisfaction: '¿Cómo está funcionando tu vehículo?'
        });
    }, 3 * 24 * 60 * 60 * 1000); // 3 días
}
```

### **Segementación de Clientes:**
- 👥 **Clientes VIP** (servicios frecuentes)
- 🚗 **Por tipo de vehículo** (sedanes, SUVs, trucks)
- 📅 **Por frecuencia de servicio** (mensual, semestral, anual)
- 📍 **Por zona geográfica**
- 🎯 **Campañas de生日/cumpleaños**

### **Automatizaciones de Mailchimp:**
- ✅ **Bienvenida** a nuevos clientes
- 📞 **Llamadas de seguimiento** automáticas
- 🎂 **Felicitaciones de cumpleaños** con ofertas
- ⏰ **Recordatorios de mantenimiento** programados
- 📊 **Encuestas de satisfacción** post-servicio

---

## **🔧 Implementación Técnica**

### **Paso 1: Configurar APIs**
```javascript
// config/api.js
const API_CONFIG = {
    clients: {
        baseUrl: 'https://tu-sistema-clientes.com/api',
        endpoints: {
            getAll: '/clients',
            search: '/clients/search',
            getById: '/clients/{id}'
        }
    },
    inventory: {
        baseUrl: 'https://tu-inventario.com/api',
        endpoints: {
            searchParts: '/parts/search',
            getStock: '/stock/{partId}',
            updateStock: '/stock/{partId}'
        }
    },
    mailchimp: {
        apiKey: 'TU_MAILCHIMP_API_KEY',
        listId: 'TU_LIST_ID',
        baseUrl: 'https://api.mailchimp.com/3.0'
    }
};
```

### **Paso 2: Sincronización de Datos**
```javascript
// scripts/sync.js
class DataSync {
    async syncClients() {
        // 1. Obtener datos de tu sistema
        const remoteClients = await this.fetchRemoteClients();
        
        // 2. Comparar con datos locales
        const localClients = JSON.parse(localStorage.getItem('taller-clients') || '[]');
        
        // 3. Sincronizar (agregar/actualizar)
        const updatedClients = this.mergeClients(remoteClients, localClients);
        localStorage.setItem('taller-clients', JSON.stringify(updatedClients));
        
        return updatedClients;
    }
    
    async syncInventory() {
        const remoteInventory = await this.fetchRemoteInventory();
        localStorage.setItem('taller-inventory', JSON.stringify(remoteInventory));
    }
}
```

### **Paso 3: Integración de Mailchimp**
```javascript
// scripts/mailchimp.js
class MailchimpIntegration {
    async sendMaintenanceReminder(data) {
        const campaign = {
            type: 'regular',
            recipients: {
                list_id: API_CONFIG.mailchimp.listId,
                segment_opts: {
                    match: 'any',
                    conditions: [{
                        condition_type: 'EmailAddress',
                        field: 'email',
                        op: 'is',
                        value: data.clientEmail
                    }]
                }
            },
            settings: {
                subject_line: `Recordatorio: Mantenimiento para ${data.vehiclePlate}`,
                from_name: 'Taller Automotriz',
                reply_to: 'servicio@taller.com'
            },
            content: {
                html: this.generateMaintenanceTemplate(data)
            }
        };
        
        return await this.createCampaign(campaign);
    }
    
    generateMaintenanceTemplate(data) {
        return `
            <h2>Hola ${data.clientName}</h2>
            <p>Es momento del mantenimiento para tu vehículo <strong>${data.vehiclePlate}</strong></p>
            <p>Tipo: ${data.maintenanceType}</p>
            <p>Fecha recomendada: ${data.dueDate}</p>
            <a href="https://tu-taller.com/agendar">Agendar Cita</a>
        `;
    }
}
```

---

## **🚀 Plan de Implementación por Fases**

### **Fase 1: Base de Datos de Clientes (1-2 días)**
1. Conectar con tu API de clientes existente
2. Sincronización manual inicial
3. Búsqueda y autocompletado

### **Fase 2: Inventario de Repuestos (2-3 días)**
1. Conectar con tu sistema de inventario
2. Búsqueda de repuestos en tiempo real
3. Control de stock automático

### **Fase 3: Mailchimp Básico (2-3 días)**
1. Configuración de lista de contactos
2. Recordatorios automáticos de mantenimiento
3. Seguimiento post-servicio

### **Fase 4: Mailchimp Avanzado (3-4 días)**
1. Segmentación de clientes
2. Campañas de promociones
3. Automatizaciones completas

---

## **💡 Recomendaciones**

### **Para la Base de Datos de Clientes:**
- Empezar con **sincronización manual** (import CSV)
- Luego migrar a **API REST** para sincronización automática
- Crear **formularios de backup** para casos excepcionales

### **Para el Inventario:**
- **API REST** es lo más eficiente
- Implementar **caché local** para mejor rendimiento
- **Alertas automáticas** de stock bajo

### **Para Mailchimp:**
- Empezar con **funcionalidades básicas** (recordatorios)
- **Segmentar** la base de contactos gradualmente
- **A/B testing** para optimizar campañas

---

**¿Por cuál fase te gustaría empezar? 🎯**