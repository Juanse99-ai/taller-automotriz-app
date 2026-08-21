import { Fragment, useState, useEffect, useMemo, useRef } from 'react'

// Bloques por antiguedad para la lista de OT. Con 157 filas ordenadas por fecha
// hay que leer la columna FECHA de cada una para ubicarse; una cabecera cada
// vez que cambia el bloque deja barrer la lista de un vistazo. NO sustituye a
// la columna: la columna dice el dia exacto, la cabecera da el tramo.
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function bloqueFecha(f) {
  if (!f) return 'Sin fecha'
  const d = new Date(f)
  if (isNaN(d)) return 'Sin fecha'
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const dia = new Date(d); dia.setHours(0, 0, 0, 0)
  const dias = Math.round((hoy - dia) / 86400000)
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return 'Esta semana'
  if (dias < 14) return 'La semana pasada'
  if (hoy.getFullYear() === dia.getFullYear() && hoy.getMonth() === dia.getMonth()) return 'Este mes'
  return `${MESES_ES[dia.getMonth()]} ${dia.getFullYear()}`
}
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, fmtTelefono, cantidadItem, fmtCant } from '../utils/helpers'
import { TECNICOS, ESTADOS, DIAS_ESTANCADO, TALLER, SIN_FACTURA } from '../utils/constants'
import { loadLogo as loadPdfLogo, drawHeader, drawSectionHeader, drawDataBlock, drawTotalsBox, drawSignatures, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS } from '../utils/pdfTheme'
import FichaTecnico from '../components/FichaTecnico'
import { labelInventario, etiquetaCombustible, ingresoTieneAlgo } from '../utils/ingreso'
import { exportarFichasTecnico } from '../utils/fichaPdf'
import { comisionTecnico, esServicioItem } from '../utils/comision'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'
import { borrarVideoEvidencia, fetchEvidenciasTrabajo } from '../services/supabase'
import SignaturePad from '../components/SignaturePad'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, Badge, IconX, IconEdit, IconTrash, IconPdf, IconPhone, IconChat, IconCheck } from '../components/ui'
import TrabajoForm from './TrabajoForm'

// ¿La fecha cae dentro del rango elegido? (hoy / semana = últimos 7 días / mes = mes actual)
function dentroDeFecha(fecha, modo, now) {
  if (!fecha) return false
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return false
  if (modo === 'hoy') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }
  if (modo === 'semana') {
    const ini = new Date(now); ini.setDate(now.getDate() - 6); ini.setHours(0, 0, 0, 0)
    return d >= ini
  }
  if (modo === 'mes') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  return true
}

// Etiqueta de tipo de servicio derivada de los ítems/diagnóstico de la OT (Kanban)
const SERVICIO_TAGS = [
  { re: /aceite|filtro|lubric/i, label: 'Aceite', color: '#f59e0b' },
  { re: /freno|pastilla|banda|disco|zapata/i, label: 'Frenos', color: '#2563eb' },
  { re: /aline|balance|suspensi|amortigua|r[oó]tula|terminal|barra estab/i, label: 'Suspensión', color: '#16a34a' },
  { re: /sincron|diagn|escan|scanner|el[eé]ctric|fusible|bater|luz|luces|sensor|bobina|buj[ií]a/i, label: 'Eléctrico', color: '#7c3aed' },
  { re: /llanta|neum|\brin\b|caucho/i, label: 'Llantas', color: '#db2777' },
  { re: /motor|distribuci|correa|empaque|culata|inyect|clutch|embrague|caja/i, label: 'Motor', color: '#ea580c' },
  { re: /lavado|detail|pulido|polichad/i, label: 'Lavado', color: '#0891b2' },
]
function tipoServicio(t) {
  const txt = ((t?.items || []).map(i => i?.nombre || '').join(' ') + ' ' + (t?.diagnostico || t?.observaciones || '')).toLowerCase()
  for (const s of SERVICIO_TAGS) if (s.re.test(txt)) return s
  if (t?.tipoAceite && t.tipoAceite !== 'no_aplica') return SERVICIO_TAGS[0]
  return null
}

// Las seis columnas del tablero, en el orden en que un carro las recorre. El
// tono tiñe la columna al 2-3% para reconocerla sin leer el rótulo; "corto" es
// como se nombra la columna en el celular, donde no cabe el estado completo.
// Cuantas tarjetas se pintan por columna antes de recoger el resto tras una
// pastilla. Completado tiene 157: pintarlas todas cuesta y no se leen.
const KB_TOPE = 25
const KCOLS = [
  { estado: ESTADOS.PENDIENTE, rotulo: 'PENDIENTE', corto: 'Pend.', tono: 'warn' },
  { estado: ESTADOS.EN_DIAGNOSTICO, rotulo: 'DIAGNÓSTICO', corto: 'Diagnóstico', tono: 'purple' },
  { estado: ESTADOS.EN_PROGRESO, rotulo: 'EN PROGRESO', corto: 'En Progreso', tono: 'info' },
  { estado: ESTADOS.ESPERANDO_REPUESTOS, rotulo: 'ESPERANDO REP.', corto: 'Esperando', tono: 'orange' },
  { estado: ESTADOS.EN_PRUEBA, rotulo: 'EN PRUEBA', corto: 'Prueba', tono: 'neutral' },
  { estado: ESTADOS.COMPLETADO, rotulo: 'COMPLETADO', corto: 'Listo', tono: 'ok' },
]
// Cuántos días lleva la OT quieta y de qué color se avisa. Ámbar a los 4, rojo a
// los 5: es lo que el dueño busca en un tablero, qué se está quedando atrás.
function diasQuieta(t) {
  return t?.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
}
function tonoAntiguedad(t, dias) {
  if (t.estado === ESTADOS.COMPLETADO || t.estado === ESTADOS.CANCELADO) return ''
  // Los dos puntos son del mismo juego que los de .st (--red-500 / --amber-400).
  // --bad-fg es tinta de TEXTO: en modo oscuro se aclara a rosa palido y dejaba
  // la alarma de 5 dias mas floja que el aviso de 4, invirtiendo la escalada.
  if (dias >= 5) return 'var(--red-500)'
  if (dias >= 4) return 'var(--amber-400)'
  return ''
}

// ¿Ya se le cobró a este cliente? Es la pregunta del mostrador y hasta ahora la
// ficha de la OT no la contestaba: tocaba entrar a Cuentti a adivinar. Devuelve
// null cuando todavía no aplica (OT sin terminar), para no llenar de avisos.
function estadoCobro(t) {
  if (!t) return null
  if (t.cuenttiTransacionId === SIN_FACTURA) return { tone: 'success', label: 'Cobrada sin factura' }
  const facturada = !!(t.cuenttiTransacionId || t.facturadoEn)
  if (facturada) {
    // "Por cobrar" y no "Facturada · falta cobrar": la etiqueta larga desbordaba
    // la celda de estado en celular y sacaba scroll horizontal en toda la página,
    // y es justo el estado más frecuente.
    return t.pagado
      ? { tone: 'success', label: 'Cobrada' }
      : { tone: 'warning', label: 'Por cobrar' }
  }
  // Sin ítems no hay nada que facturar: el panel de Cuentti la descarta, así que
  // ofrecer "Cobrar" llevaba a un selector vacío y a un error al enviar.
  if (t.estado === ESTADOS.COMPLETADO) {
    const facturable = Array.isArray(t.items) && t.items.length > 0
    return facturable
      ? { tone: 'neutral', label: 'Sin facturar', porCobrar: true }
      : { tone: 'neutral', label: 'Sin ítems para facturar' }
  }
  return null
}

// El color de la pastilla es semantico: cada estado tiene el suyo y no se repite
// para decorar. Vive aqui y no inline para que las 13 pantallas usen el mismo.
function chipEstado(estado) {
  if (estado === ESTADOS.COMPLETADO) return 'ok'
  if (estado === ESTADOS.EN_PROGRESO || estado === ESTADOS.EN_PRUEBA) return 'info'
  if (estado === ESTADOS.PENDIENTE) return 'warn'
  if (estado === ESTADOS.EN_DIAGNOSTICO) return 'purple'
  if (estado === ESTADOS.ESPERANDO_REPUESTOS) return 'orange'
  return 'mute'
}
// `estadoCobro` emite los nombres largos ('success' | 'warning' | 'neutral');
// esta tabla solo miraba las iniciales, asi que TODA la columna COBRO caia en
// 'mute' y salia gris. Ahora acepta las dos formas: cobrada en verde, por
// cobrar en ambar, sin cobro en gris, como en el mockup.
function chipTono(tone) {
  if (tone === 's' || tone === 'success') return 'ok'
  if (tone === 'w' || tone === 'warning') return 'warn'
  if (tone === 'd' || tone === 'danger') return 'bad'
  if (tone === 'i' || tone === 'info') return 'info'
  return 'mute'
}

// Maquetacion exacta del mockup "Ordenes de trabajo" (marco de 1280px). Vive
// aqui y no en index.css porque solo aplica a esta pantalla: todos los
// selectores cuelgan de .trab-page. Solo colores por token, nunca hex sueltos.
const CSS_TRABAJOS = `
/* Cadena de altura. .content y .page-enter son bloques normales, asi que
   .trab-cockpit, .hd-card--grow y .hd-tbl__b nunca recibian altura de la que
   recortar: la tarjeta quedaba corta flotando sobre gris y la pagina entera
   scrolleaba (titulo, pestañas y filtros se iban hacia arriba). El :has()
   deja fuera al resto de pantallas, que no estan hechas para altura fija. */
@media (min-width:1200px){
  /* .app solo tiene min-height:100vh, asi que el flex:1 de .content no
     recortaba nada: la altura era circular (contenido -> app -> main). Con
     una altura firme en .main (100vh menos los 10px de marco arriba y abajo)
     la cadena ya tiene de donde repartir. */
  .main:has(> .content > .page-enter > .trab-page--fill){height:calc(100vh - 20px);min-height:0}
  .content:has(> .page-enter > .trab-page--fill){display:flex;flex-direction:column}
  .content > .page-enter:has(> .trab-page--fill){flex:1;min-height:0;display:flex;flex-direction:column}
  .trab-page--fill{flex:1;min-height:0;display:flex;flex-direction:column}
}
/* Todo lo de abajo es geometria de escritorio: en movil mandan las reglas
   tactiles de index.css (44px minimos), que no se pisan. */
@media (min-width:961px){
  .trab-page .hd-head{gap:16px}
  .trab-page .hd-head__t h1{font-size:20px;letter-spacing:-.2px}
  .trab-page .hd-head__right{gap:8px}
  /* Accion principal: rectangulo de 34px, no pildora de 44 */
  .trab-page .trab-new{height:34px;min-height:34px;padding:0 14px;gap:6px;
    border-radius:6px;font-size:12.5px;font-weight:700;box-shadow:none}
  .trab-page .trab-new:hover{transform:none}
  .trab-page .trab-new svg{width:14px;height:14px;stroke-width:2.4}

  /* Segmentados: riel --border (el --chip casi no se distinguia del blanco
     de al lado) e inactivos en 400, no en 600 */
  .trab-page .hd-seg{gap:0;height:auto;padding:2px;background:var(--border)}
  .trab-page .hd-seg__i{height:auto;padding:7px 12px;font-size:11.5px;font-weight:400;color:var(--text-3)}
  .trab-page .hd-seg__i.on{padding:7px 13px;font-weight:700;color:var(--text)}

  /* Buscador y desplegable: rectangulo blanco con borde, no pildora gris */
  .trab-page .hd-find{height:32px;padding:0 10px;background:var(--bg-raised);
    border:1px solid var(--border-strong);border-radius:10px}
  .trab-page .hd-find svg{width:14px;height:14px}
  .trab-page .hd-find input{font-size:12px}
  .trab-page .trab-drop{position:relative;display:flex;align-items:center;flex:none}
  .trab-page .trab-drop > .hd-drop{width:190px;height:32px;padding:0 28px 0 10px;
    border-color:var(--border-strong);border-radius:10px;font-size:12px;color:var(--text-2);
    appearance:none;-webkit-appearance:none;-moz-appearance:none}
  .trab-page .trab-drop > svg{position:absolute;right:9px;width:13px;height:13px;
    pointer-events:none;color:var(--text-4);stroke:currentColor;fill:none;stroke-width:2}
  .trab-page .hd-bar__n{font-size:11.5px;color:var(--text-4)}

  /* Lista + rail de detalle son UNA superficie blanca partida por 1px, como
     en el mockup, en vez de dos cajas flotando con 10px de gris en medio. */
  .trab-page .trab-cockpit{gap:0;background:var(--bg-raised);
    border:1px solid var(--border-strong);border-radius:8px;overflow:hidden}
  .trab-page .trab-cockpit__list{border:none;border-radius:0;background:none}
  .trab-page .hd-tbl__h{padding:0 12px;border-top:none;border-bottom:1.5px solid var(--border)}
  .trab-page .hd-row{padding:0 12px;border-bottom:1px solid var(--chip)}
  .trab-page .hd-tbl__b .hd-row:nth-child(even){background:color-mix(in srgb,var(--text) 2%,var(--bg-raised))}
  .trab-page .hd-tbl__b .hd-row:hover{background:var(--bg-subtle)}
  .trab-page .hd-tbl__b .hd-row.on{background:var(--accent-soft)}
  /* La placa va en la misma sans del resto: asi la dibuja ESTE mockup */
  .trab-page .hd-plate{font-family:inherit;line-height:1.15}
  /* Iconos de fila: 26x26 radio 5 con svg de 14, no pildoras de 38 */
  .trab-page .hd-row .btn-icon.btn-sm{width:26px;min-width:26px;height:26px;min-height:26px;
    padding:0;border-radius:5px}
  .trab-page .hd-row .btn-icon.btn-sm svg{width:14px;height:14px}
  .trab-page .hd-row .btn-icon.btn-sm:hover{transform:none}
  /* El mockup no trae pie, pero el pie lleva datos (cuantas y cuanto suman):
     no se tira, baja de jerarquia a linea de apoyo. */
  .trab-page .hd-tbl__f{height:30px;padding:0 12px;background:none;
    border-top:1px solid var(--border);font-size:11.5px;color:var(--text-4)}
  .trab-page .hd-tbl__f b{font-size:12px}

  /* Rail de detalle: pegado al marco, con su titulo de acento y el bloque
     de filtro activo que faltaban. */
  .trab-page .trab-cockpit__detail{display:flex;flex-direction:column;min-height:0;
    border-left:1px solid var(--border-strong);background:var(--bg-raised)}
  .trab-page .trab-detail{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:16px}
  .trab-page .trab-detail__h{display:flex;align-items:center;gap:7px;flex:none}
  .trab-page .trab-detail__h i{display:block;width:3px;height:14px;background:var(--accent);border-radius:2px}
  .trab-page .trab-detail__h span{font-size:12.5px;line-height:1;font-weight:700;color:var(--text)}
  .trab-page .trab-detail__p{margin:0;font-size:12.5px;line-height:1.5;color:var(--text-4)}
  .trab-page .trab-detail__div{flex:none;height:1px;background:var(--border)}
  .trab-page .trab-detail__l{flex:none;font-size:9.5px;line-height:1;font-weight:700;
    letter-spacing:.9px;text-transform:uppercase;color:var(--text-4)}
  .trab-page .trab-detail__chips{flex:none;display:flex;flex-wrap:wrap;gap:6px}
  .trab-page .trab-fchip{max-width:100%;font-size:10.5px;line-height:1;font-weight:400;
    color:var(--text-2);background:var(--chip);padding:5px 9px;border-radius:var(--radius-pill);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .trab-page .trab-fchip--on{font-weight:700;color:var(--text);background:var(--warn-bg)}
  .trab-page .trab-detail__ot{flex:none;display:flex;flex-direction:column;gap:2px}
  .trab-page .trab-detail__b{flex:1;min-height:0;overflow-y:auto;
    display:flex;flex-direction:column;gap:12px}
}
`

export default function Trabajos({ hook, vehiculosHook, clientesHook, notify, onAutoFacturar }) {
  const { trabajos, agregarTrabajo, actualizarTrabajo, eliminarTrabajo, puedeCrearOT } = hook
  const [vista, setVista] = useState('lista') // lista | nuevo | editar | kanban
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmCfg, setConfirmCfg] = useState(null) // diálogo de confirmación (cockpit)
  // Cockpit desktop: trabajo seleccionado para el panel de detalle (solo ≥1200px)
  const [selId, setSelId] = useState(null)
  const [previewId, setPreviewId] = useState(null) // vista previa de una OT (modal) antes de editar
  const [fichaId, setFichaId] = useState(null) // OT abierta en la Ficha del técnico
  const [firmando, setFirmando] = useState(false) // capturando firma del cliente en la vista previa
  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width:1200px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width:1200px)')
    const fn = e => setIsWide(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  // Kanban: arrastrar tarjetas entre columnas para cambiar el estado de la OT.
  const dragIdRef = useRef(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  // En el celular el tablero enseña una columna a la vez: seis no se manejan con
  // el dedo. Esta es la que está a la vista.
  const [kCol, setKCol] = useState(ESTADOS.EN_PROGRESO)
  const [kbAbiertas, setKbAbiertas] = useState([]) // columnas del tablero con el resto desplegado
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width:700px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width:700px)')
    const fn = e => setIsPhone(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  // Mover una OT de columna. Se usa tanto al soltar la tarjeta (escritorio) como
  // al tocar "Pasar a <estado>" (celular), que es el mismo cambio por otra via.
  const moverEstado = (id, estado) => {
    const t = trabajos.find(x => x.id === id)
    if (t && t.estado !== estado) {
      // Soltar en "Completados" debe ofrecer facturar, igual que "Marcar listo":
      // antes el kanban solo cambiaba el estado y no aparecía la opción de factura.
      if (estado === ESTADOS.COMPLETADO) { handleCompletar(id); return }
      actualizarTrabajo(id, { estado })
      notify?.(`${t.otCodigo || 'OT'} → ${estado}`, 'info')
    }
  }
  const dropEnColumna = (estado) => {
    const id = dragIdRef.current
    dragIdRef.current = null
    setDragOverCol(null)
    if (id) moverEstado(id, estado)
  }

  // Filtros
  // Default: 'activos' = todos los que NO estan terminados (Completado/Cancelado).
  // Asi al abrir Trabajos solo ves los que estan en proceso, no los ya cerrados.
  // Los filtros se RECUERDAN entre navegaciones/recargas (localStorage). La
  // búsqueda de texto (filtroBusqueda) se deja transitoria a propósito.
  const [filtroEstado, setFiltroEstado] = useState(() => lsGet('mda:trab_estado', 'activos'))
  const [filtroTecnico, setFiltroTecnico] = useState(() => lsGet('mda:trab_tecnico', 'todos'))
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  // Filtro de fecha de la LISTA (el kanban siempre muestra todo el trabajo activo).
  // Por defecto 'hoy' → al abrir Trabajos solo se ven las OT del día.
  const [filtroFecha, setFiltroFecha] = useState(() => lsGet('mda:trab_fecha', 'todas'))
  useEffect(() => {
    lsSet('mda:trab_estado', filtroEstado); lsSet('mda:trab_tecnico', filtroTecnico); lsSet('mda:trab_fecha', filtroFecha)
  }, [filtroEstado, filtroTecnico, filtroFecha])

  // Base: aplica técnico + búsqueda + fecha, pero NO el estado (así se cuenta cuántos
  // hay en cada estado para los chips, y los conteos siempre cuadran con la lista).
  const baseFiltrado = useMemo(() => {
    let list = [...trabajos]
    if (filtroTecnico !== 'todos') list = list.filter(t => String(t.tecnicoId) === filtroTecnico)
    if (filtroBusqueda.trim()) {
      const q = filtroBusqueda.toLowerCase()
      list = list.filter(t =>
        (t.placa || '').toLowerCase().includes(q) ||
        (t.cliente || '').toLowerCase().includes(q) ||
        (t.otCodigo || '').toLowerCase().includes(q)
      )
    }
    // Filtro por fecha — solo aplica en la vista lista. El kanban muestra todo el
    // trabajo activo sin importar el día (si no, se esconderían carros en proceso).
    if (vista !== 'kanban' && filtroFecha !== 'todas') {
      const now = new Date()
      list = list.filter(t => dentroDeFecha(t.fecha, filtroFecha, now))
    }
    return list
  }, [trabajos, filtroTecnico, filtroBusqueda, filtroFecha, vista])

  const filtered = useMemo(() => {
    let list = baseFiltrado
    if (filtroEstado === 'activos') {
      // Activos = todo lo que NO esta cerrado
      list = list.filter(t => t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO)
    } else if (filtroEstado !== 'todos') {
      list = list.filter(t => t.estado === filtroEstado)
    }
    return [...list].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [baseFiltrado, filtroEstado])

  // Conteos por estado para los chips de las pestañas.
  const conteos = useMemo(() => {
    const c = { activos: 0, todos: baseFiltrado.length }
    for (const t of baseFiltrado) {
      if (t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO) c.activos++
      c[t.estado] = (c[t.estado] || 0) + 1
    }
    return c
  }, [baseFiltrado])

  // KPIs del encabezado: cuentan sobre la lista FILTRADA (la misma que se ve abajo),
  // para que cambien al aplicar búsqueda/estado/técnico/fecha.
  const stats = useMemo(() => {
    const total = filtered.length
    const comp = filtered.filter(t => t.estado === ESTADOS.COMPLETADO).length
    const pend = filtered.filter(t => t.estado === ESTADOS.PENDIENTE).length
    const prog = filtered.filter(t => t.estado === ESTADOS.EN_PROGRESO).length
    return { total, comp, pend, prog }
  }, [filtered])

  const tecNombre = (id) => TECNICOS.find(t => t.id === parseInt(id))?.nombre || '—'

  const [showFacturarModal, setShowFacturarModal] = useState(null)

  const handleCompletar = async (id) => {
    await actualizarTrabajo(id, { estado: ESTADOS.COMPLETADO })
    notify('Trabajo marcado como completado', 'success')
    // Ofrecer facturar. Se construye el objeto con el estado YA completado (no el
    // snapshot viejo del closure `trabajos`, que aún lo tiene sin completar).
    const t = trabajos.find(x => x.id === id)
    if (t) setShowFacturarModal({ ...t, estado: ESTADOS.COMPLETADO })
  }

  const handleEliminar = async (id) => {
    const t = trabajos.find(x => x.id === id)
    // Las evidencias ya no viajan en la lista: se consultan aquí para poder borrar
    // los videos del bucket. Si la consulta falla solo quedaría un huérfano (no bloquea).
    let evid = t?.evidenciasIngreso || []
    try {
      const remotas = await fetchEvidenciasTrabajo(id)
      if (Array.isArray(remotas) && remotas.length) evid = remotas
    } catch { /* huérfano tolerable */ }
    const videos = evid.filter(e => e?.tipo === 'video')
    // ELIMINAR primero (soft-delete: deleted=true) y LUEGO borrar los videos del
    // bucket: el endpoint solo borra archivos no referenciados por trabajos activos.
    await eliminarTrabajo(id)
    videos.forEach(v => { borrarVideoEvidencia(v) }) // silencioso, no bloquea
    setConfirmDel(null)
    notify('Trabajo eliminado', 'info')
  }

  const imprimirOT = async (t) => {
    const doc = new jsPDF()
    const { MARGIN, CONTENT_W } = PDF_LAYOUT
    const { NAVY, SLATE_300, SLATE_400, SLATE_500, AMBER } = PDF_COLORS
    const logoData = await loadPdfLogo()

    // ============= HEADER (logo real + tildes) =============
    const dateRows = [{ lbl: 'Fecha emisión', val: fmtDate(t.fecha) }]
    if (t.fechaEntrega) dateRows.push({ lbl: 'Entrega', val: fmtDate(t.fechaEntrega) })

    drawHeader(doc, {
      logoData,
      docType: 'ORDEN DE TRABAJO',
      docNumber: t.otCodigo || '—',
      badge: { label: t.estado || 'Pendiente', estado: t.estado || 'Pendiente' },
      dateRows,
    })

    // ============= CLIENTE =============
    let cursorY = 47
    cursorY = drawSectionHeader(doc, 'Cliente', cursorY)
    cursorY = drawDataBlock(doc, [
      { label: 'Nombre', value: t.cliente, bold: true },
      { label: 'Cédula / NIT', value: t.cedula },
      { label: 'Teléfono', value: t.telefonoCliente },
      { label: 'Email', value: t.emailCliente },
    ], cursorY)
    cursorY += 3

    // ============= VEHÍCULO =============
    cursorY = drawSectionHeader(doc, 'Vehículo', cursorY)
    // Próximo cambio de aceite: usa lo registrado, o lo sugiere si ES cambio de
    // aceite (km actual + intervalo: sintético 10.000 · resto 5.000). Se muestra
    // como un dato más del vehículo (no como tarjeta resaltada).
    let proxKm = parseInt(t.proximoKm) || 0
    let proxFechaCorta = ''
    if (t.proximaVisita) {
      const dpv = new Date(t.proximaVisita)
      if (!Number.isNaN(dpv.getTime())) proxFechaCorta = dpv.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })
    }
    if (!proxKm && t.kilometraje) {
      const nombresItems = (t.items || []).map(i => (i.nombre || '').toLowerCase()).join(' ')
      const esCambioAceite = (t.tipoAceite && t.tipoAceite !== 'no_aplica') || nombresItems.includes('aceite')
      if (esCambioAceite) {
        const intervalo = t.tipoAceite === 'sintetico' ? 10000 : 5000
        proxKm = (parseInt(t.kilometraje) || 0) + intervalo
      }
    }
    const proxCambioVal = [proxKm > 0 ? `${proxKm.toLocaleString('es-CO')} km` : '', proxFechaCorta].filter(Boolean).join(' · ')
    const vehFields = [
      { label: 'Placa', value: (t.placa || '').toUpperCase(), bold: true },
      { label: 'Marca', value: t.marca },
      { label: 'Modelo', value: t.modelo },
      { label: 'Año', value: String(t.ano || '—') },
      { label: 'Cilindraje', value: t.cilindraje || '—' },
      { label: 'Kilometraje', value: t.kilometraje ? `${Number(t.kilometraje).toLocaleString('es-CO')} km` : '—' },
      { label: 'Técnico', value: tecNombre(t.tecnicoId) },
    ]
    if (proxCambioVal) vehFields.push({ label: 'Próx. cambio', value: proxCambioVal })
    cursorY = drawDataBlock(doc, vehFields, cursorY)
    cursorY += 3

    // ============= DIAGNÓSTICO =============
    if (t.observaciones) {
      cursorY = drawSectionHeader(doc, 'Diagnóstico inicial · motivo de ingreso', cursorY)
      const obsLines = doc.splitTextToSize(t.observaciones, CONTENT_W - 6)
      const obsHeight = Math.max(11, obsLines.length * 3.8 + 6)
      doc.setDrawColor(...SLATE_300)
      doc.setLineWidth(0.2)
      doc.rect(MARGIN, cursorY, CONTENT_W, obsHeight)
      doc.setFontSize(8)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'normal')
      doc.text(obsLines, MARGIN + 3, cursorY + 4.5)
      cursorY += obsHeight + 3
    }

    // ============= ESTADO DE INGRESO DEL VEHÍCULO =============
    // Registro de responsabilidad: combustible, daños visibles e inventario recibido.
    if (ingresoTieneAlgo(t.ingreso)) {
      const ing = t.ingreso
      const presentes = (ing.inventario || []).map(labelInventario)
      const partes = []
      if (ing.combustible != null) partes.push(`Combustible: ${etiquetaCombustible(ing.combustible)}.`)
      if (ing.estado && ing.estado.trim()) partes.push(`Danos/estado: ${ing.estado.trim()}.`)
      partes.push(`Inventario recibido: ${presentes.length ? presentes.join(', ') : 'ninguno marcado'}.`)
      cursorY = drawSectionHeader(doc, 'Estado de ingreso del vehiculo', cursorY)
      const inLines = doc.splitTextToSize(partes.join('   '), CONTENT_W - 6)
      const inH = Math.max(11, inLines.length * 3.8 + 6)
      doc.setDrawColor(...SLATE_300)
      doc.setLineWidth(0.2)
      doc.rect(MARGIN, cursorY, CONTENT_W, inH)
      doc.setFontSize(8)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'normal')
      doc.text(inLines, MARGIN + 3, cursorY + 4.5)
      cursorY += inH + 3
    }

    // ============= TRABAJOS AUTORIZADOS =============
    if (t.items?.length) {
      cursorY = drawSectionHeader(doc, 'Trabajos autorizados', cursorY)

      const itemSkus = t.items.map(i => i.sku || i.codigo || '')
      const itemRows = t.items.map((i, idx) => [
        String(idx + 1),
        i.nombre || '—',
        fmtCant(i),
        fmt(parseFloat(i.precio) || 0),
        i.iva > 0 ? `${i.iva}%` : '—',
        fmt((parseFloat(i.precio) || 0) * (cantidadItem(i))),
      ])
      const hasSkus = itemSkus.some(s => s)

      autoTable(doc, {
        startY: cursorY,
        head: [['#', 'DESCRIPCIÓN', 'CANT.', 'V. UNIT.', 'IVA', 'TOTAL']],
        body: itemRows,
        ...tableStylesItems,
        styles: { ...tableStylesItems.styles, cellPadding: { top: 3, right: 3, bottom: hasSkus ? 7 : 3, left: 3 } },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8, textColor: SLATE_400 },
          1: { cellWidth: 'auto', fontStyle: 'bold' },
          2: { halign: 'center', cellWidth: 16 },
          3: { halign: 'right', cellWidth: 24 },
          4: { halign: 'center', cellWidth: 14 },
          5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
        },
        margin: { left: MARGIN, right: MARGIN },
        didDrawCell: (data) => {
          if (data.row.section === 'body' && data.column.index === 1) {
            const sku = itemSkus[data.row.index]
            if (sku) {
              doc.setFontSize(6.5)
              doc.setTextColor(...SLATE_400)
              doc.setFont('courier', 'normal')
              doc.text(`Codigo ${sku}`, data.cell.x + 3, data.cell.y + data.cell.height - 2)
              doc.setFont(undefined, 'normal')
            }
          }
        },
      })

      cursorY = doc.lastAutoTable.finalY + 3
      doc.setFontSize(7)
      doc.setTextColor(...SLATE_500)
      doc.setFont(undefined, 'italic')
      doc.text('Cualquier trabajo adicional será autorizado por el cliente antes de su ejecución.', MARGIN, cursorY + 3)
      doc.setFont(undefined, 'normal')
      cursorY += 9

      // ===== Observaciones ingreso (izq, opcional) + Totales (der) =====
      const subtotal = t.subtotalSinIva || 0
      const iva = t.totalIva || 0
      const total = t.total || 0
      // M.O. y repuestos del desglose: calculados desde los items para que SIEMPRE
      // cuadren con el total (OTs viejas no guardaban "repuestos"). La mano de obra
      // mostrada al cliente = solo líneas marcadas Servicio (no la comisión interna).
      let manoObra = 0, repuestos = 0
      ;(t.items || []).forEach(i => {
        const linea = (parseFloat(i.precio) || 0) * (cantidadItem(i))
        if (i.esServicio) manoObra += linea
        else repuestos += linea
      })
      manoObra = Math.round(manoObra)
      repuestos = Math.round(repuestos)

      const obsIngresoReal = t.observacionesIngreso || t.estadoIngreso || ''
      let leftBlockH = 0
      if (obsIngresoReal && obsIngresoReal.trim().length > 0) {
        const lines = doc.splitTextToSize(obsIngresoReal, 100)
        leftBlockH = Math.max(40, lines.length * 4 + 10)
        doc.setDrawColor(...SLATE_300)
        doc.rect(MARGIN, cursorY, 104, leftBlockH)
        doc.setFontSize(7)
        doc.setTextColor(...SLATE_500)
        doc.setFont(undefined, 'bold')
        doc.text('OBSERVACIONES DE INGRESO', MARGIN + 3, cursorY + 4)
        doc.setFontSize(8)
        doc.setTextColor(...NAVY)
        doc.setFont(undefined, 'normal')
        doc.text(lines, MARGIN + 3, cursorY + 9)
      }

      // Caja de totales (usa helper unificado)
      const rows = [
        { lbl: 'Mano de obra', val: fmt(manoObra) },
        { lbl: 'Repuestos', val: fmt(repuestos) },
        { lbl: 'Subtotal', val: fmt(subtotal) },
      ]
      if (iva > 0) rows.push({ lbl: 'IVA (19%)', val: fmt(iva) })
      const boxEndY = drawTotalsBox(doc, {
        y: cursorY, x: 122, w: 74,
        rows,
        finalLabel: 'Total a pagar',
        finalValue: fmt(total),
      })

      cursorY = Math.max(cursorY + leftBlockH, boxEndY) + 8
    }

    // ============= FIRMAS (altura fija para no flotar) =============
    const firmaY = Math.max(cursorY + 16, 250)
    drawSignatures(doc, {
      y: firmaY,
      blocks: [
        { label: 'Recibido por (cliente)', sub: 'Nombre, documento, fecha' },
        { label: 'Técnico responsable', sub: 'Nombre, documento, fecha' },
      ],
    })

    // Firma digital del cliente embebida sobre la línea de "Recibido por (cliente)"
    if (t.firmaCliente) {
      try {
        const blockW = CONTENT_W / 2
        const imgW = blockW - 12
        const imgH = 15
        doc.addImage(t.firmaCliente, 'PNG', MARGIN + 2, firmaY - imgH - 1, imgW, imgH, undefined, 'FAST')
      } catch { /* firma inválida: se ignora */ }
    }

    drawFooter(doc, { page: 1, total: 1, leftText: `${TALLER.razonSocial || TALLER.nombre} · NIT ${TALLER.nit}` })
    doc.save(`${t.otCodigo || 'OT'}.pdf`)
  }

  // El botón llama por aquí, no a imprimirOT directo. Motivo: imprimirOT es
  // async y se invocaba sin atrapar el error, así que si algo fallaba la promesa
  // se rompía en silencio — el usuario apretaba y no pasaba NADA, sin pista
  // alguna de qué había fallado. Ahora cualquier fallo se ve en pantalla.
  const descargarOT = (t) => {
    imprimirOT(t).catch((e) => {
      notify?.(`No se pudo generar el PDF de ${t.otCodigo || 'la OT'}: ${e?.message || e}`, 'error')
    })
  }

  const handleEditar = (id) => {
    setEditId(id)
    setVista('editar')
  }

  if (vista === 'nuevo' || vista === 'editar') {
    const trabajo = vista === 'editar' ? trabajos.find(t => t.id === editId) : null
    return (
      <TrabajoForm
        trabajo={trabajo}
        allTrabajos={trabajos}
        vehiculosHook={vehiculosHook}
        notify={notify}
        onSave={async (dataForm) => {
          // _evidAntes (lista de evidencias del servidor al abrir el form) solo
          // sirve para el diff de videos de aquí abajo: NO debe persistirse.
          const { _evidAntes, ...data } = dataForm
          // Helper: registrar/actualizar cliente y vehiculo en BD local
          // (se ejecuta tanto al crear como al editar)
          const sincronizarClienteVehiculo = () => {
            const placa = (data.placa || '').trim().toUpperCase()
            if (vehiculosHook && placa) {
              vehiculosHook.agregarVehiculo({
                placa,
                marca: data.marca || '',
                modelo: data.modelo || '',
                ano: parseInt(data.ano) || 0,
                cilindraje: data.cilindraje || '',
                cedulaPropietario: data.cedula || '',
              })
            }
            if (clientesHook && data.cedula) {
              clientesHook.guardarCliente({
                cedula: data.cedula,
                nombre: data.cliente || '',
                telefono: data.telefonoCliente || '',
                email: data.emailCliente || '',
              })
              if (placa) clientesHook.vincularVehiculo(data.cedula, placa)
            }
          }

          if (vista === 'editar') {
            // Videos que tenía la OT al abrirla: la lista del servidor (_evidAntes)
            // manda; el estado local ya no trae evidencias en el poll.
            const videosAntes = (_evidAntes ?? [...(trabajo?.evidenciasIngreso || []), ...(trabajo?.evidenciasEntrega || [])]).filter(e => e?.tipo === 'video')
            const urlsAhora = new Set((data.evidenciasIngreso || []).filter(e => e?.tipo === 'video').map(e => e.url))
            // GUARDAR primero (des-referencia el video), LUEGO borrar del bucket: así
            // el endpoint de borrado (que rechaza archivos aún referenciados) no falla.
            await actualizarTrabajo(editId, data)
            videosAntes.forEach(v => { if (!urlsAhora.has(v.url)) borrarVideoEvidencia(v) })
            sincronizarClienteVehiculo()
            notify('Trabajo actualizado', 'success')
          } else {
            // No numerar una OT nueva si aún no sabemos el consecutivo real del
            // servidor (arrancaría en OT-0001 y pisaría códigos existentes).
            if (!puedeCrearOT()) { notify('Sin conexión con el servidor: no se puede numerar la OT todavía. Reintenta en un momento.', 'error'); return }
            await agregarTrabajo(data)
            sincronizarClienteVehiculo()
            notify('Trabajo creado', 'success')
          }
          setVista('lista')
          setEditId(null)
        }}
        onCancel={() => { setVista('lista'); setEditId(null) }}
      />
    )
  }

  const estadoBadge = (estado) => {
    if (estado === ESTADOS.COMPLETADO) return 'badge-s'
    if (estado === ESTADOS.CANCELADO) return 'badge-d'
    if (estado === ESTADOS.EN_PROGRESO || estado === ESTADOS.EN_PRUEBA) return 'badge-i'
    if (estado === ESTADOS.PENDIENTE || estado === ESTADOS.ESPERANDO_REPUESTOS) return 'badge-w'
    if (estado === ESTADOS.EN_DIAGNOSTICO || estado === ESTADOS.PROGRAMADO) return 'badge-n'
    return 'badge-w'
  }

  const tecIniciales = (id) => {
    const nombre = tecNombre(id)
    if (nombre === '—') return '?'
    const parts = nombre.split(' ')
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : nombre.slice(0, 2).toUpperCase()
  }

  const statesTabs = [
    ['activos', 'Activos'],
    [ESTADOS.PENDIENTE, 'Pendientes'],
    [ESTADOS.EN_DIAGNOSTICO, 'Diagnóstico'],
    [ESTADOS.EN_PROGRESO, 'En Progreso'],
    [ESTADOS.ESPERANDO_REPUESTOS, 'Esperando Rep.'],
    [ESTADOS.EN_PRUEBA, 'En Prueba'],
    [ESTADOS.COMPLETADO, 'Completados'],
    [ESTADOS.CANCELADO, 'Cancelados'],
    ['todos', 'Todas'],
  ]

  // Tarjeta del tablero. En el celular recibe la columna siguiente y saca el
  // boton "Pasar a <estado>": ahi no se arrastra, se toca el paso que sigue.
  const kbCard = (t, siguiente) => {
    const dias = diasQuieta(t)
    const alerta = tonoAntiguedad(t, dias)
    return (
      <div key={t.id} className="kb-card" draggable={!siguiente}
        onDragStart={() => { dragIdRef.current = t.id }}
        onDragEnd={() => { dragIdRef.current = null; setDragOverCol(null) }}
        onClick={() => setPreviewId(t.id)}>
        <div className="kb-card__top">
          <span className={`kb-card__placa${t.placa ? '' : ' sin'}`}>{t.placa || 'SERVICIO'}</span>
          {alerta && <span className="kb-card__alert" style={{ background: alerta }} title={`${dias} días sin moverse`} />}
        </div>
        <div className="kb-card__cli">{t.cliente || 'Sin cliente'}</div>
        <div className="kb-card__veh">{[t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || (t.placa ? 'Ficha incompleta' : 'Servicio sin vehículo')}</div>
        <div className="kb-card__foot">
          <span className={`av av-${(parseInt(t.tecnicoId) || 1) % 5 + 1}`} title={tecNombre(t.tecnicoId)}>{tecIniciales(t.tecnicoId)}</span>
          {/* El codigo de OT no cabe arriba (ahi manda la placa) pero no se
              pierde: acompaña a los dias, que es como se nombra la orden. */}
          <span className="kb-card__dias" title={t.otCodigo || ''}>{dias === 0 ? 'hoy' : dias === 1 ? '1 día aquí' : `${dias} días aquí`}</span>
          <span className="kb-card__total">{fmt(t.total)}</span>
        </div>
        {siguiente && (
          <div className="kb-mover" onClick={e => e.stopPropagation()}>
            <button type="button" className="kb-mover__go" onClick={() => moverEstado(t.id, siguiente.estado)}>
              Pasar a {siguiente.estado}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button type="button" className="kb-mover__mas" aria-label={`Editar ${t.otCodigo || t.placa || 'OT'}`} onClick={() => handleEditar(t.id)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
            </button>
          </div>
        )}
      </div>
    )
  }

  const selTrabajo = trabajos.find(t => t.id === selId) || null

  // Solo la lista (o su vacio) se estira a la altura de la ventana: el kanban
  // scrollea a lo alto y con altura fija se recortaria.
  const fillAlto = isWide

  return (
    <div className={`trab-page${fillAlto ? ' trab-page--fill' : ''}`}>
      <style>{CSS_TRABAJOS}</style>
      {/* Barra de titulo del handoff: los cuatro contadores que eran tarjetas
          KPI bajan a linea de apoyo, y la accion queda a la derecha. Ocupaban
          una franja entera para cuatro numeros que casi siempre son cero. */}
      <div className="hd-head">
        <div className="hd-head__t">
          {/* El subtitulo existe en App.jsx pero el topbar de escritorio lo
              esconde (opacity:0), asi que aqui nunca se veia. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1>Órdenes de trabajo</h1>
            <span style={{ fontSize: 12, lineHeight: 1, color: 'var(--text-4)' }}>Gestión de órdenes de trabajo</span>
          </div>
          {/* En el celular los cuatro rotulos completos caian en tres lineas.
              El mockup los abrevia para que entren en una: se pintan los dos
              y el CSS elige, en vez de medir el ancho en JS. */}
          <div className="hd-head__sub hd-cnts" style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
            {[
              ['En vista', 'En vista', stats.total, 'var(--text)'],
              ['Completados', 'Compl.', stats.comp, 'var(--ok-fg)'],
              ['Pendientes', 'Pend.', stats.pend, 'var(--text-3)'],
              ['En progreso', 'En progreso', stats.prog, 'var(--text-3)'],
            ].map(([l, corto, v, c], i) => (
              <Fragment key={l}>
                {/* Un solo divisor: separa "cuantas veo" de "como estan" */}
                {i === 1 && <span style={{ width: 1, height: 12, background: 'var(--border-strong)' }} />}
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--text-4)' }}>
                    <span className="hd-cnt--largo">{l}</span><span className="hd-cnt--corto">{corto}</span>
                  </span>
                  <span className="hd-n" style={{ fontSize: 15, fontWeight: 700, color: v === 0 ? 'var(--text-4)' : c }}>{v}</span>
                </span>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-seg">
            <button type="button" className={`hd-seg__i${vista === 'lista' ? ' on' : ''}`} onClick={() => setVista('lista')}>Lista</button>
            <button type="button" className={`hd-seg__i${vista === 'kanban' ? ' on' : ''}`} onClick={() => setVista('kanban')}>Tablero</button>
          </div>
          {/* Cancelado no es columna: es lo excepcional. Baja a pastilla con su
              contador — visible y tocable, no escondido. */}
          {vista === 'kanban' && conteos[ESTADOS.CANCELADO] > 0 && (
            <button type="button" className="trab-cancel"
              onClick={() => { setVista('lista'); setFiltroEstado(ESTADOS.CANCELADO); setFiltroFecha('todas') }}>
              Cancelados<span>{conteos[ESTADOS.CANCELADO]}</span>
            </button>
          )}
          <Button variant="primary" className="trab-new" onClick={() => setVista('nuevo')}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}>Nueva OT</Button>
        </div>
      </div>

      {/* Las 9 pestañas de estado, cada una con su contador. En el tablero
          sobran: las columnas SON los estados. */}
      {vista !== 'kanban' && (
      <div className="hd-tabs" style={{ marginTop: 12 }}>
        {statesTabs.map(([key, label]) => (
          <button key={key} type="button" className={`hd-tab${filtroEstado === key ? ' on' : ''}`} onClick={() => setFiltroEstado(key)}>
            {label}{conteos[key] ? <span className="hd-tab__n">{conteos[key]}</span> : null}
          </button>
        ))}
      </div>
      )}

      {/* Filtros: rango de fecha, busqueda y tecnico en una sola fila */}
      <div className="hd-bar" style={{ padding: '0 4px 10px' }}>
        {vista !== 'kanban' && (
          <div className="hd-seg">
            {[['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['todas', 'Todas']].map(([k, l]) => (
              <button key={k} type="button" className={`hd-seg__i${filtroFecha === k ? ' on' : ''}`} onClick={() => setFiltroFecha(k)}>{l}</button>
            ))}
          </div>
        )}
        <label className="hd-find" style={{ width: 260 }}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input placeholder="Buscar placa, cliente, OT..." value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} />
        </label>
        {/* Chevron propio (13px) en vez del del sistema: el mockup lo dibuja
            gris y alineado al borde derecho de un campo de 190px. */}
        <span className="trab-drop">
          <select className="hd-drop" value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}>
            <option value="todos">Todos los técnicos</option>
            {TECNICOS.map(t => <option key={t.id} value={t.id}>{t.nombre}{t.activo === false ? ' (inactivo)' : ''}</option>)}
          </select>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </span>
        {filtroTecnico !== 'todos' && filtered.length > 0 && (
          <Button variant="outline" size="sm" title="Un PDF con la ficha de cada OT de este técnico (sin precios)"
            onClick={() => {
              const nom = (TECNICOS.find(x => String(x.id) === filtroTecnico)?.nombre || 'tecnico').split(' ')[0]
              exportarFichasTecnico(filtered, tecNombre, `fichas_${nom}.pdf`)
            }}>Imprimir fichas ({filtered.length})</Button>
        )}
        <div className="hd-bar__sp" />
        <span className="hd-bar__n"><b style={{ color: 'var(--text)', fontWeight: 700 }}>{filtered.length}</b> trabajos</span>
      </div>

      {/* Tablero. Las columnas SON el filtro de estado, asi que se alimenta de
          baseFiltrado (tecnico + busqueda) y no de filtered: con el filtro por
          defecto ("Activos") la columna Completado salia siempre vacia. */}
      {vista === 'kanban' ? (isPhone ? (() => {
        const idx = Math.max(0, KCOLS.findIndex(c => c.estado === kCol))
        const col = KCOLS[idx]
        const cards = baseFiltrado.filter(t => t.estado === col.estado)
        const prev = KCOLS[idx - 1], next = KCOLS[idx + 1]
        return (
          <div className="kb-uno">
            <div className="kb-chips">
              {KCOLS.map(c => (
                <button key={c.estado} type="button"
                  className={`kb-chip kb-col--${c.tono}${c.estado === col.estado ? ' on' : ''}`}
                  onClick={() => setKCol(c.estado)}>
                  <span className="kb-col__dot" />{c.corto}
                  <span className="kb-chip__n">{baseFiltrado.filter(t => t.estado === c.estado).length}</span>
                </button>
              ))}
            </div>
            <div className="kb-uno__h">
              <span className="kb-uno__t">{col.estado}</span>
              <span className="kb-uno__s">{cards.length} OT · {fmt(cards.reduce((a, t) => a + (t.total || 0), 0))}</span>
            </div>
            <div className="kb-uno__b">
              {cards.map(t => kbCard(t, next))}
              {cards.length === 0 && <div className="kb-void">Sin trabajos aquí</div>}
            </div>
            {/* Navegacion por nombre, no por flecha muda: se sabe a donde se va. */}
            <div className="kb-nav">
              <button type="button" disabled={!prev} onClick={() => prev && setKCol(prev.estado)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                {prev ? prev.corto : ''}
              </button>
              <button type="button" disabled={!next} onClick={() => next && setKCol(next.estado)}>
                {next ? next.corto : ''}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
          </div>
        )
      })() : (
        <div className="kb">
          {KCOLS.map(c => {
            const cards = baseFiltrado.filter(t => t.estado === c.estado)
            const abierta = kbAbiertas.includes(c.estado)
            const visibles = abierta ? cards : cards.slice(0, KB_TOPE)
            const resto = cards.length - visibles.length
            return (
              <div key={c.estado} className={`kb-col kb-col--${c.tono}${dragOverCol === c.estado ? ' drop' : ''}`}
                onDragOver={e => { e.preventDefault(); if (dragOverCol !== c.estado) setDragOverCol(c.estado) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(x => (x === c.estado ? null : x)) }}
                onDrop={e => { e.preventDefault(); dropEnColumna(c.estado) }}>
                <div className="kb-col__h">
                  <div className="kb-col__r">
                    <span className="kb-col__dot" />
                    <span className="kb-col__t" title={c.estado}>{c.rotulo}</span>
                    <span className="kb-col__n">{cards.length}</span>
                  </div>
                  {/* La plata de la columna: cuanto vale lo que esta parado ahi. */}
                  <div className="kb-col__money">{fmt(cards.reduce((a, t) => a + (t.total || 0), 0))}</div>
                </div>
                <div className="kb-col__b">
                  {visibles.map(t => kbCard(t))}
                  {resto > 0 && (
                    <button type="button" className="kb-more" onClick={() => setKbAbiertas(v => [...v, c.estado])}>{resto} más</button>
                  )}
                  {cards.length === 0 && <div className="kb-void">Sin trabajos</div>}
                </div>
              </div>
            )
          })}
        </div>
      )
      ) : filtered.length === 0 ? (
        /* Estado vacio del handoff: etiqueta seca, sin ilustracion. Los dos
           textos siguen ahi, solo pierden el icono de 40px. */
        <div className="hd-void">
          <p className="hd-void__t" style={{ margin: 0 }}>{trabajos.length === 0 ? 'No hay trabajos registrados' : 'No hay trabajos con estos filtros'}</p>
          {/* EXCEPCION DELIBERADA a la regla del handoff ("los vacios son
              etiquetas secas, sin texto explicativo"). Aqui no es un vacio:
              la vista abre en Activos + Hoy, asi que un taller con 163
              trabajos ve 0 y parece que se borraron. La linea dice por que.
              Decidido por el dueño el 2026-08-20. No quitarla citando la
              regla general: esta es la excepcion que el aprobo. */}
          <p className="hd-void__s" style={{ margin: 0 }}>{trabajos.length === 0 ? 'Crea una nueva OT para comenzar.' : 'Prueba cambiar el filtro de fecha (Hoy / Semana / Todas) o el estado.'}</p>
        </div>
      ) : isWide ? (
        <div className="trab-cockpit">
          <div className="hd-card hd-card--grow trab-cockpit__list" style={{ padding: 0 }}>
            <div className="hd-tbl">
              <div className="hd-tbl__h">
                <span style={{ width: 96 }}>PLACA · OT</span>
                <span style={{ flex: 1, minWidth: 0 }}>CLIENTE · VEHÍCULO</span>
                <span style={{ width: 116 }}>TÉCNICO</span>
                <span style={{ width: 104 }}>ESTADO</span>
                <span style={{ width: 104 }}>COBRO</span>
                <span style={{ width: 98, textAlign: 'right' }}>TOTAL</span>
                <span style={{ width: 84, textAlign: 'right' }}>FECHA</span>
                <span style={{ width: 84 }} />
              </div>
              <div className="hd-tbl__b">
                {(() => { let bloqueAnterior = null; return filtered.map((t) => {
                  const bloque = bloqueFecha(t.fecha)
                  const abreBloque = bloque !== bloqueAnterior
                  bloqueAnterior = bloque
                  const dias = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
                  const estancado = t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO && dias >= DIAS_ESTANCADO
                  const cob = estadoCobro(t)
                  return (
                    /* La cebra pasa a CSS (:nth-child(even)): en linea pisaba el
                       hover y el resaltado de fila seleccionada, y el blanco fijo
                       se colaba en modo oscuro. */
                    <Fragment key={t.id}>
                    {abreBloque && <div className="hd-grp">{bloque}</div>}
                    <div className={`hd-row hd-row--ot${t.id === selId ? ' on' : ''}`}
                      style={{ height: 40 }}
                      onClick={() => setSelId(t.id)}>
                      {/* La placa manda: es por lo que se reconoce una OT. Cuando el
                          servicio no entra carro se dice SERVICIO, no se deja vacio. */}
                      <div style={{ width: 96, minWidth: 0 }}>
                        <div className="hd-plate" style={{ fontSize: 12.5, color: t.placa ? 'var(--text)' : 'var(--text-4)', letterSpacing: t.placa ? '.3px' : 0 }}>
                          {t.placa || 'SERVICIO'}
                        </div>
                        <div className="hd-sub">{t.otCodigo || '—'}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                        <div className="hd-clip" style={{ fontSize: 12.5, lineHeight: 1.15, fontWeight: 700, color: 'var(--text)' }}>{t.cliente || '—'}</div>
                        <div className="hd-clip hd-sub" style={{ fontSize: 10.5 }}>{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</div>
                      </div>
                      {/* av-1..av-4: cuatro pares como el mockup. El quinto era
                          rojo y un tecnico no es una alarma. */}
                      <div style={{ width: 116, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span className={`hd-av av av-${(parseInt(t.tecnicoId) || 1) % 4 + 1}`}>{tecIniciales(t.tecnicoId)}</span>
                        <span className="hd-clip" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{tecNombre(t.tecnicoId)}</span>
                      </div>
                      {/* 104 y no 92: con 'ESPERANDO REPUESTOS' o 'SIN ITEMS PARA
                          FACTURAR' en mayusculas la pastilla desbordaba la celda. */}
                      <div style={{ width: 104, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        <span className={`hd-chip hd-chip--${chipEstado(t.estado)} hd-clip`} title={t.estado}>{t.estado}</span>
                        {estancado && <span className="hd-chip hd-chip--bad" style={{ flex: 'none' }}>{dias}d</span>}
                      </div>
                      <div style={{ width: 104, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                        {cob ? <span className={`hd-chip hd-chip--${chipTono(cob.tone)} hd-clip`} title={cob.label}>{cob.label}</span> : <span className="hd-empty" style={{ fontSize: 12 }}>—</span>}
                      </div>
                      <div className="hd-n hd-strong" style={{ width: 98 }}>{fmt(t.total)}</div>
                      {/* 84px y no 74: el mockup abrevia el año a 2 digitos
                          ("15 ago 26") pero el README manda dd mmm yyyy, y con 74
                          "15 ago 2026" se cortaba contra los iconos de accion. */}
                      <div className="hd-n" style={{ width: 84, fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(t.fecha)}</div>
                      {/* Editar, PDF y eliminar por fila. Al reescribir esta tabla
                          se quedaron fuera: desde la lista no se podia hacer nada
                          con una OT sin abrirla, y el mockup si las trae. */}
                      <div style={{ width: 84, display: 'flex', justifyContent: 'flex-end', gap: 2 }}
                        onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="btn-icon" aria-label={`Editar ${t.otCodigo || t.placa || 'OT'}`} title="Editar"
                          onClick={() => handleEditar(t.id)}><IconEdit /></Button>
                        {t.otCodigo && (
                          <Button variant="ghost" size="sm" className="btn-icon" aria-label={`Descargar PDF de ${t.otCodigo}`} title="Descargar PDF"
                            onClick={() => descargarOT(t)}><IconPdf /></Button>
                        )}
                        <Button variant="ghost" size="sm" className="btn-icon" aria-label={`Eliminar ${t.otCodigo || t.placa || 'OT'}`} title="Eliminar"
                          style={{ color: 'var(--bad-fg)' }}
                          onClick={() => setConfirmDel(t.id)}><IconTrash /></Button>
                      </div>
                    </div>
                    </Fragment>
                  )
                }) })()}
              </div>
              <div className="hd-tbl__f">
                <span>{filtered.length} de {trabajos.length} trabajos</span>
                <span className="hd-bar__sp" />
                <span>Total en vista</span>
                <b>{fmt(filtered.reduce((a, t) => a + (Number(t.total) || 0), 0))}</b>
              </div>
            </div>
          </div>
          <aside className="trab-cockpit__detail">
            {selTrabajo ? (
              <div className="trab-detail">
                <div className="trab-detail__h"><i /><span>Detalle</span></div>
                <div className="trab-detail__ot">
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>{selTrabajo.otCodigo || '—'} · {selTrabajo.placa}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{selTrabajo.cliente || 'Sin cliente'} · {[selTrabajo.marca, selTrabajo.modelo].filter(Boolean).join(' ') || '—'}</span>
                </div>
                <div className="trab-detail__div" />
                <div className="trab-detail__b">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge ${estadoBadge(selTrabajo.estado)}`}>{selTrabajo.estado}</span>
                    {(() => { const c = estadoCobro(selTrabajo); return c ? <Badge tone={c.tone}>{c.label}</Badge> : null })()}
                    <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtDate(selTrabajo.fecha)}</span>
                  </div>
                  {selTrabajo.cuenttiTransacionId && selTrabajo.cuenttiTransacionId !== SIN_FACTURA && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      Factura <span className="mono" style={{ color: 'var(--text)' }}>{selTrabajo.cuenttiTransacionId}</span>
                      {selTrabajo.facturadoEn && ` · ${fmtDate(selTrabajo.facturadoEn)}`}
                    </div>
                  )}

                  {selTrabajo.telefonoCliente && (() => {
                    const tel = String(selTrabajo.telefonoCliente).replace(/\D/g, '')
                    const wa = tel.length === 10 ? `57${tel}` : tel
                    return (
                      <div className="ck-d-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selTrabajo.cliente || 'Cliente'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{fmtTelefono(selTrabajo.telefonoCliente)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <a href={`tel:${tel}`} className="btn btn-outline btn-sm btn-icon" aria-label="Llamar" title="Llamar" style={{ height: 32, width: 32 }}><IconPhone /></a>
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-icon" aria-label="WhatsApp" title="WhatsApp" style={{ height: 32, width: 32, background: 'var(--green-600)', color: '#fff' }}><IconChat /></a>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="ck-d-grid">
                    <div className="ck-d-cell"><div className="l">Técnico</div><div className="v">{tecNombre(selTrabajo.tecnicoId)}</div></div>
                    <div className="ck-d-cell"><div className="l">Total</div><div className="v">{fmt(selTrabajo.total)}</div></div>
                  </div>

                  {selTrabajo.estado !== ESTADOS.COMPLETADO && selTrabajo.estado !== ESTADOS.CANCELADO && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Cambiar estado</div>
                      <div className="segctl segctl--full">
                        {[
                          [ESTADOS.PENDIENTE, 'Pendiente'],
                          [ESTADOS.EN_DIAGNOSTICO, 'Diagnóstico'],
                          [ESTADOS.EN_PROGRESO, 'En progreso'],
                          [ESTADOS.ESPERANDO_REPUESTOS, 'Esperando rep.'],
                          [ESTADOS.EN_PRUEBA, 'En prueba'],
                        ].map(([k, l]) => (
                          <button key={k} type="button" className={selTrabajo.estado === k ? 'on' : ''}
                            onClick={() => { if (selTrabajo.estado !== k) { actualizarTrabajo(selTrabajo.id, { estado: k }); notify?.(`OT ${selTrabajo.otCodigo || ''} → ${l}`, 'info') } }}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(selTrabajo.items || []).length > 0 && (
                    <div className="ck-d-cell">
                      <div className="l" style={{ marginBottom: 6 }}>Ítems</div>
                      {(selTrabajo.items || []).slice(0, 8).map((it, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
                          <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre || 'Ítem'}</span>
                          <span className="mono" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{fmt((parseFloat(it.precio) || 0) * (cantidadItem(it)))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Puente al cobro: sin esto había que ir a "Cuentti" a mano y
                      buscar la OT en un selector, y nadie sabía que ahí se cobra. */}
                  {onAutoFacturar && estadoCobro(selTrabajo)?.porCobrar && (
                    <Button variant="primary" style={{ width: '100%' }}
                      onClick={() => { onAutoFacturar(selTrabajo) }}>
                      Cobrar {fmt(selTrabajo.total)}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => setFichaId(selTrabajo.id)}>Ficha del técnico</Button>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="outline" size="sm" className="btn-icon" aria-label="Editar" title="Editar" onClick={() => handleEditar(selTrabajo.id)}><IconEdit /></Button>
                    {selTrabajo.otCodigo && <Button variant="outline" size="sm" className="btn-icon" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => descargarOT(selTrabajo)}><IconPdf /></Button>}
                    {selTrabajo.estado !== ESTADOS.COMPLETADO && <Button variant="primary" size="sm" className="btn-icon" aria-label="Marcar listo" title="Marcar listo" onClick={() => handleCompletar(selTrabajo.id)}><IconCheck /></Button>}
                    <Button variant="ghost" size="sm" className="btn-icon" aria-label="Eliminar" title="Eliminar" style={{ color: 'var(--red-600)' }} onClick={() => setConfirmCfg({ title: 'Eliminar OT', lead: `${selTrabajo.otCodigo || 'Sin OT'} · ${selTrabajo.placa || 'SERVICIO'} · ${fmt(selTrabajo.total)} · no se puede deshacer.`, confirmLabel: 'Eliminar', tone: 'danger', onConfirm: () => handleEliminar(selTrabajo.id) })}><IconTrash /></Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Rail en reposo del mockup: titulo con barra de acento, la frase
                 seca y el bloque FILTRO ACTIVO. Las pastillas leen los filtros
                 reales de la pantalla; no hay nada fijo del mockup. */
              <div className="trab-detail">
                <div className="trab-detail__h"><i /><span>Detalle</span></div>
                <p className="trab-detail__p">Sin trabajo seleccionado. Toca una fila de la lista para verla aquí.</p>
                <div className="trab-detail__div" />
                <div className="trab-detail__l">Filtro activo</div>
                <div className="trab-detail__chips">
                  <span className="trab-fchip trab-fchip--on">{(statesTabs.find(([k]) => k === filtroEstado)?.[1]) || 'Todas'} · {filtered.length}</span>
                  <span className="trab-fchip">Rango: {({ hoy: 'Hoy', semana: 'Semana', mes: 'Mes', todas: 'Todas' })[filtroFecha] || 'Todas'}</span>
                  <span className="trab-fchip">{filtroTecnico === 'todos' ? 'Todos los técnicos' : tecNombre(filtroTecnico)}</span>
                  {filtroBusqueda.trim() && <span className="trab-fchip">Busca: {filtroBusqueda.trim()}</span>}
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="card__h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards tbl-cards--ot">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>OT</th>
                  <th>Cliente</th>
                  <th>Vehículo</th>
                  <th>Técnico</th>
                  <th>Estado</th>
                  <th className="c-right">Total</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(() => { let bloqueAnterior = null; return filtered.map(t => {
                  const bloque = bloqueFecha(t.fecha)
                  const abreBloque = bloque !== bloqueAnterior
                  bloqueAnterior = bloque
                  const bc = estadoBadge(t.estado)
                  const diasSinMover = t.fecha ? Math.floor((Date.now() - new Date(t.fecha).getTime()) / 86400000) : 0
                  const estancado = t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO && diasSinMover >= DIAS_ESTANCADO
                  return (
                    <Fragment key={t.id}>
                    {abreBloque && <tr className="tbl-grp"><td colSpan={9}>{bloque}</td></tr>}
                    <tr style={estancado ? { background: 'rgba(220,38,38,.06)', boxShadow: 'inset 0 0 0 1px rgba(220,38,38,.18)' } : {}}>
                      <td className="c-mono td-placa" data-label="Placa" style={{ fontWeight: 700 }}>{t.placa || 'SERVICIO'}</td>
                      <td className="c-mono td-ot" data-label="OT" style={{ color: 'var(--blue-600)', fontWeight: 700 }}>{t.otCodigo || '—'}</td>
                      <td className="c-name">{t.cliente || '—'}</td>
                      <td className="c-muted" data-label="Vehículo">{[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td data-label="Técnico">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span className={`av av-${(parseInt(t.tecnicoId) || 1) % 4 + 1}`} style={{ width: 26, height: 26, fontSize: 10 }}>{tecIniciales(t.tecnicoId)}</span>
                          <span style={{ fontSize: 12.5 }}>{tecNombre(t.tecnicoId)}</span>
                        </div>
                      </td>
                      <td data-label="Estado">
                        <span className={`badge ${bc}`}>{t.estado}</span>
                        {estancado && <Badge tone="d" style={{ marginLeft: 4, fontSize: 10 }}>{diasSinMover}d</Badge>}
                        {/* En celular esta tabla ES la ficha: sin este badge no hay
                            dónde ver si a la OT ya se le cobró. */}
                        {(() => { const c = estadoCobro(t); return c ? <Badge tone={c.tone} style={{ marginLeft: 4, fontSize: 10 }}>{c.label}</Badge> : null })()}
                      </td>
                      <td className="c-mono c-right" data-label="Total" style={{ fontWeight: 700 }}>{fmt(t.total)}</td>
                      <td className="c-mono c-muted" data-label="Fecha" style={{ fontSize: 12 }}>{fmtDate(t.fecha)}</td>
                      <td className="c-right td-actions">
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          <Button variant="ghost" size="sm" className="btn-icon" aria-label="Editar" title="Editar" onClick={() => handleEditar(t.id)}><IconEdit /></Button>
                          {t.otCodigo && <Button variant="ghost" size="sm" className="btn-icon" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => descargarOT(t)}><IconPdf /></Button>}
                          {t.estado !== ESTADOS.COMPLETADO && (
                            <Button variant="ghost" size="sm" aria-label="Marcar completado" style={{ color: 'var(--green-600)' }} onClick={() => handleCompletar(t.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></Button>
                          )}
                          {onAutoFacturar && estadoCobro(t)?.porCobrar && (
                            <Button variant="primary" size="sm" title="Facturar y cobrar en Cuentti"
                              onClick={() => { onAutoFacturar(t) }}>Cobrar</Button>
                          )}
                          {confirmDel === t.id ? (
                            <>
                              {/* "Si"/"No" no decian que se borra, y "Si" iba sin tilde,
                                  que es la palabra contraria. Se usan los dos verbos del
                                  ConfirmDialog de escritorio: el mismo borrado no puede
                                  confirmarse con dos gramaticas segun el ancho. */}
                              <Button variant="ghost" size="sm" style={{ color: 'var(--red-600)' }} onClick={() => handleEliminar(t.id)}>Eliminar</Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Cancelar</Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="sm" style={{ color: 'var(--red-500)' }} onClick={() => setConfirmDel(t.id)}>
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  )
                }) })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista previa de una OT (al hacer clic) — antes de saltar a editar */}
      {/* Detalle de una OT ya guardada. Las siete acciones pesaban lo mismo:
          ahora son tres niveles — "Ir a Facturar" con el monto adentro (es la
          que mueve plata), luego las de 42px, y el descarte como texto. */}
      {previewId && (() => {
        const t = trabajos.find(x => x.id === previewId)
        if (!t) return null
        const tel = String(t.telefonoCliente || '').replace(/\D/g, '')
        const wa = tel.length === 10 ? `57${tel}` : tel
        const cob = estadoCobro(t)
        const completado = t.estado === ESTADOS.COMPLETADO
        const porCobrar = !!onAutoFacturar && !!cob?.porCobrar
        const comision = comisionTecnico(t)
        const items = t.items || []
        const cerrar = () => { setPreviewId(null); setFirmando(false) }
        return (
          <div className="modal-overlay" onClick={cerrar}>
            <div className="modal otd" onClick={e => e.stopPropagation()}>

              {/* Franja de estado: lo primero que se lee, y explica por que el
                  boton azul dice Facturar. Antes era un bloque suelto abajo. */}
              <div className={`otd__franja otd__franja--${chipEstado(t.estado)}`}>
                {completado
                  ? <IconCheck />
                  : <span className="otd__franja-dot" />}
                <span className="otd__franja-txt">
                  {completado
                    ? `Trabajo completado el ${fmtDate(t.fecha)}${porCobrar ? ' · listo para facturar' : ''}`
                    : `${t.estado} · ingresó ${fmtDate(t.fecha)}`}
                </span>
                <button type="button" className="otd__x" onClick={cerrar} aria-label="Cerrar"><IconX /></button>
              </div>

              <div className="otd__head">
                <div className="otd__id">
                  <div className="otd__idr">
                    {/* La placa manda: es por lo que se reconoce el registro. */}
                    <span className={`otd__placa${t.placa ? '' : ' sin'}`}>{t.placa || 'SERVICIO'}</span>
                    <span className="otd__ot">{t.otCodigo || '—'}</span>
                  </div>
                  <div className="otd__cli">{t.cliente || 'Sin cliente'}</div>
                  <div className="otd__veh">
                    {[t.marca, t.modelo, t.ano].filter(Boolean).join(' ') || 'Sin ficha'} · ingresó {fmtDate(t.fecha)}
                  </div>
                </div>
                <div className="otd__chips">
                  <span className={`hd-chip hd-chip--${chipEstado(t.estado)}`}>{t.estado}</span>
                  {cob && <span className={`hd-chip hd-chip--${chipTono(cob.tone)}`}>{cob.label}</span>}
                </div>
              </div>

              <div className="otd__body">
                {/* La factura de Cuentti y el telefono no estan en el mockup pero
                    si en la app: no se pierden, bajan a linea de apoyo. */}
                {t.cuenttiTransacionId && t.cuenttiTransacionId !== SIN_FACTURA && (
                  <div className="otd__factura">
                    Factura <span className="mono">{t.cuenttiTransacionId}</span>
                    {t.facturadoEn && ` · ${fmtDate(t.facturadoEn)}`}
                  </div>
                )}

                {items.length > 0 && (
                  <>
                    <div className="otd__rot">
                      <span>ÍTEMS DEL TRABAJO</span>
                      <span className="otd__n">{items.length}</span>
                    </div>
                    <div className="otd__items">
                      {items.map((it, i) => {
                        const cant = cantidadItem(it)
                        const precio = parseFloat(it.precio) || 0
                        return (
                          <div key={i} className="otd__item">
                            <span className="otd__item-n">{it.nombre || 'Ítem'}</span>
                            <span className="otd__item-d">
                              {esServicioItem(it) ? 'Mano de obra' : `Repuesto · ${fmtCant(cant)} × ${fmt(precio)}`}
                            </span>
                            <span className="otd__item-v">{fmt(precio * cant)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <div className="otd__total">
                  <span>Total</span>
                  <span className="otd__total-v">{fmt(t.total)}</span>
                </div>

                <div className="otd__tec">
                  <span className={`hd-av av av-${(parseInt(t.tecnicoId) || 1) % 5 + 1}`}>{tecIniciales(t.tecnicoId)}</span>
                  <span className="otd__tec-b">
                    <span className="otd__tec-n">{tecNombre(t.tecnicoId)}</span>
                    <span className="otd__tec-s">Técnico{comision > 0 ? ` · comisión ${fmt(comision)}` : ''}</span>
                  </span>
                  {!t.firmaCliente && !firmando && <span className="hd-chip hd-chip--warn">SIN FIRMA DEL CLIENTE</span>}
                </div>

                {tel && (
                  <div className="otd__tel">
                    <span className="otd__tel-n">{fmtTelefono(t.telefonoCliente)}</span>
                    <a href={`tel:${tel}`} className="otd__tel-b" aria-label="Llamar al cliente"><IconPhone /></a>
                  </div>
                )}

                {/* Firma del cliente: se abre solo cuando se va a firmar. */}
                {firmando ? (
                  <div className="otd__firma">
                    <SignaturePad initial={t.firmaCliente}
                      onSave={async (dataUrl) => { await actualizarTrabajo(t.id, { firmaCliente: dataUrl }); setFirmando(false); notify('Firma guardada', 'success') }}
                      onCancel={() => setFirmando(false)} />
                  </div>
                ) : t.firmaCliente ? (
                  <div className="otd__firma">
                    <div className="otd__rot"><span>FIRMA DEL CLIENTE</span></div>
                    <img src={t.firmaCliente} alt="Firma del cliente" className="otd__firma-img" />
                  </div>
                ) : null}
              </div>

              <div className="otd__acc">
                {porCobrar ? (
                  <button type="button" className="otd__go" onClick={() => { setPreviewId(null); onAutoFacturar(t) }}>
                    <IconPdf />Ir a Facturar · {fmt(t.total)}
                  </button>
                ) : !completado ? (
                  <button type="button" className="otd__go" onClick={() => { handleCompletar(t.id); setPreviewId(null) }}>
                    <IconCheck />Marcar listo
                  </button>
                ) : null}

                <div className="otd__acc2">
                  {!t.firmaCliente && (
                    <button type="button" className="otd__b" onClick={() => setFirmando(true)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 17s2-4 5-4 4 2 6 2 3-2 3-4-2-3-3-2-1 5 1 8 4 2 6 1" /></svg>
                      Firmar recibido
                    </button>
                  )}
                  {tel && (
                    <a className="otd__b" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                      <IconChat />WhatsApp
                    </a>
                  )}
                  <button type="button" className="otd__b otd__b--chip" onClick={() => { setPreviewId(null); handleEditar(t.id) }}>
                    <IconEdit />Editar
                  </button>
                </div>

                {/* Tercer nivel: texto. Un descarte nunca es un boton. */}
                <div className="otd__acc3">
                  {completado && porCobrar && (
                    <button type="button" className="otd__t" onClick={() => { handleCompletar(t.id); setPreviewId(null) }}>Marcar listo</button>
                  )}
                  {t.firmaCliente && <button type="button" className="otd__t" onClick={() => setFirmando(true)}>Firmar de nuevo</button>}
                  {t.otCodigo && <button type="button" className="otd__t" onClick={() => descargarOT(t)}>PDF</button>}
                  <span className="otd__sp" />
                  <button type="button" className="otd__t otd__t--mute" onClick={cerrar}>Después</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal auto-facturar */}
      {showFacturarModal && (
        <div className="modal-overlay" onClick={() => setShowFacturarModal(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Trabajo Completado</div>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, marginBottom: 8 }}>
                <strong>{showFacturarModal.placa}</strong> — {showFacturarModal.cliente || 'Sin cliente'}
              </p>
              <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                Total: <strong className="text-mono">{fmt(showFacturarModal.total)}</strong>
              </p>
              <p style={{ fontSize: 14 }}>Deseas facturar este trabajo en Cuentti?</p>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowFacturarModal(null)}>Después</Button>
              <Button variant="primary" onClick={() => {
                setShowFacturarModal(null)
                if (onAutoFacturar) onAutoFacturar(showFacturarModal)
                else notify('Ve a la pestaña Cuentti para facturar', 'info')
              }}>Ir a Facturar</Button>
            </div>
          </div>
        </div>
      )}

      {fichaId && (() => {
        const tf = trabajos.find(x => x.id === fichaId)
        return tf ? <FichaTecnico trabajo={tf} tecNombre={tecNombre} onClose={() => setFichaId(null)} guardar={(changes) => actualizarTrabajo(fichaId, changes)} /> : null
      })()}

      <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </div>
  )
}
