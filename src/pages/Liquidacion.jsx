import { useState, useMemo, useRef, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO, tituloCliente, cantidadItem } from '../utils/helpers'
import MoneyInput from '../components/MoneyInput'
import { COMISION, ESTADOS } from '../utils/constants'
import { lsGet, lsSet } from '../services/storage'
import { useTecnicos } from '../services/tecnicos'
import { registrarGastoNominaBackend } from '../services/cuentti'
import { usePrestamos } from '../hooks/usePrestamos'
import { upsertPrestamo, fetchPrestamos, fetchLiquidacionIdsPorBase } from '../services/supabase'
import { splitComision, repartir } from '../services/money'
import ConfirmDialog, { DlgRow } from '../components/ConfirmDialog'
import { Button, Badge, IconX } from '../components/ui'
import EstadoCuenta from './EstadoCuenta'
import { loadLogo, drawHeader, drawSectionHeader, drawDataBlock, drawTotalsBox, drawSignatures, drawFooter, tableStylesItems, tableStylesMuted, PDF_LAYOUT } from '../utils/pdfTheme'

// Obtener base de mano de obra SIN IVA (solo servicios)
const getManoObra = (t) => {
  // M.O. adicional (no facturada): base extra que se le paga al técnico sin
  // cobrarla al cliente. Ya viene SIN IVA y se SUMA siempre. Espejo de
  // manoObraBase() en src/utils/comision.js — mantener las dos en sync.
  const extra = Math.max(0, parseFloat(t?.manoObraExtra ?? t?.mano_obra_extra) || 0)
  if (Array.isArray(t?.items) && t.items.length) {
    const suma = t.items.reduce((s, i) => {
      const precio = parseFloat(i?.precio) || 0
      const cant = cantidadItem(i)
      const ivaPct = parseFloat(i?.iva) || 0
      const tipo = (i?.tipo || i?.categoria || '').toString().toLowerCase()
      const esServ = i?.esServicio === true || i?.es_servicio === 1 || tipo.includes('serv')
      if (!esServ) return s
      const totalLinea = precio * cant
      const base = ivaPct > 0 ? totalLinea / (1 + ivaPct / 100) : totalLinea
      return s + base
    }, 0)
    // Si hay líneas marcadas "Servicio", esas mandan (comportamiento de siempre)
    // MÁS la M.O. adicional. Si NO hay (ej. cambio de aceite), se cae al valor
    // guardado de mano de obra que se escribió a mano en la OT.
    if (suma > 0) return Math.round(suma + extra)
  }
  // Fallback a campos directos (mano de obra manual de la OT) + adicional
  if (typeof t?.manoObra === 'number' && !Number.isNaN(t.manoObra)) return Math.round(Math.max(0, t.manoObra) + extra)
  if (typeof t?.mano_obra === 'number' && !Number.isNaN(t.mano_obra)) return Math.round(Math.max(0, t.mano_obra) + extra)
  return Math.round(extra)
}

// Del gasto del administrador ("diario") el TALLER asume el 60% y los TÉCNICOS
// el 40%. Ese 40% se aplica sobre el monto del movimiento, que ya viene:
//   - completo si es de un solo técnico (ej. $40.000 → asume $16.000),
//   - dividido si es repartido (ej. $40.000 entre 2 = $20.000 c/u → $8.000 c/u).
// En ambos casos el taller termina asumiendo los $24.000 (60%). (Antes era 50%.)
const APORTE_ADMIN_SPLIT = 0.40
// Cargo EFECTIVO que se le descuenta al técnico:
//  - "diario" (gasto del administrador por día): el técnico asume el 40% del
//    monto del movimiento; el taller cubre el 60%.
//  - todos los demás (adelanto, préstamo, consumo, descuento): es plata que el
//    técnico debe, se recupera al 100%.
const cargoEfectivo = (m) => {
  const monto = parseFloat(m?.monto) || 0
  return (m?.tipo === 'diario') ? monto * APORTE_ADMIN_SPLIT : monto
}

// Etiqueta visible del tipo de movimiento. El "diario" (gasto del administrador)
// se MUESTRA como "Administrador"; internamente sigue siendo 'diario'. El tipo
// 'cuenta' es el abono al Estado de cuenta descontado en la liquidación.
const TIPO_LABELS = { diario: 'Administrador', cuenta: 'Cuenta' }
const tipoLabel = (t) => TIPO_LABELS[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—')

// Nota del "diario" con el número de días SIEMPRE explícito: si son 2 días el
// descuento es el doble, así que el comprobante debe decirlo (antes la nota por
// defecto solo decía "Aporte del día" y se perdía cuántos días eran). No duplica
// si el texto ya menciona los días.
const notaDiario = (base, dias) => {
  const b = (base || '').trim() || 'Aporte de administración (Nicanor)'
  const d = Math.max(1, Math.floor(dias) || 1)
  const yaLoDice = new RegExp(`\\b${d}\\s*d[ií]as?\\b`, 'i').test(b)
  return yaLoDice ? b : `${b} · ${d} ${d === 1 ? 'día' : 'días'}`
}

// Iniciales del técnico (2 letras) para la referencia legible.
const iniciales = (nombre) => (nombre || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'XX'

// Fecha compacta para la tabla: "24 jul" (el año solo si NO es el actual).
// es-CO devuelve "24 de jul. de 2026": sobra el "de" y el punto de la
// abreviatura, y repetir el año en una lista del cierre en curso es ruido.
const fechaCorta = (iso) => {
  if (!iso) return '—'
  const m = typeof iso === 'string' && iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const mes = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
  return d.getFullYear() === new Date().getFullYear()
    ? `${d.getDate()} ${mes}`
    : `${d.getDate()} ${mes} ${d.getFullYear()}`
}


// Referencia visible de una liquidación (para trazar con Cuentti). Los ids nuevos
// son legibles (ej. LQ-PB0702 → "PB0702"); los viejos eran un uid aleatorio largo,
// de esos se muestran los últimos 6. Se le pasa el id del registro.
const liqRef = (id) => {
  let s = (id || '').toString().replace(/^LQ-/i, '')
  // Los ids nuevos son legibles y cortos (ej. PB260702, PB260702-2); los viejos
  // eran un uid aleatorio de 13 chars → de esos mostramos los últimos 6.
  if (s.length > 11) s = s.slice(-6)
  return s.toUpperCase()
}

export default function Liquidacion({ trabajos, notify, liquidacionHook }) {
  const TECNICOS = useTecnicos()
  const {
    movimientos, liquidados, compartidos, historial,
    loading, connectionError,
    agregarMovimiento: hookAgregarMov, eliminarMovimiento: hookEliminarMov,
    agregarLiquidados, desliquidarPorTrabajo, quitarLiquidados, eliminarHistorial,
    toggleCompartido, setCompartidoPartner, agregarHistorial, guardarHistorial,
  } = liquidacionHook

  const prestamosHook = usePrestamos()
  const pagandoRef = useRef(false) // evita doble "Generar pago" (doble pago) por doble clic
  const [dialog, setDialog] = useState(null) // diálogo de confirmación propio (pago / borrado)
  const [vistaLiq, setVistaLiq] = useState('comisiones') // 'comisiones' | 'cuentas'

  const [tecnicoSel, setTecnicoSel] = useState('')
  const [seleccionados, setSeleccionados] = useState({})
  const [verHistorial, setVerHistorial] = useState(false)
  const [verLiquidados, setVerLiquidados] = useState(false)
  const [verSinTecnico, setVerSinTecnico] = useState(false)  // detalle de las OTs huérfanas
  const [verInactivos, setVerInactivos] = useState(false)    // técnicos sin nada por liquidar
  // Filtros del historial: 48 pagos en una lista plana no se podían recorrer.
  const [histTec, setHistTec] = useState('')      // id de técnico | ''
  const [histMes, setHistMes] = useState('')      // 'YYYY-MM' | ''
  const [histSinCuentti, setHistSinCuentti] = useState(false)
  const [compAbierto, setCompAbierto] = useState({}) // trabajoId -> selector de compañero desplegado
  // Ventanas del tecnico seleccionado: minimizables por header
  const [colapso, setColapso] = useState({ trabajos: false, movs: false })
  const toggleColapso = (k) => setColapso(c => ({ ...c, [k]: !c[k] }))
  // CTA del estado vacío del paso 3 ("Ir al paso 2"): despliega la tabla de
  // trabajos si estaba colapsada y hace scroll hasta ella.
  const irAPaso2 = () => {
    setColapso(c => ({ ...c, trabajos: false }))
    document.getElementById('liq-paso2')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const [movForm, setMovForm] = useState({
    tipo: 'adelanto',
    monto: '',
    nota: '',
    fecha: hoyISO(),
  })
  // "Diario": cargo fijo por día (mismo valor para todo el equipo, editable y
  // persistido). Tú escribes los días; se agrega como cargo y se descuenta del neto.
  const VALOR_DIARIO_KEY = 'valor_diario_taller'
  const [valorDiario, setValorDiario] = useState(() => Number(lsGet(VALOR_DIARIO_KEY, 30000)) || 0)
  const [diarioDias, setDiarioDias] = useState('')
  const cambiarValorDiario = (v) => { const n = Number(v) || 0; setValorDiario(n); lsSet(VALOR_DIARIO_KEY, n) }
  // Modo "repartir": el total (valor × días) se divide en partes iguales entre
  // los técnicos marcados. Útil cuando el gasto del admin lo comparten varios.
  const [diarioReparto, setDiarioReparto] = useState(false)
  const [diarioRepTec, setDiarioRepTec] = useState({})
  // Nota que verá el técnico en su liquidación. Editable, con texto por defecto
  // que enmarca el diario como aporte (no como cobro).
  const DIARIO_NOTA_DEFAULT = 'Aporte de administración (Nicanor)'
  const [diarioNota, setDiarioNota] = useState(DIARIO_NOTA_DEFAULT)
  // Pago real: cuánto le entregas en efectivo (por defecto el neto). Si pagas de
  // menos, la diferencia va al Estado de cuenta según diffDestino.
  const [pagoReal, setPagoReal] = useState('')
  const [diffDestino, setDiffDestino] = useState('debo') // 'debo' | 'prestamo'
  const [metodoPagoLiq, setMetodoPagoLiq] = useState('efectivo') // 'efectivo' | 'transferencia' (cómo se le entrega al técnico)
  // Descuento desde el Estado de cuenta en ESTE pago: se marcan deudas o se
  // escribe el monto. '' = no descontar nada. Al confirmar el pago se abona
  // automático a la cuenta del técnico con la referencia de la liquidación.
  const [cuentaMonto, setCuentaMonto] = useState('')
  const [cuentaSelIds, setCuentaSelIds] = useState({})
  const [aporteForm, setAporteForm] = useState(null) // 'diario' | 'adelanto' | null (formulario en línea, a demanda)
  useEffect(() => { setCuentaMonto(''); setCuentaSelIds({}); setAporteForm(null) }, [tecnicoSel])
  const [regCuenttiId, setRegCuenttiId] = useState(null) // id del pago que se está registrando en Cuentti
  const [metodoGasto, setMetodoGasto] = useState({}) // reg.id -> 'efectivo' | 'transferencia'
  const gastoRef = useRef(new Set()) // pagos con registro de gasto EN CURSO (anti doble-clic síncrono)
  const [gastoError, setGastoError] = useState({}) // reg.id -> true si el último intento falló (reintento con aviso)

  // Ids de medio de pago, reusando la MISMA config que la facturación (localStorage).
  const medioPagoIds = (key) => {
    let metodos = { efectivo: 1, transferencia: 7 }
    try { metodos = { ...metodos, ...JSON.parse(localStorage.getItem('cuentti:metodos_pago') || '{}') } } catch { /* defaults */ }
    let idBancoT = 2
    try { idBancoT = parseInt(localStorage.getItem('cuentti:id_banco')) || 2 } catch { /* default */ }
    return key === 'transferencia'
      ? { idMedioPago: metodos.transferencia ?? 7, idBanco: idBancoT }
      : { idMedioPago: metodos.efectivo ?? 1, idBanco: 1 }
  }

  // Registra el gasto de nómina de un pago en Cuentti (botón del historial).
  const registrarEnCuentti = async (reg) => {
    // Ya registrado: no re-registrar (evita gasto doble).
    if (reg.cuenttiGasto) { notify(`Este pago ya está registrado en Cuentti (${reg.cuenttiGasto}).`, 'info'); return }
    // Guard SÍNCRONO: si ya hay una petición en curso para este pago, ignora el
    // clic. El ref se lee al instante (a diferencia del estado, que es async y
    // deja pasar dos clics rápidos antes de deshabilitar el botón).
    if (gastoRef.current.has(reg.id)) return
    const tec = TECNICOS.find(t => t.id === reg.tecnicoId)
    const cedula = tec?.cedula
    if (!cedula) { notify(`Falta la cédula de ${reg.tecnico}. Agrégala en Mecánicos.`, 'error'); return }
    const esCredito = (metodoGasto[reg.id] || 'efectivo') === 'credito'
    // A crédito registra el TOTAL que se le debe (el neto), no lo entregado en
    // efectivo (que puede ser 0 si se le quedó debiendo). Al contado usa lo pagado.
    const monto = esCredito ? (reg.neto ?? 0) : (reg.pagado != null ? reg.pagado : reg.neto)
    if (!(monto > 0)) { notify('El monto de este pago no es positivo; no se registra gasto.', 'error'); return }
    const { idMedioPago, idBanco } = esCredito ? { idMedioPago: 0, idBanco: 0 } : medioPagoIds(metodoGasto[reg.id] || 'efectivo')
    gastoRef.current.add(reg.id)
    setRegCuenttiId(reg.id)
    try {
      const data = await registrarGastoNominaBackend({
        proveedorCedula: cedula,
        proveedorNombre: reg.tecnico,
        monto,
        idMedioPago,
        idBanco,
        aCredito: esCredito,
        idemKey: reg.id, // idempotencia: reintento tras timeout no re-graba el gasto
        nota: `Nómina ${reg.tecnico} · liq #${liqRef(reg.id)}${esCredito ? ' · A CRÉDITO' : ''}`,
      })
      const doc = data.numeroDoc ? `G-${data.numeroDoc}` : (data.idTransacion || 'OK')
      guardarHistorial(historial.map(h => h.id === reg.id ? { ...h, cuenttiGasto: doc } : h))
      setGastoError(g => { const n = { ...g }; delete n[reg.id]; return n })
      notify(`Gasto registrado en Cuentti: ${doc}`, 'success')
    } catch {
      // La red falló, PERO el gasto pudo haber llegado a Cuentti igual. Se marca
      // para que el reintento avise de verificar antes (ver pedirRegistrarCuentti).
      setGastoError(g => ({ ...g, [reg.id]: true }))
      notify('Error de red al registrar. ⚠️ El gasto PUDO quedar en Cuentti — verifícalo antes de reintentar.', 'error')
    } finally {
      gastoRef.current.delete(reg.id)
      setRegCuenttiId(null)
    }
  }

  // Reintento tras un error: avisa que el intento anterior pudo entrar en Cuentti
  // (timeout de red que igual se grabó) para que el usuario NO pague doble.
  const pedirRegistrarCuentti = (reg) => {
    if (gastoError[reg.id]) {
      setDialog({
        title: 'Reintentar registro en Cuentti',
        lead: `El intento anterior falló por red, pero el gasto de ${reg.tecnico} PUDO haber quedado registrado en Cuentti. Revisa en Cuentti que NO exista ya (para no pagar doble) antes de continuar.`,
        confirmLabel: 'Ya verifiqué, registrar',
        tone: 'danger',
        onConfirm: () => registrarEnCuentti(reg),
      })
      return
    }
    registrarEnCuentti(reg)
  }

  // Reconciliación segura tras un timeout: si el usuario verificó en Cuentti que
  // el gasto SÍ quedó (el envío entró pero la app no recibió confirmación), lo
  // marca como registrado SIN volver a enviarlo → evita el gasto doble. Es la
  // salida que hoy toca hacer a mano (anular el duplicado). El fix de fondo es la
  // idempotencia en /api/cuentti-gasto (misma bitácora que ya usa el MCP).
  const marcarYaRegistradoCuentti = (reg) => {
    setDialog({
      title: 'Marcar como ya registrado',
      lead: `Usa esto SOLO si revisaste en Cuentti y el gasto de ${reg.tecnico} por ${fmt(reg.pagado != null ? reg.pagado : reg.neto)} YA aparece. Se marca como registrado y no se vuelve a enviar (así no queda doble).`,
      confirmLabel: 'Sí, ya está en Cuentti',
      tone: 'primary',
      onConfirm: () => {
        guardarHistorial(historial.map(h => h.id === reg.id ? { ...h, cuenttiGasto: '✓ verificado' } : h))
        setGastoError(g => { const n = { ...g }; delete n[reg.id]; return n })
        notify(`Pago de ${reg.tecnico} marcado como registrado en Cuentti.`, 'success')
      },
    })
  }
  const toggleDiarioRepTec = (id) => setDiarioRepTec(p => ({ ...p, [id]: !p[id] }))

  const primerNombre = (id) => (TECNICOS.find(x => x.id === parseInt(id))?.nombre || '').split(' ')[0] || '?'

  // En un compartido, quién es el OTRO respecto al técnico que se está liquidando:
  // si le pagas al asignado, el otro es el compañero, y al revés.
  const otroTecnico = (t) => {
    const { partner } = compInfo(t.id)
    const asignado = parseInt(t.tecnicoId)
    return parseInt(tecnicoSel) === asignado ? partner : asignado
  }

  // Marcar/desmarcar compartido avisando si el trabajo ya tiene un pago hecho.
  const toggleCompartidoSeguro = (trabajoId) => {
    const yaLiq = liquidados.some(x => x === trabajoId || x.startsWith(`${trabajoId}#`))
    if (yaLiq) {
      setDialog({ title: 'Cambiar “Compartido”', lead: 'Este trabajo ya tiene un pago liquidado; cambiarlo puede descuadrar lo pagado.', confirmLabel: 'Cambiar igual', tone: 'danger', onConfirm: () => toggleCompartido(trabajoId) })
      return
    }
    toggleCompartido(trabajoId)
  }

  // compartidos[id] puede ser true (legacy, sin partner) o { partner: tecId }
  const compInfo = (id) => {
    const c = compartidos[id]
    if (!c) return { es: false, partner: null }
    return { es: true, partner: typeof c === 'object' ? (c.partner || null) : null }
  }

  // Liquidación de COMPARTIDOS es por técnico: en `liquidados` se guarda
  // `${id}#${tecnicoId}` (una mitad pagada), no el id plano. Así, al pagarle su
  // mitad a un técnico, el trabajo SIGUE pendiente para el compañero.
  const liquidadoPara = (t, tid) => {
    const { es } = compInfo(t.id)
    if (!es) return liquidados.includes(t.id) // no compartido: un solo flag
    if (liquidados.includes(`${t.id}#${tid}`)) return true
    // Compat con datos viejos: un flag PLANO de un compartido = el asignado ya cobró.
    if (liquidados.includes(t.id) && tid === parseInt(t.tecnicoId)) return true
    return false
  }
  // ¿Ya cobraron TODAS las partes? (para ocultar el trabajo de los pendientes)
  const totalmenteLiquidado = (t) => {
    const { es, partner } = compInfo(t.id)
    if (!es) return liquidados.includes(t.id)
    const tid = parseInt(t.tecnicoId)
    return liquidadoPara(t, tid) && (!partner || liquidadoPara(t, partner))
  }

  const toggleSeleccion = (trabajoId) => {
    setSeleccionados(prev => {
      const next = { ...prev }
      if (next[trabajoId]) delete next[trabajoId]
      else next[trabajoId] = true
      return next
    })
  }

  const seleccionarTodos = (ids) => {
    const next = { ...seleccionados }
    const todosYa = ids.every(id => next[id])
    ids.forEach(id => { if (todosYa) delete next[id]; else next[id] = true })
    setSeleccionados(next)
  }

  // Trabajos completados pendientes de liquidar
  const trabajosPendientes = useMemo(() => {
    return trabajos.filter(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return false
      if (totalmenteLiquidado(t)) return false // compartido: sigue hasta que cobren AMBOS
      return true
    }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [trabajos, liquidados, compartidos])

  // Mano de obra por trabajo, calculada una sola vez
  const moMap = useMemo(() => {
    const m = {}
    trabajosPendientes.forEach(t => { m[t.id] = getManoObra(t) })
    return m
  }, [trabajosPendientes])

  // Agrupar por tecnico.
  // Compartido = el 40% se divide 20/20 entre el tecnico ASIGNADO y el COMPANERO elegido.
  // (Antes el reparto estaba fijo a los tecnicos 1 y 2: una OT compartida del
  //  tecnico 3 desaparecia de su liquidacion. Bug corregido.)
  const porTecnico = useMemo(() => {
    const map = {}
    TECNICOS.forEach(t => {
      map[t.id] = { tecnico: t, trabajos: [], totalMO: 0, comision: 0 }
    })

    trabajosPendientes.forEach(t => {
      const tid = parseInt(t.tecnicoId)
      const manoObra = moMap[t.id] || 0
      const { es, partner } = compInfo(t.id)

      if (es) {
        // 20/20 con allocate: la comisión del trabajo (round(MO×40%)) se reparte
        // en dos mitades ENTERAS [asignado, compañero] que suman EXACTO (antes cada
        // mitad se redondeaba por separado y se podía ganar/perder ≤1 peso).
        const [mitadAsig, mitadComp] = splitComision(manoObra, COMISION.TOTAL)
        if (map[tid] && !liquidadoPara(t, tid)) {
          map[tid].trabajos.push(t)
          map[tid].totalMO += manoObra
          map[tid].comision += mitadAsig
        }
        if (partner && partner !== tid && map[partner] && !liquidadoPara(t, partner)) {
          map[partner].trabajos.push(t)
          map[partner].totalMO += manoObra
          map[partner].comision += mitadComp
        }
      } else if (map[tid]) {
        map[tid].trabajos.push(t)
        map[tid].totalMO += manoObra
        map[tid].comision += manoObra * COMISION.TOTAL
      }
    })

    return map
  }, [trabajosPendientes, compartidos, moMap, TECNICOS])

  // KPIs calculados desde los trabajos (sin doble conteo de compartidos)
  const kpis = useMemo(() => {
    let facturado = 0, comisiones = 0, sinPartner = 0, sinTecnico = 0
    trabajosPendientes.forEach(t => {
      const mo = moMap[t.id] || 0
      const { es, partner } = compInfo(t.id)
      const tid = parseInt(t.tecnicoId)
      if (es) {
        if (!partner) sinPartner++
        // Cada mitad pendiente (asignado / compañero) aporta medio trabajo. Así un
        // compartido a medio liquidar deja de sumar la mitad que ya se pagó.
        const media = mo / 2
        const [comAsig, comComp] = splitComision(mo, COMISION.TOTAL)
        if (!liquidadoPara(t, tid)) { facturado += media; comisiones += comAsig }
        if (partner && partner !== tid && !liquidadoPara(t, partner)) { facturado += media; comisiones += comComp }
      } else {
        facturado += mo
        comisiones += mo * COMISION.TOTAL
      }
      if (!TECNICOS.some(x => x.id === tid)) sinTecnico++
    })
    return {
      facturado: Math.round(facturado),
      comisiones: Math.round(comisiones),
      utilidad: Math.round(facturado - comisiones),
      sinPartner, sinTecnico,
    }
  }, [trabajosPendientes, compartidos, moMap, TECNICOS])

  // Datos del tecnico seleccionado
  const tecData = tecnicoSel ? porTecnico[parseInt(tecnicoSel)] : null
  const tecTrabajos = tecData?.trabajos || []
  const tecMovs = useMemo(() =>
    movimientos
      .filter(m => m.tecnicoId === parseInt(tecnicoSel))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [movimientos, tecnicoSel])

  // Cuenta del técnico (Estado de cuenta): préstamos/adelantos pendientes.
  // saldo > 0 = el técnico debe. Es el MISMO libro de la pestaña Estado de
  // cuenta: lo que se registra aquí aparece allá y viceversa.
  const tecCuenta = useMemo(() => {
    const tid = parseInt(tecnicoSel)
    const nombre = (tecData?.tecnico?.nombre || '').trim().toLowerCase()
    const movs = (prestamosHook.movimientos || []).filter(m =>
      m.tecnicoId === tid || (m.tecnicoId == null && (m.persona || '').trim().toLowerCase() === nombre))
    const saldo = Math.round(movs.reduce((s, m) => s + (m.tipo === 'abono' ? -m.monto : m.monto), 0))
    // El libro no amarra cada abono a una deuda puntual, así que aquí se
    // reparten FIFO (la deuda más vieja primero) SOLO para mostrar: una deuda
    // que los abonos ya cubrieron no se vuelve a ofrecer para descontar (antes
    // salía completa aunque el "Debe" neto ya la restaba — parecía deuda doble).
    // A una cubierta a medias se le muestra solo lo que queda. La suma de los
    // restantes siempre es igual al saldo cuando debe.
    let bolsaAbonos = movs.filter(m => m.tipo === 'abono').reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
    const deudas = movs.filter(m => m.tipo === 'prestamo')
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .map(m => {
        const monto = parseFloat(m.monto) || 0
        const cubre = Math.min(bolsaAbonos, monto)
        bolsaAbonos -= cubre
        return { ...m, restante: Math.round(monto - cubre) }
      })
      .filter(m => m.restante > 0)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    return { movs, saldo, deudas }
  }, [prestamosHook.movimientos, tecnicoSel, tecData])

  // Totales de la seleccion actual
  const totalSeleccion = useMemo(() => {
    let manoObra = 0, comision = 0
    const selTid = parseInt(tecnicoSel)
    tecTrabajos.forEach(t => {
      if (!seleccionados[t.id]) return
      const mo = moMap[t.id] || 0
      const { es } = compInfo(t.id)
      manoObra += mo
      if (es) {
        // La mitad del técnico que se está liquidando (asignado=[0], compañero=[1]).
        const [mitadAsig, mitadComp] = splitComision(mo, COMISION.TOTAL)
        comision += (selTid === parseInt(t.tecnicoId)) ? mitadAsig : mitadComp
      } else {
        comision += mo * COMISION.TOTAL
      }
    })
    const cargos = tecMovs.reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
    // Descuento real al pago: el "diario" se comparte (50/50), el resto se
    // descuenta completo. Ver cargoEfectivo(). neto = comisión − cargos efectivos.
    const cargosMovsEf = Math.round(tecMovs.reduce((s, m) => s + cargoEfectivo(m), 0))
    // CUENTA del técnico (Estado de cuenta), según el signo del saldo:
    //  - debe (saldo > 0): lo marcado/escrito se DESCUENTA, capado al saldo y a
    //    lo que alcance el neto (lo que no alcance queda en su cuenta).
    //  - a favor (saldo < 0): lo escrito se SUMA al pago, capado a lo que el
    //    taller le debe. En ambos casos se registra en su cuenta al pagar.
    const netoSinCuenta = Math.round(comision) - cargosMovsEf
    const montoCuenta = Math.round(parseFloat(cuentaMonto) || 0)
    const descuentoCuenta = tecCuenta.saldo > 0
      ? Math.max(0, Math.min(montoCuenta, tecCuenta.saldo, Math.max(0, netoSinCuenta)))
      : 0
    const sumaCuenta = tecCuenta.saldo < 0
      ? Math.max(0, Math.min(montoCuenta, -tecCuenta.saldo))
      : 0
    const cargosEfectivos = cargosMovsEf + descuentoCuenta - sumaCuenta
    return {
      manoObra: Math.round(manoObra),
      comision: Math.round(comision),
      cargos: Math.round(cargos) + descuentoCuenta,
      cargosMovsEf,
      descuentoCuenta,
      sumaCuenta,
      cargosEfectivos,
      neto: Math.round(comision) - cargosEfectivos,
    }
  }, [tecTrabajos, seleccionados, compartidos, tecMovs, moMap, tecnicoSel, cuentaMonto, tecCuenta])

  const cantSeleccionados = Object.keys(seleccionados).filter(id => seleccionados[id]).length

  // Lo que REALMENTE sale de la caja. El botón y la confirmación mostraban el
  // neto teórico aunque escribieras un pago parcial: decían "Generar pago
  // $56.017" mientras le entregabas $30.000. Una sola fuente para los dos.
  const montoEntregado = (pagoReal === '' || pagoReal == null)
    ? totalSeleccion.neto
    : Math.round(parseFloat(pagoReal) || 0)

  // Resumen general por tecnico.
  // Inactivos solo aparecen si aun tienen pendientes por liquidar (cierre de cuentas).
  const resumenTecnicos = useMemo(() => {
    // Cargos por técnico. cargos = bruto (informativo); cargosEf = descuento real
    // al pago (diario 40%, resto 100% — ver cargoEfectivo).
    const cargosBy = {}, cargosEfBy = {}
    for (const m of movimientos) {
      cargosBy[m.tecnicoId] = (cargosBy[m.tecnicoId] || 0) + (parseFloat(m.monto) || 0)
      cargosEfBy[m.tecnicoId] = (cargosEfBy[m.tecnicoId] || 0) + cargoEfectivo(m)
    }
    // Saldo del Estado de cuenta por técnico (para el chip "debe $X" en la lista).
    const byName = {}
    TECNICOS.forEach(t => { byName[(t.nombre || '').trim().toLowerCase()] = t.id })
    const saldoCuentaBy = {}
    for (const m of (prestamosHook.movimientos || [])) {
      const k = m.tecnicoId ?? byName[(m.persona || '').trim().toLowerCase()]
      if (k == null) continue
      saldoCuentaBy[k] = (saldoCuentaBy[k] || 0) + (m.tipo === 'abono' ? -m.monto : m.monto)
    }
    return TECNICOS.map(t => {
      const pendientes = (porTecnico[t.id]?.trabajos || []).length
      const moTotal = Math.round(porTecnico[t.id]?.totalMO || 0)
      const comisionTotal = Math.round(porTecnico[t.id]?.comision || 0)
      const cargos = Math.round(cargosBy[t.id] || 0)
      const cargosEf = Math.round(cargosEfBy[t.id] || 0)
      const saldoCuenta = Math.round(saldoCuentaBy[t.id] || 0)
      return { ...t, pendientes, moTotal, comisionTotal, cargos, cargosEf, saldoCuenta, neto: comisionTotal - cargosEf }
      // Muestra técnicos activos, PLUS cualquiera (inactivo o eliminado) que aún
      // tenga trabajos pendientes por liquidar, para no dejar comisiones huérfanas.
    }).filter(t => (t.activo !== false && !t.eliminado) || t.pendientes > 0)
  }, [porTecnico, TECNICOS, movimientos, prestamosHook.movimientos])

  // Total de la nómina (lo que se debe pagar a los técnicos con trabajos pendientes)
  const totalNomina = useMemo(
    () => resumenTecnicos.filter(t => t.pendientes > 0).reduce((s, t) => s + Math.max(0, t.neto), 0),
    [resumenTecnicos])

  // Los que tienen trabajo por pagar van primero y solos: los de 0 OTs pesaban
  // igual en la lista y no se puede hacer nada con ellos aquí.
  const tecnicosConPendientes = useMemo(() => resumenTecnicos.filter(t => t.pendientes > 0), [resumenTecnicos])
  const tecnicosSinPendientes = useMemo(() => resumenTecnicos.filter(t => t.pendientes === 0), [resumenTecnicos])

  // OTs completadas cuyo técnico ya no existe (o nunca se asignó): su comisión
  // suma en los totales pero NO se le puede pagar a nadie. Antes solo se decía
  // "6 sin técnico" en rojo, sin forma de ver cuáles ni de arreglarlo.
  const trabajosSinTecnico = useMemo(
    () => trabajosPendientes.filter(t => !TECNICOS.some(x => x.id === parseInt(t.tecnicoId))),
    [trabajosPendientes, TECNICOS])

  const historialOrdenado = useMemo(() =>
    [...historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [historial])

  // Meses disponibles para el filtro, del propio historial (sin meses vacíos).
  const mesesHistorial = useMemo(() => {
    const set = new Set()
    historial.forEach(h => { const d = new Date(h.fecha); if (!isNaN(d)) set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) })
    return [...set].sort().reverse()
  }, [historial])

  // 48 pagos en una lista plana no se podían recorrer: ni buscar los de un
  // técnico, ni los de un mes, ni los que falta registrar en Cuentti (26 hoy).
  const historialFiltrado = useMemo(() => historialOrdenado.filter(h => {
    if (histTec && String(h.tecnicoId) !== histTec) return false
    if (histSinCuentti && h.cuenttiGasto) return false
    if (histMes) {
      const d = new Date(h.fecha)
      if (isNaN(d) || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` !== histMes) return false
    }
    return true
  }), [historialOrdenado, histTec, histMes, histSinCuentti])

  const hayFiltroHist = !!(histTec || histMes || histSinCuentti)
  const sinCuenttiCount = useMemo(() => historial.filter(h => !h.cuenttiGasto).length, [historial])
  const nombreMes = (ym) => {
    const [y, m] = ym.split('-')
    return `${new Date(+y, +m - 1, 1).toLocaleDateString('es-CO', { month: 'long' })} ${y}`
  }

  // Cuenta por técnico: liquidado (sum netos), pagado (sum pagos reales; los
  // registros viejos sin "pagado" se asumen pagados completos) y el saldo del
  // Estado de cuenta (préstamos − abonos, que ya incluye lo que quedó debiendo).
  const cuentasTecnicos = useMemo(() => {
    const map = {}
    const keyOf = (tid, persona) => tid != null ? `t${tid}` : `p${(persona || '').trim().toLowerCase()}`
    historial.forEach(h => {
      const k = keyOf(h.tecnicoId, h.tecnico)
      if (!map[k]) map[k] = { nombre: h.tecnico, liquidado: 0, pagado: 0, saldo: 0 }
      map[k].liquidado += h.neto || 0
      map[k].pagado += (h.pagado == null ? (h.neto || 0) : h.pagado)
    })
    ;(prestamosHook.movimientos || []).forEach(m => {
      const k = keyOf(m.tecnicoId, m.persona)
      if (!map[k]) map[k] = { nombre: m.persona, liquidado: 0, pagado: 0, saldo: 0 }
      map[k].saldo += (m.tipo === 'abono' ? -m.monto : m.monto)
    })
    return Object.values(map)
      .filter(c => c.liquidado > 0 || c.pagado > 0 || c.saldo !== 0)
      .sort((a, b) => b.liquidado - a.liquidado)
  }, [historial, prestamosHook.movimientos])

  // --- ACCIONES ---
  // Adelantos/préstamos/consumos/descuentos van al ESTADO DE CUENTA (libro
  // único): quedan como deuda del técnico y se descuentan cuando tú lo decidas
  // en una liquidación (o se abonan en efectivo). Ya no hay dos libros.
  const agregarMovimiento = (e) => {
    e?.preventDefault?.()
    const tid = parseInt(tecnicoSel)
    const monto = Math.abs(parseFloat(movForm.monto) || 0)
    if (!tid) { notify('Selecciona un técnico primero', 'error'); return }
    if (!monto) { notify('Ingresa el monto del movimiento', 'error'); return }
    const concepto = tipoLabel(movForm.tipo)
    prestamosHook.agregarMovimiento({
      id: `PR-${uid()}`, persona: tecData?.tecnico?.nombre || '', tecnicoId: tid,
      tipo: 'prestamo', monto,
      nota: movForm.nota ? `${concepto} · ${movForm.nota}` : concepto,
      fecha: movForm.fecha,
    })
    setMovForm(f => ({ ...f, monto: '', nota: '' }))
    notify(`${concepto} de ${fmt(monto)} registrado en su cuenta`, 'success')
  }

  // Marcar/desmarcar una deuda de la cuenta: la suma de las marcadas llena el
  // monto a descontar (y siempre se puede escribir un valor a mano).
  const toggleCuentaSel = (id) => {
    const next = { ...cuentaSelIds, [id]: !cuentaSelIds[id] }
    setCuentaSelIds(next)
    // Se suma lo que QUEDA de cada deuda (restante tras abonos), no su monto original
    const suma = tecCuenta.deudas.filter(m => next[m.id]).reduce((s, m) => s + (parseFloat(m.restante ?? m.monto) || 0), 0)
    setCuentaMonto(suma > 0 ? String(Math.round(suma)) : '')
  }

  // Aviso común: el movimiento se ve en pantalla pero el servidor no lo confirmó.
  // Queda en la cola de reintentos, pero mientras tanto solo existe AQUÍ — si se
  // liquida desde otro equipo, no se descuenta.
  const avisarSiNoGuardo = (res, que) => {
    if (res == null) notify(`⚠ ${que} se ve en pantalla pero NO se guardó en el servidor. Solo existe en este equipo — reintenta o revisa la conexión.`, 'error')
  }

  // Agrega el "diario" como un cargo: monto = valor diario × días (que tú escribes).
  const agregarDiario = async () => {
    const tid = parseInt(tecnicoSel)
    const dias = Math.floor(parseFloat(diarioDias) || 0)
    const monto = Math.round((Number(valorDiario) || 0) * dias)
    if (!tid) { notify('Selecciona un técnico primero', 'error'); return }
    if (dias <= 0) { notify('Escribe cuántos días', 'error'); return }
    if (monto <= 0) { notify('El valor diario debe ser mayor a 0', 'error'); return }
    setDiarioDias('')
    notify(`Diario agregado: ${dias} día(s) = ${fmt(monto)}`, 'success')
    avisarSiNoGuardo(await hookAgregarMov({
      id: `MV-${uid()}`, tecnicoId: tid,
      tipo: 'diario', monto, dias, nota: notaDiario(diarioNota, dias),
      fecha: hoyISO(),
    }), 'El diario')
  }

  // Reparte el diario (valor × días) en partes iguales entre los técnicos marcados.
  const repartirDiario = async () => {
    const dias = Math.floor(parseFloat(diarioDias) || 0)
    const total = Math.round((Number(valorDiario) || 0) * dias)
    const ids = Object.keys(diarioRepTec).filter(id => diarioRepTec[id]).map(Number)
    if (dias <= 0) { notify('Escribe cuántos días', 'error'); return }
    if (total <= 0) { notify('El valor diario debe ser mayor a 0', 'error'); return }
    if (ids.length < 2) { notify('Marca al menos 2 técnicos para repartir', 'error'); return }
    // Reparto EXACTO (allocate): las partes suman el total sin perder pesos por
    // redondeo (antes Math.round(total/n) a todos dejaba 9.999 de 10.000).
    const partes = repartir(total, ids.map(() => 1))
    setDiarioDias(''); setDiarioRepTec({})
    notify(`Diario repartido entre ${ids.length} técnicos (total ${fmt(total)})`, 'success')
    const res = await Promise.all(ids.map((tid, i) => hookAgregarMov({
      id: `MV-${uid()}`, tecnicoId: tid,
      tipo: 'diario', monto: partes[i], dias,
      nota: `${notaDiario(diarioNota, dias)} ÷ ${ids.length}`,
      fecha: hoyISO(),
    })))
    if (res.some(r => r == null)) avisarSiNoGuardo(null, 'Parte del diario repartido')
  }

  // Próxima referencia legible para un técnico HOY (iniciales + MMDD, con sufijo
  // -2/-3 si ya hay una del mismo técnico el mismo día). Se usa al generar el pago
  // y para MOSTRARLA de antemano (para copiar en Cuentti).
  const nextLiqId = (nombre) => {
    const hoy = new Date()
    const yy = String(hoy.getFullYear()).slice(-2)
    const mmdd = String(hoy.getMonth() + 1).padStart(2, '0') + String(hoy.getDate()).padStart(2, '0')
    const base = `LQ-${iniciales(nombre)}${yy}${mmdd}`
    let id = base, n = 2
    while (historial.some(h => h.id === id)) id = `${base}-${n++}`
    return id
  }

  // Versión SEGURA para grabar: además del historial local, consulta el servidor
  // por ids con el mismo prefijo para no chocar con un pago que otro dispositivo
  // creó el mismo día (el upsert por PK lo sobrescribiría y se perdía un registro).
  const nextLiqIdSeguro = async (nombre) => {
    const hoy = new Date()
    const yy = String(hoy.getFullYear()).slice(-2)
    const mmdd = String(hoy.getMonth() + 1).padStart(2, '0') + String(hoy.getDate()).padStart(2, '0')
    const base = `LQ-${iniciales(nombre)}${yy}${mmdd}`
    const usados = new Set(historial.map(h => h.id))
    try { (await fetchLiquidacionIdsPorBase(base)).forEach(id => usados.add(id)) } catch { /* offline: solo local */ }
    let id = base, n = 2
    while (usados.has(id)) id = `${base}-${n++}`
    return id
  }

  const generarPago = async (skipConfirm = false) => {
    const ids = Object.keys(seleccionados).filter(id => seleccionados[id])
    if (ids.length === 0) { notify('Selecciona al menos un trabajo para liquidar', 'error'); return }
    if (!tecData) return
    if (pagandoRef.current) return

    // Compartido SIN compañero: al pagar solo se abonaría la mitad del asignado y
    // la otra mitad (20%) quedaría inobtenible. Bloquear hasta elegir compañero.
    const sinCompanero = ids.filter(id => { const c = compInfo(id); return c.es && !c.partner })
    if (sinCompanero.length > 0) {
      const t0 = trabajos.find(tr => tr.id === sinCompanero[0])
      notify(`El trabajo ${t0?.otCodigo || t0?.placa || sinCompanero[0]} está marcado como Compartido sin compañero. Elige el compañero o desmárcalo antes de pagar.`, 'error')
      return
    }

    // Neto negativo: la deuda no se borra, se arrastra como saldo anterior
    if (totalSeleccion.neto < 0 && !skipConfirm) {
      setDialog({ title: 'Neto negativo', lead: 'Los cargos superan la comisión; la deuda quedará como saldo anterior para la próxima liquidación.', confirmLabel: 'Continuar', tone: 'danger', onConfirm: () => generarPago(true) })
      return
    }

    pagandoRef.current = true
    try {
    // Si se va a tocar la cuenta, revalidar el saldo contra el SERVIDOR antes
    // de comprometer nada: otro dispositivo/pestaña pudo abonarla y este saldo
    // local estar viejo. Nunca aplicar más de lo que realmente debe (o se le debe).
    if (totalSeleccion.descuentoCuenta > 0 || totalSeleccion.sumaCuenta > 0) {
      try {
        const frescos = await fetchPrestamos()
        if (Array.isArray(frescos) && frescos.length > 0) {
          const tid = tecData.tecnico.id
          const nom = (tecData.tecnico.nombre || '').trim().toLowerCase()
          const saldoFresco = Math.round(frescos.reduce((s, r) => {
            const rid = r.tecnico_id ?? null
            const rp = (r.persona || '').trim().toLowerCase()
            if (rid === tid || (rid == null && rp === nom)) s += (r.tipo === 'abono' ? -1 : 1) * (parseFloat(r.monto) || 0)
            return s
          }, 0))
          const cambiado = totalSeleccion.descuentoCuenta > 0
            ? saldoFresco < totalSeleccion.descuentoCuenta
            : (-saldoFresco) < totalSeleccion.sumaCuenta
          if (cambiado) {
            prestamosHook.sync()
            notify('El saldo de su cuenta cambió (otro dispositivo/pestaña). Revisa el panel y vuelve a generar el pago.', 'error')
            return
          }
        }
      } catch {
        // Falla CERRADA: si no se pudo verificar el saldo, no se compromete el
        // pago (una red intermitente podría dejar pasar el historial con un
        // saldo viejo → doble descuento). Reintentar no cuesta nada.
        notify('No se pudo verificar su cuenta con el servidor. Reintenta en un momento.', 'error')
        return
      }
    }
    const nuevoId = await nextLiqIdSeguro(tecData.tecnico.nombre)
    // Pago real: lo que entregas en efectivo (por defecto el neto).
    const netoCalc = totalSeleccion.neto
    const pagado = montoEntregado

    const registro = {
      id: nuevoId,
      fecha: new Date().toISOString(),
      tecnico: tecData.tecnico.nombre,
      tecnicoId: tecData.tecnico.id,
      trabajosIds: ids,
      cantidadTrabajos: ids.length,
      manoObra: totalSeleccion.manoObra,
      comision: totalSeleccion.comision,
      cargos: totalSeleccion.cargos,
      cargosEfectivos: totalSeleccion.cargosEfectivos,
      neto: totalSeleccion.neto,
      pagado,
      metodoPago: metodoPagoLiq,
      movimientos: [
        ...tecMovs.map(m => ({ ...m })),
        // Fila sintética para el PDF/historial: el movimiento de su cuenta.
        // monto con signo: + descuento (debía), − suma (estaba a favor).
        ...((totalSeleccion.descuentoCuenta > 0 || totalSeleccion.sumaCuenta > 0) ? [{
          id: `CTA-${uid()}`, tipo: 'cuenta',
          monto: totalSeleccion.descuentoCuenta - totalSeleccion.sumaCuenta,
          saldoCuenta: tecCuenta.saldo,
          nota: totalSeleccion.descuentoCuenta > 0
            ? `Abono a su cuenta (debía ${fmt(tecCuenta.saldo)})`
            : `Pago de su saldo a favor (${fmt(-tecCuenta.saldo)})`,
          fecha: hoyISO(),
        }] : []),
      ],
      detalleTrabajo: ids.map(id => {
        const t = trabajos.find(tr => tr.id === id)
        if (!t) return null
        const mo = moMap[t.id] ?? getManoObra(t)
        const { es } = compInfo(t.id)
        return { id: t.id, placa: t.placa, cliente: t.cliente, fecha: t.fecha, manoObra: mo, compartido: es }
      }).filter(Boolean),
    }

    // Guardar el pago en el servidor ANTES de descontar nada. Si falla, no se
    // marca ni se consumen adelantos (el pago no queda "fantasma").
    const histRes = await agregarHistorial(registro)
    if (histRes == null) {
      notify('No se pudo guardar el pago en el servidor (sin conexión). No se descontó nada — reintenta.', 'error')
      return
    }

    // Registro en el Estado de cuenta INMEDIATAMENTE después del historial: es
    // la contrapartida contable del neto que se acaba de guardar (debía → abono;
    // estaba a favor → préstamo). Si el upsert falla, queda en la cola de
    // pendientes del hook y se reintenta solo en el próximo sync.
    if (totalSeleccion.descuentoCuenta > 0 || totalSeleccion.sumaCuenta > 0) {
      const esDescuento = totalSeleccion.descuentoCuenta > 0
      const movCuenta = {
        id: `PR-${uid()}`, persona: tecData.tecnico.nombre, tecnicoId: tecData.tecnico.id,
        tipo: esDescuento ? 'abono' : 'prestamo',
        monto: esDescuento ? totalSeleccion.descuentoCuenta : totalSeleccion.sumaCuenta,
        nota: esDescuento
          ? `Descuento en liquidación #${liqRef(nuevoId)}`
          : `Saldo a favor pagado en liquidación #${liqRef(nuevoId)}`,
        fecha: hoyISO(),
      }
      prestamosHook.agregarMovimiento(movCuenta)
      const okCuenta = await upsertPrestamo(movCuenta)
      if (okCuenta == null) notify('⚠ El movimiento de su cuenta no llegó al servidor; quedó en cola y se reintentará solo. Verifícalo en Estado de cuenta.', 'error')
    }

    // Compartido: se marca `${id}#${tecnico}` (solo esta mitad). No compartido: id plano.
    // agregarLiquidados FUSIONA con el estado real (no pisa lo de otro dispositivo).
    // Se ESPERA el resultado: si el servidor no confirmó, estas OTs volverían a
    // salir como pendientes y se podrían pagar dos veces. Queda en cola y se
    // reintenta solo, pero hay que avisar para que nadie las vuelva a liquidar.
    const nuevasLiq = ids.map(id => compInfo(id).es ? `${id}#${tecData.tecnico.id}` : id)
    const liqOk = await agregarLiquidados(nuevasLiq)
    if (!liqOk) {
      notify('⚠ El pago SÍ quedó guardado, pero la marca de "ya liquidado" no llegó al servidor. Está en cola y se reintenta sola — NO vuelvas a liquidar estas OTs hasta que desaparezcan de la lista.', 'error')
    }

    // Consumir movimientos del tecnico esperando cada borrado, para que un fallo
    // no los resucite en el sync y se descuenten DOBLE.
    await Promise.all(tecMovs.map(m => hookEliminarMov(m.id)))

    // Arrastre de deuda si quedo saldo en contra
    if (totalSeleccion.neto < 0) {
      hookAgregarMov({
        id: `MV-${uid()}`,
        tecnicoId: tecData.tecnico.id,
        tipo: 'saldo anterior',
        monto: Math.abs(totalSeleccion.neto),
        nota: `Arrastre de ${registro.id}`,
        fecha: hoyISO(),
      })
    }

    // Pago real vs neto: la diferencia va al Estado de cuenta del técnico.
    if (netoCalc > 0 && pagado !== netoCalc) {
      const diff = netoCalc - pagado
      if (diff > 0) {
        // Pagaste de menos: el taller le queda debiendo (o abona su préstamo).
        const nota = diffDestino === 'prestamo'
          ? `Abono a préstamo con liquidación #${liqRef(nuevoId)}`
          : `Saldo a favor · liquidación #${liqRef(nuevoId)} (pagué ${fmt(pagado)} de ${fmt(netoCalc)})`
        prestamosHook.agregarMovimiento({ id: `PR-${uid()}`, persona: tecData.tecnico.nombre, tecnicoId: tecData.tecnico.id, tipo: 'abono', monto: diff, nota, fecha: hoyISO() })
      } else {
        // Pagaste de más: el excedente queda como adelanto (el técnico lo debe).
        prestamosHook.agregarMovimiento({ id: `PR-${uid()}`, persona: tecData.tecnico.nombre, tecnicoId: tecData.tecnico.id, tipo: 'prestamo', monto: -diff, nota: `Adelanto: pagué de más en liquidación #${liqRef(nuevoId)}`, fecha: hoyISO() })
      }
    }

    // Vuelve al paso 1: el asistente se cierra donde empezó, con la lista ya
    // actualizada. Antes te dejaba en el técnico con el paso 2 vacío ("Sin
    // pendientes"), que parece un error en vez de un pago cumplido.
    setSeleccionados({}); setPagoReal(''); setDiffDestino('debo'); setCuentaMonto(''); setCuentaSelIds({}); setMetodoPagoLiq('efectivo'); setTecnicoSel('')
    const difMsg = pagado !== netoCalc ? ` (pagado ${fmt(pagado)}, diferencia a Estado de cuenta)` : ''
    notify(`Pago #${liqRef(nuevoId)} generado: ${fmt(pagado)} para ${tecData.tecnico.nombre}${difMsg} · copia la ref en Cuentti`, 'success')
    // Descargar automáticamente el comprobante del pago recién generado
    exportPdfHistorial(registro).catch(() => {})
    } finally {
      pagandoRef.current = false
    }
  }

  // Abre el diálogo "revisar antes de pagar" (resumen) antes de comprometer el pago.
  const pedirPago = () => {
    if (cantSeleccionados === 0) { notify('Selecciona al menos un trabajo para liquidar', 'error'); return }
    const t = totalSeleccion
    const negativo = t.neto < 0
    // Lo que de verdad le entregas. Antes el diálogo mostraba SOLO el neto: si
    // ponías que le dabas $30.000 de $56.017, la última pantalla antes de una
    // acción irreversible seguía diciendo $56.017 y no mencionaba la deuda.
    const dif = t.neto - montoEntregado
    setDialog({
      title: 'Revisar antes de pagar',
      body: (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 4 }}>
          <DlgRow label="Técnico" value={tecData?.tecnico?.nombre || '—'} />
          <DlgRow label="Trabajos a liquidar" value={`${cantSeleccionados} ${cantSeleccionados === 1 ? 'OT' : 'OTs'}`} />
          <DlgRow label={`Comisión (${COMISION.TOTAL * 100}%)`} value={fmt(t.comision)} />
          {t.cargosMovsEf !== 0 && <DlgRow label="Aportes / descuentos" value={`− ${fmt(t.cargosMovsEf)}`} />}
          {t.descuentoCuenta > 0 && <DlgRow label={`Cuenta del técnico (debe ${fmt(tecCuenta.saldo)})`} value={`− ${fmt(t.descuentoCuenta)}`} />}
          {t.sumaCuenta > 0 && <DlgRow label={`Cuenta del técnico (a favor ${fmt(-tecCuenta.saldo)})`} value={`+ ${fmt(t.sumaCuenta)}`} />}
          {tecCuenta.saldo > 0 && t.descuentoCuenta === 0 && (
            <div style={{ padding: '9px 14px', borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,.09)', fontSize: 12.5, fontWeight: 600, color: 'var(--amber-600)' }}>
              Debe {fmt(tecCuenta.saldo)} en su cuenta y no estás descontando nada.
            </div>
          )}
          <DlgRow label={negativo ? 'Saldo en contra (se arrastra)' : 'Neto liquidado'} value={fmt(t.neto)} total={dif === 0} />
          {dif !== 0 && !negativo && (
            <>
              <DlgRow
                label={dif > 0 ? (diffDestino === 'prestamo' ? 'Abona a su préstamo' : 'Se lo quedas debiendo') : 'Le adelantas de más'}
                value={`${dif > 0 ? '− ' : '+ '}${fmt(Math.abs(dif))}`}
              />
              <DlgRow label={`Le entregas ${metodoPagoLiq === 'transferencia' ? 'por transferencia' : 'en efectivo'}`} value={fmt(montoEntregado)} total />
            </>
          )}
        </div>
      ),
      confirmLabel: negativo ? 'Registrar saldo' : `Confirmar ${fmt(montoEntregado)}`,
      onConfirm: () => generarPago(true),
    })
  }

  const exportPdfPago = async () => {
    if (cantSeleccionados === 0) { notify('Selecciona trabajos primero', 'error'); return }
    const doc = new jsPDF()
    const { MARGIN } = PDF_LAYOUT
    const logoData = await loadLogo()

    drawHeader(doc, {
      logoData,
      docType: 'LIQUIDACIÓN DE PAGO',
      docNumber: tecData.tecnico.nombre.split(' ').slice(0, 2).join(' '),
      badge: { label: cantSeleccionados === 1 ? '1 trabajo' : `${cantSeleccionados} trabajos`, color: 'neutral' },
      dateRows: [{ lbl: 'Fecha', val: fmtDate(new Date().toISOString()) }],
    })

    let y = 47
    y = drawSectionHeader(doc, 'Técnico', y)
    y = drawDataBlock(doc, [
      { label: 'Nombre completo', value: tecData.tecnico.nombre, bold: true },
      { label: 'Teléfono', value: tecData.tecnico.telefono || '—' },
      { label: 'Trabajos', value: String(cantSeleccionados), bold: true },
    ], y)
    y += 4

    const rows = []
    Object.keys(seleccionados).filter(id => seleccionados[id]).forEach(id => {
      const t = trabajos.find(tr => tr.id === id)
      if (!t) return
      const mo = moMap[t.id] ?? getManoObra(t)
      const { es } = compInfo(t.id)
      const com = es ? (mo * COMISION.TOTAL) / 2 : mo * COMISION.TOTAL
      rows.push([fmtDate(t.fecha), (t.placa || '').toUpperCase(), t.cliente || '—', es ? 'Sí (50%)' : 'No', fmt(mo), fmt(Math.round(com))])
    })

    y = drawSectionHeader(doc, 'Trabajos liquidados', y)
    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'PLACA', 'CLIENTE', 'COMP.', 'MANO DE OBRA', 'COMISIÓN']],
      body: rows,
      ...tableStylesItems,
      theme: 'grid',
      styles: { ...tableStylesItems.styles, lineColor: [200, 206, 217], lineWidth: 0.25 },
      headStyles: { ...tableStylesItems.headStyles, halign: 'center', lineColor: [200, 206, 217], lineWidth: 0.25 },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 'auto', halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 28, halign: 'center' },
        5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 6

    // Filas: movimientos (diario) + el abono a su cuenta si se descuenta algo.
    const movRows = tecMovs.map(m => [fmtDate(m.fecha), tipoLabel(m.tipo), m.nota || '—', fmt(m.monto), '- ' + fmt(cargoEfectivo(m))])
    if (totalSeleccion.descuentoCuenta > 0) {
      movRows.push([fmtDate(hoyISO()), 'Cuenta', `Abono a su cuenta (debía ${fmt(tecCuenta.saldo)})`, fmt(tecCuenta.saldo), '- ' + fmt(totalSeleccion.descuentoCuenta)])
    } else if (totalSeleccion.sumaCuenta > 0) {
      movRows.push([fmtDate(hoyISO()), 'Cuenta', `Pago de su saldo a favor (${fmt(-tecCuenta.saldo)})`, fmt(-tecCuenta.saldo), '+ ' + fmt(totalSeleccion.sumaCuenta)])
    }
    if (movRows.length > 0) {
      y = drawSectionHeader(doc, 'Aportes y descuentos', y)
      autoTable(doc, {
        startY: y,
        head: [['FECHA', 'CONCEPTO', 'DESCRIPCIÓN', 'MONTO', 'DESCUENTO']],
        body: movRows,
        ...tableStylesMuted,
        theme: 'grid',
        styles: { ...tableStylesMuted.styles, lineColor: [200, 206, 217], lineWidth: 0.25 },
        headStyles: { ...tableStylesMuted.headStyles, halign: 'center', lineColor: [200, 206, 217], lineWidth: 0.25 },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 'auto', halign: 'center' },
          3: { cellWidth: 26, halign: 'center' },
          4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          const m = tecMovs[d.row.index]
          if (m?.tipo === 'diario') d.cell.styles.fillColor = [252, 244, 230]
          if (!m) d.cell.styles.fillColor = [234, 242, 253] // fila "Cuenta" (abono al Estado de cuenta)
        },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    // Presentación: comisión de los trabajos menos los cargos efectivos = neto.
    const rowsSel = [
      { lbl: 'Mano de obra (sin IVA)', val: fmt(totalSeleccion.manoObra) },
      { lbl: `Comisión (${COMISION.TOTAL * 100}%)`, val: fmt(totalSeleccion.comision) },
    ]
    if ((totalSeleccion.cargosMovsEf || 0) > 0) {
      rowsSel.push({ lbl: 'Aportes / descuentos', val: `- ${fmt(totalSeleccion.cargosMovsEf)}` })
    }
    if ((totalSeleccion.descuentoCuenta || 0) > 0) {
      rowsSel.push({ lbl: 'Cuenta del técnico', val: `- ${fmt(totalSeleccion.descuentoCuenta)}` })
    }
    if ((totalSeleccion.sumaCuenta || 0) > 0) {
      rowsSel.push({ lbl: 'Cuenta del técnico', val: `+ ${fmt(totalSeleccion.sumaCuenta)}` })
    }
    y = drawTotalsBox(doc, {
      y, x: 122, w: 74,
      rows: rowsSel,
      finalLabel: 'Neto a pagar',
      finalValue: fmt(totalSeleccion.neto),
    })
    y += 18

    drawSignatures(doc, {
      y: Math.min(Math.max(y, 252), PDF_LAYOUT.PAGE_H - 25),
      blocks: [
        { label: 'Firma del técnico', sub: 'Nombre, documento, fecha' },
        { label: 'Autorizado por', sub: 'Nombre, cargo, fecha' },
      ],
    })

    drawFooter(doc, { page: 1, total: 1 })
    doc.save(`liquidacion_${tecData.tecnico.nombre.replace(/\s+/g, '_')}_${hoyISO()}.pdf`)
    notify('PDF de pago exportado', 'success')
  }

  const exportPdfHistorial = async (reg) => {
    const doc = new jsPDF()
    const { MARGIN } = PDF_LAYOUT
    const logoData = await loadLogo()

    drawHeader(doc, {
      logoData,
      docType: 'ESTADO DE CUENTA',
      docNumber: `#${liqRef(reg.id)}`,
      badge: { label: 'HISTÓRICO', color: 'navy' },
      dateRows: [{ lbl: 'Fecha', val: fmtDate(reg.fecha) }],
    })

    let y = 47
    y = drawSectionHeader(doc, 'Técnico', y)
    y = drawDataBlock(doc, [
      { label: 'Nombre completo', value: reg.tecnico, bold: true },
      { label: 'Referencia', value: liqRef(reg.id) },
      { label: 'Trabajos liquidados', value: String((reg.detalleTrabajo || []).length) },
    ], y)
    y += 4

    const detRows = (reg.detalleTrabajo || []).map(d => {
      const com = d.compartido ? (d.manoObra * COMISION.TOTAL) / 2 : d.manoObra * COMISION.TOTAL
      return [fmtDate(d.fecha), (d.placa || '').toUpperCase(), d.cliente || '—', d.compartido ? 'Sí (50%)' : 'No', fmt(d.manoObra), fmt(Math.round(com))]
    })
    y = drawSectionHeader(doc, 'Trabajos liquidados', y)
    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'PLACA', 'CLIENTE', 'COMP.', 'MANO DE OBRA', 'COMISIÓN']],
      body: detRows,
      ...tableStylesItems,
      theme: 'grid',
      styles: { ...tableStylesItems.styles, lineColor: [200, 206, 217], lineWidth: 0.25 },
      headStyles: { ...tableStylesItems.headStyles, halign: 'center', lineColor: [200, 206, 217], lineWidth: 0.25 },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 'auto', halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 28, halign: 'center' },
        5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 6

    if (reg.movimientos && reg.movimientos.length > 0) {
      y = drawSectionHeader(doc, 'Aportes y descuentos', y)
      // Descuento efectivo por movimiento, reconciliado con el total guardado del
      // registro: así un 'diario' viejo (40%) o nuevo (50%) siempre cuadra con el neto.
      const _sumOtros = reg.movimientos.filter(m => m.tipo !== 'diario').reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
      const _nDiarios = reg.movimientos.filter(m => m.tipo === 'diario').length
      // Efectivo real del registro = comisión − neto (exacto: así el diario viejo al
      // 40% o el nuevo al 50% siempre reconstruye lo que de verdad se descontó).
      const _totalEf = reg.cargosEfectivos != null ? reg.cargosEfectivos : Math.max(0, (reg.comision || 0) - (reg.neto || 0))
      const _diarioEf = _nDiarios ? Math.round(Math.max(0, _totalEf - _sumOtros) / _nDiarios) : 0
      const _descEf = (m) => m.tipo === 'diario' ? _diarioEf : (parseFloat(m.monto) || 0)
      autoTable(doc, {
        startY: y,
        head: [['FECHA', 'CONCEPTO', 'DESCRIPCIÓN', 'MONTO', 'DESCUENTO']],
        // La fila 'cuenta' muestra en MONTO lo que debía (o su saldo a favor) y
        // en DESCUENTO lo aplicado: − si se le descontó, + si se le pagó a favor.
        body: reg.movimientos.map(m => [fmtDate(m.fecha), tipoLabel(m.tipo), m.nota || '—',
          fmt(m.tipo === 'cuenta' && m.saldoCuenta ? Math.abs(m.saldoCuenta) : m.monto),
          (m.tipo === 'cuenta' && m.monto < 0) ? '+ ' + fmt(-m.monto) : '- ' + fmt(_descEf(m))]),
        ...tableStylesMuted,
        theme: 'grid',
        styles: { ...tableStylesMuted.styles, lineColor: [200, 206, 217], lineWidth: 0.25 },
        headStyles: { ...tableStylesMuted.headStyles, halign: 'center', lineColor: [200, 206, 217], lineWidth: 0.25 },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 'auto', halign: 'center' },
          3: { cellWidth: 26, halign: 'center' },
          4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          const _m = reg.movimientos[d.row.index]
          if (_m?.tipo === 'diario') d.cell.styles.fillColor = [252, 244, 230]
          if (_m?.tipo === 'cuenta') d.cell.styles.fillColor = [234, 242, 253]
        },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    // Pagos nuevos (con cargosEfectivos): comisión − cargos efectivos = neto.
    // Pagos viejos se dejan en el formato original.
    const esNuevoPago = reg.cargosEfectivos != null
    let rowsReg
    if (esNuevoPago) {
      rowsReg = [
        { lbl: 'Mano de obra (sin IVA)', val: fmt(reg.manoObra || 0) },
        { lbl: `Comisión (${COMISION.TOTAL * 100}%)`, val: fmt(reg.comision || 0) },
      ]
      const _ef = reg.cargosEfectivos || 0
      if (_ef !== 0) {
        rowsReg.push({ lbl: 'Aportes / descuentos', val: _ef > 0 ? `- ${fmt(_ef)}` : `+ ${fmt(-_ef)}` })
      }
    } else {
      rowsReg = [
        { lbl: 'Mano de obra (sin IVA)', val: fmt(reg.manoObra || 0) },
        { lbl: `Comisión (${COMISION.TOTAL * 100}%)`, val: fmt(reg.comision || 0) },
        // Efectivo real = comisión − neto (no el bruto), para que cuadre con el neto.
        { lbl: 'Aportes / descuentos', val: `- ${fmt(Math.max(0, (reg.comision || 0) - (reg.neto || 0)))}` },
      ]
    }
    // Si se registró un pago real distinto al neto, mostrarlo + el saldo.
    const tienePago = reg.pagado != null && reg.pagado !== reg.neto
    if (tienePago) {
      rowsReg.push({ lbl: 'Neto liquidado', val: fmt(reg.neto || 0) })
      const dif = (reg.neto || 0) - reg.pagado
      rowsReg.push({ lbl: dif > 0 ? 'Queda a tu favor' : 'Adelanto (debes)', val: `${dif > 0 ? '' : '- '}${fmt(Math.abs(dif))}` })
    }
    y = drawTotalsBox(doc, {
      y, x: 122, w: 74,
      rows: rowsReg,
      finalLabel: tienePago ? (reg.metodoPago === 'transferencia' ? 'Pagado por transferencia' : 'Pagado en efectivo') : (esNuevoPago ? 'Neto a pagar' : 'NETO PAGADO'),
      finalValue: fmt(tienePago ? reg.pagado : (reg.neto || 0)),
    })
    y += 18

    drawSignatures(doc, {
      y: Math.min(Math.max(y, 252), PDF_LAYOUT.PAGE_H - 25),
      blocks: [
        { label: 'Firma del técnico', sub: 'Nombre, documento, fecha' },
        { label: 'Autorizado por', sub: 'Nombre, cargo, fecha' },
      ],
    })

    drawFooter(doc, { page: 1, total: 1, leftText: 'Comprobante interno de liquidación de mano de obra · MDA' })
    doc.save(`pago_${reg.tecnico}_${reg.id}.pdf`)
    notify('PDF de pago exportado', 'success')
  }

  // Desliquidar UNO solo (reversible: vuelve a aparecer como pendiente). Con
  // confirmación para no marcarlo por error. (Se quitó el "Desliquidar todos".)
  const desliquidarUno = (id, t) => {
    const etiqueta = t ? [t.placa, t.cliente].filter(Boolean).join(' · ') || id : id
    setDialog({
      title: 'Desliquidar trabajo',
      lead: etiqueta,
      confirmLabel: 'Desliquidar',
      onConfirm: () => {
        // Quita el id plano Y las claves por técnico (compartido) de ese trabajo,
        // sin pisar liquidados de otros trabajos/dispositivos (cierra sobre prev).
        desliquidarPorTrabajo(id)
        notify('Trabajo desliquidado', 'info')
      },
    })
  }

  // ===== ANULAR UN PAGO =====
  // Antes no había salida: un pago equivocado se quedaba, o se borraban los 48
  // con "Limpiar historial". Aquí se deshace TODO lo que hizo generarPago:
  //   1. las OTs vuelven a estar pendientes,
  //   2. los aportes/diario consumidos se devuelven,
  //   3. el movimiento del Estado de cuenta se revierte,
  //   4. se borra el registro del historial.
  // El gasto de Cuentti NO se toca: la app no anula contabilidad sola. Se avisa
  // con el número para que se anule allá a mano.
  const anularPago = async (reg) => {
    // El servidor manda: si el borrado falla, no se revierte nada (un pago
    // "anulado" en pantalla pero vivo en la base es exactamente un doble pago).
    const ok = await eliminarHistorial(reg.id)
    if (!ok) { notify('No se pudo anular en el servidor. No se revirtió nada — reintenta.', 'error'); return }

    // 1. Devolver las OTs a pendientes — SOLO la parte de este técnico. En un
    //    compartido, la otra mitad pudo cobrarse en un pago distinto: soltarla
    //    la volvería a dejar pendiente y se pagaría dos veces.
    const claves = []
    for (const id of (reg.trabajosIds || [])) {
      claves.push(`${id}#${reg.tecnicoId}`)
      const t = trabajos.find(x => x.id === id)
      // El id PLANO es del trabajo entero (no compartido) o, por compatibilidad
      // con datos viejos, del técnico ASIGNADO. Solo se quita si este pago era
      // justamente esa parte.
      if (!compInfo(id).es || parseInt(t?.tecnicoId) === reg.tecnicoId) claves.push(id)
    }
    quitarLiquidados(claves)

    // 2. Devolver los aportes que se consumieron. La fila 'cuenta' es sintética
    //    (solo existía para el PDF), no era un movimiento real.
    ;(reg.movimientos || []).filter(m => m.tipo !== 'cuenta').forEach(m => hookAgregarMov({ ...m }))

    // 3. Revertir lo que tocó el Estado de cuenta. Los movimientos se crearon con
    //    un id aleatorio que no se guardó, pero SÍ llevan la referencia del pago
    //    en la nota — por ahí se encuentran.
    const ref = `#${liqRef(reg.id)}`
    const delCuenta = (prestamosHook.movimientos || []).filter(m => (m.nota || '').includes(ref))
    delCuenta.forEach(m => prestamosHook.eliminarMovimiento(m.id))

    // 4. Y el arrastre de saldo negativo, si lo hubo.
    movimientos.filter(m => (m.nota || '').includes(`Arrastre de ${reg.id}`)).forEach(m => hookEliminarMov(m.id))

    const avisoCuentti = reg.cuenttiGasto
      ? ` ⚠️ El gasto ${reg.cuenttiGasto} sigue en Cuentti: anúlalo allá a mano.`
      : ''
    notify(`Pago #${liqRef(reg.id)} anulado: ${reg.cantidadTrabajos} OT(s) vuelven a pendientes${delCuenta.length ? ' y se revirtió su cuenta' : ''}.${avisoCuentti}`, avisoCuentti ? 'error' : 'success')
  }

  const pedirAnular = (reg) => setDialog({
    title: 'Anular este pago',
    lead: `${reg.tecnico} · ${fmt(reg.pagado != null ? reg.pagado : reg.neto)} · ${reg.cantidadTrabajos} OT(s)`,
    body: (
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginTop: 6 }}>
        Se deshace todo: las OTs vuelven a estar pendientes de liquidar, los aportes y descuentos se devuelven, y el movimiento de su Estado de cuenta se revierte.
        {reg.cuenttiGasto && (
          <div style={{ marginTop: 10, padding: '9px 12px', background: 'rgba(245,158,11,.09)', border: '1px solid rgba(245,158,11,.28)', borderRadius: 8, fontWeight: 600, color: 'var(--amber-700)' }}>
            Este pago ya tiene el gasto <strong className="mono">{reg.cuenttiGasto}</strong> registrado en Cuentti. La app no lo toca — anúlalo tú en Cuentti para que la contabilidad cuadre.
          </div>
        )}
      </div>
    ),
    confirmLabel: 'Sí, anular el pago',
    tone: 'danger',
    onConfirm: () => anularPago(reg),
  })

  // Trabajos totalmente liquidados (ocultos) que aún existen en la lista.
  const trabajosLiquidados = useMemo(() => {
    return trabajos.filter(t => totalmenteLiquidado(t))
  }, [trabajos, liquidados, compartidos])

  // ===== Tabs: Comisiones | Estado de cuenta (segmented control unificado) =====
  const tabsLiq = (
    <div className="hd-seg" role="tablist">
      <button type="button" role="tab" className={`hd-seg__i${vistaLiq === 'comisiones' ? ' on' : ''}`} aria-selected={vistaLiq === 'comisiones'} onClick={() => setVistaLiq('comisiones')}>Comisiones</button>
      <button type="button" role="tab" className={`hd-seg__i${vistaLiq === 'cuentas' ? ' on' : ''}`} aria-selected={vistaLiq === 'cuentas'} onClick={() => setVistaLiq('cuentas')}>Estado de cuenta</button>
    </div>
  )

  if (vistaLiq === 'cuentas') {
    // La barra de titulo y las dos columnas las arma EstadoCuenta: es quien
    // tiene el saldo por cobrar y los cortes de las cuentas. Aqui solo se le
    // pasan el conmutador y el resumen por tecnico, que sale de esta pantalla.
    const resumenTecnicos = cuentasTecnicos.length > 0 ? (
      <details className="ec-resumen">
        <summary>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
          <span className="ec-resumen__t">Liquidado y entregado por técnico</span>
          <span className="ec-aside__n">{cuentasTecnicos.length}</span>
        </summary>
        <div className="ec-resumen__b">
          <div className="ec-resumen__cab">
            <span style={{ flex: 1, minWidth: 0 }}>TÉCNICO</span>
            <span style={{ width: 112, textAlign: 'right' }}>LIQUIDADO</span>
            <span style={{ width: 112, textAlign: 'right' }}>ENTREGADO</span>
            <span style={{ width: 118, textAlign: 'right' }}>FALTA ENTREGAR</span>
            <span style={{ width: 124, textAlign: 'right' }}>SU CUENTA</span>
          </div>
          {cuentasTecnicos.map((c, i) => {
            // Antes las tres cifras iban juntas invitando a una resta que NO era
            // valida: liquidado y pagado salen del historial, el saldo del libro
            // de prestamos. La resta ya esta hecha y la cuenta se nombra aparte.
            const falta = Math.round(c.liquidado - c.pagado)
            return (
              <div key={i} className="ec-resumen__row">
                <span className="ec-resumen__n">{c.nombre}</span>
                <span className="ec-resumen__v">{fmt(c.liquidado)}</span>
                <span className="ec-resumen__v">{fmt(c.pagado)}</span>
                <span className={`ec-resumen__v${falta > 0 ? ' warn' : ''}`}>{falta > 0 ? fmt(falta) : <span className="hd-empty">—</span>}</span>
                <span className={`ec-resumen__v${c.saldo > 0 ? ' bad' : c.saldo < 0 ? ' ok' : ''}`}>
                  {c.saldo > 0 ? `Debe ${fmt(c.saldo)}` : c.saldo < 0 ? `A favor ${fmt(-c.saldo)}` : 'Al día'}
                </span>
              </div>
            )
          })}
        </div>
      </details>
    ) : null
    return (
      <EstadoCuenta prestamos={prestamosHook} tecnicos={TECNICOS} notify={notify}
        tabs={tabsLiq} resumen={resumenTecnicos} />
    )
  }

  // ===== RENDER =====
  return (
    <div>
      <ConfirmDialog cfg={dialog} onClose={() => setDialog(null)} />
      <style>{`
        /* ===== Asistente por pasos: 1 técnico → 2 trabajos → 3 pago =====
           Un solo carril. Cada paso cumplido se encoge a una línea con "Cambiar",
           así nunca hay tres sitios distintos donde se descuenta plata. */
        /* Pastillas, no barras: la guía viaja en la MISMA fila del título (como
           el resto de la app pone su segmentado ahí), y cada paso es una cápsula
           con su número — el hecho en verde, el actual en azul. */
        .liq-steps{ display:flex; align-items:center; gap:7px; list-style:none; margin:0; padding:0; flex-wrap:wrap; }
        .liq-step{ display:flex; align-items:center; gap:7px; height:34px; padding:0 13px 0 7px; border-radius:var(--radius-pill); background:var(--chip); font-size:12px; font-weight:400; color:var(--text-3); white-space:nowrap; }
        .liq-step .n{ width:20px; height:20px; border-radius:50%; background:var(--border); color:var(--text-4); display:grid; place-items:center; font-size:11px; font-weight:700; line-height:1; flex-shrink:0; }
        .liq-step.done{ color:var(--text); }
        .liq-step.done .n{ background:var(--ok-bg); color:var(--ok-fg); }
        .liq-step.on{ background:var(--accent-soft); color:var(--text); font-weight:700; }
        .liq-step.on .n{ background:var(--accent); color:#fff; }
        @media (max-width:960px){
          .liq-steps{ width:100%; gap:6px; }
          .liq-step{ flex:1; justify-content:center; height:var(--tap); padding:0 8px; }
        }
        /* Paso 1 ya resuelto: resumen en una línea */
        .liq-done{ display:flex; align-items:center; gap:12px; padding:13px 16px; }
        /* Paso 1: tarjetas de técnico, grandes y tocables */
        .liq-roster-row{ display:flex; align-items:center; gap:12px; width:100%; padding:14px 16px; text-align:left; background:transparent; border:none; border-top:1px solid var(--border); cursor:pointer; transition:background .15s var(--ease-out); }
        .liq-roster-row:first-of-type{ border-top:none; }
        /* El hover se limita a punteros de verdad: en táctil el navegador lo deja
           "pegado" tras el toque y la fila queda resaltada como si siguiera activa. */
        @media (hover:hover){ .liq-roster-row:hover{ background:var(--bg-subtle); } }
        /* En el celular esta fila no respondía: el dedo cae sobre el nombre o el
           monto (texto seleccionable) y el navegador interpreta el toque como
           inicio de selección, no como pulsación, así que el clic nunca llegaba
           al <button>. Se apaga la selección, se declara el gesto como toque
           simple —el .card__b--flush de móvil es un carril con scroll horizontal
           y sin esto el toque compite con el paneo— y los hijos, que son puro
           adorno, dejan de ser blanco: el objetivo del dedo es la fila entera. */
        .liq-roster-row,.liq-roster-mini{ -webkit-user-select:none; user-select:none; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
        .liq-roster-row > *,.liq-roster-mini > *{ pointer-events:none; }
        /* Sin hover en el taller: el único acuse de recibo del toque es este, y
           por eso NO puede heredar la transición de .15s — un toque dura ~100ms y
           el gris apenas empezaba a asomar. Instantáneo al presionar. */
        .liq-roster-row:active,.liq-roster-mini:active{ background:var(--fill); transition-duration:0s; }
        /* Aviso de OTs huérfanas: es un enlace de verdad, con blanco suficiente
           para el dedo (los 44px de alto los da el padding + el interlineado). */
        .liq-aviso{ display:inline-flex; align-items:center; gap:5px; font:inherit; font-weight:600; color:var(--red-700); background:none; border:none; padding:4px 6px; margin:-4px -2px; cursor:pointer; text-decoration:underline; text-underline-offset:3px; -webkit-user-select:none; user-select:none; touch-action:manipulation; }
        .liq-aviso:active{ opacity:.6; }
        /* Trío de cifras del cierre. En pantalla ancha van en columna a la
           derecha del total. En el celular no caben en fila: "Mano de obra
           facturada" se partía en dos renglones y "Utilidad taller" quedaba
           sola y descolgada. Ahí pasan a renglones etiqueta→cifra, que además
           es como se lee un recibo. */
        .liq-cifras{ display:flex; gap:26px; flex-wrap:wrap; }
        /* text-align además de align-items: align-items alinea la CAJA, no el
           texto de adentro. Cuando "Mano de obra facturada" se parte en dos
           renglones, sin esto la segunda línea quedaba pegada a la izquierda. */
        .liq-cifras__i{ display:flex; flex-direction:column; align-items:flex-end; text-align:right; }
        .liq-cifras__v{ font-weight:600; font-size:18px; color:var(--text-2); margin-top:3px; }
        /* Hasta 960px, no 560: el drawer de esta app es móvil hasta 960, así que
           entre 561 y 960 (tablet, celular apaisado) quedaba el layout de
           escritorio — justo el que partía "Mano de obra facturada" en dos. */
        @media (max-width:960px){
          .liq-cifras{ flex-direction:column; gap:0; width:100%; }
          .liq-cifras__i{ flex-direction:row; align-items:baseline; justify-content:space-between; gap:14px; padding:8px 0; border-top:1px solid var(--border); }
          .liq-cifras__i .eyebrow{ white-space:nowrap; }
          .liq-cifras__v{ margin-top:0; font-size:16px; white-space:nowrap; }
        }
        /* ===== Eje único de montos =====
           Renglones de dinero y fichas de ajuste comparten EXACTAMENTE el mismo
           inset (12px) y el mismo ancho de valor + hueco de control (28px), así
           todas las cifras caen en la misma vertical. .mono ya trae tabular-nums,
           de modo que los dígitos no bailan al cambiar de valor. */
        .liq-line{ display:flex; align-items:baseline; gap:12px; padding:6px 12px; font-size:14.5px; color:var(--text-2); }
        .liq-line__v{ margin-left:auto; min-width:112px; text-align:right; white-space:nowrap; }
        .liq-slot{ width:28px; flex-shrink:0; }     /* espejo del control de las fichas */
        .liq-neto__tot{ display:flex; align-items:baseline; gap:12px; padding:12px 12px 0; border-top:2px solid var(--border-strong); margin-top:8px; }
        .liq-neto__tot .l{ font-size:12.5px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:var(--text); }
        .liq-neto__tot .v{ margin-left:auto; min-width:112px; text-align:right; font-size:30px; font-weight:800; letter-spacing:-.02em; }
        /* Ajustes: UNA sola lista (aportes, diario y deudas juntos).
           Estructura común: texto · monto · control, con el control SIEMPRE en el
           mismo hueco derecho (× para quitar un aporte, casilla para descontar
           una deuda) — misma anatomía aunque la acción difiera. */
        .liq-aj{ display:flex; align-items:center; gap:12px; background:var(--bg-subtle); border-radius:var(--r-md); padding:10px 12px; font-size:13.5px; }
        .liq-aj + .liq-aj{ margin-top:6px; }
        .liq-aj.on{ background:color-mix(in srgb, var(--primary) 10%, var(--bg-subtle)); }
        .liq-aj__txt{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .liq-aj__val{ min-width:112px; text-align:right; font-weight:700; white-space:nowrap; }
        .liq-grp{ font-size:11px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:var(--text-4); padding:0 12px; }
        /* Estado vacío del paso 3 (sin trabajos marcados): reemplaza TODO el
           desglose — antes "Mano de obra $0" convivía con ajustes reales
           (ej. "Deuda $100.000") y parecía un error. Apple HIG: nunca mostrar
           un cálculo parcial/en cero como si fuera el resultado final. */
        .liq-empty{ display:flex; flex-direction:column; align-items:center; text-align:center; padding:28px 20px 22px; gap:12px; }
        .liq-empty__icon{ width:44px; height:44px; border-radius:50%; background:var(--soft-amber); display:flex; align-items:center; justify-content:center; color:var(--amber-700); }
        .liq-empty h4{ font-size:15px; font-weight:700; color:var(--text); margin:0; }
        .liq-empty p{ font-size:13.5px; color:var(--text-3); max-width:340px; line-height:1.5; margin:0; }
        .liq-empty__note{ margin-top:14px; padding-top:14px; border-top:1px solid var(--border); width:100%; max-width:420px; font-size:12.5px; color:var(--text-3); display:flex; align-items:center; gap:8px; justify-content:center; }
        /* Quién es el dueño de la OT en un compartido (segunda línea de la celda OT) */
        .c-asignado{ display:block; font-family:var(--font); font-size:10.5px; font-weight:600; color:var(--text-3); margin-top:1px; letter-spacing:0; }
        /* Filtros del historial: una sola fila que envuelve, sin caja propia */
        .liq-filtros{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:0 0 14px; }
        .liq-filtros .input{ width:auto; height:32px; min-height:32px; font-size:12.5px; padding:2px 9px; }

        /* ===== Mesa de trabajo: la lista a la izquierda, el pago a la derecha =====
           Antes eran tres tarjetas apiladas: para saber cuánto ibas a pagarle al
           técnico había que bajar. Ahora el neto y el botón viven en el carril
           derecho, a la vista desde el primer clic. En el celular vuelve a ser
           una sola columna (mismo orden de lectura). */
        .liq-work{ display:flex; align-items:flex-start; gap:10px; }
        .liq-work__main{ flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }
        .liq-work__side{ width:322px; flex:none; display:flex; flex-direction:column; gap:10px; }
        @media (min-width:961px) and (max-width:1199px){ .liq-work__side{ width:290px; } }
        @media (max-width:960px){
          .liq-work{ flex-direction:column; }
          .liq-work__main,.liq-work__side{ width:100%; }
        }
        /* Dentro del carril de 322px los renglones de plata van más apretados:
           con el inset de 12px y un valor de 112px fijos, "Mano de obra (sin
           IVA) · 3 OTs" se partía en tres líneas. */
        .liq-work__side .card__b{ padding:14px 16px; }
        .liq-work__side .liq-line{ padding:5px 0; font-size:12.5px; gap:10px; }
        .liq-work__side .liq-line__v{ min-width:0; }
        .liq-work__side .liq-grp{ padding:0; }
        .liq-work__side .liq-aj{ font-size:12.5px; }
        .liq-work__side .liq-aj__val{ min-width:0; }
        /* El neto NUNCA bajo el pliegue: si el carril crece (muchos ajustes,
           formulario abierto), la tarjeta navy se ancla al borde inferior de la
           ventana y el botón de pagar sigue a la vista. */
        @media (min-width:961px){
          /* SIN position:sticky, a proposito. La tarjeta es el ULTIMO elemento del
             carril y mide 216px; su sitio natural cae 79px por debajo del borde de
             la ventana. Pegada al fondo, flotaba encima de los ultimos campos del
             paso 3 —"Pagado en efectivo" y su linea de ayuda quedaban debajo— y
             como la pagina solo tiene 83px de scroll, eso se veia asi desde el
             primer momento, no al hacer scroll. Medido a 1512x950: 6 elementos
             tapados, hasta 75px. Fijarla ganaba tener el boton siempre a la vista
             a cambio de esconder dos campos que hay que llenar ANTES de pulsarlo.
             La sombra se queda: separa la tarjeta del fondo igual. */
          .liq-work__side .hd-neto{ box-shadow:0 6px 20px rgba(13,27,53,.22); }
        }
        /* Rótulo del carril: en el diseño el título del Paso 3 NO es cabecera de
           tarjeta, encabeza la columna entera. */
        /* Metodo de pago: seccion plana con un filete, no una tarjeta dentro de
           otra tarjeta. Devuelve 28px de ancho util a un carril de 322px. */
        .liq-medio{ margin:18px 0 14px; padding-top:16px; border-top:1px solid var(--border); }
        .liq-medio__head{ display:flex; flex-direction:column; align-items:flex-start; gap:8px; margin-bottom:14px; }
        .liq-medio__head .segctl{ margin:0; width:100%; }
        .liq-medio__campo{ display:flex; flex-direction:column; gap:8px; }
        .liq-medio__campo .field{ max-width:200px; margin:0; }
        .liq-medio__ayuda{ font-size:12.5px; color:var(--text-3); line-height:1.45; }
        /* A 1500px sobra sitio de sobra a la derecha: el carril donde se decide
           un pago no tiene por que seguir en 322px. */
        @media (min-width:1500px){ .liq-work__side{ width:376px; } }
        .liq-side__head{ display:flex; align-items:center; gap:10px; padding:0 4px; min-height:26px; }
        .liq-side__head .t{ font-size:14px; font-weight:700; color:var(--text); }
        .liq-ref{ font-size:11px; font-weight:600; letter-spacing:.3px; color:var(--accent); background:var(--accent-soft); padding:6px 10px; border-radius:var(--radius-pill); white-space:nowrap; }

        /* Ficha del técnico elegido (Paso 1 hecho) */
        .liq-done{ gap:13px; }
        .liq-done__n{ font-size:16px; line-height:1.15; font-weight:700; color:var(--text); }
        .liq-done__m{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:5px; font-size:12.5px; line-height:1; color:var(--text-3); }
        .liq-debe{ font-size:11.5px; line-height:1; font-weight:700; color:var(--bad-fg); background:var(--bad-bg); padding:6px 9px; border-radius:var(--radius-pill); white-space:nowrap; }
        .liq-afavor{ font-size:11.5px; line-height:1; font-weight:700; color:var(--ok-fg); background:var(--ok-bg); padding:6px 9px; border-radius:var(--radius-pill); white-space:nowrap; }
        /* "Cambiar": cápsula de 40px con borde de 1.5, no un botón fantasma */
        .liq-cambiar{ height:40px; padding:0 18px; font-size:13px; font-weight:600; color:var(--text-2); background:var(--bg-raised); border:1.5px solid var(--border-strong); border-radius:var(--radius-pill); }

        /* Cabecera del Paso 2 (mockup: 13/16/11, sin filete inferior — el filete
           lo pone la banda de rótulos de la tabla) */
        #liq-paso2 > .card__h{ padding:13px 16px 11px; border-bottom:none; gap:11px; }
        #liq-paso2 > .card__h h3{ font-size:14px; font-weight:700; letter-spacing:0; gap:11px; }
        .liq-chev{ width:26px; height:26px; flex-shrink:0; display:grid; place-items:center; border-radius:var(--radius-pill); background:var(--chip); color:var(--text-3); }
        /* Lo marcado, en plata: el jefe mira este número mientras marca. */
        .liq-marcado{ font-size:11.5px; line-height:1; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:8px 13px; border-radius:var(--radius-pill); white-space:nowrap; font-variant-numeric:tabular-nums; }
        /* "Todos": chip plano del diseño; en táctil recupera los 44px de alto. */
        .liq-chipbtn{ height:30px; display:inline-flex; align-items:center; padding:0 14px; border:none; border-radius:var(--radius-pill); background:var(--chip); color:var(--text-2); font-family:inherit; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; transition:background .12s; }
        .liq-chipbtn:hover{ background:var(--border); }
        .liq-chipbtn:active{ transform:scale(.97); }
        @media (max-width:960px){ .liq-chipbtn{ height:var(--tap); padding:0 16px; font-size:12.5px; } }

        /* Tabla del Paso 2 con la banda de rótulos y las líneas finas del diseño */
        @media (min-width:961px){
          /* Sin min-height: con 1-2 trabajos la tarjeta abrazaba 220px de nada.
             El tope sigue para que con muchos aparezca el scroll. */
          #liq-paso2 > .card__b--flush{ max-height:calc(100vh - 342px); overflow-y:auto; }
          /* La lista ya no ocupa el ancho entero de la ventana: comparte con el
             carril de pago. Los 16px de aire a cada lado de CADA celda (32 por
             columna) partían los montos en dos renglones — el aire pasa a los
             bordes de la fila, como en el diseño, y los anchos se reparten para
             que Mano de obra y Comisión quepan siempre en una línea. */
          #liq-paso2 .tbl-liq{ min-width:0; }
          #liq-paso2 .tbl-liq thead th,#liq-paso2 .tbl-liq tbody td{ padding-left:8px; padding-right:8px; }
          #liq-paso2 .tbl-liq th:first-child,#liq-paso2 .tbl-liq td:first-child{ padding-left:16px; }
          #liq-paso2 .tbl-liq th:last-child,#liq-paso2 .tbl-liq td:last-child{ padding-right:16px; }
          #liq-paso2 .tbl-liq th:nth-child(2),#liq-paso2 .tbl-liq td:nth-child(2){ width:11%; }
          #liq-paso2 .tbl-liq th:nth-child(3),#liq-paso2 .tbl-liq td:nth-child(3){ width:11%; }
          #liq-paso2 .tbl-liq th:nth-child(4),#liq-paso2 .tbl-liq td:nth-child(4){ width:9%; }
          #liq-paso2 .tbl-liq th:nth-child(5),#liq-paso2 .tbl-liq td:nth-child(5){ width:22%; }
          #liq-paso2 .tbl-liq th:nth-child(6),#liq-paso2 .tbl-liq td:nth-child(6){ width:14%; }
          #liq-paso2 .tbl-liq th:nth-child(7),#liq-paso2 .tbl-liq td:nth-child(7){ width:16%; }
          #liq-paso2 .tbl-liq th:nth-child(8),#liq-paso2 .tbl-liq td:nth-child(8){ width:17%; }
          /* La ficha del compartido recorta dentro de su columna en vez de
             montarse sobre los montos. */
          #liq-paso2 .tbl-liq td.td-comp{ overflow:hidden; }
          #liq-paso2 .tbl-liq td.td-comp .hd-chip{ font-size:11px; padding:5px 8px; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
          /* Los filetes van en box-shadow y no en border: la cabecera es sticky
             y en una tabla con border-collapse los bordes se pierden al rodar. */
          #liq-paso2 .tbl-liq thead th{ height:28px; padding:0 16px; background:var(--bg-subtle);
            font-size:9.5px; font-weight:700; line-height:1; letter-spacing:.6px; text-transform:uppercase;
            color:var(--text-4); border-bottom:none;
            box-shadow:inset 0 1px 0 var(--row-line), inset 0 -1.5px 0 var(--head-line); }
          #liq-paso2 .tbl-liq tbody td{ height:46px; padding:6px 16px; border-bottom:1px solid var(--row-line); color:var(--text); }
          #liq-paso2 .tbl-liq tbody tr:last-child td{ border-bottom:1px solid var(--row-line); }
          #liq-paso2 .tbl-liq tbody tr:hover{ background:var(--bg-subtle); }
          #liq-paso2 .tbl-liq tbody tr.on,#liq-paso2 .tbl-liq tbody tr.on:hover{ background:color-mix(in srgb, var(--accent-soft) 55%, var(--bg-raised)); }
          /* Datos de la fila: cada cifra con su peso, no todas en 14px seminegrita.
             Solo escritorio: en el celular la tabla son tarjetas y los tamaños
             los fija el modo táctil. */
          #liq-paso2 .tbl td.liq-td-ot{ font-size:13px; font-weight:700; }
          #liq-paso2 .tbl td.liq-td-mo{ font-size:13px; font-weight:400; color:var(--text); }
          #liq-paso2 .tbl td.liq-td-com{ font-size:13.5px; line-height:1.15; }
          #liq-paso2 .tbl td[data-label="Cliente"],#liq-paso2 .tbl td[data-label="Vehículo"]{ font-size:12.5px; }
        }
        /* El azul de la OT es el ÚNICO acento de la app (antes era el navy
           --blue-600, que en una tabla se lee como texto oscuro cualquiera). */
        #liq-paso2 .tbl td.liq-td-ot{ color:var(--accent); }
        #liq-paso2 .tbl td.liq-td-com{ color:var(--ok-fg); font-weight:700; }
        /* Marcar un trabajo como compartido: sigue siendo el único punto de
           entrada, pero deja de gritar en las 10 filas que NO lo son. */
        /* --text-5 (2,56:1) es el tono de los chevrones inertes, y esto es el
           UNICO sitio desde donde se marca un trabajo como compartido. Baja de
           jerarquia por tamano y peso, no por lavarse hasta no leerse. */
        .liq-share{ font:inherit; font-size:11.5px; color:var(--text-3); background:none; border:none; padding:4px 6px; cursor:pointer; border-radius:var(--radius-pill); }
        .liq-share:hover{ color:var(--accent); background:var(--accent-soft); }

        /* Botonera dentro del navy (el diseño la pone ahí, no suelta abajo) */
        .liq-pay{ display:flex; align-items:center; gap:8px; margin-top:14px; }
        .liq-pay__go{ flex:1; min-width:0; height:48px; display:inline-flex; align-items:center; justify-content:center; gap:8px;
          background:#fff; color:var(--navy); border:none; border-radius:var(--radius-pill);
          font-family:inherit; font-size:14.5px; font-weight:700; cursor:pointer; transition:filter .14s,transform .14s; }
        .liq-pay__go:hover:not(:disabled){ filter:brightness(.94); }
        .liq-pay__go:active:not(:disabled){ transform:scale(.97); }
        .liq-pay__go:disabled{ opacity:.55; cursor:not-allowed; }
        .liq-pay__go svg{ width:17px; height:17px; stroke:currentColor; fill:none; stroke-width:2.3; flex-shrink:0; }
        .liq-pay__ico{ width:48px; height:48px; flex:none; display:grid; place-items:center; border-radius:var(--radius-pill);
          background:transparent; border:1.5px solid rgba(255,255,255,.25); color:#fff; cursor:pointer; transition:background .14s; }
        .liq-pay__ico:hover{ background:rgba(255,255,255,.12); }
        .liq-pay__ico svg{ width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:2; }
        .liq-pay__go:focus-visible,.liq-pay__ico:focus-visible{ outline:2px solid #fff; outline-offset:2px; }

        /* Últimos pagos del técnico: el carril del diseño cierra con ellos */
        .liq-pago{ display:flex; align-items:baseline; gap:9px; }
        .liq-pago .f{ flex:none; font-size:12px; line-height:1.3; color:var(--text-3); }
        .liq-pago .r{ flex:1; min-width:0; font-size:11px; line-height:1.3; color:var(--text-4); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .liq-pago .v{ flex:none; font-size:13px; line-height:1.2; font-weight:600; color:var(--text); font-variant-numeric:tabular-nums; }
      `}</style>
      {/* Solo titulo, pestañas y accion: la cifra de cierre ya la encabeza el
          bloque de abajo, con su desglose. Duplicarla aqui la ponia dos veces en
          la misma pantalla — y con distinto conteo de OT, que es peor que no
          ponerla. */}
      <div className="hd-head" style={{ gap: 14, alignItems: 'center', marginBottom: 12 }}>
        <div className="hd-head__t"><h1>Liquidación de comisiones</h1></div>
        {tabsLiq}
        <div className="hd-head__sp" />
        <div className="hd-head__right" style={{ alignItems: 'center', gap: 12 }}>
          {/* Guía de pasos: dónde estoy y qué falta. Va en la MISMA fila del
             título (antes se comía un renglón entero para tres palabras). */}
          <ol className="liq-steps">
            <li className={`liq-step${tecData ? ' done' : ' on'}`}><span className="n">{tecData ? '✓' : '1'}</span> Técnico</li>
            <li className={`liq-step${!tecData ? '' : cantSeleccionados > 0 ? ' done' : ' on'}`}><span className="n">{tecData && cantSeleccionados > 0 ? '✓' : '2'}</span> Trabajos</li>
            <li className={`liq-step${tecData && cantSeleccionados > 0 ? ' on' : ''}`}><span className="n">3</span> Pago</li>
          </ol>
          {!tecData && <Button variant="outline" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar historial' : 'Ver historial'}</Button>}
        </div>
      </div>

      {/* El aviso de "sin conexión" ya lo pone App.jsx para toda la app; repetirlo
         aquí sería ruido. Lo que faltaba de verdad es que el BOTÓN de pagar se
         bloquee (ver Paso 3): un pago generado sobre datos viejos del caché es
         justo como se paga dos veces. El "cargando" sí es propio: sin él la
         pantalla se veía completa con datos que aún no eran los del servidor. */}
      {loading && !connectionError && (
        <div style={{ padding: '10px 15px', marginBottom: 16, borderRadius: 'var(--radius)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-3)' }}>
          Cargando liquidaciones…
        </div>
      )}

      {!tecData ? (
      <>
      {/* Cierre — cifra editorial dominante + stats secundarias (no tarjeta-espejo) */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', padding: '4px 2px 20px', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Total a pagar · cierre actual</div>
          <div className="mono" style={{ fontWeight: 800, fontSize: 27, letterSpacing: '-.01em', lineHeight: 1.05, color: 'var(--text)', margin: '6px 0 8px' }}>
            {fmt(totalNomina)}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
            {tecnicosConPendientes.length} técnico{tecnicosConPendientes.length !== 1 ? 's' : ''} · {trabajosPendientes.length} OT{trabajosPendientes.length !== 1 ? 's' : ''} pendiente{trabajosPendientes.length !== 1 ? 's' : ''}
            {/* Avisos que se pueden ABRIR: antes eran un número en rojo sin salida. */}
            {kpis.sinTecnico > 0 && (
              <> · <button type="button" className="liq-aviso" onClick={() => setVerSinTecnico(v => !v)} aria-expanded={verSinTecnico}>
                <span aria-hidden="true">{verSinTecnico ? '▾' : '▸'}</span>
                {/* "6 sin técnico" a secas no decía que se pudiera abrir ni qué
                   hacer con ellas; el jefe lo leía como un dato muerto. */}
                {kpis.sinTecnico} sin técnico · {verSinTecnico ? 'ocultar' : 'ver cuáles'}
              </button></>
            )}
            {kpis.sinPartner > 0 && <span style={{ color: 'var(--amber-700)', fontWeight: 600 }}> · {kpis.sinPartner} compartido{kpis.sinPartner !== 1 ? 's' : ''} sin compañero</span>}
          </div>
        </div>
        <div className="liq-cifras">
          {[['Comisiones', fmt(kpis.comisiones)], ['Mano de obra facturada', fmt(kpis.facturado)], ['Utilidad taller', fmt(kpis.utilidad)]].map(([l, v]) => (
            <div className="liq-cifras__i" key={l}>
              <span className="eyebrow">{l}</span>
              <span className="mono liq-cifras__v">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle de las OTs huérfanas: qué son y a qué OT ir a arreglarlas */}
      {verSinTecnico && trabajosSinTecnico.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(220,38,38,.3)' }}>
          <div className="card__h">
            <h3 style={{ color: 'var(--red-700)' }}>OTs sin técnico asignado</h3>
            <Button variant="ghost" size="sm" onClick={() => setVerSinTecnico(false)}>Cerrar</Button>
          </div>
          <div className="card__b">
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Su comisión suma en los totales de arriba pero <strong>no se le puede pagar a nadie</strong>. Ábrelas en Trabajos y asígnales el técnico para que aparezcan en su liquidación.
            </p>
            {trabajosSinTecnico.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong className="mono" style={{ color: 'var(--blue-600)' }}>{t.otCodigo || t.id}</strong>
                  <span style={{ color: 'var(--text-3)' }}> · {fechaCorta(t.fecha)} · {t.placa || 'Sin vehículo'} · {tituloCliente(t.cliente) || '—'}</span>
                </span>
                <span className="mono" style={{ fontWeight: 700, flexShrink: 0 }}>{fmt(moMap[t.id] || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PASO 1 — a quién se le liquida */}
      <div className="card">
        <div className="card__h">
          <h3>Paso 1 · ¿A quién le liquidas?</h3>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{tecnicosConPendientes.length} por liquidar</span>
        </div>
        <div className="card__b card__b--flush">
        {resumenTecnicos.length === 0 ? (
          <div style={{ padding: '22px', fontSize: 13.5, color: 'var(--text-3)' }}>No hay técnicos con trabajos pendientes de liquidar.</div>
        ) : tecnicosConPendientes.map((t, i) => {
          const activo = tecnicoSel === String(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTecnicoSel(activo ? '' : String(t.id)); setSeleccionados({}); setColapso({ trabajos: false, movs: false }) }}
              className={`liq-roster-row${activo ? ' on' : ''}`}
            >
              <span className={`av av-${(i % 5) + 1}`} style={{ width: 36, height: 36, fontSize: 12.5, flexShrink: 0 }}>
                {t.nombre.split(' ').map(x => x[0]).slice(0, 2).join('')}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: activo ? '#fff' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  {t.nombre.split(' ').slice(0, 2).join(' ')}
                  {t.activo === false && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: activo ? '#c6d2ea' : 'var(--text-3)', border: `1px solid ${activo ? 'rgba(255,255,255,.3)' : 'var(--border-strong)'}`, borderRadius: 999, padding: '1px 7px' }}>Inactivo</span>}
                </div>
                <div style={{ fontSize: 12, color: activo ? '#9fb0d0' : 'var(--text-3)', marginTop: 1 }}>
                  {t.pendientes} OT{t.pendientes !== 1 ? 's' : ''}{t.especialidad ? ` · ${t.especialidad}` : ''}
                  {t.saldoCuenta > 0 && <> · <span style={{ fontWeight: 700, color: activo ? '#f4a9a9' : 'var(--red-600)' }}>debe {fmt(t.saldoCuenta)}</span></>}
                  {t.saldoCuenta < 0 && <> · <span style={{ fontWeight: 700, color: activo ? '#86efac' : 'var(--green-700)' }}>a favor {fmt(-t.saldoCuenta)}</span></>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="mono" style={{ fontSize: 16.5, fontWeight: 700, color: activo ? '#fff' : (t.neto > 0 ? 'var(--green-700)' : 'var(--text-3)'), lineHeight: 1.1 }}>{t.pendientes > 0 ? fmt(t.neto) : '—'}</div>
                <div style={{ fontSize: 10.5, color: activo ? '#9fb0d0' : 'var(--text-3)', marginTop: 1 }}>{t.pendientes > 0 ? 'neto' : 'sin pendientes'}</div>
              </div>
            </button>
          )
        })}
        {/* Los que no tienen nada por pagar: plegados. Ocupaban una fila entera
           cada uno para decir "—", compitiendo con quien sí hay que pagar. */}
        {tecnicosSinPendientes.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="ghost" size="sm" onClick={() => setVerInactivos(v => !v)}
              style={{ fontSize: 12, padding: '9px 16px', color: 'var(--text-3)', width: '100%', justifyContent: 'flex-start' }}>
              {verInactivos ? '▾' : '▸'} {tecnicosSinPendientes.length} técnico{tecnicosSinPendientes.length !== 1 ? 's' : ''} sin nada por liquidar
            </Button>
            {/* Clicables aunque no tengan OTs: si les quedó un aporte o un diario
               sin consumir, este es el único sitio para llegar a verlo o quitarlo. */}
            {/* .liq-roster-mini hace exactamente lo mismo que la fila de arriba, así
               que necesita el MISMO tratamiento táctil: sin él, en el celular la
               lista de arriba respondía y esta no, y "a veces funciona" es más
               difícil de reportar que "nunca funciona". */}
            {verInactivos && tecnicosSinPendientes.map(t => (
              <button key={t.id} type="button" className="liq-roster-mini"
                onClick={() => { setTecnicoSel(String(t.id)); setSeleccionados({}); setColapso({ trabajos: false, movs: false }) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px', borderTop: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', background: 'transparent', font: 'inherit', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--text-2)' }}>{t.nombre}</span>
                {t.cargos > 0 && <span style={{ fontWeight: 700, color: 'var(--amber-700)', fontSize: 12.5 }}>{fmt(t.cargos)} en aportes</span>}
                {t.saldoCuenta > 0 && <span style={{ fontWeight: 700, color: 'var(--red-600)', fontSize: 12.5 }}>debe {fmt(t.saldoCuenta)}</span>}
                {t.saldoCuenta < 0 && <span style={{ fontWeight: 700, color: 'var(--green-700)', fontSize: 12.5 }}>a favor {fmt(-t.saldoCuenta)}</span>}
              </button>
            ))}
          </div>
        )}
        </div>
      </div>

      {trabajosLiquidados.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVerLiquidados(v => !v)}
            style={{ fontSize: 12, padding: '4px 10px', color: 'var(--text-3)' }}
          >
            {verLiquidados ? '▾' : '▸'} {trabajosLiquidados.length} trabajos ya liquidados (ocultos)
          </Button>
          {verLiquidados && (
            <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxWidth: 560 }}>
              {trabajosLiquidados.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-3)' }}>
                  Los {liquidados.length} trabajos liquidados no están en la lista actual.
                </div>
              ) : trabajosLiquidados.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fechaCorta(t.fecha)} · <strong>{t.placa || '—'}</strong> · {t.cliente || '—'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => desliquidarUno(t.id, t)}
                    style={{ color: 'var(--amber-600)', fontSize: 11.5, padding: '2px 8px', flexShrink: 0 }}
                  >
                    Desliquidar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      </>
      ) : (
      <>
        {/* Mesa de trabajo: a la izquierda a quién y qué se le paga; a la
           derecha, sin bajar la pantalla, cuánto y el botón de pagar. */}
        <div className="liq-work">
          <div className="liq-work__main">
          {/* PASO 1 HECHO — se encoge a una línea, con "Cambiar" para volver */}
          <div className="card">
            <div className="liq-done">
              {/* El color del avatar es el MISMO que trae en la lista del Paso 1
                 (antes quedaba fijo en av-1 y al elegir a cualquiera que no fuera
                 el primero le cambiaba de color al pasar de paso). */}
              <span className={`av av-${(Math.max(0, tecnicosConPendientes.findIndex(x => String(x.id) === String(tecData.tecnico.id))) % 5) + 1}`}
                style={{ width: 44, height: 44, fontSize: 15, flexShrink: 0 }}>{iniciales(tecData.tecnico.nombre)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="liq-done__n">{tecData.tecnico.nombre}</div>
                <div className="liq-done__m">
                  <span>{tecData.tecnico.especialidad || 'Técnico'} · comisión {COMISION.TOTAL * 100}% de la mano de obra</span>
                  {/* La deuda deja de ser una palabra más del subtítulo: es una
                     pastilla roja, que es lo primero que hay que ver al pagarle. */}
                  {tecCuenta.saldo > 0 && <span className="liq-debe">Debe {fmt(tecCuenta.saldo)}</span>}
                  {tecCuenta.saldo < 0 && <span className="liq-afavor">A favor {fmt(-tecCuenta.saldo)}</span>}
                </div>
              </div>
              {/* La referencia sale una sola vez, en el Paso 3 (donde se usa al
                 registrar en Cuentti). Antes aparecía dos veces en la pantalla. */}
              <button type="button" className="liq-cambiar" onClick={() => { setTecnicoSel(''); setSeleccionados({}) }}>Cambiar</button>
            </div>
          </div>

          <div className="card" id="liq-paso2">
            <div className="card__h" style={{ cursor: 'pointer' }} onClick={() => toggleColapso('trabajos')}>
              <h3>
                <span className="liq-chev">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: colapso.trabajos ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 200ms var(--ease-out)' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </span>
                Paso 2 · ¿Qué trabajos le pagas?
              </h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                {/* Lo marcado en PLATA, no solo un conteo: es la cifra que el
                   jefe vigila mientras marca (el conteo sigue delante). */}
                {cantSeleccionados > 0 && (
                  <span className="liq-marcado">{cantSeleccionados} de {tecTrabajos.length} · {fmt(totalSeleccion.comision)}</span>
                )}
                {!colapso.trabajos && (
                  <button type="button" className="liq-chipbtn" onClick={() => seleccionarTodos(tecTrabajos.map(t => t.id))}>
                    {tecTrabajos.length > 0 && tecTrabajos.every(t => seleccionados[t.id]) ? 'Deseleccionar' : 'Todos'}
                  </button>
                )}
              </div>
            </div>
            {!colapso.trabajos && (
            <div className="card__b card__b--flush">
              {/* Los anchos de columna de la tabla viven en .tbl-liq (index.css):
                 es table-layout:fixed, así que ahí manda `width` (no `min-width`). */}
              {tecTrabajos.length === 0 ? (
                <div className="empty"><h4>Sin pendientes</h4><p>No hay trabajos pendientes de liquidar.</p></div>
              ) : (
                <table className="tbl tbl-cards tbl-liq tbl-cards--liq tbl--sticky">
                  <thead><tr>
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={tecTrabajos.length > 0 && tecTrabajos.every(t => seleccionados[t.id])}
                        ref={el => { if (el) el.indeterminate = tecTrabajos.some(t => seleccionados[t.id]) && !tecTrabajos.every(t => seleccionados[t.id]) }}
                        onChange={() => seleccionarTodos(tecTrabajos.map(t => t.id))}
                        aria-label="Seleccionar todos" style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                    </th>
                    <th>OT</th>
                    <th>Vehículo</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'center' }}>Compartido</th>
                    <th className="c-right">Mano de obra</th>
                    <th className="c-right">Comisión</th>
                  </tr></thead>
                  <tbody>
                    {tecTrabajos.map(t => {
                      const mano = moMap[t.id] || 0
                      const { es: esComp, partner } = compInfo(t.id)
                      const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
                      const selected = !!seleccionados[t.id]
                      const tidAsignado = parseInt(t.tecnicoId)
                      // "SERVICIO" no es una placa: es el marcador de trabajo sin carro.
                      // Se muestra como texto, no en mono, para no confundirlo con una real.
                      const sinVeh = !!t.sinVehiculo || (t.placa || '').trim().toUpperCase() === 'SERVICIO'
                      return (
                        <tr key={t.id} className={selected ? 'on' : undefined} style={{ background: selected ? 'color-mix(in srgb, var(--accent-soft) 55%, var(--bg-raised))' : undefined, cursor: 'pointer' }} onClick={() => toggleSeleccion(t.id)}>
                          <td className="td-check" data-label="Liquidar" style={{ textAlign: 'center' }}><input type="checkbox" checked={selected} onChange={() => {}} aria-label="Seleccionar trabajo" style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}/></td>
                          {/* .c-name aquí (no en Cliente): en celular la tarjeta se
                             encabeza con la OT, que es lo que identifica el trabajo
                             cuando le pagas a un técnico. */}
                          <td className="c-mono c-name td-ot liq-td-ot" data-label="OT">
                            {t.otCodigo || t.id}
                          </td>
                          <td data-label="Vehículo">
                            {sinVeh
                              ? <span style={{ color: 'var(--text-3)' }}>Sin vehículo</span>
                              : <span className="mono" style={{ fontWeight: 700 }}>{t.placa || '—'}</span>}
                          </td>
                          <td className="c-muted" data-label="Fecha">{fechaCorta(t.fecha)}</td>
                          <td data-label="Cliente">{tituloCliente(t.cliente) || '—'}</td>
                          {/* Compartido: antes era un checkbox + un selector SIEMPRE desplegado
                             (el control más ancho de la tabla, en el medio, partiendo el eje
                             de los montos). Ahora es una ficha que dice con quién, y el
                             selector solo sale si hace falta elegir o cambiar. */}
                          <td className="td-comp" data-label="Compartido" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            {!esComp ? (
                              /* En el diseño esta casilla dice "—" cuando el trabajo
                                 es de uno solo. Aquí sigue diciendo "Compartir"
                                 porque es el ÚNICO sitio desde donde se marca —
                                 pero en gris de dato ausente, sin la pastilla
                                 punteada que antes gritaba en las diez filas. */
                              <button type="button" title="Este trabajo lo hicieron dos técnicos: el 40% se parte 20/20"
                                className="liq-share"
                                onClick={() => toggleCompartidoSeguro(t.id)}>
                                Compartir
                              </button>
                            ) : (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 5, alignItems: 'center', maxWidth: '100%' }}>
                                <button type="button" className={`hd-chip ${partner ? 'hd-chip--purple' : 'hd-chip--warn'}`}
                                  onClick={() => setCompAbierto(c => ({ ...c, [t.id]: !c[t.id] }))}
                                  title={partner ? 'Cambiar compañero o quitar' : 'Falta elegir el compañero'}
                                  style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 11.5, padding: '6px 9px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {/* El OTRO, visto desde el técnico al que le estás
                                     pagando. Mostrar siempre al "compañero" hacía que
                                     en la liquidación de Pedro dijera "½ con Pedro". */}
                                  {partner ? `½ con ${primerNombre(otroTecnico(t))}` : '½ ¿con quién?'}
                                </button>
                                {(compAbierto[t.id] || !partner) && (
                                  <>
                                    <select
                                      className="input"
                                      value={partner || ''}
                                      onChange={e => {
                                        const yaLiq = liquidados.some(x => x.startsWith(`${t.id}#`))
                                        const nuevoPartner = e.target.value
                                        if (yaLiq) { setDialog({ title: 'Cambiar compañero', lead: 'Ya hay una mitad liquidada; cambiar el compañero puede descuadrar lo pagado.', confirmLabel: 'Cambiar igual', tone: 'danger', onConfirm: () => setCompartidoPartner(t.id, nuevoPartner) }); return }
                                        setCompartidoPartner(t.id, nuevoPartner)
                                      }}
                                      style={{ width: '100%', maxWidth: 118, minHeight: 28, height: 28, fontSize: 12, padding: '2px 8px' }}
                                      aria-label="Compañero del trabajo compartido"
                                    >
                                      <option value="">¿Con quién?</option>
                                      {TECNICOS.filter(x => x.id !== tidAsignado && (x.activo !== false || x.id === partner)).map(x => (
                                        <option key={x.id} value={x.id}>{x.nombre.split(' ')[0]}</option>
                                      ))}
                                    </select>
                                    <button type="button" onClick={() => toggleCompartidoSeguro(t.id)}
                                      style={{ font: 'inherit', fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                                      Ya no es compartido
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="c-mono c-right liq-td-mo" data-label="Mano de obra" style={mano === 0 ? { color: 'var(--bad-fg)', fontWeight: 700 } : undefined}>
                            {fmt(mano)}
                            {mano === 0 && <span style={{ display: 'block', fontSize: 10, color: 'var(--bad-fg)', fontWeight: 600 }}>sin servicios</span>}
                          </td>
                          {/* La comisión es la cifra por la que se abre esta
                             pantalla: verde oscuro y en negrita, no un dato más. */}
                          <td className="c-mono c-right liq-td-com" data-label="Comisión">
                            {fmt(Math.round(com))}
                            {esComp && <span style={{ display: 'block', fontSize: 10.5, lineHeight: 1.3, color: 'var(--text-4)', fontWeight: 400 }}>la mitad</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            )}
          </div>
          {/* Últimos pagos a este técnico. Vivía al final del carril derecho, y de
             ahí salían los dos defectos que se veían en pantalla: estiraba esa
             columna a 1.034px mientras la izquierda medía 377 (medido a 1512px),
             o sea 650px de fondo vacío a la izquierda; y con el carril tan alto,
             la tarjeta navy —que va pegada al fondo de la ventana— tapaba los
             últimos campos del paso 3, entre ellos "Pagado en efectivo" y su
             línea de ayuda. Aquí abajo cierra la columna del trabajo, que es
             donde estás mirando cuando marcas las OTs. No se quitó nada: se
             movió. */}
          <div className="card">
            <div className="card__b" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 13, lineHeight: 1, fontWeight: 700, color: 'var(--text)' }}>
                Últimos pagos a {tecData.tecnico.nombre.split(' ')[0]}
              </div>
              {(() => {
                const suyos = historialOrdenado.filter(h => String(h.tecnicoId) === String(tecData.tecnico.id))
                if (suyos.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Sin pagos anteriores.</div>
                return suyos.slice(0, 3).map(h => (
                  <div className="liq-pago" key={h.id}>
                    <span className="f">{fechaCorta(h.fecha)}</span>
                    <span className="r">#{liqRef(h.id)} · {h.metodoPago || 'efectivo'}</span>
                    <span className="v mono">{fmt(h.pagado != null ? h.pagado : (h.neto || 0))}</span>
                  </div>
                ))
              })()}
            </div>
          </div>
          </div>

          {/* PASO 3 — de dónde sale la plata, qué se ajusta y cuánto se paga.
             Antes esto eran TRES sitios distintos (aportes, cuenta del técnico y
             resumen); ahora los ajustes son UNA sola lista y el neto va debajo.
             El título encabeza el carril (no es cabecera de tarjeta). */}
          <div className="liq-work__side">
            <div className="liq-side__head">
              <span className="t">Paso 3 · Ajustes y pago</span>
              <span style={{ flex: 1 }} />
              <span title="Referencia para copiar en Cuentti" className="liq-ref mono">REF #{liqRef(nextLiqId(tecData.tecnico.nombre))}</span>
            </div>
          <div className="card">
            <div className="card__b">
              {cantSeleccionados === 0 ? (
                <div className="liq-empty">
                  <div className="liq-empty__icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5h.01"/></svg>
                  </div>
                  <h4>Aún no hay nada que calcular</h4>
                  <p>Marca los trabajos que vas a pagarle a {tecData.tecnico.nombre.split(' ')[0]} en el <strong>paso 2</strong> — ahí se arma la mano de obra, la comisión y el neto.</p>
                  <button type="button" className="btn btn-primary btn-sm" onClick={irAPaso2}>Ir al paso 2 ↑</button>
                  {/* Un diario o aporte ya cargado quedaba INVISIBLE aquí (la lista
                     de ajustes vive en la otra rama), y parecía que se había
                     borrado. Se anuncia, con la opción de quitarlo sin pagar. */}
                  {tecMovs.length > 0 && (
                    <div className="liq-empty__note" style={{ flexDirection: 'column', gap: 8 }}>
                      <div>
                        Ya tiene <strong className="mono">{fmt(tecMovs.reduce((s, m) => s + (parseFloat(m.monto) || 0), 0))}</strong> en aportes cargados ({tecMovs.map(m => tipoLabel(m.tipo)).join(', ')}) — se descontarán cuando elijas los trabajos.
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {tecMovs.map(m => (
                          <Button key={m.id} variant="ghost" size="sm" style={{ fontSize: 11.5, color: 'var(--text-3)' }}
                            onClick={() => setDialog({
                              title: 'Eliminar movimiento',
                              lead: `${tipoLabel(m.tipo)} · ${fmt(m.monto)} · ${fechaCorta(m.fecha)}`,
                              confirmLabel: 'Sí, eliminar', tone: 'danger',
                              onConfirm: () => hookEliminarMov(m.id),
                            })}>
                            Quitar {tipoLabel(m.tipo)} {fmt(m.monto)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {tecCuenta.saldo !== 0 && (
                    <div className="liq-empty__note">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v6M12 22v-6M2 12h6M22 12h-6"/></svg>
                      {tecCuenta.saldo > 0
                        ? <>{tecData.tecnico.nombre.split(' ')[0]} tiene <strong className="mono">{fmt(tecCuenta.saldo)}</strong> pendientes en su cuenta — se podrán descontar aquí una vez elijas los trabajos.</>
                        : <>El taller le debe <strong className="mono">{fmt(-tecCuenta.saldo)}</strong> — se podrá sumar aquí una vez elijas los trabajos.</>}
                    </div>
                  )}
                </div>
              ) : (
              <>
              <div className="liq-line"><span>Mano de obra (sin IVA) · {cantSeleccionados} {cantSeleccionados === 1 ? 'OT' : 'OTs'}</span><span className="liq-line__v mono">{fmt(totalSeleccion.manoObra)}</span><span className="liq-slot" aria-hidden="true" /></div>
              <div className="liq-line"><span>Comisión ({COMISION.TOTAL * 100}%)</span><span className="liq-line__v mono" style={{ color: 'var(--green-700)', fontWeight: 700 }}>{fmt(totalSeleccion.comision)}</span><span className="liq-slot" aria-hidden="true" /></div>

              {/* ===== AJUSTES — una sola lista: aportes, diario y deudas juntos ===== */}
              <div className="liq-grp" style={{ margin: '20px 0 8px' }}>Ajustes de este pago</div>

              {tecMovs.length === 0 && tecCuenta.deudas.length === 0 && tecCuenta.saldo === 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Sin ajustes.</p>
              )}

              {/* Aportes y descuentos de este cierre */}
              {tecMovs.map(m => (
                <div key={m.id} className="liq-aj">
                  <span className="liq-aj__txt">
                    <strong>{tipoLabel(m.tipo)}</strong>
                    <span style={{ color: 'var(--text-3)' }}> · {fechaCorta(m.fecha)}{m.nota ? ` · ${m.nota}` : ''}</span>
                  </span>
                  <span className="liq-aj__val mono" style={{ color: 'var(--amber-700)' }}>− {fmt(m.monto)}</span>
                  <Button variant="ghost" size="sm" className="btn-icon" aria-label="Quitar ajuste" title="Quitar" style={{ width: 28, height: 28, flexShrink: 0 }} onClick={() => setDialog({
                    title: 'Eliminar movimiento',
                    lead: `${tipoLabel(m.tipo)} · ${fmt(m.monto)} · ${fechaCorta(m.fecha)}`,
                    confirmLabel: 'Sí, eliminar', tone: 'danger',
                    onConfirm: () => hookEliminarMov(m.id),
                  })}><IconX /></Button>
                </div>
              ))}

              {/* Deudas del Estado de cuenta: mismas fichas, se marcan para descontar */}
              {tecCuenta.saldo > 0 && tecCuenta.deudas.map(m => {
                const marcada = !!cuentaSelIds[m.id]
                return (
                  <label key={m.id} className={`liq-aj${marcada ? ' on' : ''}`} style={{ cursor: 'pointer' }}>
                    <span className="liq-aj__txt">
                      <strong>Deuda</strong>
                      <span style={{ color: 'var(--text-3)' }}> · {fechaCorta(m.fecha)} · {m.nota || 'Préstamo'}</span>
                    </span>
                    <span className="liq-aj__val mono" style={{ color: marcada ? 'var(--amber-700)' : 'var(--text-3)' }}>
                      {marcada ? '− ' : ''}{fmt(m.restante)}
                      {m.restante !== Math.round(parseFloat(m.monto) || 0) && (
                        <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text-4)' }}> de {fmt(m.monto)}</span>
                      )}
                    </span>
                    {/* El control va en el MISMO hueco derecho que la × de los aportes
                       (accesorio a la derecha, como una lista de iOS). */}
                    <span style={{ width: 28, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
                      <input type="checkbox" checked={marcada} onChange={() => toggleCuentaSel(m.id)} style={{ width: 17, height: 17, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                    </span>
                  </label>
                )
              })}

              {/* Monto libre contra su cuenta (o suma, si el taller le debe) */}
              {tecCuenta.saldo !== 0 && (
                /* Campo y su ayuda apilados: al costado quedaban sin alinear entre sí. */
                <div style={{ marginTop: 12 }}>
                  <div className="field" style={{ maxWidth: 220, margin: 0 }}>
                    <label>{tecCuenta.saldo > 0 ? 'O descontar un monto' : 'Sumar a este pago'}</label>
                    {/* Escribir a mano desmarca los checkboxes (manda lo escrito) */}
                    <MoneyInput value={cuentaMonto} onChange={(v) => { setCuentaMonto(v); if (tecCuenta.saldo > 0) setCuentaSelIds({}) }} placeholder="0" />
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '8px 0 0', lineHeight: 1.45 }}>
                    {tecCuenta.saldo > 0 ? (
                      <>Al generar el pago se abona a su Estado de cuenta.
                        {(parseFloat(cuentaMonto) || 0) > 0 && totalSeleccion.descuentoCuenta !== Math.round(parseFloat(cuentaMonto) || 0) && (
                          <> Se aplican <strong className="mono">{fmt(totalSeleccion.descuentoCuenta)}</strong> (hasta el saldo y lo que alcance el neto).</>
                        )}
                      </>
                    ) : (
                      <>El taller le debe {fmt(-tecCuenta.saldo)}. Lo que sumes queda registrado en su cuenta con la referencia del pago.
                        {(parseFloat(cuentaMonto) || 0) > 0 && totalSeleccion.sumaCuenta !== Math.round(parseFloat(cuentaMonto) || 0) && (
                          <> Se aplican <strong className="mono">{fmt(totalSeleccion.sumaCuenta)}</strong> (hasta lo que se le debe).</>
                        )}
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Agregar un ajuste nuevo: el formulario aparece SOLO al elegir cuál.
                 Usa .btn-outline del sistema (antes era un borde punteado propio
                 que no calzaba con ningún otro botón de la app). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                {[['adelanto', 'Adelanto o cargo'], ['diario', 'Diario del administrador']].map(([k, lbl]) => {
                  const on = aporteForm === k
                  return (
                    <button key={k} type="button" onClick={() => setAporteForm(on ? null : k)}
                      className={`btn btn-sm ${on ? 'btn-primary' : 'btn-outline'}`}>
                      {on
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>}
                      {lbl}
                    </button>
                  )
                })}
              </div>

              {/* ADELANTO / CARGO — formulario en línea, plano. Dos columnas y no
                 cinco: vive en el carril de 322px del diseño, donde cinco campos
                 en fila se aplastaban. */}
              {aporteForm === 'adelanto' && (
                <form onSubmit={agregarMovimiento} style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field"><label>Tipo</label><select className="input" value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}><option value="adelanto">Adelanto</option><option value="prestamo">Préstamo</option><option value="consumo">Consumo</option><option value="descuento">Descuento</option></select></div>
                  <div className="field"><label>Monto</label><MoneyInput value={movForm.monto} onChange={v => setMovForm(f => ({ ...f, monto: v }))} placeholder="0" /></div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}><label>Fecha</label><input className="input" type="date" value={movForm.fecha} onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))}/></div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}><label>Nota</label><input className="input" value={movForm.nota} onChange={e => setMovForm(f => ({ ...f, nota: e.target.value }))} placeholder="Almuerzo, anticipo..."/></div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-end' }}><Button variant="primary" type="submit" style={{ width: '100%' }}>Agregar</Button></div>
                </form>
              )}

              {/* DIARIO — gasto del admin por día (50/50). Plano, sin caja anidada. */}
              {aporteForm === 'diario' && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className="eyebrow eyebrow--warn">Diario · gasto del administrador (técnico {APORTE_ADMIN_SPLIT * 100}%)</span>
                    <div className="segctl" style={{ margin: 0 }}>
                      <button type="button" className={!diarioReparto ? 'on' : ''} onClick={() => setDiarioReparto(false)} style={{ fontSize: 12 }}>Solo este técnico</button>
                      <button type="button" className={diarioReparto ? 'on' : ''} onClick={() => setDiarioReparto(true)} style={{ fontSize: 12 }}>Repartir</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                    <div className="field" style={{ flex: '0 0 150px' }}><label>Valor diario</label><MoneyInput value={valorDiario} onChange={cambiarValorDiario} /></div>
                    <div className="field" style={{ flex: '0 0 110px' }}><label>Días</label><input className="input" type="number" min="0" value={diarioDias} onChange={e => setDiarioDias(e.target.value)} placeholder="Ej. 6" /></div>
                    {!diarioReparto ? (
                      <>
                        {/* Sin días escritos no se muestra "$0": es un cálculo que
                           aún no existe, no un resultado. */}
                        <div style={{ flex: 1, minWidth: 130, fontSize: 13.5, color: 'var(--text-3)' }}>
                          {(parseInt(diarioDias) || 0) > 0
                            ? <>Diario a cargar: <strong style={{ color: 'var(--amber-700)', fontFamily: 'var(--mono)' }}>{fmt((Number(valorDiario) || 0) * parseInt(diarioDias))}</strong></>
                            : <>Escribe cuántos días para calcular el cargo.</>}
                        </div>
                        <Button variant="outline" type="button" onClick={agregarDiario}>Agregar diario</Button>
                      </>
                    ) : (
                      <div style={{ flex: 1, minWidth: 220, fontSize: 13.5, color: 'var(--text-3)' }}>
                        {(() => {
                          const nRep = Object.keys(diarioRepTec).filter(id => diarioRepTec[id]).length
                          const totalDia = (Number(valorDiario) || 0) * (parseInt(diarioDias) || 0)
                          const parteDia = nRep > 0 ? Math.round(totalDia / nRep) : 0
                          return <>Total <strong style={{ color: 'var(--amber-700)', fontFamily: 'var(--mono)' }}>{fmt(totalDia)}</strong>{nRep > 0 && <> ÷ {nRep} = <strong style={{ color: 'var(--amber-700)', fontFamily: 'var(--mono)' }}>{fmt(parteDia)}</strong> c/u</>}</>
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>Nota (lo que verá el técnico en su liquidación)</label>
                    <input className="input" value={diarioNota} onChange={e => setDiarioNota(e.target.value)} placeholder={DIARIO_NOTA_DEFAULT} />
                  </div>
                  {diarioReparto && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>¿Entre quiénes se reparte?</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {resumenTecnicos.map(t => (
                          <label key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid', borderColor: diarioRepTec[t.id] ? 'var(--amber-600)' : 'var(--border)', background: diarioRepTec[t.id] ? 'rgba(245,158,11,.10)' : 'var(--bg-raised)', borderRadius: 999, cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" checked={!!diarioRepTec[t.id]} onChange={() => toggleDiarioRepTec(t.id)} />
                            {t.nombre.split(' ')[0]}
                          </label>
                        ))}
                      </div>
                      <Button variant="outline" type="button" onClick={repartirDiario}>Repartir diario</Button>
                    </div>
                  )}
                </div>
              )}

              {/* El neto ya NO va aquí: sube al carril derecho, en el navy, con
                 el botón de pagar dentro (ver más abajo). Aquí quedan los
                 ajustes que lo forman y los avisos que hay que leer antes. */}
                {totalSeleccion.cargos > 0 && (
                  <div style={{ padding: '9px 13px', background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 9, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14 }}>
                    {totalSeleccion.cargos !== totalSeleccion.cargosEfectivos ? (
                      <>Cargos <strong>{fmt(totalSeleccion.cargos)}</strong> — descuento real <strong>{fmt(totalSeleccion.cargosEfectivos)}</strong> (el diario se comparte {APORTE_ADMIN_SPLIT * 100}/{100 - APORTE_ADMIN_SPLIT * 100}; el resto completo{totalSeleccion.descuentoCuenta > 0 ? <>, incluye <strong className="mono">{fmt(totalSeleccion.descuentoCuenta)}</strong> de su cuenta</> : null}). Neto = comisión − {fmt(totalSeleccion.cargosEfectivos)}.</>
                    ) : (
                      <>Cargos <strong>{fmt(totalSeleccion.cargosEfectivos)}</strong>{totalSeleccion.descuentoCuenta > 0 ? <> (incluye <strong className="mono">{fmt(totalSeleccion.descuentoCuenta)}</strong> de su cuenta)</> : null}. Neto = comisión − {fmt(totalSeleccion.cargosEfectivos)}.</>
                    )}
                  </div>
                )}
                {totalSeleccion.neto < 0 && (
                  <div style={{ padding: '10px 14px', background: 'rgba(220,38,38,.07)', border: '1px solid rgba(220,38,38,.28)', borderRadius: 9, fontSize: 13, color: 'var(--red-700)', fontWeight: 600, marginBottom: 14 }}>
                    Los cargos superan la comisión. Al generar el pago, la deuda restante se arrastrará como "saldo anterior".
                  </div>
                )}
                {totalSeleccion.neto > 0 && (
                  <div className="liq-medio">
                    <div className="liq-medio__head">
                      <span className="eyebrow">Método de pago</span>
                      <div className="segctl" style={{ margin: 0 }}>
                        <button type="button" className={metodoPagoLiq === 'efectivo' ? 'on' : ''} onClick={() => setMetodoPagoLiq('efectivo')} style={{ fontSize: 12.5 }}>Efectivo</button>
                        <button type="button" className={metodoPagoLiq === 'transferencia' ? 'on' : ''} onClick={() => setMetodoPagoLiq('transferencia')} style={{ fontSize: 12.5 }}>Transferencia</button>
                      </div>
                    </div>
                    <div className="liq-medio__campo">
                      <div className="field">
                        <label>Pagado {metodoPagoLiq === 'transferencia' ? 'por transferencia' : 'en efectivo'}</label>
                        <MoneyInput value={pagoReal} onChange={setPagoReal} />
                      </div>
                      <div className="liq-medio__ayuda">
                        Vacío paga el neto completo (<strong className="mono">{fmt(totalSeleccion.neto)}</strong>).
                      </div>
                    </div>
                    {(() => {
                      const pagadoNum = montoEntregado
                      const diffNum = totalSeleccion.neto - pagadoNum
                      if (diffNum > 0) return (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>Le pagas <strong className="mono">{fmt(pagadoNum)}</strong> de <strong className="mono">{fmt(totalSeleccion.neto)}</strong>. La diferencia de <strong className="mono" style={{ color: 'var(--amber-700)' }}>{fmt(diffNum)}</strong> — ¿qué hago con ella?</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {[['debo', 'Se lo quedo debiendo'], ['prestamo', 'Abona a su préstamo']].map(([k, lbl]) => {
                              const on = diffDestino === k
                              return (
                                <button key={k} type="button" onClick={() => setDiffDestino(k)}
                                  style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '9px 15px', borderRadius: 8,
                                    border: `1px solid ${on ? 'var(--blue-600)' : 'var(--border-strong)'}`,
                                    background: on ? 'var(--blue-600)' : 'var(--bg-raised)', color: on ? '#fff' : 'var(--text-2)',
                                    transition: 'background .12s, color .12s, border-color .12s' }}>
                                  {lbl}
                                </button>
                              )
                            })}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-3)' }}>
                            {diffDestino === 'debo'
                              ? <>Queda como <strong>saldo a favor del técnico</strong>: le sigues debiendo <strong className="mono">{fmt(diffNum)}</strong> en su Estado de cuenta.</>
                              : <>Esos <strong className="mono">{fmt(diffNum)}</strong> <strong>bajan lo que el técnico te debe</strong> (sus préstamos o adelantos).</>}
                          </div>
                        </div>
                      )
                      if (diffNum < 0) return (
                        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-2)' }}>Pagas <strong>{fmt(-diffNum)}</strong> de más → quedará como <strong>adelanto</strong> (el técnico lo debe).</div>
                      )
                      return null
                    })()}
                  </div>
                )}
                {/* Sin conexión no se paga: los trabajos, los aportes y el saldo de
                   su cuenta serían los del caché, y liquidar sobre datos viejos es
                   exactamente como se termina pagando dos veces. */}
                {connectionError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 12, borderRadius: 9, background: 'var(--soft-red)', border: '1px solid rgba(220,38,38,.28)', fontSize: 13, color: 'var(--red-700)', fontWeight: 600 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
                    <span style={{ flex: 1 }}>Sin conexión: estos montos salen de la última copia guardada. Reconéctate antes de pagar.</span>
                    <Button variant="outline" size="sm" onClick={() => liquidacionHook.recargar()}>Reintentar</Button>
                  </div>
                )}
              </>
              )}
            </div>
          </div>

          {/* NETO — la tarjeta navy del diseño: la cifra, de qué está hecha y el
             botón de pagar DENTRO. Antes el botón vivía suelto al final de la
             página y había que bajar para verlo. */}
          {cantSeleccionados > 0 && (
            <div className="hd-neto" style={{ margin: 0 }}>
              <div className="hd-neto__l">NETO A PAGAR HOY</div>
              <div className="hd-neto__v">{fmt(totalSeleccion.neto)}</div>
              <div className="hd-neto__rows">
                <div className="hd-neto__r"><span>Comisión de lo marcado</span><span>{fmt(totalSeleccion.comision)}</span></div>
                {totalSeleccion.cargosEfectivos !== 0 && (
                  <div className={`hd-neto__r${totalSeleccion.cargosEfectivos >= 0 ? ' hd-neto__r--neg' : ''}`}>
                    <span>{totalSeleccion.cargosEfectivos >= 0 ? 'Menos aportes y descuentos' : 'Más ajustes a favor'}</span>
                    <span>{totalSeleccion.cargosEfectivos >= 0 ? '− ' : '+ '}{fmt(Math.abs(totalSeleccion.cargosEfectivos))}</span>
                  </div>
                )}
                <div className="hd-neto__sep" />
                <div className="hd-neto__r"><span>{cantSeleccionados} trabajo{cantSeleccionados !== 1 ? 's' : ''} marcado{cantSeleccionados !== 1 ? 's' : ''}</span><span>{fmt(totalSeleccion.manoObra)} mano de obra</span></div>
              </div>
              <div className="liq-pay">
                {/* El monto del botón es lo que ENTREGAS, no el neto teórico. */}
                <button type="button" className="liq-pay__go" disabled={connectionError} onClick={pedirPago}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {connectionError ? 'Sin conexión' : `Generar pago · ${fmt(montoEntregado)}`}
                </button>
                <button type="button" className="liq-pay__ico" onClick={exportPdfPago} title="Exportar PDF" aria-label="Exportar PDF">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          )}

          </div>
        </div>
        </>
      )}

      {/* El historial solo aparece cuando NO estás liquidando: mientras pagas, el
         carril queda limpio (técnico → trabajos → pago) y nada más compite. */}
      {!tecData && (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__h">
          <h3>Historial de pagos</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="count">{historial.length} pagos</span>
            <Button variant="outline" size="sm" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar' : 'Ver'}</Button>
          </div>
        </div>
        {verHistorial && (
          <div className="card__b">
            {historialOrdenado.length === 0 ? (
              <div className="empty"><h4>Sin pagos</h4><p>No hay pagos registrados.</p></div>
            ) : (
              <>
                {/* Filtros: 48 pagos en una lista plana no se podían recorrer. */}
                <div className="liq-filtros">
                  <select className="input" value={histTec} onChange={e => setHistTec(e.target.value)} aria-label="Filtrar por técnico">
                    <option value="">Todos los técnicos</option>
                    {TECNICOS.map(t => <option key={t.id} value={String(t.id)}>{t.nombre.split(' ').slice(0, 2).join(' ')}</option>)}
                  </select>
                  <select className="input" value={histMes} onChange={e => setHistMes(e.target.value)} aria-label="Filtrar por mes">
                    <option value="">Todos los meses</option>
                    {mesesHistorial.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
                  </select>
                  {sinCuenttiCount > 0 && (
                    <button type="button" onClick={() => setHistSinCuentti(v => !v)}
                      className={`btn btn-sm ${histSinCuentti ? 'btn-primary' : 'btn-outline'}`}>
                      Sin registrar en Cuentti · {sinCuenttiCount}
                    </button>
                  )}
                  {hayFiltroHist && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => { setHistTec(''); setHistMes(''); setHistSinCuentti(false) }}>Quitar filtros</Button>
                      <span style={{ fontSize: 12.5, color: 'var(--text-3)', marginLeft: 'auto' }}>{historialFiltrado.length} de {historial.length}</span>
                    </>
                  )}
                </div>
                {historialFiltrado.length === 0 ? (
                  <div className="empty"><h4>Sin resultados</h4><p>Ningún pago coincide con estos filtros.</p></div>
                ) : historialFiltrado.map(reg => (
                  <div key={reg.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--bg-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <div>
                        <button type="button" title="Clic para copiar la referencia" className="mono"
                          onClick={() => { const r = liqRef(reg.id); navigator.clipboard?.writeText(r); notify(`Referencia ${r} copiada`, 'success') }}
                          style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-600)', background: 'rgba(37,99,235,.10)', border: '1px solid rgba(37,99,235,.2)', padding: '2px 8px', borderRadius: 6, cursor: 'pointer' }}>
                          #{liqRef(reg.id)}
                        </button>
                        <Badge tone="info" style={{ marginLeft: 8 }}>{reg.tecnico}</Badge>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{fechaCorta(reg.fecha)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 13.5 }}><strong>{reg.cantidadTrabajos}</strong> trabajos</span>
                      <span style={{ fontSize: 13.5 }}>Mano de obra: <strong className="mono">{fmt(reg.manoObra || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: 'var(--green-600)' }}>Comisión: <strong className="mono">{fmt(reg.comision || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: 'var(--amber-600)' }}>Cargos: <strong className="mono">{fmt(reg.cargos || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: reg.neto >= 0 ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 700 }}>Neto: <strong className="mono">{fmt(reg.neto || 0)}</strong></span>
                      {reg.pagado != null && reg.pagado !== reg.neto && (
                        (reg.neto || 0) - reg.pagado > 0 ? (
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--amber-700)' }}>
                            Pagado: <strong className="mono">{fmt(reg.pagado)}</strong> · Pendiente: <strong className="mono">{fmt((reg.neto || 0) - reg.pagado)}</strong>
                          </span>
                        ) : (
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--blue-600)' }}>
                            Pagado: <strong className="mono">{fmt(reg.pagado)}</strong> · Adelanto: <strong className="mono">{fmt(reg.pagado - (reg.neto || 0))}</strong>
                          </span>
                        )
                      )}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        {reg.cuenttiGasto ? (
                          <span className="badge" style={{ background: 'var(--soft-green)', color: 'var(--green-700)', fontWeight: 700 }} title="Gasto ya registrado en Cuentti">✓ Cuentti {reg.cuenttiGasto}</span>
                        ) : (
                          <>
                            <select className="input" aria-label="Método de pago" value={metodoGasto[reg.id] || reg.metodoPago || 'efectivo'} onChange={e => setMetodoGasto(m => ({ ...m, [reg.id]: e.target.value }))} style={{ height: 30, minHeight: 30, fontSize: 12, padding: '2px 8px', width: 'auto' }}>
                              <option value="efectivo">Efectivo</option>
                              <option value="transferencia">Transferencia</option>
                              <option value="credito">Crédito (queda debiendo)</option>
                            </select>
                            {gastoError[reg.id] && regCuenttiId !== reg.id && (
                              <Button variant="outline" size="sm" onClick={() => marcarYaRegistradoCuentti(reg)} title="Si ya verificaste en Cuentti que quedó registrado" style={{ color: 'var(--green-700)', borderColor: 'rgba(22,163,74,.35)' }}>
                                Ya está en Cuentti
                              </Button>
                            )}
                            <Button variant="outline" size="sm" disabled={regCuenttiId === reg.id} onClick={() => pedirRegistrarCuentti(reg)}>
                              {regCuenttiId === reg.id ? 'Registrando…' : (gastoError[reg.id] ? 'Reintentar' : 'Registrar en Cuentti')}
                            </Button>
                          </>
                        )}
                        <Button variant="outline" size="sm" onClick={() => exportPdfHistorial(reg)}>PDF</Button>
                        {/* Anular: la salida que faltaba. Antes, un pago equivocado
                           solo se podía quitar borrando los 48 de una vez. */}
                        <Button variant="ghost" size="sm" style={{ color: 'var(--red-600)' }} onClick={() => pedirAnular(reg)}>Anular</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
