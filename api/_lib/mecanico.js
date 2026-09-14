// Lo que puede hacer contra la base un usuario con rol "mecanico".
//
// Por que vive en el servidor: la app ya esconde secciones segun el rol, pero
// eso solo esconde botones. Con la sesion de un mecanico se podia pedir por la
// API cualquier tabla (clientes con telefono, cotizaciones, pagos) y guardar una
// OT entera, total incluido. Aqui se decide de verdad.
//
// Un mecanico:
//   - lee las OT sin plata (mano de obra, totales, pagos, Cuentti) ni contacto
//     del cliente, y con el precio de las lineas de servicio tapado;
//   - en una OT solo guarda evidencias, tareas, cronometro, insumos por revisar
//     y dos cambios de estado (empezar / listo para revisar);
//   - lee y crea inspecciones;
//   - lee el nombre de los tecnicos.
// Todo lo demas: 403.

import { SUPABASE_URL, SUPABASE_HEAD } from './supabase.js'
import { ESTADOS } from '../../src/utils/estados.js'

export const ROLES_VALIDOS = ['admin', 'jefe_taller', 'mecanico']
export const esMecanico = (sesion) => sesion?.r === 'mecanico'

const METODOS_POR_TABLA = {
  trabajos: ['GET', 'PATCH'],
  inspecciones: ['GET', 'POST'],
  tecnicos: ['GET'],
}

const COLUMNAS = {
  // Sin mano_obra, mano_obra_extra, subtotal_sin_iva, total_iva, total, pagado,
  // metodo_pago, cuentti_*, wompi_tx_id, facturado_en, telefono_cliente,
  // email_cliente ni firma_cliente.
  trabajos: [
    'id', 'fecha', 'created_at', 'ot_codigo', 'cliente', 'cedula_cliente', 'placa', 'marca',
    'modelo', 'ano', 'cilindraje', 'kilometraje', 'tecnico_id', 'estado', 'observaciones',
    'items', 'sin_vehiculo', 'deleted', 'tareas_hechas', 'crono_inicio', 'crono_acumulado',
    'ingreso', 'insumos_propuestos', 'tipo_aceite', 'proximo_km', 'proxima_visita',
    'notas_proximo_mant', 'evidencias',
  ],
  tecnicos: ['id', 'nombre', 'activo', 'especialidad', 'eliminado'],
}
// La lista de OT no trae las evidencias (pesan megas); se piden de a una.
const SIN_PEDIR_EXPLICITO = { trabajos: ['evidencias'] }

// Las unicas columnas de una OT que un mecanico escribe.
const CAMPOS_PATCH = ['evidencias', 'tareas_hechas', 'crono_inicio', 'crono_acumulado', 'insumos_propuestos', 'estado']
// "Empezar" y "Listo para revisar" (= En prueba). Completado y entregar son de oficina.
const ESTADOS_PERMITIDOS = [ESTADOS.EN_PROGRESO, ESTADOS.EN_PRUEBA]
const ESTADOS_CERRADOS = [ESTADOS.COMPLETADO, ESTADOS.CANCELADO]

/** ¿Puede un mecanico hacer este metodo sobre esta tabla, con estos filtros? */
export function permisoMecanico(table, method, query = {}) {
  const metodos = METODOS_POR_TABLA[table]
  if (!metodos) return { ok: false, status: 403, error: 'Esta información no está disponible para mecánicos' }
  if (!metodos.includes(method)) return { ok: false, status: 403, error: 'Los mecánicos no pueden hacer ese cambio' }
  if (table === 'trabajos' && method === 'PATCH') {
    // Una sola OT por vez, identificada por id. Sin esto, un PATCH con otro
    // filtro (o sin filtro) tocaria muchas filas de un golpe.
    const filtros = Object.keys(query).filter(k => !['table', 'select', 'id'].includes(k))
    if (!/^eq\.[\w-]{3,60}$/.test(String(query.id || '')) || filtros.length) {
      return { ok: false, status: 400, error: 'Se cambia una orden a la vez' }
    }
  }
  if (method === 'GET' && COLUMNAS[table]) {
    // Filtrar u ordenar por una columna oculta tambien la revela: con
    // total=gt.500000 u order=total.desc se adivina el total sin pedirlo. Solo
    // se filtra y ordena por lo que puede ver (y nada de or/and, que las esconden).
    const permitidas = COLUMNAS[table]
    const filtros = Object.keys(query).filter(k => !['table', 'select', 'limit', 'offset', 'order'].includes(k))
    const orden = String(query.order || '').split(',').map(s => s.trim().split('.')[0]).filter(Boolean)
    if (filtros.some(k => !permitidas.includes(k)) || orden.some(c => !permitidas.includes(c))) {
      return { ok: false, status: 403, error: 'Ese filtro no está disponible para mecánicos' }
    }
  }
  return { ok: true }
}

/** Columnas que se le devuelven al mecanico: lo pedido, recortado a lo permitido. */
export function selectMecanico(table, pedido) {
  const permitidas = COLUMNAS[table]
  if (!permitidas) return pedido || '*'
  const pedidas = String(pedido || '').split(',').map(s => s.trim()).filter(Boolean)
  const cruce = pedidas.includes('*') ? [] : pedidas.filter(c => permitidas.includes(c))
  if (cruce.length) return cruce.join(',')
  const ocultas = SIN_PEDIR_EXPLICITO[table] || []
  return permitidas.filter(c => !ocultas.includes(c)).join(',')
}

/**
 * Tapa el precio de las lineas de servicio (la mano de obra) en las OT que se le
 * mandan a un mecanico. Los insumos conservan su precio: el dueño decidio que
 * los vea. Respeta el tipo de la columna (texto JSON o arreglo).
 */
export function limpiarTrabajosParaMecanico(filas) {
  const tapar = (items) => (Array.isArray(items) ? items : []).map(i => (i && i.esServicio ? { ...i, precio: null } : i))
  return (Array.isArray(filas) ? filas : []).map(f => {
    if (!f || f.items == null) return f
    if (typeof f.items === 'string') {
      try { return { ...f, items: JSON.stringify(tapar(JSON.parse(f.items))) } } catch { return { ...f, items: '[]' } }
    }
    return { ...f, items: tapar(f.items) }
  })
}

// ── Validacion de lo que escribe ─────────────────────────────────────────
const PREFIJO_EVIDENCIAS = `${SUPABASE_URL}/storage/v1/object/public/evidencias/`
const esTexto = (v, max) => typeof v === 'string' && v.length <= max
const esFecha = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))
const esNumero = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

function parsearLista(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}

function evidenciaValida(e, usuario) {
  return e && typeof e === 'object'
    && esTexto(e.id, 60) && e.id
    && e.subidoPor === usuario
    && (e.tipo === 'foto' || e.tipo === 'video')
    && esTexto(e.url, 600) && e.url.startsWith(PREFIJO_EVIDENCIAS)
    && (e.poster == null || (esTexto(e.poster, 600) && e.poster.startsWith(PREFIJO_EVIDENCIAS)))
    && (e.nota == null || esTexto(e.nota, 500))
    && e.dataUrl == null
}

function insumoValido(p, usuario) {
  return p && typeof p === 'object'
    && esTexto(p.id, 60) && p.id
    && p.cargadoPor === usuario
    && p.estado === 'pendiente'
    && esTexto(p.nombre, 200) && p.nombre.trim()
    && (p.sku == null || esTexto(p.sku, 80))
    && (p.codigo == null || esTexto(p.codigo, 80))
    && (p.productoId == null || esTexto(String(p.productoId), 40))
    && esNumero(p.cantidad, 0.001, 1000)
    && esNumero(p.precio, 0, 100000000)
    && esNumero(p.iva, 0, 100)
    && (p.cargadoPorNombre == null || esTexto(p.cargadoPorNombre, 80))
    && esFecha(p.cargadoEn)
    && p.revisadoPor == null && p.revisadoEn == null
}

// Solo las claves conocidas llegan a la base: nada de campos colados.
const soloClaves = (o, claves) => Object.fromEntries(claves.filter(k => o[k] !== undefined).map(k => [k, o[k]]))
const CLAVES_EVIDENCIA = ['id', 'nombre', 'tipo', 'url', 'path', 'poster', 'nota', 'subidoPor', 'subidoEn']
const CLAVES_INSUMO = ['id', 'productoId', 'sku', 'codigo', 'nombre', 'cantidad', 'precio', 'iva', 'cargadoPor', 'cargadoPorNombre', 'cargadoEn', 'estado']

async function leerFila(id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/trabajos?id=eq.${encodeURIComponent(id)}&select=id,estado,deleted,evidencias,insumos_propuestos&limit=1`,
    { headers: SUPABASE_HEAD })
  if (!r.ok) throw new Error(`No se pudo leer la orden (${r.status})`)
  const filas = await r.json()
  return Array.isArray(filas) ? filas[0] : null
}

/**
 * Arma el cambio que de verdad se guarda cuando un mecanico edita una OT.
 *
 * Evidencias e insumos se FUSIONAN con lo que ya esta en la base en vez de
 * reemplazarse: lo que subio o cargo otra persona se conserva tal cual, y el
 * mecanico solo agrega, corrige o quita lo suyo (y de los insumos, solo los que
 * siguen pendientes). Asi dos personas trabajando la misma OT no se pisan.
 *
 * Devuelve { cuerpo } listo para el PATCH, o { status, error }.
 */
export async function prepararPatchMecanico({ id, cuerpo, usuario, leer = leerFila }) {
  const datos = cuerpo && typeof cuerpo === 'object' ? cuerpo : {}
  const claves = Object.keys(datos)
  if (!claves.length) return { status: 400, error: 'No hay nada que guardar' }
  const ajenas = claves.filter(k => !CAMPOS_PATCH.includes(k))
  if (ajenas.length) return { status: 403, error: `Los mecánicos no pueden cambiar: ${ajenas.join(', ')}` }
  if (!usuario) return { status: 401, error: 'Sesion requerida' }

  const fila = await leer(id)
  if (!fila || fila.deleted === true) return { status: 404, error: 'No existe esa orden' }
  if (ESTADOS_CERRADOS.includes(fila.estado)) return { status: 409, error: 'La orden ya está cerrada' }

  const final = {}

  if ('estado' in datos) {
    if (!ESTADOS_PERMITIDOS.includes(datos.estado)) return { status: 403, error: 'Ese cambio de estado lo hace la oficina' }
    final.estado = datos.estado
  }
  if ('tareas_hechas' in datos) {
    const t = datos.tareas_hechas
    if (!Array.isArray(t) || t.length > 300 || !t.every(x => esTexto(x, 60) || esNumero(x, 0, 1000))) {
      return { status: 400, error: 'Lista de tareas no válida' }
    }
    final.tareas_hechas = t
  }
  if ('crono_inicio' in datos) {
    if (!(datos.crono_inicio === null || esFecha(datos.crono_inicio))) return { status: 400, error: 'Cronómetro no válido' }
    final.crono_inicio = datos.crono_inicio
  }
  if ('crono_acumulado' in datos) {
    if (!Number.isInteger(datos.crono_acumulado) || datos.crono_acumulado < 0 || datos.crono_acumulado > 10000000) {
      return { status: 400, error: 'Cronómetro no válido' }
    }
    final.crono_acumulado = datos.crono_acumulado
  }
  if ('evidencias' in datos) {
    const pedidas = parsearLista(datos.evidencias)
    const mias = pedidas.filter(e => e?.subidoPor === usuario)
    if (mias.length > 60 || !mias.every(e => evidenciaValida(e, usuario))) return { status: 400, error: 'Evidencia no válida' }
    const actuales = parsearLista(fila.evidencias)
    const deOtros = actuales.filter(e => e?.subidoPor !== usuario)
    // La columna es texto JSON: se guarda igual que la guarda la app.
    final.evidencias = JSON.stringify([...deOtros, ...mias.map(e => soloClaves(e, CLAVES_EVIDENCIA))])
  }
  if ('insumos_propuestos' in datos) {
    const pedidas = parsearLista(datos.insumos_propuestos)
    const misPendientes = pedidas.filter(p => p?.cargadoPor === usuario && p?.estado === 'pendiente')
    if (misPendientes.length > 100 || !misPendientes.every(p => insumoValido(p, usuario))) {
      return { status: 400, error: 'Insumo no válido' }
    }
    const actuales = parsearLista(fila.insumos_propuestos)
    // Se conserva todo lo de otros y todo lo ya revisado; lo pendiente propio se
    // reemplaza por lo que manda (asi puede corregir una cantidad o quitarlo).
    const intocables = actuales.filter(p => !(p?.cargadoPor === usuario && p?.estado === 'pendiente'))
    const idsIntocables = new Set(intocables.map(p => p?.id))
    const nuevos = misPendientes.filter(p => !idsIntocables.has(p.id)).map(p => soloClaves(p, CLAVES_INSUMO))
    if (intocables.length + nuevos.length > 300) return { status: 400, error: 'Demasiados insumos en esta orden' }
    final.insumos_propuestos = [...intocables, ...nuevos]
  }
  return { cuerpo: final }
}

// ── Cuentti ─────────────────────────────────────────────────────────────
// Del Cuentti del negocio, un mecanico solo consulta el inventario (para cargar
// los insumos que usa). Nada de facturar, pagos, anular ni clientes.
const CUENTTI_INVENTARIO = [
  '/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/consultaProductoPaginadaMovil/',
  '/jServerj4ErpPro/com/j4ErpPro/server/vent/factura/consultaProductoPaginadaMini/',
  '/jServerj4ErpPro/com/j4ErpPro/server/inv/producto/consultaExistenciasActivosMini/',
]
export const cuenttiPermitidoMecanico = (method, pathSolo) =>
  method === 'GET' && CUENTTI_INVENTARIO.some(p => String(pathSolo || '').startsWith(p))

// El listado "Movil" trae el costo de compra de cada producto. El mecanico ve el
// precio de venta de lo que carga, no el costo ni el margen. Mismo criterio que
// extraerCostoBase en src/services/cuentti.js: cualquier campo de costo/compra,
// menos los ids (id_centro_costo y parecidos).
const esCampoCosto = (k) => /costo|compra/i.test(k) && !/centro|id_|_id/i.test(k)
export function quitarCostosCuentti(dato, profundidad = 0) {
  if (profundidad > 4 || dato == null || typeof dato !== 'object') return dato
  if (Array.isArray(dato)) return dato.map(x => quitarCostosCuentti(x, profundidad + 1))
  return Object.fromEntries(Object.entries(dato)
    .filter(([k]) => !esCampoCosto(k))
    .map(([k, v]) => [k, quitarCostosCuentti(v, profundidad + 1)]))
}
