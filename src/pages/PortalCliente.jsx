import { useState, useEffect, useRef } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { InspeccionDetalle } from './Inspecciones'
import { ESTADOS, TECNICOS, TALLER } from '../utils/constants'
import { fmtDate, fmt, tituloCliente, cantidadItem, fmtCant } from '../utils/helpers'
import { labelInventario, etiquetaCombustible, ingresoTieneAlgo } from '../utils/ingreso'
import { Button, IconX } from '../components/ui'
import SignaturePad from '../components/SignaturePad'
import { drawHeader, drawSectionHeader, drawDataBlock, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS, SEVERITY_HEAD } from '../utils/pdfTheme'

// Capitaliza el nombre del cliente que viene en MAYÚSCULAS ("TRANSPORTES
// MAJAGUA S.A.S." → "Transportes Majagua S.A.S."). Se muestra COMPLETO, no solo
// la primera palabra. Las siglas jurídicas (con punto, o SAS/SA/LTDA/CIA/EU) se
// dejan en mayúscula; el resto va con inicial mayúscula (respeta ñ/tildes).

// Una evidencia es video si trae { tipo:'video', url } (las fotos traen dataUrl).
const esVideoEvid = (f) => f?.tipo === 'video' || (!!f?.url && !f?.dataUrl)

// Miniatura de una evidencia (foto o video). El video muestra su primer frame
// con un ▶ encima; la foto, la imagen.
function MiniEvid({ f }) {
  if (esVideoEvid(f)) return (
    <>
      <video src={f.url} muted preload="metadata" playsInline style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
      <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
        <span style={{width:30,height:30,borderRadius:'50%',background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </span>
    </>
  )
  return <img src={f.dataUrl} alt={f.nota||'Evidencia'} loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
}

// color = acento vivo para barras de progreso y círculos de paso.
// cls   = clase de badge con contraste AA en tema claro y oscuro (ver .badge-* en index.css).
// ink   = color del rótulo grande de estado; se adapta al tema (no usar el hex vivo, que baja a ~2.8:1).
const ESTADO_TRABAJO_DISPLAY = {
  [ESTADOS.PENDIENTE]: { label: 'Recibido', color: '#64748b', cls: 'badge-n', ink: 'var(--text)', icon: '1', pct: 15 },
  [ESTADOS.EN_DIAGNOSTICO]: { label: 'En diagnóstico', color: '#2563eb', cls: 'badge-i', ink: 'var(--blue-600)', icon: '2', pct: 30 },
  [ESTADOS.ESPERANDO_REPUESTOS]: { label: 'Esperando repuestos', color: '#d97706', cls: 'badge-w', ink: 'var(--amber-700)', icon: '3', pct: 45 },
  [ESTADOS.EN_PROGRESO]: { label: 'En reparación', color: '#2563eb', cls: 'badge-i', ink: 'var(--blue-600)', icon: '4', pct: 60 },
  [ESTADOS.EN_PRUEBA]: { label: 'En Prueba', color: '#7c3aed', cls: 'badge-p', ink: 'var(--purple-700)', icon: '5', pct: 80 },
  [ESTADOS.COMPLETADO]: { label: 'Listo para Entrega', color: '#16a34a', cls: 'badge-s', ink: 'var(--green-700)', icon: '6', pct: 100 },
  [ESTADOS.PROGRAMADO]: { label: 'Programado', color: '#64748b', cls: 'badge-n', ink: 'var(--text)', icon: '—', pct: 10 },
  [ESTADOS.CANCELADO]: { label: 'Cancelado', color: '#dc2626', cls: 'badge-d', ink: 'var(--red-700)', icon: '✕', pct: 0 },
}

// "SERVICIO" es el marcador INTERNO de un trabajo sin carro (venta de mostrador).
// Al cliente no se le enseña esa jerga —"Placa SERVICIO" parece un error del
// documento—: se dice "Sin vehículo", igual que en la tabla de Liquidación.
// Solo cuenta la marca EXPLÍCITA (sinVehiculo) o el marcador SERVICIO — igual que
// Liquidacion.jsx. Tratar una placa vacía como "sin vehículo" borraba el carro de
// registros que sí lo tienen: en cotizaciones la placa no es obligatoria, así que
// una cotización de un Corolla sin placa salía como "Servicio sin vehículo" y
// perdía marca y modelo, mientras su PDF sí mostraba "Vehículo: Toyota Corolla".
const esSinVehiculo = (t) => !!t?.sinVehiculo || ['SERVICIO', '—'].includes((t?.placa || '').trim().toUpperCase())

// Un registro solo va SIN vehículo si además no hay marca ni modelo que mostrar:
// sin placa pero con "Toyota Corolla" hay carro. Mismo criterio que el PDF de
// cotizaciones (hayVehiculo en Cotizaciones.jsx), para que los dos documentos que
// recibe el mismo cliente no se contradigan.
const sinDatosVehiculo = (t) => esSinVehiculo(t) &&
  !['placa', 'marca', 'modelo'].some(k => (t?.[k] || '').toString().trim() && (t[k] || '').toString().trim().toUpperCase() !== 'SERVICIO')

// Columnas que el portal SÍ necesita. Se piden explícitamente (en vez de SELECT *)
// para NO exponer datos sensibles del cliente (telefono_cliente, email_cliente,
// firma_cliente) a cualquiera que conozca/adivine una cédula. 'inspeccion' se omite
// a propósito: no es una columna real (pedirla haría fallar la consulta).
const SELECT_PORTAL = [
  'id', 'fecha', 'created_at', 'cedula_cliente', 'cliente', 'placa', 'marca', 'modelo',
  'ano', 'kilometraje', 'tecnico_id', 'estado', 'observaciones', 'items', 'total',
  'ot_codigo', 'tipo_aceite', 'proximo_km', 'proxima_visita', 'notas_proximo_mant', 'evidencias',
  // Para NO mostrarle al cliente la placa ficticia "SERVICIO" de una venta sin carro.
  'sin_vehiculo',
  // Para el botón "Pagar" (Wompi): saber si ya está facturada y si sigue sin pagar.
  // OJO: NO se trae cuentti_id_transacion — ese lo resuelve el webhook en el servidor.
  'pagado', 'facturado_en',
  // Estado de ingreso (inventario + combustible + daños): el cliente ve/verifica
  // en qué condición entró su carro. No es dato sensible (es de su propio vehículo).
  'ingreso',
].join(',')

// Consulta directa a Supabase via proxy (funciona desde cualquier dispositivo)
async function buscarTrabajosPorCedula(cedula) {
  try {
    const url = `/api/supabase?table=trabajos&cedula_cliente=eq.${encodeURIComponent(cedula)}&select=${SELECT_PORTAL}&order=fecha.desc`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Error consultando')
    const rows = await res.json()
    return rows.map(r => ({
      id: r.id,
      fecha: r.fecha || r.created_at,
      cedula: r.cedula_cliente,
      cliente: r.cliente,
      placa: r.placa,
      sinVehiculo: r.sin_vehiculo === true,
      marca: r.marca,
      modelo: r.modelo,
      ano: r.ano,
      kilometraje: r.kilometraje,
      tecnicoId: r.tecnico_id,
      estado: r.estado || 'Pendiente',
      observaciones: r.observaciones,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
      total: parseFloat(r.total) || 0,
      otCodigo: r.ot_codigo || '',
      pagado: r.pagado === true,
      facturadoEn: r.facturado_en || null,
      // Próximo mantenimiento: se le recuerda al cliente en el detalle del servicio
      tipoAceite: r.tipo_aceite || '',
      proximoKm: r.proximo_km || '',
      proximaVisita: r.proxima_visita || '',
      notasProximoMant: r.notas_proximo_mant || '',
      inspeccion: typeof r.inspeccion === 'string' ? JSON.parse(r.inspeccion) : (r.inspeccion || null),
      ingreso: typeof r.ingreso === 'string' ? JSON.parse(r.ingreso) : (r.ingreso || null),
      evidencias: (() => {
        try { const v = r.evidencias; return typeof v === 'string' ? (JSON.parse(v) || []) : (Array.isArray(v) ? v : []) } catch { return [] }
      })(),
    }))
  } catch (e) {
    console.warn('Portal: error buscando trabajos', e.message)
    return []
  }
}

// Cotizaciones (presupuestos) del cliente, para aprobar/firmar desde el portal.
// NO se trae la firma (dataURL grande): solo el estado y la fecha de aprobación.
async function buscarCotizacionesPorCedula(cedula) {
  try {
    const sel = 'id,fecha,cliente,placa,marca,modelo,ano,items,subtotal,iva,total,observaciones,validez_dias,estado,aprobada_en'
    const url = `/api/supabase?table=cotizaciones&cedula=eq.${encodeURIComponent(cedula)}&select=${sel}&order=fecha.desc`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Error consultando cotizaciones')
    const rows = await res.json()
    return rows.map(r => ({
      id: r.id,
      fecha: r.fecha,
      cliente: r.cliente,
      placa: r.placa,
      marca: r.marca,
      modelo: r.modelo,
      ano: r.ano,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
      subtotal: parseFloat(r.subtotal) || 0,
      iva: parseFloat(r.iva) || 0,
      total: parseFloat(r.total) || 0,
      observaciones: r.observaciones || '',
      validezDias: parseInt(r.validez_dias) || 0,
      estado: r.estado || 'Pendiente',
      aprobada: !!r.aprobada_en,
      aprobadaEn: r.aprobada_en || null,
    }))
  } catch (e) {
    console.warn('Portal: error buscando cotizaciones', e.message)
    return []
  }
}

// Pagos ya iniciados (persistido en el navegador): mientras el webhook confirma,
// el botón muestra "Confirmando pago…" en vez de "Pagar" para que el cliente NO
// pague dos veces (doble cargo real). Se poda solo a los 30 min.
const PAGOS_KEY = 'pagos_iniciados'
const VENTANA_PAGO_MS = 30 * 60 * 1000
function leerPagosIniciados() {
  try {
    const o = JSON.parse(localStorage.getItem(PAGOS_KEY) || '{}')
    const ahora = Date.now()
    let cambio = false
    for (const k of Object.keys(o)) { if (ahora - o[k] > VENTANA_PAGO_MS) { delete o[k]; cambio = true } }
    if (cambio) localStorage.setItem(PAGOS_KEY, JSON.stringify(o))
    return o
  } catch { return {} }
}

/* El cliente entra a ver si su carro esta listo, no a leer su historial:
   con 23 servicios el estado del vehiculo activo quedaba enterrado bajo unos
   2.000px de filas casi identicas (solo cambia el codigo de OT), contra los
   ~200px que ocupa la tarjeta de avance. Se ven los 3 mas recientes y el resto
   queda tras una fila que dice CUANTOS hay dentro, no solo "ver mas": el
   handoff solo permite colapsar con el contador a la vista.
   Va como componente porque hay dos historiales — el plano del cliente normal
   y el agrupado por vehiculo de una flota — y cada uno necesita su estado. */
const HIST_VISIBLES = 3
function HistorialLista({ trabajos, fila, tabla = false }) {
  const [todo, setTodo] = useState(false)
  const resto = trabajos.length - HIST_VISIBLES
  return (
    <>
      <div className={`pc-servs${tabla ? ' pc-servs--tabla' : ''}`}>
        {tabla && (
          // Cabecera de columnas. Solo existe en escritorio (CSS la oculta en
          // movil, donde cada servicio se lee como ficha y no como fila).
          <div className="pc-servs__cab" aria-hidden="true">
            <span>Placa</span><span>Fecha</span><span>Vehiculo</span>
            <span>Estado</span><span className="pc-servs__cab--der">Total</span><span />
          </div>
        )}
        {(todo ? trabajos : trabajos.slice(0, HIST_VISIBLES)).map(fila)}
      </div>
      {resto > 0 && (
        <button type="button" className="pc-mas" aria-expanded={todo} onClick={() => setTodo(v => !v)}>
          <span>{todo
            ? `Ver solo los ${HIST_VISIBLES} últimos`
            : resto === 1 ? 'Ver el anterior' : `Ver los ${resto} anteriores`}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={todo ? 'm18 15-6-6-6 6' : 'm9 18 6-6-6-6'} /></svg>
        </button>
      )}
    </>
  )
}

export default function PortalCliente() {
  // Leer ?c=<cedula> de la URL al montar (link prellenado para el cliente)
  const urlParams = new URLSearchParams(window.location.search)
  const cedulaInicial = urlParams.get('c') || ''

  const [cedula, setCedula] = useState(cedulaInicial)
  const [autenticado, setAutenticado] = useState(false)
  const [datos, setDatos] = useState(null)
  const [vistaInspeccion, setVistaInspeccion] = useState(null)
  const [vistaServicio, setVistaServicio] = useState(null) // detalle (mini-factura) de un servicio del historial
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [galeria, setGaleria] = useState(null) // array de fotos para el visor
  // Enlaces a la factura de Cuentti, por trabajo. Se piden al servidor porque el
  // portal es publico y NO trae cuentti_id_transacion (ver SELECT_PORTAL): sale
  // solo el enlace ya resuelto. Se cargan al abrir y no al pulsar, porque Safari
  // bloquea abrir una pestana despues de un await.
  const [facturas, setFacturas] = useState({})
  const [galIdx, setGalIdx] = useState(0)
  const [pagando, setPagando] = useState(null) // id del trabajo cuyo pago Wompi se está abriendo
  const [confirmandoPago, setConfirmandoPago] = useState(false) // volvió del checkout; esperando que el webhook marque pagado
  const [pagosIniciados, setPagosIniciados] = useState(leerPagosIniciados) // { trabajoId: timestamp }
  const [vehSel, setVehSel] = useState(null) // placa del vehículo enfocado (modo flota)
  const [firmandoCotiz, setFirmandoCotiz] = useState(null) // cotización que el cliente firma para aprobar
  const [aprobando, setAprobando] = useState(false)
  const [errorCotiz, setErrorCotiz] = useState('')
  const touchRef = useRef(null) // gesto de swipe en el visor de fotos
  const detalleRef = useRef(null) // detalle del vehículo (para hacer scroll al elegir uno)

  // Swipe horizontal en el visor: izquierda → siguiente, derecha → anterior.
  const onGalTouchStart = (e) => {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY }
  }
  const onGalTouchEnd = (e) => {
    const start = touchRef.current
    touchRef.current = null
    if (!start || !galeria || galeria.length < 2) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) setGalIdx(i => (i + 1) % galeria.length)
      else setGalIdx(i => (i - 1 + galeria.length) % galeria.length)
    }
  }

  // Inicia el pago de una factura con Wompi (Web Checkout hosteado, la tarjeta NO
  // toca nuestro servidor). Pide la firma al servidor (el secreto nunca viaja al
  // navegador) y arma el formulario que redirige a la página segura de Wompi. La
  // referencia = id del trabajo → la usa el webhook para registrar el pago.
  const marcarPagoIniciado = (id) => {
    const o = leerPagosIniciados(); o[id] = Date.now()
    localStorage.setItem(PAGOS_KEY, JSON.stringify(o)); setPagosIniciados({ ...o })
  }
  const quitarPagosIniciados = (ids) => {
    const o = leerPagosIniciados(); let cambio = false
    for (const id of ids) if (o[id] != null) { delete o[id]; cambio = true }
    if (cambio) { localStorage.setItem(PAGOS_KEY, JSON.stringify(o)); setPagosIniciados({ ...o }) }
  }
  // ¿Este trabajo tiene un pago iniciado que aún no se confirma? → botón bloqueado.
  const pagoPorConfirmar = (t) => !t.pagado && pagosIniciados[t.id] != null

  const pagarConWompi = async (t) => {
    if (!((t.total || 0) > 0)) { setError('Esta factura no tiene un valor a pagar.'); return }
    setPagando(t.id)
    try {
      // Última verificación antes de mandar a Wompi: entre que abrió el portal y le
      // dio clic pudo haber pagado en el taller. Es el único punto donde un error
      // le cuesta plata al cliente, así que se vuelve a preguntar aunque ya se
      // preguntó al entrar.
      const ver = await fetch(`/api/supabase?verificarPagos=${encodeURIComponent(datos.cedula)}`)
        .then(r => r.json()).catch(() => null)
      if (ver?.marcados?.includes(t.id)) {
        setDatos(d => ({ ...d, trabajos: d.trabajos.map(x => x.id === t.id ? { ...x, pagado: true } : x) }))
        setError('Esta factura ya aparece pagada en el sistema del taller. No es necesario pagarla de nuevo.')
        setPagando(null); return
      }
      const saldoReal = ver?.saldos?.[t.id]
      if (saldoReal != null && saldoReal < (t.total || 0)) {
        setDatos(d => ({ ...d, trabajos: d.trabajos.map(x => x.id === t.id ? { ...x, saldoCuentti: saldoReal } : x) }))
        setError(`Esta factura ya tiene un abono registrado. Solo quedan ${fmt(saldoReal)} por pagar: comunícate con el taller para cancelar ese saldo.`)
        setPagando(null); return
      }
      // El servidor decide el monto (firma el total real de la factura); acá NO se
      // manda monto para que no se pueda alterar. Se usa el que devuelve la firma.
      const res = await fetch('/api/cuentti?wompi=firma', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referencia: t.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok || !data.firma || !data.publicKey || !(data.montoCentavos > 0)) {
        // Al cliente solo se le repite el texto del servidor cuando habla de SU
        // factura (404 no existe / 409 ya pagada). Los demas codigos devuelven
        // texto de servidor —"Falta WOMPI_INTEGRITY_SECRET en el servidor",
        // "Solo POST"— y quien entra sin login desde un enlace de WhatsApp no
        // tiene por que leer el nombre de una variable de entorno justo cuando
        // va a pagar.
        setError(([404, 409].includes(res.status) && data?.error) || 'No se pudo iniciar el pago. Intenta de nuevo en un momento.')
        setPagando(null); return
      }
      const form = document.createElement('form')
      form.method = 'GET'
      form.action = data.checkoutUrl || 'https://checkout.wompi.co/p/'
      const campos = {
        'public-key': data.publicKey, 'currency': 'COP',
        // Monto FIRMADO por el servidor (debe coincidir con la firma, si no Wompi lo rechaza).
        'amount-in-cents': String(data.montoCentavos), 'reference': t.id,
        'signature:integrity': data.firma, 'redirect-url': window.location.href,
        // Prellenar el nombre del cliente (con mayúsculas correctas) para que no lo teclee.
        ...(t.cliente ? { 'customer-data:full-name': tituloCliente(t.cliente) } : {}),
      }
      Object.entries(campos).forEach(([name, value]) => {
        const input = document.createElement('input')
        input.type = 'hidden'; input.name = name; input.value = value
        form.appendChild(input)
      })
      // Marcar ANTES de irse: al volver (o si vuelve manual), el botón queda bloqueado.
      marcarPagoIniciado(t.id)
      document.body.appendChild(form)
      form.submit()
    } catch {
      setError('No se pudo iniciar el pago. Revisa tu conexión.')
      setPagando(null)
    }
  }

  const ejecutarBusqueda = async (cedulaInput) => {
    const cedulaLimpia = (cedulaInput || '').trim().replace(/[.\-\s]/g, '')
    if (!cedulaLimpia) return

    setCargando(true)
    setError('')

    // El estado de pago se contrasta contra Cuentti EN PARALELO con la consulta:
    // si el cliente pagó en caja o por transferencia, la app no se entera sola y
    // le seguiría mostrando "Pagar" sobre una factura ya cancelada. El servidor
    // devuelve cuáles quedaron saldadas (y ya las corrigió en la base) y cuánto
    // debe cada una, para no cobrar de nuevo lo que tiene abono.
    const [misTrab, misCotiz, chequeo] = await Promise.all([
      buscarTrabajosPorCedula(cedulaLimpia),
      buscarCotizacionesPorCedula(cedulaLimpia),
      fetch(`/api/supabase?verificarPagos=${encodeURIComponent(cedulaLimpia)}`)
        .then(r => r.json())
        .catch(() => ({ marcados: [], saldos: {}, abonos: {} })), // Cuentti caído: se sigue como siempre
    ])

    // La consulta salió en paralelo, así que trae el "pagado" viejo: se aplica aquí
    // lo que el servidor acaba de confirmar, sin tener que volver a consultar.
    const saldados = new Set(chequeo?.marcados || [])
    const saldos = chequeo?.saldos || {}
    const abonos = chequeo?.abonos || {}
    for (const t of misTrab) {
      if (saldados.has(t.id)) t.pagado = true
      else if (saldos[t.id] != null) {
        t.saldoCuentti = saldos[t.id]
        if (abonos[t.id] != null) t.abonoCuentti = abonos[t.id]
      }
    }

    // Extraer inspecciones embebidas en trabajos
    const misInsp = misTrab
      .filter(t => t.inspeccion && t.inspeccion.items)
      .map(t => ({
        ...t.inspeccion,
        placa: t.inspeccion.placa || t.placa,
        cliente: t.inspeccion.cliente || t.cliente,
        vehiculo: t.inspeccion.vehiculo || [t.marca, t.modelo, t.ano].filter(Boolean).join(' '),
        fecha: t.inspeccion.fecha || t.fecha,
      }))

    setCargando(false)

    if (misTrab.length === 0 && misCotiz.length === 0) {
      setError('No se encontraron registros para este documento. Verifica el número e intenta de nuevo.')
      setDatos(null)
      setAutenticado(false)
      return
    }

    setDatos({ trabajos: misTrab, inspecciones: misInsp, cotizaciones: misCotiz, cedula: cedulaLimpia })
    // Enlaces a las facturas, en segundo plano: si Cuentti tarda o falla, la
    // pantalla ya esta pintada y simplemente no sale el boton. Nunca bloquea.
    fetch(`/api/supabase?facturasPortal=${encodeURIComponent(cedulaLimpia)}`)
      .then(r => r.json())
      .then(d => { if (d?.ok && d.urls) setFacturas(d.urls) })
      .catch(() => { /* sin facturas: el resto del portal funciona igual */ })
    setAutenticado(true)
    // Un pago ya confirmado (trabajo.pagado) deja de estar "por confirmar".
    const yaPagados = misTrab.filter(t => t.pagado).map(t => t.id)
    if (yaPagados.length) quitarPagosIniciados(yaPagados)
  }

  // El cliente aprueba una cotización firmando desde el portal → PATCH a Supabase
  // (estado + firma + fecha). Optimista: actualiza la UI al confirmar.
  const aprobarCotizacion = async (cotiz, firmaDataUrl) => {
    setAprobando(true)
    setErrorCotiz('')
    try {
      const ahora = new Date().toISOString()
      const res = await fetch(`/api/supabase?table=cotizaciones&id=eq.${encodeURIComponent(cotiz.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'Aprobada', firma_aprobacion: firmaDataUrl, aprobada_en: ahora }),
      })
      if (!res.ok) throw new Error(`No se pudo guardar (${res.status})`)
      setDatos(d => ({
        ...d,
        cotizaciones: (d.cotizaciones || []).map(c =>
          c.id === cotiz.id ? { ...c, aprobada: true, estado: 'Aprobada', aprobadaEn: ahora } : c),
      }))
      setFirmandoCotiz(null)
    } catch (e) {
      console.warn('Portal: aprobar cotización', e.message)
      setErrorCotiz('No se pudo aprobar la cotización. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setAprobando(false)
    }
  }

  // Si vino con ?c= en URL, autobuscar al montar
  useEffect(() => {
    if (cedulaInicial) {
      ejecutarBusqueda(cedulaInicial)
      // ¿Volvió de pagar en Wompi? (Wompi agrega ?id= al redirigir). El webhook
      // marca "pagado" 1-2s después, así que mostramos "confirmando" y refrescamos
      // solo, para que "Pagar" se vuelva "PAGADO ✓" sin que el cliente re-pague.
      if (urlParams.get('id')) {
        setConfirmandoPago(true)
        // Sondear varias veces (el webhook marca "pagado" 1-3s después, a veces más).
        // El botón queda bloqueado por la marca en localStorage aunque el banner se apague.
        const reintentos = [3500, 8000, 15000, 25000, 40000, 60000].map(ms =>
          setTimeout(() => ejecutarBusqueda(cedulaInicial), ms))
        const tFin = setTimeout(() => setConfirmandoPago(false), 62000)
        return () => { reintentos.forEach(clearTimeout); clearTimeout(tFin) }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Con un overlay abierto (visor de fotos o detalle), bloquea el scroll del
  // fondo para que no se "cuele" detrás del modal en móvil.
  useEffect(() => {
    const hayOverlay = (galeria && galeria.length > 0) || vistaServicio
    if (!hayOverlay) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [galeria, vistaServicio])

  // Teclado en el visor de fotos: Esc cierra, flechas navegan.
  useEffect(() => {
    if (!galeria || galeria.length === 0) return
    const onKey = (e) => {
      if (e.key === 'Escape') setGaleria(null)
      else if (galeria.length > 1 && e.key === 'ArrowLeft') setGalIdx(i => (i - 1 + galeria.length) % galeria.length)
      else if (galeria.length > 1 && e.key === 'ArrowRight') setGalIdx(i => (i + 1) % galeria.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [galeria])

  // La entrada del portal ya NO se anima con JS. Antes una línea de tiempo GSAP de
  // 3-4s arrancaba las secciones, los pasos del avance y la barra de progreso en
  // opacity:0: si se interrumpía (pestaña en segundo plano, celular lento, GSAP que
  // no carga) el cliente se quedaba mirando una caja "Avance del trabajo" en blanco
  // y un "15% completado" sin barra. Nada que el cliente deba LEER puede depender de
  // JS para existir, así que el fade de entrada vive en CSS (ver <style> abajo).

  const buscar = (e) => {
    e.preventDefault()
    ejecutarBusqueda(cedula)
  }

  const salir = () => {
    setAutenticado(false)
    setDatos(null)
    setCedula('')
    setError('')
    // Limpiar ?c= de la URL para que no quede expuesta al cerrar sesion
    if (window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }

  const descargarPDF = (insp) => {
    const doc = new jsPDF()
    const { MARGIN, CONTENT_W } = PDF_LAYOUT

    const items = insp.items || []
    const urgentes = items.filter(i => i.estado === 'urgente')
    const sugeridos = items.filter(i => i.estado === 'sugerido')
    const buenos = items.filter(i => i.estado === 'bueno')
    const total = items.filter(i => i.estado !== 'no_aplica').length
    const pct = total > 0 ? Math.round((buenos.length / total) * 100) : 0

    // Estado general → badge
    let estado = 'good', estadoLbl = 'BUEN ESTADO'
    if (urgentes.length > 0) { estado = 'red'; estadoLbl = 'REQUIERE ATENCIÓN' }
    else if (sugeridos.length > 0) { estado = 'amber'; estadoLbl = 'CON OBSERVACIONES' }
    else { estado = 'green'; estadoLbl = 'EN BUEN ESTADO' }

    drawHeader(doc, {
      docType: 'INSPECCIÓN VEHICULAR',
      docNumber: (insp.placa || '').toUpperCase(),
      badge: { label: estadoLbl, color: estado === 'red' ? 'red' : estado === 'amber' ? 'amber' : 'green' },
      dateRows: [{ lbl: 'FECHA', val: fmtDate(insp.fecha) }],
    })

    let y = 47
    y = drawSectionHeader(doc, 'Datos de la inspección', y)
    y = drawDataBlock(doc, [
      { label: 'Cliente', value: insp.cliente, bold: true },
      { label: 'Vehículo', value: insp.vehiculo },
      { label: 'Placa', value: (insp.placa || '').toUpperCase(), bold: true },
      { label: 'Técnico', value: insp.tecnico },
    ], y)
    y += 4

    // Card de "Estado general" — barra de salud visual
    doc.setDrawColor(...PDF_COLORS.SLATE_300)
    doc.setLineWidth(0.2)
    doc.rect(MARGIN, y, CONTENT_W, 22)
    doc.setFontSize(7)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(...PDF_COLORS.SLATE_500)
    doc.text('ESTADO GENERAL', MARGIN + 4, y + 5)
    doc.setFontSize(24)
    doc.setTextColor(pct >= 80 ? PDF_COLORS.GREEN_600[0] : pct >= 50 ? PDF_COLORS.AMBER_500[0] : PDF_COLORS.RED_600[0],
                     pct >= 80 ? PDF_COLORS.GREEN_600[1] : pct >= 50 ? PDF_COLORS.AMBER_500[1] : PDF_COLORS.RED_600[1],
                     pct >= 80 ? PDF_COLORS.GREEN_600[2] : pct >= 50 ? PDF_COLORS.AMBER_500[2] : PDF_COLORS.RED_600[2])
    doc.text(`${pct}%`, MARGIN + 4, y + 17)

    // Barra de progreso
    const barX = MARGIN + 38
    const barW = CONTENT_W - 42 - 60
    const barY = y + 10
    doc.setFillColor(...PDF_COLORS.SLATE_100)
    doc.roundedRect(barX, barY, barW, 5, 1, 1, 'F')
    doc.setFillColor(...(pct >= 80 ? PDF_COLORS.GREEN_600 : pct >= 50 ? PDF_COLORS.AMBER_500 : PDF_COLORS.RED_600))
    doc.roundedRect(barX, barY, barW * (pct / 100), 5, 1, 1, 'F')

    // Stats al lado derecho
    const statsX = MARGIN + CONTENT_W - 56
    doc.setFontSize(7)
    doc.setTextColor(...PDF_COLORS.SLATE_500)
    doc.setFont(undefined, 'bold')
    doc.text('URGENTES', statsX, y + 5)
    doc.text('SUGERIDOS', statsX, y + 11)
    doc.text('BUENOS', statsX, y + 17)
    doc.setFont(undefined, 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...PDF_COLORS.RED_600);   doc.text(String(urgentes.length), statsX + 52, y + 5, { align: 'right' })
    doc.setTextColor(...PDF_COLORS.AMBER_500); doc.text(String(sugeridos.length), statsX + 52, y + 11, { align: 'right' })
    doc.setTextColor(...PDF_COLORS.GREEN_600); doc.text(String(buenos.length), statsX + 52, y + 17, { align: 'right' })

    y += 28

    // Tablas por categoría
    if (urgentes.length > 0) {
      y = drawSectionHeader(doc, 'Atención urgente · reparar pronto', y)
      autoTable(doc, {
        startY: y,
        head: [['ITEM', 'OBSERVACIONES']],
        body: urgentes.map(i => [i.nombre, i.comentario || '—']),
        ...tableStylesItems,
        headStyles: { ...SEVERITY_HEAD.urgent, fontSize: 7.2, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 'auto' } },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    if (sugeridos.length > 0) {
      y = drawSectionHeader(doc, 'Reparación sugerida · próximo servicio', y)
      autoTable(doc, {
        startY: y,
        head: [['ITEM', 'OBSERVACIONES']],
        body: sugeridos.map(i => [i.nombre, i.comentario || '—']),
        ...tableStylesItems,
        headStyles: { ...SEVERITY_HEAD.warn, fontSize: 7.2, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 'auto' } },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    if (buenos.length > 0) {
      y = drawSectionHeader(doc, 'En buen estado', y)
      autoTable(doc, {
        startY: y,
        head: [['ITEM', 'OBSERVACIONES']],
        body: buenos.map(i => [i.nombre, i.comentario || '—']),
        ...tableStylesItems,
        headStyles: { ...SEVERITY_HEAD.good, fontSize: 7.2, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 'auto' } },
        margin: { left: MARGIN, right: MARGIN },
      })
    }

    drawFooter(doc, { page: 1, total: 1 })
    doc.save(`inspeccion_${insp.placa}_${insp.fecha?.slice(0, 10) || 'reporte'}.pdf`)
  }

  // Vista de detalle de inspeccion
  if (vistaInspeccion) {
    return (
      <div style={{maxWidth:780,margin:'0 auto',display:'flex',flexDirection:'column',gap:20,padding:'20px 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--text-3)'}}>
          <img src="/logo.png" alt="MDA" style={{width:28,height:28,objectFit:'contain'}}/>
          Multidiagnosticos AS
        </div>
        <InspeccionDetalle inspeccion={vistaInspeccion} onVolver={() => setVistaInspeccion(null)} />
        <div style={{textAlign:'center',marginTop:8}}>
          <button className="btn btn-primary" onClick={() => descargarPDF(vistaInspeccion)}>
            Descargar Reporte PDF
          </button>
        </div>
      </div>
    )
  }

  // Vista login por cedula. Pantalla navy completa: el cliente llega por un
  // enlace de WhatsApp y lo unico que tiene que hacer es escribir su documento,
  // asi que nada mas compite. El telefono del taller deja de ser texto al pie y
  // pasa a ser boton de llamar: es la otra cosa que un cliente perdido quiere.
  if (!autenticado) {
    return (
      <div className="pc-in">
        <div className="pc-in__mid">
          <img src="/logo.png" alt={TALLER.nombre} className="pc-in__logo" />
          <div className="pc-in__marca">Multidiagnósticos AS</div>
          <div className="pc-in__sub">Seguimiento en línea de tu vehículo</div>
          <form onSubmit={buscar} className="pc-in__form">
            <label className="pc-in__lab" htmlFor="pc-cedula">Tu número de cédula o NIT</label>
            <input
              id="pc-cedula"
              className="pc-in__campo"
              value={cedula}
              onChange={e => setCedula(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
            />
            {error && <div className="pc-in__error">{error}</div>}
            <button type="submit" className="pc-in__go" disabled={cargando}>
              {cargando ? 'Consultando...' : 'Ver estado de mi vehículo'}
            </button>
          </form>
        </div>
        <div className="pc-in__pie">
          <a className="pc-in__tel" href={`tel:${TALLER.celular.replace(/\s/g, '')}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
            {TALLER.celular}
          </a>
          <div className="pc-in__ciudad">{TALLER.ciudad}</div>
        </div>
      </div>
    )
  }

  // Vista principal del cliente
  const esActivo = (e) => e !== ESTADOS.COMPLETADO && e !== ESTADOS.CANCELADO

  // Agrupar por vehículo (placa). Cada uno lleva su trabajo activo (si está en el
  // taller), su último y un estado resumido. Esto es lo que hace que una EMPRESA
  // con varios carros vea su flota, no una lista revuelta.
  const vehiculos = (() => {
    const map = new Map()
    datos.trabajos.forEach(t => {
      // Una venta de mostrador no es un carro: no entra a la lista de vehículos.
      if (esSinVehiculo(t)) return
      const placa = (t.placa || '').toUpperCase()
      if (!map.has(placa)) map.set(placa, [])
      map.get(placa).push(t)
    })
    const rank = { proceso: 0, listo: 1, aldia: 2 }
    return [...map.entries()].map(([placa, arr]) => {
      const orden = [...arr].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      const activo = orden.find(t => esActivo(t.estado)) || null
      const ultimo = orden[0]
      const estadoVeh = activo ? 'proceso' : (ultimo?.estado === ESTADOS.COMPLETADO ? 'listo' : 'aldia')
      return { placa, marca: ultimo?.marca, modelo: ultimo?.modelo, ano: ultimo?.ano,
        trabajos: orden, activo, ultimo, estadoVeh, ultimaVisita: ultimo?.fecha }
    }).sort((a, b) => rank[a.estadoVeh] - rank[b.estadoVeh] || new Date(b.ultimaVisita) - new Date(a.ultimaVisita))
  })()
  const esFlota = vehiculos.length > 1
  const placaFoco = esFlota ? (vehSel || vehiculos[0]?.placa) : null
  const vehFoco = esFlota ? vehiculos.find(v => v.placa === placaFoco) : null
  // El trabajo en foco: en flota, el del vehículo elegido (activo, o el último si
  // está "listo"); si es un cliente normal, su único trabajo activo.
  const trabajoActivo = esFlota
    ? (vehFoco?.activo || (vehFoco?.estadoVeh === 'listo' ? vehFoco.ultimo : null))
    : datos.trabajos.find(t => esActivo(t.estado))
  const enProceso = vehiculos.filter(v => v.estadoVeh === 'proceso').length
  const listos = vehiculos.filter(v => v.estadoVeh === 'listo').length
  const VEH_ESTADO = {
    proceso: { label: 'En el taller', color: '#d97706', cls: 'badge-w' },
    listo: { label: 'Listo para recoger', color: '#16a34a', cls: 'badge-s' },
    aldia: { label: 'Al día', color: '#64748b', cls: 'badge-n' },
  }
  // Facturas por pagar (de todos sus vehículos).
  const facturasPendientes = datos.trabajos
    .filter(t => t.facturadoEn && !t.pagado && (t.total || 0) > 0)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  // Cuando Cuentti reporta un saldo menor al total, ese es el que se debe de verdad.
  const tieneAbono = (t) => t.saldoCuentti != null && t.saldoCuentti < (t.total || 0)
  const totalPorPagar = facturasPendientes.reduce((s, t) => s + (tieneAbono(t) ? t.saldoCuentti : (t.total || 0)), 0)

  // Cotizaciones del cliente (presupuestos). Las pendientes se aprueban firmando.
  // Solo 'Pendiente' está genuinamente por aprobar. El estado manda: Aprobada/
  // Facturada/Rechazada ya están resueltas en el taller. 'aprobada_en' solo lo pone
  // la firma del portal, así que NO puede ser el único criterio (antes, cotizaciones
  // ya aprobadas en el admin —y hasta ya trabajadas y pagadas— seguían saliendo
  // "por aprobar" al cliente).
  const esCotizPendiente = (c) => c.estado === 'Pendiente' && !c.aprobadaEn
  const todasCotiz = (datos.cotizaciones || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  // Mostramos las pendientes + la que el cliente acabe de firmar en esta sesión
  // (aprobadaEn local) para darle el "Aprobada ✓"; las viejas resueltas se ocultan.
  const cotizaciones = todasCotiz.filter(c => esCotizPendiente(c) || c.aprobadaEn)
  const cotizPendientes = cotizaciones.filter(esCotizPendiente)
  // Inspecciones del vehículo en foco (en flota) o todas (cliente normal).
  const inspFoco = esFlota
    ? datos.inspecciones.filter(i => (i.placa || '').toUpperCase() === placaFoco)
    : datos.inspecciones
  // Elegir un vehículo: enfoca y baja al detalle.
  const elegirVehiculo = (placa) => {
    setVehSel(placa)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => detalleRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
  }

  const tecNombre = (id) => TECNICOS.find(t => t.id === parseInt(id))?.nombre || ''

  // Timeline steps for active work
  const pasos = [
    {lbl:'Recibido',pct:15},{lbl:'Diagnóstico',pct:30},{lbl:'Repuestos',pct:45},
    {lbl:'Reparación',pct:60},{lbl:'Prueba',pct:80},{lbl:'Entrega',pct:100},
  ]

  // Una fila del historial. Antes cada servicio era una tarjeta con cuatro
  // renglones etiqueta-valor (Fecha / Vehículo / Estado / Fotos): 250px para
  // cuatro datos, y dos servicios del mismo carro el mismo día se veían
  // IDÉNTICOS. Ahora la placa manda, y suben desde el detalle el número de OT
  // (sin él no se distinguen) y el total. `compact` omite la placa en modo
  // flota porque ya está en el encabezado del grupo.
  const filaHist = (t, compact = false) => {
    const porPagar = t.facturadoEn && !t.pagado && t.total > 0
    return (
      <div key={t.id} className="pc-serv" role="button" tabIndex={0}
        onClick={() => setVistaServicio(t)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVistaServicio(t) } }}>
        <div className="pc-serv__l">
          <div className="pc-serv__id">
            {!compact && (
              <span className={`pc-serv__placa${esSinVehiculo(t) ? ' sin' : ''}`}>
                {esSinVehiculo(t) ? 'SERVICIO' : t.placa}
              </span>
            )}
            {t.otCodigo && <span className="pc-serv__ot">{t.otCodigo}</span>}
          </div>
          <div className="pc-serv__meta">
            <span className="pc-serv__fecha">{fmtDate(t.fecha)}</span>
            {!compact && (
              <span className="pc-serv__veh">{[t.marca, t.modelo].filter(Boolean).join(' ') || 'Sin ficha'}</span>
            )}
          </div>
          <div className="pc-serv__chips">
            <span className={`badge ${ESTADO_TRABAJO_DISPLAY[t.estado]?.cls || 'badge-n'}`}>
              {ESTADO_TRABAJO_DISPLAY[t.estado]?.label || t.estado}
            </span>
            {t.pagado && <span className="pc-serv__pag">PAGADO</span>}
            {facturas[t.id] && (
              <a className="pc-serv__fac" href={facturas[t.id]} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                aria-label={`Ver la factura del servicio ${t.otCodigo || ''}`.trim()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h4" />
                </svg>
                Factura
              </a>
            )}
            {t.evidencias?.length > 0 && (
              <button type="button" className="pc-serv__fotos"
                onClick={e => { e.stopPropagation(); setGaleria(t.evidencias); setGalIdx(0) }}
                aria-label={`Ver ${t.evidencias.length} fotos`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                {t.evidencias.length}
              </button>
            )}
            {porPagar && (
              <span onClick={e => e.stopPropagation()}>
                {tieneAbono(t) ? (
                  <span className="pc-pill">Abonada · falta {fmt(t.saldoCuentti)}</span>
                ) : pagoPorConfirmar(t) ? (
                  <button type="button" className="btn btn-outline btn-sm" disabled title="Estamos confirmando tu pago">Confirmando pago…</button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" disabled={pagando === t.id} onClick={() => pagarConWompi(t)}>
                    {pagando === t.id ? 'Abriendo…' : `Pagar ${fmt(t.total)}`}
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="pc-serv__r">
          <span className="pc-serv__total">{fmt(t.total)}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pc-serv__chev"><path d="m9 18 6-6-6-6" /></svg>
        </div>
      </div>
    )
  }

  // Lo primero que pregunta el cliente: de que carro estamos hablando y en que
  // va. Eso es la cabecera; el saludo y la marca bajan a linea de apoyo.
  const cabCliente = tituloCliente(datos.trabajos[0]?.cliente || cotizaciones[0]?.cliente)
  // 57 = Colombia. wa.me quiere el numero sin espacios ni signos.
  const telPlano = TALLER.celular.replace(/\D/g, '')
  const waHref = `https://wa.me/57${telPlano}?text=${encodeURIComponent(`Hola, soy ${cabCliente}. Escribo por mi vehiculo.`)}`
  const cabVeh = trabajoActivo
    ? (esSinVehiculo(trabajoActivo) ? 'Servicio en el taller'
       : ([trabajoActivo.marca, trabajoActivo.modelo].filter(Boolean).join(' ') || 'Su vehículo'))
    : 'Sin vehículos en el taller'

  return (
    <>
    <header className="pc-top">
      <div className="pc-top__in">
        <div className="pc-top__r">
          <img src="/logo.png" alt={TALLER.nombre} className="pc-top__logo" />
          <span className="pc-top__marca">Multidiagnósticos AS</span>
          <a className="pc-top__tel" href={`tel:${TALLER.celular.replace(/\s/g, '')}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
            {TALLER.celular}
          </a>
          <span className="pc-top__quien">{cabCliente}</span>
          <button type="button" className="pc-top__salir" onClick={salir}>Salir</button>
        </div>
        <div className="pc-top__hola">Hola, {cabCliente}</div>
        <div className="pc-top__veh">{cabVeh}</div>
        {trabajoActivo ? (
          <div className="pc-top__meta">
            {!esSinVehiculo(trabajoActivo) && <span className="pc-top__placa">{trabajoActivo.placa}</span>}
            <span>
              {trabajoActivo.otCodigo ? `Orden ${trabajoActivo.otCodigo}` : ''}
              {trabajoActivo.otCodigo && trabajoActivo.fecha ? ' · ' : ''}
              {trabajoActivo.fecha ? `ingresó ${fmtDate(trabajoActivo.fecha)}` : ''}
            </span>
          </div>
        ) : datos.trabajos.length > 0 ? (
          <div className="pc-top__meta"><span>Último servicio {fmtDate(datos.trabajos[0].fecha)}</span></div>
        ) : null}
        {/* En flota el resumen de la flota se queda: es lo que una empresa mira. */}
        {esFlota && (
          <div className="pc-top__flota">
            {[[vehiculos.length, vehiculos.length === 1 ? 'vehículo' : 'vehículos', '#fff'],
              [enProceso, 'en el taller', '#fbbf24'],
              [listos, listos === 1 ? 'listo para recoger' : 'listos para recoger', '#4ade80']].map(([n, lbl, c], i) => (
              <span key={i}><b style={{ color: c }}>{n}</b> {lbl}</span>
            ))}
          </div>
        )}
      </div>
    </header>
    <div className="portal-main">
      <style>{`
        /* Entrada en CSS, no en JS: antes el contenido nacía en opacity:0 y lo
           revelaba un timeline de GSAP en cadena de 3-4s — si se interrumpía, el
           cliente se quedaba mirando una tarjeta en blanco. Ahora son 300ms y el
           reposo es visible pase lo que pase. */
        /* La entrada NO toca la opacidad, solo desliza. Medido: una pestaña en
           segundo plano congela las animaciones en el fotograma 0, y el navegador
           pinta ESE fotograma — con opacidad 0 ahí, el contenido desaparece pase
           lo que pase con el fill-mode. El cliente abre el link desde WhatsApp, se
           cambia de app mientras carga y vuelve a una tarjeta en blanco. Animando
           solo transform, lo peor que pasa es que quede 10px más abajo. */
        @keyframes pc-entra { from { transform: translateY(10px) } to { transform: none } }
        .portal-main > .card,
        .portal-main > .portal-col,
        .portal-main > .empty { animation: pc-entra .3s ease-out }
        @media (prefers-reduced-motion: reduce) {
          .portal-main > .card,
          .portal-main > .portal-col,
          .portal-main > .empty { animation: none }
        }
        /* Fila de factura: identificación · plata · acción. En celular se apila
           para que el saldo y el botón no queden espichados en un renglón. */
        .pc-fx { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px 18px; padding: 14px 20px }
        .pc-fx__money { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right }
        .pc-fx__saldo { font-size: 20px; font-weight: 800; letter-spacing: -.01em; line-height: 1.1 }
        .pc-fx__desglose { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px; font-size: 12.5px; color: var(--text-3); margin-top: 2px }
        .pc-fx__cta { text-align: right }
        .pc-pill { display: inline-block; background: var(--soft-amber); color: var(--amber-700);
                   font-size: 12.5px; font-weight: 700; padding: 5px 11px; border-radius:var(--r-pill); white-space: nowrap }
        @media (max-width: 560px) {
          .pc-fx { grid-template-columns: 1fr; gap: 10px }
          .pc-fx__money { align-items: flex-start; text-align: left }
          .pc-fx__desglose { justify-content: flex-start }
          .pc-fx__cta { text-align: left }
          .pc-fx__cta .btn { width: 100% }
        }
      `}</style>

      {/* Facturas por pagar — arriba y visible (es la acción de plata) */}
      {facturasPendientes.length > 0 && (
        <div className="card portal-full" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'15px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,borderBottom:'1px solid var(--border)'}}>
            <h3 style={{margin:0}}>{facturasPendientes.length===1?'Factura por pagar':`Facturas por pagar · ${facturasPendientes.length}`}</h3>
            {/* Con una sola factura el total del encabezado repetiría la cifra de la
                fila; solo suma cuando hay varias. */}
            {facturasPendientes.length > 1 && (
              <div style={{textAlign:'right'}}>
                <div className="eyebrow">Saldo pendiente total</div>
                <div className="mono" style={{fontSize:20,fontWeight:800,letterSpacing:'-.01em'}}>{fmt(totalPorPagar)}</div>
              </div>
            )}
          </div>
          <div>
            {facturasPendientes.map((t,i)=>{
              const conAbono = tieneAbono(t)
              const saldo = conAbono ? t.saldoCuentti : (t.total || 0)
              // El abono viene TAL CUAL de Cuentti (t.abonoCuentti), no de restar
              // el total de la app menos el pendiente: son dos fuentes distintas y
              // basta una diferencia de redondeo —o un ítem agregado a la factura
              // en el mostrador— para decirle al cliente que abonó una plata que
              // nunca abonó. Si el dato no llegó, no se muestra el renglón.
              const abonado = t.abonoCuentti
              return (
              <div key={t.id} className="pc-fx" style={{borderTop:i>0?'1px solid var(--border)':'none'}}>
                <div style={{minWidth:0}}>
                  {esSinVehiculo(t)
                    ? <span style={{fontWeight:700,fontSize:15}}>Servicio sin vehículo</span>
                    : <span className="mono" style={{fontWeight:700,fontSize:15}}>{t.placa}</span>}
                  <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:1}}>{fmtDate(t.fecha)}{t.otCodigo?` · ${t.otCodigo}`:''}</div>
                </div>
                <div className="pc-fx__money">
                  <span className="eyebrow">Saldo pendiente</span>
                  <span className="mono pc-fx__saldo">{fmt(saldo)}</span>
                  {conAbono && (
                    <div className="pc-fx__desglose">
                      {abonado != null && <span>Ya abonado <b className="mono">{fmt(abonado)}</b></span>}
                      <span>Total factura <b className="mono">{fmt(t.total)}</b></span>
                    </div>
                  )}
                </div>
                <div className="pc-fx__cta">
                  {/* Con abono, pagar en línea cobraría el TOTAL otra vez: se remite al taller. */}
                  {conAbono ? (
                    <>
                      <span className="pc-pill">Abono registrado</span>
                      <div style={{fontSize:12,color:'var(--text-3)',marginTop:5}}>El saldo se paga en el taller.</div>
                    </>
                  ) : pagoPorConfirmar(t)
                    ? <button className="btn btn-outline" disabled title="Estamos confirmando tu pago">Confirmando…</button>
                    : <button className="btn btn-primary" disabled={pagando===t.id} onClick={()=>pagarConWompi(t)}>{pagando===t.id?'Abriendo…':`Pagar ${fmt(saldo)}`}</button>}
                </div>
              </div>
            )})}
          </div>
        </div>
      )}

      {/* Cotizaciones / presupuestos — el cliente aprueba firmando */}
      {cotizaciones.length > 0 && (
        <div className="card portal-full" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'15px 20px',borderBottom:'1px solid var(--border)'}}>
            <h3 style={{margin:0}}>{cotizPendientes.length>0 ? (cotizPendientes.length===1?'Cotización por aprobar':`Cotizaciones por aprobar · ${cotizPendientes.length}`) : 'Cotizaciones'}</h3>
            {cotizPendientes.length>0 && <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:2}}>Revísala y apruébala firmando desde tu celular.</div>}
          </div>
          <div>
            {cotizaciones.map((c,i)=>(
              <div key={c.id} style={{padding:'14px 20px',borderTop:i>0?'1px solid var(--border)':'none'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
                  <div style={{minWidth:0}}>
                    {/* En cotizaciones la placa es opcional: el título cae a la
                       marca/modelo antes de declararla "sin vehículo". */}
                    {sinDatosVehiculo(c)
                      ? <span style={{fontWeight:700,fontSize:15}}>Servicio sin vehículo</span>
                      : esSinVehiculo(c)
                        ? <span style={{fontWeight:700,fontSize:15}}>{[c.marca,c.modelo].filter(Boolean).join(' ') || 'Vehículo'}</span>
                        : <span className="mono" style={{fontWeight:700,fontSize:15}}>{c.placa}</span>}
                    <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:1}}>
                      {sinDatosVehiculo(c) || esSinVehiculo(c) ? fmtDate(c.fecha) : `${[c.marca,c.modelo].filter(Boolean).join(' ')||'Vehículo'} · ${fmtDate(c.fecha)}`}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="mono" style={{fontSize:17,fontWeight:800,color:'var(--green-700)'}}>{fmt(c.total)}</div>
                    <div style={{fontSize:11,color:'var(--text-4)'}}>IVA incluido</div>
                  </div>
                </div>
                <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:4}}>
                  {(c.items||[]).slice(0,6).map((it,k)=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',gap:12,fontSize:13.5}}>
                      {/* !== 1 (no > 1): una cantidad de 0,5 hay que MOSTRARLA, es
                         justo la que explica por qué la línea cuesta la mitad. */}
                      <span style={{color:'var(--text-2)',minWidth:0}}>{it.nombre||it.codigo||'Ítem'}{cantidadItem(it)!==1?` × ${fmtCant(it)}`:''}</span>
                      <span className="mono" style={{color:'var(--text-3)',whiteSpace:'nowrap'}}>{fmt(Math.round((parseFloat(it.precio)||0)*(cantidadItem(it))))}</span>
                    </div>
                  ))}
                  {(c.items||[]).length>6 && <div style={{fontSize:12.5,color:'var(--text-4)'}}>+ {(c.items||[]).length-6} más…</div>}
                </div>
                <div style={{marginTop:12,display:'flex',justifyContent:'flex-end'}}>
                  {c.aprobada
                    ? <span className="badge badge-s" style={{textTransform:'none',letterSpacing:0}}>Aprobada ✓{c.aprobadaEn?` · ${fmtDate(c.aprobadaEn)}`:''}</span>
                    : <Button variant="success" onClick={()=>{setErrorCotiz('');setFirmandoCotiz(c)}}>Aprobar cotización</Button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sus vehículos (empresas con varios) */}
      {esFlota && (
        <div className="card portal-full">
          <div className="card__h"><h3>Sus vehículos</h3><span className="count">{vehiculos.length}</span></div>
          <div className="card__b" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
            {vehiculos.map(v=>{
              const est = VEH_ESTADO[v.estadoVeh]
              const sel = v.placa === placaFoco
              const pct = v.activo ? (ESTADO_TRABAJO_DISPLAY[v.activo.estado]?.pct||0) : (v.estadoVeh==='listo'?100:0)
              return (
                <button key={v.placa} type="button" className={`veh-card${sel?' is-sel':''}`} onClick={()=>elegirVehiculo(v.placa)}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                    <span className="mono" style={{fontSize:18,fontWeight:800,letterSpacing:'-.01em'}}>{v.placa}</span>
                    <span className={`badge ${est.cls}`} style={{fontWeight:700}}>{est.label}</span>
                  </div>
                  <div style={{fontSize:13,color:'var(--text-3)',marginTop:3}}>{[v.marca,v.modelo].filter(Boolean).join(' ')||'Vehículo'}</div>
                  {v.estadoVeh!=='aldia' && (
                    <div style={{height:6,background:'var(--bg-subtle)',borderRadius:99,overflow:'hidden',marginTop:12}}>
                      <div style={{height:'100%',width:`${pct}%`,borderRadius:99,background:est.color}}/>
                    </div>
                  )}
                  <div style={{fontSize:12,color:'var(--text-3)',marginTop:v.estadoVeh!=='aldia'?8:12}}>
                    {v.activo ? (ESTADO_TRABAJO_DISPLAY[v.activo.estado]?.label||'') : `Última visita ${fmtDate(v.ultimaVisita)}`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Detalle del vehículo en foco: avance + observaciones */}
      <div className="portal-col" ref={detalleRef}>
      {/* Estado + avance en UNA tarjeta. Eran dos: la de arriba decía el
          porcentaje y la de abajo lo repetía paso por paso en vertical,
          gastando media pantalla. La linea de tiempo se acuesta: seis puntos
          caben de sobra en 390px y se lee de un golpe donde va el carro. */}
      {trabajoActivo && (() => {
        const pct = ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct || 0
        return (
          <div className="card pc-avance">
            <div className="card__b">
              {esFlota && (
                <div className="pc-avance__veh">
                  Vehículo <span className="mono">{trabajoActivo.placa}</span>
                  {trabajoActivo.otCodigo && <> · Orden <span className="mono">{trabajoActivo.otCodigo}</span></>}
                </div>
              )}
              <div className="pc-avance__top">
                <div>
                  <div className="pc-avance__lab">Estado actual</div>
                  <div className="pc-avance__est">{ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.label || trabajoActivo.estado}</div>
                </div>
                <div className="pc-avance__pct">{pct}%</div>
              </div>
              <div className="pc-avance__bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="pc-avance__pasos">
                {pasos.map((p, k) => {
                  const done = pct >= p.pct
                  const active = pct >= p.pct - 15 && pct < p.pct
                  return (
                    <div key={k} className={`pc-paso${done ? ' done' : active ? ' now' : ''}`}>
                      <span className="pc-paso__dot">
                        {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                      </span>
                      <span className="pc-paso__lbl">{p.lbl}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Observaciones del tecnico + quien es. El mockup las junta: son la
          misma pregunta del cliente, "quien lo esta viendo y que dice". */}
      {trabajoActivo && (trabajoActivo.observaciones || tecNombre(trabajoActivo.tecnicoId)) && (
        <div className="card pc-obs">
          <div className="card__b">
            {trabajoActivo.observaciones && (
              <>
                <div className="pc-obs__t">Observaciones del técnico</div>
                <p className="pc-obs__p">{trabajoActivo.observaciones}</p>
              </>
            )}
            {tecNombre(trabajoActivo.tecnicoId) && (
              <div className={`pc-obs__tec${trabajoActivo.observaciones ? ' sep' : ''}`}>
                <span className="pc-obs__av">
                  {tecNombre(trabajoActivo.tecnicoId).split(' ').map(x => x[0]).slice(0, 2).join('')}
                </span>
                <span>
                  <span className="pc-obs__nom">{tecNombre(trabajoActivo.tecnicoId)}</span>
                  <span className="pc-obs__rol">Tu técnico asignado</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      <div className="portal-col">
      {/* Fotos del trabajo activo */}
      {trabajoActivo?.evidencias?.length > 0 && (
        <div className="card">
          <div className="card__h"><h3>Fotos y videos de su servicio</h3><span className="count">{trabajoActivo.evidencias.length}</span></div>
          <div className="card__b" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(92px,1fr))',gap:8}}>
            {trabajoActivo.evidencias.map((f,i)=>(
              <button key={f.id||i} onClick={()=>{setGaleria(trabajoActivo.evidencias);setGalIdx(i)}}
                style={{padding:0,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',cursor:'pointer',aspectRatio:'1',background:'var(--bg-subtle)',position:'relative'}}>
                <MiniEvid f={f} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inspecciones. La ultima se abre con los tres cortes en bloques de
          color (urgentes / sugeridos / en buen estado) y los hallazgos urgentes
          con su nota: es lo segundo que pregunta el cliente despues de "¿en que
          va?". Las anteriores quedan como filas, con su fecha y sus cortes. */}
      {inspFoco.length > 0 && (() => {
        const cortes = (insp) => {
          const items = insp.items || []
          return {
            urgentes: items.filter(i => i.estado === 'urgente'),
            sugeridos: items.filter(i => i.estado === 'sugerido'),
            buenos: items.filter(i => i.estado === 'bueno'),
          }
        }
        const [ultima, ...viejas] = inspFoco
        const c = cortes(ultima)
        return (
          <div className="card pc-insp">
            <div className="card__b">
              <div className="pc-insp__h">
                <span className="pc-insp__t">Inspección {ultima.placa}</span>
                <span className="pc-insp__sp" />
                <span className="pc-insp__fecha">{fmtDate(ultima.fecha)}</span>
              </div>
              <div className="pc-insp__cortes">
                <span className="pc-corte pc-corte--bad"><b>{c.urgentes.length}</b>urgentes</span>
                <span className="pc-corte pc-corte--warn"><b>{c.sugeridos.length}</b>sugeridos</span>
                <span className="pc-corte pc-corte--ok"><b>{c.buenos.length}</b>en buen estado</span>
              </div>
              {c.urgentes.length > 0 && (
                <div className="pc-insp__hall">
                  {c.urgentes.slice(0, 2).map((i, k) => (
                    <div key={k} className="pc-hall">
                      <span className="pc-hall__ic">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </span>
                      <span className="pc-hall__b">
                        <span className="pc-hall__n">{i.categoria ? `${i.categoria} · ` : ''}{i.nombre}</span>
                        {i.comentario && <span className="pc-hall__nota">{i.comentario}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="pc-insp__acc">
                <button type="button" className="pc-insp__ver" onClick={() => setVistaInspeccion(ultima)}>Ver la inspección completa</button>
                <button type="button" className="pc-insp__pdf" onClick={() => descargarPDF(ultima)} aria-label="Descargar inspección en PDF">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 19h16" /></svg>
                </button>
              </div>
              {viejas.length > 0 && (
                <div className="pc-insp__viejas">
                  {viejas.map((insp, idx) => {
                    const v = cortes(insp)
                    return (
                      <div key={insp.id || idx} className="pc-insp__vieja" role="button" tabIndex={0}
                        onClick={() => setVistaInspeccion(insp)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVistaInspeccion(insp) } }}>
                        <span className="pc-insp__vfecha">{fmtDate(insp.fecha)}</span>
                        <span className="pc-insp__vveh">{insp.vehiculo || insp.placa}</span>
                        <span className="pc-insp__vn">
                          {v.urgentes.length > 0 && <span className="badge badge-d">{v.urgentes.length}</span>}
                          {v.sugeridos.length > 0 && <span className="badge badge-w">{v.sugeridos.length}</span>}
                          {v.buenos.length > 0 && <span className="badge badge-s">{v.buenos.length}</span>}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pc-serv__chev"><path d="m9 18 6-6-6-6" /></svg>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      </div>{/* cierra columna lateral */}

      {confirmandoPago && (
        <div className="card portal-full" style={{ background: 'var(--soft-green)', border: '1px solid var(--green-600)' }}>
          <div className="card__b" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 22, height: 22, border: '2.5px solid var(--green-600)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--green-700)' }}>Estamos confirmando tu pago…</div>
              <div style={{ fontSize: 13, color: 'var(--green-700)' }}>Un momento, no vuelvas a pagar. En unos segundos verás la factura como <strong>Pagada ✓</strong>.</div>
            </div>
          </div>
        </div>
      )}

      {/* Historial — flat (cliente normal) o agrupado por vehículo (flota) */}
      {datos.trabajos.length > 0 && (
        esFlota ? (
          <div className="card portal-full">
            <div className="card__h"><h3>Historial por vehículo</h3><span className="count">{datos.trabajos.length}</span></div>
            <div className="card__b" style={{display:'flex',flexDirection:'column',gap:22}}>
              {vehiculos.map(v => (
                <div key={v.placa}>
                  <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:6,paddingBottom:6,borderBottom:'1px solid var(--border)'}}>
                    <span className="mono" style={{fontWeight:800,fontSize:15}}>{v.placa}</span>
                    <span style={{fontSize:13,color:'var(--text-3)'}}>{[v.marca,v.modelo].filter(Boolean).join(' ')}</span>
                    <span style={{fontSize:12.5,color:'var(--text-4)',marginLeft:'auto'}}>{v.trabajos.length} {v.trabajos.length===1?'servicio':'servicios'}</span>
                  </div>
                  <HistorialLista trabajos={v.trabajos} fila={t => filaHist(t, true)} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card portal-full">
            <div className="card__h"><h3>Historial de servicios</h3><span className="count">{datos.trabajos.length}</span></div>
            <div className="card__b card__b--flush">
              <HistorialLista trabajos={datos.trabajos} fila={t => filaHist(t, false)} tabla />
            </div>
          </div>
        )
      )}

      {!trabajoActivo && datos.trabajos.length === 0 && (
        <div className="empty portal-full">
          <p>No hay trabajos activos en este momento.</p>
        </div>
      )}

      {/* Barra de abajo: escribir al taller. */}
      <div className="portal-full pc-pie">
        {/* WhatsApp primero: un cliente que abre esto desde el celular escribe
            antes que llamar, y escribiendo el taller conserva el hilo. El mensaje
            va prellenado con su nombre para que en el taller sepan quien es sin
            tener que preguntar. Es la unica accion del pie: llamar se quito por
            decision del dueno, y el telefono sigue en el encabezado del portal. */}
        <a className="pc-wa" target="_blank" rel="noopener noreferrer"
          href={waHref} aria-label="Escribir por WhatsApp">
          <span className="pc-wa__ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.02a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.25-8.23a8.23 8.23 0 0 1 0 16.46z" />
              <path d="M17.47 14.38c-.3-.15-1.74-.86-2-.96-.27-.1-.47-.15-.66.15-.2.29-.76.95-.93 1.15-.17.2-.34.22-.63.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.04-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.53.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.9-2.18-.24-.57-.48-.5-.66-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.03 1-1.03 2.45s1.06 2.84 1.2 3.04c.15.2 2.08 3.18 5.04 4.46.7.3 1.25.48 1.68.62.7.22 1.35.19 1.86.12.57-.09 1.74-.71 1.99-1.4.25-.69.25-1.28.17-1.4-.07-.13-.27-.2-.57-.35z" />
            </svg>
          </span>
          <span className="pc-wa__txt">Escríbenos</span>
        </a>
        <div className="pc-pie__dir">{TALLER.nombre} · {TALLER.ciudad}</div>
      </div>

      {/* Detalle de un servicio del historial (mini-factura del cliente) */}
      {/* Modal: firmar para aprobar la cotización */}
      {firmandoCotiz && (
        <div onClick={()=>!aprobando&&setFirmandoCotiz(null)} role="presentation"
          style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(16,23,37,.55)',display:'flex',overflowY:'auto',WebkitOverflowScrolling:'touch',padding:14}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-label="Aprobar cotización"
            style={{width:'min(520px,100%)',margin:'auto',background:'var(--bg-raised)',borderRadius:16,boxShadow:'0 24px 60px -12px rgba(16,23,37,.4)'}}>
            <div style={{padding:'18px 20px 12px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
              <div style={{minWidth:0}}>
                <h3 style={{margin:0}}>Aprobar cotización</h3>
                <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:3}}>Total <b className="mono">{fmt(firmandoCotiz.total)}</b> · firma abajo para aprobar. Tu firma queda registrada.</div>
              </div>
              <button className="icobtn" onClick={()=>!aprobando&&setFirmandoCotiz(null)} aria-label="Cerrar"><IconX/></button>
            </div>
            <div style={{padding:'16px 20px 20px'}}>
              {errorCotiz && <div className="badge badge-d" style={{display:'block',marginBottom:12,padding:'8px 12px',textTransform:'none',letterSpacing:0}}>{errorCotiz}</div>}
              <SignaturePad onSave={(dataUrl)=>aprobarCotizacion(firmandoCotiz,dataUrl)} onCancel={()=>setFirmandoCotiz(null)} />
              {aprobando && <div style={{fontSize:13,color:'var(--text-3)',marginTop:8,textAlign:'center'}}>Guardando…</div>}
            </div>
          </div>
        </div>
      )}

      {vistaServicio && (() => {
        const t = vistaServicio
        const items = Array.isArray(t.items) ? t.items : []
        const linea = (i) => Math.round((parseFloat(i.precio) || 0) * (cantidadItem(i)))
        const total = t.total || items.reduce((s, i) => s + linea(i), 0)
        const est = ESTADO_TRABAJO_DISPLAY[t.estado] || {}
        const tieneProx = t.tipoAceite || t.proximoKm || t.proximaVisita || t.notasProximoMant
        return (
          <div onClick={() => setVistaServicio(null)} role="presentation"
            style={{position:'fixed',inset:0,zIndex:900,background:'rgba(16,23,37,.45)',display:'flex',overflowY:'auto',WebkitOverflowScrolling:'touch',padding:14}}>
            <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Detalle del servicio"
              style={{width:'min(560px,100%)',margin:'auto',background:'var(--bg-raised)',borderRadius:16,boxShadow:'0 24px 60px -12px rgba(16,23,37,.35)'}}>

              <div style={{padding:'18px 20px 14px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12.5,color:'var(--text-3)'}}>{fmtDate(t.fecha)}{t.otCodigo ? ` · ${t.otCodigo}` : ''}</div>
                  {esSinVehiculo(t) ? (
                    <div style={{fontSize:19,fontWeight:800,letterSpacing:'-.01em',marginTop:2}}>Servicio sin vehículo</div>
                  ) : (
                    <>
                      <div className="mono" style={{fontSize:19,fontWeight:800,letterSpacing:'-.01em',marginTop:2}}>{t.placa}</div>
                      <div style={{fontSize:13,color:'var(--text-3)'}}>{[t.marca,t.modelo,t.ano].filter(Boolean).join(' ') || '—'}</div>
                    </>
                  )}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  <span className={`badge ${est.cls||'badge-n'}`}>{est.label || t.estado}</span>
                  <Button variant="ghost" aria-label="Cerrar" onClick={()=>setVistaServicio(null)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                  </Button>
                </div>
              </div>

              <div style={{padding:'14px 20px 6px'}}>
                <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Trabajos realizados</div>
                {items.length === 0 ? (
                  <div style={{fontSize:13.5,color:'var(--text-3)',paddingBottom:8}}>Sin detalle registrado para este servicio.</div>
                ) : (
                  <div>
                    {items.map((i, k) => (
                      <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:600,lineHeight:1.35}}>{i.nombre || i.codigo || 'Ítem'}</div>
                          <div style={{fontSize:12,color:'var(--text-3)',marginTop:1}}>
                            {i.esServicio ? 'Mano de obra' : 'Repuesto'}
                            {cantidadItem(i) !== 1 && <> · {fmtCant(i)} × {fmt(Math.round(parseFloat(i.precio) || 0))}</>}
                          </div>
                        </div>
                        <div className="mono" style={{fontSize:14,fontWeight:700,whiteSpace:'nowrap'}}>{fmt(linea(i))}</div>
                      </div>
                    ))}
                    <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',fontSize:15.5,fontWeight:800}}>
                      <span>Total</span>
                      <span className="mono" style={{color:'var(--green-600)'}}>{fmt(total)}</span>
                    </div>
                  </div>
                )}
              </div>

              {ingresoTieneAlgo(t.ingreso) && (
                <div style={{margin:'0 20px 14px',padding:'12px 14px',background:'var(--bg-subtle)',borderRadius:12}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>Cómo entró tu vehículo</div>
                  {t.ingreso.combustible!=null && <div style={{fontSize:13.5,marginBottom:4}}><span style={{color:'var(--text-3)'}}>Combustible:</span> <strong>{etiquetaCombustible(t.ingreso.combustible)}</strong></div>}
                  {t.ingreso.estado && t.ingreso.estado.trim() && <div style={{fontSize:13.5,marginBottom:4}}><span style={{color:'var(--text-3)'}}>Estado / daños:</span> {t.ingreso.estado}</div>}
                  {(t.ingreso.inventario||[]).length>0 && (
                    <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:6}}>
                      {t.ingreso.inventario.map(k=><span key={k} className="badge badge-n" style={{textTransform:'none',letterSpacing:0}}>{labelInventario(k)}</span>)}
                    </div>
                  )}
                </div>
              )}

              {t.tecnicoId && tecNombre(t.tecnicoId) && (
                <div style={{margin:'0 20px 12px',display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:34,height:34,borderRadius:'50%',background:'var(--navy-800,#152544)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:12,flexShrink:0}}>
                    {tecNombre(t.tecnicoId).split(' ').map(x=>x[0]).slice(0,2).join('')}
                  </div>
                  <div>
                    <div style={{fontSize:13.5,fontWeight:700}}>{tecNombre(t.tecnicoId)}</div>
                    <div style={{fontSize:12,color:'var(--text-3)'}}>Técnico responsable</div>
                  </div>
                </div>
              )}

              {t.observaciones && (
                <div style={{margin:'0 20px 12px',padding:'11px 14px',background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:10}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Observaciones</div>
                  <div style={{fontSize:13.5,lineHeight:1.5}}>{t.observaciones}</div>
                </div>
              )}

              {tieneProx && (
                <div style={{margin:'0 20px 12px',padding:'11px 14px',background:'var(--blue-50,#eff6ff)',border:'1px solid rgba(37,99,235,.22)',borderRadius:10}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'var(--blue-600,#1E3A8A)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Próximo mantenimiento</div>
                  <div style={{fontSize:13.5,lineHeight:1.5}}>
                    {[
                      t.tipoAceite && `Aceite ${t.tipoAceite}`,
                      t.proximoKm && `próximo cambio a los ${Number(t.proximoKm) ? Number(t.proximoKm).toLocaleString('es-CO') : t.proximoKm} km`,
                      t.proximaVisita && `visita sugerida: ${fmtDate(t.proximaVisita)}`,
                    ].filter(Boolean).join(' · ')}
                    {t.notasProximoMant && <div style={{marginTop:3,color:'var(--text-2)'}}>{t.notasProximoMant}</div>}
                  </div>
                </div>
              )}

              {t.evidencias?.length > 0 && (
                <div style={{margin:'0 20px 12px'}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Fotos y videos</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(84px,1fr))',gap:8}}>
                    {t.evidencias.map((f,i)=>(
                      <button key={f.id||i} onClick={()=>{setGaleria(t.evidencias);setGalIdx(i)}}
                        style={{padding:0,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',cursor:'pointer',aspectRatio:'1',background:'var(--bg-subtle)',position:'relative'}}>
                        <MiniEvid f={f} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{padding:'12px 20px 18px',display:'flex',justifyContent:'flex-end'}}>
                <Button variant="outline" onClick={()=>setVistaServicio(null)}>Cerrar</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Visor de fotos (lightbox) */}
      {galeria && galeria.length > 0 && (
        <div onClick={()=>setGaleria(null)}
          style={{position:'fixed',inset:0,background:'rgba(6,11,26,.93)',zIndex:1000,display:'flex',overflowY:'auto',WebkitOverflowScrolling:'touch',padding:20}}>
          {/* Cerrar (X) fija en la esquina superior derecha */}
          <button className="lb-ctl lb-close" aria-label="Cerrar" onClick={(e)=>{e.stopPropagation();setGaleria(null)}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
          <div onTouchStart={onGalTouchStart} onTouchEnd={onGalTouchEnd}
            style={{margin:'auto',display:'flex',flexDirection:'column',alignItems:'center',maxWidth:'100%'}}>
            {esVideoEvid(galeria[galIdx])
              ? <video key={galeria[galIdx]?.url} src={galeria[galIdx]?.url} controls autoPlay playsInline onClick={e=>e.stopPropagation()}
                  style={{maxWidth:'100%',maxHeight:'72vh',borderRadius:8,boxShadow:'0 10px 40px rgba(0,0,0,.5)',background:'#000'}}/>
              : <img src={galeria[galIdx]?.dataUrl} alt={galeria[galIdx]?.nota||''} onClick={e=>e.stopPropagation()}
                  style={{maxWidth:'100%',maxHeight:'72vh',objectFit:'contain',borderRadius:8,boxShadow:'0 10px 40px rgba(0,0,0,.5)'}}/>}
            {galeria[galIdx]?.nota && (
              <div style={{color:'#fff',marginTop:12,fontSize:14,textAlign:'center',maxWidth:600}}>{galeria[galIdx].nota}</div>
            )}
            {galeria.length > 1 && (
              <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:12,marginTop:18,alignItems:'center',flexWrap:'wrap',justifyContent:'center'}}>
                <button className="lb-ctl lb-nav" onClick={()=>setGalIdx(i=>(i-1+galeria.length)%galeria.length)}>‹ Anterior</button>
                <span style={{color:'rgba(255,255,255,.7)',fontSize:13,fontWeight:600}}>{galIdx+1} / {galeria.length}</span>
                <button className="lb-ctl lb-nav" onClick={()=>setGalIdx(i=>(i+1)%galeria.length)}>Siguiente ›</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  )
}
