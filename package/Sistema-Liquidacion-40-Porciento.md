# 💼 Sistema de Liquidación 20% + 20% - Taller Automotriz

## 🎯 Funcionalidades Implementadas

He integrado el **sistema de liquidación del 40% de mano de obra** (20% para Víctor + 20% para Ismael) directamente en tu aplicación principal con las especificaciones exactas que necesitas.

## 👥 Técnicos Configurados

✅ **Pedro Barraza** - Dueño/Técnico (Recibe 20% por cada trabajo)  
✅ **Víctor Padilla** - General (Recibe 20% por cada trabajo)  
✅ **Ismael Cervantes** - Motor (No participa en liquidación - empleado especial)

## 💰 Sistema de Liquidación 20% + 20%

### **Cálculo Automático:**
- **20% del costo de mano de obra** se liquida a Pedro Barraza (dueño/técnico)
- **20% del costo de mano de obra** se liquida a Víctor Padilla  
- **Ismael Cervantes** no participa en la liquidación del 20%
- **Solo para trabajos** completados o entregados
- **Sistema de cruce contable** con adelantos, préstamos y descuentos

### **Ejemplo de Cálculo:**
```
Trabajo: Reparación frenos
Costo Mano de Obra: $80,000

División:
- Pedro Barraza: $16,000 (20%)
- Víctor Padilla: $16,000 (20%)
- Ismael Cervantes: $0 (no participa en liquidación)
- TOTAL LIQUIDADO: $32,000 (40% total)
```

## 📊 Nueva Sección: "Liquidación"

### **Dashboard de Liquidación:**
- **Por Liquidar (40%):** Total pendiente de liquidar (20% Víctor + 20% Ismael)
- **Adelantos Pendientes:** Adelantos que restan
- **Préstamos Pendientes:** Préstamos que restan
- **Neto a Pagar:** Resultado final después de descuentos

### **Funcionalidades:**
- 📋 **Lista de trabajos** pendientes de liquidación
- 🔍 **Filtros** por técnico y estado
- 💼 **Generar liquidación** automática
- 👀 **Ver trabajos** pendientes
- ⚡ **Liquidar individualmente** o en lote
- 🔒 **Protección** para técnicos que no liquidan (dueño)

## 🔄 Sistema de Cruce Contable

### **Movimientos Financieros:**
1. **Adelantos:** Se restan del pago neto
2. **Préstamos:** Se restan del pago neto  
3. **Descuentos:** Se suman al pago neto

### **Ejemplo de Liquidación Completa:**

**Pedro Barraza (Dueño/Técnico):**
- Trabajos del período: $96,000 (20% de mano de obra)
- Menos: Adelanto: -$0 (no hay adelantos registrados para Pedro)
- **NETO A PAGAR: $96,000** ✅ (Saldo a favor del técnico)

**Víctor Padilla:**
- Trabajos del período: $80,000 (20% de mano de obra)
- Menos: Adelanto familia: -$100,000
- Menos: Préstamo personal: -$200,000
- **NETO A PAGAR: -$220,000** ⚠️ (Saldo a favor del taller)

**Ismael Cervantes:**
- No participa en la liquidación del 20%
- **NETO A PAGAR: $0** (Empleado especial - no liquida)

## ⚙️ Cómo Funciona el Sistema

### **1. Registro de Trabajos:**
- Los trabajos se crean normalmente en la sección "Trabajos"
- Al completarse o entregarse, aparecen en "Liquidación"
- Se calcula automáticamente el 40% de mano de obra

### **2. Movimientos Financieros:**
- Se registran en la sección "Finanzas"
- Tipos: Adelanto, Préstamo, Descuento
- Se cruzan automáticamente en la liquidación

### **3. Procesamiento de Liquidación:**
- Seleccionar trabajos pendientes
- El sistema calcula automáticamente:
  - 40% de mano de obra por trabajo
  - División entre los 3 técnicos
  - Cruce con movimientos financieros
- Se genera liquidación detallada por técnico
- Los trabajos se marcan como "Liquidados"

### **4. Control de Saldos:**
- El sistema previene pagos indebidos
- Identifica saldos a favor del taller
- Muestra saldos a favor de los técnicos
- Historial completo de liquidaciones

## 🎛️ Casos de Uso

### **Escenario 1: Técnico con Adelantos**
```
Mecánico: Víctor Padilla
Trabajos completados: 5
20% Mano de Obra Total: $160,000
Adelantos otorgados: $200,000
NETO: -$40,000 (Saldo a favor del taller)
```

### **Escenario 2: Técnico con Préstamos**
```
Mecánico: Pedro Barraza
Trabajos completados: 3
20% Mano de Obra Total: $96,000
Préstamos otorgados: $0
NETO: $96,000 (Saldo a favor del técnico)
```

### **Escenario 3: Dueño como Técnico**
```
Mecánico: Pedro Barraza
Trabajos completados: 6
20% Mano de Obra Total: $192,000
NETO: $192,000 (Pedro recibe 20% como técnico)
```

### **Escenario 4: Empleado Especial**
```
Mecánico: Ismael Cervantes
Trabajos completados: 4
20% Mano de Obra Total: $0 (no participa en liquidación)
NETO: $0 (No liquida - empleado especial)
```

## 📱 Acceso a la Nueva Funcionalidad

**Navegación:** Nueva pestaña "💼 Liquidación" en el menú principal

### **Estados de Trabajos para Liquidación:**
- ✅ **Completado:** Listo para liquidación
- ✅ **Entregado:** Listo para liquidación  
- ⏳ **En Progreso:** No elegible aún
- ⏳ **Pendiente:** No elegible aún

## 🔒 Control y Seguridad

### **Marcas de Liquidación:**
- Los trabajos liquidados se marcan automáticamente
- Fecha de liquidación registrada
- Monto liquidado por técnico
- Imposible liquidar dos veces

### **Historial Completo:**
- Todos los movimientos quedan registrados
- Trazabilidad total de pagos
- Control de saldos por técnico
- Reportes de productividad

## 💡 Beneficios del Sistema

### **Para el Taller:**
- 💰 **Control total** de costos de mano de obra
- 📊 **Prevención de pérdidas** por adelantos no controlados
- 🎯 **Transparencia** en liquidaciones
- 📈 **Métricas precisas** de productividad

### **Para los Técnicos:**
- 💵 **Transparencia** en cálculos
- ⚡ **Liquidación rápida** de trabajos
- 📋 **Historial claro** de movimientos
- 🛡️ **Protección** de saldos

## 🚀 Próximos Pasos Recomendados

1. **Probar el sistema** con trabajos de ejemplo
2. **Configurar** las tarifas de mano de obra reales
3. **Registrar** los adelantos y préstamos existentes
4. **Capacitar** a los técnicos en el nuevo proceso
5. **Establecer** calendario de liquidaciones (semanal/quincenal)

---

## 📋 Resumen de Cambios

✅ **Mecánicos actualizados** con roles correctos (Pedro: dueño/técnico, Víctor: técnico, Ismael: empleado especial)  
✅ **Sistema de liquidación** 20% para Pedro + 20% para Víctor  
✅ **Nueva sección** de recepción completa integrada  
✅ **Sistema de cotizaciones** con PDFs y aprobaciones  
✅ **Calendario de técnicos** con 8 espacios independientes  
✅ **Historial completo** por vehículo  
✅ **Sistema de notificaciones** para mantenimientos  
✅ **Flujo completo** desde recepción hasta entrega  
✅ **Sistema de cruce** con adelantos/préstamos  
✅ **Control de saldos** preventivo  
✅ **Liquidación individual** o en lote  
✅ **Protección** para trabajos de empleados especiales  
✅ **Historial completo** de movimientos  

**¡Tu sistema de liquidación y flujo completo de recepción están listos para usar!** 🎉💼

La aplicación <filepath>taller-automotriz.html</filepath> ahora incluye todas las funcionalidades que necesitas para gestionar tu taller desde la recepción del vehículo hasta la liquidación final, con el sistema de liquidación correcto (20% para Pedro + 20% para Víctor).