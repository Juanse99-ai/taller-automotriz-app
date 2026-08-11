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

// Libera el caché descartable cuando el navegador se llena. NO toca la sesión
// ni las COLAS de pendientes (`*_pendientes`, `*_borrados`): eso es lo único
// que aún no está en el servidor y perderlo sí borraría datos de verdad.
// Devuelve cuántos KB liberó.
export function lsPurgarCache() {
  let liberados = 0
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(PREFIX)) continue
      if (/_pendientes$|_borrados$/.test(k)) continue
      liberados += (localStorage.getItem(k) || '').length
      localStorage.removeItem(k)
    }
  } catch { /* si ni eso se puede, se sigue sin caché */ }
  return Math.round(liberados / 1024)
}

// Claves usadas
export const LS_KEYS = {
  TRABAJOS: 'trabajos',
  OT_CONSECUTIVO: 'ot_consecutivo',
  CLIENTES_CACHE: 'clientes_cache',
  INVENTARIO_CACHE: 'inventario_cache',
  INVENTARIO_TIMESTAMP: 'inventario_ts',
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
  PRESTAMOS: 'prestamos_movimientos',
}
