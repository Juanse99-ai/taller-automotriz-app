import { useState, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO } from '../utils/helpers'
import MoneyInput from '../components/MoneyInput'
import { COMISION, ESTADOS, PERSONAS_CUENTA } from '../utils/constants'
import { lsGet, lsSet } from '../services/storage'
import { useTecnicos } from '../services/tecnicos'
import { usePrestamos } from '../hooks/usePrestamos'
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

// Cargo EFECTIVO que se le descuenta al técnico:
//  - "diario" (gasto del administrador por día): es un costo compartido, el
//    técnico asume solo su parte (COMISION.TOTAL = 40%) y el taller el 60%.
//  - todos los demás (adelanto, préstamo, consumo, descuento): es plata que el
//    técnico debe, se recupera al 100%.
const cargoEfectivo = (m) => {
  const monto = parseFloat(m?.monto) || 0
  return (m?.tipo === 'diario') ? monto * COMISION.TOTAL : monto
}

// Etiqueta visible del tipo de movimiento. El "diario" se MUESTRA como "Aporte"
// (para que el técnico no lo sienta como un cobro), pero internamente sigue
// siendo 'diario' para conservar la regla del 40%.
const TIPO_LABELS = { diario: 'Aporte' }
const tipoLabel = (t) => TIPO_LABELS[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—')

// Iniciales del técnico (2 letras) para la referencia legible.
const iniciales = (nombre) => (nombre || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'XX'

// Referencia visible de una liquidación (para trazar con Cuentti). Los ids nuevos
// son legibles (ej. LQ-PB0702 → "PB0702"); los viejos eran un uid aleatorio largo,
// de esos se muestran los últimos 6. Se le pasa el id del registro.
const liqRef = (id) => {
  let s = (id || '').toString().replace(/^LQ-/i, '')
  if (s.length > 9) s = s.slice(-6)
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
  const toggleDiarioRepTec = (id) => setDiarioRepTec(p => ({ ...p, [id]: !p[id] }))

  // compartidos[id] puede ser true (legacy, sin partner) o { partner: tecId }
  const compInfo = (id) => {
    const c = compartidos[id]
    if (!c) return { es: false, partner: null }
    return { es: true, partner: typeof c === 'object' ? (c.partner || null) : null }
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
      if (liquidados.includes(t.id)) return false
      return true
    }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [trabajos, liquidados])

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
        const mitad = (manoObra * COMISION.TOTAL) / 2
        if (map[tid]) {
          map[tid].trabajos.push(t)
          map[tid].totalMO += manoObra
          map[tid].comision += mitad
        }
        if (partner && partner !== tid && map[partner]) {
          map[partner].trabajos.push(t)
          map[partner].totalMO += manoObra
          map[partner].comision += mitad
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
      facturado += mo
      comisiones += mo * COMISION.TOTAL
      const { es, partner } = compInfo(t.id)
      if (es && !partner) sinPartner++
      const tid = parseInt(t.tecnicoId)
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

  // Totales de la seleccion actual
  const totalSeleccion = useMemo(() => {
    let manoObra = 0, comision = 0
    tecTrabajos.forEach(t => {
      if (!seleccionados[t.id]) return
      const mo = moMap[t.id] || 0
      const { es } = compInfo(t.id)
      manoObra += mo
      comision += es ? (mo * COMISION.TOTAL) / 2 : mo * COMISION.TOTAL
    })
    const cargos = tecMovs.reduce((s, m) => s + (parseFloat(m.monto) || 0), 0)
    // Descuento real al pago: el "diario" se comparte (40%), el resto se descuenta
    // completo. Ver cargoEfectivo(). neto = comisión − cargos efectivos.
    const cargosEfectivos = Math.round(tecMovs.reduce((s, m) => s + cargoEfectivo(m), 0))
    return {
      manoObra: Math.round(manoObra),
      comision: Math.round(comision),
      cargos: Math.round(cargos),
      cargosEfectivos,
      neto: Math.round(comision - cargosEfectivos),
    }
  }, [tecTrabajos, seleccionados, compartidos, tecMovs, moMap])

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
    return TECNICOS.map(t => {
      const pendientes = (porTecnico[t.id]?.trabajos || []).length
      const moTotal = Math.round(porTecnico[t.id]?.totalMO || 0)
      const comisionTotal = Math.round(porTecnico[t.id]?.comision || 0)
      const cargos = Math.round(cargosBy[t.id] || 0)
      const cargosEf = Math.round(cargosEfBy[t.id] || 0)
      return { ...t, pendientes, moTotal, comisionTotal, cargos, cargosEf, neto: comisionTotal - cargosEf }
    }).filter(t => !t.eliminado && (t.activo !== false || t.pendientes > 0))
  }, [porTecnico, TECNICOS, movimientos])

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
  const agregarMovimiento = (e) => {
    e?.preventDefault?.()
    const tid = parseInt(tecnicoSel)
    const monto = Math.abs(parseFloat(movForm.monto) || 0)
    if (!tid) { notify('Selecciona un técnico primero', 'error'); return }
    if (!monto) { notify('Ingresa el monto del movimiento', 'error'); return }
    hookAgregarMov({
      id: `MV-${uid()}`, tecnicoId: tid,
      tipo: movForm.tipo, monto, nota: movForm.nota, fecha: movForm.fecha,
    })
    setMovForm(f => ({ ...f, monto: '', nota: '' }))
    notify('Movimiento registrado', 'success')
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
    const mmdd = String(hoy.getMonth() + 1).padStart(2, '0') + String(hoy.getDate()).padStart(2, '0')
    const base = `LQ-${iniciales(nombre)}${mmdd}`
    let id = base, n = 2
    while (historial.some(h => h.id === id)) id = `${base}-${n++}`
    return id
  }

  const generarPago = () => {
    const ids = Object.keys(seleccionados).filter(id => seleccionados[id])
    if (ids.length === 0) { notify('Selecciona al menos un trabajo para liquidar', 'error'); return }
    if (!tecData) return

    // Neto negativo: la deuda no se borra, se arrastra como saldo anterior
    if (totalSeleccion.neto < 0) {
      const ok = confirm(
        `El neto es negativo (${fmt(totalSeleccion.neto)}): los cargos superan la comisión.\n\n` +
        `La deuda restante (${fmt(Math.abs(totalSeleccion.neto))}) quedará registrada como "saldo anterior" ` +
        `para descontar en la próxima liquidación. ¿Continuar?`
      )
      if (!ok) return
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
      movimientos: tecMovs.map(m => ({ ...m })),
      detalleTrabajo: ids.map(id => {
        const t = trabajos.find(tr => tr.id === id)
        if (!t) return null
        const mo = moMap[t.id] ?? getManoObra(t)
        const { es } = compInfo(t.id)
        return { id: t.id, placa: t.placa, cliente: t.cliente, fecha: t.fecha, manoObra: mo, compartido: es }
      }).filter(Boolean),
    }

    agregarHistorial(registro)
    guardarLiquidados([...liquidados, ...ids])

    // Consumir movimientos del tecnico: borrado real (estado + Supabase).
    // Antes solo se filtraba el estado local y el sync de Supabase los
    // resucitaba: el adelanto se descontaba DOBLE en la siguiente liquidacion.
    tecMovs.forEach(m => hookEliminarMov(m.id))

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

    setSeleccionados({}); setPagoReal(''); setDiffDestino('debo')
    const difMsg = pagado !== netoCalc ? ` (pagado ${fmt(pagado)}, diferencia a Estado de cuenta)` : ''
    notify(`Pago #${liqRef(nuevoId)} generado: ${fmt(pagado)} para ${tecData.tecnico.nombre}${difMsg} · copia la ref en Cuentti`, 'success')
    // Descargar automáticamente el comprobante del pago recién generado
    exportPdfHistorial(registro).catch(() => {})
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
      head: [['FECHA', 'PLACA', 'CLIENTE', 'COMP.', 'M.O.', 'COMISIÓN']],
      body: rows,
      ...tableStylesItems,
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 6

    if (tecMovs.length > 0) {
      y = drawSectionHeader(doc, 'Aportes y descuentos', y)
      autoTable(doc, {
        startY: y,
        head: [['FECHA', 'TIPO', 'NOTA', 'MONTO']],
        body: tecMovs.map(m => [fmtDate(m.fecha), tipoLabel(m.tipo), m.nota || '—', fmt(m.monto)]),
        ...tableStylesMuted,
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 28, fontStyle: 'bold' },
          2: { cellWidth: 'auto' },
          3: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        },
        margin: { left: MARGIN, right: MARGIN },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    // Presentación: comisión de los trabajos menos los cargos efectivos = neto.
    const rowsSel = [
      { lbl: 'M.O. (sin IVA)', val: fmt(totalSeleccion.manoObra) },
      { lbl: `Comisión (${COMISION.TOTAL * 100}%)`, val: fmt(totalSeleccion.comision) },
    ]
    if ((totalSeleccion.cargosEfectivos || 0) > 0) {
      rowsSel.push({ lbl: 'Aportes / descuentos', val: `- ${fmt(totalSeleccion.cargosEfectivos)}` })
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
      head: [['FECHA', 'PLACA', 'CLIENTE', 'COMP.', 'M.O.', 'COMISIÓN']],
      body: detRows,
      ...tableStylesItems,
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 6

    if (reg.movimientos && reg.movimientos.length > 0) {
      y = drawSectionHeader(doc, 'Aportes y descuentos', y)
      autoTable(doc, {
        startY: y,
        head: [['FECHA', 'TIPO', 'NOTA', 'MONTO']],
        body: reg.movimientos.map(m => [fmtDate(m.fecha), tipoLabel(m.tipo), m.nota || '—', fmt(m.monto)]),
        ...tableStylesMuted,
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 28, fontStyle: 'bold' },
          2: { cellWidth: 'auto' },
          3: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
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
        { lbl: 'M.O. (sin IVA)', val: fmt(reg.manoObra || 0) },
        { lbl: `Comisión (${COMISION.TOTAL * 100}%)`, val: fmt(reg.comision || 0) },
      ]
      if ((reg.cargosEfectivos || 0) > 0) {
        rowsReg.push({ lbl: 'Aportes / descuentos', val: `- ${fmt(reg.cargosEfectivos || 0)}` })
      }
    } else {
      rowsReg = [
        { lbl: 'Mano de obra (sin IVA)', val: fmt(reg.manoObra || 0) },
        { lbl: `Comisión (${COMISION.TOTAL * 100}%)`, val: fmt(reg.comision || 0) },
        { lbl: 'Aportes / descuentos', val: `- ${fmt(reg.cargos || 0)}` },
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
      finalLabel: tienePago ? 'Pagado en efectivo' : (esNuevoPago ? 'Neto a pagar' : 'NETO PAGADO'),
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
    if (!confirm(`¿Desliquidar este trabajo?\n${etiqueta}\n\nVolverá a aparecer como pendiente por liquidar.`)) return
    guardarLiquidados(liquidados.filter(x => x !== id))
    notify('Trabajo desliquidado', 'info')
  }

  // Trabajos liquidados (ocultos) que aún existen en la lista, para mostrarlos uno a uno.
  const trabajosLiquidados = useMemo(() => {
    const set = new Set(liquidados)
    return trabajos.filter(t => set.has(t.id))
  }, [trabajos, liquidados])

  // ===== Tabs: Comisiones | Estado de cuenta =====
  const tabsLiq = (
    <div className="tabs" style={{ marginBottom: 14 }}>
      <button className={vistaLiq === 'comisiones' ? 'on' : ''} onClick={() => setVistaLiq('comisiones')}>Comisiones</button>
      <button className={vistaLiq === 'cuentas' ? 'on' : ''} onClick={() => setVistaLiq('cuentas')}>Estado de cuenta</button>
    </div>
  )

  if (vistaLiq === 'cuentas') {
    return (
      <div>
        <div className="pagehd">
          <div>
            <h2>Estado de cuenta · préstamos</h2>
            <p className="sub">Préstamos y abonos por persona — técnicos, administrador, terceros</p>
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
      <div className="pagehd">
        <div>
          <h2>Liquidación de comisiones</h2>
          <p className="sub">Cierre de periodo · {COMISION.TOTAL * 100}% comisión total · {COMISION.TOTAL * 50}% c/u si el trabajo es compartido</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar historial' : 'Ver historial'}</button>
        </div>
      </div>
      {tabsLiq}

      {/* Resumen del cierre — encabezado denso; lo accionable (Total a pagar) manda */}
      <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Total a pagar este cierre</div>
          <div className="mono" style={{ fontWeight: 800, fontSize: 34, letterSpacing: '-.8px', lineHeight: 1.05, color: 'var(--green-700)', marginTop: 4 }}>
            {fmt(totalNomina)}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 5 }}>
            {resumenTecnicos.filter(t => t.pendientes > 0).length} técnico{resumenTecnicos.filter(t => t.pendientes > 0).length !== 1 ? 's' : ''} · {trabajosPendientes.length} OT{trabajosPendientes.length !== 1 ? 's' : ''} pendiente{trabajosPendientes.length !== 1 ? 's' : ''}
            {kpis.sinTecnico > 0 && <span style={{ color: 'var(--red-600)' }}> · {kpis.sinTecnico} sin técnico</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {[['Comisiones', fmt(kpis.comisiones)], ['M.O. facturada', fmt(kpis.facturado)], ['Utilidad taller', fmt(kpis.utilidad)]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{l}</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-2)', marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
        {kpis.sinPartner > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--amber-700)', background: 'var(--amber-100)', padding: '5px 11px', borderRadius: 8, flexShrink: 0 }}>
            {kpis.sinPartner} compartido{kpis.sinPartner !== 1 ? 's' : ''} sin compañero
          </span>
        )}
      </div>

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
          const disabled = t.pendientes === 0
          return (
            <button
              key={t.id}
              onClick={() => { setTecnicoSel(activo ? '' : String(t.id)); setSeleccionados({}); setColapso({ trabajos: false, movs: false }) }}
              disabled={disabled}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                padding: '15px 18px', textAlign: 'left',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                background: activo ? 'var(--bg-subtle)' : 'transparent',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? .55 : 1,
                transition: 'background .15s var(--ease-out)',
              }}
            >
              <span className={`av av-${(i % 5) + 1}`} style={{ width: 38, height: 38, fontSize: 13, flexShrink: 0 }}>
                {t.nombre.split(' ').map(x => x[0]).slice(0, 2).join('')}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.nombre}
                  {t.activo === false && <span className="badge badge-n">Inactivo</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {t.pendientes} OT{t.pendientes !== 1 ? 's' : ''} pendiente{t.pendientes !== 1 ? 's' : ''}
                  {t.especialidad ? ` · ${t.especialidad}` : ''}{t.activo === false ? ' · cierre de cuentas' : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: t.neto > 0 ? 'var(--green-700)' : 'var(--text-3)', lineHeight: 1.1 }}>{fmt(t.neto)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  Comisión {fmt(t.comisionTotal)}{t.cargosEf > 0 ? ` − ${fmt(t.cargosEf)}` : ''}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, transform: activo ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--ease-out)', opacity: disabled ? 0 : 1 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )
        })}
      </div>

      {liquidados.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setVerLiquidados(v => !v)}
            style={{ fontSize: 12, padding: '4px 10px', color: 'var(--text-3)' }}
          >
            {verLiquidados ? '▾' : '▸'} {liquidados.length} trabajos ya liquidados (ocultos)
          </button>
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
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => desliquidarUno(t.id, t)}
                    style={{ color: 'var(--amber-600)', fontSize: 11.5, padding: '2px 8px', flexShrink: 0 }}
                  >
                    Desliquidar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tecData && (
        <>
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
                  <button className="btn btn-outline btn-sm" onClick={() => seleccionarTodos(tecTrabajos.map(t => t.id))}>
                    {tecTrabajos.length > 0 && tecTrabajos.every(t => seleccionados[t.id]) ? 'Deseleccionar' : 'Todos'}
                  </button>
                )}
              </div>
            </div>
            {!colapso.trabajos && (
            <div className="card__b card__b--flush">
              {tecTrabajos.length === 0 ? (
                <div className="empty"><h4>Sin pendientes</h4><p>No hay trabajos pendientes de liquidar.</p></div>
              ) : (
                <table className="tbl">
                  <thead><tr><th style={{ width: 40 }}></th><th>Fecha</th><th>OT</th><th>Placa</th><th>Cliente</th><th style={{ textAlign: 'center' }}>Compartido</th><th className="c-right">M.O.</th><th className="c-right">Comisión</th></tr></thead>
                  <tbody>
                    {tecTrabajos.map(t => {
                      const mano = moMap[t.id] || 0
                      const { es: esComp, partner } = compInfo(t.id)
                      const com = esComp ? (mano * COMISION.TOTAL) / 2 : mano * COMISION.TOTAL
                      const selected = !!seleccionados[t.id]
                      const tidAsignado = parseInt(t.tecnicoId)
                      return (
                        <tr key={t.id} style={{ background: selected ? 'rgba(22,163,74,.06)' : undefined, cursor: 'pointer' }} onClick={() => toggleSeleccion(t.id)}>
                          <td style={{ textAlign: 'center' }}><input type="checkbox" checked={selected} onChange={() => {}} aria-label="Seleccionar trabajo"/></td>
                          <td className="c-muted">{fmtDate(t.fecha)}</td>
                          <td className="c-mono" style={{ color: 'var(--blue-600)', fontWeight: 700 }}>{t.otCodigo || t.id}</td>
                          <td className="c-mono" style={{ fontWeight: 700 }}>{t.placa}</td>
                          <td className="c-name">{t.cliente || '—'}</td>
                          <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={esComp} onChange={() => toggleCompartido(t.id)} aria-label="Trabajo compartido"/>
                            {esComp && (
                              <select
                                className="input"
                                value={partner || ''}
                                onChange={e => setCompartidoPartner(t.id, e.target.value)}
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
                          <td className="c-mono c-right" style={mano === 0 ? { color: 'var(--red-600)', fontWeight: 700 } : undefined}>
                            {fmt(mano)}
                            {mano === 0 && <span style={{ display: 'block', fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>sin servicios</span>}
                          </td>
                          <td className="c-mono c-right" style={{ color: 'var(--green-600)', fontWeight: 600 }}>
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
              {/* DIARIO: gasto del admin por día. Modo "solo este técnico" o "repartir" entre varios. */}
              <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-700)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Diario · gasto del administrador</span>
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
                      <button type="button" className="btn btn-outline" onClick={agregarDiario}>Agregar diario</button>
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
                    <button type="button" className="btn btn-outline" onClick={repartirDiario}>Repartir diario</button>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Registrar adelanto o cargo</div>
              <form onSubmit={agregarMovimiento} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr auto', gap: 12, marginBottom: 16 }}>
                <div className="field"><label>Tipo</label><select className="input" value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}><option value="adelanto">Adelanto</option><option value="prestamo">Préstamo</option><option value="consumo">Consumo</option><option value="descuento">Descuento</option></select></div>
                <div className="field"><label>Monto</label><MoneyInput value={movForm.monto} onChange={v => setMovForm(f => ({ ...f, monto: v }))} placeholder="0" /></div>
                <div className="field"><label>Fecha</label><input className="input" type="date" value={movForm.fecha} onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))}/></div>
                <div className="field"><label>Nota</label><input className="input" value={movForm.nota} onChange={e => setMovForm(f => ({ ...f, nota: e.target.value }))} placeholder="Almuerzo, anticipo..."/></div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}><button type="submit" className="btn btn-outline">Agregar</button></div>
              </form>
              {tecMovs.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Sin movimientos registrados.</p>
              ) : (
                <>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Movimientos · {tecMovs.length}</div>
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Nota</th><th className="c-right">Monto</th><th></th></tr></thead>
                  <tbody>
                    {tecMovs.map(m => (
                      <tr key={m.id}>
                        <td className="c-muted">{fmtDate(m.fecha)}</td>
                        <td>{tipoLabel(m.tipo)}</td>
                        <td className="c-muted">{m.nota || '—'}</td>
                        <td className="c-mono c-right" style={{ color: 'var(--amber-600)' }}>{fmt(m.monto)}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => hookEliminarMov(m.id)} aria-label="Eliminar movimiento">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
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
                <div className="kpi-bh" style={{ marginBottom: 16 }}>
                  {[[cantSeleccionados, 'Trabajos'], [fmt(totalSeleccion.manoObra), 'M.O. (sin IVA)'], [fmt(totalSeleccion.comision), 'Comisión', 'var(--green-700)'], [`− ${fmt(totalSeleccion.cargosEfectivos)}`, 'Aportes / descuentos', 'var(--amber-600)'], [fmt(totalSeleccion.neto), 'Neto a pagar', totalSeleccion.neto >= 0 ? 'var(--green-700)' : 'var(--red-700)']].map(([v, l, c], i) => (
                    <div key={i} className="kpi-bh__s">
                      <div className="kpi-bh__l">{l}</div>
                      <div className="kpi-bh__row"><span className="kpi-bh__v" style={{ fontSize: 20, color: c || 'var(--text)' }}>{v}</span></div>
                    </div>
                  ))}
                </div>
                {totalSeleccion.cargos > 0 && (
                  <div style={{ padding: '9px 13px', background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 9, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14 }}>
                    {totalSeleccion.cargos !== totalSeleccion.cargosEfectivos ? (
                      <>Cargos <strong>{fmt(totalSeleccion.cargos)}</strong> — descuento real <strong>{fmt(totalSeleccion.cargosEfectivos)}</strong> (adelantos/préstamos completos; el diario solo al {COMISION.TOTAL * 100}%, el taller asume el resto). Neto = comisión − {fmt(totalSeleccion.cargosEfectivos)}.</>
                    ) : (
                      <>Cargos <strong>{fmt(totalSeleccion.cargosEfectivos)}</strong> (adelantos/préstamos se descuentan completos). Neto = comisión − {fmt(totalSeleccion.cargosEfectivos)}.</>
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
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                      <div className="field" style={{ flex: '0 0 190px' }}>
                        <label>Pagado en efectivo</label>
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
                          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>Diferencia de <strong className="mono" style={{ color: 'var(--amber-700)' }}>{fmt(diffNum)}</strong> — ¿qué hago con ella?</div>
                          <div className="tabs" style={{ margin: 0 }}>
                            <button type="button" className={diffDestino === 'debo' ? 'on' : ''} onClick={() => setDiffDestino('debo')} style={{ fontSize: 12.5 }}>Se lo quedo debiendo</button>
                            <button type="button" className={diffDestino === 'prestamo' ? 'on' : ''} onClick={() => setDiffDestino('prestamo')} style={{ fontSize: 12.5 }}>Abona a su préstamo</button>
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
                  <button className="btn btn-outline" onClick={exportPdfPago}>Exportar PDF</button>
                  <button className="btn btn-primary" onClick={generarPago}>Generar pago</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__h">
          <h3>Cuentas por técnico</h3>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Liquidado · Pagado · Saldo</span>
        </div>
        <div className="card__b card__b--flush">
          {cuentasTecnicos.length === 0 ? (
            <div className="empty"><h4>Sin datos</h4><p>Aún no hay liquidaciones ni saldos que mostrar.</p></div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Técnico</th><th className="c-right">Liquidado</th><th className="c-right">Pagado</th><th className="c-right">Saldo (le debes / te debe)</th></tr></thead>
              <tbody>
                {cuentasTecnicos.map((c, i) => (
                  <tr key={i}>
                    <td className="c-name" style={{ fontWeight: 600 }}>{c.nombre}</td>
                    <td className="c-mono c-right">{fmt(c.liquidado)}</td>
                    <td className="c-mono c-right">{fmt(c.pagado)}</td>
                    <td className="c-mono c-right" style={{ fontWeight: 700, color: c.saldo > 0 ? 'var(--amber-700)' : c.saldo < 0 ? 'var(--green-700)' : 'var(--text-3)' }}>
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
            <button className="btn btn-outline btn-sm" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar' : 'Ver'}</button>
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
                        <span className="badge badge-i" style={{ marginLeft: 8 }}>{reg.tecnico}</span>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{fmtDate(reg.fecha)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 13.5 }}><strong>{reg.cantidadTrabajos}</strong> trabajos</span>
                      <span style={{ fontSize: 13.5 }}>M.O.: <strong className="mono">{fmt(reg.manoObra || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: 'var(--green-600)' }}>Comisión: <strong className="mono">{fmt(reg.comision || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: 'var(--amber-600)' }}>Cargos: <strong className="mono">{fmt(reg.cargos || 0)}</strong></span>
                      <span style={{ fontSize: 13.5, color: reg.neto >= 0 ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 700 }}>Neto: <strong className="mono">{fmt(reg.neto || 0)}</strong></span>
                      <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportPdfHistorial(reg)}>PDF</button>
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: 'right', marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-600)' }} onClick={() => {
                    if (!historial.length) { notify('No hay historial para borrar', 'info'); return }
                    const r = prompt(`Esto borra los ${historial.length} pagos del historial y NO se puede deshacer.\n\nEscribe BORRAR para confirmar:`)
                    if (r && r.trim().toUpperCase() === 'BORRAR') { guardarHistorial([]); notify('Historial de pagos borrado', 'info') }
                  }}>Limpiar historial</button>
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
    const t = tecnicos.find(x => x.nombre === personaFinal)
    return t ? t.id : null
  }, [personaFinal, tecnicos])

  const cuentas = useMemo(() => {
    const map = {}
    tecnicos.filter(t => !t.eliminado).forEach(t => {
      map[t.nombre] = { persona: t.nombre, tecnicoId: t.id, prestado: 0, abonado: 0, movs: [] }
    })
    PERSONAS_CUENTA.forEach(p => {
      if (!map[p.nombre]) map[p.nombre] = { persona: p.nombre, tecnicoId: null, rol: p.rol, prestado: 0, abonado: 0, movs: [] }
    })
    movimientos.forEach(m => {
      const k = m.persona || '—'
      if (!map[k]) map[k] = { persona: k, tecnicoId: m.tecnicoId, prestado: 0, abonado: 0, movs: [] }
      map[k].movs.push(m)
      if (m.tipo === 'abono') map[k].abonado += m.monto
      else map[k].prestado += m.monto
    })
    const arr = Object.values(map).map(c => ({ ...c, saldo: c.prestado - c.abonado }))
    arr.forEach(c => c.movs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)))
    return arr.sort((a, b) => b.saldo - a.saldo)
  }, [movimientos, tecnicos])

  const totalPorCobrar = cuentas.reduce((s, c) => s + Math.max(0, c.saldo), 0)
  const cuentaSel = cuentas.find(c => c.persona === sel) || null

  const guardar = () => {
    if (!personaFinal) { notify('Elige o escribe la persona', 'error'); return }
    const monto = Math.abs(parseFloat(form.monto) || 0)
    if (!monto) { notify('Ingresa el monto', 'error'); return }
    agregarMovimiento({ id: `PR-${uid()}`, persona: personaFinal, tecnicoId: tecnicoIdFinal, tipo: form.tipo, monto, nota: form.nota, fecha: form.fecha })
    notify(`${form.tipo === 'abono' ? 'Abono' : 'Préstamo'} de ${fmt(monto)} · ${personaFinal}`, 'success')
    setForm(f => ({ ...f, monto: '', nota: '', valorDia: '', dias: '' }))
    setSel(personaFinal)
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div className="card__h"><h3>Registrar movimiento</h3></div>
          <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="field">
              <label>Persona</label>
              <select className="input" value={form.personaSel} onChange={e => setForm(f => ({ ...f, personaSel: e.target.value }))}>
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
            <div className="field">
              <label>O por días <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>(pagos/cargos diarios · opcional)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <MoneyInput value={form.valorDia} onChange={v => setDia({ valorDia: v })} placeholder="Valor/día" style={{ flex: '1 1 120px', minWidth: 0 }} />
                <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>×</span>
                <input className="input" type="number" min="0" value={form.dias} onChange={e => setDia({ dias: e.target.value })} placeholder="Días" style={{ width: 84 }} />
                {(parseFloat(form.valorDia) || 0) > 0 && (parseInt(form.dias) || 0) > 0 && (
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>= <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt((parseFloat(form.valorDia) || 0) * (parseInt(form.dias) || 0))}</strong></span>
                )}
              </div>
            </div>
            <div className="field"><label>Nota</label><input className="input" value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} placeholder="Concepto, referencia…" /></div>
            <button type="button" className="btn btn-primary" onClick={guardar}>Registrar</button>
          </div>
        </div>

        <div className="card">
          <div className="card__h"><h3>Cuentas</h3><span className="count">Por cobrar: {fmt(totalPorCobrar)}</span></div>
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead><tr><th>Persona</th><th className="text-right">Saldo</th></tr></thead>
              <tbody>
                {cuentas.map(c => (
                  <tr key={c.persona} onClick={() => setSel(c.persona)} style={{ cursor: 'pointer', background: sel === c.persona ? 'var(--bg-subtle)' : undefined }}>
                    <td className="c-name" style={{ fontWeight: 600 }}>{c.persona}</td>
                    <td className="text-right text-mono" data-label="Saldo" style={{ fontWeight: 700, color: c.saldo > 0 ? 'var(--amber-700)' : c.saldo < 0 ? 'var(--green-700)' : 'var(--text-3)' }}>
                      {c.saldo > 0 ? fmt(c.saldo) : c.saldo < 0 ? `a favor ${fmt(-c.saldo)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        {!cuentaSel ? (
          <div className="card__b"><div className="empty"><h4>Selecciona una cuenta</h4><p>Elige una persona de la lista para ver su estado de cuenta.</p></div></div>
        ) : (
          <>
            <div className="card__h" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0 }}>{cuentaSel.persona}</h3>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: cuentaSel.saldo > 0 ? 'var(--amber-700)' : 'var(--green-700)' }}>
                  {cuentaSel.saldo > 0 ? `Debe ${fmt(cuentaSel.saldo)}` : cuentaSel.saldo < 0 ? `A favor ${fmt(-cuentaSel.saldo)}` : 'Al día'}
                </span>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => exportarPDF(cuentaSel)}>PDF</button>
            </div>
            {cuentaSel.movs.length === 0 ? (
              <div className="card__b"><p className="text-sm text-muted">Sin movimientos. Registra un préstamo o abono.</p></div>
            ) : (
              <div className="card__b card__b--flush">
                <table className="tbl tbl-cards">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Nota</th><th className="text-right">Monto</th><th></th></tr></thead>
                  <tbody>
                    {cuentaSel.movs.map(m => (
                      <tr key={m.id}>
                        <td className="text-sm text-muted" data-label="Fecha">{fmtDate(m.fecha)}</td>
                        <td data-label="Tipo"><span className={`badge ${m.tipo === 'abono' ? 'badge-success' : 'badge-warning'}`}>{m.tipo === 'abono' ? 'Abono' : 'Préstamo'}</span></td>
                        <td className="text-sm" data-label="Nota">{m.nota || '—'}</td>
                        <td className="text-right text-mono" data-label="Monto" style={{ fontWeight: 700, color: m.tipo === 'abono' ? 'var(--green-700)' : 'var(--amber-700)' }}>{m.tipo === 'abono' ? '−' : '+'} {fmt(m.monto)}</td>
                        <td className="td-actions"><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-600)' }} onClick={() => { if (confirm('¿Eliminar este movimiento?')) eliminarMovimiento(m.id) }} aria-label="Eliminar">✕ Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
