// Config del "Estado de ingreso del vehículo": inventario + combustible + daños.
// Se guarda en trabajo.ingreso (columna jsonb):
//   { inventario: string[] (keys presentes), combustible: 0-8 | null, estado: text }
// El inventario guarda las KEYS marcadas; la lista canónica vive aquí, así se
// pueden agregar/quitar ítems sin migración.

export const INVENTARIO_ITEMS = [
  { key: 'documentos', label: 'Documentos' },
  { key: 'rueda_repuesto', label: 'Rueda de repuesto' },
  { key: 'gato', label: 'Gato' },
  { key: 'llave_ruedas', label: 'Llave de ruedas' },
  { key: 'herramientas', label: 'Herramientas' },
  { key: 'extintor', label: 'Extintor' },
  { key: 'botiquin', label: 'Botiquín' },
  { key: 'triangulos', label: 'Triángulos' },
  { key: 'chaleco', label: 'Chaleco reflectivo' },
  { key: 'tacos', label: 'Tacos' },
  { key: 'llave_1', label: 'Llave 1' },
  { key: 'llave_2', label: 'Llave 2' },
  { key: 'tapas_ruedas', label: 'Tapas de ruedas' },
  { key: 'antena', label: 'Antena' },
  { key: 'encendedor', label: 'Encendedor' },
  { key: 'pisos', label: 'Pisos / tapetes' },
]

const BY_KEY = Object.fromEntries(INVENTARIO_ITEMS.map(i => [i.key, i.label]))
export const labelInventario = (key) => BY_KEY[key] || key

// Nivel de combustible en octavos (0..8), como un tablero real.
export const NIVEL_COMBUSTIBLE = ['Vacío', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'Lleno']
export const etiquetaCombustible = (n) => (n == null ? '—' : NIVEL_COMBUSTIBLE[Math.max(0, Math.min(8, n))])

export const ingresoVacio = () => ({ inventario: [], combustible: null, estado: '' })

// ¿el ingreso tiene algo registrado? (para no mostrar tarjetas vacías)
export const ingresoTieneAlgo = (ing) =>
  !!ing && (
    (Array.isArray(ing.inventario) && ing.inventario.length > 0) ||
    ing.combustible != null ||
    (typeof ing.estado === 'string' && ing.estado.trim() !== '')
  )
