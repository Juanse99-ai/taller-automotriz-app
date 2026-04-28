const PREFIX = 'mda_'

export function lsGet(key, fallback = []) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function lsSet(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch (e) {
    console.warn('localStorage set error:', e.message)
  }
}

export function lsRemove(key) {
  localStorage.removeItem(PREFIX + key)
}

// Claves usadas
export const LS_KEYS = {
  TRABAJOS: 'trabajos',
  OT_CONSECUTIVO: 'ot_consecutivo',
  CLIENTES_CACHE: 'clientes_cache',
  INVENTARIO_CACHE: 'inventario_cache',
  COTIZACIONES: 'cotizaciones',
  FACTURAS: 'facturas',
  VEHICULOS: 'vehiculos',
  MOVIMIENTOS_TECNICOS: 'movimientos_tecnicos',
  LIQUIDACIONES: 'liquidaciones',
  CLIENTES: 'mda_clientes',
  VEHICULOS_HIST: 'mda_vehiculos_hist',
  INSPECCIONES: 'inspecciones',
  LIQUIDADOS: 'liquidados',
  TRABAJOS_COMPARTIDOS: 'trabajos_compartidos',
  LIQUIDACION_HISTORIAL: 'liquidacion_historial',
}
