// =====================================================================
// tecnicos.js — Equipo de técnicos COMPARTIDO entre dispositivos.
//
// TECNICOS es un array VIVO: se hidrata de localStorage al instante (arranque
// sin parpadeo, funciona offline) y luego se sincroniza con la base (Supabase
// vía /api/supabase?table=tecnicos). La base es la fuente compartida: agregar
// un técnico en el celular ahora sí aparece en el computador.
//
// Los ids se CONSERVAN: van incrustados en trabajos.tecnico_id y en toda la
// liquidación/reportes/PDFs. Por eso los técnicos nuevos piden su id a la
// secuencia de la base (compartida) en vez de calcularlo local, así dos
// dispositivos no eligen el mismo número.
//
// Como todos los módulos hacen `import { TECNICOS } from '../utils/constants'`
// (que reexporta este array), la mutación in place mantiene la misma referencia
// y todos ven siempre la lista actual sin cambiar sus imports.
//
// Reglas del negocio (sin cambios):
// - Desactivar (activo:false): pausa temporal, reactivable desde "Inactivos".
// - Eliminar: sin OTs → borrado real; con historia → soft-delete (eliminado:true)
//   para que las OTs viejas sigan resolviendo el nombre.
// =====================================================================
import { useEffect, useState } from 'react'

const LS_KEY = 'mda_tecnicos'
const EVT = 'mda:tecnicos-changed'
import { getToken } from './auth'

const API = '/api/supabase?table=tecnicos'

const SEED = [
  { id: 1, nombre: 'Pedro Barraza', especialidad: 'Frenos', telefono: '3002345678', tarifa: 20000, activo: true, cedula: '8645782' },
  { id: 2, nombre: 'Victor Padilla', especialidad: 'General', telefono: '3001234567', tarifa: 20000, activo: true, cedula: '72022062' },
  { id: 3, nombre: 'Ismael Cervantes', especialidad: 'Motor', telefono: '3003456789', tarifa: 20000, activo: true, cedula: '' },
]

// Cédulas conocidas (proveedor en Cuentti) para backfill de datos ya guardados.
const CEDULAS_CONOCIDAS = { 'Pedro Barraza': '8645782', 'Victor Padilla': '72022062' }

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY))
    if (Array.isArray(raw) && raw.length) {
      // activo por defecto true; cédula backfill por nombre si no la tiene aún.
      return raw.map(t => ({ activo: true, ...t, cedula: t.cedula || CEDULAS_CONOCIDAS[t.nombre] || '' }))
    }
  } catch { /* seed */ }
  return SEED.map(t => ({ ...t }))
}

// Array vivo compartido por toda la app (hidratado de localStorage al instante).
export const TECNICOS = load()

function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(TECNICOS)) } catch { /* quota */ }
  window.dispatchEvent(new Event(EVT))
}

// ---------- Sincronización con la base ----------
// Best-effort: si la red falla, la app se queda con la caché de localStorage.

const toDB = (t) => ({
  id: t.id,
  nombre: t.nombre,
  especialidad: t.especialidad || 'General',
  telefono: t.telefono || '',
  cedula: t.cedula || '',
  tarifa: t.tarifa ?? 20000,
  activo: t.activo !== false,
  eliminado: !!t.eliminado,
})

const fromDB = (r) => ({
  id: r.id,
  nombre: r.nombre,
  especialidad: r.especialidad || 'General',
  telefono: r.telefono || '',
  cedula: r.cedula || '',
  tarifa: r.tarifa != null ? Number(r.tarifa) : 20000,
  activo: r.activo !== false,
  ...(r.eliminado ? { eliminado: true } : {}),
})

const apiCall = (opts = {}, qs = '') =>
  fetch(`${API}${qs}`, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Sesion': getToken(), ...(opts.headers || {}) } })

// Crea o actualiza una fila por id (upsert). Silencioso: los datos ya están en LS.
const dbUpsert = (t) =>
  apiCall({ method: 'POST', body: JSON.stringify(toDB(t)) }, '&upsert=true').catch(() => {})
const dbDelete = (id) =>
  apiCall({ method: 'DELETE' }, `&id=eq.${id}`).catch(() => {})

// Trae el equipo de la base y lo funde con lo local. La base manda; los técnicos
// que existan solo en este dispositivo (agregados offline) se empujan hacia arriba
// para no perderlos. Nunca borra datos locales.
export async function syncTecnicos() {
  try {
    const res = await apiCall({}, '&select=*&order=id')
    if (!res.ok) return
    const rows = await res.json()
    if (!Array.isArray(rows)) return
    const byId = new Map(rows.map(r => [r.id, fromDB(r)]))
    for (const t of TECNICOS) {
      if (!byId.has(t.id)) { byId.set(t.id, t); dbUpsert(t) }
    }
    TECNICOS.splice(0, TECNICOS.length, ...byId.values())
    persist()
  } catch { /* offline: se queda con localStorage */ }
}
// Arranca la sync al cargar el módulo (no bloquea: la UI ya tiene localStorage).
syncTecnicos()

// ---------- API pública (sin cambios de firma) ----------

// Visibles en UI de equipo (excluye soft-eliminados)
export const tecnicosVisibles = () => TECNICOS.filter(t => !t.eliminado)
export const tecnicosActivos = () => TECNICOS.filter(t => !t.eliminado && t.activo !== false)

export function agregarTecnico({ nombre, especialidad = 'General', telefono = '', cedula = '' }) {
  const limpio = (nombre || '').trim()
  if (!limpio) return null
  // Id optimista local para pintar YA; la base le dará el definitivo.
  const tmpId = Math.max(0, ...TECNICOS.map(t => t.id)) + 1
  const nuevo = { id: tmpId, nombre: limpio, especialidad: especialidad.trim() || 'General', telefono: telefono.trim(), cedula: (cedula || '').trim(), tarifa: 20000, activo: true }
  TECNICOS.push(nuevo)
  persist()
  // Pide id definitivo a la secuencia compartida (así el celular y el computador
  // no eligen el mismo número). El técnico es nuevo: no tiene OTs, remapear su id
  // es seguro. Si la red falla, se queda con tmpId y la próxima sync lo empuja.
  const { id: _sinId, ...cuerpo } = toDB(nuevo)
  apiCall({ method: 'POST', body: JSON.stringify(cuerpo) })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const real = Array.isArray(data) ? data[0]?.id : data?.id
      if (real != null && real !== tmpId) {
        const t = TECNICOS.find(x => x.id === tmpId)
        if (t) { t.id = real; persist() }
      }
    })
    .catch(() => {})
  return tmpId
}

export function actualizarTecnico(id, patch) {
  const t = TECNICOS.find(x => x.id === id)
  if (!t) return false
  Object.assign(t, patch)
  persist()
  dbUpsert(t)
  return true
}

export const setTecnicoActivo = (id, activo) => actualizarTecnico(id, { activo })

// Eliminar: borrado real si no tiene OTs; soft-delete si tiene historia
// (se conserva en el array, oculto, para resolver nombres en registros viejos).
export function eliminarTecnico(id, trabajos = []) {
  const i = TECNICOS.findIndex(t => t.id === id)
  if (i < 0) return { ok: false, motivo: 'no-existe' }
  const tieneHistoria = trabajos.some(t => parseInt(t.tecnicoId) === id)
  if (tieneHistoria) {
    Object.assign(TECNICOS[i], { eliminado: true, activo: false })
    persist()
    dbUpsert(TECNICOS[i])
    return { ok: true, soft: true }
  }
  TECNICOS.splice(i, 1)
  persist()
  dbDelete(id)
  return { ok: true, soft: false }
}

// Hook: re-renderiza cuando cambia el equipo. Devuelve una COPIA nueva en
// cada cambio para que los useMemo con [tecnicos] en deps sí recalculen
// (el array TECNICOS se muta in place y conserva la misma referencia).
export function useTecnicos() {
  const [list, setList] = useState(() => [...TECNICOS])
  useEffect(() => {
    const h = () => setList([...TECNICOS])
    window.addEventListener(EVT, h)
    return () => window.removeEventListener(EVT, h)
  }, [])
  return list
}
