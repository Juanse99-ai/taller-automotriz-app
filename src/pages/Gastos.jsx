import { useCallback, useEffect, useMemo, useState } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { fetchGastos, crearGasto, actualizarGasto, borrarGasto, fetchCuentasUsadas } from '../services/supabase'
import { registrarGastoCuentti } from '../services/cuentti'
import {
  CATEGORIAS_GASTO, METODOS_GASTO, CUENTAS_CONOCIDAS, nombreCategoria, hoyTaller, periodoDe,
  sumarMeses, nombreMes, fijosDelMes, sueltosDelMes, totalesDelMes, claveCuentti,
  cuenttiPorDefecto, avisoCuentti, faltaParaCuentti, validarGasto,
} from '../utils/gastos'
import { Button, IconX, IconEdit, IconTrash } from '../components/ui'
import MoneyInput from '../components/MoneyInput'
import ConfirmDialog from '../components/ConfirmDialog'

// Gastos: los fijos de cada mes (arriendo, nomina, credito...) y los sueltos.
//
// Los gastos fijos vivian en un Excel y la app no registraba egresos. Aqui un
// gasto fijo se carga UNA vez y cada mes aparece para confirmar el pago; el
// pago puede registrarse tambien en Cuentti (egreso contra la cuenta del gasto).
// La tabla y sus reglas: supabase/migrations/20260915_001_gastos.sql.

const TONO_ESTADO = { pagado: 'ok', vencido: 'bad', pendiente: 'warn' }
const TEXTO_ESTADO = { pagado: 'Pagado', vencido: 'Vencido', pendiente: 'Pendiente' }
const CUENTA_OTRA = 'otra'
const EJEMPLO_CONCEPTO = {
  arriendo: 'Arriendo del local', nomina: 'Sueldo del auxiliar', servicios: 'Internet del taller',
  credito: 'Cuota del crédito del taller', otros: 'Recarga de gas',
}
const primerDia = (periodo) => `${periodo}-01`
const texto = (v) => String(v ?? '').trim()

// El formulario vacio de un gasto fijo o suelto.
function formNuevo(tipo, periodo, hoy) {
  const categoria = tipo === 'fijo' ? 'arriendo' : 'otros'
  return {
    categoria, concepto: '', monto: '', iva: 0,
    fecha: tipo === 'fijo' ? primerDia(periodo) : (periodoDe(hoy) === periodo ? hoy : primerDia(periodo)),
    dia_pago: '', metodo_pago: '', proveedor: '', proveedor_nit: '', id_plan_cuentas: '', nota: '',
    cuenttiAl: tipo === 'suelto' && cuenttiPorDefecto(categoria),
  }
}

export default function Gastos({ notify }) {
  const [filas, setFilas] = useState(null)       // null = cargando
  const [error, setError] = useState(null)       // 'SIN_TABLA' | texto
  const [hoy] = useState(hoyTaller)
  const [periodo, setPeriodo] = useState(() => periodoDe(hoyTaller()))
  const [cuentas, setCuentas] = useState([])      // cuentas de Cuentti ya usadas
  const [editor, setEditor] = useState(null)      // { tipo: 'fijo'|'suelto', fila?, form }
  const [pago, setPago] = useState(null)          // { item de fijosDelMes, form }
  const [guardando, setGuardando] = useState(false)
  const [enCuentti, setEnCuentti] = useState(null) // id de la fila que se esta registrando
  const [verApagados, setVerApagados] = useState(false)
  const [confirmCfg, setConfirmCfg] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const f = await fetchGastos()
      setFilas(Array.isArray(f) ? f : [])
      setError(null)
    } catch (e) {
      setError(e.code === 'SIN_TABLA' ? 'SIN_TABLA' : (e.message || 'No se pudieron leer los gastos'))
      setFilas([])
    }
  }, [])
  useEffect(() => {
    cargar()
    fetchCuentasUsadas().then(setCuentas).catch(() => setCuentas([]))
  }, [cargar])

  const fijos = useMemo(() => fijosDelMes(filas || [], periodo, hoy), [filas, periodo, hoy])
  const sueltos = useMemo(() => sueltosDelMes(filas || [], periodo), [filas, periodo])
  const T = useMemo(() => totalesDelMes(fijos, sueltos), [fijos, sueltos])
  const apagados = useMemo(() => (filas || []).filter(g => g.recurrente && g.activo === false), [filas])
  const mes = nombreMes(periodo)
  const mesCorto = mes.split(' ')[0]

  // Cuentas para elegir: las de nombre confirmado y las que ya se usaron, con el
  // concepto con que se usaron (de esas no se sabe el nombre).
  const opcionesCuenta = useMemo(() => {
    const conocidas = new Set(CUENTAS_CONOCIDAS.map(c => c.id))
    return [
      ...CUENTAS_CONOCIDAS.map(c => ({ id: c.id, texto: `${c.id} · ${c.nombre}` })),
      ...cuentas.filter(c => !conocidas.has(c.id)).map(c => ({ id: c.id, texto: `${c.id} · la usaste para: ${c.concepto.slice(0, 48)}` })),
    ]
  }, [cuentas])

  // ── Registrar en Cuentti ──────────────────────────────────────────────
  // El pago ya quedo guardado en la app antes de llegar aqui. Si Cuentti falla,
  // la fila queda sin cuentti_ref y ofrece reintentar; la clave evita que un
  // reintento grabe el egreso dos veces si el primero si alcanzo a entrar.
  const registrarEnCuentti = async (fila) => {
    const faltan = faltaParaCuentti(fila)
    if (faltan.length) { notify(`Para registrarlo en Cuentti falta ${faltan.join(' y ')}.`, 'error'); return }
    if (!fila.metodo_pago) { notify('Para registrarlo en Cuentti falta decir si se pagó en efectivo o por transferencia.', 'error'); return }
    setEnCuentti(fila.id)
    try {
      const d = await registrarGastoCuentti({
        proveedorNit: fila.proveedor_nit, proveedorNombre: fila.proveedor, monto: fila.monto, iva: fila.iva,
        idPlanCuentas: fila.id_plan_cuentas, metodoPago: fila.metodo_pago, fecha: fila.fecha,
        concepto: fila.periodo ? `${fila.concepto} · ${nombreMes(fila.periodo)}` : fila.concepto,
        nota: fila.nota || '', idemKey: claveCuentti(fila),
      })
      const ref = d.numeroDoc ? `G-${d.numeroDoc}` : String(d.idTransacion || 'registrado')
      // Con el documento quedan tambien el proveedor y la cuenta con que se
      // registro, por si vinieron del gasto fijo.
      await actualizarGasto(fila.id, { cuentti_ref: ref, proveedor: fila.proveedor || null, proveedor_nit: fila.proveedor_nit, id_plan_cuentas: fila.id_plan_cuentas })
      notify(d.dedup ? `Ya estaba en Cuentti: ${ref}` : `Registrado en Cuentti: ${ref}`, 'success')
    } catch (e) {
      notify(`Quedó en la app, pero no en Cuentti: ${e.message}`, 'error')
    } finally {
      setEnCuentti(null)
      cargar()
    }
  }

  // ── Confirmar el pago de un gasto fijo ──────────────────────────────────
  const abrirPago = (item) => {
    const { fijo } = item
    setPago({
      item,
      form: {
        monto: Math.round(Number(fijo.monto) || 0),
        // El pago de un mes ya cerrado se registra el ultimo dia de ese mes por
        // defecto; se corrige si fue otro.
        fecha: periodoDe(hoy) === periodo ? hoy : `${periodo}-${String(new Date(Date.UTC(+periodo.slice(0, 4), +periodo.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`,
        metodo_pago: fijo.metodo_pago || '',
        nota: '',
        cuenttiAl: cuenttiPorDefecto(fijo.categoria) && faltaParaCuentti(fijo).length === 0,
      },
    })
  }
  const confirmarPago = async (e) => {
    e?.preventDefault?.()
    if (!pago || guardando) return
    const { fijo } = pago.item
    const f = pago.form
    if (!(Number(f.monto) > 0)) { notify('El monto debe ser mayor a 0', 'error'); return }
    if (f.cuenttiAl && !f.metodo_pago) { notify('Para registrarlo en Cuentti di si fue efectivo o transferencia', 'error'); return }
    setGuardando(true)
    try {
      const fila = await crearGasto({
        fecha: f.fecha, categoria: fijo.categoria, concepto: fijo.concepto, monto: Math.round(Number(f.monto)),
        iva: Number(fijo.iva) || 0, metodo_pago: f.metodo_pago || null, proveedor: fijo.proveedor || null,
        proveedor_nit: fijo.proveedor_nit || null, id_plan_cuentas: fijo.id_plan_cuentas || null,
        nota: texto(f.nota) || null, gasto_fijo_id: fijo.id, periodo,
      })
      setPago(null)
      notify(`${fijo.concepto} de ${mesCorto}: pagado`, 'success')
      if (f.cuenttiAl && fila) await registrarEnCuentti(fila)
      else cargar()
    } catch (err) {
      if (err.code === 'YA_PAGADO') {
        setPago(null)
        notify(`${fijo.concepto} de ${mesCorto} ya estaba pagado (lo confirmó alguien más).`, 'info')
        cargar()
      } else {
        notify(err.message || 'No se pudo guardar el pago', 'error')
      }
    } finally {
      setGuardando(false)
    }
  }

  const deshacerPago = (item) => setConfirmCfg({
    title: 'Deshacer el pago',
    lead: `${item.fijo.concepto} de ${mesCorto} vuelve a quedar sin pagar.`,
    body: item.pago.cuentti_ref
      ? `Ya está en Cuentti como ${item.pago.cuentti_ref}. Deshacerlo aquí NO lo anula allá: anúlalo en Cuentti si no se pagó.`
      : undefined,
    confirmLabel: 'Deshacer pago',
    tone: 'danger',
    onConfirm: async () => {
      try { await borrarGasto(item.pago.id); notify('Pago deshecho', 'success') }
      catch (err) { notify(err.message || 'No se pudo deshacer', 'error') }
      cargar()
    },
  })

  // ── Crear y editar gastos ─────────────────────────────────────────────
  const abrirEditor = (tipo, fila = null) => {
    const base = formNuevo(tipo, periodo, hoy)
    const form = fila ? {
      ...base,
      categoria: fila.categoria, concepto: fila.concepto || '', monto: Math.round(Number(fila.monto) || 0),
      iva: Number(fila.iva) || 0, fecha: fila.fecha, dia_pago: fila.dia_pago ?? '', metodo_pago: fila.metodo_pago || '',
      proveedor: fila.proveedor || '', proveedor_nit: fila.proveedor_nit || '',
      id_plan_cuentas: fila.id_plan_cuentas ?? '', nota: fila.nota || '', cuenttiAl: false,
    } : base
    const enLista = form.id_plan_cuentas === '' || opcionesCuenta.some(o => o.id === Number(form.id_plan_cuentas))
    setEditor({ tipo, fila, form, cuentaOtra: !enLista })
  }
  const setForm = (k, v) => setEditor(ed => {
    const form = { ...ed.form, [k]: v }
    // Al cambiar de categoria un gasto suelto nuevo, "registrar en Cuentti"
    // sigue la regla de esa categoria (nomina y arriendo, apagado).
    if (k === 'categoria' && ed.tipo === 'suelto' && !ed.fila) form.cuenttiAl = cuenttiPorDefecto(v)
    return { ...ed, form }
  })

  const guardarEditor = async (e) => {
    e?.preventDefault?.()
    if (!editor || guardando) return
    const { tipo, fila, form } = editor
    const fijo = tipo === 'fijo'
    const campos = {
      categoria: form.categoria, concepto: texto(form.concepto), monto: Math.round(Number(form.monto) || 0),
      iva: Number(form.iva) === 19 ? 19 : 0, fecha: form.fecha,
      metodo_pago: form.metodo_pago || null, proveedor: texto(form.proveedor) || null,
      proveedor_nit: texto(form.proveedor_nit).replace(/\D/g, '') || null,
      id_plan_cuentas: parseInt(form.id_plan_cuentas, 10) > 0 ? parseInt(form.id_plan_cuentas, 10) : null,
      nota: texto(form.nota) || null,
      ...(fijo ? { recurrente: true, dia_pago: form.dia_pago === '' ? null : parseInt(form.dia_pago, 10) } : {}),
    }
    const problema = validarGasto(campos, { fijo })
    if (problema) { notify(problema, 'error'); return }
    if (!fijo && form.cuenttiAl) {
      const faltan = faltaParaCuentti(campos)
      if (faltan.length) { notify(`Para registrarlo en Cuentti falta ${faltan.join(' y ')}.`, 'error'); return }
      if (!campos.metodo_pago) { notify('Para registrarlo en Cuentti di si fue efectivo o transferencia', 'error'); return }
    }
    setGuardando(true)
    try {
      const guardada = fila ? await actualizarGasto(fila.id, campos) : await crearGasto(campos)
      setEditor(null)
      notify(fila ? 'Cambios guardados' : (fijo ? `Gasto fijo creado: aparece desde ${nombreMes(periodoDe(campos.fecha))}` : 'Gasto guardado'), 'success')
      if (!fila && !fijo && form.cuenttiAl && guardada) await registrarEnCuentti(guardada)
      else cargar()
    } catch (err) {
      notify(err.message || 'No se pudo guardar', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const apagarFijo = (fila) => setConfirmCfg({
    title: 'Apagar gasto fijo',
    lead: `${fila.concepto} deja de aparecer desde ${mesCorto}. Los pagos que ya tiene se quedan.`,
    confirmLabel: 'Apagar',
    tone: 'danger',
    onConfirm: async () => {
      try { await actualizarGasto(fila.id, { activo: false }); setEditor(null); notify('Gasto fijo apagado', 'success') }
      catch (err) { notify(err.message || 'No se pudo apagar', 'error') }
      cargar()
    },
  })
  const encenderFijo = async (fila) => {
    try { await actualizarGasto(fila.id, { activo: true }); notify(`${fila.concepto} vuelve a aparecer cada mes`, 'success') }
    catch (err) { notify(err.message || 'No se pudo encender', 'error') }
    cargar()
  }
  const borrarFila = (fila, esFijo) => setConfirmCfg({
    title: esFijo ? 'Borrar gasto fijo' : 'Borrar gasto',
    lead: `${fila.concepto} · ${fmt(fila.monto)}${esFijo ? '' : ` · ${fmtDate(fila.fecha)}`}. No se puede deshacer.`,
    body: fila.cuentti_ref ? `Ya está en Cuentti como ${fila.cuentti_ref}. Borrarlo aquí NO lo anula allá.` : undefined,
    confirmLabel: 'Borrar',
    tone: 'danger',
    onConfirm: async () => {
      try { await borrarGasto(fila.id); setEditor(null); notify('Gasto borrado', 'success') }
      catch (err) {
        notify(err.code === 'TIENE_PAGOS'
          ? 'Tiene pagos registrados: apágalo en vez de borrarlo, así su historia queda.'
          : (err.message || 'No se pudo borrar'), 'error')
      }
      cargar()
    },
  })

  // ── Pantalla ──────────────────────────────────────────────────────────
  const cargando = filas === null
  const aviso = editor ? avisoCuentti(editor.form.categoria) : ''
  const avisoPago = pago ? avisoCuentti(pago.item.fijo.categoria) : ''
  const faltanPago = pago ? faltaParaCuentti(pago.item.fijo) : []

  return (
    <div className="gst-pg">
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Gastos</h1>
          <div className="hd-head__sub">Los fijos de cada mes y los sueltos · lo que sale de la caja</div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-fig" style={{ '--fg': T.vencido > 0 ? 'var(--bad-fg)' : 'var(--text)' }}>
            <div className="hd-fig__l">POR PAGAR · {mesCorto.toUpperCase()}</div>
            <div className="hd-fig__v">{fmt(T.falta)}</div>
            <div className="hd-fig__s">{T.vencido > 0 ? `${fmt(T.vencido)} ya vencido` : `de ${fmt(T.esperado)} en fijos`}</div>
          </div>
          <div className="hd-fig">
            <div className="hd-fig__l">SALIDAS · {mesCorto.toUpperCase()}</div>
            <div className="hd-fig__v">{fmt(T.salidas)}</div>
            <div className="hd-fig__s">{fmt(T.pagadoFijos)} fijos · {fmt(T.sueltos)} sueltos</div>
          </div>
          <div className="hd-head__div" />
          <Button variant="primary" onClick={() => abrirEditor('suelto')} disabled={error === 'SIN_TABLA'}>+ Gasto suelto</Button>
        </div>
      </div>

      <div className="gst-mes" role="group" aria-label="Mes">
        <button type="button" className="icobtn" aria-label="Mes anterior" onClick={() => setPeriodo(p => sumarMeses(p, -1))}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span className="gst-mes__t">{mes}</span>
        <button type="button" className="icobtn" aria-label="Mes siguiente" onClick={() => setPeriodo(p => sumarMeses(p, 1))}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        {periodo !== periodoDe(hoy) && (
          <button type="button" className="gst-mes__hoy" onClick={() => setPeriodo(periodoDe(hoy))}>Volver a este mes</button>
        )}
      </div>

      {error === 'SIN_TABLA' ? (
        <div className="card">
          <div className="empty">
            <h4>Falta crear la tabla de gastos</h4>
            <p>Aplica la migración <code>supabase/migrations/20260915_001_gastos.sql</code> en el editor SQL de Supabase. Cuando esté, esta pantalla se llena sola.</p>
          </div>
        </div>
      ) : error ? (
        <div className="card"><div className="empty"><h4>No se pudieron leer los gastos</h4><p>{error}</p></div></div>
      ) : (
        <>
          {/* Fijos del mes: pagado, vencido o pendiente, con su accion. */}
          <div className="card gst-card">
            <div className="card__h">
              <h3>Gastos fijos <span className="count">{fijos.length}</span></h3>
              <Button variant="outline" size="sm" onClick={() => abrirEditor('fijo')}>+ Gasto fijo</Button>
            </div>
            {cargando ? (
              <div className="empty"><p>Leyendo los gastos…</p></div>
            ) : fijos.length === 0 ? (
              <div className="hd-void">
                <div className="hd-void__t">Sin gastos fijos en {mesCorto}</div>
                <div className="hd-void__s">Carga una vez el arriendo, la nómina o el crédito, y cada mes aparecen aquí para confirmar el pago.</div>
                <Button variant="outline" size="sm" onClick={() => abrirEditor('fijo')}>Agregar gasto fijo</Button>
              </div>
            ) : (
              <ul className="gst-lista">
                {fijos.map(item => {
                  const { fijo, pago: p, estado, vence } = item
                  // Un pago confirmado antes de completar el NIT o la cuenta del
                  // gasto fijo toma lo que el gasto fijo tenga hoy: si no, ese mes
                  // quedaria sin forma de registrarse en Cuentti.
                  const paraCuentti = p && {
                    ...p,
                    proveedor: p.proveedor || fijo.proveedor,
                    proveedor_nit: p.proveedor_nit || fijo.proveedor_nit,
                    id_plan_cuentas: p.id_plan_cuentas || fijo.id_plan_cuentas,
                  }
                  const faltan = faltaParaCuentti(paraCuentti || fijo)
                  return (
                    <li key={fijo.id} className={`gst-fila gst-fila--${estado}`}>
                      <div className="gst-fila__txt">
                        <div className="gst-fila__t">
                          <span className="gst-fila__con">{fijo.concepto}</span>
                          <span className="hd-chip hd-chip--mute">{nombreCategoria(fijo.categoria)}</span>
                        </div>
                        <div className="gst-fila__s">
                          {[
                            fijo.proveedor,
                            p ? `pagado ${fmtDate(p.fecha)}${p.metodo_pago ? ` · ${p.metodo_pago}` : ''}` : (vence ? `vence ${fmtDate(vence)}` : 'sin día de pago'),
                            p?.cuentti_ref ? `Cuentti\u00A0${p.cuentti_ref}` : null,
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="gst-fila__monto">
                        <span className="gst-fila__v">{fmt(p ? p.monto : fijo.monto)}</span>
                        {p && Number(p.monto) !== Number(fijo.monto) && <span className="gst-fila__esp">esperado {fmt(fijo.monto)}</span>}
                      </div>
                      <span className={`hd-chip hd-chip--${TONO_ESTADO[estado]} gst-fila__estado`}>{TEXTO_ESTADO[estado]}</span>
                      <div className="gst-fila__acc">
                        {!p && <Button variant="primary" size="sm" onClick={() => abrirPago(item)}>Confirmar pago</Button>}
                        {p && !p.cuentti_ref && faltan.length === 0 && p.metodo_pago && (
                          <Button variant="outline" size="sm" disabled={enCuentti === p.id} onClick={() => registrarEnCuentti(paraCuentti)}>
                            {enCuentti === p.id ? 'Registrando…' : 'Registrar en Cuentti'}
                          </Button>
                        )}
                        {p && <Button variant="ghost" size="sm" onClick={() => deshacerPago(item)}>Deshacer</Button>}
                        <Button variant="ghost" size="sm" className="btn-icon" aria-label={`Editar ${fijo.concepto}`} title="Editar gasto fijo" onClick={() => abrirEditor('fijo', fijo)}><IconEdit /></Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {fijos.length > 0 && (
              <div className="hd-tbl__f gst-pie">
                <span>Esperado <b>{fmt(T.esperado)}</b></span>
                <span>Pagado <b>{fmt(T.pagadoFijos)}</b></span>
                <span className="hd-bar__sp" />
                <span>Falta <b style={{ color: T.falta > 0 ? 'var(--warn-fg)' : undefined }}>{fmt(T.falta)}</b></span>
              </div>
            )}
            {apagados.length > 0 && (
              <div className="gst-apagados">
                <button type="button" className="gst-apagados__t" aria-expanded={verApagados} onClick={() => setVerApagados(v => !v)}>
                  {verApagados ? '▾' : '▸'} Apagados ({apagados.length})
                </button>
                {verApagados && (
                  <ul className="gst-lista">
                    {apagados.map(f => (
                      <li key={f.id} className="gst-fila gst-fila--apagado">
                        <div className="gst-fila__txt">
                          <div className="gst-fila__t"><span className="gst-fila__con">{f.concepto}</span></div>
                          <div className="gst-fila__s">{nombreCategoria(f.categoria)} · {fmt(f.monto)}</div>
                        </div>
                        <div className="gst-fila__acc">
                          <Button variant="outline" size="sm" onClick={() => encenderFijo(f)}>Encender</Button>
                          <Button variant="ghost" size="sm" className="btn-icon" aria-label={`Editar ${f.concepto}`} onClick={() => abrirEditor('fijo', f)}><IconEdit /></Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Sueltos del mes */}
          <div className="card gst-card">
            <div className="card__h">
              <h3>Gastos sueltos <span className="count">{sueltos.length}</span></h3>
              <Button variant="outline" size="sm" onClick={() => abrirEditor('suelto')}>+ Gasto suelto</Button>
            </div>
            {cargando ? (
              <div className="empty"><p>Leyendo los gastos…</p></div>
            ) : sueltos.length === 0 ? (
              <div className="hd-void">
                <div className="hd-void__t">Sin gastos sueltos en {mesCorto}</div>
              </div>
            ) : (
              <ul className="gst-lista">
                {sueltos.map(g => {
                  const faltan = faltaParaCuentti(g)
                  return (
                    <li key={g.id} className="gst-fila">
                      <div className="gst-fila__txt">
                        <div className="gst-fila__t">
                          <span className="gst-fila__con">{g.concepto}</span>
                          <span className="hd-chip hd-chip--mute">{nombreCategoria(g.categoria)}</span>
                        </div>
                        <div className="gst-fila__s">
                          {[fmtDate(g.fecha), g.proveedor, g.metodo_pago, g.cuentti_ref ? `Cuentti\u00A0${g.cuentti_ref}` : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="gst-fila__monto"><span className="gst-fila__v">{fmt(g.monto)}</span></div>
                      <div className="gst-fila__acc">
                        {!g.cuentti_ref && faltan.length === 0 && g.metodo_pago && (
                          <Button variant="outline" size="sm" disabled={enCuentti === g.id} onClick={() => registrarEnCuentti(g)}>
                            {enCuentti === g.id ? 'Registrando…' : 'Registrar en Cuentti'}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="btn-icon" aria-label={`Editar ${g.concepto}`} title="Editar" onClick={() => abrirEditor('suelto', g)}><IconEdit /></Button>
                        <Button variant="ghost" size="sm" className="btn-icon" aria-label={`Borrar ${g.concepto}`} title="Borrar" onClick={() => borrarFila(g, false)}><IconTrash /></Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Confirmar el pago de un gasto fijo */}
      {pago && (
        <div className="modal-overlay" onClick={() => !guardando && setPago(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal__h">
              <div>
                <h3>Confirmar pago</h3>
                <p>{pago.item.fijo.concepto} · {mes}</p>
              </div>
              <button type="button" className="icobtn" onClick={() => setPago(null)} aria-label="Cerrar"><IconX /></button>
            </div>
            <form onSubmit={confirmarPago}>
              <div className="modal__b gst-form">
                <div className="gst-form__2">
                  <div className="field">
                    <label>Monto pagado</label>
                    <MoneyInput className="input" value={pago.form.monto} onChange={v => setPago(p => ({ ...p, form: { ...p.form, monto: v } }))} />
                  </div>
                  <div className="field">
                    <label>Fecha del pago</label>
                    <input className="input" type="date" value={pago.form.fecha} onChange={e => setPago(p => ({ ...p, form: { ...p.form, fecha: e.target.value } }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Cómo se pagó</label>
                  <div className="hd-seg gst-seg" role="group" aria-label="Cómo se pagó">
                    {METODOS_GASTO.map(m => (
                      <button key={m.clave} type="button" className={`hd-seg__i${pago.form.metodo_pago === m.clave ? ' on' : ''}`} aria-pressed={pago.form.metodo_pago === m.clave}
                        onClick={() => setPago(p => ({ ...p, form: { ...p.form, metodo_pago: m.clave } }))}>{m.nombre}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Nota <span className="gst-form__opc">opcional</span></label>
                  <input className="input" value={pago.form.nota} onChange={e => setPago(p => ({ ...p, form: { ...p.form, nota: e.target.value } }))} placeholder="Ej: recibo 0452" />
                </div>
                <label className={`gst-check${faltanPago.length ? ' gst-check--off' : ''}`}>
                  <input type="checkbox" checked={pago.form.cuenttiAl} disabled={faltanPago.length > 0}
                    onChange={e => setPago(p => ({ ...p, form: { ...p.form, cuenttiAl: e.target.checked } }))} />
                  <span>
                    Registrar también en Cuentti
                    <small>{faltanPago.length
                      ? `Falta ${faltanPago.join(' y ')}: complétalo en el gasto fijo para poder registrarlo.`
                      : `Egreso contra la cuenta ${pago.item.fijo.id_plan_cuentas}, a nombre de ${pago.item.fijo.proveedor || `NIT ${pago.item.fijo.proveedor_nit}`}.`}</small>
                  </span>
                </label>
                {avisoPago && <p className="gst-aviso">{avisoPago}</p>}
              </div>
              <div className="modal__f">
                <Button type="button" variant="outline" onClick={() => setPago(null)} disabled={guardando}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Confirmar pago'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Crear o editar un gasto fijo o suelto */}
      {editor && (
        <div className="modal-overlay" onClick={() => !guardando && setEditor(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal__h">
              <div>
                <h3>{editor.fila ? 'Editar' : 'Nuevo'} gasto {editor.tipo === 'fijo' ? 'fijo' : 'suelto'}</h3>
                <p>{editor.tipo === 'fijo' ? 'Se carga una vez y aparece cada mes para confirmar el pago.' : 'Un gasto que no se repite cada mes.'}</p>
              </div>
              <button type="button" className="icobtn" onClick={() => setEditor(null)} aria-label="Cerrar"><IconX /></button>
            </div>
            <form onSubmit={guardarEditor}>
              <div className="modal__b gst-form">
                <div className="gst-form__2">
                  <div className="field">
                    <label>Categoría</label>
                    <select className="input" value={editor.form.categoria} onChange={e => setForm('categoria', e.target.value)}>
                      {CATEGORIAS_GASTO.map(c => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Concepto <span className="req">*</span></label>
                    <input className="input" value={editor.form.concepto} onChange={e => setForm('concepto', e.target.value)} placeholder={EJEMPLO_CONCEPTO[editor.form.categoria] || ''} />
                  </div>
                </div>
                <div className="gst-form__2">
                  <div className="field">
                    <label>{editor.tipo === 'fijo' ? 'Monto de cada mes' : 'Monto'} <span className="req">*</span></label>
                    <MoneyInput className="input" value={editor.form.monto} onChange={v => setForm('monto', v)} />
                  </div>
                  <div className="field">
                    <label>IVA incluido</label>
                    <select className="input" value={editor.form.iva} onChange={e => setForm('iva', Number(e.target.value))}>
                      <option value={0}>Sin IVA</option>
                      <option value={19}>19% incluido</option>
                    </select>
                  </div>
                </div>
                <div className="gst-form__2">
                  {editor.tipo === 'fijo' ? (
                    <>
                      <div className="field">
                        <label>Día de pago <span className="gst-form__opc">opcional</span></label>
                        <input className="input" type="number" inputMode="numeric" min="1" max="31" value={editor.form.dia_pago} onChange={e => setForm('dia_pago', e.target.value)} placeholder="15" />
                      </div>
                      <div className="field">
                        <label>Aplica desde</label>
                        <input className="input" type="date" value={editor.form.fecha} onChange={e => setForm('fecha', e.target.value)} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field">
                        <label>Fecha</label>
                        <input className="input" type="date" value={editor.form.fecha} onChange={e => setForm('fecha', e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Cómo se pagó</label>
                        <select className="input" value={editor.form.metodo_pago} onChange={e => setForm('metodo_pago', e.target.value)}>
                          <option value="">Sin decir</option>
                          {METODOS_GASTO.map(m => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </div>
                {editor.tipo === 'fijo' && (
                  <div className="field">
                    <label>Cómo se paga normalmente <span className="gst-form__opc">opcional</span></label>
                    <select className="input" value={editor.form.metodo_pago} onChange={e => setForm('metodo_pago', e.target.value)}>
                      <option value="">Se elige al pagar</option>
                      {METODOS_GASTO.map(m => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
                    </select>
                  </div>
                )}

                <div className="gst-form__grupo">Para registrarlo en Cuentti</div>
                <div className="gst-form__2">
                  <div className="field">
                    <label>Proveedor</label>
                    <input className="input" value={editor.form.proveedor} onChange={e => setForm('proveedor', e.target.value)} placeholder="Nombre" />
                  </div>
                  <div className="field">
                    <label>NIT o cédula</label>
                    <input className="input" inputMode="numeric" value={editor.form.proveedor_nit} onChange={e => setForm('proveedor_nit', e.target.value)} placeholder="Sin dígito de verificación" />
                  </div>
                </div>
                <div className="field">
                  <label>Cuenta de Cuentti</label>
                  <select className="input" value={editor.cuentaOtra ? CUENTA_OTRA : String(editor.form.id_plan_cuentas)}
                    onChange={e => {
                      const v = e.target.value
                      if (v === CUENTA_OTRA) setEditor(ed => ({ ...ed, cuentaOtra: true }))
                      else { setEditor(ed => ({ ...ed, cuentaOtra: false })); setForm('id_plan_cuentas', v) }
                    }}>
                    <option value="">Sin cuenta: queda solo en la app</option>
                    {opcionesCuenta.map(o => <option key={o.id} value={String(o.id)}>{o.texto}</option>)}
                    <option value={CUENTA_OTRA}>Otra: escribir el número</option>
                  </select>
                  {editor.cuentaOtra && (
                    <input className="input" type="number" inputMode="numeric" min="1" value={editor.form.id_plan_cuentas} onChange={e => setForm('id_plan_cuentas', e.target.value)} placeholder="Número de la cuenta en Cuentti" style={{ marginTop: 8 }} />
                  )}
                </div>
                {!editor.fila && editor.tipo === 'suelto' && (
                  <label className="gst-check">
                    <input type="checkbox" checked={editor.form.cuenttiAl} onChange={e => setForm('cuenttiAl', e.target.checked)} />
                    <span>Registrar también en Cuentti al guardar<small>Necesita proveedor con NIT, cuenta y cómo se pagó.</small></span>
                  </label>
                )}
                {aviso && <p className="gst-aviso">{aviso}</p>}
                <div className="field">
                  <label>Nota <span className="gst-form__opc">opcional</span></label>
                  <input className="input" value={editor.form.nota} onChange={e => setForm('nota', e.target.value)} />
                </div>

                {editor.fila && editor.tipo === 'fijo' && (
                  <div className="gst-form__peligro">
                    {editor.fila.activo !== false && <Button variant="outline" size="sm" onClick={() => apagarFijo(editor.fila)}>Apagar gasto fijo</Button>}
                    <Button variant="ghost" size="sm" onClick={() => borrarFila(editor.fila, true)} style={{ color: 'var(--bad-fg)' }}>Borrar</Button>
                  </div>
                )}
              </div>
              <div className="modal__f">
                <Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={guardando}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={guardando}>{guardando ? 'Guardando…' : (editor.fila ? 'Guardar cambios' : 'Guardar')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </div>
  )
}
