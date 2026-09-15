import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt } from '../utils/helpers'
import { productoPorReferencia, grabarProductoMovil } from '../services/cuentti'
import { PRECIO_SIMBOLICO } from '../utils/saludInventario.js'
import { esGenerico, SKU_MANO_OBRA } from '../utils/referenciaRepuesto.js'
import MoneyInput from './MoneyInput'
import { Button, IconX } from './ui'

// Crear en Cuentti el producto de una línea de repuesto sin salir de la OT.
//
// Regla del dueño (15 sep 2026): un repuesto no se factura sin su producto del
// inventario, y si la pieza no está creada se crea en el momento.
//
// Antes de crear se busca la referencia en Cuentti: guardar no avisa si ya
// existe, y un segundo producto con la misma referencia parte el inventario en
// dos. El producto nace con existencias 0 y sin costo: el costo lo pone Cuentti
// al registrar la compra, y hasta entonces esa venta no entra al margen.

// Impuesto de Cuentti: 5 = IVA 19%, 4 = exento (api/mcp/cuentti.js, crear_producto).
const ID_IMPUESTO = { 19: 5, 0: 4 }

const limpiar = (v) => String(v || '').trim().toUpperCase()

export default function CrearProducto({ linea, inventario = [], ot = '', onListo, onClose }) {
  const [form, setForm] = useState(() => ({
    nombre: String(linea?.nombre || '').trim().toUpperCase(),
    sku: '',
    codigoBarras: '',
    precio: Math.round(parseFloat(linea?.precio) || 0),
    iva: parseFloat(linea?.iva) === 0 ? 0 : 19,
  }))
  const [paso, setPaso] = useState('form') // form | trabajando
  const [error, setError] = useState('')
  const [enCuentti, setEnCuentti] = useState(null) // la referencia ya existía en Cuentti
  const nombreRef = useRef(null)
  const trabajando = paso === 'trabajando'
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(''); if (k === 'sku' || k === 'codigoBarras') setEnCuentti(null) }

  // Foco al abrir, una sola vez: el formulario de la OT se vuelve a pintar cada
  // 10 s (el "hace Xs" del inventario) y no puede devolver el foco al nombre
  // mientras se escribe la referencia.
  useEffect(() => {
    const t = setTimeout(() => nombreRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  // Si la referencia ya está en el inventario sincronizado, no hace falta ni
  // preguntarle a Cuentti: se ofrece usar ese producto.
  const enInventario = useMemo(() => {
    const s = limpiar(form.sku)
    const b = limpiar(form.codigoBarras)
    if (!s && !b) return null
    // El genérico y MO1 existen, pero ofrecerlos sería volver al problema.
    if (esGenerico(s) || s === SKU_MANO_OBRA) return null
    return inventario.find(p => {
      const refs = [p.sku, p.codigoBarras, p.codigo].map(limpiar).filter(Boolean)
      return (s && refs.includes(s)) || (b && refs.includes(b))
    }) || null
  }, [inventario, form.sku, form.codigoBarras])
  const existente = enCuentti || enInventario

  const sinIva = form.precio / (1 + form.iva / 100)

  const validar = () => {
    const sku = limpiar(form.sku)
    if (!form.nombre.trim()) return 'Escribe el nombre del producto.'
    if (!sku) return 'Escribe la referencia de la pieza: la del proveedor o la que trae la caja.'
    if (/\s/.test(sku)) return 'La referencia va sin espacios.'
    if (esGenerico(sku) || sku === SKU_MANO_OBRA) return 'Esa referencia es de un genérico: usa la de la pieza.'
    if (!(form.precio > 0)) return 'Escribe el precio de venta.'
    if (sinIva < PRECIO_SIMBOLICO) return `Sin IVA el precio queda en ${fmt(sinIva)}: revisa si falta un cero.`
    return ''
  }

  const crear = async (e) => {
    e.preventDefault()
    if (trabajando || existente) return
    const msg = validar()
    if (msg) { setError(msg); return }
    setPaso('trabajando')
    setError('')
    const sku = limpiar(form.sku)
    const barras = limpiar(form.codigoBarras)
    try {
      const ya = await productoPorReferencia(sku) || (barras ? await productoPorReferencia(barras) : null)
      if (ya) { setEnCuentti(ya); setPaso('form'); return }
      const resp = await grabarProductoMovil({
        nombre: form.nombre.trim().toUpperCase(),
        sku,
        codigoBarras: barras,
        precioVenta: Math.round(sinIva * 100) / 100,
        idImpuesto: ID_IMPUESTO[form.iva],
        esServicio: false,
        existencias: 0,
        nota: ot ? `Creado desde la ${ot}` : 'Creado desde una orden de trabajo',
      })
      // Cuentti responde sus errores con HTTP 200 y el motivo en el cuerpo.
      if (resp && typeof resp === 'object' && Number(resp.type) === 0) throw new Error(resp.message || 'Cuentti no guardó el producto')
      const creado = await productoPorReferencia(sku)
      if (!creado) throw new Error('Cuentti no confirma el producto nuevo. Búscalo en Cuentti antes de volver a crearlo, para no duplicarlo.')
      onListo(creado, { creado: true })
    } catch (err) {
      setError(err.message || 'No se pudo crear el producto.')
      setPaso('form')
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !trabajando && onClose()} role="presentation" style={{ zIndex: 1000 }}
      onKeyDown={e => { if (e.key === 'Escape' && !trabajando) onClose() }}>
      <div className="modal" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-label="Crear producto en Cuentti" onClick={e => e.stopPropagation()}>
        <div className="modal__h">
          <div>
            <h3>Crear producto en Cuentti</h3>
            <p>Para que esta pieza se pueda facturar y descuente del inventario.</p>
          </div>
          <button type="button" className="icobtn" onClick={onClose} disabled={trabajando} aria-label="Cerrar"><IconX /></button>
        </div>
        <form onSubmit={crear}>
          <div className="modal__b cp-form">
            <div className="field">
              <label htmlFor="cp-nombre">Nombre</label>
              <input id="cp-nombre" ref={nombreRef} className="input" value={form.nombre} maxLength={120}
                onChange={e => set('nombre', e.target.value)} placeholder="Ej. CAMPANA DE FRENO TRASERA WINGLE 5" />
            </div>
            <div className="cp-form__2">
              <div className="field">
                <label htmlFor="cp-sku">Referencia</label>
                <input id="cp-sku" className="input" value={form.sku} maxLength={40} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  onChange={e => set('sku', e.target.value.toUpperCase())} placeholder="Ej. 7943GAM-I" />
              </div>
              <div className="field">
                <label htmlFor="cp-barras">Código de barras <span className="cp-form__opc">opcional</span></label>
                <input id="cp-barras" className="input" value={form.codigoBarras} maxLength={40} inputMode="numeric" autoCorrect="off" spellCheck={false}
                  onChange={e => set('codigoBarras', e.target.value)} />
              </div>
            </div>
            {existente && (
              <div className="cp-existe" role="status">
                <span>
                  {enCuentti ? 'Ya existe en Cuentti' : 'Ya está en el inventario'}: <strong>{existente.nombre}</strong>
                  {existente.sku ? ` (${existente.sku})` : ''}
                </span>
                <Button type="button" variant="primary" size="sm" onClick={() => onListo(existente, { creado: false })}>Usar ese producto</Button>
              </div>
            )}
            <div className="cp-form__2">
              <div className="field">
                <label htmlFor="cp-precio">Precio de venta con IVA</label>
                <MoneyInput id="cp-precio" className="input" value={form.precio} onChange={v => set('precio', Math.round(parseFloat(v) || 0))} />
              </div>
              <div className="field">
                <label>IVA</label>
                <div className="hd-seg cp-seg" role="group" aria-label="IVA">
                  {[19, 0].map(v => (
                    <button key={v} type="button" className={`hd-seg__i${form.iva === v ? ' on' : ''}`} aria-pressed={form.iva === v}
                      onClick={() => set('iva', v)}>{v === 0 ? 'Exento' : '19%'}</button>
                  ))}
                </div>
              </div>
            </div>
            <p className="cp-nota">
              Queda con existencias en 0 y sin costo. Cuando registres la compra en Cuentti, la pieza toma su costo y su venta entra al margen.
            </p>
            {error && <p className="cp-error" role="alert">{error}</p>}
          </div>
          <div className="modal__f">
            <Button type="button" variant="outline" onClick={onClose} disabled={trabajando}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={trabajando || !!existente}>{trabajando ? 'Creando…' : 'Crear producto'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
