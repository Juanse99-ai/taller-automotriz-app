import { useState, useMemo, useEffect } from 'react'
import Fuse from 'fuse.js'
import { fmtDate, fmtTelefono, fmt } from '../utils/helpers'
import { TIPOS_IDENTIFICACION, TIPOS_PERSONA, REGIMENES, buscarClientePorCedula, obtenerUrlDocumento } from '../services/cuentti'
import ConfirmDialog from '../components/ConfirmDialog'
import { SIN_FACTURA } from '../utils/constants'
import { Button, Badge } from '../components/ui'

// Quita acentos: "FERNÁNDEZ" → "fernandez"
const _sinAcentos = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
// Para cedulas: quita puntos, guiones, espacios, lowercase. "30.897.042" → "30897042"
const _normCedula = (s) => (s || '').toString().replace(/[\s.\-_]/g, '').toLowerCase()
// Para nombres: lowercase + sin acentos (mantiene espacios)
const _normNombre = (s) => _sinAcentos(s)
// Solo digitos (para detectar si se busca por cedula)
const soloDigitos = (s) => (s || '').toString().replace(/\D/g, '')

// Columnas de la tabla de clientes. TODAS son arrastrables (menos el chevron).
// Anchos guardados en localStorage. Truco para que no sobre ni falte espacio:
// SIEMPRE hay exactamente una columna "flexible" (sin ancho fijo) que absorbe el
// sobrante. Por defecto es el Nombre (así llena el ancho y muestra los nombres
// sin scroll); apenas el usuario arrastra el Nombre, este pasa a ancho fijo y el
// chevron toma el relevo como flexible. Ver anchoCol() abajo.
// Anchos ajustados para que la tabla ENTERA quepa en 1280px con el sidebar
// abierto (984px útiles): con los valores anteriores sumaba 1056 y "En Cuentti"
// quedaba fuera de vista por defecto, sin que nadie hubiera arrastrado nada.
// El Nombre conserva sus 310 y el recorte lo pagan las columnas que truncan
// igual (email) o que muestran pocos caracteres (cédula, fecha, contadores).
const CLIENTES_COLS = [
  // El nombre abre la fila: es lo que se busca y por lo que se reconoce a alguien.
  // Antes abria la cedula, que sirve para confirmar pero no para reconocer.
  // El nombre es el identificador de la fila y nunca baja de 310px: medido contra
  // la base real, ahí caben completos 9 de cada 10 nombres. Antes la tabla se
  // encogía al ancho de la pantalla y el nombre —la única columna sin ancho fijo—
  // pagaba el pato: quedaba en ~120px y salían todos cortados mientras Teléfono y
  // Email sobraban espacio. Si ya no cabe, la tabla se desliza en vez de aplastarlo.
  { key: 'nombre',   label: 'Nombre',        sort: 'nombre',   min: 310 }, // sin def → flexible por defecto, pero arrastrable
  // 112px = un NIT de 10 digitos entero. Cortado ("9005259…") no sirve ni para
  // confirmar, que es lo unico para lo que se usa esta columna.
  { key: 'cedula',   label: 'CC/NIT',        sort: 'cedula',   def: 112, min: 96 },
  // 124px = un celular de 10 dígitos entero. Un teléfono cortado ("30427537…") no
  // sirve para llamar, así que esta columna no se recorta por defecto.
  { key: 'telefono', label: 'Teléfono',      sort: 'telefono', def: 124, min: 80 },
  // El correo se corta igual por largo, así que no se le da más de lo justo para
  // reconocerlo; ese espacio rinde más en el Nombre.
  { key: 'email',    label: 'Email',         sort: 'email',    def: 120, min: 80 },
  { key: 'veh',      label: 'Vehículos',     sort: 'veh',      def: 72,  min: 60, center: true },
  { key: 'visita',   label: 'Última visita', sort: 'visita',   def: 96,  min: 88 },
  { key: 'cuentti',  label: 'En Cuentti',    sort: 'cuentti',  def: 78,  min: 70 },
  { key: 'chevron',  label: '',              sort: null,       noResize: true }, // sin def; flexible solo cuando el Nombre es fijo
]
const CLIENTES_COL_LS = 'clientes_col_widths_v2'
const anchosPorDefecto = () =>
  Object.fromEntries(CLIENTES_COLS.filter(c => c.def != null).map(c => [c.key, c.def]))
// Ningún ancho puede quedar por debajo del mínimo de su columna.
const sanearAnchos = (w) => Object.fromEntries(
  Object.entries(w).map(([k, v]) => {
    const col = CLIENTES_COLS.find(c => c.key === k)
    return [k, Math.max(col?.min || 56, Number(v) || 0)]
  })
)

export default function Clientes({ clientes, vehiculos, trabajos = [], notify }) {
  const {
    clientesTable, guardarCliente, obtenerCliente, listarClientes,
    vincularVehiculo, guardarEnCuentti, buscarDebounced, resultados,
    buscando, setResultados,
  } = clientes

  const { buscarPorCedula, agregarVehiculo, vehiculos: vehiculosArr } = vehiculos

  const [busqueda, setBusqueda] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [editForm, setEditForm] = useState({ nombre: '', telefono: '', email: '', direccion: '' })
  const [guardandoCuentti, setGuardandoCuentti] = useState(false)
  const [verFacturaId, setVerFacturaId] = useState(null)
  const [creando, setCreando] = useState(false)
  const [nuevoForm, setNuevoForm] = useState({
    cedula: '', nombre: '', telefono: '', email: '', direccion: '',
    tipoIdentificacion: '3', tipoPersona: '1', regimen: 2,
  })
  // Estado de busqueda en Cuentti (auto-fallback cuando no hay match local)
  const [buscandoCuentti, setBuscandoCuentti] = useState(false)
  const [resultadoCuentti, setResultadoCuentti] = useState(null)

  // Estado del sync masivo de telefonos desde Cuentti
  const [syncTel, setSyncTel] = useState({ activo: false, total: 0, procesados: 0, actualizados: 0, errores: 0 })
  const [confirmCfg, setConfirmCfg] = useState(null)

  // Anchos de columna arrastrables (persisten en localStorage por navegador).
  const [colWidths, setColWidths] = useState(() => {
    const base = anchosPorDefecto()
    try {
      const s = JSON.parse(localStorage.getItem(CLIENTES_COL_LS))
      // Los anchos guardados pasan por el mínimo de cada columna: un valor viejo
      // (o de una versión anterior con mínimos más bajos) no puede dejar el
      // Nombre ilegible para siempre.
      if (s && typeof s === 'object') return sanearAnchos({ ...base, ...s })
    } catch { /* usa defaults */ }
    return base
  })
  const [colResizing, setColResizing] = useState(null)
  const iniciarResize = (key, e) => {
    e.preventDefault(); e.stopPropagation()
    const col = CLIENTES_COLS.find(c => c.key === key)
    const th = e.currentTarget.closest('th')
    const startX = e.clientX
    // Si la columna aún no tiene ancho fijo (p.ej. Nombre flexible), se parte de
    // su ancho ACTUAL renderizado, no de un default.
    const startW = colWidths[key] ?? (th ? th.offsetWidth : (col.def ?? 120))
    setColResizing(key)
    const onMove = (ev) => {
      const w = Math.max(col.min || 56, startW + (ev.clientX - startX))
      setColWidths(prev => ({ ...prev, [key]: w }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setColResizing(null)
      setColWidths(prev => { try { localStorage.setItem(CLIENTES_COL_LS, JSON.stringify(prev)) } catch { /* quota */ } return prev })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  const resetColWidths = () => {
    setColWidths(anchosPorDefecto())
    try { localStorage.removeItem(CLIENTES_COL_LS) } catch { /* ignore */ }
  }
  // El botón de restablecer solo aparece cuando hay algo que deshacer: un arrastre
  // guardado (el Nombre pasa a tener ancho fijo, o alguna columna se salió de su
  // valor original). Así el usuario lo encuentra justo cuando lo necesita.
  const anchosTocados = CLIENTES_COLS.some(c => colWidths[c.key] != null && colWidths[c.key] !== c.def)
  // Ancho de cada columna. SIEMPRE hay una flexible (devuelve null = sin ancho):
  // el Nombre por defecto; si el usuario ya lo arrastró, el flexible es el chevron.
  const nombreFijo = colWidths.nombre != null
  const anchoCol = (c) => {
    if (c.key === 'nombre') return nombreFijo ? colWidths.nombre : null
    if (c.key === 'chevron') return nombreFijo ? null : 30
    return colWidths[c.key] ?? c.def
  }
  // Ancho mínimo de la tabla: si al ensanchar columnas ya no cabe, hace scroll
  // horizontal en vez de aplastar (el Nombre nunca baja de 310, el chevron de 30).
  const tablaMinWidth = CLIENTES_COLS.reduce((s, c) =>
    s + (c.key === 'chevron' ? 30 : (colWidths[c.key] ?? c.def ?? c.min ?? 120)), 0)

  // Metricas
  const totalClientes = clientesTable.length
  const conCuenttiId = useMemo(() => clientesTable.filter(c => c.cuenttiId).length, [clientesTable])
  const conVehiculos = useMemo(() => clientesTable.filter(c => c.vehiculos && c.vehiculos.length > 0).length, [clientesTable])
  const sinTelefono = useMemo(() => clientesTable.filter(c => !c.telefono || !c.telefono.toString().trim()).length, [clientesTable])
  // A verificar en Cuentti: los que aún no tienen id de Cuentti guardado O no
  // tienen teléfono. El sync los consulta uno por uno y les guarda id + teléfono
  // + email si existen → la columna "En Cuentti" pasa a decir la verdad.
  const sinVerificar = useMemo(() => clientesTable.filter(c => !c.cuenttiId || !c.telefono || !c.telefono.toString().trim()).length, [clientesTable])

  // Ordenamiento de columnas (clickeable). null = orden natural por scoring de busqueda.
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const toggleSort = (col) => {
    if (sortBy !== col) { setSortBy(col); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else { setSortBy(null); setSortDir('asc') }
  }
  const sortIcon = (col) => {
    // Sin opacidad: al 0.25 la flecha de "ordenable" era invisible y nadie sabía
    // que el encabezado se podía clicar.
    if (sortBy !== col) return <span style={{ color: 'var(--text-4)', fontSize: 11, marginLeft: 5 }}>↕</span>
    return <span style={{ color: 'var(--primary)', fontSize: 11, marginLeft: 5 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  // Lista deduplicada (por cedula) con campos pre-normalizados — base para busqueda
  const dedup = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const c of clientesTable) {
      const ced = _normCedula(c.cedula || '')
      if (!ced) continue
      if (seen.has(ced)) continue
      seen.add(ced)
      out.push({
        ...c,
        _nombreNorm: _normNombre(c.nombre || ''),
        _cedulaNorm: ced,
      })
    }
    return out
  }, [clientesTable])

  // Indice Fuse.js para busqueda fuzzy (tolera errores de tipeo, transposiciones, etc.)
  // Best practices:
  // - useExtendedSearch: permite operadores ('exact, !not, ^prefix, AND con espacio)
  // - keys con pesos (nombre vale mas que cedula)
  // - ignoreLocation: la posicion del match en el string no importa
  // - threshold bajo (0.3) para evitar falsos positivos
  const fuse = useMemo(() => new Fuse(dedup, {
    keys: [
      { name: '_nombreNorm', weight: 0.7 },
      { name: '_cedulaNorm', weight: 0.3 },
    ],
    threshold: 0.3,
    distance: 100,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
    useExtendedSearch: true,
  }), [dedup])

  // FILTRO PRINCIPAL — estrategia robusta:
  // 1. AND-tokens: cada palabra de la busqueda debe aparecer como substring en
  //    nombre+cedula combinados. Garantiza coincidencias predecibles 100% correctas
  //    para busquedas tipo "juan sebastian cervantes".
  // 2. Si AND-tokens no devuelve resultados, fallback a Fuse.js fuzzy (tolera typos).

  // Última visita REAL: derivada de las OT COMPLETADAS del cliente (por cédula). El
  // campo fecha_ultima_visita quedó en la fecha de importación (hoy) para los clientes
  // traídos en bloque, así que no es confiable; esto sí. Si el taller no tiene OT de
  // ese cliente, no se sabe la visita (su historial vive en Cuentti) → se muestra "—".
  const ultimaVisitaPorCedula = useMemo(() => {
    const map = {}
    for (const t of trabajos) {
      if (t.estado !== 'Completado') continue
      const ced = (t.cedula || '').toString().trim()
      if (!ced || !t.fecha) continue
      if (!map[ced] || new Date(t.fecha) > new Date(map[ced])) map[ced] = t.fecha
    }
    return map
  }, [trabajos])
  const uvDe = (c) => ultimaVisitaPorCedula[(c.cedula || '').toString().trim()] || null

  // Historial de facturación del cliente seleccionado: las OT que se facturaron
  // (tienen fecha de facturación o id de transacción de Cuentti), por cédula, más
  // reciente primero. OJO: solo cubre lo que la app registró; el histórico anterior
  // a la app vive únicamente en Cuentti (no hay API para listarlo por cliente).
  const facturasCliente = useMemo(() => {
    if (!clienteSeleccionado) return []
    const ced = _normCedula(clienteSeleccionado.cedula)
    if (!ced) return []
    return (trabajos || [])
      .filter(t => !t.deleted && (t.facturadoEn || t.cuenttiTransacionId) && _normCedula(t.cedula) === ced)
      .sort((a, b) => new Date(b.facturadoEn || b.fecha || 0) - new Date(a.facturadoEn || a.fecha || 0))
  }, [clienteSeleccionado, trabajos])
  const totalFacturado = useMemo(
    () => facturasCliente.reduce((s, t) => s + (t.total || 0), 0),
    [facturasCliente]
  )

  // Abrir el PDF/QR de la factura en Cuentti (por id de transacción).
  const verFactura = async (t) => {
    // 'SIN-FACTURA' marca un trabajo cobrado sin emitir factura: no hay
    // documento que abrir, y sin este guardia se pediría uno inexistente.
    if (!t.cuenttiTransacionId || t.cuenttiTransacionId === SIN_FACTURA) { notify('Este trabajo se cobró sin factura en Cuentti; no hay documento que abrir.', 'info'); return }
    setVerFacturaId(t.id)
    try {
      const res = await obtenerUrlDocumento(t.cuenttiTransacionId)
      const url = res?.url_externa || res?.url || res?.qr || (typeof res === 'string' ? res : null)
      if (url) window.open(url, '_blank', 'noopener')
      else notify('No se pudo obtener el documento desde Cuentti', 'error')
    } catch (e) {
      notify(`Error obteniendo la factura: ${e.message}`, 'error')
    } finally {
      setVerFacturaId(null)
    }
  }

  const clientesFiltrados = useMemo(() => {
    const termRaw = busqueda.trim()

    // Comparador para ordenamiento de columnas
    const cmp = (a, b) => {
      let av, bv
      switch (sortBy) {
        case 'cedula': av = (a.cedula || ''); bv = (b.cedula || ''); break
        case 'nombre': av = _normNombre(a.nombre); bv = _normNombre(b.nombre); break
        case 'telefono': av = (a.telefono || ''); bv = (b.telefono || ''); break
        case 'email': av = (a.email || '').toLowerCase(); bv = (b.email || '').toLowerCase(); break
        case 'veh': av = (a.vehiculos || []).length; bv = (b.vehiculos || []).length; break
        case 'visita': av = uvDe(a) ? new Date(uvDe(a)).getTime() : 0; bv = uvDe(b) ? new Date(uvDe(b)).getTime() : 0; break
        case 'cuentti': av = a.cuenttiId ? 1 : 0; bv = b.cuenttiId ? 1 : 0; break
        default: return 0
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    }

    // Sin búsqueda → lista completa (con sort opcional por columna)
    if (!termRaw) {
      return sortBy ? [...dedup].sort(cmp) : dedup
    }

    const termNom = _normNombre(termRaw)
    const tokens = termNom.split(/\s+/).filter(Boolean)
    const termCed = _normCedula(termRaw)

    // PASO 1: AND-tokens determinista
    // Cada token debe aparecer en nombre O cedula. Multi-palabra siempre funciona.
    const scored = []
    for (const c of dedup) {
      const nomC = c._nombreNorm
      const cedC = c._cedulaNorm

      const allMatch = tokens.every(tok => nomC.includes(tok) || cedC.includes(tok))
      if (!allMatch) continue

      // Score para ordenar relevancia:
      // 100: nombre empieza con el termino completo
      //  80: termino aparece como palabra completa
      //  60: alguna palabra del nombre empieza con primer token
      //  40: solo substring
      //  30: match solo por cedula
      let score = 40
      if (termNom && nomC) {
        if (nomC.startsWith(termNom + ' ') || nomC === termNom) score = 100
        else if (nomC.includes(' ' + termNom + ' ') || nomC.endsWith(' ' + termNom)) score = 80
        else {
          const palabras = nomC.split(/\s+/)
          if (tokens[0] && palabras.some(w => w.startsWith(tokens[0]))) score = 60
        }
      }
      if (!nomC && termCed.length >= 2 && cedC.includes(termCed)) score = 30

      scored.push({ c, score })
    }

    // PASO 2: si no hay matches exactos, usar Fuse.js fuzzy como fallback
    // (tolera "perez" cuando el cliente es "péréz", "jaun" cuando es "juan", etc.)
    // PERO no para cedulas: una cedula es EXACTA. El fuzzy devuelve cedulas parecidas
    // que confunden y ademas tapan el fallback a Cuentti (que solo corre con 0
    // resultados). Si es cedula y no hubo match exacto → 0 resultados.
    const esBusquedaCedula = /^[\d.\-\s]{6,}$/.test(termRaw)
    let list
    if (scored.length === 0) {
      list = esBusquedaCedula ? [] : fuse.search(termNom).slice(0, 50).map(r => r.item)
    } else {
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.c._nombreNorm < b.c._nombreNorm ? -1 : a.c._nombreNorm > b.c._nombreNorm ? 1 : 0
      })
      list = scored.map(x => x.c)
    }

    if (sortBy) list = [...list].sort(cmp)
    return list
  }, [dedup, fuse, busqueda, sortBy, sortDir, ultimaVisitaPorCedula])

  // Auto-buscar en Cuentti cuando no hay resultados locales y el termino parece cedula
  useEffect(() => {
    setResultadoCuentti(null)
    const termRaw = busqueda.trim()
    if (!termRaw || clientesFiltrados.length > 0) return
    const ced = soloDigitos(termRaw)
    // Solo buscar en Cuentti si parece cedula (>=5 digitos)
    if (ced.length < 5) return

    let cancelled = false
    const timer = setTimeout(async () => {
      setBuscandoCuentti(true)
      try {
        const apiResult = await buscarClientePorCedula(ced)
        if (!cancelled && apiResult) {
          setResultadoCuentti(apiResult)
        }
      } catch { /* ignorar */ }
      finally { if (!cancelled) setBuscandoCuentti(false) }
    }, 600) // debounce 600ms

    return () => { cancelled = true; clearTimeout(timer) }
  }, [busqueda, clientesFiltrados.length])

  // SYNC MASIVO de telefonos desde Cuentti
  // Recorre clientes sin telefono, los consulta uno por uno (con concurrencia 3)
  // y actualiza el registro local + Supabase via guardarCliente.
  const sincronizarTelefonosCuentti = async () => {
    // Verifica en Cuentti a los que no tienen id guardado O no tienen teléfono:
    // les guarda id_cliente + teléfono + email si existen. Así "En Cuentti" deja
    // de decir "Sin verificar" para los que sí están.
    const objetivo = clientesTable.filter(c => !c.cuenttiId || !c.telefono || !c.telefono.toString().trim())
    if (!objetivo.length) {
      notify('Todos los clientes ya están verificados en Cuentti', 'info')
      return
    }
    setConfirmCfg({
      title: 'Verificar en Cuentti',
      lead: `Se consultarán ${objetivo.length} clientes uno por uno en Cuentti (~${Math.ceil(objetivo.length / 3 * 0.4)}s). Se guarda su id, teléfono y correo si existen.`,
      confirmLabel: 'Verificar',
      tone: 'primary',
      onConfirm: async () => {
        setSyncTel({ activo: true, total: objetivo.length, procesados: 0, actualizados: 0, errores: 0 })

        const concurrencia = 3
        let idx = 0
        let actualizados = 0
        let errores = 0

        const procesarUno = async (cliente) => {
          try {
            const data = await buscarClientePorCedula(cliente.cedula)
            // Encontrado en Cuentti → guardar su id (confirma "En Cuentti") y de paso
            // teléfono/correo. Antes solo guardaba si había teléfono, así que un
            // cliente en Cuentti sin teléfono nunca quedaba verificado.
            if (data && (data.id || data.telefono)) {
              guardarCliente({
                cedula: cliente.cedula,
                nombre: cliente.nombre,
                telefono: data.telefono || cliente.telefono || '',
                email: cliente.email || data.email || '',
                direccion: cliente.direccion || data.direccion || '',
                cuenttiId: data.id || cliente.cuenttiId || null,
              })
              actualizados++
            }
          } catch {
            errores++
          } finally {
            setSyncTel(s => ({ ...s, procesados: s.procesados + 1, actualizados, errores }))
          }
        }

        // Worker pool simple: 3 workers que toman del array
        const worker = async () => {
          while (idx < objetivo.length) {
            const i = idx++
            if (i >= objetivo.length) break
            await procesarUno(objetivo[i])
          }
        }
        await Promise.all(Array.from({ length: concurrencia }, () => worker()))

        setSyncTel(s => ({ ...s, activo: false }))
        notify(`Sync completado: ${actualizados} actualizados, ${errores} errores`, actualizados > 0 ? 'success' : 'warning')
      },
    })
    return
  }

  // Importar el cliente de Cuentti a la BD local
  const importarDeCuentti = (apiResult) => {
    if (!apiResult) return
    const ced = (apiResult.identificacion || apiResult.cedula || '').toString().trim()
    const nom = (apiResult.nombre || apiResult.nombre_cliente || '').toString().trim()
    if (!ced || !nom) {
      notify('El resultado de Cuentti no tiene cedula o nombre validos', 'error')
      return
    }
    const importado = guardarCliente({
      cedula: ced,
      nombre: nom,
      telefono: apiResult.telefono1 || apiResult.telefono || '',
      email: apiResult.email || '',
      direccion: apiResult.direccion || '',
      cuenttiId: apiResult.id_cliente || apiResult.id || null,
    })
    if (importado) {
      notify(`Cliente "${nom}" importado de Cuentti`, 'success')
      setResultadoCuentti(null)
      setBusqueda(ced) // re-filtrar para que aparezca en la lista
    }
  }

  // Seleccionar cliente para ver detalle
  const seleccionar = (cliente) => {
    setClienteSeleccionado(cliente)
    setEditForm({
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      direccion: cliente.direccion || '',
    })
  }

  const volver = () => {
    setClienteSeleccionado(null)
    setEditForm({ nombre: '', telefono: '', email: '', direccion: '' })
  }

  const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const handleGuardarLocal = () => {
    if (!clienteSeleccionado) return
    const actualizado = guardarCliente({
      cedula: clienteSeleccionado.cedula,
      nombre: editForm.nombre,
      telefono: editForm.telefono,
      email: editForm.email,
      direccion: editForm.direccion,
    })
    if (actualizado) {
      setClienteSeleccionado(actualizado)
      notify('Cliente actualizado localmente', 'success')
    }
  }

  const handleGuardarCuentti = async () => {
    if (!clienteSeleccionado) return
    setGuardandoCuentti(true)
    try {
      const payload = {
        cedula: clienteSeleccionado.cedula,
        cuenttiId: clienteSeleccionado.cuenttiId,
        nombre: editForm.nombre,
        telefono: editForm.telefono,
        email: editForm.email,
        direccion: editForm.direccion,
      }
      const result = await guardarEnCuentti(payload)
      if (result.success) {
        setClienteSeleccionado(result.data)
        notify('Cliente guardado en Cuentti exitosamente', 'success')
      } else {
        notify('Error al guardar en Cuentti: ' + (result.error || 'Error desconocido'), 'error')
      }
    } finally {
      setGuardandoCuentti(false)
    }
  }

  // Vehiculos del cliente seleccionado (vehiculosArr en deps → se refresca al agregar)
  const vehiculosCliente = useMemo(() => {
    if (!clienteSeleccionado) return []
    return buscarPorCedula(clienteSeleccionado.cedula)
  }, [clienteSeleccionado, buscarPorCedula, vehiculosArr])

  const setNuevo = (k, v) => setNuevoForm(f => ({ ...f, [k]: v }))

  // Alta de vehículo desde la pantalla del cliente
  const [agregandoVeh, setAgregandoVeh] = useState(false)
  const [nuevoVeh, setNuevoVeh] = useState({ placa: '', marca: '', modelo: '', ano: '' })
  const guardarVehiculoNuevo = () => {
    const placa = (nuevoVeh.placa || '').trim().toUpperCase()
    if (!placa) { notify('Ingresa la placa del vehículo', 'error'); return }
    if (!clienteSeleccionado) return
    agregarVehiculo({
      placa,
      marca: nuevoVeh.marca.trim(),
      modelo: nuevoVeh.modelo.trim(),
      ano: parseInt(nuevoVeh.ano) || 0,
      cedulaPropietario: clienteSeleccionado.cedula,
    })
    notify(`Vehículo ${placa} agregado a ${clienteSeleccionado.nombre || 'cliente'}`, 'success')
    setNuevoVeh({ placa: '', marca: '', modelo: '', ano: '' })
    setAgregandoVeh(false)
  }

  const handleCrearCliente = async () => {
    if (!nuevoForm.cedula || !nuevoForm.nombre) {
      notify('Cedula y nombre son obligatorios', 'error')
      return
    }
    // Verificar si ya existe localmente
    const existe = obtenerCliente(nuevoForm.cedula)
    if (existe) {
      notify('Ya existe un cliente con esa cedula', 'error')
      return
    }
    // Guardar localmente
    const local = guardarCliente({
      cedula: nuevoForm.cedula,
      nombre: nuevoForm.nombre,
      telefono: nuevoForm.telefono,
      email: nuevoForm.email,
      direccion: nuevoForm.direccion,
    })
    // Guardar en Cuentti
    setGuardandoCuentti(true)
    try {
      const result = await guardarEnCuentti({
        cedula: nuevoForm.cedula,
        nombre: nuevoForm.nombre,
        telefono: nuevoForm.telefono,
        email: nuevoForm.email,
        direccion: nuevoForm.direccion,
        tipoIdentificacion: nuevoForm.tipoIdentificacion,
        tipoPersona: nuevoForm.tipoPersona,
        regimen: nuevoForm.regimen,
      })
      if (result.success) {
        notify('Cliente creado y guardado en Cuentti', 'success')
        setCreando(false)
        setNuevoForm({ cedula: '', nombre: '', telefono: '', email: '', direccion: '', tipoIdentificacion: '3', tipoPersona: '1', regimen: 2 })
        if (result.data) seleccionar(result.data)
      } else {
        notify('Cliente guardado local. Error Cuentti: ' + (result.error || 'desconocido'), 'warning')
        setCreando(false)
        setNuevoForm({ cedula: '', nombre: '', telefono: '', email: '', direccion: '', tipoIdentificacion: '3', tipoPersona: '1', regimen: 2 })
        if (local) seleccionar(local)
      }
    } catch {
      notify('Cliente guardado localmente. No se pudo conectar con Cuentti', 'warning')
      setCreando(false)
      if (local) seleccionar(local)
    } finally {
      setGuardandoCuentti(false)
    }
  }

  // --- VISTA CREAR NUEVO ---
  if (creando) {
    return (
      <div>
        <div className="pagehd">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <Button variant="outline" size="sm" onClick={() => setCreando(false)}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </Button>
            <div><h2>Nuevo Cliente</h2></div>
          </div>
        </div>

        <div className="card">
          <div className="card__h"><h3>Datos Tributarios</h3></div>
          <div className="card__b">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
              <div className="field">
                <label>Tipo Persona</label>
                <select className="input" value={nuevoForm.tipoPersona} onChange={e => setNuevo('tipoPersona', e.target.value)}>
                  {TIPOS_PERSONA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Tipo Identificacion</label>
                <select className="input" value={nuevoForm.tipoIdentificacion} onChange={e => setNuevo('tipoIdentificacion', e.target.value)}>
                  {TIPOS_IDENTIFICACION.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Regimen</label>
                <select className="input" value={nuevoForm.regimen} onChange={e => setNuevo('regimen', parseInt(e.target.value))}>
                  {REGIMENES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__h"><h3>Informacion del Cliente</h3></div>
          <div className="card__b">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div className="field">
                <label>Identificacion *</label>
                <input className="input" value={nuevoForm.cedula} placeholder="Numero de documento"
                  onChange={e => setNuevo('cedula', e.target.value)} />
              </div>
              <div className="field">
                <label>Nombre Completo *</label>
                <input className="input" value={nuevoForm.nombre} placeholder="Nombre y apellidos / Razon social"
                  onChange={e => setNuevo('nombre', e.target.value)} />
              </div>
              <div className="field">
                <label>Telefono</label>
                <input className="input" value={nuevoForm.telefono} placeholder="300..."
                  onChange={e => setNuevo('telefono', e.target.value)} />
              </div>
              <div className="field">
                <label>Email</label>
                <input className="input" type="email" value={nuevoForm.email} placeholder="correo@ejemplo.com"
                  onChange={e => setNuevo('email', e.target.value)} />
              </div>
              <div className="field" style={{gridColumn:'1 / -1'}}>
                <label>Direccion</label>
                <input className="input" value={nuevoForm.direccion} placeholder="Calle / Carrera..."
                  onChange={e => setNuevo('direccion', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="outline" onClick={() => setCreando(false)}>Cancelar</Button>
              <Button variant="primary" onClick={handleCrearCliente} disabled={guardandoCuentti}>
                {guardandoCuentti ? 'Guardando...' : 'Crear y Guardar en Cuentti'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- VISTA DETALLE ---
  if (clienteSeleccionado) {
    return (
      <div>
        <div className="pagehd">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <Button variant="outline" size="sm" onClick={volver}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </Button>
            <div>
              <h2>{clienteSeleccionado.nombre || 'Cliente'}</h2>
              <p className="sub">CC/NIT {clienteSeleccionado.cedula}</p>
            </div>
          </div>
          <div className="actions" style={{display:'flex',alignItems:'center',gap:10}}>
            {clienteSeleccionado.cuenttiId && (
              <Badge tone="s">Cuentti #{clienteSeleccionado.cuenttiId}</Badge>
            )}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'start'}}>
          {/* Left column - Info */}
          <div className="card">
            <div className="card__h"><h3>Informacion del cliente</h3></div>
            <div className="card__b">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div className="field">
                  <label>Cedula / NIT</label>
                  <input className="input" value={clienteSeleccionado.cedula} disabled
                    style={{ background: 'var(--bg-subtle)', color: 'var(--text-3)' }} />
                </div>
                <div className="field">
                  <label>Nombre</label>
                  <input className="input" value={editForm.nombre}
                    onChange={e => setEdit('nombre', e.target.value)} />
                </div>
                <div className="field">
                  <label>Telefono</label>
                  <input className="input" value={editForm.telefono}
                    onChange={e => setEdit('telefono', e.target.value)} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" value={editForm.email} type="email"
                    onChange={e => setEdit('email', e.target.value)} />
                </div>
                <div className="field" style={{gridColumn:'1 / -1'}}>
                  <label>Direccion</label>
                  <input className="input" value={editForm.direccion}
                    onChange={e => setEdit('direccion', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <Button variant="primary" onClick={handleGuardarLocal}>
                  Guardar Cambios
                </Button>
                <Button variant="success" onClick={handleGuardarCuentti} disabled={guardandoCuentti}>
                  {guardandoCuentti ? 'Guardando...' : 'Guardar en Cuentti'}
                </Button>
              </div>
            </div>
          </div>

          {/* Right column - Vehiculos */}
          <div className="card">
            <div className="card__h">
              <h3>Vehiculos del cliente</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="count">{vehiculosCliente.length}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setAgregandoVeh(v => !v)}>
                  {agregandoVeh ? 'Cancelar' : '+ Agregar'}
                </Button>
              </div>
            </div>
            {agregandoVeh && (
              <div className="card__b" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field">
                    <label>Placa *</label>
                    <input className="input" value={nuevoVeh.placa} maxLength={7}
                      onChange={e => setNuevoVeh(s => ({ ...s, placa: e.target.value.toUpperCase() }))}
                      placeholder="ABC123" autoFocus />
                  </div>
                  <div className="field">
                    <label>Año</label>
                    <input className="input" type="number" value={nuevoVeh.ano}
                      onChange={e => setNuevoVeh(s => ({ ...s, ano: e.target.value }))} placeholder="2020" />
                  </div>
                  <div className="field">
                    <label>Marca</label>
                    <input className="input" value={nuevoVeh.marca}
                      onChange={e => setNuevoVeh(s => ({ ...s, marca: e.target.value }))} placeholder="Renault" />
                  </div>
                  <div className="field">
                    <label>Modelo</label>
                    <input className="input" value={nuevoVeh.modelo}
                      onChange={e => setNuevoVeh(s => ({ ...s, modelo: e.target.value }))} placeholder="Duster" />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <Button type="button" variant="primary" onClick={guardarVehiculoNuevo}>Guardar vehículo</Button>
                </div>
              </div>
            )}
            {vehiculosCliente.length === 0 ? (
              <div className="card__b">
                <div className="empty"><h4>Sin vehiculos</h4><p>Este cliente no tiene vehiculos registrados.</p></div>
              </div>
            ) : (
              <div className="card__b card__b--flush">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Marca</th>
                      <th>Modelo</th>
                      <th>Año</th>
                      <th style={{textAlign:'center'}}># Visitas</th>
                      <th>Último Servicio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehiculosCliente.map(v => (
                      <tr key={v.placa}>
                        <td className="c-mono" style={{ fontWeight: 700 }}>{v.placa}</td>
                        <td>{v.marca || '—'}</td>
                        <td className="c-muted">{v.modelo || '—'}</td>
                        <td className="c-mono c-muted">{v.ano || '—'}</td>
                        <td style={{textAlign:'center'}}>
                          <Badge tone="i">{(v.historial || []).length}</Badge>
                        </td>
                        <td className="c-muted">{fmtDate(v.fechaUltimoServicio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Historial de facturación del cliente */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card__h">
            <h3>Historial de facturación</h3>
            <span className="count">{facturasCliente.length}</span>
          </div>
          {facturasCliente.length === 0 ? (
            <div className="card__b">
              <div className="empty">
                <h4>Sin facturas registradas</h4>
                <p>Este cliente no tiene facturas emitidas desde la app. El histórico anterior a la app vive en Cuentti.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="card__b card__b--flush">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>OT</th>
                      <th>Vehiculo</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'center' }}>Pago</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasCliente.map(t => (
                      <tr key={t.id}>
                        <td className="c-muted">{fmtDate(t.facturadoEn || t.fecha)}</td>
                        <td className="c-mono">{t.otCodigo || '—'}</td>
                        <td>
                          <span className="c-mono" style={{ fontWeight: 700 }}>{t.placa || '—'}</span>
                          {[t.marca, t.modelo].filter(Boolean).length > 0 && (
                            <span className="c-muted"> · {[t.marca, t.modelo].filter(Boolean).join(' ')}</span>
                          )}
                        </td>
                        <td className="c-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(t.total)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <Badge tone={t.pagado ? 's' : 'w'}>{t.pagado ? 'Pagada' : 'Pendiente'}</Badge>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {t.cuenttiTransacionId && (
                            <Button variant="ghost" size="sm" onClick={() => verFactura(t)} disabled={verFacturaId === t.id}>
                              {verFacturaId === t.id ? 'Abriendo…' : 'Ver factura'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card__b" style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-3)', fontSize: 13.5 }}>Total facturado ({facturasCliente.length})</span>
                  <span className="c-mono" style={{ fontWeight: 800, fontSize: 15.5 }}>{fmt(totalFacturado)}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 0' }}>
                  Solo facturas emitidas desde la app. El histórico anterior a la app vive en Cuentti.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // --- VISTA LISTA ---
  return (
    <>
    <div>
      {/* De los cuatro conteos, solo "sin telefono" sube a cifra grande: es el
          unico accionable y es el que explica el boton de verificar. Los otros
          tres bajan a linea de apoyo — son contexto, no tarea. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Clientes</h1>
          <div className="hd-head__sub">
            {totalClientes} clientes · {conCuenttiId} verificados en Cuentti con id guardado · {conVehiculos} con vehículos
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          {sinTelefono > 0 && (
            <div className="hd-fig" style={{ '--fg': 'var(--warn-fg-2)' }}>
              <div className="hd-fig__l" style={{ color: 'var(--warn-fg)' }}>SIN TELÉFONO</div>
              <div className="hd-fig__v">{sinTelefono}</div>
            </div>
          )}
          <div className="hd-head__div" />
          {sinVerificar > 0 && (
            <Button
              variant="outline"
              onClick={sincronizarTelefonosCuentti}
              disabled={syncTel.activo}
              title="Consulta uno por uno en Cuentti: guarda id, teléfono y correo"
            >
              {syncTel.activo
                ? `Verificando ${syncTel.procesados}/${syncTel.total}…`
                : `Verificar ${sinVerificar} en Cuentti`}
            </Button>
          )}
          <Button variant="primary" onClick={() => setCreando(true)}>+ Nuevo cliente</Button>
        </div>
      </div>

      {/* Barra de progreso del sync masivo de telefonos */}
      {syncTel.activo && (
        <div style={{marginBottom:14,padding:'12px 16px',background:'var(--soft-blue)',border:'1px solid var(--soft-blue-bd)',borderRadius:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',fontSize:13.5,marginBottom:8}}>
            <span style={{fontWeight:700,color:'var(--blue-700)'}}>
              Verificando clientes en Cuentti…
            </span>
            <span style={{color:'var(--text-3)',fontSize:12.5}}>
              {syncTel.procesados} de {syncTel.total} · {syncTel.actualizados} actualizados · {syncTel.errores} errores
            </span>
          </div>
          <div style={{height:6,background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:3,overflow:'hidden'}}>
            <div style={{
              height:'100%',
              width:`${syncTel.total > 0 ? (syncTel.procesados / syncTel.total * 100) : 0}%`,
              background:'var(--primary)',
              transition:'width 0.3s'
            }}/>
          </div>
        </div>
      )}

      {/* Franja de cifras en vez de tarjetas iguales: son cuatro conteos del mismo
          peso, ninguno manda sobre los otros.
          "Verificados" NO es "% de clientes en Cuentti" (eso engañaba: casi todos
          están en Cuentti, vinieron de ahí). Es cuántos tienen su id de Cuentti
          guardado en la app; del resto no sabemos hasta verificar. */}
      <div className="card">
        <div className="card__h" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <h3 style={{flex:'none'}}>Buscar</h3>
          <div style={{flex:1,maxWidth:480,display:'flex',alignItems:'center',gap:9,background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:9,padding:'7px 12px'}}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="CC/NIT o nombre del cliente…" value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{border:'none',outline:'none',background:'none',flex:1,fontSize:13.5}}/>
            {busqueda && <button type="button" className="input-clear" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>}
          </div>
          <span className="count" style={{ background: clientesFiltrados.length === 0 && busqueda.trim() ? 'var(--soft-red)' : undefined, color: clientesFiltrados.length === 0 && busqueda.trim() ? 'var(--red-700)' : undefined }}>
            {busqueda.trim() ? `${clientesFiltrados.length} de ${totalClientes}` : `${clientesFiltrados.length} clientes`}
          </span>
          {anchosTocados && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetColWidths}
              title="Devuelve las columnas al ancho original de la tabla"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
              Restablecer columnas
            </Button>
          )}
        </div>

        {/* Banner: encontrado en Cuentti pero NO en local */}
        {busqueda.trim() && clientesFiltrados.length === 0 && resultadoCuentti && (
          <div style={{padding:'13px 16px',margin:'0 16px 16px',background:'var(--soft-blue)',border:'1px solid var(--soft-blue-bd)',borderRadius:10,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:13,fontWeight:700,color:'var(--blue-700)',marginBottom:3}}>
                Encontrado en Cuentti, todavía no está en la app
              </div>
              <div style={{fontSize:14.5,fontWeight:700}}>
                {(resultadoCuentti.nombre || resultadoCuentti.nombre_cliente || '').toString()}
              </div>
              <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:3}}>
                CC <span className="mono">{resultadoCuentti.identificacion || resultadoCuentti.cedula}</span>
                {(resultadoCuentti.telefono1 || resultadoCuentti.telefono) && <> · Tel <span className="mono">{resultadoCuentti.telefono1 || resultadoCuentti.telefono}</span></>}
                {resultadoCuentti.email && <> · {resultadoCuentti.email}</>}
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={() => importarDeCuentti(resultadoCuentti)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Importar a la app
            </Button>
          </div>
        )}

        {/* Banner: buscando en Cuentti */}
        {busqueda.trim() && clientesFiltrados.length === 0 && buscandoCuentti && !resultadoCuentti && (
          <div style={{padding:'11px 16px',margin:'0 16px 16px',background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:9,fontSize:13.5,color:'var(--text-3)',display:'flex',alignItems:'center',gap:9}}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,animation:'spin 1.4s linear infinite'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Buscando "{busqueda}" en Cuentti…
          </div>
        )}

        <div className="card__b card__b--flush">
          {clientesFiltrados.length === 0 ? (
            <div className="empty">
              <h4>Sin resultados en la BD local</h4>
              <p>
                {soloDigitos(busqueda).length >= 5
                  ? (resultadoCuentti
                      ? 'Hay un cliente en Cuentti con esa cedula. Click en "Importar" arriba.'
                      : (buscandoCuentti ? 'Consultando Cuentti...' : 'Tampoco se encontro en Cuentti.'))
                  : 'No se encontro ningun cliente. Prueba con la cedula completa.'}
              </p>
            </div>
          ) : (
            <table
              className={`tbl tbl-cards tbl-cards--clientes tbl--sticky tbl--clientes${colResizing ? ' is-resizing' : ''}`}
              /* El min-width va por variable y SOLO se aplica en escritorio
                 (ver index.css): en línea pisaba el `min-width:0` del modo
                 tarjeta y en el celular las tarjetas se salían de la pantalla
                 con los valores cortados. */
              style={{ '--tbl-min': `${tablaMinWidth}px` }}
            >
              <colgroup>
                {CLIENTES_COLS.map(c => {
                  const w = anchoCol(c)
                  return <col key={c.key} style={w != null ? { width: w } : undefined} />
                })}
              </colgroup>
              <thead>
                <tr>
                  {CLIENTES_COLS.map(c => (
                    <th
                      key={c.key}
                      onClick={c.sort ? () => toggleSort(c.sort) : undefined}
                      style={{ cursor: c.sort ? 'pointer' : 'default', userSelect: 'none', textAlign: c.center ? 'center' : undefined }}
                    >
                      {c.label}{c.sort ? sortIcon(c.sort) : null}
                      {!c.noResize && (
                        <span
                          className={`col-resizer${colResizing === c.key ? ' is-drag' : ''}`}
                          onMouseDown={(e) => iniciarResize(c.key, e)}
                          onClick={(e) => e.stopPropagation()}
                          title="Arrastra para cambiar el ancho de la columna"
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(c => (
                  <tr key={c.id || c.cedula} style={{cursor:'pointer'}} onClick={() => seleccionar(c)}>
                    <td className="c-name" title={c.nombre || ''}>{c.nombre || '—'}</td>
                    <td className="c-mono td-cc" data-label="CC/NIT" style={{fontSize:12.5}}>{c.cedula || '—'}</td>
                    {/* En celular esta celda deja de ser texto y se vuelve el BOTÓN DE
                        LLAMAR de 44px (ver .tbl-cards--clientes en index.css). Si no hay
                        número no hay botón: la celda se queda como "Teléfono —" en la
                        línea gris, que es lo mismo que muestra hoy. */}
                    <td className="c-mono td-tel" data-label="Teléfono">
                      {fmtTelefono(c.telefono)
                        ? <a
                            className="tel-call"
                            href={`tel:${fmtTelefono(c.telefono)}`}
                            aria-label={`Llamar al ${fmtTelefono(c.telefono)}`}
                            /* La fila entera abre el detalle; sin esto, tocar "llamar"
                               además cambiaría de pantalla por debajo del marcador. */
                            onClick={e => e.stopPropagation()}
                          >{fmtTelefono(c.telefono)}</a>
                        : '—'}
                    </td>
                    <td className="c-muted td-email" data-label="Email">{c.email || '—'}</td>
                    <td data-label="Vehículos" className="td-vehs" style={{textAlign:'center'}}>
                      <Badge tone={(c.vehiculos || []).length > 0 ? 'i' : 'n'}>
                        {(c.vehiculos || []).length}
                      </Badge>
                    </td>
                    <td className="c-muted td-visita" data-label="Última visita">{uvDe(c) ? fmtDate(uvDe(c)).replace(/ de /g, ' ') : '—'}</td>
                    {/* "En Cuentti" HONESTO: verde = confirmado (tenemos su id de Cuentti);
                        gris "Sin verificar" = NO sabemos (no lo hemos consultado). Antes
                        decía "Pendiente" (implicaba que NO estaba) aunque sí estuviera. */}
                    <td className="td-cuentti" data-label="En Cuentti">
                      {/* Punto + Si/No: la etiqueta larga se truncaba a "En Cuentti…"
                          y "Sin verificar" no cabia nunca. El color ya dice cual es
                          cual; la palabra solo confirma. */}
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: c.cuenttiId ? 'var(--ok-fg)' : 'var(--warn-fg)' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: c.cuenttiId ? 'var(--ok-fg)' : 'var(--warn-fg)' }}>{c.cuenttiId ? 'Sí' : 'No'}</span>
                      </span>
                    </td>
                    <td className="td-chevron">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
    <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </>
  )
}
