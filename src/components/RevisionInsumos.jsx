// Los insumos que cargo un mecanico desde el taller, para que la oficina los
// revise dentro del formulario de la OT (utils/insumosPropuestos).
//
// Aprobar o corregir agrega la linea a la orden como cualquier otra; descartar
// solo la marca. Nada se escribe hasta Guardar: ahi TrabajoForm saca las
// decisiones de como quedo la orden (decisionesDeRevision).
import { useState } from 'react'
import { fmt, fmtCant, fmtHace, totalLinea } from '../utils/helpers'
import { ESTADO_PROPUESTA, lineaDesdePropuesta } from '../utils/insumosPropuestos'
import MoneyInput from './MoneyInput'
import { Button } from './ui'

const H3 = { fontSize: 13.5, fontWeight: 700 }
const hora = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
}

export default function RevisionInsumos({ propuestas, items, descartadas, onDescartar, onAgregarLinea, onQuitarLinea }) {
  const [corrigiendo, setCorrigiendo] = useState(null) // { id, cantidad, precio }
  const pendientes = (Array.isArray(propuestas) ? propuestas : []).filter(p => p?.estado === ESTADO_PROPUESTA.PENDIENTE)
  if (!pendientes.length) return null

  const lineaDe = new Map((items || []).filter(i => i?.propuestaId).map(i => [i.propuestaId, i]))
  const enOrden = new Set(lineaDe.keys())
  const sinRevisar = pendientes.filter(p => !enOrden.has(p.id) && !descartadas.has(p.id)).length

  const aceptar = (p, valores) => {
    onAgregarLinea(lineaDesdePropuesta(p, valores))
    setCorrigiendo(null)
  }

  return (
    <div className="card">
      <div className="card__h" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <h3 style={H3}>Insumos del taller</h3>
          <span className="hd-sub" style={{ display: 'block', marginTop: 3 }}>No cuentan en la orden hasta que los apruebes.</span>
        </span>
        <span className={`hd-chip hd-chip--${sinRevisar ? 'warn' : 'ok'}`}>{sinRevisar ? `${sinRevisar} POR REVISAR` : 'REVISADOS'}</span>
      </div>
      <ul className="rvi__lista">
        {pendientes.map(p => {
          const agregada = enOrden.has(p.id)
          const descartada = descartadas.has(p.id)
          const fix = corrigiendo?.id === p.id ? corrigiendo : null
          const origen = p.sku ? `SKU ${p.sku}` : p.productoId ? 'Del inventario' : 'Escrito a mano, sin producto'
          // Ya en la orden se muestra lo que va a cobrarse (la linea, que pudo
          // corregirse), no lo que cargo el mecanico.
          const valores = agregada ? lineaDe.get(p.id) : p
          return (
            <li key={p.id} className={`rvi__i${descartada ? ' is-descartada' : ''}`}>
              <div className="rvi__b">
                <div className="rvi__n">{p.nombre}</div>
                <div className="rvi__s">
                  {[p.cargadoPorNombre || p.cargadoPor, `${fmtHace(p.cargadoEn)} ${hora(p.cargadoEn)}`.trim(), origen].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="rvi__v">{fmtCant(valores)} × {Number(valores.precio) ? fmt(valores.precio) : 'sin precio'}{Number(valores.precio) ? ` = ${fmt(totalLinea(valores))}` : ''}</span>
              <div className="rvi__acc">
                {agregada ? (
                  <>
                    <span className="hd-chip hd-chip--ok">EN LA ORDEN</span>
                    <Button variant="ghost" size="sm" onClick={() => onQuitarLinea(p.id)}>Deshacer</Button>
                  </>
                ) : descartada ? (
                  <>
                    <span className="hd-chip hd-chip--mute">SE DESCARTA AL GUARDAR</span>
                    <Button variant="ghost" size="sm" onClick={() => onDescartar(p.id, false)}>Deshacer</Button>
                  </>
                ) : !fix && (
                  <>
                    {/* Sin precio no se puede aprobar tal cual: se corrige. */}
                    <Button variant="primary" size="sm" disabled={!p.precio} title={p.precio ? undefined : 'Ponle el precio con Corregir'} onClick={() => aceptar(p)}>Aprobar</Button>
                    <Button variant="outline" size="sm" onClick={() => setCorrigiendo({ id: p.id, cantidad: String(p.cantidad).replace('.', ','), precio: p.precio || '' })}>Corregir</Button>
                    <Button variant="ghost" size="sm" onClick={() => onDescartar(p.id, true)}>Descartar</Button>
                  </>
                )}
              </div>
              {fix && (
                <div className="rvi__fix">
                  <label className="rvi__fix-c">
                    Cantidad
                    <input className="input" inputMode="decimal" value={fix.cantidad}
                      onChange={e => setCorrigiendo({ ...fix, cantidad: e.target.value.replace(/[^\d.,]/g, '') })} />
                  </label>
                  <label>
                    Precio con IVA
                    <MoneyInput className="input rvi__fix-p" value={fix.precio} onChange={v => setCorrigiendo({ ...fix, precio: v })} />
                  </label>
                  <Button variant="outline" size="sm" onClick={() => setCorrigiendo(null)}>Cancelar</Button>
                  <Button variant="primary" size="sm"
                    disabled={!(Number(String(fix.cantidad).replace(',', '.')) > 0)}
                    onClick={() => aceptar(p, { cantidad: Number(String(fix.cantidad).replace(',', '.')), precio: Number(fix.precio) || 0 })}>
                    Agregar a la orden
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
