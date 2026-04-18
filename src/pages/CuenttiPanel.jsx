import { useState } from 'react'
import { fmt } from '../utils/helpers'
import {
  buscarClientePorCedula,
  cargarInventario,
  enviarFactura,
  buildFacturaPayload,
  emitirFacturaElectronica,
  agregarPagoTransacion,
  obtenerUrlDocumento,
  grabarProductoMovil,
  getCuenttiDebugHeaders,
  testTokenDirecto,
} from '../services/cuentti'
import { RESOLUCIONES } from '../utils/constants'

export default function CuenttiPanel({ trabajos, notify }) {
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [facturaId, setFacturaId] = useState('')
  const [facturando, setFacturando] = useState(false)
  const [facturaResp, setFacturaResp] = useState(null)
  const [previewPayload, setPreviewPayload] = useState(null)
  const [previewHeaders, setPreviewHeaders] = useState(null)
  const [ultimoPayload, setUltimoPayload] = useState(null)
  const [ultimoHeaders, setUltimoHeaders] = useState(null)
  const [prefijo, setPrefijo] = useState('MAS')
  const resoluciones = [
    { code: 'MAS', label: `MAS — ${RESOLUCIONES.MAS?.nombre || 'Interna'}` },
    { code: 'FEIC', label: `FEIC — ${RESOLUCIONES.FEIC?.nombre || 'Electronica'}` },
  ]

  const [emitId, setEmitId] = useState('')
  const [emitiendo, setEmitiendo] = useState(false)
  const [emitResp, setEmitResp] = useState(null)

  const [pagoForm, setPagoForm] = useState({
    idTransacion: '',
    valor: '',
    idMedioPago: 1,
    idBanco: 2,
    nota: '',
    devuelta: 0,
  })
  const [pagando, setPagando] = useState(false)
  const [pagoResp, setPagoResp] = useState(null)

  const [docId, setDocId] = useState('')
  const [docResp, setDocResp] = useState(null)
  const [docLoading, setDocLoading] = useState(false)

  const [productoForm, setProductoForm] = useState({
    nombre: '',
    precioVenta: '',
    existencias: 0,
    sku: '',
    codigoBarras: '',
    esServicio: false,
    idCategoria: 1,
    idMarca: 1,
    idImpuesto: 1,
    nota: '',
  })
  const [productoResp, setProductoResp] = useState(null)
  const [productoLoading, setProductoLoading] = useState(false)

  const formatJson = (data) => {
    if (data === null || data === undefined) return ''
    if (typeof data === 'string') return data
    try { return JSON.stringify(data, null, 2) } catch { return String(data) }
  }

  const extractIdTransacion = (res) =>
    res?.id_transacion || res?.id_transaccion || res?.idTransacion || res?.idTransaccion
    || res?.data?.id_transacion || res?.transacion?.id_transacion || res?.transaccion?.id_transaccion
    || ''

  const refreshPreview = (trabajoId, pref = prefijo) => {
    const trabajoSel = trabajos.find(t => t.id === (trabajoId || '').trim())
    if (!trabajoSel || !trabajoSel.items || trabajoSel.items.length === 0) {
      setPreviewPayload(null)
      setPreviewHeaders(null)
      return
    }
    try {
      const body = buildFacturaPayload({ ...trabajoSel, resolucion: pref })
      setPreviewPayload(body)
      setPreviewHeaders(getCuenttiDebugHeaders())
    } catch (e) {
      console.warn('Preview Cuentti error:', e)
      setPreviewPayload(null)
      setPreviewHeaders(null)
    }
  }

  const testConexion = async () => {
    setTesting(true)
    setTestResult(null)

    // Test directo: muestra respuesta cruda de Cuentti sin ocultar errores
    const tokenTest = await testTokenDirecto()
    const results = {
      tokenRaw: tokenTest,
      clientes: tokenTest.ok
        ? (tokenTest.data ? 'OK - Respuesta recibida' : 'OK - Sin datos')
        : `ERROR: ${tokenTest.error || JSON.stringify(tokenTest.body)}`,
      inventario: null,
    }

    try {
      const items = await cargarInventario(0)
      results.inventario = `OK - ${items.length} productos en pagina 1`
    } catch (e) {
      results.inventario = `Error: ${e.message}`
    }

    setTestResult(results)
    setTesting(false)
  }

  const facturarTrabajo = async () => {
    if (!facturaId.trim()) return
    const trabajo = trabajos.find(t => t.id === facturaId.trim())
    if (!trabajo) {
      notify('Trabajo no encontrado con ese ID', 'error')
      return
    }
    if (!trabajo.items || trabajo.items.length === 0) {
      notify('El trabajo no tiene items para facturar', 'error')
      return
    }

    setFacturando(true)
    try {
      const payload = buildFacturaPayload({ ...trabajo, resolucion: prefijo })
      setPreviewPayload(payload)
      setPreviewHeaders(getCuenttiDebugHeaders())
      setUltimoPayload(payload)
      setUltimoHeaders(getCuenttiDebugHeaders())
      const result = await enviarFactura({ ...trabajo, resolucion: prefijo })
      setFacturaResp(result)
      const txId = extractIdTransacion(result)
      if (txId) {
        setEmitId(txId.toString())
        setPagoForm(p => ({ ...p, idTransacion: txId.toString(), valor: trabajo.total || p.valor }))
        setDocId(txId.toString())
      }
      notify('Factura enviada a Cuentti exitosamente', 'success')
      console.log('Factura result:', result)
    } catch (e) {
      setFacturaResp({ error: e.message, detalle: e.body || e.headers || e.stack })
      notify(`Error facturando: ${e.message}`, 'error')
      console.error('Factura error detalle:', e)
    } finally {
      setFacturando(false)
    }
  }

  const emitirFE = async () => {
    if (!emitId.trim()) { notify('Ingresa el id_transacion que devolvio Cuentti', 'error'); return }
    setEmitiendo(true)
    setEmitResp(null)
    try {
      const res = await emitirFacturaElectronica(emitId.trim())
      setEmitResp(res)
      notify('Solicitud de FE enviada a DIAN', 'success')
    } catch (e) {
      notify(`Error emitiendo FE: ${e.message}`, 'error')
    } finally {
      setEmitiendo(false)
    }
  }

  const agregarPago = async () => {
    if (!pagoForm.idTransacion.trim()) { notify('Falta el id_transacion para aplicar el pago', 'error'); return }
    setPagando(true)
    setPagoResp(null)
    try {
      const res = await agregarPagoTransacion({
        ...pagoForm,
        valor: parseFloat(pagoForm.valor) || 0,
        devuelta: parseFloat(pagoForm.devuelta) || 0,
      })
      setPagoResp(res)
      notify('Pago agregado en Cuentti', 'success')
    } catch (e) {
      notify(`Error agregando pago: ${e.message}`, 'error')
    } finally {
      setPagando(false)
    }
  }

  const buscarDocumento = async () => {
    if (!docId.trim()) { notify('Ingresa un id_transacion para consultar el documento', 'error'); return }
    setDocLoading(true)
    setDocResp(null)
    try {
      const res = await obtenerUrlDocumento(docId.trim())
      setDocResp(res)
      notify('Consulta de documento realizada', 'success')
    } catch (e) {
      notify(`Error obteniendo URL: ${e.message}`, 'error')
    } finally {
      setDocLoading(false)
    }
  }

  const grabarProducto = async (e) => {
    e.preventDefault()
    if (!productoForm.nombre || !productoForm.precioVenta) {
      notify('Nombre y precio de venta son obligatorios', 'error')
      return
    }
    setProductoLoading(true)
    setProductoResp(null)
    try {
      const res = await grabarProductoMovil(productoForm)
      setProductoResp(res)
      notify('Producto enviado a Cuentti', 'success')
    } catch (err) {
      notify(`Error grabando producto: ${err.message}`, 'error')
    } finally {
      setProductoLoading(false)
    }
  }

  // Trabajos facturables (completados con items)
  const facturables = trabajos.filter(t =>
    t.estado === 'Completado' && t.items && t.items.length > 0
  )

  return (
    <div>
      {/* Test de conexion */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Test de Conexion</div>
          <button className="btn btn-primary btn-sm" onClick={testConexion} disabled={testing}>
            {testing ? 'Probando...' : 'Probar Conexion'}
          </button>
        </div>
        {testResult && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Endpoint</th><th>Resultado</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Clientes</td>
                    <td>
                      <span className={`badge ${testResult.clientes.startsWith('OK') ? 'badge-success' : 'badge-danger'}`}>
                        {testResult.clientes}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Inventario</td>
                    <td>
                      <span className={`badge ${testResult.inventario.startsWith('OK') ? 'badge-success' : 'badge-danger'}`}>
                        {testResult.inventario}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {testResult.tokenRaw && (
              <div style={{ marginTop: 12 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Respuesta cruda del token test (para diagnostico):</div>
                <pre style={{ background: '#0f172a', color: testResult.tokenRaw.ok ? '#86efac' : '#fca5a5', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
                  {formatJson(testResult.tokenRaw)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Facturacion directa */}
      <div className="card">
        <div className="card-title">Facturar Trabajo</div>
        <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
          Selecciona un trabajo completado para enviar la factura a Cuentti.
        </p>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select className="form-select" value={facturaId} onChange={e => { const v = e.target.value; setFacturaId(v); refreshPreview(v, prefijo) }}>
              <option value="">Seleccionar trabajo...</option>
              {facturables.map(t => (
                <option key={t.id} value={t.id}>
                  {t.id} — {t.placa} — {t.cliente} — {fmt(t.total)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <select className="form-select" value={prefijo} onChange={e => { const v = e.target.value; setPrefijo(v); if (facturaId) refreshPreview(facturaId, v) }}>
              {resoluciones.map(r => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Prefijo / resolucion que usara Cuentti (MAS o FEIC)
            </div>
          </div>
          <div>
            <button className="btn btn-success" onClick={facturarTrabajo}
              disabled={!facturaId || facturando}>
              {facturando ? 'Enviando...' : 'Enviar a Cuentti'}
            </button>
          </div>
      </div>
    </div>

      {previewPayload && (
        <div className="card">
          <div className="card-title">Previsualizacion de envio</div>
          <p className="text-sm text-muted" style={{ marginBottom: 10 }}>
            Payload que se enviara a Cuentti (token en headers enmascarado).
          </p>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
            {formatJson(previewPayload)}
          </pre>
          {previewHeaders && (
            <>
              <div className="text-xs text-muted" style={{ marginTop: 6 }}>Headers</div>
              <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
                {formatJson(previewHeaders)}
              </pre>
            </>
          )}
        </div>
      )}

      {ultimoPayload && (
        <div className="card">
          <div className="card-title">Ultimo payload enviado</div>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
            {formatJson(ultimoPayload)}
          </pre>
          {ultimoHeaders && (
            <>
              <div className="text-xs text-muted" style={{ marginTop: 6 }}>Headers</div>
              <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
                {formatJson(ultimoHeaders)}
              </pre>
            </>
          )}
        </div>
      )}

      {facturaResp && (
        <div className="card">
          <div className="card-title">Ultima respuesta de facturacion</div>
          <p className="text-sm text-muted" style={{ marginBottom: 10 }}>
            id_transacion detectado: <span className="text-mono">{extractIdTransacion(facturaResp) || '—'}</span>
          </p>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
            {formatJson(facturaResp)}
          </pre>
        </div>
      )}

      <div className="card">
        <div className="card-title">Emitir Factura Electronica (DIAN)</div>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">id_transacion</label>
            <input className="form-input" value={emitId} placeholder="ID devuelto por grabarFacturaSimple"
              onChange={e => setEmitId(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-success" type="button" onClick={emitirFE} disabled={emitiendo || !emitId}>
              {emitiendo ? 'Enviando...' : 'Emitir FE + DIAN'}
            </button>
          </div>
        </div>
        {emitResp && (
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, marginTop: 10, overflowX: 'auto' }}>
            {formatJson(emitResp)}
          </pre>
        )}
      </div>

      <div className="card">
        <div className="card-title">Agregar Pago / Abono</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">id_transacion</label>
            <input className="form-input" value={pagoForm.idTransacion}
              onChange={e => setPagoForm(p => ({ ...p, idTransacion: e.target.value }))}
              placeholder="ID de la transaccion" />
          </div>
          <div className="form-group">
            <label className="form-label">Valor</label>
            <input className="form-input" type="number" value={pagoForm.valor}
              onChange={e => setPagoForm(p => ({ ...p, valor: e.target.value }))}
              placeholder="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Medio de pago (id_medio_pago)</label>
            <input className="form-input" type="number" value={pagoForm.idMedioPago}
              onChange={e => setPagoForm(p => ({ ...p, idMedioPago: parseInt(e.target.value) || 1 }))}
              placeholder="1 = efectivo" />
          </div>
          <div className="form-group">
            <label className="form-label">Banco (id_banco)</label>
            <input className="form-input" type="number" value={pagoForm.idBanco}
              onChange={e => setPagoForm(p => ({ ...p, idBanco: parseInt(e.target.value) || 0 }))}
              placeholder="2 = caja" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Nota / referencia</label>
            <input className="form-input" value={pagoForm.nota}
              onChange={e => setPagoForm(p => ({ ...p, nota: e.target.value }))}
              placeholder="Observaciones del pago" />
          </div>
          <div className="form-group" style={{ width: 160 }}>
            <label className="form-label">Devuelta</label>
            <input className="form-input" type="number" value={pagoForm.devuelta}
              onChange={e => setPagoForm(p => ({ ...p, devuelta: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={agregarPago} disabled={pagando || !pagoForm.idTransacion}>
              {pagando ? 'Enviando...' : 'Agregar Pago'}
            </button>
          </div>
        </div>
        {pagoResp && (
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, marginTop: 10, overflowX: 'auto' }}>
            {formatJson(pagoResp)}
          </pre>
        )}
      </div>

      <div className="card">
        <div className="card-title">URL del Documento (QR / PDF)</div>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">id_transacion</label>
            <input className="form-input" value={docId}
              onChange={e => setDocId(e.target.value)}
              placeholder="ID de la transaccion" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-outline" type="button" onClick={buscarDocumento} disabled={docLoading || !docId}>
              {docLoading ? 'Consultando...' : 'Obtener URL'}
            </button>
          </div>
        </div>
        {docResp && (
          <div style={{ marginTop: 10 }}>
            {(() => {
              const url = typeof docResp === 'string' ? docResp
                : docResp?.url || docResp?.qr || docResp?.qr_url || docResp?.qrUrl || docResp?.download_url || docResp?.link || ''
              return url && url.startsWith('http')
                ? <a href={url} target="_blank" rel="noreferrer" className="text-mono" style={{ color: 'var(--blue-600)' }}>{url}</a>
                : null
            })()}
            <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
              {formatJson(docResp)}
            </pre>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Grabar / Actualizar Producto Movil</div>
        <form onSubmit={grabarProducto}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={productoForm.nombre} required
                onChange={e => setProductoForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Nombre del articulo" />
            </div>
            <div className="form-group">
              <label className="form-label">Precio venta *</label>
              <input className="form-input" type="number" value={productoForm.precioVenta} required
                onChange={e => setProductoForm(p => ({ ...p, precioVenta: e.target.value }))}
                placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Existencias</label>
              <input className="form-input" type="number" value={productoForm.existencias}
                onChange={e => setProductoForm(p => ({ ...p, existencias: e.target.value }))}
                placeholder="0" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">SKU</label>
              <input className="form-input" value={productoForm.sku}
                onChange={e => setProductoForm(p => ({ ...p, sku: e.target.value }))}
                placeholder="Referencia interna" />
            </div>
            <div className="form-group">
              <label className="form-label">Codigo de barras</label>
              <input className="form-input" value={productoForm.codigoBarras}
                onChange={e => setProductoForm(p => ({ ...p, codigoBarras: e.target.value }))}
                placeholder="EAN/UPC" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria (id_categoria)</label>
              <input className="form-input" type="number" value={productoForm.idCategoria}
                onChange={e => setProductoForm(p => ({ ...p, idCategoria: parseInt(e.target.value) || 1 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Marca (id_marca)</label>
              <input className="form-input" type="number" value={productoForm.idMarca}
                onChange={e => setProductoForm(p => ({ ...p, idMarca: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Impuesto (id_impuesto)</label>
              <input className="form-input" type="number" value={productoForm.idImpuesto}
                onChange={e => setProductoForm(p => ({ ...p, idImpuesto: parseInt(e.target.value) || 1 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Nota</label>
              <input className="form-input" value={productoForm.nota}
                onChange={e => setProductoForm(p => ({ ...p, nota: e.target.value }))}
                placeholder="Observaciones" />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Es servicio</label>
              <input type="checkbox" checked={productoForm.esServicio}
                onChange={e => setProductoForm(p => ({ ...p, esServicio: e.target.checked }))} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={productoLoading}>
              {productoLoading ? 'Enviando...' : 'Grabar producto'}
            </button>
          </div>
        </form>
        {productoResp && (
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, marginTop: 10, overflowX: 'auto' }}>
            {formatJson(productoResp)}
          </pre>
        )}
      </div>

    </div>
  )
}
