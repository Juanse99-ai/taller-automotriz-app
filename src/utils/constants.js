// Configuracion global del taller — datos formales para PDFs y facturas
export const TALLER = {
  nombre: 'MULTIDIAGNOSTICOS AS',
  razonSocial: 'MULTIDIAGNOSTICOS AS',
  nit: '901.572.225-2',
  direccion: 'Carrera 27 #13-05, Sabanalarga, Atlántico',
  ciudad: 'Sabanalarga, Atlántico',
  telefono: '302 319 1749',
  celular: '302 319 1749',
  email: 'multidiagnosticosas@gmail.com',
}

export const TECNICOS = [
  { id: 1, nombre: 'Pedro Barraza', especialidad: 'Frenos', telefono: '3002345678', tarifa: 20000 },
  { id: 2, nombre: 'Victor Padilla', especialidad: 'General', telefono: '3001234567', tarifa: 20000 },
  { id: 3, nombre: 'Ismael Cervantes', especialidad: 'Motor', telefono: '3003456789', tarifa: 20000 },
]

// Comisiones: 40% total, 20% cada tecnico si trabajan juntos
export const COMISION = {
  TOTAL: 0.40,
  SPLIT: 0.20,
}

// IVA por defecto en Colombia
export const IVA_DEFAULT = 19

// Estados de trabajo
export const ESTADOS = {
  PENDIENTE: 'Pendiente',
  EN_DIAGNOSTICO: 'En Diagnostico',
  ESPERANDO_REPUESTOS: 'Esperando Repuestos',
  EN_PROGRESO: 'En Progreso',
  EN_PRUEBA: 'En Prueba',
  PROGRAMADO: 'Programado',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
}

// Dias sin actividad para marcar trabajo como estancado
export const DIAS_ESTANCADO = 3

// Tipos de resolucion para facturacion
export const RESOLUCIONES = {
  MAS: { id: 4, nombre: 'Factura Interna (MAS)' },
  FEIC: { id: 2, nombre: 'Factura Electronica (FEIC)' },
}
