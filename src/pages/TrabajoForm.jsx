// ============================================================
// FORMULARIO DE LA ORDEN DE TRABAJO (crear / editar una OT)
//
// Vivía dentro de Trabajos.jsx, que pasaba de 2.000 líneas. Se lleva consigo sus
// dos ayudantes de UI (Chevron y ThumbGrid), que no usa nadie más.
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { fmt, fmtDate, uid, hoyISO, normalizarDoc, normalizarNombre, fmtTelefono, cantidadItem, fmtCant } from '../utils/helpers'
import { TECNICOS, ESTADOS, IVA_DEFAULT, COMISION } from '../utils/constants'
import IngresoVehiculo from '../components/IngresoVehiculo'
import { ingresoVacio } from '../utils/ingreso'
import { MARCAS, getModelos } from '../utils/vehiculos'
import { useClientes } from '../hooks/useClientes'
import { useInventario, formatCacheAge } from '../hooks/useInventario'
import { subirVideoEvidencia, borrarVideoEvidencia, fetchEvidenciasTrabajo } from '../services/supabase'
import Switch from '../components/Switch'
import MoneyInput from '../components/MoneyInput'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button } from '../components/ui'

// Opciones de cilindraje del motor (litros): 0.8 a 5.0 en pasos de 0.1
const CILINDRAJES = Array.from({ length: 43 }, (_, i) => (0.8 + i * 0.1).toFixed(1))


// Chevron para secciones plegables
function Chevron({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, color: 'var(--text-3)', transition: 'transform .22s var(--ease)', transform: open ? 'rotate(180deg)' : 'none' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// ========================
// FORMULARIO DE TRABAJO
// ========================
export default function TrabajoForm({ trabajo, onSave, onCancel, allTrabajos = [], vehiculosHook, notify }) {
  const isEdit = !!trabajo
  const { resultados, buscando, buscarDebounced, setResultados } = useClientes()
  const [campoActivo, setCampoActivo] = useState('cedula') // cuál campo de búsqueda de cliente está enfocado
  const [confirmCfg, setConfirmCfg] = useState(null) // diálogo de confirmación

  const [form, setForm] = useState({
    cedula: trabajo?.cedula || '',
    cliente: trabajo?.cliente || '',
    telefonoCliente: trabajo?.telefonoCliente || '',
    emailCliente: trabajo?.emailCliente || '',
    clienteId: trabajo?.clienteId || '',
    sinVehiculo: trabajo?.sinVehiculo || false,
    placa: trabajo?.placa || '',
    marca: trabajo?.marca || '',
    modelo: trabajo?.modelo || '',
    ano: trabajo?.ano || '',
    cilindraje: trabajo?.cilindraje || '',
    kilometraje: trabajo?.kilometraje || '',
    tecnicoId: trabajo?.tecnicoId || '',
    observaciones: trabajo?.observaciones || '',
    // Mano de obra manual: solo se usa cuando NO hay líneas marcadas "Servicio"
    // (ej. cambio de aceite). Base para la comisión del técnico, no se cobra al cliente.
    manoObra: trabajo?.manoObra ? String(trabajo.manoObra) : '',
    // M.O. adicional (no facturada): se SUMA a la comisión aunque ya haya líneas de
    // servicio (ej. la mano de obra del cambio de aceite además de la reparación).
    // Nunca entra al total del cliente.
    manoObraExtra: trabajo?.manoObraExtra ? String(trabajo.manoObraExtra) : '',
    estado: trabajo?.estado || ESTADOS.PENDIENTE,
    fecha: trabajo?.fecha ? trabajo.fecha.slice(0, 10) : hoyISO(),
    // Evidencias unificadas: TODAS las fotos del trabajo (antes/durante/después).
    // Migra datos viejos que estaban separados en ingreso/entrega a una sola lista.
    evidenciasIngreso: [...(trabajo?.evidenciasIngreso || []), ...(trabajo?.evidenciasEntrega || [])],
    evidenciasEntrega: [],
    // Próximo mantenimiento (opcional, para CRM)
    tipoAceite: trabajo?.tipoAceite || '',  // '' | 'mineral' | 'sintetico' | 'no_aplica'
    proximoKm: trabajo?.proximoKm || '',
    proximaVisita: trabajo?.proximaVisita ? trabajo.proximaVisita.slice(0, 10) : '',
    notasProximoMant: trabajo?.notasProximoMant || '',
    // Estado de ingreso del vehículo (inventario + combustible + daños)
    ingreso: trabajo?.ingreso || ingresoVacio(),
  })

  const [items, setItems] = useState(trabajo?.items || [])
  // Evidencias: abierta por defecto para que el botón de subir fotos sea visible.
  const [showEvid, setShowEvid] = useState(true)
  const [showHistorial, setShowHistorial] = useState(false) // historial por placa: cerrado por defecto
  const [showMant, setShowMant] = useState(
    !!(trabajo?.tipoAceite || trabajo?.proximoKm || trabajo?.proximaVisita || trabajo?.notasProximoMant)
  )
  // Comprime la imagen (máx 1100px, JPEG) antes de guardarla: así pesa poco
  // para localStorage, el PDF y el portal del cliente. Cae al original si falla.
  const comprimirImagen = (file, maxDim = 1100, quality = 0.62) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
          else { width = Math.round(width * maxDim / height); height = maxDim }
        }
        try {
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          canvas.getContext('2d').drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch { resolve(reader.result) }
      }
      img.onerror = () => resolve(reader.result)
      img.src = reader.result
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })

  const addFotos = (campo, files) => {
    if (!files?.length) return
    Array.from(files).forEach(async file => {
      const dataUrl = await comprimirImagen(file)
      if (!dataUrl) return
      setForm(f => ({
        ...f,
        [campo]: [...(f[campo] || []), { id: uid(), nombre: file.name, dataUrl, nota: '' }],
      }))
    })
  }

  // Video de evidencia (máx 30s). No cabe en la columna: se sube al bucket de
  // Storage y en la evidencia solo se guarda el link ({ tipo:'video', url }).
  const MAX_VIDEO_SEG = 30
  const MAX_VIDEO_BYTES = 75 * 1024 * 1024
  const [subiendoVideo, setSubiendoVideo] = useState(false)
  // Videos subidos al bucket en ESTA sesión de edición (aún no persistidos en el
  // trabajo). Si se cancela, o si se quitan antes de guardar, hay que borrarlos del
  // bucket para no dejar huérfanos.
  const videosSesionRef = useRef([])

  // Las fotos ya NO llegan en la lista de trabajos (pesan MB y viajaban en cada
  // poll: eran el ~98% del Fast Origin Transfer de Vercel). Al abrir una OT
  // existente se cargan aquí bajo demanda. evidCargadas marca que este formulario
  // tiene la verdad completa: solo entonces su guardado escribe la columna
  // evidencias (si no, el upsert la omite y la base conserva las fotos).
  const evidAntesRef = useRef(null) // lista del servidor al abrir (para diff de videos)
  const [evidCargadas, setEvidCargadas] = useState(!trabajo?.id) // OT nueva: no hay nada que cargar
  useEffect(() => {
    if (!trabajo?.id) return
    let vivo = true
    fetchEvidenciasTrabajo(trabajo.id)
      .then(servidor => {
        if (!vivo) return
        evidAntesRef.current = servidor
        setForm(f => {
          // Unión: la lista del servidor manda, más lo agregado localmente que aún
          // no está en ella (fotos tomadas antes de que resolviera esta carga).
          const clave = (e) => e?.id || e?.url || (e?.dataUrl || '').slice(0, 40)
          const vistas = new Set(servidor.map(clave))
          const localesNuevas = (f.evidenciasIngreso || []).filter(e => !vistas.has(clave(e)))
          return { ...f, evidenciasIngreso: [...servidor, ...localesNuevas] }
        })
        setEvidCargadas(true)
      })
      .catch(() => { /* sin red: se guarda sin tocar la columna evidencias */ })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajo?.id])
  const addVideo = async (campo, file) => {
    if (!file) return
    if (!file.type?.startsWith('video/')) { notify?.('Ese archivo no es un video.', 'error'); return }
    if (file.size > MAX_VIDEO_BYTES) { notify?.('El video pesa más de 75 MB. Grábalo más corto o en menor calidad.', 'error'); return }
    // Duración: se lee del propio archivo antes de subir.
    const dur = await new Promise(resolve => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => { const d = v.duration || 0; URL.revokeObjectURL(v.src); resolve(d) }
      v.onerror = () => { URL.revokeObjectURL(v.src); resolve(0) }
      v.src = URL.createObjectURL(file)
    })
    if (dur > MAX_VIDEO_SEG + 0.5) { notify?.(`El video dura ${Math.round(dur)}s. El máximo son ${MAX_VIDEO_SEG} segundos.`, 'error'); return }
    setSubiendoVideo(true)
    try {
      // Carpeta por OT: el `form` no tiene otCodigo/id, se toman del trabajo (o placa).
      const carpeta = trabajo?.otCodigo || trabajo?.id || form.placa || 'nueva'
      const { url, path } = await subirVideoEvidencia(file, carpeta)
      videosSesionRef.current.push({ url, path })
      setForm(f => ({ ...f, [campo]: [...(f[campo] || []), { id: uid(), nombre: file.name, tipo: 'video', url, path, nota: '' }] }))
      notify?.('Video subido.', 'success')
    } catch (e) {
      notify?.(`No se pudo subir el video: ${e.message}`, 'error')
    } finally {
      setSubiendoVideo(false)
    }
  }

  const actualizarNotaFoto = (campo, id, nota) => {
    setForm(f => ({
      ...f,
      [campo]: f[campo].map(x => x.id === id ? { ...x, nota } : x),
    }))
  }

  const quitarFoto = (campo, id) => {
    setForm(f => ({ ...f, [campo]: f[campo].filter(x => x.id !== id) }))
  }

  // Inventario centralizado desde Cuentti (con cache + auto-refresh + estado)
  const {
    inventario,
    loading: invLoading,
    refreshing: invRefreshing,
    error: invError,
    cacheAge: invCacheAge,
    isStale: invIsStale,
    refresh: refrescarInventario,
  } = useInventario()
  const [itemSearch, setItemSearch] = useState({}) // { [itemId]: { query, results, show } }
  // Tick para que el "hace Xs" se actualice cada 10s sin re-fetch
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 10000)
    return () => clearInterval(id)
  }, [])

  // Debounce timers ref
  const searchTimers = useRef({})

  const buscarEnInventario = useCallback((itemId, query) => {
    // Clear previous debounce
    if (searchTimers.current[itemId]) clearTimeout(searchTimers.current[itemId])

    if (!query || query.length < 2) {
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results: [], show: false } }))
      return
    }

    // Debounce 150ms
    searchTimers.current[itemId] = setTimeout(() => {
      const q = query.toLowerCase().trim()
      const terms = q.split(/\s+/).filter(Boolean)
      const scored = []

      for (const p of inventario) {
        const nombre = (p.nombre || '').toLowerCase()
        const codigo = (p.codigo || '').toLowerCase()
        const sku = (p.sku || '').toLowerCase()
        const barras = (p.codigoBarras || '').toLowerCase()

        // Multi-palabra: TODAS las palabras deben aparecer (en cualquier orden)
        const hay = `${nombre} ${codigo} ${sku} ${barras}`
        if (!terms.every(t => hay.includes(t))) continue

        let score = 0
        // Exact match on code/sku/barcode = highest priority (POS scanner)
        if (codigo === q || sku === q || barras === q) score = 100
        // Starts with on code/sku
        else if (codigo.startsWith(q) || sku.startsWith(q) || barras.startsWith(q)) score = 80
        // Exact name match
        else if (nombre === q) score = 70
        // Name starts with query
        else if (nombre.startsWith(q)) score = 60
        // Name contains query (word boundary)
        else if (nombre.includes(' ' + q)) score = 50
        // Name contains query
        else if (nombre.includes(q)) score = 40
        // Code/sku contains query
        else if (codigo.includes(q) || sku.includes(q) || barras.includes(q)) score = 30
        // Multi-palabra: todas presentes pero no como frase exacta
        else score = 35

        // Boost products with stock
        if (p.stock > 0) score += 5
        scored.push({ ...p, _score: score })
      }

      scored.sort((a, b) => b._score - a._score)
      const results = scored
      setItemSearch(prev => ({ ...prev, [itemId]: { query, results, show: results.length > 0 } }))
    }, 150)
  }, [inventario])

  const seleccionarProducto = (itemId, producto) => {
    // Guardar el nombre original del producto del inventario por separado
    // para que la descripcion (item.nombre) sea editable libremente sin perder
    // la referencia al SKU. nombreInventario sirve para mostrar "Cambiar producto".
    updateItem(itemId, 'nombre', producto.nombre)
    updateItem(itemId, 'nombreInventario', producto.nombre)
    updateItem(itemId, 'precio', producto.precio)
    updateItem(itemId, 'iva', producto.iva)
    updateItem(itemId, 'codigo', producto.codigo || producto.sku || '')
    updateItem(itemId, 'sku', producto.sku || '')
    updateItem(itemId, 'esServicio', !!producto.esServicio)
    // _bloqueado evita que el siguiente onChange del input dispare otra busqueda
    updateItem(itemId, '_bloqueado', true)
    setItemSearch(prev => ({ ...prev, [itemId]: { query: '', results: [], show: false } }))
  }

  const cambiarProducto = (itemId) => {
    // Permite volver a buscar otro producto: limpia bloqueo y SKU
    updateItem(itemId, '_bloqueado', false)
    updateItem(itemId, 'nombreInventario', '')
    updateItem(itemId, 'sku', '')
    updateItem(itemId, 'codigo', '')
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const modelosTrabajo = useMemo(() => getModelos(form.marca), [form.marca])

  // Seleccionar cliente de resultados
  const seleccionarCliente = (c) => {
    const ced = normalizarDoc(c)
    set('cedula', ced)
    set('cliente', normalizarNombre(c))
    set('telefonoCliente', fmtTelefono(c.telefono || c.phone || ''))
    set('emailCliente', c.email || c.correo || '')
    // El id de CUENTTI, no el local (c.id): mandar el id interno de la app hacía
    // que Cuentti facturara a quien tuviera ESE número en su base.
    set('clienteId', '')
    set('cuenttiId', c.cuenttiId || '')
    setResultados([])
    cargarVehiculoDeCliente(ced)
  }

  // Trae el vehiculo mas reciente del cliente y precarga placa/marca/modelo/año/km
  // SOLO si esos campos estan vacios. Asi, al elegir un cliente que ya tiene carro
  // registrado, no toca volver a digitarlo. Fuentes: tabla de vehiculos (por cedula
  // del propietario) + trabajos anteriores del mismo cliente.
  const cargarVehiculoDeCliente = (cedula) => {
    if (!cedula) return
    const candidatos = []
    if (vehiculosHook?.buscarPorCedula) {
      for (const v of vehiculosHook.buscarPorCedula(cedula)) {
        if (v.placa) candidatos.push({ placa: v.placa, marca: v.marca, modelo: v.modelo, ano: v.ano, cilindraje: v.cilindraje, kilometraje: v.kilometraje, _t: v.actualizadoEn || v.creadoEn || 0 })
      }
    }
    for (const t of allTrabajos) {
      if ((t.cedula || '') === cedula && t.placa) {
        candidatos.push({ placa: t.placa, marca: t.marca, modelo: t.modelo, ano: t.ano, cilindraje: t.cilindraje, kilometraje: t.kilometraje, _t: t.fecha || t.creadoEn || 0 })
      }
    }
    if (!candidatos.length) return
    candidatos.sort((a, b) => (new Date(b._t).getTime() || 0) - (new Date(a._t).getTime() || 0))
    const v = candidatos[0]
    setForm(prev => ({
      ...prev,
      placa: prev.placa || (v.placa || '').toUpperCase(),
      marca: prev.marca || v.marca || '',
      modelo: prev.modelo || v.modelo || '',
      ano: prev.ano || v.ano || prev.ano,
      cilindraje: prev.cilindraje || v.cilindraje || '',
      kilometraje: prev.kilometraje || v.kilometraje || '',
    }))
  }

  // Items
  const addItem = () => {
    setItems(prev => [...prev, {
      id: uid(), codigo: '', nombre: '', precio: 0, cantidad: 1, iva: IVA_DEFAULT, esServicio: false,
    }])
  }
  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }
  const removeItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  // Totales
  const totales = useMemo(() => {
    let subtotal = 0, iva = 0, total = 0, manoObra = 0, manoObraBase = 0, repuestos = 0
    items.forEach(i => {
      const precio = parseFloat(i.precio) || 0
      const cant = cantidadItem(i)
      const ivaPct = parseFloat(i.iva) || 0
      const lineaTotal = precio * cant
      const lineaBase = ivaPct > 0 ? lineaTotal / (1 + ivaPct / 100) : lineaTotal
      if (ivaPct > 0) {
        subtotal += lineaBase
        iva += lineaTotal - lineaBase
      } else {
        subtotal += lineaTotal
      }
      total += lineaTotal
      if (i.esServicio) { manoObra += lineaTotal; manoObraBase += lineaBase }
      else repuestos += lineaTotal
    })
    return {
      subtotal: Math.round(subtotal),
      iva: Math.round(iva),
      total: Math.round(total),
      manoObra: Math.round(manoObra),
      manoObraBase: Math.round(manoObraBase), // M.O. de servicios SIN IVA = base de la comisión
      repuestos: Math.round(repuestos),
    }
  }, [items])

  // Mano de obra efectiva (base de la comisión del técnico):
  //  - Si hay líneas marcadas "Servicio", manda esa suma (igual que siempre).
  //  - Si no hay (ej. cambio de aceite), se usa la mano de obra escrita a mano.
  const hayServicios = totales.manoObra > 0
  // M.O. adicional (no facturada): base extra que se SUMA a la comisión aunque ya
  // haya líneas de servicio. Ya es sin IVA (no se factura). No toca el total.
  const manoObraExtra = Math.max(0, parseFloat(form.manoObraExtra) || 0)
  // Mano de obra "de línea" (SIN el extra): las líneas de servicio o, si no hay, la
  // M.O. manual. Es lo que se guarda en `manoObra`; el extra va en su propio campo
  // y getManoObra/manoObraBase lo VUELVEN a sumar → guardarlo aquí lo duplicaría.
  const manoObraLinea = hayServicios ? totales.manoObra : Math.max(0, parseFloat(form.manoObra) || 0)
  const manoObraEf = manoObraLinea + manoObraExtra // solo para mostrar (la M.O. total acreditada)
  // La comisión se calcula sobre la base SIN IVA (igual que Liquidación, que es lo
  // que realmente cobra el técnico). El M.O. manual y el extra ya vienen sin IVA.
  const baseComision = (hayServicios ? totales.manoObraBase : Math.max(0, parseFloat(form.manoObra) || 0)) + manoObraExtra
  const comisionTecnico = Math.round(baseComision * COMISION.TOTAL)
  // Comisión que aporta solo el extra (para el preview de su propio campo).
  const comisionExtra = Math.round(manoObraExtra * COMISION.TOTAL)

  // Guardado real de la OT. skipAviso salta el aviso de M.O.=0 (patrón skipConfirm).
  // Candado anti doble-click (el 23-jul-2026 clicks repetidos crearon 22 OTs
  // duplicadas): mientras el guardado está en vuelo, los demás clicks se ignoran.
  const guardandoRef = useRef(false)
  const [guardando, setGuardando] = useState(false)
  const guardar = async (skipAviso = false) => {
    if (guardandoRef.current) return
    if ((!form.placa && !form.sinVehiculo) || !form.cliente) return
    // Aviso: OT con valor pero sin mano de obra (ninguna línea "Servicio" ni M.O.
    // manual) → el técnico asignado quedaría con comisión $0, que solo se descubre
    // al liquidar días después.
    if (!skipAviso && totales.total > 0 && baseComision === 0 && form.tecnicoId) {
      setConfirmCfg({
        title: 'Sin mano de obra',
        lead: 'El técnico no recibirá comisión.',
        confirmLabel: 'Guardar igual',
        tone: 'danger',
        onConfirm: () => guardar(true),
      })
      return
    }
    guardandoRef.current = true
    setGuardando(true)
    try {
    await onSave({
      ...form,
      placa: (form.placa || (form.sinVehiculo ? 'SERVICIO' : '')).toUpperCase(),
      // Sin año escrito se guarda vacío: antes se inventaba el año actual y
      // toda OT sin dato quedaba como carro 2026.
      ano: parseInt(form.ano) || null,
      kilometraje: parseInt(form.kilometraje) || 0,
      tecnicoId: parseInt(form.tecnicoId) || null,
      items,
      subtotalSinIva: totales.subtotal,
      totalIva: totales.iva,
      total: totales.total,
      manoObra: manoObraLinea, // SIN el extra (el extra va aparte y se re-suma al liquidar)
      manoObraExtra,
      repuestos: totales.repuestos,
      estado: form.estado || trabajo?.estado || ESTADOS.PENDIENTE,
      fecha: new Date(form.fecha + 'T12:00:00').toISOString(),
      evidenciasIngreso: form.evidenciasIngreso,
      evidenciasEntrega: form.evidenciasEntrega,
      // Evidencias completas en este form → el upsert puede escribir la columna.
      // _evidAntes = lista del servidor al abrir (el padre la usa para el diff de
      // videos quitados; se descarta antes de persistir).
      _evidCargadas: evidCargadas,
      _evidAntes: evidAntesRef.current,
      // Próximo mantenimiento (CRM)
      tipoAceite: form.tipoAceite || null,
      proximoKm: form.proximoKm ? parseInt(form.proximoKm) : null,
      proximaVisita: form.proximaVisita ? new Date(form.proximaVisita + 'T12:00:00').toISOString() : null,
      notasProximoMant: form.notasProximoMant || '',
    })
    // Videos subidos esta sesión que NO quedaron en el trabajo (agregados y luego
    // quitados antes de guardar) → borrarlos del bucket. Los que sí quedan ya están
    // persistidos; los que estaban en el trabajo original y se quitaron los borra el
    // diff del onSave del padre.
    const urlsFinal = new Set((form.evidenciasIngreso || []).filter(e => e?.tipo === 'video').map(e => e.url))
    videosSesionRef.current.filter(v => !urlsFinal.has(v.url)).forEach(v => borrarVideoEvidencia(v))
    videosSesionRef.current = []
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    guardar()
  }

  // Cancelar: nada se guardó, así que se borran del bucket los videos subidos en
  // ESTA sesión (si no, quedan huérfanos, sobre todo en una OT nueva descartada).
  const cancelar = () => {
    videosSesionRef.current.forEach(v => borrarVideoEvidencia(v))
    videosSesionRef.current = []
    onCancel()
  }

  // Auto-calcular próximo km y fecha cuando cambia el tipo de aceite
  const setTipoAceite = (tipo) => {
    setForm(f => {
      const kmActual = parseInt(f.kilometraje) || 0
      let proximoKm = f.proximoKm
      let proximaVisita = f.proximaVisita
      if (tipo === 'mineral' && kmActual > 0) {
        proximoKm = kmActual + 5000
      } else if (tipo === 'sintetico' && kmActual > 0) {
        proximoKm = kmActual + 10000
      }
      // Calcular fecha estimada
      if (tipo === 'mineral') {
        const d = new Date()
        d.setMonth(d.getMonth() + 4)
        proximaVisita = d.toISOString().slice(0, 10)
      } else if (tipo === 'sintetico') {
        const d = new Date()
        d.setMonth(d.getMonth() + 6)
        proximaVisita = d.toISOString().slice(0, 10)
      }
      return { ...f, tipoAceite: tipo, proximoKm: String(proximoKm || ''), proximaVisita }
    })
  }

  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>{isEdit ? 'Editar Trabajo' : 'Nuevo Trabajo'}</h2>
          {isEdit && trabajo && (
            <div className="pagehd__meta">
              {trabajo.otCodigo && <span className="pagehd__ot">{trabajo.otCodigo}</span>}
              {trabajo.fecha && <><span className="pagehd__sep">·</span><span>Creado {fmtDate(trabajo.fecha)}</span></>}
              {trabajo.estado && <><span className="pagehd__sep">·</span><span className={`badge ${
                trabajo.estado === ESTADOS.COMPLETADO ? 'badge-success' :
                trabajo.estado === ESTADOS.EN_PROGRESO ? 'badge-info' :
                trabajo.estado === ESTADOS.PENDIENTE ? 'badge-warning' :
                'badge-neutral'
              }`}>{trabajo.estado}</span></>}
            </div>
          )}
        </div>
        <div className="actions"><Button variant="outline" onClick={cancelar}>Volver</Button></div>
      </div>

      <form onSubmit={handleSubmit} className="form-stack">
        {/* ¿QUIÉN ATIENDE? — lo primero de la OT: se asigna el técnico de una.
           Con solo 3 técnicos, tocar un chip es más rápido que abrir un menú. */}
        <div className="card">
          <div className="card__h"><h3>¿Quién atiende esta orden? <span className="req">*</span></h3></div>
          <div className="card__b">
            <div className="tec-chips">
              {TECNICOS.filter(t => t.activo !== false || String(t.id) === String(form.tecnicoId)).map(t => {
                const sel = String(form.tecnicoId) === String(t.id)
                // Iniciales inline desde t.nombre: tecIniciales() vive en el componente
                // Trabajos, no en TrabajoForm, así que aquí no está en scope.
                const _p = (t.nombre || '').trim().split(/\s+/)
                const ini = (_p.length >= 2 ? _p[0][0] + _p[1][0] : (t.nombre || '?').slice(0, 2)).toUpperCase()
                return (
                  <button type="button" key={t.id} className={`tec-chip${sel ? ' on' : ''}`} aria-pressed={sel}
                    onClick={() => set('tecnicoId', String(t.id))}>
                    <span className={`av av-${((parseInt(t.id) || 1) - 1) % 5 + 1}`}>{ini}</span>
                    <span>{(t.nombre || '').split(' ')[0]}{t.activo === false ? ' (inactivo)' : ''}</span>
                    {sel && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, marginRight: 2 }}><path d="M20 6 9 17l-5-5" /></svg>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* CLIENTE + VEHICULO en 2 columnas */}
        <div className="form-grid-2">
        {/* CLIENTE */}
        <div className="card">
          <div className="card__h"><h3>Cliente</h3></div>
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field" style={{ position: 'relative' }}>
              <label>Cédula / NIT <span className="req">*</span></label>
              <input className="input" value={form.cedula} placeholder="Buscar por documento..."
                onFocus={() => setCampoActivo('cedula')}
                onChange={e => { set('cedula', e.target.value); buscarDebounced(e.target.value) }} />
              {resultados.length > 0 && campoActivo === 'cedula' && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                  {resultados.map((c, i) => (
                    <div key={i} onClick={() => seleccionarCliente(c)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <strong>{normalizarDoc(c)}</strong> — {normalizarNombre(c)}
                      {c.telefono && <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>{fmtTelefono(c.telefono)}</span>}
                    </div>
                  ))}
                </div>
              )}
              {buscando && <span className="help">Buscando en Cuentti...</span>}
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>Nombre del Cliente</label>
              <input className="input" value={form.cliente} required placeholder="Nombre o documento..."
                onFocus={() => setCampoActivo('nombre')}
                onChange={e => { set('cliente', e.target.value); buscarDebounced(e.target.value) }} />
              {resultados.length > 0 && campoActivo === 'nombre' && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                  {resultados.map((c, i) => (
                    <div key={i} onMouseDown={() => seleccionarCliente(c)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <strong>{normalizarNombre(c)}</strong> <span style={{ color: 'var(--text-3)' }}>· {normalizarDoc(c)}</span>
                      {c.telefono && <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>{fmtTelefono(c.telefono)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Teléfono</label>
              <input className="input" value={form.telefonoCliente} placeholder="300..." onChange={e => set('telefonoCliente', e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.emailCliente} placeholder="email@..." onChange={e => set('emailCliente', e.target.value)} />
            </div>
          </div>
        </div>

        {/* VEHICULO */}
        <div className="card">
          <div className="card__h" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h3>Vehículo</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
              <Switch checked={!!form.sinVehiculo} onChange={v => set('sinVehiculo', v)} ariaLabel="Servicio sin vehículo" />
              <span style={{ cursor: 'pointer' }} onClick={() => set('sinVehiculo', !form.sinVehiculo)}>Servicio sin vehículo (no entra carro)</span>
            </div>
          </div>
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Placa {!form.sinVehiculo && <span className="req">*</span>}</label>
              <input className="input" value={form.placa} required={!form.sinVehiculo} disabled={form.sinVehiculo} placeholder={form.sinVehiculo ? 'No aplica' : 'ABC123'} style={{ textTransform: 'uppercase' }}
                onChange={e => {
                  const placa = e.target.value.toUpperCase()
                  set('placa', placa)
                  if (placa.length >= 6) {
                    const prev = allTrabajos.find(t => (t.placa || '').toUpperCase() === placa && t.id !== trabajo?.id)
                    if (prev) {
                      if (!form.marca && prev.marca) set('marca', prev.marca)
                      if (!form.modelo && prev.modelo) set('modelo', prev.modelo)
                      if (!form.cliente && prev.cliente) set('cliente', prev.cliente)
                      if (!form.cedula && prev.cedula) set('cedula', prev.cedula)
                      if (!form.telefonoCliente && prev.telefonoCliente) set('telefonoCliente', prev.telefonoCliente)
                    }
                  }
                }} />
            </div>
            <div className="field">
              <label>Marca {!form.sinVehiculo && <span className="req">*</span>}</label>
              <select className="input" value={form.marca} required={!form.sinVehiculo} disabled={form.sinVehiculo} onChange={e => { set('marca', e.target.value); set('modelo', '') }}>
                <option value="">Seleccionar...</option>
                {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Modelo</label>
              <select className="input" value={form.modelo} onChange={e => set('modelo', e.target.value)} disabled={form.sinVehiculo || !form.marca}>
                <option value="">Seleccionar...</option>
                {modelosTrabajo.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Año</label>
              <input className="input" type="number" value={form.ano} min="1980" max="2030" placeholder="Ej. 2018" disabled={form.sinVehiculo} onChange={e => set('ano', e.target.value)} />
            </div>
            <div className="field">
              <label>Cilindraje</label>
              <select className="input" value={form.cilindraje} disabled={form.sinVehiculo} onChange={e => set('cilindraje', e.target.value)}>
                <option value="">Seleccionar</option>
                {form.cilindraje && !CILINDRAJES.some(c => `${c}L` === form.cilindraje) && <option value={form.cilindraje}>{form.cilindraje}</option>}
                {CILINDRAJES.map(c => <option key={c} value={`${c}L`}>{c} L</option>)}
              </select>
            </div>
            <div className="field">
              <label>Kilometraje</label>
              <input className="input" type="number" value={form.kilometraje} min="0" placeholder="45000" disabled={form.sinVehiculo} onChange={e => set('kilometraje', e.target.value)} />
            </div>
          </div>
        </div>
        </div>{/* /form-grid-2 */}

        {/* ===== Dos paneles: contexto (derecha) + plata (izquierda) ===== */}
        <div className="ot-grid">
        {/* Columna DERECHA — vehículo y contexto (el grid la manda a la derecha) */}
        <div className="ot-col ot-col--side">

        {!form.sinVehiculo && (
          <div className="card">
            <div className="card__h"><h3>Estado de ingreso del vehículo <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginLeft: 6 }}>(inventario · combustible · daños)</span></h3></div>
            <div className="card__b">
              <IngresoVehiculo value={form.ingreso} onChange={v => set('ingreso', v)} />
            </div>
          </div>
        )}

        {/* HISTORIAL POR PLACA */}
        {form.placa.length >= 6 && (() => {
          const historial = allTrabajos.filter(t =>
            (t.placa || '').toUpperCase() === form.placa.toUpperCase() && t.id !== trabajo?.id
          ).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
          if (!historial.length) return null
          return (
            <div className="card" style={{ borderColor: 'rgba(37,99,235,.28)', background: 'rgba(37,99,235,.04)' }}>
              <button type="button" className="card__h card__h--toggle" onClick={() => setShowHistorial(v => !v)} style={{ background: 'none' }}>
                <h3 style={{ color: 'var(--blue-700)' }}>Historial de {form.placa.toUpperCase()} <span style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--blue-600)' }}>· {historial.length} anteriores</span></h3>
                <Chevron open={showHistorial} />
              </button>
              {showHistorial && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>OT</th>
                        <th>Estado</th>
                        <th>Técnico</th>
                        <th className="text-right">Total</th>
                        <th>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.slice(0, 5).map(h => (
                        <tr key={h.id}>
                          <td className="text-mono text-sm">{h.otCodigo || '—'}</td>
                          <td><span className={`badge ${h.estado === 'Completado' ? 'badge-success' : 'badge-warning'}`}>{h.estado}</span></td>
                          <td className="text-sm">{TECNICOS.find(t => t.id === parseInt(h.tecnicoId))?.nombre || '—'}</td>
                          <td className="text-right text-mono">{fmt(h.total)}</td>
                          <td className="text-sm text-muted">{fmtDate(h.fecha)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })()}

        {/* EVIDENCIAS */}
        <div className="card">
          <button type="button" className="card__h card__h--toggle" onClick={() => setShowEvid(v => !v)}>
            <h3>Evidencias del trabajo
              {form.evidenciasIngreso.length > 0 && (
                <span className="sec-count">{form.evidenciasIngreso.length}</span>
              )}
            </h3>
            <Chevron open={showEvid} />
          </button>
          {showEvid && (
          <div className="card__b">
            <div className="field">
              <label>Fotos y videos de la orden de trabajo</label>
              <input type="file" accept="image/*" multiple onChange={e => addFotos('evidenciasIngreso', e.target.files)} />
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label className="btn btn-outline btn-sm" style={{ cursor: subiendoVideo ? 'wait' : 'pointer', margin: 0 }}>
                  {subiendoVideo ? 'Subiendo video…' : '+ Agregar video (máx 30s)'}
                  <input type="file" accept="video/*" capture="environment" disabled={subiendoVideo}
                    onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; addVideo('evidenciasIngreso', file) }}
                    style={{ display: 'none' }} />
                </label>
                {subiendoVideo && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No cierres esta ventana hasta que termine.</span>}
              </div>
              <ThumbGrid fotos={form.evidenciasIngreso} onNota={(id, nota) => actualizarNotaFoto('evidenciasIngreso', id, nota)} onRemove={id => quitarFoto('evidenciasIngreso', id)} />
            </div>
          </div>
          )}
        </div>
        </div>{/* /ot-col side */}

        {/* Columna IZQUIERDA — la orden y la plata */}
        <div className="ot-col ot-col--main">

        {/* ITEMS */}
        <div className="card">
          <div className="card__h" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ flex: '0 0 auto' }}>Repuestos y Servicios {invLoading
              ? <span className="count">Cargando...</span>
              : (invError && inventario.length === 0)
                ? <button type="button" className="count" onClick={refrescarInventario} style={{ cursor: 'pointer', background: 'rgba(220,38,38,.1)', color: 'var(--red-700,#b91c1c)', border: '1px solid rgba(220,38,38,.3)' }}>⚠ No cargó · Reintentar</button>
                : <span className="count">{inventario.length} productos</span>
            }</h3>
            {/* Indicador del estado del inventario Cuentti */}
            {!invLoading && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11.5, color: 'var(--text-3)',
                padding: '4px 10px', borderRadius: 999,
                background: invIsStale ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.10)',
                border: `1px solid ${invIsStale ? 'rgba(245,158,11,.4)' : 'rgba(34,197,94,.3)'}`,
              }} title={`Inventario sincronizado con Cuentti ${formatCacheAge(invCacheAge)}${invIsStale ? ' (recomendado refrescar)' : ''}`}>
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: invRefreshing ? 'var(--blue-500)' : (invIsStale ? 'var(--amber-500)' : 'var(--green-500)'),
                  animation: invRefreshing ? 'pulse 1s infinite' : 'none',
                }} />
                <span style={{ fontWeight: 600 }}>
                  {invRefreshing ? 'Sincronizando…' : `Cuentti ${formatCacheAge(invCacheAge)}`}
                </span>
                <button type="button"
                  onClick={refrescarInventario}
                  disabled={invRefreshing}
                  style={{ background: 'none', border: 'none', color: 'var(--blue-600)', cursor: 'pointer', fontWeight: 700, padding: 0, fontSize: 11.5 }}>
                  ↻ Refrescar
                </button>
              </div>
            )}
            <Button variant="outline" size="sm" type="button" onClick={addItem} style={{ marginLeft: 'auto' }}>+ Agregar línea</Button>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13.5 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .55 }}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              <div style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: 14 }}>Sin repuestos ni servicios</div>
              <div style={{ marginTop: 5, fontSize: 13 }}>Usa el botón <strong>+ Agregar línea</strong> para añadir ítems.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Descripción</th>
                    <th style={{ width: '15%' }}>Precio</th>
                    <th style={{ width: '10%' }}>Cant.</th>
                    <th style={{ width: '10%' }}>IVA %</th>
                    <th style={{ width: '10%' }}>Servicio</th>
                    <th style={{ width: '15%' }} className="text-right">Total</th>
                    <th style={{ width: '5%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const lineTotal = (parseFloat(item.precio) || 0) * (cantidadItem(item))
                    const searchState = itemSearch[item.id]
                    return (
                      <tr key={item.id}>
                        <td style={{ position: 'relative' }}>
                          <div style={{ position: 'relative' }}>
                            <input className="form-input" value={item.nombre} placeholder={item._bloqueado ? 'Edita la descripción libremente...' : 'Producto, código o referencia...'}
                              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name={`it-desc-${item.id}`}
                              onChange={e => {
                                updateItem(item.id, 'nombre', e.target.value)
                                // Solo dispara busqueda si el item NO ha sido bloqueado por una seleccion previa
                                if (!item._bloqueado) buscarEnInventario(item.id, e.target.value)
                              }}
                              onFocus={() => {
                                if (!item._bloqueado && item.nombre && item.nombre.length >= 2) buscarEnInventario(item.id, item.nombre)
                              }}
                              onBlur={() => setTimeout(() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } })), 250)}
                              onKeyDown={e => {
                                if (e.key === 'Escape') setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))
                              }}
                              style={{ padding: '6px 32px 6px 10px', fontSize: 13 }} />
                            {invLoading && !item._bloqueado && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-3)' }}>...</span>}
                            {item._bloqueado && (
                              <button type="button" onClick={() => cambiarProducto(item.id)}
                                title={`Cambiar producto (actual: ${item.nombreInventario || item.sku || 'sin SKU'})`}
                                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--blue-600)', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}>
                                🔄
                              </button>
                            )}
                          </div>
                          {item._bloqueado && item.sku && (
                            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                              SKU: {item.sku}{item.nombreInventario && item.nombreInventario !== item.nombre ? ` · ${item.nombreInventario}` : ''}
                            </div>
                          )}
                          {/* Command Palette — Product Search */}
                          {searchState?.show && searchState.results.length > 0 && (
                            <div className="cmd-backdrop" onClick={() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>
                              <div className="cmd-palette" onClick={e => e.stopPropagation()}>
                                {/* Search header */}
                                <div className="cmd-header">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                                  </svg>
                                  <span className="cmd-header__query">{searchState.query}</span>
                                  <span className="cmd-header__count">
                                    <strong>{searchState.results.length}</strong> resultados
                                    {(form.marca || form.modelo) && <> &middot; {form.marca} {form.modelo} {form.ano}</>}
                                  </span>
                                  <kbd className="cmd-kbd" onClick={() => setItemSearch(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>ESC</kbd>
                                </div>

                                {/* Results */}
                                <div className="cmd-results">
                                  {searchState.results.map((p) => {
                                    const q = (searchState.query || '').toLowerCase()
                                    const nombre = p.nombre || ''
                                    const idx = nombre.toLowerCase().indexOf(q)
                                    return (
                                      <div key={p.id} className="cmd-row"
                                        onClick={() => seleccionarProducto(item.id, p)}>
                                        <div className="cmd-row__info">
                                          <div className="cmd-row__name">
                                            {idx >= 0 && q.length >= 2
                                              ? <>{nombre.slice(0, idx)}<mark>{nombre.slice(idx, idx + q.length)}</mark>{nombre.slice(idx + q.length)}</>
                                              : nombre}
                                          </div>
                                          <div className="cmd-row__meta">
                                            {p.codigoBarras && <span>Cod: {p.codigoBarras}</span>}
                                            {p.sku && <span>SKU: {p.sku}</span>}
                                            {(!p.codigoBarras && !p.sku && p.codigo) && <span>Ref: {p.codigo}</span>}
                                            {p.precioBase > 0 && <><span>&middot;</span><span>Base: {fmt(p.precioBase)}</span></>}
                                            {p.iva > 0 && <><span>&middot;</span><span>IVA {p.iva}%</span></>}
                                          </div>
                                        </div>
                                        <div className="cmd-row__price">
                                          <div className="cmd-row__price-val">{fmt(p.precio)}</div>
                                          <div className="cmd-row__price-lbl">P. venta</div>
                                        </div>
                                        <div className="cmd-row__stock">
                                          <span className={`badge ${p.esServicio ? 'badge-info' : p.stock > 3 ? 'badge-success' : p.stock > 0 ? 'badge-warning' : 'badge-danger'}`}
                                            style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                                            {p.esServicio ? 'Servicio' : `${p.stock} und`}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                {/* Footer shortcuts */}
                                <div className="cmd-footer">
                                  <span><kbd className="cmd-kbd-sm">&uarr;&darr;</kbd> navegar</span>
                                  <span><kbd className="cmd-kbd-sm">&crarr;</kbd> seleccionar</span>
                                  <span style={{ marginLeft: 'auto', opacity: .7 }}>Inventario sincronizado con Cuentti</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          <MoneyInput className="form-input" value={Math.round(parseFloat(item.precio) || 0)}
                            onChange={v => updateItem(item.id, 'precio', v)}
                            inputStyle={{ padding: '6px 10px 6px 22px', fontSize: 13, textAlign: 'right' }} />
                        </td>
                        <td>
                          {/* step="any": se puede facturar media silicona (0,5) o un
                             cuarto de galón. min="1" y el paso entero por defecto
                             marcaban 0,5 como inválido. */}
                          <input className="form-input" type="number" value={item.cantidad} min="0" step="any"
                            title="Acepta decimales: 0,5 = media unidad"
                            onChange={e => updateItem(item.id, 'cantidad', e.target.value)}
                            style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} />
                        </td>
                        <td>
                          <input className="form-input" type="number" value={item.iva} min="0"
                            onChange={e => updateItem(item.id, 'iva', e.target.value)}
                            style={{ padding: '6px 10px', fontSize: 13, textAlign: 'center', width: 60 }} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={!!item.esServicio}
                            onChange={e => updateItem(item.id, 'esServicio', e.target.checked)}
                            title="Marcar como mano de obra / servicio"
                          />
                        </td>
                        <td className="text-right text-mono" style={{ fontWeight: 600 }}>{fmt(lineTotal)}</td>
                        <td>
                          <Button variant="ghost" size="sm" type="button" aria-label="Eliminar ítem" onClick={() => removeItem(item.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* MANO DE OBRA MANUAL — cuando no hay línea marcada "Servicio" (ej. cambio de aceite) */}
          {!hayServicios && (
            <div className="mo-manual">
              <div className="mo-manual__row">
                <div className="field" style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <label htmlFor="mo-manual-input">Mano de obra del técnico <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>(opcional)</span></label>
                  <MoneyInput id="mo-manual-input" value={form.manoObra} onChange={v => set('manoObra', v)} placeholder="0" />
                </div>
                <div className="mo-manual__com">
                  <span className="mo-manual__com-lbl">Comisión técnico ({COMISION.TOTAL * 100}%)</span>
                  <span className="mo-manual__com-val">{fmt(comisionTecnico)}</span>
                </div>
              </div>
            </div>
          )}

          {/* M.O. ADICIONAL (no facturada) — cuando YA hay línea de Servicio pero se
              hizo trabajo extra que se le paga al técnico sin cobrarlo al cliente
              (ej. la mano de obra del cambio de aceite además de la reparación). */}
          {hayServicios && (
            <div className="mo-manual">
              <div className="mo-manual__row">
                <div className="field" style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <label htmlFor="mo-extra-input">Mano de obra adicional del técnico <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>(no se le cobra al cliente)</span></label>
                  <MoneyInput id="mo-extra-input" value={form.manoObraExtra} onChange={v => set('manoObraExtra', v)} placeholder="0" />
                </div>
                <div className="mo-manual__com">
                  <span className="mo-manual__com-lbl">Comisión adicional ({COMISION.TOTAL * 100}%)</span>
                  <span className="mo-manual__com-val">{fmt(comisionExtra)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Totales — totalizer redesigned (M.O./Repuestos breakdown + Total destacado) */}
          <div className="ot-totals">
            <div className="ot-totals__group">
              <span className="ot-stat"><span className="ot-stat__lbl">Mano de obra</span><span className="ot-stat__val">{fmt(manoObraEf)}</span></span>
              <span className="ot-stat"><span className="ot-stat__lbl">Repuestos</span><span className="ot-stat__val">{fmt(totales.repuestos)}</span></span>
            </div>
            <div className="ot-totals__group">
              <span className="ot-stat"><span className="ot-stat__lbl">Subtotal</span><span className="ot-stat__val">{fmt(totales.subtotal)}</span></span>
              <span className="ot-stat"><span className="ot-stat__lbl">IVA</span><span className="ot-stat__val">{fmt(totales.iva)}</span></span>
              <span className="ot-stat ot-stat--big"><span className="ot-stat__lbl">Total</span><span className="ot-stat__val">{fmt(totales.total)}</span></span>
            </div>
          </div>
        </div>

        {/* PROXIMO MANTENIMIENTO (opcional, alimenta CRM) */}
        <div className="card">
          <button type="button" className="card__h card__h--toggle" onClick={() => setShowMant(v => !v)}>
            <h3>Próximo mantenimiento <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginLeft: 6 }}>(opcional · alimenta CRM)</span></h3>
            <Chevron open={showMant} />
          </button>
          {showMant && (
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Tipo de aceite usado en este servicio</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  ['', 'Sin especificar'],
                  ['mineral', 'Mineral / Semisintético (5,000 km)'],
                  ['sintetico', 'Full sintético (10,000 km)'],
                  ['no_aplica', 'No se cambió aceite'],
                ].map(([val, lbl]) => (
                  <label key={val || 'none'} style={{
                    flex: '1 1 200px',
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                    border: `1.5px solid ${form.tipoAceite === val ? 'var(--blue-600)' : 'var(--border)'}`,
                    background: form.tipoAceite === val ? 'var(--blue-50,#eff6ff)' : 'var(--bg-raised)',
                    borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  }}>
                    <input type="radio" name="tipoAceite" value={val} checked={form.tipoAceite === val}
                      onChange={() => setTipoAceite(val)} style={{ margin: 0 }} />
                    {lbl}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Si no eliges nada, el CRM detecta el tipo automáticamente leyendo los items facturados.
              </div>
            </div>
            <div className="field">
              <label>Próximo cambio (km)</label>
              <input className="input" type="number" value={form.proximoKm}
                onChange={e => set('proximoKm', e.target.value)}
                placeholder={form.kilometraje ? `Sugerido: ${(parseInt(form.kilometraje) || 0) + 5000}` : 'Ej: 95000'} />
            </div>
            <div className="field">
              <label>Próxima visita estimada</label>
              <input className="input" type="date" value={form.proximaVisita} onChange={e => set('proximaVisita', e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Notas para el próximo servicio (opcional)</label>
              <input className="input" value={form.notasProximoMant}
                onChange={e => set('notasProximoMant', e.target.value)}
                placeholder="Ej: revisar pastillas, alineación pendiente..." />
            </div>
          </div>
          )}
        </div>

        {/* OBSERVACIONES */}
        <div className="card">
          <div className="card__h"><h3>Observaciones</h3></div>
          <div className="card__b" style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr 1fr' : '1fr', gap: 14 }}>
            <div className="field">
              <label>Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
            </div>
            {isEdit && (
              <div className="field">
                <label>Estado</label>
                <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}>
                  {Object.values(ESTADOS).map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Diagnóstico / Notas</label>
              <textarea className="input" value={form.observaciones} placeholder="Diagnóstico, notas, recomendaciones..."
                onChange={e => set('observaciones', e.target.value)} style={{ minHeight: 88, resize: 'vertical' }} />
            </div>
          </div>
        </div>
        </div>{/* /ot-col main */}
        </div>{/* /ot-grid */}

        {/* ACCIONES */}
        <div className="form-actionbar">
          <div className="form-actionbar__total">
            <span className="lbl">Total OT</span>
            <span className="val">{fmt(totales.total)}</span>
          </div>
          <div className="form-actionbar__btns">
            <Button variant="outline" type="button" onClick={cancelar}>Cancelar</Button>
            <Button variant="primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : isEdit ? 'Actualizar OT' : `Guardar OT · ${fmt(totales.total)}`}</Button>
          </div>
        </div>
      </form>
      <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </div>
  )
}

function ThumbGrid({ fotos = [], onNota, onRemove }) {
  if (!fotos.length) return null
  return (
    <div className="thumb-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8, marginTop: 10 }}>
      {fotos.map(fv => (
        <div key={fv.id} style={{ border: '1px solid var(--slate-200)', borderRadius: 8, padding: 6 }}>
          <div style={{ position: 'relative', paddingBottom: '70%', overflow: 'hidden', borderRadius: 6, marginBottom: 6, background: '#000' }}>
            {fv.tipo === 'video'
              ? <video src={fv.url} controls preload="metadata" playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src={fv.dataUrl} alt={fv.nombre} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <input className="form-input text-xs" placeholder="Nota breve" value={fv.nota || ''}
            onChange={e => onNota?.(fv.id, e.target.value)} />
          <Button variant="ghost" size="sm" type="button" onClick={() => onRemove?.(fv.id)} style={{ width: '100%', marginTop: 4 }}>Eliminar</Button>
        </div>
      ))}
    </div>
  )
}

