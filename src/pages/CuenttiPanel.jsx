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

export default function CuenttiPanel({ trabajos, actualizarTrabajo, notify }) {
  const [verFacturados, setVerFacturados] = useState(false)
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

  // SIMPLIFICADO: ya no manejamos IDs de medio_pago/banco. Toda factura se
  // envia como "A Credito" (sin pago). El usuario registra el pago real
  // manualmente en cuentti.co despues, donde Cuentti ya tiene sus propios
  // IDs internos resueltos. Asi evitamos los errores FK violation y el
  // usuario no tiene que adivinar numeros.

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

  const extractIdTransacion = (res) => {
    // Campo directo
    const directo = res?.id_transacion || res?.id_transaccion || res?.idTransacion || res?.idTransaccion
      || res?.data?.id_transacion || res?.transacion?.id_transacion || res?.transaccion?.id_transaccion
    if (directo) return directo

    // Extraer de retorno: "FEIC437;0;760;5335;2951;..." → posicion 3 es id_transaccion
    if (res?.retorno && typeof res.retorno === 'string') {
      const partes = res.retorno.split(';')
      if (partes.length >= 4 && partes[3]) return partes[3]
    }

    // Extraer de url_externa: "...?i=11464-1-0-9b16ac1b25b04791b0a4"
    if (res?.url_externa) {
      const match = res.url_externa.match(/[?&]i=([^&]+)/)
      if (match) return match[1]
    }

    return ''
  }

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
    // Anti-duplicado: si ya fue facturado, pedir confirmacion explicita
    if (trabajo.cuenttiTransacionId) {
      const fechaFmt = trabajo.facturadoEn ? new Date(trabajo.facturadoEn).toLocaleString('es-CO') : 'fecha desconocida'
      const ok = window.confirm(
        `Este trabajo ya fue facturado en Cuentti.\n\n` +
        `id_transacion: ${trabajo.cuenttiTransacionId}\n` +
        `Fecha: ${fechaFmt}\n\n` +
        `Si continuas se creara una NUEVA factura duplicada en Cuentti.\n\n` +
        `¿Reenviar de todas formas?`
      )
      if (!ok) {
        notify('Envio cancelado para evitar duplicado', 'info')
        return
      }
    }

    setFacturando(true)
    try {
      // Siempre enviamos como "A Credito" (sin pago en lstPagos). Esto evita
      // los errores FK violation con id_medio_pago e id_banco. El usuario
      // registra el pago real manualmente en cuentti.co despues si quiere.
      const facturaData = {
        ...trabajo,
        resolucion: prefijo,
        aCredito: true,
        observaciones: `OT: ${trabajo.otCodigo || trabajo.id} — ${trabajo.observaciones || ''}`.trim(),
      }
      const payload = buildFacturaPayload(facturaData)
      setPreviewPayload(payload)
      setPreviewHeaders(getCuenttiDebugHeaders())
      setUltimoPayload(payload)
      setUltimoHeaders(getCuenttiDebugHeaders())
      const result = await enviarFactura(facturaData)
      setFacturaResp(result)
      const txId = extractIdTransacion(result)
      if (txId) {
        setEmitId(txId.toString())
        setPagoForm(p => ({ ...p, idTransacion: txId.toString(), valor: trabajo.total || p.valor }))
        setDocId(txId.toString())
        // Marcar trabajo como facturado (anti-duplicado entre dispositivos)
        if (actualizarTrabajo) {
          try {
            await actualizarTrabajo(trabajo.id, {
              cuenttiTransacionId: txId.toString(),
              facturadoEn: new Date().toISOString(),
              cuenttiResolucion: prefijo,
            })
          } catch (err) {
            console.warn('No se pudo persistir el id_transacion en el trabajo:', err.message)
          }
        }
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

  // Trabajos facturables (completados con items). Excluye los ya facturados
  // por defecto, salvo que el usuario active "ver ya facturados" para reenviar.
  const facturablesAll = trabajos.filter(t =>
    t.estado === 'Completado' && t.items && t.items.length > 0
  )
  const yaFacturadosCount = facturablesAll.filter(t => t.cuenttiTransacionId).length
  const facturables = verFacturados
    ? facturablesAll
    : facturablesAll.filter(t => !t.cuenttiTransacionId)
  const trabajoFacturaSel = trabajos.find(t => t.id === (facturaId || '').trim())

  return (
    <div>
      {/* Page header */}
      <div className="pagehd">
        <div>
          <h2>Cuentti</h2>
          <p className="sub">Facturacion electronica · sincronizacion DIAN</p>
        </div>
        <div className="actions">
          {testResult && testResult.clientes?.startsWith('OK') && (
            <span className="badge badge-success" style={{ marginRight: 6 }}>● Conexion OK</span>
          )}
          <button className="btn btn-primary" onClick={testConexion} disabled={testing}>{testing ? 'Probando...' : 'Probar Conexion'}</button>
        </div>
      </div>

      {/* Step indicator — flow del proceso de facturacion */}
      {(() => {
        const hasTrabajo = !!facturaId
        const hasFactura = !!facturaResp && !facturaResp.error
        const hasDian = !!emitResp && !emitResp.error
        const hasPago = !!pagoResp && !pagoResp.error
        const hasDoc = !!docResp && !docResp.error
        const steps = [
          { n: 1, lbl: 'Seleccionar trabajo', done: hasTrabajo, active: !hasTrabajo },
          { n: 2, lbl: 'Facturar', done: hasFactura, active: hasTrabajo && !hasFactura },
          { n: 3, lbl: 'Emitir DIAN', done: hasDian, active: hasFactura && !hasDian },
          { n: 4, lbl: 'Pago / Abono', done: hasPago, active: hasFactura && !hasPago },
          { n: 5, lbl: 'URL · QR', done: hasDoc, active: hasPago && !hasDoc },
        ]
        return (
          <div className="rc-stepper" style={{ marginBottom: 16 }}>
            {steps.map((s, i) => (
              <span key={s.n} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className={`rc-step ${s.active ? 'is-active' : ''} ${s.done ? 'is-done' : ''}`}>
                  <span className="rc-step__n">{s.done ? '✓' : s.n}</span>
                  <span>{s.lbl}</span>
                </span>
                {i < steps.length - 1 && <span className={`rc-step__sep ${s.done ? 'is-done' : ''}`} />}
              </span>
            ))}
          </div>
        )
      })()}

      {/* Connection banner */}
      {testResult && (
        <div className="card" style={{marginBottom:16,borderColor:testResult.clientes?.startsWith('OK')?'var(--green-500)':'var(--red-500)',borderWidth:1,overflow:'hidden'}}>
          <div style={{padding:'16px 20px',display:'flex',alignItems:'center',gap:14,background:testResult.clientes?.startsWith('OK')?'linear-gradient(90deg,rgba(22,163,74,.08),transparent 60%)':'linear-gradient(90deg,rgba(220,38,38,.08),transparent 60%)'}}>
            <div style={{width:48,height:48,borderRadius:12,background:testResult.clientes?.startsWith('OK')?'var(--green-600)':'var(--red-600)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">{testResult.clientes?.startsWith('OK')?<path d="M5 13l4 4L19 7"/>:<path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>}</svg>
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{testResult.clientes?.startsWith('OK')?'Conectado a Cuentti':'Error de conexion'}</div>
              <div style={{fontSize:12.5,color:'var(--text-3)'}}>Clientes: {testResult.clientes} · Inventario: {testResult.inventario}</div>
            </div>
          </div>
        </div>
      )}

      {/* Test de conexion - detalle */}
      {testResult && (
        <div className="card">
          <div className="card__h"><h3>Test de Conexion</h3></div>
          <div className="card__b">
            <table className="tbl">
              <thead>
                <tr><th>Endpoint</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600 }}>Clientes</td>
                  <td>
                    <span className={`badge ${testResult.clientes.startsWith('OK') ? 'badge-s' : 'badge-d'}`}>
                      {testResult.clientes}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>Inventario</td>
                  <td>
                    <span className={`badge ${testResult.inventario.startsWith('OK') ? 'badge-s' : 'badge-d'}`}>
                      {testResult.inventario}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            {testResult.tokenRaw && (
              <div style={{ marginTop: 12 }}>
                <div style={{fontSize:11,color:'var(--text-3)',marginBottom:4}}>Respuesta cruda del token test (para diagnostico):</div>
                <pre style={{ background: '#0f172a', color: testResult.tokenRaw.ok ? '#86efac' : '#fca5a5', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
                  {formatJson(testResult.tokenRaw)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Facturacion flow + Side panel (2-column layout matching handoff) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

      {/* Facturacion directa */}
      <div className="card">
        <div className="card__h">
          <h3>Facturar Trabajo</h3>
          {yaFacturadosCount > 0 && (
            <label style={{fontSize:12,color:'var(--text-3)',display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
              <input type="checkbox" checked={verFacturados} onChange={e => setVerFacturados(e.target.checked)} />
              Mostrar ya facturados ({yaFacturadosCount})
            </label>
          )}
        </div>
        <div className="card__b">
          <p style={{fontSize:13,color:'var(--text-3)',marginBottom:14}}>
            Selecciona un trabajo completado para enviar la factura a Cuentti.
            {!verFacturados && yaFacturadosCount > 0 && ` Los ${yaFacturadosCount} trabajos ya facturados estan ocultos.`}
          </p>
          {trabajoFacturaSel?.cuenttiTransacionId && (
            <div style={{padding:'10px 14px',background:'rgba(220,38,38,.08)',border:'1px solid var(--red-500)',borderRadius:10,marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="var(--red-600)" strokeWidth="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <div style={{flex:1,fontSize:13}}>
                <div style={{fontWeight:700,color:'var(--red-700)'}}>Este trabajo ya fue facturado</div>
                <div style={{color:'var(--text-3)',fontSize:12,marginTop:2}}>
                  id_transacion <span className="mono" style={{color:'var(--text)'}}>{trabajoFacturaSel.cuenttiTransacionId}</span>
                  {trabajoFacturaSel.facturadoEn && ` · ${new Date(trabajoFacturaSel.facturadoEn).toLocaleDateString('es-CO')}`}
                  . Volver a enviar duplicara la factura en Cuentti.
                </div>
              </div>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
            <div className="field">
              <select className="input" value={facturaId} onChange={e => { const v = e.target.value; setFacturaId(v); refreshPreview(v, prefijo) }}>
                <option value="">Seleccionar trabajo...</option>
                {facturables.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.cuenttiTransacionId ? '✓ ' : ''}{t.id} — {t.placa} — {t.cliente} — {fmt(t.total)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <select className="input" value={prefijo} onChange={e => { const v = e.target.value; setPrefijo(v); if (facturaId) refreshPreview(facturaId, v) }}>
                {resoluciones.map(r => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>
                Resolucion (MAS = factura interna · FEIC = factura electronica DIAN)
              </div>
            </div>
          </div>

          {/* Info: enviamos como "A Credito" — sin pago. Simplifica todo. */}
          <div style={{marginTop:14,padding:'10px 14px',background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:8,fontSize:12.5,color:'var(--text-2)',lineHeight:1.5,display:'flex',alignItems:'flex-start',gap:10}}>
            <span style={{fontSize:16,flexShrink:0}}>ℹ️</span>
            <div>
              <strong>La factura se emite sin metodo de pago en Cuentti.</strong> Esto evita los errores tecnicos con IDs internos. Tu factura electronica (FEIC) si va a la DIAN normalmente. Si quieres registrar el pago real (efectivo, transferencia, etc.), entras a <strong>cuentti.co</strong> y lo marcas alli en 1 click — Cuentti tiene tus medios de pago configurados con sus IDs correctos.
            </div>
          </div>

          <div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}>
            <button className="btn btn-primary" onClick={facturarTrabajo}
              disabled={!facturaId || facturando}>
              {facturando ? 'Enviando...' : 'Enviar a Cuentti'}
            </button>
          </div>
        </div>
      </div>

      {previewPayload && (
        <div className="card">
          <div className="card__h"><h3>Previsualizacion de envio</h3></div>
          <div className="card__b">
            <p style={{fontSize:13,color:'var(--text-3)',marginBottom:10}}>
              Payload que se enviara a Cuentti (token en headers enmascarado).
            </p>
            <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
              {formatJson(previewPayload)}
            </pre>
            {previewHeaders && (
              <>
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:6}}>Headers</div>
                <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
                  {formatJson(previewHeaders)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {ultimoPayload && (
        <div className="card">
          <div className="card__h"><h3>Ultimo payload enviado</h3></div>
          <div className="card__b">
            <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
              {formatJson(ultimoPayload)}
            </pre>
            {ultimoHeaders && (
              <>
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:6}}>Headers</div>
                <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
                  {formatJson(ultimoHeaders)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {facturaResp && (
        <div className="card">
          <div className="card__h"><h3>Ultima respuesta de facturacion</h3></div>
          <div className="card__b">
            <p style={{fontSize:13,color:'var(--text-3)',marginBottom:10}}>
              id_transacion detectado: <span className="mono">{extractIdTransacion(facturaResp) || '—'}</span>
            </p>
            <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
              {formatJson(facturaResp)}
            </pre>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__h"><h3>Emitir Factura Electronica (DIAN)</h3></div>
        <div className="card__b">
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:14,alignItems:'end'}}>
            <div className="field">
              <label>id_transacion</label>
              <input className="input" value={emitId} placeholder="ID devuelto por grabarFacturaSimple"
                onChange={e => setEmitId(e.target.value)} />
            </div>
            <div>
              <button className="btn btn-primary" type="button" onClick={emitirFE} disabled={emitiendo || !emitId}>
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
      </div>

      </div>{/* end left column */}

      {/* SIDE PANEL: Estado de envio + Ultimas facturas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        {(() => {
          const hasTrabajo = !!facturaId
          const conexionOK = !!testResult && testResult.clientes?.startsWith('OK')
          const hasFactura = !!facturaResp && !facturaResp.error
          const hasDian = !!emitResp && !emitResp.error
          const hasPago = !!pagoResp && !pagoResp.error
          const statusItems = [
            { lbl: 'Trabajo seleccionado', ok: hasTrabajo },
            { lbl: 'Cliente sincronizado', ok: conexionOK && hasTrabajo },
            { lbl: 'Inventario actualizado', ok: conexionOK },
            { lbl: 'Enviado a Cuentti', ok: hasFactura },
            { lbl: 'Firmado y aprobado DIAN', ok: hasDian },
            { lbl: 'Pago registrado', ok: hasPago },
          ]
          return (
            <div className="card">
              <div className="card__h"><h3>Estado de envio</h3></div>
              <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {statusItems.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: s.ok ? 'var(--green-500)' : 'var(--bg-subtle)',
                      border: s.ok ? 'none' : '1px solid var(--border)',
                      color: '#fff', flexShrink: 0,
                    }}>
                      {s.ok ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-3)' }} />
                      )}
                    </span>
                    <span style={{ color: s.ok ? 'var(--text)' : 'var(--text-3)', fontWeight: s.ok ? 600 : 500 }}>{s.lbl}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Ultimas facturas */}
        {(() => {
          const ultimas = trabajos
            .filter(t => t.cuenttiTransacionId)
            .sort((a, b) => new Date(b.facturadoEn || b.fecha || 0) - new Date(a.facturadoEn || a.fecha || 0))
            .slice(0, 5)
          return (
            <div className="card">
              <div className="card__h"><h3>Ultimas facturas</h3>{ultimas.length > 0 && <span className="count">{ultimas.length}</span>}</div>
              {ultimas.length === 0 ? (
                <div className="card__b" style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '20px 12px' }}>
                  <div style={{ fontSize: 22, opacity: .35, marginBottom: 4 }}>📄</div>
                  <div>Sin facturas registradas</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>Las facturas emitidas aparecen aqui.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {ultimas.map((f, i) => {
                    const tipo = f.cuenttiPrefijo || (f.cuenttiTransacionId?.toString().startsWith('FE') ? 'FEIC' : 'MAS')
                    const num = f.cuenttiTransacionId
                    const estadoBadge = f.cuenttiPagado ? { c: 'badge-success', l: 'pagada' } : f.cuenttiAprobado ? { c: 'badge-success', l: 'aprobada' } : { c: 'badge-warning', l: 'pendiente' }
                    return (
                      <div key={i} style={{
                        padding: '12px 16px',
                        borderBottom: i < ultimas.length - 1 ? '1px solid var(--border)' : 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.4px' }}>{tipo}</div>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{num}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.cliente || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{fmt(f.total || 0)}</div>
                          <span className={`badge ${estadoBadge.c}`} style={{ fontSize: 9.5, marginTop: 2, textTransform: 'uppercase', letterSpacing: '.4px' }}>{estadoBadge.l}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
      </div>
      </div>{/* end 2-column grid */}

    </div>
  )
}
