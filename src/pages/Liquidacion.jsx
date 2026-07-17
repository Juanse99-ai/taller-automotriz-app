import { useState, useMemo, useRef, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO } from '../utils/helpers'
import MoneyInput from '../components/MoneyInput'
import { COMISION, ESTADOS, PERSONAS_CUENTA } from '../utils/constants'
import { lsGet, lsSet } from '../services/storage'
import { useTecnicos } from '../services/tecnicos'
import { registrarGastoNominaBackend } from '../services/cuentti'
import { usePrestamos } from '../hooks/usePrestamos'
import { upsertPrestamo, fetchPrestamos } from '../services/supabase'
import { splitComision } from '../services/money'
import ConfirmDialog, { DlgRow } from '../components/ConfirmDialog'
import { Button, Badge } from '../components/ui'
import { loadLogo, drawHeader, drawSectionHeader, drawDataBlock, drawTotalsBox, drawSignatures, drawFooter, tableStylesItems, tableStylesMuted, PDF_LAYOUT } from '../utils/pdfTheme'

// Obtener base de mano de obra SIN IVA (solo servicios)
const getManoObra = (t) => {
  if (Array.isArray(t?.items) && t.items.length) {
    const suma = t.items.reduce((s, i) => {
      const precio = parseFloat(i?.precio) || 0
      const cant = parseInt(i?.cantidad) || 1
      const ivaPct = parseFloat(i?.iva) || 0
      const tipo = (i?.tipo || i?.categoria || '').toString().toLowerCase()
      const esServ = i?.esServicio === true || i?.es_servicio === 1 || tipo.includes('serv')
      if (!esServ) return s
      const totalLinea = precio * cant
      const base = ivaPct > 0 ? totalLinea / (1 + ivaPct / 100) : totalLinea
      return s + base
    }, 0)
    // Si hay líneas marcadas "Servicio", esas mandan (comportamiento de siempre).
    // Si NO hay (ej. cambio de aceite), se cae al valor guardado de mano de obra
    // que se escribió a mano en la OT.
    if (suma > 0) return Math.round(suma)
  }
  // Fallback a campos directos (mano de obra manual de la OT)
  if (typeof t?.manoObra === 'number' && !Number.isNaN(t.manoObra)) return Math.round(Math.max(0, t.manoObra))
  if (typeof t?.mano_obra === 'number' && !Number.isNaN(t.mano_obra)) return Math.round(Math.max(0, t.mano_obra))
  return 0
}

// El gasto del administrador ("diario") se reparte MITAD Y MITAD con el técnico.
const APORTE_ADMIN_SPLIT = 0.5
// Cargo EFECTIVO que se le descuenta al técnico:
//  - "diario" (gasto del administrador por día): costo compartido 50/50; el
//    técnico asume su mitad (50%) y el taller la otra mitad.
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

// Iniciales del técnico (2 letras) para la referencia legible.
const iniciales = (nombre) => (nombre || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'XX'

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
    agregarMovimiento: hookAgregarMov, eliminarMovimiento: hookEliminarMov,
    guardarLiquidados,
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
  // Ventanas del tecnico seleccionado: minimizables por header
  const [colapso, setColapso] = useState({ trabajos: false, movs: false })
  const toggleColapso = (k) => setColapso(c => ({ ...c, [k]: !c[k] }))
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
  const DIARIO_NOTA_DEFAULT = 'Aporte del día · administración (Nicanor)'
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
    const monto = reg.pagado != null ? reg.pagado : reg.neto
    if (!(monto > 0)) { notify('El neto de este pago no es positivo; no se registra gasto.', 'error'); return }
    const { idMedioPago, idBanco } = medioPagoIds(metodoGasto[reg.id] || 'efectivo')
    gastoRef.current.add(reg.id)
    setRegCuenttiId(reg.id)
    try {
      const data = await registrarGastoNominaBackend({
        proveedorCedula: cedula,
        proveedorNombre: reg.tecnico,
        monto,
        idMedioPago,
        idBanco,
        nota: `Nómina ${reg.tecnico} · liq #${liqRef(reg.id)}`,
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
  const toggleDiarioRepTec = (id) => setDiarioRepTec(p => ({ ...p, [id]: !p[id] }))

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
    const deudas = movs.filter(m => m.tipo === 'prestamo').sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
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

  const historialOrdenado = useMemo(() =>
    [...historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
  [historial])

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
    const suma = tecCuenta.deudas.filter(m => next[m.id]).reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
    setCuentaMonto(suma > 0 ? String(Math.round(suma)) : '')
  }

  // Agrega el "diario" como un cargo: monto = valor diario × días (que tú escribes).
  const agregarDiario = () => {
    const tid = parseInt(tecnicoSel)
    const dias = Math.floor(parseFloat(diarioDias) || 0)
    const monto = Math.round((Number(valorDiario) || 0) * dias)
    if (!tid) { notify('Selecciona un técnico primero', 'error'); return }
    if (dias <= 0) { notify('Escribe cuántos días', 'error'); return }
    if (monto <= 0) { notify('El valor diario debe ser mayor a 0', 'error'); return }
    hookAgregarMov({
      id: `MV-${uid()}`, tecnicoId: tid,
      tipo: 'diario', monto, nota: (diarioNota || '').trim() || `${dias} día(s) × ${fmt(valorDiario)}`,
      fecha: hoyISO(),
    })
    setDiarioDias('')
    notify(`Diario agregado: ${dias} día(s) = ${fmt(monto)}`, 'success')
  }

  // Reparte el diario (valor × días) en partes iguales entre los técnicos marcados.
  const repartirDiario = () => {
    const dias = Math.floor(parseFloat(diarioDias) || 0)
    const total = Math.round((Number(valorDiario) || 0) * dias)
    const ids = Object.keys(diarioRepTec).filter(id => diarioRepTec[id]).map(Number)
    if (dias <= 0) { notify('Escribe cuántos días', 'error'); return }
    if (total <= 0) { notify('El valor diario debe ser mayor a 0', 'error'); return }
    if (ids.length < 2) { notify('Marca al menos 2 técnicos para repartir', 'error'); return }
    const parte = Math.round(total / ids.length)
    ids.forEach(tid => hookAgregarMov({
      id: `MV-${uid()}`, tecnicoId: tid,
      tipo: 'diario', monto: parte,
      nota: (diarioNota || '').trim() || `${dias} día(s) × ${fmt(valorDiario)} ÷ ${ids.length}`,
      fecha: hoyISO(),
    }))
    setDiarioDias(''); setDiarioRepTec({})
    notify(`Diario repartido: ${fmt(parte)} a cada uno (${ids.length} técnicos)`, 'success')
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

  const generarPago = async (skipConfirm = false) => {
    const ids = Object.keys(seleccionados).filter(id => seleccionados[id])
    if (ids.length === 0) { notify('Selecciona al menos un trabajo para liquidar', 'error'); return }
    if (!tecData) return
    if (pagandoRef.current) return

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
    const nuevoId = nextLiqId(tecData.tecnico.nombre)
    // Pago real: lo que entregas en efectivo (por defecto el neto).
    const netoCalc = totalSeleccion.neto
    const pagado = (pagoReal === '' || pagoReal == null) ? netoCalc : Math.round(parseFloat(pagoReal) || 0)

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
    const nuevasLiq = ids.map(id => compInfo(id).es ? `${id}#${tecData.tecnico.id}` : id)
    guardarLiquidados([...liquidados, ...nuevasLiq])

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

    setSeleccionados({}); setPagoReal(''); setDiffDestino('debo'); setCuentaMonto(''); setCuentaSelIds({}); setMetodoPagoLiq('efectivo')
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
    setDialog({
      title: 'Revisar antes de pagar',
      body: (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 4 }}>
          <DlgRow label="Técnico" value={tecData?.tecnico?.nombre || '—'} />
          <DlgRow label="Trabajos a liquidar" value={`${cantSeleccionados} ${cantSeleccionados === 1 ? 'OT' : 'OTs'}`} />
          <DlgRow label={`Comisión (${COMISION.TOTAL * 100}%)`} value={fmt(t.comision)} />
          <DlgRow label="Aportes / descuentos" value={`− ${fmt(t.cargosMovsEf)}`} />
          {t.descuentoCuenta > 0 && <DlgRow label={`Cuenta del técnico (debe ${fmt(tecCuenta.saldo)})`} value={`− ${fmt(t.descuentoCuenta)}`} />}
          {t.sumaCuenta > 0 && <DlgRow label={`Cuenta del técnico (a favor ${fmt(-tecCuenta.saldo)})`} value={`+ ${fmt(t.sumaCuenta)}`} />}
          {tecCuenta.saldo > 0 && t.descuentoCuenta === 0 && (
            <div style={{ padding: '9px 14px', borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,.09)', fontSize: 12.5, fontWeight: 600, color: 'var(--amber-600)' }}>
              Debe {fmt(tecCuenta.saldo)} en su cuenta y no estás descontando nada.
            </div>
          )}
          <DlgRow label={negativo ? 'Saldo en contra (se arrastra)' : 'Neto a pagar'} value={fmt(t.neto)} total />
        </div>
      ),
      confirmLabel: negativo ? 'Registrar saldo' : 'Confirmar pago',
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
      y: Math.max(y, 252),
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
      y: Math.max(y, 252),
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
        // Quita el id plano Y las claves por técnico (compartido) de ese trabajo.
        guardarLiquidados(liquidados.filter(x => x !== id && !x.startsWith(`${id}#`)))
        notify('Trabajo desliquidado', 'info')
      },
    })
  }

  // Trabajos totalmente liquidados (ocultos) que aún existen en la lista.
  const trabajosLiquidados = useMemo(() => {
    return trabajos.filter(t => totalmenteLiquidado(t))
  }, [trabajos, liquidados, compartidos])

  // ===== Tabs: Comisiones | Estado de cuenta =====
  const segTabStyle = (active) => ({
    fontFamily: 'inherit', fontSize: 14, fontWeight: 600, border: 0, cursor: 'pointer',
    padding: '8px 18px', borderRadius: 7, transition: 'background .15s, color .15s',
    background: active ? 'var(--surface, #fff)' : 'transparent',
    color: active ? 'var(--text-1, #101725)' : 'var(--text-3, #5b6472)',
    boxShadow: active ? '0 1px 2px rgba(16,23,37,.10)' : 'none',
  })
  const tabsLiq = (
    <div role="tablist" style={{ display: 'inline-flex', background: 'var(--bg-2, #eceef4)', padding: 4, borderRadius: 10, gap: 4, marginBottom: 22 }}>
      <button role="tab" aria-selected={vistaLiq === 'comisiones'} style={segTabStyle(vistaLiq === 'comisiones')} onClick={() => setVistaLiq('comisiones')}>Comisiones</button>
      <button role="tab" aria-selected={vistaLiq === 'cuentas'} style={segTabStyle(vistaLiq === 'cuentas')} onClick={() => setVistaLiq('cuentas')}>Estado de cuenta</button>
    </div>
  )

  if (vistaLiq === 'cuentas') {
    return (
      <div>
        <div className="pagehd">
          <div>
            <h2>Estado de cuenta · préstamos</h2>
          </div>
        </div>
        {tabsLiq}
        <EstadoCuenta prestamos={prestamosHook} tecnicos={TECNICOS} notify={notify} />
      </div>
    )
  }

  // ===== RENDER =====
  return (
    <div>
      <ConfirmDialog cfg={dialog} onClose={() => setDialog(null)} />
      <style>{`
        .liq-book{ display:grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap:22px; align-items:start; }
        .liq-aside{ position:sticky; top:12px; }
        .liq-roster-row{ display:flex; align-items:center; gap:12px; width:100%; padding:13px 16px; text-align:left; background:transparent; border:none; border-top:1px solid var(--border); cursor:pointer; transition:background .15s var(--ease-out); }
        .liq-roster-row:first-of-type{ border-top:none; }
        .liq-roster-row:hover{ background:var(--bg-subtle); }
        .liq-roster-row.on{ background:var(--navy-900); }
        .liq-sheet-col{ min-width:0; }
        .liq-empty{ border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg-raised); padding:52px 24px; text-align:center; color:var(--text-3); height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .liq-empty p{ font-size:14px; max-width:300px; margin:12px auto 0; line-height:1.5; }
        .liq-neto__row{ display:flex; align-items:baseline; padding:5px 0; font-size:14.5px; color:var(--text-2); }
        .liq-neto__row .a{ margin-left:auto; }
        .liq-neto__tot .l{ font-size:12.5px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:var(--text); }
        .liq-neto__tot .v{ margin-left:auto; font-size:26px; font-weight:800; letter-spacing:-.02em; }
        @media (max-width: 860px){ .liq-book{ grid-template-columns:1fr; } .liq-aside{ position:static; } }
      `}</style>
      <div className="pagehd">
        <div>
          <h2>Liquidación de comisiones</h2>
        </div>
        <div className="actions">
          <Button variant="outline" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar historial' : 'Ver historial'}</Button>
        </div>
      </div>
      {tabsLiq}

      {/* Cierre — cifra editorial dominante + stats secundarias (no tarjeta-espejo) */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', padding: '4px 2px 20px', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Total a pagar · cierre actual</div>
          <div className="mono" style={{ fontWeight: 800, fontSize: 'clamp(40px, 7vw, 58px)', letterSpacing: '-.03em', lineHeight: 1.02, color: 'var(--green-700)', margin: '7px 0 8px' }}>
            {fmt(totalNomina)}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
            {resumenTecnicos.filter(t => t.pendientes > 0).length} técnico{resumenTecnicos.filter(t => t.pendientes > 0).length !== 1 ? 's' : ''} · {trabajosPendientes.length} OT{trabajosPendientes.length !== 1 ? 's' : ''} pendiente{trabajosPendientes.length !== 1 ? 's' : ''}
            {kpis.sinTecnico > 0 && <span style={{ color: 'var(--red-600)', fontWeight: 600 }}> · {kpis.sinTecnico} sin técnico</span>}
            {kpis.sinPartner > 0 && <span style={{ color: 'var(--amber-700)', fontWeight: 600 }}> · {kpis.sinPartner} compartido{kpis.sinPartner !== 1 ? 's' : ''} sin compañero</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          {[['Comisiones', fmt(kpis.comisiones)], ['Mano de obra facturada', fmt(kpis.facturado)], ['Utilidad taller', fmt(kpis.utilidad)]].map(([l, v]) => (
            <div key={l} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{l}</div>
              <div className="mono" style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-2)', marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="liq-book" style={{ alignItems: tecData ? 'start' : 'stretch' }}>
      <aside className="liq-aside">
      {/* Nómina: técnicos en un solo panel, filas divididas (clic para liquidar) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Nómina</h3>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{resumenTecnicos.filter(t => t.pendientes > 0).length} por liquidar</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-raised)' }}>
        {resumenTecnicos.length === 0 ? (
          <div style={{ padding: '22px', fontSize: 13.5, color: 'var(--text-3)' }}>No hay técnicos con trabajos pendientes de liquidar.</div>
        ) : resumenTecnicos.map((t, i) => {
          const activo = tecnicoSel === String(t.id)
          return (
            <button
              key={t.id}
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
      </div>

      {trabajosLiquidados.length > 0 && (
        <div style={{ marginTop: 10 }}>
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
                    {fmtDate(t.fecha)} · <strong>{t.placa || '—'}</strong> · {t.cliente || '—'}
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

      </aside>

      <main className="liq-sheet-col">
      {!tecData ? (
        <div className="liq-empty">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .7 }}><path d="M4 4h16v4H4z"/><path d="M4 12h16"/><path d="M4 18h10"/></svg>
          <p>Selecciona un técnico de la nómina para ver su hoja de pago.</p>
        </div>
      ) : (
        <>
          <div style={{ padding: '2px 2px 14px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--text-3)' }}>Hoja de liquidación · cierre actual</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-.02em' }}>{tecData.tecnico.nombre}</h2>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--blue-600)', background: 'rgba(37,99,235,.10)', padding: '3px 9px', borderRadius: 7 }}>Ref. #{liqRef(nextLiqId(tecData.tecnico.nombre))}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{tecData.tecnico.especialidad || 'Técnico'} · comisión {COMISION.TOTAL * 100}% de la mano de obra</div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card__h" style={{ cursor: 'pointer' }} onClick={() => toggleColapso('trabajos')}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: colapso.trabajos ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 200ms var(--ease-out)', flexShrink: 0, color: 'var(--text-3)' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                {tecData.tecnico.nombre} — Trabajos pendientes
              </h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                {!colapso.trabajos && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Selecciona los que vas a liquidar</span>}
                {colapso.trabajos && cantSeleccionados > 0 && <span className="count">{cantSeleccionados} seleccionados</span>}
                {!colapso.trabajos && (
                  <Button variant="outline" size="sm" onClick={() => seleccionarTodos(tecTrabajos.map(t => t.id))}>
                    {tecTrabajos.length > 0 && tecTrabajos.every(t => seleccionados[t.id]) ? 'Deseleccionar' : 'Todos'}
                  </Button>
                )}
              </div>
            </div>
            {!colapso.trabajos && (
            <div className="card__b card__b--flush">
              {tecTrabajos.length === 0 ? (
                <div className="empty"><h4>Sin pendientes</h4><p>No hay trabajos pendientes de liquidar.</p></div>
              ) : (
                <table className="tbl tbl-cards tbl-liq">
                  <thead><tr><th style={{ width: 40 }}></th><th>Fecha</th><th>OT</th><th>Placa</th><th>Cliente</th><th style={{ textAlign: 'center' }}>Compartido</th><th className="c-right">Mano de obra</th><th className="c-right">Comisión</th></tr></thead>
                  <tbody>
                    {tecTrabajos.map(t => {
                      const mano = moMap[t.id] || 0
                      const { es: esComp, partner } = compInfo(t.id)
                      const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
                      const selected = !!seleccionados[t.id]
                      const tidAsignado = parseInt(t.tecnicoId)
                      return (
                        <tr key={t.id} style={{ background: selected ? 'rgba(22,163,74,.06)' : undefined, cursor: 'pointer' }} onClick={() => toggleSeleccion(t.id)}>
                          <td className="td-check" data-label="Liquidar" style={{ textAlign: 'center' }}><input type="checkbox" checked={selected} onChange={() => {}} aria-label="Seleccionar trabajo"/></td>
                          <td className="c-muted" data-label="Fecha">{fmtDate(t.fecha)}</td>
                          <td className="c-mono" data-label="OT" style={{ color: 'var(--blue-600)', fontWeight: 700 }}>{t.otCodigo || t.id}</td>
                          <td className="c-mono" data-label="Placa" style={{ fontWeight: 700 }}>{t.placa}</td>
                          <td className="c-name">{t.cliente || '—'}</td>
                          <td data-label="Compartido" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={esComp} onChange={() => {
                              const yaLiq = liquidados.some(x => x === t.id || x.startsWith(`${t.id}#`))
                              if (yaLiq) { setDialog({ title: 'Cambiar “Compartido”', lead: 'Este trabajo ya tiene un pago liquidado; cambiarlo puede descuadrar lo pagado.', confirmLabel: 'Cambiar igual', tone: 'danger', onConfirm: () => toggleCompartido(t.id) }); return }
                              toggleCompartido(t.id)
                            }} aria-label="Trabajo compartido"/>
                            {esComp && (
                              <select
                                className="input"
                                value={partner || ''}
                                onChange={e => {
                                  const yaLiq = liquidados.some(x => x.startsWith(`${t.id}#`))
                                  const nuevoPartner = e.target.value
                                  if (yaLiq) { setDialog({ title: 'Cambiar compañero', lead: 'Ya hay una mitad liquidada; cambiar el compañero puede descuadrar lo pagado.', confirmLabel: 'Cambiar igual', tone: 'danger', onConfirm: () => setCompartidoPartner(t.id, nuevoPartner) }); return }
                                  setCompartidoPartner(t.id, nuevoPartner)
                                }}
                                style={{ display: 'block', margin: '4px auto 0', width: 110, minHeight: 30, height: 30, fontSize: 12, padding: '2px 8px' }}
                                aria-label="Compañero del trabajo compartido"
                              >
                                <option value="">¿Con quién?</option>
                                {TECNICOS.filter(x => x.id !== tidAsignado && (x.activo !== false || x.id === partner)).map(x => (
                                  <option key={x.id} value={x.id}>{x.nombre.split(' ')[0]}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="c-mono c-right" data-label="Mano de obra" style={mano === 0 ? { color: 'var(--red-600)', fontWeight: 700 } : undefined}>
                            {fmt(mano)}
                            {mano === 0 && <span style={{ display: 'block', fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>sin servicios</span>}
                          </td>
                          <td className="c-mono c-right" data-label="Comisión" style={{ color: 'var(--green-600)', fontWeight: 600 }}>
                            {fmt(Math.round(com))}
                            {esComp && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>50/50</span>}
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

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card__h" style={{ cursor: 'pointer' }} onClick={() => toggleColapso('movs')}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: colapso.movs ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 200ms var(--ease-out)', flexShrink: 0, color: 'var(--text-3)' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                Aportes y descuentos — {tecData.tecnico.nombre}
              </h3>
              {colapso.movs && tecMovs.length > 0 && (
                <span className="count">{tecMovs.length} mov · {fmt(totalSeleccion.cargos)}</span>
              )}
            </div>
            {!colapso.movs && (
            <div className="card__b">
              {/* Acciones compactas: el formulario aparece SOLO al elegir qué agregar (nada de cajas permanentes) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginRight: 2 }}>Agregar</span>
                {[['adelanto', 'Adelanto o cargo'], ['diario', 'Diario del administrador']].map(([k, lbl]) => {
                  const on = aporteForm === k
                  return (
                    <button key={k} type="button" onClick={() => setAporteForm(on ? null : k)}
                      style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 13px', borderRadius: 999,
                        border: `1px solid ${on ? 'var(--blue-600)' : 'var(--border-strong)'}`,
                        background: on ? 'var(--blue-600)' : 'var(--bg-raised)', color: on ? '#fff' : 'var(--text-2)',
                        transition: 'background .12s, color .12s, border-color .12s' }}>
                      {on ? '✕ ' : '＋ '}{lbl}
                    </button>
                  )
                })}
              </div>

              {/* ADELANTO / CARGO — formulario en línea, plano */}
              {aporteForm === 'adelanto' && (
                <form onSubmit={agregarMovimiento} style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr auto', gap: 12 }}>
                  <div className="field"><label>Tipo</label><select className="input" value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}><option value="adelanto">Adelanto</option><option value="prestamo">Préstamo</option><option value="consumo">Consumo</option><option value="descuento">Descuento</option></select></div>
                  <div className="field"><label>Monto</label><MoneyInput value={movForm.monto} onChange={v => setMovForm(f => ({ ...f, monto: v }))} placeholder="0" /></div>
                  <div className="field"><label>Fecha</label><input className="input" type="date" value={movForm.fecha} onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))}/></div>
                  <div className="field"><label>Nota</label><input className="input" value={movForm.nota} onChange={e => setMovForm(f => ({ ...f, nota: e.target.value }))} placeholder="Almuerzo, anticipo..."/></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}><Button variant="primary" type="submit">Agregar</Button></div>
                </form>
              )}

              {/* DIARIO — gasto del admin por día (50/50). Plano, sin caja anidada. */}
              {aporteForm === 'diario' && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-700)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Diario · gasto del administrador (50/50)</span>
                    <div className="tabs" style={{ margin: 0 }}>
                      <button type="button" className={!diarioReparto ? 'on' : ''} onClick={() => setDiarioReparto(false)} style={{ fontSize: 12 }}>Solo este técnico</button>
                      <button type="button" className={diarioReparto ? 'on' : ''} onClick={() => setDiarioReparto(true)} style={{ fontSize: 12 }}>Repartir</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                    <div className="field" style={{ flex: '0 0 150px' }}><label>Valor diario</label><MoneyInput value={valorDiario} onChange={cambiarValorDiario} /></div>
                    <div className="field" style={{ flex: '0 0 110px' }}><label>Días</label><input className="input" type="number" min="0" value={diarioDias} onChange={e => setDiarioDias(e.target.value)} placeholder="Ej. 6" /></div>
                    {!diarioReparto ? (
                      <>
                        <div style={{ flex: 1, minWidth: 130, fontSize: 13.5, color: 'var(--text-3)' }}>
                          Diario a cargar: <strong style={{ color: 'var(--amber-700)', fontFamily: 'var(--mono)' }}>{fmt((Number(valorDiario) || 0) * (parseInt(diarioDias) || 0))}</strong>
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

              {/* Movimientos ya aplicados en este cierre */}
              {tecMovs.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-3)', marginTop: 16 }}>Sin aportes ni descuentos registrados en este cierre.</p>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Movimientos · {tecMovs.length}</div>
                  <table className="tbl tbl-cards">
                    <thead><tr><th>Tipo</th><th>Fecha</th><th>Nota</th><th className="c-right">Monto</th><th></th></tr></thead>
                    <tbody>
                      {tecMovs.map(m => (
                        <tr key={m.id}>
                          <td className="c-name">{tipoLabel(m.tipo)}</td>
                          <td className="c-muted" data-label="Fecha">{fmtDate(m.fecha)}</td>
                          <td className="c-muted" data-label="Nota">{m.nota || '—'}</td>
                          <td className="c-mono c-right" data-label="Monto" style={{ color: 'var(--amber-600)' }}>{fmt(m.monto)}</td>
                          <td className="td-actions"><Button variant="ghost" size="sm" onClick={() => setDialog({
                            title: 'Eliminar movimiento',
                            lead: `${tipoLabel(m.tipo)} · ${fmt(m.monto)} · ${fmtDate(m.fecha)}`,
                            confirmLabel: 'Sí, eliminar', tone: 'danger',
                            onConfirm: () => hookEliminarMov(m.id),
                          })} aria-label="Eliminar movimiento">✕</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* CUENTA DEL TÉCNICO — deudas del Estado de cuenta para descontar aquí. Plano. */}
              {(tecCuenta.saldo !== 0 || tecCuenta.deudas.length > 0) && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-600)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Cuenta del técnico · Estado de cuenta</span>
                    <span className="mono" style={{ fontSize: 13.5, fontWeight: 800, color: tecCuenta.saldo > 0 ? 'var(--red-600)' : 'var(--green-600)' }}>
                      {tecCuenta.saldo > 0 ? `Debe ${fmt(tecCuenta.saldo)}` : tecCuenta.saldo < 0 ? `A favor ${fmt(-tecCuenta.saldo)}` : 'En $ 0'}
                    </span>
                  </div>
                  {tecCuenta.saldo > 0 ? (
                    <>
                      {tecCuenta.deudas.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                          {tecCuenta.deudas.map(m => {
                            const marcada = !!cuentaSelIds[m.id]
                            return (
                              <label key={m.id} style={{
                                display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, cursor: 'pointer',
                                padding: '8px 11px', borderRadius: 8,
                                border: `1px solid ${marcada ? 'var(--blue-500)' : 'var(--border)'}`,
                                background: marcada ? 'var(--blue-50, #eff6ff)' : 'var(--bg-raised)',
                                transition: 'border-color .12s, background .12s',
                              }}>
                                <input type="checkbox" checked={marcada} onChange={() => toggleCuentaSel(m.id)} style={{ width: 15, height: 15, accentColor: 'var(--blue-500)', cursor: 'pointer', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{fmtDate(m.fecha)}</span>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nota || 'Préstamo'}</span>
                                <span className="mono" style={{ fontWeight: 700 }}>{fmt(m.monto)}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                        <div className="field" style={{ flex: '0 0 190px' }}>
                          <label>Descontar en este pago</label>
                          {/* Escribir a mano desmarca los checkboxes (manda lo escrito) */}
                          <MoneyInput value={cuentaMonto} onChange={(v) => { setCuentaMonto(v); setCuentaSelIds({}) }} placeholder="0" />
                        </div>
                        <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--text-3)' }}>
                          Marca deudas o escribe el monto. Al generar el pago se abona a su Estado de cuenta.
                          {(parseFloat(cuentaMonto) || 0) > 0 && totalSeleccion.descuentoCuenta !== Math.round(parseFloat(cuentaMonto) || 0) && (
                            <> Se aplican <strong className="mono">{fmt(totalSeleccion.descuentoCuenta)}</strong> (hasta el saldo y lo que alcance el neto).</>
                          )}
                        </div>
                      </div>
                    </>
                  ) : tecCuenta.saldo < 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                      <div className="field" style={{ flex: '0 0 190px' }}>
                        <label>Sumar a este pago</label>
                        <MoneyInput value={cuentaMonto} onChange={setCuentaMonto} placeholder="0" />
                      </div>
                      <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--text-3)' }}>
                        El taller le debe {fmt(-tecCuenta.saldo)}. Lo que sumes queda registrado en su cuenta con la referencia del pago.
                        {(parseFloat(cuentaMonto) || 0) > 0 && totalSeleccion.sumaCuenta !== Math.round(parseFloat(cuentaMonto) || 0) && (
                          <> Se aplican <strong className="mono">{fmt(totalSeleccion.sumaCuenta)}</strong> (hasta lo que se le debe).</>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sin deuda pendiente por descontar.</div>
                  )}
                </div>
              )}
            </div>
            )}
          </div>

          {cantSeleccionados > 0 && (
            <div className="card" style={{ marginTop: 16, borderColor: 'rgba(22,163,74,.32)', background: 'rgba(22,163,74,.04)' }}>
              <div className="card__h" style={{ borderBottomColor: 'rgba(22,163,74,.18)' }}>
                <h3 style={{ color: 'var(--green-700)' }}>Resumen del pago — {tecData.tecnico.nombre}</h3>
                <span title="Referencia para copiar en Cuentti" className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-600)', background: 'rgba(37,99,235,.10)', padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                  Ref. #{liqRef(nextLiqId(tecData.tecnico.nombre))}
                </span>
              </div>
              <div className="card__b">
                <div style={{ marginBottom: 16 }}>
                  <div className="liq-neto__row"><span>Mano de obra (sin IVA) · {cantSeleccionados} {cantSeleccionados === 1 ? 'OT' : 'OTs'}</span><span className="a mono">{fmt(totalSeleccion.manoObra)}</span></div>
                  <div className="liq-neto__row"><span>Comisión ({COMISION.TOTAL * 100}%)</span><span className="a mono" style={{ color: 'var(--green-700)', fontWeight: 700 }}>{fmt(totalSeleccion.comision)}</span></div>
                  {totalSeleccion.cargosEfectivos !== 0 && (
                    <div className="liq-neto__row"><span>Aportes / descuentos</span><span className="a mono" style={{ color: 'var(--amber-600)', fontWeight: 700 }}>{totalSeleccion.cargosEfectivos >= 0 ? '− ' : '+ '}{fmt(Math.abs(totalSeleccion.cargosEfectivos))}</span></div>
                  )}
                  <div className="liq-neto__tot" style={{ display: 'flex', alignItems: 'baseline', borderTop: '3px double var(--text)', marginTop: 8, paddingTop: 12 }}>
                    <span className="l">Neto a pagar</span>
                    <span className="v mono" style={{ color: totalSeleccion.neto >= 0 ? 'var(--green-700)' : 'var(--red-700)' }}>{fmt(totalSeleccion.neto)}</span>
                  </div>
                </div>
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
                  <div style={{ marginBottom: 14, padding: '12px 14px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Método de pago</span>
                      <div className="tabs" style={{ margin: 0 }}>
                        <button type="button" className={metodoPagoLiq === 'efectivo' ? 'on' : ''} onClick={() => setMetodoPagoLiq('efectivo')} style={{ fontSize: 12.5 }}>Efectivo</button>
                        <button type="button" className={metodoPagoLiq === 'transferencia' ? 'on' : ''} onClick={() => setMetodoPagoLiq('transferencia')} style={{ fontSize: 12.5 }}>Transferencia</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                      <div className="field" style={{ flex: '0 0 190px' }}>
                        <label>Pagado {metodoPagoLiq === 'transferencia' ? 'por transferencia' : 'en efectivo'}</label>
                        <MoneyInput value={pagoReal} onChange={setPagoReal} />
                      </div>
                      <div style={{ flex: 1, minWidth: 180, fontSize: 12.5, color: 'var(--text-3)' }}>
                        Déjalo vacío para pagar el neto completo (<strong className="mono">{fmt(totalSeleccion.neto)}</strong>).
                      </div>
                    </div>
                    {(() => {
                      const pagadoNum = pagoReal === '' ? totalSeleccion.neto : Math.round(parseFloat(pagoReal) || 0)
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
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <Button variant="outline" onClick={exportPdfPago}>Exportar PDF</Button>
                  <Button variant="primary" onClick={pedirPago}>Generar pago</Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      </main>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__h">
          <h3>Cuentas por técnico</h3>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Liquidado · Pagado · Saldo</span>
        </div>
        <div className="card__b card__b--flush">
          {cuentasTecnicos.length === 0 ? (
            <div className="empty"><h4>Sin datos</h4><p>Aún no hay liquidaciones ni saldos que mostrar.</p></div>
          ) : (
            <table className="tbl tbl-cards">
              <thead><tr><th>Técnico</th><th className="c-right">Liquidado</th><th className="c-right">Pagado</th><th className="c-right">Saldo (le debes / te debe)</th></tr></thead>
              <tbody>
                {cuentasTecnicos.map((c, i) => (
                  <tr key={i}>
                    <td className="c-name" style={{ fontWeight: 600 }}>{c.nombre}</td>
                    <td className="c-mono c-right" data-label="Liquidado">{fmt(c.liquidado)}</td>
                    <td className="c-mono c-right" data-label="Pagado">{fmt(c.pagado)}</td>
                    <td className="c-mono c-right" data-label="Saldo" style={{ fontWeight: 700, color: c.saldo > 0 ? 'var(--amber-700)' : c.saldo < 0 ? 'var(--green-700)' : 'var(--text-3)' }}>
                      {c.saldo > 0 ? `Te debe ${fmt(c.saldo)}` : c.saldo < 0 ? `Le debes ${fmt(-c.saldo)}` : 'Al día'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
                {historialOrdenado.map(reg => (
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
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{fmtDate(reg.fecha)}</span>
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
                          <span className="badge" style={{ background: 'var(--green-100)', color: 'var(--green-700)', fontWeight: 700 }} title="Gasto ya registrado en Cuentti">✓ Cuentti {reg.cuenttiGasto}</span>
                        ) : (
                          <>
                            <select className="input" aria-label="Método de pago" value={metodoGasto[reg.id] || reg.metodoPago || 'efectivo'} onChange={e => setMetodoGasto(m => ({ ...m, [reg.id]: e.target.value }))} style={{ height: 30, minHeight: 30, fontSize: 12, padding: '2px 8px', width: 'auto' }}>
                              <option value="efectivo">Efectivo</option>
                              <option value="transferencia">Transferencia</option>
                            </select>
                            <Button variant="outline" size="sm" disabled={regCuenttiId === reg.id} onClick={() => pedirRegistrarCuentti(reg)}>
                              {regCuenttiId === reg.id ? 'Registrando…' : (gastoError[reg.id] ? 'Reintentar' : 'Registrar en Cuentti')}
                            </Button>
                          </>
                        )}
                        <Button variant="outline" size="sm" onClick={() => exportPdfHistorial(reg)}>PDF</Button>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: 'right', marginTop: 8 }}>
                  <Button variant="ghost" size="sm" style={{ color: 'var(--red-600)' }} onClick={() => {
                    if (!historial.length) { notify('No hay historial para borrar', 'info'); return }
                    const r = prompt(`Esto borra los ${historial.length} pagos del historial y NO se puede deshacer.\n\nEscribe BORRAR para confirmar:`)
                    if (r && r.trim().toUpperCase() === 'BORRAR') { guardarHistorial([]); notify('Historial de pagos borrado', 'info') }
                  }}>Limpiar historial</Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// ESTADO DE CUENTA — préstamos/abonos por persona (técnicos, admin, terceros)
//   saldo = sum(préstamo +) − sum(abono −).  saldo > 0 = la persona DEBE.
// ============================================================
function EstadoCuenta({ prestamos, tecnicos, notify }) {
  const { movimientos, agregarMovimiento, eliminarMovimiento } = prestamos
  const [form, setForm] = useState({ personaSel: '', personaOtra: '', tipo: 'prestamo', monto: '', fecha: hoyISO(), nota: '', valorDia: '', dias: '' })
  const [sel, setSel] = useState(null)
  const [dlg, setDlg] = useState(null)
  const [verPorDias, setVerPorDias] = useState(false)
  const detailRef = useRef(null)
  // Al elegir una cuenta, traer el panel de detalle a la vista: en desktop está
  // arriba-derecha, lejos de la lista de abajo, y sin esto parecía que "no pasa nada".
  useEffect(() => {
    if (sel && detailRef.current) detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [sel])

  // ── Registrar un pago a Cuentti (mismo motor que los tecnicos: gasto contra la
  //    cuenta Nomina). La marca "ya registrado" es LOCAL (localStorage) por
  //    movimiento. Solo para cuentas que NO son de un tecnico (Nicanor/admin/
  //    terceros con cedula): los tecnicos ya lo registran en la liquidacion.
  const cedulaDeCuenta = (c) => {
    if (!c) return ''
    const nom = (c.persona || '').trim().toLowerCase()
    const p = PERSONAS_CUENTA.find(x => (x.nombre || '').trim().toLowerCase() === nom)
    if (p?.cedula) return String(p.cedula)
    const t = tecnicos.find(x => (x.nombre || '').trim().toLowerCase() === nom)
    return t?.cedula ? String(t.cedula) : ''
  }
  const medioPagoIdsEC = (key) => {
    let metodos = { efectivo: 1, transferencia: 7 }
    try { metodos = { ...metodos, ...JSON.parse(localStorage.getItem('cuentti:metodos_pago') || '{}') } } catch { /* defaults */ }
    let idBancoT = 2
    try { idBancoT = parseInt(localStorage.getItem('cuentti:id_banco')) || 2 } catch { /* default */ }
    return key === 'transferencia'
      ? { idMedioPago: metodos.transferencia ?? 7, idBanco: idBancoT }
      : { idMedioPago: metodos.efectivo ?? 1, idBanco: 1 }
  }
  const GKEY = (id) => `cuentti:gasto:mov:${id}`
  const [gastoDone, setGastoDone] = useState({}) // movId -> doc (G-XXX), hidratado de localStorage
  const [gastoReg, setGastoReg] = useState(null) // movId en curso
  const [gastoErr, setGastoErr] = useState({})   // movId -> true si el ultimo intento fallo
  const [metodoG, setMetodoG] = useState({})     // movId -> 'efectivo' | 'transferencia'
  const gastoRefEC = useRef(new Set())           // anti doble-clic sincrono
  useEffect(() => {
    const done = {}
    try { for (const m of movimientos) { const v = localStorage.getItem(GKEY(m.id)); if (v) done[m.id] = v } } catch { /* ignore */ }
    setGastoDone(done)
  }, [movimientos])

  const registrarGastoEC = async (m, c) => {
    if (gastoDone[m.id]) { notify(`Este pago ya está registrado en Cuentti (${gastoDone[m.id]}).`, 'info'); return }
    if (gastoRefEC.current.has(m.id)) return
    const cedula = cedulaDeCuenta(c)
    if (!cedula) { notify(`Falta la cédula de ${c.persona} para registrar en Cuentti.`, 'error'); return }
    const monto = Math.abs(parseFloat(m.monto) || 0)
    if (!(monto > 0)) { notify('El monto no es positivo; no se registra.', 'error'); return }
    const { idMedioPago, idBanco } = medioPagoIdsEC(metodoG[m.id] || 'efectivo')
    gastoRefEC.current.add(m.id)
    setGastoReg(m.id)
    try {
      const data = await registrarGastoNominaBackend({
        proveedorCedula: cedula,
        proveedorNombre: c.persona,
        monto,
        idMedioPago, idBanco,
        nota: `${c.persona} · ${m.nota || 'Pago'} · ${fmtDate(m.fecha)}`,
      })
      const doc = data.numeroDoc ? `G-${data.numeroDoc}` : (data.idTransacion || 'OK')
      try { localStorage.setItem(GKEY(m.id), doc) } catch { /* ignore */ }
      setGastoDone(g => ({ ...g, [m.id]: doc }))
      setGastoErr(g => { const n = { ...g }; delete n[m.id]; return n })
      notify(`Gasto registrado en Cuentti: ${doc}`, 'success')
    } catch {
      setGastoErr(g => ({ ...g, [m.id]: true }))
      notify('Error de red al registrar. ⚠️ El gasto PUDO quedar en Cuentti — verifícalo antes de reintentar.', 'error')
    } finally {
      gastoRefEC.current.delete(m.id)
      setGastoReg(null)
    }
  }
  const pedirRegistrarGastoEC = (m, c) => {
    if (gastoErr[m.id]) {
      setDlg({
        title: 'Reintentar registro en Cuentti',
        lead: `El intento anterior falló por red, pero el gasto de ${c.persona} PUDO haber quedado en Cuentti. Revisa que NO exista ya (para no pagar doble) antes de continuar.`,
        confirmLabel: 'Ya verifiqué, registrar', tone: 'danger',
        onConfirm: () => registrarGastoEC(m, c),
      })
      return
    }
    registrarGastoEC(m, c)
  }

  // Cálculo "por días": al escribir valor/día y días, llena el monto automático.
  const setDia = (patch) => setForm(f => {
    const nf = { ...f, ...patch }
    const vd = parseFloat(nf.valorDia) || 0
    const d = parseInt(nf.dias) || 0
    if (vd > 0 && d > 0) nf.monto = vd * d
    return nf
  })

  const personaFinal = form.personaSel === '__otra' ? (form.personaOtra || '').trim() : form.personaSel
  const tecnicoIdFinal = useMemo(() => {
    const nom = (personaFinal || '').trim().toLowerCase()
    const t = tecnicos.find(x => (x.nombre || '').trim().toLowerCase() === nom)
    return t ? t.id : null
  }, [personaFinal, tecnicos])

  const cuentas = useMemo(() => {
    // Agrupar por técnico (id) cuando se pueda resolver — mismo criterio que el
    // panel de la liquidación — y por nombre normalizado para terceros. Evita
    // que "pedro " y "Pedro Barraza" partan la misma cuenta en dos.
    const map = {}
    const idByName = {}
    tecnicos.forEach(t => { idByName[(t.nombre || '').trim().toLowerCase()] = t.id })
    const keyFor = (tecnicoId, persona) => {
      const nom = (persona || '').trim().toLowerCase()
      const tid = tecnicoId ?? idByName[nom]
      return tid != null ? `t${tid}` : `p${nom || '—'}`
    }
    tecnicos.filter(t => !t.eliminado).forEach(t => {
      map[`t${t.id}`] = { persona: t.nombre, tecnicoId: t.id, prestado: 0, abonado: 0, movs: [] }
    })
    PERSONAS_CUENTA.forEach(p => {
      const k = keyFor(null, p.nombre)
      if (!map[k]) map[k] = { persona: p.nombre, tecnicoId: null, rol: p.rol, prestado: 0, abonado: 0, movs: [] }
    })
    movimientos.forEach(m => {
      const k = keyFor(m.tecnicoId, m.persona)
      if (!map[k]) map[k] = { persona: (m.persona || '').trim() || '—', tecnicoId: m.tecnicoId ?? null, prestado: 0, abonado: 0, movs: [] }
      map[k].movs.push(m)
      if (m.tipo === 'abono') map[k].abonado += m.monto
      else map[k].prestado += m.monto
    })
    const arr = Object.values(map).map(c => ({ ...c, saldo: c.prestado - c.abonado }))
    arr.forEach(c => c.movs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)))
    return arr.sort((a, b) => b.saldo - a.saldo)
  }, [movimientos, tecnicos])

  const totalPorCobrar = cuentas.reduce((s, c) => s + Math.max(0, c.saldo), 0)
  // Comparación normalizada: la cuenta canónica puede llamarse "Pedro Barraza"
  // aunque el usuario haya escrito "pedro barraza" (el merge agrupa por técnico).
  const mismaPersona = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()
  const cuentaSel = cuentas.find(c => mismaPersona(c.persona, sel)) || null

  // Personas que existen como opción del select (técnicos + personas fijas).
  const opcionesPersona = useMemo(() => new Set([
    ...tecnicos.filter(t => !t.eliminado).map(t => t.nombre),
    ...PERSONAS_CUENTA.map(p => p.nombre),
  ]), [tecnicos])

  // Elegir una cuenta de la lista: la selecciona Y deja el formulario listo para
  // registrarle un movimiento (si es un tercero no listado, cae a "otra persona").
  const elegirCuenta = (persona) => {
    setSel(persona)
    if (opcionesPersona.has(persona)) setForm(f => ({ ...f, personaSel: persona, personaOtra: '' }))
    else setForm(f => ({ ...f, personaSel: '__otra', personaOtra: persona }))
  }

  const guardar = () => {
    if (!personaFinal) { notify('Elige o escribe la persona', 'error'); return }
    const monto = Math.abs(parseFloat(form.monto) || 0)
    if (!monto) { notify('Ingresa el monto', 'error'); return }
    agregarMovimiento({ id: `PR-${uid()}`, persona: personaFinal, tecnicoId: tecnicoIdFinal, tipo: form.tipo, monto, nota: form.nota, fecha: form.fecha })
    notify(`${form.tipo === 'abono' ? 'Abono' : 'Préstamo'} de ${fmt(monto)} · ${personaFinal}`, 'success')
    setForm(f => ({ ...f, monto: '', nota: '', valorDia: '', dias: '' }))
    setSel(personaFinal)
  }

  // Saldar la cuenta: registra el movimiento que deja el saldo en $0.
  // Debe (saldo>0) → un abono; a favor (saldo<0) → un préstamo, por el monto.
  const saldarCuenta = (c) => {
    if (!c || !c.saldo) return
    const tipo = c.saldo > 0 ? 'abono' : 'prestamo'
    const monto = Math.abs(c.saldo)
    setDlg({
      title: `Saldar cuenta · ${c.persona}`,
      lead: `${c.saldo > 0 ? `Debe ${fmt(c.saldo)}` : `A favor ${fmt(monto)}`} → queda en $0`,
      confirmLabel: 'Saldar',
      onConfirm: () => {
        agregarMovimiento({ id: `PR-${uid()}`, persona: c.persona, tecnicoId: c.tecnicoId ?? null, tipo, monto, nota: 'Saldado', fecha: hoyISO() })
        notify(`Cuenta de ${c.persona} saldada`, 'success')
      },
    })
  }

  const exportarPDF = async (c) => {
    const doc = new jsPDF()
    const { MARGIN } = PDF_LAYOUT
    const logoData = await loadLogo()
    drawHeader(doc, {
      logoData, docType: 'ESTADO DE CUENTA', docNumber: (c.persona || '').toUpperCase().slice(0, 22),
      badge: { label: c.saldo > 0 ? 'DEBE' : c.saldo < 0 ? 'A FAVOR' : 'AL DÍA', color: c.saldo > 0 ? 'amber' : 'green' },
      dateRows: [{ lbl: 'Fecha', val: fmtDate(hoyISO()) }],
    })
    let y = 47
    y = drawSectionHeader(doc, 'Persona', y)
    y = drawDataBlock(doc, [
      { label: 'Nombre', value: c.persona, bold: true },
      { label: 'Total prestado', value: fmt(c.prestado) },
      { label: 'Total abonado', value: fmt(c.abonado) },
      { label: 'Saldo actual', value: fmt(c.saldo), bold: true },
    ], y)
    y += 4
    y = drawSectionHeader(doc, 'Movimientos', y)
    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'TIPO', 'NOTA', 'MONTO']],
      body: [...c.movs].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).map(m => [
        fmtDate(m.fecha), m.tipo === 'abono' ? 'Abono' : 'Préstamo', m.nota || '—', (m.tipo === 'abono' ? '- ' : '+ ') + fmt(m.monto),
      ]),
      ...tableStylesItems,
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 26, fontStyle: 'bold' }, 2: { cellWidth: 'auto' }, 3: { halign: 'right', cellWidth: 32, fontStyle: 'bold' } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 6
    drawSignatures(doc, { y: Math.max(y, 240), blocks: [{ label: 'Firma de la persona', sub: 'Nombre, documento, fecha' }, { label: 'Autorizado por', sub: 'Nombre, cargo, fecha' }] })
    drawFooter(doc, { page: 1, total: 1, leftText: 'Estado de cuenta de préstamos · MDA' })
    doc.save(`estado_cuenta_${(c.persona || 'persona').replace(/\s+/g, '_')}_${hoyISO()}.pdf`)
    notify('PDF del estado de cuenta exportado', 'success')
  }

  return (
    <div>
      <ConfirmDialog cfg={dlg} onClose={() => setDlg(null)} />
      <style>{`
        .ec-book{ display:grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap:20px; align-items:start; }
        .ec-aside{ position:sticky; top:12px; }
        .ec-row{ display:flex; align-items:center; gap:12px; width:100%; padding:12px 16px; text-align:left; background:transparent; border:none; border-top:1px solid var(--border); cursor:pointer; transition:background .15s var(--ease-out); }
        .ec-row:first-of-type{ border-top:none; }
        .ec-row:hover{ background:var(--bg-subtle); }
        .ec-row.on{ background:var(--navy-900); }
        .ec-del{ flex-shrink:0; width:30px; height:30px; border-radius:8px; border:1px solid var(--border); background:var(--bg-raised); color:var(--text-4); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; font-size:13px; transition:border-color .12s, color .12s, background .12s; }
        .ec-del:hover{ border-color:var(--red-600); color:var(--red-600); background:rgba(220,38,38,.06); }
        @media (max-width: 820px){ .ec-book{ grid-template-columns:1fr; } .ec-aside{ position:static; } }
      `}</style>

      <div className="ec-book">
      <aside className="ec-aside">
        <div className="card" style={{ boxShadow: 'none', overflow: 'hidden' }}>
          <div className="card__h"><h3 style={{ margin: 0, fontSize: 15 }}>Cuentas</h3><span className="count">Por cobrar {fmt(totalPorCobrar)}</span></div>
          <div style={{ padding: 0 }}>
            {cuentas.map((c, i) => {
              const on = mismaPersona(sel, c.persona)
              return (
                <button key={c.persona} type="button" className={`ec-row${on ? ' on' : ''}`} onClick={() => elegirCuenta(c.persona)}>
                  <span className={`av av-${(i % 5) + 1}`} style={{ width: 34, height: 34, fontSize: 12, flexShrink: 0 }}>
                    {(c.persona || '?').split(' ').map(x => x[0]).slice(0, 2).join('')}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: on ? '#fff' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.persona}</div>
                    {c.rol && <div style={{ fontSize: 11.5, color: on ? '#9fb0d0' : 'var(--text-3)' }}>{c.rol}</div>}
                  </div>
                  <div className="mono" style={{ textAlign: 'right', flexShrink: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                    color: on ? '#fff' : (c.saldo > 0 ? 'var(--amber-700)' : c.saldo < 0 ? 'var(--green-700)' : 'var(--text-4)') }}>
                    {c.saldo > 0 ? fmt(c.saldo) : c.saldo < 0 ? `a favor ${fmt(-c.saldo)}` : '—'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ boxShadow: 'none', order: 2 }}>
          <div className="card__h"><h3 style={{ margin: 0, fontSize: 15 }}>Registrar movimiento{cuentaSel ? <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {cuentaSel.persona}</span> : ''}</h3></div>
          <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="field">
              <label>Persona</label>
              <select className="input" value={form.personaSel} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, personaSel: v })); if (v && v !== '__otra') setSel(v) }}>
                <option value="">Seleccionar…</option>
                {tecnicos.filter(t => !t.eliminado).map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
                {PERSONAS_CUENTA.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre}{p.rol ? ` (${p.rol})` : ''}</option>)}
                <option value="__otra">Otra persona (tercero)…</option>
              </select>
            </div>
            {form.personaSel === '__otra' && (
              <div className="field">
                <label>Nombre de la persona</label>
                <input className="input" value={form.personaOtra} onChange={e => setForm(f => ({ ...f, personaOtra: e.target.value }))} placeholder="Ej. Administrador, proveedor…" />
              </div>
            )}
            <div className="field">
              <label>Tipo de movimiento</label>
              <div className="mov-toggle">
                <button type="button" className={`mov-toggle__btn${form.tipo === 'prestamo' ? ' on prestamo' : ''}`} onClick={() => setForm(f => ({ ...f, tipo: 'prestamo' }))}>
                  <strong>Préstamo</strong><span>sube lo que debe (+)</span>
                </button>
                <button type="button" className={`mov-toggle__btn${form.tipo === 'abono' ? ' on abono' : ''}`} onClick={() => setForm(f => ({ ...f, tipo: 'abono' }))}>
                  <strong>Abono / descuento</strong><span>baja lo que debe (−)</span>
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>Monto</label><MoneyInput value={form.monto} onChange={v => setForm(f => ({ ...f, monto: v, valorDia: '', dias: '' }))} placeholder="0" /></div>
              <div className="field"><label>Fecha</label><input className="input" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
            </div>
            {(verPorDias || (parseFloat(form.valorDia) || 0) > 0 || (parseInt(form.dias) || 0) > 0) ? (
              <div className="field">
                <label>Por días <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>(pagos/cargos diarios)</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <MoneyInput value={form.valorDia} onChange={v => setDia({ valorDia: v })} placeholder="Valor/día" style={{ flex: '1 1 120px', minWidth: 0 }} />
                  <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>×</span>
                  <input className="input" type="number" min="0" value={form.dias} onChange={e => setDia({ dias: e.target.value })} placeholder="Días" style={{ width: 84 }} />
                  {(parseFloat(form.valorDia) || 0) > 0 && (parseInt(form.dias) || 0) > 0 && (
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>= <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt((parseFloat(form.valorDia) || 0) * (parseInt(form.dias) || 0))}</strong></span>
                  )}
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setVerPorDias(true)} style={{ background: 'transparent', border: 0, color: 'var(--primary)', fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', padding: '2px 0', marginBottom: 4 }}>＋ calcular por días</button>
            )}
            <div className="field"><label>Nota</label><input className="input" value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} placeholder="Concepto, referencia…" /></div>
            {(() => {
              const hayMonto = (parseFloat(form.monto) || 0) > 0 || ((parseFloat(form.valorDia) || 0) > 0 && (parseInt(form.dias) || 0) > 0)
              return <Button variant="primary" type="button" onClick={guardar} disabled={!hayMonto} style={{ opacity: hayMonto ? 1 : 0.5, cursor: hayMonto ? 'pointer' : 'not-allowed' }}>Registrar</Button>
            })()}
          </div>
        </div>

        <div className="card" ref={detailRef} style={{ boxShadow: 'none', order: 1 }}>
        {!cuentaSel ? (
          <div className="card__b"><div className="empty"><h4>Selecciona una cuenta</h4><p>Elige una persona de la lista para ver su estado de cuenta.</p></div></div>
        ) : (
          <>
            <div className="card__h" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>{cuentaSel.persona}</h3>
                <span style={{ display: 'block', marginTop: 4, fontSize: 13, fontWeight: 700, color: cuentaSel.saldo > 0 ? 'var(--amber-700)' : cuentaSel.saldo < 0 ? 'var(--green-700)' : 'var(--text-3)' }}>
                  {cuentaSel.saldo > 0 ? `Debe ${fmt(cuentaSel.saldo)}` : cuentaSel.saldo < 0 ? `A favor ${fmt(-cuentaSel.saldo)}` : 'Al día'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                {cuentaSel.saldo !== 0 && <Button variant="primary" size="sm" onClick={() => saldarCuenta(cuentaSel)}>Saldar</Button>}
                <Button variant="outline" size="sm" onClick={() => exportarPDF(cuentaSel)}>PDF</Button>
              </div>
            </div>
            {cuentaSel.movs.length === 0 ? (
              <div className="card__b"><p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Sin movimientos. Registra un préstamo o abono abajo.</p></div>
            ) : (
              <div className="card__b" style={{ paddingTop: 4, paddingBottom: 4 }}>
                {cuentaSel.movs.map((m, i) => {
                  // El boton de Cuentti sale en los ABONOS (pagos) de cuentas que NO son
                  // de un tecnico y que tienen cedula (Nicanor/admin/terceros).
                  const puedeCuentti = m.tipo === 'abono' && !cuentaSel.tecnicoId && !!cedulaDeCuenta(cuentaSel)
                  const doc = gastoDone[m.id]
                  return (
                  <div key={m.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', padding: '10px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <Badge tone={m.tipo === 'abono' ? 'success' : 'warning'}>{m.tipo === 'abono' ? 'Abono' : 'Préstamo'}</Badge>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {m.nota && <div style={{ fontSize: 13.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nota}</div>}
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: m.nota ? 2 : 0 }}>{fmtDate(m.fecha)}</div>
                      </div>
                      <span className="mono" style={{ fontWeight: 700, fontSize: 15.5, whiteSpace: 'nowrap', color: m.tipo === 'abono' ? 'var(--green-700)' : 'var(--amber-700)' }}>
                        {m.tipo === 'abono' ? '− ' : '+ '}{fmt(m.monto)}
                      </span>
                      <button type="button" className="ec-del" aria-label="Eliminar movimiento" title="Eliminar" onClick={() => setDlg({
                        title: 'Eliminar movimiento',
                        lead: `${m.tipo === 'abono' ? 'Abono' : 'Préstamo'} · ${fmt(m.monto)} · ${fmtDate(m.fecha)}`,
                        confirmLabel: 'Sí, eliminar', tone: 'danger',
                        onConfirm: () => eliminarMovimiento(m.id),
                      })}>✕</button>
                    </div>
                    {puedeCuentti && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                        {doc ? (
                          <span className="badge" style={{ background: 'var(--green-100)', color: 'var(--green-700)', fontWeight: 700 }} title="Gasto ya registrado en Cuentti">✓ Registrado en Cuentti · {doc}</span>
                        ) : (
                          <>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Cuentti</span>
                            <div className="tabs" style={{ margin: 0 }}>
                              <button type="button" className={(metodoG[m.id] || 'efectivo') === 'efectivo' ? 'on' : ''} onClick={() => setMetodoG(g => ({ ...g, [m.id]: 'efectivo' }))} style={{ fontSize: 12 }}>Efectivo</button>
                              <button type="button" className={(metodoG[m.id] || 'efectivo') === 'transferencia' ? 'on' : ''} onClick={() => setMetodoG(g => ({ ...g, [m.id]: 'transferencia' }))} style={{ fontSize: 12 }}>Transferencia</button>
                            </div>
                            <Button variant="outline" size="sm" style={{ marginLeft: 'auto' }} disabled={gastoReg === m.id} onClick={() => pedirRegistrarGastoEC(m, cuentaSel)}>
                              {gastoReg === m.id ? 'Registrando…' : (gastoErr[m.id] ? 'Reintentar' : 'Registrar en Cuentti')}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
      </main>
      </div>
    </div>
  )
}
