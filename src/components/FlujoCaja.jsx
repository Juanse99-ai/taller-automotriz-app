import { useEffect, useMemo, useState } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { fetchDatosFlujo, fetchTotalCartera } from '../services/supabase'
import { GRUPOS_ENTRADA, GRUPOS_SALIDA, flujoDelMes, movimientosDelMes, resumirFlujo } from '../utils/flujoCaja'
import { sumarMeses, periodoDe, nombreMes } from '../utils/gastos'

// Flujo de caja del mes, dentro de Gastos: lo que entró, lo que salió y lo que
// falta, con cada cifra abierta en sus movimientos. La cuenta y sus fuentes
// viven en utils/flujoCaja.js.

const MESES_TABLA = 6
const signo = (n) => (n < 0 ? `−${fmt(-n)}` : fmt(n))
// "sep 2026" para la tabla en el celular, donde el nombre entero no cabe.
const mesCorto = (periodo) => `${nombreMes(periodo).slice(0, 3)} ${periodo.slice(0, 4)}`

function Grupo({ grupo, monto, movimientos }) {
  const lista = movimientos.filter(m => m.grupo === grupo.clave)
  return (
    <details className={`flj-grupo${monto > 0 ? '' : ' flj-grupo--cero'}`}>
      <summary className="flj-grupo__s">
        <span className="flj-grupo__t">
          <span className="flj-grupo__n">{grupo.titulo}</span>
          <span className="flj-grupo__de">{grupo.de}</span>
        </span>
        <span className="flj-grupo__v">{fmt(monto)}</span>
      </summary>
      {lista.length === 0 ? (
        <p className="flj-vacio">Nada en este mes.</p>
      ) : (
        <ul className="flj-movs">
          {lista.map((m, i) => (
            <li key={`${m.fecha}-${i}`} className="flj-mov">
              <span className="flj-mov__f">{fmtDate(m.fecha)}</span>
              <span className="flj-mov__c">{m.concepto}</span>
              <span className="flj-mov__v">{fmt(m.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

export default function FlujoCaja({ periodo, hoy, gastos, trabajos = [], porPagar = 0, vencido = 0, onVerGastos }) {
  const [carga, setCarga] = useState({ desde: null, datos: null, faltan: [], error: null })
  const [cartera, setCartera] = useState(null)

  // Seis meses para la tabla, y al menos el último año: cambiar de mes no
  // vuelve a pedir nada mientras quede dentro de lo ya leído.
  const desdeNecesario = [`${sumarMeses(periodo, 1 - MESES_TABLA)}-01`, `${sumarMeses(periodoDe(hoy), -11)}-01`].sort()[0]
  const falta = !carga.desde || desdeNecesario < carga.desde

  useEffect(() => {
    if (!falta) return
    let vivo = true
    fetchDatosFlujo(desdeNecesario)
      .then(({ datos, faltan }) => { if (vivo) setCarga({ desde: desdeNecesario, datos, faltan, error: null }) })
      .catch(e => { if (vivo) setCarga(c => ({ ...c, desde: desdeNecesario, error: e.message || 'No se pudieron leer los movimientos' })) })
    return () => { vivo = false }
  }, [falta, desdeNecesario])

  useEffect(() => {
    let vivo = true
    fetchTotalCartera().then(t => { if (vivo) setCartera(t) }).catch(() => { if (vivo) setCartera(null) })
    return () => { vivo = false }
  }, [])

  const ots = useMemo(() => new Map((trabajos || []).map(t => [t.id, t.otCodigo || t.id])), [trabajos])
  const datos = useMemo(() => (carga.datos ? { ...carga.datos, gastos: gastos || [] } : null), [carga.datos, gastos])
  const F = useMemo(() => (datos ? flujoDelMes(datos, periodo, ots) : null), [datos, periodo, ots])
  const meses = useMemo(() => {
    if (!datos) return []
    return Array.from({ length: MESES_TABLA }, (_, i) => sumarMeses(periodo, i + 1 - MESES_TABLA))
      .map(mes => ({ mes, ...resumirFlujo(movimientosDelMes(datos, mes)) }))
  }, [datos, periodo])

  const mes = nombreMes(periodo)
  const esEsteMes = periodo === periodoDe(hoy)

  if (carga.error && !carga.datos) {
    return <div className="card"><div className="empty"><h4>No se pudo armar el flujo de caja</h4><p>{carga.error}</p></div></div>
  }
  if (!F) {
    return <div className="card"><div className="empty"><p>Leyendo los movimientos del mes…</p></div></div>
  }

  return (
    <div className="flj">
      {carga.faltan.length > 0 && (
        <p className="gst-aviso" role="status">No se pudo leer: {carga.faltan.join(', ')}. Las cifras salen sin eso.</p>
      )}

      <div className="card flj-resumen">
        <div className="flj-fig">
          <div className="hd-fig__l">ENTRÓ</div>
          <div className="hd-fig__v">{fmt(F.entro)}</div>
        </div>
        <div className="flj-fig">
          <div className="hd-fig__l">SALIÓ</div>
          <div className="hd-fig__v">{fmt(F.salio)}</div>
        </div>
        <div className="flj-fig" style={{ '--fg': F.neto < 0 ? 'var(--bad-fg)' : 'var(--ok-fg)' }}>
          <div className="hd-fig__l">{esEsteMes ? 'VA QUEDANDO' : 'QUEDÓ'}</div>
          <div className="hd-fig__v">{signo(F.neto)}</div>
        </div>
      </div>

      <div className="flj-cols">
        <div className="card flj-col">
          <div className="card__h"><h3>Entró</h3></div>
          {GRUPOS_ENTRADA.map(g => <Grupo key={g.clave} grupo={g} monto={F.porGrupo[g.clave]} movimientos={F.movimientos} />)}
        </div>
        <div className="card flj-col">
          <div className="card__h"><h3>Salió</h3></div>
          {GRUPOS_SALIDA.map(g => <Grupo key={g.clave} grupo={g} monto={F.porGrupo[g.clave]} movimientos={F.movimientos} />)}
        </div>
      </div>

      <div className="card flj-falta">
        <div className="card__h"><h3>Lo que falta</h3></div>
        <div className="flj-falta__fila">
          <span className="flj-falta__t">
            Gastos fijos sin pagar de {mes.split(' ')[0]}
            {vencido > 0 && <span className="flj-falta__s">{fmt(vencido)} ya vencido</span>}
          </span>
          <span className="flj-falta__v">{fmt(porPagar)}</span>
          <button type="button" className="gst-mes__hoy" onClick={onVerGastos}>Ver gastos</button>
        </div>
        <div className="flj-falta__fila">
          <span className="flj-falta__t">
            Lo que te deben los clientes
            <span className="flj-falta__s">Cartera, a hoy</span>
          </span>
          <span className="flj-falta__v">{cartera == null ? '—' : fmt(cartera)}</span>
        </div>
      </div>

      <div className="card flj-meses">
        <div className="card__h"><h3>Últimos {MESES_TABLA} meses</h3></div>
        <div className="flj-meses__scroll">
          <table className="flj-tabla">
            <thead>
              <tr><th>Mes</th><th>Entró</th><th>Salió</th><th>Quedó</th></tr>
            </thead>
            <tbody>
              {meses.map(m => (
                <tr key={m.mes} className={m.mes === periodo ? 'flj-tabla__actual' : undefined}>
                  <td>
                    <span className="flj-tabla__largo">{nombreMes(m.mes)}</span>
                    <span className="flj-tabla__corto">{mesCorto(m.mes)}</span>
                    {m.mes === periodoDe(hoy) ? <span className="flj-tabla__va"> va a hoy</span> : null}
                  </td>
                  <td>{fmt(m.entro)}</td>
                  <td>{fmt(m.salio)}</td>
                  <td className={m.neto < 0 ? 'flj-neg' : undefined}>{signo(m.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flj-nota">
        <b>Qué no ve este flujo.</b> Las compras y los gastos que se registran directo en Cuentti, sin Claude, y las ventas de mostrador facturadas en Cuentti sin orden de trabajo.
        Los cobros de antes del 11 de septiembre de 2026 llevan la fecha de su factura, no la del pago. Del Estado de cuenta no se cuentan los descuentos ni los saldos a favor de una liquidación: ya van dentro de lo que se pagó en ella.
      </div>
    </div>
  )
}
