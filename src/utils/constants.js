// Configuracion global del taller
export const TALLER = {
  nombre: 'Multidiagnosticos AS',
  nit: '',
  direccion: 'Sabanalarga, Atlantico',
  telefono: '300 365 1525',
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
  EN_PROGRESO: 'En Progreso',
  PROGRAMADO: 'Programado',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
}

// Tipos de resolucion para facturacion
export const RESOLUCIONES = {
  MAS: { id: 4, nombre: 'Factura Interna (MAS)' },
  FEIC: { id: 2, nombre: 'Factura Electronica (FEIC)' },
}
