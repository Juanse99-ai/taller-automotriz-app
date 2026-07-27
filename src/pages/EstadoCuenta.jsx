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

export default function EstadoCuenta({ prestamos, tecnicos, notify }) {
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
              <div className="segctl segctl--full">
                <button type="button" className={form.tipo === 'prestamo' ? 'on' : ''} onClick={() => setForm(f => ({ ...f, tipo: 'prestamo' }))}>Préstamo</button>
                <button type="button" className={form.tipo === 'abono' ? 'on' : ''} onClick={() => setForm(f => ({ ...f, tipo: 'abono' }))}>Abono / descuento</button>
              </div>
              <p style={{ margin: '7px 2px 0', fontSize: 12.5, fontWeight: 600, color: form.tipo === 'prestamo' ? 'var(--amber-700)' : 'var(--green-700)' }}>
                {form.tipo === 'prestamo' ? 'Sube lo que debe (+)' : 'Baja lo que debe (−)'}
              </p>
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
                      })}><IconX /></button>
                    </div>
                    {puedeCuentti && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                        {doc ? (
                          <span className="badge" style={{ background: 'var(--soft-green)', color: 'var(--green-700)', fontWeight: 700 }} title="Gasto ya registrado en Cuentti">✓ Registrado en Cuentti · {doc}</span>
                        ) : (
                          <>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Cuentti</span>
                            <div className="segctl" style={{ margin: 0 }}>
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
