import { useEffect, useMemo, useState, useCallback } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { fetchSaldos, sincronizarPagos } from '../services/supabase'
import { Button, IconX } from '../components/ui'
import PagosOT from '../components/PagosOT'

// Cartera: las ordenes con saldo por cobrar, de mayor a menor.
//
// Hasta hoy esto no existia y la cartera se reconstruia consultando la base a
// mano, con el defecto de que una orden abonada a medias contaba por el total.
// Lee la vista trabajos_saldo (total, abonado, saldo, dias desde la factura).

const VENCIDA_DIAS = 60
const dias = (f) => (f.dias_facturada == null ? null : Number(f.dias_facturada))
const vencida = (f) => (dias(f) ?? 0) > VENCIDA_DIAS
const suma = (arr, k) => arr.reduce((s, f) => s + (Number(f[k]) || 0), 0)

export default function Cartera({ notify, actualizarTrabajo }) {
  const [filas, setFilas] = useState(null)   // null = cargando
  const [error, setError] = useState(null)   // 'SIN_TABLA' | texto
  const [sincronizando, setSincronizando] = useState(false)
  const [sel, setSel] = useState(null)       // fila abierta en el modal de pagos
  const [seg, setSeg] = useState('todas')    // todas | abonadas | vencidas

  const cargar = useCallback(async () => {
    try {
      const f = await fetchSaldos()
      setFilas(Array.isArray(f) ? f : [])
      setError(null)
    } catch (e) {
      setError(e.code === 'SIN_TABLA' ? 'SIN_TABLA' : (e.message || 'No se pudo leer la cartera'))
      setFilas([])
    }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Baja de Cuentti los recibos de todas las facturas sin pagar. Es lo que hace
  // que un abono cobrado en el mostrador aparezca aqui sin escribirlo dos veces.
  const sincronizar = async () => {
    setSincronizando(true)
    try {
      const r = await sincronizarPagos()
      await cargar()
      if (r?.ok) {
        const pagadas = (r.marcados || []).length
        notify?.(`Cuentti revisado: ${r.revisadas} factura${r.revisadas === 1 ? '' : 's'}, ${r.nuevos} abono${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'}${pagadas ? `, ${pagadas} quedaron pagadas` : ''}`, 'success')
      } else {
        notify?.('Cuentti no respondió; se muestra lo que ya estaba', 'error')
      }
    } catch (e) {
      notify?.(e.message || 'No se pudo sincronizar', 'error')
    } finally {
      setSincronizando(false)
    }
  }

  const R = useMemo(() => {
    const l = filas || []
    const venc = l.filter(vencida)
    return {
      n: l.length,
      saldo: suma(l, 'saldo'),
      abonado: suma(l, 'abonado'),
      total: suma(l, 'total'),
      vencidas: venc.length,
      saldoVencido: suma(venc, 'saldo'),
      abonadas: l.filter(f => Number(f.abonado) > 0).length,
    }
  }, [filas])

  const vista = useMemo(() => {
    const l = filas || []
    if (seg === 'vencidas') return l.filter(vencida)
    if (seg === 'abonadas') return l.filter(f => Number(f.abonado) > 0)
    return l
  }, [filas, seg])

  const trabajoDe = (f) => ({ id: f.id, total: f.total, pagado: f.pagado, cuenttiTransacionId: f.cuentti_id_transacion })

  return (
    <div className="cart-pg">
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Cartera</h1>
          <div className="hd-head__sub">
            {filas === null ? 'Leyendo la cartera…' : `${R.n} ${R.n === 1 ? 'orden' : 'órdenes'} con saldo · lo que los clientes deben hoy`}
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-fig">
            <div className="hd-fig__l">POR COBRAR</div>
            <div className="hd-fig__v">{fmt(R.saldo)}</div>
            {R.abonado > 0 && <div className="hd-fig__s">{fmt(R.abonado)} ya abonados</div>}
          </div>
          {R.vencidas > 0 && (
            <div className="hd-fig" style={{ '--fg': 'var(--warn-fg-2)' }}>
              <div className="hd-fig__l" style={{ color: 'var(--warn-fg)' }}>MÁS DE {VENCIDA_DIAS} DÍAS</div>
              <div className="hd-fig__v">{fmt(R.saldoVencido)}</div>
              <div className="hd-fig__s">{R.vencidas} {R.vencidas === 1 ? 'orden' : 'órdenes'}</div>
            </div>
          )}
          <div className="hd-head__div" />
          <Button variant="outline" onClick={sincronizar} disabled={sincronizando || error === 'SIN_TABLA'} title="Baja de Cuentti los recibos de las facturas sin pagar">
            {sincronizando ? 'Consultando Cuentti…' : 'Actualizar desde Cuentti'}
          </Button>
        </div>
      </div>

      <div className="card" style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        <div className="card__h" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '13px 18px 12px', borderBottom: 'none' }}>
          <div className="hd-seg" role="group" aria-label="Filtrar la cartera">
            {[['todas', 'Todas', R.n], ['abonadas', 'Con abono', R.abonadas], ['vencidas', `Más de ${VENCIDA_DIAS} días`, R.vencidas]].map(([k, l, n]) => (
              <button key={k} type="button" className={`hd-seg__i${seg === k ? ' on' : ''}`} aria-pressed={seg === k} onClick={() => setSeg(k)}>
                {l} <span className="cli-seg__n">{n}</span>
              </button>
            ))}
          </div>
          <div className="hd-bar__sp" />
          <span className="hd-bar__n">{seg === 'todas' ? `${vista.length} órdenes` : `${vista.length} de ${R.n} órdenes`}</span>
        </div>

        <div className="card__b card__b--flush">
          {error === 'SIN_TABLA' ? (
            <div className="empty">
              <h4>Falta crear la tabla de pagos</h4>
              <p>Aplica las migraciones de <code>supabase/migrations</code> en el editor SQL de Supabase (001 a 004, en orden). Cuando estén, esta pantalla se llena sola.</p>
            </div>
          ) : filas === null ? (
            <div className="empty"><p>Leyendo la cartera…</p></div>
          ) : error ? (
            <div className="empty"><h4>No se pudo leer la cartera</h4><p>{error}</p></div>
          ) : vista.length === 0 ? (
            <div className="empty">
              <h4>{seg === 'todas' ? 'Nadie debe nada' : 'Ninguna orden en este filtro'}</h4>
              <p>{seg === 'todas' ? 'Todas las órdenes facturadas están pagadas.' : 'Toca «Todas» para ver la cartera completa.'}</p>
            </div>
          ) : (
            <table className="tbl tbl-cards tbl--cartera">
              <thead>
                <tr>
                  <th>OT</th>
                  <th>Cliente</th>
                  <th>Facturada</th>
                  <th className="th-num">Días</th>
                  <th className="th-num">Total</th>
                  <th className="th-num">Abonado</th>
                  <th className="th-num">Saldo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vista.map(f => {
                  const d = dias(f)
                  return (
                    <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => setSel(f)}>
                      <td className="c-mono" data-label="OT">{f.ot_codigo || '—'}</td>
                      <td className="c-name" data-label="Cliente" title={f.cliente || ''}>
                        {f.cliente || <span className="hd-empty">Sin cliente</span>}
                        {f.placa && <span className="hd-sub" style={{ marginLeft: 8 }}>{f.placa}</span>}
                      </td>
                      <td className="c-muted" data-label="Facturada">{f.facturado_en ? fmtDate(f.facturado_en) : <span className="hd-empty">Sin factura</span>}</td>
                      <td className="td-num" data-label="Días">
                        {d == null ? <span className="hd-empty">—</span>
                          : vencida(f) ? <span className="hd-chip hd-chip--warn">{d} D</span>
                          : <span className="c-muted">{d}</span>}
                      </td>
                      <td className="td-num c-muted" data-label="Total">{fmt(f.total)}</td>
                      <td className="td-num c-muted" data-label="Abonado">{Number(f.abonado) > 0 ? fmt(f.abonado) : <span className="hd-empty">—</span>}</td>
                      <td className="td-num td-saldo" data-label="Saldo">{fmt(f.saldo)}</td>
                      <td className="td-acc">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSel(f) }}>Abono</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{vista.length} {vista.length === 1 ? 'orden' : 'órdenes'}</td>
                  <td className="td-num">{fmt(suma(vista, 'total'))}</td>
                  <td className="td-num">{fmt(suma(vista, 'abonado'))}</td>
                  <td className="td-num td-saldo">{fmt(suma(vista, 'saldo'))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {sel && (
        <div className="modal-overlay" onClick={() => setSel(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal__h">
              <div>
                <h3>{sel.ot_codigo || 'Orden'} · {sel.cliente || 'Sin cliente'}</h3>
                <p>{[sel.placa, sel.facturado_en ? `facturada el ${fmtDate(sel.facturado_en)}` : 'sin factura'].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" className="icobtn" onClick={() => setSel(null)} aria-label="Cerrar"><IconX /></button>
            </div>
            <div className="modal__b">
              <PagosOT
                trabajo={trabajoDe(sel)}
                notify={notify}
                onPagado={(v) => actualizarTrabajo?.(sel.id, { pagado: v })}
                onCambio={cargar}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
