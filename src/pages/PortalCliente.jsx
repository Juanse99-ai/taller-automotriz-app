import { useState, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { InspeccionDetalle } from './Inspecciones'
import { ESTADOS, TECNICOS, TALLER } from '../utils/constants'
import { fmtDate, fmt } from '../utils/helpers'
import { labelInventario, etiquetaCombustible, ingresoTieneAlgo } from '../utils/ingreso'
import { Button } from '../components/ui'
import { drawHeader, drawSectionHeader, drawDataBlock, drawFooter, tableStylesItems, PDF_LAYOUT, PDF_COLORS, SEVERITY_HEAD } from '../utils/pdfTheme'

// Capitaliza el nombre del cliente que viene en MAYÚSCULAS ("TRANSPORTES
// MAJAGUA S.A.S." → "Transportes Majagua S.A.S."). Se muestra COMPLETO, no solo
// la primera palabra. Las siglas jurídicas (con punto, o SAS/SA/LTDA/CIA/EU) se
// dejan en mayúscula; el resto va con inicial mayúscula (respeta ñ/tildes).
const tituloCliente = (s) => String(s || '').trim().split(/\s+/).map(w => {
  if (/\./.test(w) || /^(sas|sa|ltda|cia|eu)$/i.test(w)) return w.toUpperCase()
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}).join(' ')

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
  [ESTADOS.EN_DIAGNOSTICO]: { label: 'En Diagnostico', color: '#2563eb', cls: 'badge-i', ink: 'var(--blue-600)', icon: '2', pct: 30 },
  [ESTADOS.ESPERANDO_REPUESTOS]: { label: 'Esperando Repuestos', color: '#d97706', cls: 'badge-w', ink: 'var(--amber-700)', icon: '3', pct: 45 },
  [ESTADOS.EN_PROGRESO]: { label: 'En Reparacion', color: '#2563eb', cls: 'badge-i', ink: 'var(--blue-600)', icon: '4', pct: 60 },
  [ESTADOS.EN_PRUEBA]: { label: 'En Prueba', color: '#7c3aed', cls: 'badge-p', ink: 'var(--purple-700)', icon: '5', pct: 80 },
  [ESTADOS.COMPLETADO]: { label: 'Listo para Entrega', color: '#16a34a', cls: 'badge-s', ink: 'var(--green-700)', icon: '6', pct: 100 },
  [ESTADOS.PROGRAMADO]: { label: 'Programado', color: '#64748b', cls: 'badge-n', ink: 'var(--text)', icon: '—', pct: 10 },
  [ESTADOS.CANCELADO]: { label: 'Cancelado', color: '#dc2626', cls: 'badge-d', ink: 'var(--red-700)', icon: '✕', pct: 0 },
}

// Columnas que el portal SÍ necesita. Se piden explícitamente (en vez de SELECT *)
// para NO exponer datos sensibles del cliente (telefono_cliente, email_cliente,
// firma_cliente) a cualquiera que conozca/adivine una cédula. 'inspeccion' se omite
// a propósito: no es una columna real (pedirla haría fallar la consulta).
const SELECT_PORTAL = [
  'id', 'fecha', 'created_at', 'cedula_cliente', 'cliente', 'placa', 'marca', 'modelo',
  'ano', 'kilometraje', 'tecnico_id', 'estado', 'observaciones', 'items', 'total',
  'ot_codigo', 'tipo_aceite', 'proximo_km', 'proxima_visita', 'notas_proximo_mant', 'evidencias',
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
  const [galIdx, setGalIdx] = useState(0)
  const [pagando, setPagando] = useState(null) // id del trabajo cuyo pago Wompi se está abriendo
  const [confirmandoPago, setConfirmandoPago] = useState(false) // volvió del checkout; esperando que el webhook marque pagado
  const [pagosIniciados, setPagosIniciados] = useState(leerPagosIniciados) // { trabajoId: timestamp }
  const [vehSel, setVehSel] = useState(null) // placa del vehículo enfocado (modo flota)
  const touchRef = useRef(null) // gesto de swipe en el visor de fotos
  const portalRef = useRef(null) // contenedor para animaciones GSAP
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
      // El servidor decide el monto (firma el total real de la factura); acá NO se
      // manda monto para que no se pueda alterar. Se usa el que devuelve la firma.
      const res = await fetch('/api/cuentti?wompi=firma', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referencia: t.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok || !data.firma || !data.publicKey || !(data.montoCentavos > 0)) {
        setError(data?.error || 'No se pudo iniciar el pago. Intenta de nuevo en un momento.')
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

    const misTrab = await buscarTrabajosPorCedula(cedulaLimpia)

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

    if (misTrab.length === 0) {
      setError('No se encontraron registros para este documento. Verifica el numero e intenta de nuevo.')
      setDatos(null)
      setAutenticado(false)
      return
    }

    setDatos({ trabajos: misTrab, inspecciones: misInsp, cedula: cedulaLimpia })
    setAutenticado(true)
    // Un pago ya confirmado (trabajo.pagado) deja de estar "por confirmar".
    const yaPagados = misTrab.filter(t => t.pagado).map(t => t.id)
    if (yaPagados.length) quitarPagosIniciados(yaPagados)
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

  // Animaciones (GSAP). Comunican estado, no decoran (Design Principle 4: la
  // sorpresa es un MOMENTO, no toda la página). Una sola línea de tiempo orquesta
  // la entrada al abrir el portal y luego cuenta la historia "¿dónde va mi carro?":
  // secciones en cascada → números de la flota → barras que se llenan → la línea
  // del avance se dibuja y cada paso aparece. Todo easeOut (sin rebote) y se salta
  // por completo si el sistema pide menos movimiento.
  useEffect(() => {
    if (!autenticado || !datos) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })

      // 1) El momento: las secciones principales suben y aparecen escalonadas.
      const secciones = Array.from(portalRef.current?.children || [])
        .filter(el => el.classList?.contains('card') || el.classList?.contains('portal-col'))
      if (secciones.length) tl.from(secciones, { opacity: 0, y: 22, duration: 0.5, stagger: 0.06 })

      // 2) Números de la flota cuentan hacia arriba (cuántos vehículos, cómo van).
      gsap.utils.toArray('.fleet-num').forEach((el, i) => {
        const end = parseFloat(el.dataset.n) || 0
        const obj = { v: 0 }
        tl.to(obj, { v: end, duration: 0.7, ease: 'power2.out',
          onUpdate: () => { el.textContent = String(Math.round(obj.v)) } }, i === 0 ? '-=0.35' : '<')
      })

      // 3) Tarjetas de vehículo en cascada (el fade lo da la sección; aquí, empuje).
      tl.from('.veh-card', { y: 16, scale: 0.98, duration: 0.42, stagger: 0.05 }, '-=0.4')
      gsap.utils.toArray('.bar-fill').forEach((el, i) => {
        const pct = parseFloat(el.dataset.pct) || 0
        tl.fromTo(el, { width: '0%' }, { width: pct + '%', duration: 0.6, ease: 'power3.out' }, i === 0 ? '-=0.4' : '<')
      })

      // 4) Vehículo único: la barra grande se llena y el % cuenta hasta su valor.
      gsap.utils.toArray('.pct-bar').forEach(el => {
        const pct = parseFloat(el.dataset.pct) || 0
        tl.fromTo(el, { width: '0%' }, { width: pct + '%', duration: 0.7 }, '-=0.5')
      })
      gsap.utils.toArray('.pct-num').forEach(el => {
        const end = parseFloat(el.dataset.pct) || 0
        const obj = { v: 0 }
        tl.to(obj, { v: end, duration: 0.7, ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.v) + '% completado' } }, '<')
      })

      // 5) "¿Dónde va mi carro?": la línea del avance se dibuja de arriba a abajo y
      //    cada paso (punto + rótulo) aparece en secuencia. fromTo (no from) para que
      //    el estado final sea explícito y determinista.
      tl.fromTo('.paso-line', { scaleY: 0 }, { scaleY: 1, duration: 0.4, ease: 'power2.out' }, '-=0.45')
      tl.fromTo('.paso-dot', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.34, stagger: 0.07 }, '-=0.3')
      tl.fromTo('.paso-lbl', { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.34, stagger: 0.07 }, '<')
    }, portalRef)
    return () => ctx.revert()
  }, [autenticado, datos])

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

  // Vista login por cedula
  if (!autenticado) {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:20}}>
        <div style={{width:'100%',maxWidth:420}}>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'28px 32px 22px',background:'var(--navy-900)',color:'#fff',textAlign:'center'}}>
              <img src="/logo.png" alt="MDA" style={{width:50,height:50,objectFit:'contain',borderRadius:12,background:'#fff',padding:4,marginBottom:12}}/>
              <h1 style={{fontSize:20,fontWeight:800,margin:'0 0 4px',letterSpacing:'.02em'}}>Multidiagnosticos AS</h1>
              <p style={{fontSize:13,opacity:.92,fontWeight:500,margin:0}}>Seguimiento en línea de su vehículo</p>
            </div>
            <div style={{padding:'24px 32px 28px'}}>
              <form onSubmit={buscar} style={{display:'flex',flexDirection:'column',gap:16}}>
                <div className="field">
                  <label>Número de cédula o NIT</label>
                  <input
                    className="input"
                    value={cedula}
                    onChange={e => setCedula(e.target.value)}
                    placeholder="Ej: 1234567890"
                    inputMode="numeric"
                    autoComplete="off"
                    style={{fontSize:16,padding:'14px 16px',textAlign:'center'}}
                    autoFocus
                  />
                </div>
                {error && (
                  <div style={{background:'var(--red-50,#fef2f2)',color:'var(--red-700,#991b1b)',padding:'10px 14px',borderRadius:8,fontSize:13}}>
                    {error}
                  </div>
                )}
                <button type="submit" className="btn btn-primary" style={{width:'100%',padding:'14px',fontSize:15}} disabled={cargando}>
                  {cargando ? 'Consultando...' : 'Consultar Estado'}
                </button>
              </form>
              <p style={{fontSize:12,color:'var(--text-4)',textAlign:'center',marginTop:20}}>
                Su numero de documento es la clave de acceso para ver el estado de sus vehiculos.
              </p>
            </div>
          </div>
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
      // "SERVICIO" es el marcador de venta directa (sin vehículo): no es un carro.
      const placa = (t.placa || '').toUpperCase()
      if (!placa || placa === 'SERVICIO' || placa === '—') return
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
  const totalPorPagar = facturasPendientes.reduce((s, t) => s + (t.total || 0), 0)
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
    {lbl:'Recibido',pct:15},{lbl:'Diagnostico',pct:30},{lbl:'Repuestos',pct:45},
    {lbl:'Reparacion',pct:60},{lbl:'Prueba',pct:80},{lbl:'Entrega',pct:100},
  ]

  // Una fila del historial. `compact` (modo flota) omite Placa/Vehículo porque ya
  // están en el encabezado del grupo del vehículo.
  const filaHist = (t, compact = false) => (
    <tr key={t.id}>
      <td data-label="Fecha" style={{color:'var(--text-3)',fontSize:13}}>{fmtDate(t.fecha)}</td>
      {!compact && <td className="c-name mono" style={{fontWeight:700}}>{t.placa}</td>}
      {!compact && <td data-label="Vehiculo" style={{color:'var(--text-3)',fontSize:13}}>{[t.marca,t.modelo].filter(Boolean).join(' ')||'—'}</td>}
      <td data-label="Estado">
        <span className={`badge ${ESTADO_TRABAJO_DISPLAY[t.estado]?.cls||'badge-n'}`}>
          {ESTADO_TRABAJO_DISPLAY[t.estado]?.label || t.estado}
        </span>
      </td>
      <td data-label="Fotos">
        {t.evidencias?.length > 0 ? (
          <button className="btn btn-ghost btn-sm" onClick={()=>{setGaleria(t.evidencias);setGalIdx(0)}} style={{gap:5}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            {t.evidencias.length}
          </button>
        ) : <span style={{color:'var(--text-4)'}}>—</span>}
      </td>
      <td className="td-actions" style={{textAlign:'right'}}>
        {t.facturadoEn && !t.pagado && t.total > 0 && (
          pagoPorConfirmar(t) ? (
            <button className="btn btn-outline btn-sm" style={{marginRight:8}} disabled title="Estamos confirmando tu pago">Confirmando pago…</button>
          ) : (
            <button className="btn btn-primary btn-sm" style={{marginRight:8}} disabled={pagando===t.id} onClick={()=>pagarConWompi(t)}>
              {pagando===t.id ? 'Abriendo…' : `Pagar ${fmt(t.total)}`}
            </button>
          )
        )}
        {t.pagado && <span className="badge" style={{background:'var(--soft-green)',color:'var(--green-700)',fontWeight:700,marginRight:8}}>Pagado ✓</span>}
        <button className="btn btn-outline btn-sm" onClick={()=>setVistaServicio(t)}>Ver detalle</button>
      </td>
    </tr>
  )

  return (
    <div className="portal-main" ref={portalRef}>
      {/* Hero — identidad + resumen de flota */}
      <div className="card portal-full" style={{padding:0,overflow:'hidden'}}>
        <div style={{padding:'22px 26px',background:'var(--navy-900)',color:'#fff'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#fff'}}>
              <img src="/logo.png" alt="MDA" style={{width:20,height:20,objectFit:'contain',borderRadius:4}}/> Multidiagnosticos AS
            </div>
            <button className="btn btn-ghost btn-sm" style={{color:'rgba(255,255,255,.9)',border:'1px solid rgba(255,255,255,.28)'}} onClick={salir}>Salir</button>
          </div>
          <div style={{fontSize:14,fontWeight:500,color:'#fff',marginBottom:esFlota?12:2}}>Hola, {tituloCliente(datos.trabajos[0]?.cliente)}</div>
          {esFlota ? (
            <div style={{display:'flex',gap:'12px 28px',flexWrap:'wrap',alignItems:'flex-end'}}>
              {[[vehiculos.length,vehiculos.length===1?'vehículo':'vehículos','#ffffff'],[enProceso,'en el taller','#fbbf24'],[listos,listos===1?'listo para recoger':'listos para recoger','#4ade80']].map(([n,lbl,c],i)=>(
                <div key={i} style={{display:'flex',alignItems:'baseline',gap:8}}>
                  <span className="mono fleet-num" data-n={n} style={{fontSize:27,fontWeight:800,lineHeight:1,color:c}}>{n}</span>
                  <span style={{fontSize:13,opacity:.92,fontWeight:500}}>{lbl}</span>
                </div>
              ))}
            </div>
          ) : trabajoActivo ? (
            <>
              <h2 style={{fontSize:22,fontWeight:700,letterSpacing:'-.01em',marginBottom:4}}>{[trabajoActivo.marca,trabajoActivo.modelo].filter(Boolean).join(' ') || 'Su vehículo'}</h2>
              <div style={{fontSize:13,opacity:.94,fontWeight:500}}>Placa <span className="mono" style={{fontWeight:700}}>{trabajoActivo.placa}</span>{trabajoActivo.otCodigo && <> · Orden <span className="mono">{trabajoActivo.otCodigo}</span></>}</div>
            </>
          ) : (
            <h2 style={{fontSize:22,fontWeight:700,letterSpacing:'-.01em'}}>Historial de servicios</h2>
          )}
        </div>
      </div>

      {/* Facturas por pagar — arriba y visible (es la acción de plata) */}
      {facturasPendientes.length > 0 && (
        <div className="card portal-full" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'15px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,borderBottom:'1px solid var(--border)'}}>
            <h3 style={{margin:0}}>{facturasPendientes.length===1?'Factura por pagar':`Facturas por pagar · ${facturasPendientes.length}`}</h3>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.04em'}}>Total</div>
              <div className="mono" style={{fontSize:18,fontWeight:800}}>{fmt(totalPorPagar)}</div>
            </div>
          </div>
          <div>
            {facturasPendientes.map((t,i)=>(
              <div key={t.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:14,padding:'13px 20px',borderTop:i>0?'1px solid var(--border)':'none'}}>
                <div style={{minWidth:0}}>
                  <span className="mono" style={{fontWeight:700,fontSize:15}}>{t.placa}</span>
                  <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:1}}>{fmtDate(t.fecha)}{t.otCodigo?` · ${t.otCodigo}`:''}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                  <span className="mono" style={{fontWeight:700,fontSize:15}}>{fmt(t.total)}</span>
                  {pagoPorConfirmar(t)
                    ? <button className="btn btn-outline" disabled title="Estamos confirmando tu pago">Confirmando…</button>
                    : <button className="btn btn-primary" disabled={pagando===t.id} onClick={()=>pagarConWompi(t)}>{pagando===t.id?'Abriendo…':'Pagar'}</button>}
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
                      <div className="bar-fill" data-pct={pct} style={{height:'100%',width:`${pct}%`,borderRadius:99,background:est.color}}/>
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
      {/* Estado + progreso */}
      {trabajoActivo && (
        <div className="card">
          <div className="card__b">
            {esFlota && <div style={{fontSize:12.5,color:'var(--text-3)',marginBottom:10}}>Vehículo <span className="mono" style={{fontWeight:700,color:'var(--text)'}}>{trabajoActivo.placa}</span>{trabajoActivo.otCodigo && <> · Orden <span className="mono">{trabajoActivo.otCodigo}</span></>}</div>}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:12,flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:4}}>Estado actual</div>
                <div style={{fontSize:19,fontWeight:800,color:ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.ink||'var(--text)'}}>{ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.label || trabajoActivo.estado}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:4}}>Ingreso</div>
                <div style={{fontSize:15,fontWeight:700}}>{fmtDate(trabajoActivo.fecha)}</div>
              </div>
            </div>
            <div style={{height:8,background:'var(--bg-subtle)',borderRadius:99,overflow:'hidden',marginTop:14}}>
              <div className="pct-bar" data-pct={ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct||0} style={{width:`${ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct||0}%`,height:'100%',background:'var(--amber-500)',borderRadius:99,transition:'width .5s ease-out'}}/>
            </div>
            <div className="pct-num" data-pct={ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct||0} style={{fontSize:11,color:'var(--text-3)',marginTop:6,fontWeight:600}}>{ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct||0}% completado</div>
          </div>
        </div>
      )}
      {/* Timeline de avance */}
      {trabajoActivo && (
        <div className="card">
          <div className="card__h"><h3>Avance del trabajo</h3></div>
          <div className="card__b">
            <div style={{position:'relative',paddingLeft:32}}>
              <div className="paso-line" style={{position:'absolute',left:11,top:8,bottom:8,width:2,background:'var(--border)',transformOrigin:'top'}}/>
              {pasos.map((p,k)=>{
                const currentPct = ESTADO_TRABAJO_DISPLAY[trabajoActivo.estado]?.pct || 0
                const done = currentPct >= p.pct
                const active = currentPct >= p.pct - 15 && currentPct < p.pct
                return (
                  <div key={k} style={{position:'relative',paddingBottom:k<pasos.length-1?20:0}}>
                    <div className="paso-dot" style={{position:'absolute',left:-26,top:2,width:24,height:24,borderRadius:'50%',
                      background:done?'var(--green-500)':active?'var(--amber-500)':'var(--bg-raised)',
                      border:!done&&!active?'2px solid var(--border)':'none',
                      display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:12}}>
                      {done?<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>:active?<span style={{width:8,height:8,borderRadius:'50%',background:'#fff'}}/>:''}
                    </div>
                    <div className="paso-lbl" style={{fontWeight:active?700:600,fontSize:14,color:!done&&!active?'var(--text-3)':'var(--text)'}}>
                      {p.lbl}
                      {active && <span className="badge badge-w" style={{marginLeft:8}}>En curso</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Observaciones */}
      {trabajoActivo?.observaciones && (
        <div className="card" style={{padding:'16px 20px',background:'var(--bg-subtle)',border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6}}>Observaciones</div>
          <div style={{fontSize:13.5,color:'var(--text)',lineHeight:1.55}}>{trabajoActivo.observaciones}</div>
        </div>
      )}
      </div>

      <div className="portal-col">
      {/* Tecnico asignado */}
      {trabajoActivo && tecNombre(trabajoActivo.tecnicoId) && (
        <div className="card">
          <div className="card__h"><h3>Tecnico asignado</h3></div>
          <div className="card__b" style={{display:'flex',gap:14,alignItems:'center'}}>
            <div style={{width:54,height:54,borderRadius:'50%',background:'var(--amber-500)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--navy-900)',fontWeight:800,fontSize:18,flexShrink:0}}>
              {tecNombre(trabajoActivo.tecnicoId).split(' ').map(x=>x[0]).slice(0,2).join('')}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15}}>{tecNombre(trabajoActivo.tecnicoId)}</div>
              <div style={{fontSize:12.5,color:'var(--text-3)'}}>Multidiagnosticos AS</div>
            </div>
          </div>
        </div>
      )}

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

      {/* Inspecciones del vehículo en foco */}
      {inspFoco.length > 0 && (
        <div className="card">
          <div className="card__h"><h3>Inspecciones</h3><span className="count">{inspFoco.length}</span></div>
          <div className="card__b" style={{display:'flex',flexDirection:'column',gap:0}}>
            {inspFoco.map((insp, idx) => {
              const items = insp.items || []
              const urgentes = items.filter(i => i.estado === 'urgente').length
              const sugeridos = items.filter(i => i.estado === 'sugerido').length
              const buenos = items.filter(i => i.estado === 'bueno').length
              const total = items.filter(i => i.estado !== 'no_aplica').length
              const pct = total > 0 ? Math.round((buenos / total) * 100) : 0

              return (
                <div key={insp.id || idx} style={{padding:'14px 0',borderBottom:idx<inspFoco.length-1?'1px solid var(--border)':'none'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{insp.placa} <span style={{color:'var(--text-3)',fontWeight:400,fontSize:13}}>— {insp.vehiculo || ''}</span></div>
                      <div style={{fontSize:12.5,color:'var(--text-3)',marginTop:2}}>{fmtDate(insp.fecha)}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{display:'flex',gap:4}}>
                        {buenos > 0 && <span className="badge badge-s">{buenos}</span>}
                        {sugeridos > 0 && <span className="badge badge-w">{sugeridos}</span>}
                        {urgentes > 0 && <span className="badge badge-d">{urgentes}</span>}
                      </div>
                      <span style={{fontWeight:700,fontSize:13,color:pct>=80?'var(--green-600)':pct>=50?'var(--amber-600)':'var(--red-600)'}}>{pct}%</span>
                      <button className="btn btn-outline btn-sm" onClick={() => setVistaInspeccion(insp)}>Ver</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => descargarPDF(insp)}>PDF</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                  <table className="tbl tbl-cards">
                    <tbody>{v.trabajos.map(t => filaHist(t, true))}</tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card portal-full">
            <div className="card__h"><h3>Historial de servicios</h3><span className="count">{datos.trabajos.length}</span></div>
            <div className="card__b card__b--flush">
              <table className="tbl tbl-cards">
                <thead>
                  <tr><th>Fecha</th><th>Placa</th><th>Vehiculo</th><th>Estado</th><th>Fotos</th><th /></tr>
                </thead>
                <tbody>{datos.trabajos.map(t => filaHist(t, false))}</tbody>
              </table>
            </div>
          </div>
        )
      )}

      {!trabajoActivo && datos.trabajos.length === 0 && (
        <div className="empty portal-full">
          <p>No hay trabajos activos en este momento.</p>
        </div>
      )}

      <div className="portal-full" style={{textAlign:'center',fontSize:12,color:'var(--text-4)',padding:'8px 0 18px'}}>
        Multidiagnosticos AS · Sabanalarga, Atlantico
      </div>

      {/* Detalle de un servicio del historial (mini-factura del cliente) */}
      {vistaServicio && (() => {
        const t = vistaServicio
        const items = Array.isArray(t.items) ? t.items : []
        const linea = (i) => Math.round((parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1))
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
                  <div className="mono" style={{fontSize:19,fontWeight:800,letterSpacing:'-.01em',marginTop:2}}>{t.placa}</div>
                  <div style={{fontSize:13,color:'var(--text-3)'}}>{[t.marca,t.modelo,t.ano].filter(Boolean).join(' ') || '—'}</div>
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
                            {(parseInt(i.cantidad) || 1) > 1 && <> · {parseInt(i.cantidad)} × {fmt(Math.round(parseFloat(i.precio) || 0))}</>}
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
  )
}
