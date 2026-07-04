// =====================================================================
// tecnicos.js — Equipo de técnicos dinámico (agregar / desactivar / eliminar)
//
// TECNICOS es un array VIVO: se hidrata de localStorage al cargar y se
// muta in place, así todos los módulos que hacen
//   import { TECNICOS } from '../utils/constants'
// ven siempre la lista actual sin cambiar sus imports.
//
// Reglas del negocio:
// - Desactivar (activo:false): pausa temporal. Sigue visible en la sección
//   "Inactivos" de Mecánicos con opción de reactivar.
// - Eliminar: si no tiene OTs referenciadas se borra de verdad (splice).
//   Si tiene historia se marca eliminado:true (soft-delete): desaparece de
//   TODA la UI, pero permanece en el array para que sus OTs viejas sigan
//   resolviendo el nombre en reportes, historiales y PDFs.
// =====================================================================
import { useEffect, useState } from 'react'

const LS_KEY = 'mda_tecnicos'
const EVT = 'mda:tecnicos-changed'

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

// Array vivo compartido por toda la app
export const TECNICOS = load()

function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(TECNICOS)) } catch { /* quota */ }
  window.dispatchEvent(new Event(EVT))
}

// Visibles en UI de equipo (excluye soft-eliminados)
export const tecnicosVisibles = () => TECNICOS.filter(t => !t.eliminado)
export const tecnicosActivos = () => TECNICOS.filter(t => !t.eliminado && t.activo !== false)

export function agregarTecnico({ nombre, especialidad = 'General', telefono = '', cedula = '' }) {
  const limpio = (nombre || '').trim()
  if (!limpio) return null
  const id = Math.max(0, ...TECNICOS.map(t => t.id)) + 1
  TECNICOS.push({ id, nombre: limpio, especialidad: especialidad.trim() || 'General', telefono: telefono.trim(), cedula: (cedula || '').trim(), tarifa: 20000, activo: true })
  persist()
  return id
}

export function actualizarTecnico(id, patch) {
  const t = TECNICOS.find(x => x.id === id)
  if (!t) return false
  Object.assign(t, patch)
  persist()
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
    return { ok: true, soft: true }
  }
  TECNICOS.splice(i, 1)
  persist()
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
