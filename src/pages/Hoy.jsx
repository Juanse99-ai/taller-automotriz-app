// ============================================================
// HOY — la pantalla de entrada. Reemplaza al Dashboard de KPIs.
//
// El Dashboard mostraba cuatro tarjetas idénticas con números que solo
// informan. Aquí cada renglón es ALGO QUE HACER, con su plata y su botón, y la
// lista se vacía a medida que se resuelve. La jerarquía la dan el tamaño y el
// peso: manda una sola cifra (la de mayor impacto) y el resto baja de rango.
// Sin grillas de tarjetas gemelas ni recuadros de color decorativos.
// ============================================================
import { useMemo } from 'react'
import { fmt } from '../utils/helpers'
import { ESTADOS, SIN_FACTURA, COMISION } from '../utils/constants'
import { manoObraBase } from '../utils/comision'
import { Button } from '../components/ui'

// Una factura está "por cobrar" si salió al cliente y todavía no entra a caja.
// SIN_FACTURA marca lo cobrado por fuera: no cuenta como pendiente.
const porCobrar = (t) =>
  !!t.cuenttiTransacionId && t.cuenttiTransacionId !== SIN_FACTURA && !t.pagado && (t.total || 0) > 0

export default function Hoy({ trabajos = [], cotizaciones = [], liquidacionHook, onNavigate, user }) {
  const vivos = useMemo(() => trabajos.filter(t => !t.deleted), [trabajos])

  const cobros = useMemo(() => {
    const list = vivos.filter(porCobrar)
    return { n: list.length, total: list.reduce((s, t) => s + (t.total || 0), 0) }
  }, [vivos])

  // Comisiones pendientes: mismo criterio que Liquidación (completado y sin
  // liquidar). Se calcula aquí solo para ANUNCIAR; el pago se hace allá.
  const porPagar = useMemo(() => {
    const liq = new Set(liquidacionHook?.liquidados || [])
    const pend = vivos.filter(t =>
      t.estado === ESTADOS.COMPLETADO &&
      !liq.has(t.id) && ![...liq].some(k => typeof k === 'string' && k.startsWith(`${t.id}#`)))
    // Sin técnico asignado no hay a quién pagarle: son un pendiente DISTINTO
    // (hay que asignarlas), y mezclarlas daba "0 técnicos · 6 órdenes · $0".
    const conTec = pend.filter(t => t.tecnicoId)
    const total = conTec.reduce((s, t) => s + Math.round(manoObraBase(t) * COMISION.TOTAL), 0)
    const tecnicos = new Set(conTec.map(t => t.tecnicoId))
    return { n: conTec.length, tecnicos: tecnicos.size, total, huerfanas: pend.length - conTec.length }
  }, [vivos, liquidacionHook?.liquidados])

  const cotizPend = useMemo(() => {
    const list = (cotizaciones || []).filter(c => (c.estado || 'Pendiente') === 'Pendiente')
    return { n: list.length, total: list.reduce((s, c) => s + (c.total || 0), 0) }
  }, [cotizaciones])

  const recientes = useMemo(() =>
    [...vivos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 6),
  [vivos])

  const nada = cobros.n === 0 && porPagar.total === 0 && porPagar.huerfanas === 0 && cotizPend.n === 0

  return (
    <div>
      <style>{`
        /* Sin cifra gigante. Antes esto abria con un numero enorme y estadisticas
           debajo — el patron "hero metric", el mas reconocible de las interfaces
           generadas por IA, y ademas informa en vez de resolver.
           Ahora TODO pendiente es un renglon accionable del mismo tipo: que hay
           que hacer, cuanta plata mueve y por donde se resuelve. La lista se
           vacia a medida que se atiende. */
        .hoy-r{display:flex;align-items:center;gap:16px;padding:16px 2px;
          border-bottom:1px solid var(--border);width:100%;background:none;border-left:0;
          border-right:0;border-top:0;text-align:left;cursor:pointer;font:inherit}
        .hoy-r:hover{background:var(--bg-subtle)}
        .hoy-r__t{font-weight:600;font-size:16.5px;color:var(--text)}
        .hoy-r__s{color:var(--text-3);font-size:14px;margin-top:1px}
        .hoy-r__m{font-family:var(--mono);font-variant-numeric:tabular-nums;font-weight:650;
          font-size:16px;white-space:nowrap;text-align:right}
        /* El pendiente que mas pesa: se marca con el peso del texto y con su
           boton, no agrandando la cifra al triple. */
        .hoy-r--top .hoy-r__t{font-weight:700}
        .hoy-r--top .hoy-r__m{font-weight:750}
        .hoy-r__go{flex-shrink:0}
        .hoy-ok{padding:40px 20px;text-align:center}
        .hoy-ok h3{font-size:19px;font-weight:700;margin:0 0 6px}
        .hoy-ok p{color:var(--text-3);font-size:15px;margin:0}
      `}</style>

      <div className="pagehd">
        <div><h2>Hoy</h2></div>
      </div>
      <p style={{ color: 'var(--text-3)', fontSize: 15, margin: '0 0 26px' }}>
        Pendientes del día. Cuando la lista queda vacía, no hay nada represado.
      </p>

      {nada ? (
        <div className="hoy-ok">
          <h3>Todo al día</h3>
          <p>No hay facturas por cobrar, comisiones pendientes ni cotizaciones esperando respuesta.</p>
        </div>
      ) : (
        <>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {cobros.n > 0 && (
              <button type="button" className="hoy-r hoy-r--top" onClick={() => onNavigate('cuentti')}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="hoy-r__t" style={{ display: 'block' }}>
                    {cobros.n} {cobros.n === 1 ? 'factura por cobrar' : 'facturas por cobrar'}
                  </span>
                  <span className="hoy-r__s" style={{ display: 'block' }}>Emitidas y pendientes de ingreso a caja</span>
                </span>
                <span className="hoy-r__m" style={{ color: 'var(--amber-700)' }}>{fmt(cobros.total)}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 20 }}>›</span>
              </button>
            )}
            {porPagar.tecnicos > 0 && porPagar.total > 0 && (
              <button type="button" className="hoy-r" onClick={() => onNavigate('liquidacion')}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="hoy-r__t" style={{ display: 'block' }}>
                    {porPagar.tecnicos === 1 ? '1 técnico pendiente de pago' : `${porPagar.tecnicos} técnicos pendientes de pago`}
                  </span>
                  <span className="hoy-r__s" style={{ display: 'block' }}>
                    {porPagar.n} {porPagar.n === 1 ? 'orden terminada' : 'órdenes terminadas'} · comisión del {COMISION.TOTAL * 100}%
                  </span>
                </span>
                <span className="hoy-r__m" style={{ color: 'var(--green-700)' }}>{fmt(porPagar.total)}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 20 }}>›</span>
              </button>
            )}

            {porPagar.huerfanas > 0 && (
              <button type="button" className="hoy-r" onClick={() => onNavigate('trabajos')}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="hoy-r__t" style={{ display: 'block' }}>
                    {porPagar.huerfanas === 1 ? '1 orden sin técnico asignado' : `${porPagar.huerfanas} órdenes sin técnico asignado`}
                  </span>
                  <span className="hoy-r__s" style={{ display: 'block' }}>
                    Su comisión no se le puede pagar a nadie hasta asignarlas
                  </span>
                </span>
                <span className="hoy-r__m" style={{ color: 'var(--red-600)', fontSize: 15 }}>Asignar</span>
                <span style={{ color: 'var(--text-3)', fontSize: 20 }}>›</span>
              </button>
            )}

            {cotizPend.n > 0 && (
              <button type="button" className="hoy-r" onClick={() => onNavigate('cotizaciones')}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="hoy-r__t" style={{ display: 'block' }}>
                    {cotizPend.n} {cotizPend.n === 1 ? 'cotización sin respuesta' : 'cotizaciones sin respuesta'}
                  </span>
                  <span className="hoy-r__s" style={{ display: 'block' }}>A la espera de aprobación del cliente</span>
                </span>
                <span className="hoy-r__m" style={{ color: 'var(--text-2)' }}>{fmt(cotizPend.total)}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 20 }}>›</span>
              </button>
            )}
          </div>
        </>
      )}

      <div className="eyebrow" style={{ margin: '34px 0 10px' }}>Últimas órdenes</div>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {recientes.length === 0 ? (
          <div style={{ padding: '22px 2px', color: 'var(--text-3)', fontSize: 14.5 }}>
            Todavía no hay órdenes registradas.
          </div>
        ) : recientes.map(t => {
          const cobrada = !!t.pagado || t.cuenttiTransacionId === SIN_FACTURA
          const sinVeh = !!t.sinVehiculo || (t.placa || '').trim().toUpperCase() === 'SERVICIO'
          return (
            <button key={t.id} type="button" className="hoy-r" onClick={() => onNavigate('trabajos')}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="hoy-r__t" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.cliente || 'Sin cliente'}
                </span>
                <span className="hoy-r__s" style={{ display: 'block' }}>
                  {sinVeh ? 'Servicio de mostrador' : (t.placa || 'Sin placa')}
                  {t.otCodigo ? ` · ${t.otCodigo}` : ''}
                </span>
              </span>
              <span className="badge" style={{
                background: cobrada ? 'var(--soft-green)' : 'var(--soft-amber)',
                color: cobrada ? 'var(--green-700)' : 'var(--amber-700)', fontWeight: 700,
              }}>{cobrada ? 'Cobrada' : 'Por cobrar'}</span>
              <span className="hoy-r__m">{fmt(t.total)}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 20 }}>›</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
