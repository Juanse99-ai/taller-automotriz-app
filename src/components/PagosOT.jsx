import { useEffect, useState, useCallback } from 'react'
import { fmt, fmtDate, hoyISO } from '../utils/helpers'
import { fetchPagos, fetchSaldoTrabajo, crearPago, borrarPago, sincronizarPagos } from '../services/supabase'
import MoneyInput from './MoneyInput'
import { Button } from './ui'

// Bloque de pagos de UNA orden: total, abonado y saldo, la lista de abonos y
// el formulario para registrar uno. Vive en el detalle de la OT y en Cartera.
//
// Antes `pagado` era si/no y un abono parcial no cabia en ninguna parte: la
// OT-0221 ($6.704.000) tenia $5.635.000 abonados y la app decia "por cobrar"
// por el total. Los datos salen de la vista trabajos_saldo y la tabla pagos.
//
//   trabajo   { id, total, pagado, cuenttiTransacionId }
//   onPagado  (bool) => void  cuando cambia el estado de cobro, para que la
//             lista de OTs (que lee trabajos.pagado) se entere
//   onCambio  () => void      tras registrar o borrar un abono (Cartera recarga)
const METODOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['wompi', 'Wompi'], ['otro', 'Otro']]
const METODO_ROTULO = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Crédito', wompi: 'Wompi', otro: 'Otro' }
const ESTADO = {
  pagado: ['PAGADA', 'hd-chip--ok'],
  parcial: ['ABONADA', 'hd-chip--warn'],
  pendiente: ['POR COBRAR', 'hd-chip--mute'],
}
const formVacio = () => ({ monto: '', fecha: hoyISO(), metodo: 'efectivo', nota: '' })

export default function PagosOT({ trabajo, notify, onPagado, onCambio }) {
  const id = trabajo?.id
  const [pagos, setPagos] = useState(null)      // null = cargando
  const [saldo, setSaldo] = useState(null)
  const [error, setError] = useState(null)      // 'SIN_TABLA' | texto
  const [abriendo, setAbriendo] = useState(false)
  const [form, setForm] = useState(formVacio)
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(null) // id del abono a borrar
  const [sincronizando, setSincronizando] = useState(false)

  const cargar = useCallback(async () => {
    if (!id) return null
    try {
      const [p, s] = await Promise.all([fetchPagos(id), fetchSaldoTrabajo(id)])
      setPagos(Array.isArray(p) ? p : [])
      setSaldo(s)
      setError(null)
      return s
    } catch (e) {
      setError(e.code === 'SIN_TABLA' ? 'SIN_TABLA' : (e.message || 'No se pudo leer'))
      setPagos([])
      return null
    }
  }, [id])

  useEffect(() => {
    setPagos(null); setSaldo(null); setError(null); setAbriendo(false); setConfirmando(null)
    cargar()
  }, [cargar])

  // Al abrir, si la orden tiene factura en Cuentti y no esta pagada, se bajan
  // sus recibos: el abono que se registro en el mostrador aparece solo.
  const tieneCuentti = !!trabajo?.cuenttiTransacionId && !trabajo?.pagado
  useEffect(() => {
    if (!id || !tieneCuentti) return undefined
    let vivo = true
    setSincronizando(true)
    sincronizarPagos(id)
      .then(r => {
        if (!vivo || !r?.ok) return
        if (r.nuevos > 0 || (r.marcados || []).length) cargar()
        if ((r.marcados || []).includes(id)) onPagado?.(true)
      })
      .catch(() => { /* Cuentti caido: se muestra lo que hay */ })
      .finally(() => { if (vivo) setSincronizando(false) })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tieneCuentti])

  // Sin la migracion aplicada no hay nada que mostrar; Cartera es quien lo explica.
  if (error === 'SIN_TABLA') return null

  const total = Number(saldo?.total ?? trabajo?.total ?? 0)
  const abonado = Number(saldo?.abonado ?? 0)
  const falta = saldo ? Number(saldo.saldo) : Math.max(total - abonado, 0)
  const estado = saldo?.estado_pago || (trabajo?.pagado ? 'pagado' : 'pendiente')
  const [rotulo, chip] = ESTADO[estado] || ESTADO.pendiente

  const guardar = async () => {
    const monto = Math.round(Number(form.monto) || 0)
    if (monto <= 0) { notify?.('Escribe el valor del abono', 'error'); return }
    // +1 por el redondeo de centavos de Cuentti
    if (monto > falta + 1) { notify?.(`El abono supera el saldo (${fmt(falta)})`, 'error'); return }
    setGuardando(true)
    try {
      await crearPago({ trabajoId: id, monto, fecha: form.fecha || hoyISO(), metodo: form.metodo, nota: form.nota })
      setForm(formVacio()); setAbriendo(false)
      const s = await cargar()
      const quedaPagada = s ? s.estado_pago === 'pagado' : monto >= falta - 1
      notify?.(quedaPagada ? 'Abono registrado: la orden queda pagada' : `Abono de ${fmt(monto)} registrado`, 'success')
      if (quedaPagada) onPagado?.(true)
      onCambio?.()
    } catch (e) {
      notify?.(e.message || 'No se pudo registrar el abono', 'error')
    } finally {
      setGuardando(false)
    }
  }

  // Borrar un abono mal registrado. Si la orden estaba pagada y ya no cubre el
  // total, se des-marca AQUI, a la vista: el trigger de la base nunca la
  // des-paga solo (Cuentti puede haberla dado por saldada con un descuento).
  const borrar = async (p) => {
    setConfirmando(null)
    try {
      await borrarPago(p.id)
      const s = await cargar()
      if (s && trabajo?.pagado && Number(s.abonado) < Number(s.total) - 1) onPagado?.(false)
      notify?.('Abono borrado', 'info')
      onCambio?.()
    } catch (e) {
      notify?.(e.message || 'No se pudo borrar el abono', 'error')
    }
  }

  return (
    <div className="pg">
      <div className="otd__rot">
        <span>PAGOS</span>
        <span className={`hd-chip ${chip}`}>{rotulo}</span>
        {sincronizando && <span className="pg__sync">Consultando Cuentti…</span>}
        {error && error !== 'SIN_TABLA' && <span className="pg__sync">{error}</span>}
      </div>

      <div className="pg__cifras">
        <div><span className="pg__l">TOTAL</span><span className="pg__v">{fmt(total)}</span></div>
        <div><span className="pg__l">ABONADO</span><span className="pg__v">{fmt(abonado)}</span></div>
        <div><span className="pg__l">SALDO</span><span className={`pg__v${falta > 0 ? ' pg__v--debe' : ''}`}>{fmt(falta)}</span></div>
      </div>

      {pagos === null ? (
        <div className="pg__vacio">Cargando…</div>
      ) : pagos.length === 0 ? (
        <div className="pg__vacio">Sin abonos registrados.</div>
      ) : (
        <ul className="pg__lista">
          {pagos.map(p => (
            <li key={p.id} className="pg__item">
              <span className="pg__fecha">{fmtDate(p.fecha)}</span>
              <span className="pg__det" title={p.nota || ''}>
                <b>{METODO_ROTULO[p.metodo] || p.metodo}</b>
                {p.origen === 'cuentti' && <span className="hd-chip hd-chip--info">CUENTTI</span>}
                {p.origen === 'migracion' && <span className="hd-chip hd-chip--mute">INICIAL</span>}
                {p.nota && <span className="pg__nota">· {p.nota}</span>}
              </span>
              <span className="pg__monto">{fmt(p.monto)}</span>
              {/* Solo los manuales se borran: un recibo de Cuentti volveria a
                  bajar en la siguiente sincronizacion. */}
              {p.origen === 'manual' && (confirmando === p.id ? (
                <button type="button" className="pg__x pg__x--si" onClick={() => borrar(p)}>¿Borrar?</button>
              ) : (
                <button type="button" className="pg__x" onClick={() => setConfirmando(p.id)} aria-label="Borrar abono">×</button>
              ))}
            </li>
          ))}
        </ul>
      )}

      {falta > 0 && !abriendo && (
        <div className="pg__pie">
          <Button variant="outline" size="sm" onClick={() => setAbriendo(true)}>Registrar abono</Button>
        </div>
      )}

      {falta > 0 && abriendo && (
        <div className="pg__form">
          <div className="field">
            <label>Monto (saldo {fmt(falta)})</label>
            <MoneyInput value={form.monto} onChange={v => setForm(f => ({ ...f, monto: v }))} placeholder="0" />
          </div>
          <div className="field">
            <label>Fecha</label>
            <input className="input" type="date" value={form.fecha} max={hoyISO()} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
          </div>
          <div className="field">
            <label>Método</label>
            <select className="input" value={form.metodo} onChange={e => setForm(f => ({ ...f, metodo: e.target.value }))}>
              {METODOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Nota (opcional)</label>
            <input className="input" value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} placeholder="Ej: recibido en caja" />
          </div>
          <div className="pg__acc">
            <Button variant="outline" size="sm" onClick={() => { setAbriendo(false); setForm(formVacio()) }} disabled={guardando}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar abono'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
