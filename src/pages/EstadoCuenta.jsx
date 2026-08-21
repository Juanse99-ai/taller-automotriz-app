// ============================================================
// ESTADO DE CUENTA — préstamos/abonos por persona (técnicos, admin, terceros)
//   saldo = sum(préstamo +) − sum(abono −).  saldo > 0 = la persona DEBE.
//
// Vivía dentro de Liquidacion.jsx, que pasaba de 2.200 líneas: editar ahí era
// arriesgado (es la pantalla de la plata). Es autónomo — solo recibe props.
// ============================================================
import { useState, useEffect, useRef, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, uid, hoyISO } from '../utils/helpers'
import MoneyInput from '../components/MoneyInput'
import { PERSONAS_CUENTA } from '../utils/constants'
import { registrarGastoNominaBackend } from '../services/cuentti'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, Badge, IconX } from '../components/ui'
import { loadLogo, drawHeader, drawSectionHeader, drawDataBlock, drawSignatures, drawFooter, tableStylesItems, PDF_LAYOUT } from '../utils/pdfTheme'

export default function EstadoCuenta({ prestamos, tecnicos, notify, tabs = null, resumen = null }) {
  const { movimientos, agregarMovimiento, eliminarMovimiento } = prestamos
  const [form, setForm] = useState({ personaSel: '', personaOtra: '', tipo: 'prestamo', monto: '', fecha: hoyISO(), nota: '', valorDia: '', dias: '' })
  const [sel, setSel] = useState(null)
  const [dlg, setDlg] = useState(null)
  const [verPorDias, setVerPorDias] = useState(false)
  // Tercer momento del movil: la captura como hoja aparte. En escritorio no
  // se usa — ahi la fila de registro vive dentro de la tarjeta de la cuenta.
  const [hoja, setHoja] = useState(false)
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
        idemKey: m.id, // idempotencia por movimiento
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
  // Cortes de la cabecera: cuantas cuentas hay abiertas, cuantas a favor y
  // cuantas al dia. Salen de la misma lista, no cuestan una consulta.
  const cortes = useMemo(() => ({
    abiertas: cuentas.filter(c => c.saldo > 0).length,
    aFavor: cuentas.filter(c => c.saldo < 0).length,
    alDia: cuentas.filter(c => c.saldo === 0 && c.movs.length > 0).length,
  }), [cuentas])
  // Saldo corrido por movimiento. NO es un dato nuevo: se calcula sumando de lo
  // mas viejo a lo mas nuevo. Sin el no se puede auditar la cuenta hacia atras.
  const conSaldo = (movs) => {
    let acc = 0
    const viejoPrimero = [...movs].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    const saldos = viejoPrimero.map(m => {
      acc += m.tipo === 'abono' ? -m.monto : m.monto
      return { id: m.id, saldo: acc }
    })
    const porId = Object.fromEntries(saldos.map(x => [x.id, x.saldo]))
    return movs.map(m => ({ ...m, saldoCorrido: porId[m.id] ?? 0 }))
  }
  // Dias del prestamo mas viejo sin saldar: es el numero que dice si hay que
  // insistir. Solo aplica cuando la cuenta debe.
  const diasMasAntiguo = (c) => {
    if (!c || c.saldo <= 0) return 0
    const prestamos = c.movs.filter(m => m.tipo !== 'abono' && m.fecha)
    if (!prestamos.length) return 0
    const viejo = prestamos.reduce((a, b) => (new Date(a.fecha) < new Date(b.fecha) ? a : b))
    return Math.max(0, Math.floor((Date.now() - new Date(viejo.fecha).getTime()) / 86400000))
  }
  const abiertaDesde = (c) => {
    if (!c || !c.movs.length) return ''
    const viejo = c.movs.reduce((a, b) => (new Date(a.fecha) < new Date(b.fecha) ? a : b))
    return viejo.fecha ? fmtDate(viejo.fecha) : ''
  }
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
    drawSignatures(doc, { y: Math.min(Math.max(y, 240), PDF_LAYOUT.PAGE_H - 25), blocks: [{ label: 'Firma de la persona', sub: 'Nombre, documento, fecha' }, { label: 'Autorizado por', sub: 'Nombre, cargo, fecha' }] })
    drawFooter(doc, { page: 1, total: 1, leftText: 'Estado de cuenta de préstamos · MDA' })
    doc.save(`estado_cuenta_${(c.persona || 'persona').replace(/\s+/g, '_')}_${hoyISO()}.pdf`)
    notify('PDF del estado de cuenta exportado', 'success')
  }

  const movsSel = cuentaSel ? conSaldo(cuentaSel.movs) : []
  const dias = diasMasAntiguo(cuentaSel)

  // Abonos elegibles que aun no se registraron como gasto en Cuentti.
  const sinCuentti = movsSel.filter(m => m.tipo === 'abono' && !cuentaSel?.tecnicoId && !!cedulaDeCuenta(cuentaSel) && !gastoDone[m.id]).length
  const esHoy = form.fecha === hoyISO()
  const personaEnUso = form.personaSel === '__otra' ? form.personaOtra : form.personaSel
  const iniciales = (n) => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('')
  const idxAv = Math.max(0, cuentas.findIndex(c => mismaPersona(c.persona, personaEnUso)))

  // La fila de captura: vive dentro de la tarjeta de la cuenta y arrastra la
  // persona elegida, asi que registrar no obliga a bajar la vista ni a repetir
  // de quien es la plata.
  const filaRegistro = (
    <>
      <div className="ec-cta__form">
        <div className="ec-cta__c ec-cta__c--tipo">
          <div className="ec-cta__l">TIPO</div>
          <div className="hd-seg">
            <button type="button" className={`hd-seg__i${form.tipo === 'prestamo' ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, tipo: 'prestamo' }))}>Préstamo</button>
            <button type="button" className={`hd-seg__i${form.tipo === 'abono' ? ' on ec-seg--abono' : ''}`} onClick={() => setForm(f => ({ ...f, tipo: 'abono' }))}>Abono</button>
          </div>
        </div>
        <div className="ec-cta__c ec-cta__c--persona">
          <div className="ec-cta__l">PERSONA</div>
          <div className="ec-cta__pers">
            {personaEnUso && <span className={`av av-${(idxAv % 5) + 1} ec-cta__av`}>{iniciales(personaEnUso)}</span>}
            <select className="hd-drop" value={form.personaSel} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, personaSel: v })); if (v && v !== '__otra') setSel(v) }}>
              <option value="">Seleccionar…</option>
              {tecnicos.filter(t => !t.eliminado).map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
              {PERSONAS_CUENTA.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre}{p.rol ? ` (${p.rol})` : ''}</option>)}
              <option value="__otra">Otra persona (tercero)…</option>
            </select>
          </div>
        </div>
        {form.personaSel === '__otra' && (
          <div className="ec-cta__c ec-cta__c--persona">
            <div className="ec-cta__l">NOMBRE</div>
            <input className="hd-drop" value={form.personaOtra} onChange={e => setForm(f => ({ ...f, personaOtra: e.target.value }))} placeholder="Ej. proveedor, tercero…" />
          </div>
        )}
        <div className="ec-cta__c ec-cta__c--monto">
          <div className="ec-cta__l">MONTO <span className="req">*</span></div>
          <MoneyInput value={form.monto} onChange={v => setForm(f => ({ ...f, monto: v, valorDia: '', dias: '' }))} placeholder="0" className="ec-monto" />
        </div>
        <div className="ec-cta__c ec-cta__c--fecha">
          <div className="ec-cta__l">FECHA</div>
          <div className="ec-cta__fecha">
            <input className="hd-drop" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            {esHoy && <span className="ec-hoy">HOY</span>}
          </div>
        </div>
        {(() => {
          const monto = (parseFloat(form.monto) || 0) > 0 ? Math.round(parseFloat(form.monto)) : ((parseFloat(form.valorDia) || 0) * (parseInt(form.dias) || 0))
          return (
            <Button variant="primary" type="button" onClick={guardar} disabled={monto <= 0} className="ec-cta__go">
              {monto > 0 ? `Registrar ${form.tipo === 'abono' ? 'abono' : 'préstamo'} de ${fmt(monto)}` : 'Registrar'}
            </Button>
          )
        })()}
      </div>

      {/* Nota y la calculadora comparten renglon: la nota se llena una de cada
          veinte veces y le estaba quitando ancho a PERSONA. */}
      <div className="ec-cta__pie">
        <span className="ec-cta__l">NOTA</span>
        <input className="hd-drop ec-cta__nota" value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} placeholder="opcional" />
        {(verPorDias || (parseFloat(form.valorDia) || 0) > 0 || (parseInt(form.dias) || 0) > 0) ? (
          <div className="ec-dias">
            <span className="ec-cta__l">POR DÍAS</span>
            <MoneyInput value={form.valorDia} onChange={v => setDia({ valorDia: v })} placeholder="Valor/día" style={{ width: 116 }} />
            <span className="ec-dias__x">×</span>
            <input className="hd-drop" type="number" min="0" value={form.dias} onChange={e => setDia({ dias: e.target.value })} placeholder="Días" style={{ width: 78 }} />
            {(parseFloat(form.valorDia) || 0) > 0 && (parseInt(form.dias) || 0) > 0 && (
              <span className="ec-dias__eq">= <b>{fmt((parseFloat(form.valorDia) || 0) * (parseInt(form.dias) || 0))}</b></span>
            )}
          </div>
        ) : (
          <button type="button" className="ec-dias__abrir" onClick={() => setVerPorDias(true)}>
            <span className="ec-dias__chev">›</span> Calcular por días
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className="ec">
      <ConfirmDialog cfg={dlg} onClose={() => setDlg(null)} />

      <div className="hd-head ec-head">
        <div className="hd-head__t">
          <h1>Liquidación</h1>
          <div className="hd-head__sub">
            {cortes.abiertas} {cortes.abiertas === 1 ? 'cuenta abierta' : 'cuentas abiertas'}
            {cortes.aFavor > 0 && ` · ${cortes.aFavor} a favor`}
            {cortes.alDia > 0 && ` · ${cortes.alDia} al día`}
          </div>
        </div>
        {tabs}
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="ec-fig">
            <div className="ec-fig__l">POR COBRAR</div>
            <div className="ec-fig__v">{fmt(totalPorCobrar)}</div>
          </div>
          <div className="hd-head__div" />
          {cuentaSel && <Button variant="outline" size="sm" onClick={() => exportarPDF(cuentaSel)}>Estado de cuenta · MDA</Button>}
        </div>
      </div>

      <div className="ec-book">
        {/* Quien debe y cuanto, sin tocar nada. */}
        <aside className={`ec-aside${cuentaSel || hoja ? ' ec-aside--sel' : ''}`}>
          <div className="hd-card ec-aside__card">
            <div className="ec-aside__cab"><span className="ec-aside__cl">CUENTA</span><span className="ec-aside__cr">SALDO</span></div>
            <div className="ec-aside__b">
              {cuentas.map((c, i) => {
                const on = mismaPersona(sel, c.persona)
                const debe = c.saldo > 0, favor = c.saldo < 0
                return (
                  <button key={c.persona} type="button" className={`ec-row${on ? ' on' : ''}`} onClick={() => elegirCuenta(c.persona)}>
                    <span className={`av av-${(i % 5) + 1} ec-row__av`}>{iniciales(c.persona)}</span>
                    <span className="ec-row__b">
                      <span className={`ec-row__n${on ? ' on' : ''}`}>{c.persona}</span>
                      <span className="ec-row__m">
                        {c.rol ? `${c.rol} · ` : ''}{c.movs.length ? `${c.movs.length} movimiento${c.movs.length === 1 ? '' : 's'}` : 'sin movimientos'}
                      </span>
                    </span>
                    <span className="ec-row__r">
                      <span className={`ec-row__s${debe ? ' debe' : favor ? ' favor' : ''}`}>
                        {debe ? fmt(c.saldo) : favor ? fmt(-c.saldo) : '$ 0'}
                      </span>
                      <span className={`ec-row__e${debe ? ' debe' : favor ? ' favor' : ''}`}>
                        {debe ? 'DEBE' : favor ? 'A FAVOR' : 'AL DÍA'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="ec-aside__f">
              <span className="ec-aside__fl">Por cobrar · {cortes.abiertas} de {cuentas.length} cuentas</span>
              <span className="ec-aside__ft">{fmt(totalPorCobrar)}</span>
            </div>
          </div>
        </aside>

        {/* Momento 1 del movil: la lista y nada mas. Se puede registrar sin
            entrar a ninguna cuenta, que es lo que dice el mockup. En
            escritorio este boton no existe: la captura ya esta a la vista. */}
        {!cuentaSel && !hoja && (
          <button type="button" className="ec-reg" onClick={() => setHoja(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Registrar movimiento
          </button>
        )}
        <main className={`ec-main${cuentaSel ? ' ec-main--sel' : ''}${hoja ? ' ec-main--hoja' : ''}`} ref={detailRef}>
          {/* LA CUENTA: una sola tarjeta con divisores, no tres tarjetas.
              Identidad y saldo arriba; los cuatro cortes y Saldar debajo;
              la captura al pie, dentro del mismo objeto visual. */}
          <div className="hd-card ec-cta">
            {!cuentaSel && hoja && (
              <div className="ec-hoja__h">
                <button type="button" className="ec-cta__back" onClick={() => setHoja(false)} aria-label="Volver a las cuentas">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                </button>
                <span className="ec-hoja__t">Registrar movimiento</span>
              </div>
            )}
            {cuentaSel ? (
              <>
                <div className="ec-cta__id">
                  <button type="button" className="ec-cta__back" onClick={() => setSel(null)} aria-label="Volver a las cuentas">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="ec-cta__idb">
                    <div className="ec-cta__nl">
                      <span className="ec-cta__n">{cuentaSel.persona}</span>
                      <span className="ec-cta__rol">{cuentaSel.rol || (cuentaSel.tecnicoId != null ? 'Técnico' : 'Cuenta')}</span>
                    </div>
                    {abiertaDesde(cuentaSel) && <div className="ec-cta__desde">Cuenta abierta desde {abiertaDesde(cuentaSel)}</div>}
                  </div>
                  <div className="ec-cta__debe">
                    <div className={`ec-cta__debe-l${cuentaSel.saldo > 0 ? ' debe' : cuentaSel.saldo < 0 ? ' favor' : ''}`}>
                      {cuentaSel.saldo < 0 ? 'A FAVOR' : cuentaSel.saldo > 0 ? 'DEBE' : 'AL DÍA'}
                    </div>
                    <div className="ec-cta__debe-v">{fmt(Math.abs(cuentaSel.saldo))}</div>
                  </div>
                </div>

                <div className="ec-cta__nums">
                  <div className="ec-num"><div className="ec-num__l">PRESTADO</div><div className="ec-num__v">{fmt(cuentaSel.prestado)}</div></div>
                  <div className="ec-num"><div className="ec-num__l">ABONADO</div><div className="ec-num__v ok">{fmt(cuentaSel.abonado)}</div></div>
                  <div className="ec-num"><div className="ec-num__l">MOVS.</div><div className="ec-num__v">{cuentaSel.movs.length}</div></div>
                  <div className={`ec-num${dias >= 30 ? ' alerta' : ''}`}>
                    <div className="ec-num__l">MÁS ANTIGUO</div>
                    <div className="ec-num__v">{dias > 0 ? `${dias} días` : '—'}</div>
                  </div>
                  {cuentaSel.saldo !== 0 && (
                    <Button variant="outline" onClick={() => saldarCuenta(cuentaSel)} className="ec-cta__saldar">Saldar la cuenta</Button>
                  )}
                </div>
              </>
            ) : (
              <div className="ec-cta__id ec-cta__id--vacia">
                <div className="ec-cta__idb"><div className="ec-cta__nl"><span className="ec-cta__n ec-cta__n--vacio">Elige una cuenta</span></div></div>
              </div>
            )}
            {filaRegistro}
          </div>

          {/* Movimientos. Cuentti dejo de ser una tira entre filas: es una
              columna de la propia fila, asi 5 movimientos son 5 renglones. */}
          <div className="hd-card ec-movs">
            {!cuentaSel ? (
              <div className="hd-void">Aquí verás sus movimientos</div>
            ) : cuentaSel.movs.length === 0 ? (
              <div className="hd-void">Sin movimientos</div>
            ) : (
              <>
                <div className="ec-movs__cab">
                  <span className="ec-c-fecha">FECHA</span>
                  <span className="ec-c-tipo">TIPO</span>
                  <span className="ec-c-monto">MONTO</span>
                  <span className="ec-c-saldo">SALDO</span>
                  <span className="ec-c-nota">NOTA</span>
                  <span className="ec-c-cuentti">CUENTTI</span>
                  <span className="ec-c-del" />
                </div>
                <div className="ec-movs__b">
                  {movsSel.map(m => {
                    const abono = m.tipo === 'abono'
                    const puedeCuentti = abono && !cuentaSel.tecnicoId && !!cedulaDeCuenta(cuentaSel)
                    const doc = gastoDone[m.id]
                    return (
                      <div key={m.id} className="ec-mov">
                        <span className="ec-c-fecha">{fmtDate(m.fecha)}</span>
                        <span className="ec-c-tipo"><span className={`hd-chip hd-chip--${abono ? 'ok' : 'warn'}`}>{abono ? 'ABONO' : 'PRÉSTAMO'}</span></span>
                        <span className={`ec-c-monto${abono ? ' ok' : ''}`}>{abono ? '− ' : '+ '}{fmt(m.monto)}</span>
                        <span className="ec-c-saldo">{fmt(m.saldoCorrido)}</span>
                        <span className="ec-c-nota">{m.nota || <span className="hd-empty">—</span>}</span>
                        <span className="ec-c-cuentti">
                          {!puedeCuentti ? <span className="hd-empty">—</span> : doc ? (
                            <span className="hd-chip hd-chip--ok" title="Gasto ya registrado en Cuentti">Cuentti · {doc}</span>
                          ) : (
                            <>
                              <span className="segctl ec-segmini">
                                <button type="button" className={(metodoG[m.id] || 'efectivo') === 'efectivo' ? 'on' : ''} onClick={() => setMetodoG(g => ({ ...g, [m.id]: 'efectivo' }))}>Efectivo</button>
                                <button type="button" className={(metodoG[m.id] || 'efectivo') === 'transferencia' ? 'on' : ''} onClick={() => setMetodoG(g => ({ ...g, [m.id]: 'transferencia' }))}>Transf.</button>
                              </span>
                              <button type="button" className="ec-cbtn" disabled={gastoReg === m.id} onClick={() => pedirRegistrarGastoEC(m, cuentaSel)}>
                                {gastoReg === m.id ? '…' : (gastoErr[m.id] ? 'Reintentar' : 'Cuentti')}
                              </button>
                            </>
                          )}
                        </span>
                        <span className="ec-c-del">
                          <button type="button" className="ec-del" aria-label="Eliminar movimiento" title="Eliminar" onClick={() => setDlg({
                            title: 'Eliminar movimiento',
                            lead: `${abono ? 'Abono' : 'Préstamo'} · ${fmt(m.monto)} · ${fmtDate(m.fecha)}`,
                            confirmLabel: 'Sí, eliminar', tone: 'danger',
                            onConfirm: () => eliminarMovimiento(m.id),
                          })}><IconX /></button>
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="ec-movs__f">
                  <span className="ec-movs__fn">{cuentaSel.movs.length} movimientos</span>
                  <span className="ec-movs__fd">{fmt(cuentaSel.prestado)} prestado · {fmt(cuentaSel.abonado)} abonado</span>
                  <span className="hd-bar__sp" />
                  {sinCuentti > 0 && <span className="ec-movs__fc">{sinCuentti} {sinCuentti === 1 ? 'abono sin registrar' : 'abonos sin registrar'} en Cuentti</span>}
                </div>
              </>
            )}
          </div>

          {resumen}
        </main>
      </div>
    </div>
  )
}
