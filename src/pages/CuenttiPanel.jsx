import { useState, useRef, useEffect } from 'react'
import { fmt } from '../utils/helpers'
import { confirmarPagoEnCuentti, datosFacturaCuentti } from '../services/supabase'
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
  detectarMediosPago,
  probarIdMedioPago,
  anularTransacion,
} from '../services/cuentti'
import { RESOLUCIONES, SIN_FACTURA } from '../utils/constants'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button } from '../components/ui'

// Tarjeta de debug/JSON colapsable: PLEGADA por defecto, con chevron para
// expandir. Mantiene los bloques técnicos (payload/headers/respuesta) fuera del
// camino sin quitarlos (siguen ahí para depurar cuando se necesiten).
function DebugCard({ title, sub, open, onToggle, children }) {
  return (
    <div className="hd-card">
      <button type="button" onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: 'var(--tap)', padding: '0 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .18s var(--ease-out)', flexShrink: 0, color: 'var(--text-3)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="hd-strong">{title}</span>
        <span className="hd-bar__sp" />
        {sub != null && <span className="hd-chip hd-chip--mute">{sub}</span>}
      </button>
      {open && <div style={{ padding: '0 18px 15px' }}>{children}</div>}
    </div>
  )
}

// Un paso del hilo de facturación: número, título, estado y su acción propia.
// Los campos del paso van DENTRO del paso (children), nunca en otra tarjeta.
function Paso({ n, titulo, estado, state, accion, children }) {
  const done = state === 'done'
  const active = state === 'active'
  const chip = done ? 'hd-chip--ok' : active ? 'hd-chip--info' : 'hd-chip--mute'
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 13px', borderRadius: 14,
      background: active ? 'var(--accent-soft)' : 'var(--bg-raised)',
      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    }}>
      <span style={{
        width: 26, height: 26, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center',
        fontSize: 12, fontWeight: 700, lineHeight: 1,
        background: done ? 'var(--ok-bg)' : active ? 'var(--accent)' : 'var(--chip)',
        color: done ? 'var(--ok-fg)' : active ? '#fff' : 'var(--text-3)',
      }}>
        {done
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          : n}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', minHeight: 26 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{titulo}</span>
          <span className={`hd-chip ${chip}`}>{estado}</span>
          <span style={{ flex: 1 }} />
          {accion}
        </div>
        {children && <div style={{ marginTop: 10 }}>{children}</div>}
      </div>
    </div>
  )
}

// Campo con su rótulo. El rótulo va ARRIBA: leyendo de un vistazo se sabe qué
// se está eligiendo antes de tocar el desplegable.
function Campo({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="hd-clip" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

export default function CuenttiPanel({ trabajos, actualizarTrabajo, notify, trabajoPreseleccionado }) {
  const [confirmCfg, setConfirmCfg] = useState(null)
  // Factura que se esta anulando ahora mismo, para no dejar apretar dos veces.
  const [anulando, setAnulando] = useState(null)
  const [verFacturados, setVerFacturados] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  // El panel se monta de nuevo en cada entrada a la sección, así que basta con
  // sembrar el estado inicial: no hace falta sincronizar después.
  const [facturaId, setFacturaId] = useState(trabajoPreseleccionado || '')
  const [facturando, setFacturando] = useState(false)
  const factRef = useRef(new Set()) // facturas EN CURSO (anti doble-clic síncrono; el estado es async y deja pasar 2 clics)
  const [factError, setFactError] = useState({}) // trabajo.id -> true si el último envío falló (reintento con aviso)
  const [facturaResp, setFacturaResp] = useState(null)
  const [previewPayload, setPreviewPayload] = useState(null)
  const [previewHeaders, setPreviewHeaders] = useState(null)
  const [ultimoPayload, setUltimoPayload] = useState(null)
  const [ultimoHeaders, setUltimoHeaders] = useState(null)
  // Los bloques de debug (payload/headers/respuesta) van PLEGADOS por defecto.
  const [debugOpen, setDebugOpen] = useState({})
  const toggleDebug = (k) => setDebugOpen(o => ({ ...o, [k]: !o[k] }))
  const [prefijo, setPrefijo] = useState('MAS')
  const resoluciones = [
    { code: 'MAS', label: 'Interna' },
    { code: 'FEIC', label: 'Electrónica DIAN' },
  ]

  const [emitId, setEmitId] = useState('')
  const [emitiendo, setEmitiendo] = useState(false)
  const [emitResp, setEmitResp] = useState(null)

  const [pagoForm, setPagoForm] = useState({
    idTransacion: '',
    valor: '',
    idMedioPago: 1,
    idBanco: 1, // Caja General (efectivo). 2=Bancolombia, 3=Nequi
    nota: '',
    devuelta: 0,
  })
  const [pagando, setPagando] = useState(false)
  const [pagoResp, setPagoResp] = useState(null)

  const [docId, setDocId] = useState('')
  const [docResp, setDocResp] = useState(null)
  const [docLoading, setDocLoading] = useState(false)

  // Metodos de pago — solo los que el taller usa: Efectivo + Transferencia.
  // Los IDs se configuran una vez con el boton "Auto 1-15" del panel
  // "Encontrar IDs" y se guardan en localStorage.
  const METODOS_DEFAULT = [
    { key: 'efectivo', nombre: 'Efectivo', defaultId: 1 },
    { key: 'transferencia', nombre: 'Transferencia', defaultId: 7 },
    { key: 'credito', nombre: 'Crédito', defaultId: 0 },
  ]
  const [metodosConfig, setMetodosConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cuentti:metodos_pago') || '{}')
      return METODOS_DEFAULT.map(m => ({ ...m, id: saved[m.key] ?? m.defaultId }))
    } catch {
      return METODOS_DEFAULT.map(m => ({ ...m, id: m.defaultId }))
    }
  })
  const guardarMetodoId = (key, id) => {
    setMetodosConfig(prev => {
      const next = prev.map(m => m.key === key ? { ...m, id } : m)
      try {
        const obj = next.reduce((acc, m) => { acc[m.key] = m.id; return acc }, {})
        localStorage.setItem('cuentti:metodos_pago', JSON.stringify(obj))
      } catch {}
      return next
    })
  }
  const METODOS_PAGO = metodosConfig.map(m => ({ id: m.id, key: m.key, nombre: m.nombre }))
  // Default a "efectivo" porque el usuario confirmo que id=1 funciona
  const [metodoPagoKey, setMetodoPagoKey] = useState(() => {
    try { return localStorage.getItem('cuentti:metodo_default') || 'efectivo' } catch { return 'efectivo' }
  })
  const setMetodoPagoKeyPersist = (k) => {
    setMetodoPagoKey(k)
    try { localStorage.setItem('cuentti:metodo_default', k) } catch {}
  }
  const metodoPago = metodoPagoKey === '' ? '' : (METODOS_PAGO.find(m => m.key === metodoPagoKey)?.id ?? '')

  // ID del banco
  const [idBancoConfig, setIdBancoConfig] = useState(() => {
    try { return parseInt(localStorage.getItem('cuentti:id_banco')) || 2 } catch { return 2 }
  })
  const guardarIdBanco = (val) => {
    setIdBancoConfig(val)
    try { localStorage.setItem('cuentti:id_banco', String(val)) } catch {}
  }

  // Estados de configuracion / deteccion
  const [showConfigIds, setShowConfigIds] = useState(false)
  const [detectandoMedios, setDetectandoMedios] = useState(false)
  const [mediosDetectados, setMediosDetectados] = useState(null)
  const [probandoId, setProbandoId] = useState(null) // {key, id}
  const [resultadoPrueba, setResultadoPrueba] = useState({}) // {key: {ok, mensaje}}

  // Detectar IDs probando 30+ endpoints
  const detectarIdsAutomaticamente = async () => {
    setDetectandoMedios(true)
    setMediosDetectados(null)
    try {
      const res = await detectarMediosPago()
      setMediosDetectados(res)
      if (res.ok && res.medios.length > 0) {
        notify(`Detectados ${res.medios.length} medios de pago en tu Cuentti`, 'success')
      } else {
        notify('Tu Cuentti no expone los medios de pago públicamente. Usa "Probar este ID" para encontrarlos.', 'info')
      }
    } catch (e) {
      notify('Error detectando medios: ' + e.message, 'error')
    } finally {
      setDetectandoMedios(false)
    }
  }

  const aplicarMedioDetectado = (medio) => {
    const nombre = (medio.nombre || '').toLowerCase()
    let key = null
    if (nombre.includes('efectivo') || nombre.includes('cash')) key = 'efectivo'
    else if (nombre.includes('debito') || nombre.includes('débito')) key = 'tdebito'
    else if (nombre.includes('credito tc') || nombre.includes('crédito tc') || nombre.includes('tarjeta credito') || nombre.includes('tarjeta crédito')) key = 'tcredito'
    else if (nombre.includes('transferencia') || nombre.includes('transfer')) key = 'transferencia'
    else if (nombre.includes('nequi') || nombre.includes('daviplata') || nombre.includes('digital')) key = 'nequi'
    else if (nombre.includes('credito') || nombre.includes('crédito')) key = 'credito'
    if (key) {
      guardarMetodoId(key, medio.id)
      notify(`"${medio.nombre}" → ${key} ahora usa ID ${medio.id}`, 'success')
    } else {
      notify(`No se mapeó automáticamente "${medio.nombre}". Asígnalo manualmente.`, 'info')
    }
  }

  // Probar si un ID funciona enviando una factura test de $1 que se anula
  const probarIdEspecifico = async (key, id) => {
    setConfirmCfg({
      title: 'Probar ID',
      lead: `Crea y anula una factura test de $1 con id_medio_pago=${id}.`,
      confirmLabel: 'Probar',
      tone: 'primary',
      onConfirm: async () => {
        setProbandoId({ key, id })
        setResultadoPrueba(prev => ({ ...prev, [key]: { loading: true } }))
        try {
          const res = await probarIdMedioPago(id, idBancoConfig)
          setResultadoPrueba(prev => ({ ...prev, [key]: res }))
          if (res.ok) {
            notify(`✓ ID ${id} VÁLIDO para ${key}`, 'success')
          } else {
            notify(res.mensaje, 'error')
          }
        } catch (e) {
          setResultadoPrueba(prev => ({ ...prev, [key]: { ok: false, mensaje: e.message } }))
        } finally {
          setProbandoId(null)
        }
      },
    })
    return
  }

  // Auto-probar IDs 1-15 hasta encontrar el primero que funcione
  const autoProbarIds = async (key) => {
    setConfirmCfg({
      title: 'Auto-probar IDs 1-15',
      lead: `Prueba IDs 1 a 15 para "${METODOS_DEFAULT.find(m => m.key === key)?.nombre}". Crea y anula facturas test de $1. Tarda ~30 s.`,
      confirmLabel: 'Probar',
      tone: 'primary',
      onConfirm: async () => {
        setProbandoId({ key, id: 'auto' })
        let foundId = null
        for (let id = 1; id <= 15; id++) {
          setResultadoPrueba(prev => ({ ...prev, [key]: { loading: true, mensaje: `Probando ID ${id}...` } }))
          try {
            const res = await probarIdMedioPago(id, idBancoConfig)
            if (res.ok) {
              foundId = id
              guardarMetodoId(key, id)
              setResultadoPrueba(prev => ({ ...prev, [key]: { ok: true, mensaje: `ID ${id} VÁLIDO` } }))
              notify(`✓ Encontrado: ${key} = ID ${id}`, 'success')
              break
            }
            // Si NO es FK violation, es otro tipo de error y debemos parar
            if (!res.esFkViolation) {
              setResultadoPrueba(prev => ({ ...prev, [key]: { ok: false, mensaje: `Error en ID ${id}: ${res.mensaje}` } }))
              notify(`Error inesperado: ${res.mensaje}`, 'error')
              break
            }
          } catch (e) {
            setResultadoPrueba(prev => ({ ...prev, [key]: { ok: false, mensaje: e.message } }))
            break
          }
        }
        if (!foundId) {
          setResultadoPrueba(prev => ({ ...prev, [key]: { ok: false, mensaje: 'Ningún ID 1-15 funcionó. Tu Cuentti puede usar IDs mayores.' } }))
          notify(`No se encontró ID válido en 1-15 para ${key}`, 'error')
        }
        setProbandoId(null)
      },
    })
    return
  }

  // Auto-probar id_banco 1-15
  const autoProbarBanco = async () => {
    // Necesitamos un id_medio_pago valido que requiera banco. Usamos transferencia
    // si esta configurada y validada, sino usamos el primero que tenga ID > 0
    const transId = metodosConfig.find(m => m.key === 'transferencia')?.id
    if (!transId) { notify('Configura primero el ID de Transferencia', 'error'); return }
    setConfirmCfg({
      title: 'Auto-probar id_banco 1-15',
      lead: 'Prueba id_banco 1 a 15 con transferencia. Crea y anula facturas test de $1. Tarda ~30 s.',
      confirmLabel: 'Probar',
      tone: 'primary',
      onConfirm: async () => {
        setProbandoId({ key: 'banco', id: 'auto' })
        let foundId = null
        for (let id = 1; id <= 15; id++) {
          try {
            const res = await probarIdMedioPago(transId, id)
            if (res.ok) {
              foundId = id
              guardarIdBanco(id)
              notify(`✓ Encontrado: id_banco = ${id}`, 'success')
              break
            }
            if (!res.esFkViolation) {
              notify(`Error inesperado: ${res.mensaje}`, 'error')
              break
            }
          } catch (e) {
            notify('Error: ' + e.message, 'error')
            break
          }
        }
        if (!foundId) notify('No se encontró id_banco válido en 1-15', 'error')
        setProbandoId(null)
      },
    })
    return
  }

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

  // Llegando desde el botón "Cobrar" de una OT, el trabajo queda elegido sin pasar
  // por el <select>, que es quien arma la previsualización. Sin esto, "Enviar a
  // Cuentti" —que emite una factura real y registra caja— aparecía habilitado y
  // SIN el resumen de lo que se va a enviar, que es el único control de revisión
  // que hay antes de una acción irreversible.
  useEffect(() => {
    if (trabajoPreseleccionado) refreshPreview(trabajoPreseleccionado, prefijo)
    // Solo al montar con una OT preseleccionada; después manda el <select>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      // Cerrado a mano sin factura: NO hay duplicado que temer, solo hay que
      // decir por qué estaba fuera de la lista. Facturarlo ahora es legítimo.
      const cerradoSinFactura = trabajo.cuenttiTransacionId === SIN_FACTURA
      setConfirmCfg({
        title: cerradoSinFactura ? 'Facturar un trabajo ya cerrado' : 'Reenviar factura',
        lead: cerradoSinFactura
          ? `Este trabajo se marcó como cobrado SIN factura en Cuentti (${fechaFmt}), por eso no salía en la lista. Si lo facturas ahora, se emite por primera vez.`
          : `Ya facturado (Factura # ${trabajo.cuenttiTransacionId}, ${fechaFmt}). Reenviar crea una factura duplicada en Cuentti.`,
        confirmLabel: cerradoSinFactura ? 'Facturar' : 'Reenviar',
        tone: cerradoSinFactura ? 'primary' : 'danger',
        onConfirm: () => enviarFacturaTrabajo(trabajo),
      })
      return
    }

    // Reintento tras un error: el envío anterior PUDO haber creado la factura en
    // Cuentti aunque aquí se viera error (timeout que sí grabó — mismo caso del
    // gasto de nómina doble). Pedir verificación antes de reenviar.
    if (factError[trabajo.id]) {
      setConfirmCfg({
        title: 'Reintentar envío a Cuentti',
        lead: `El envío anterior de ${trabajo.otCodigo || trabajo.id} falló por red, pero la factura PUDO haber quedado creada en Cuentti. Revisa "Últimas facturas" (o Cuentti) antes de reenviar, para no duplicarla.`,
        confirmLabel: 'Ya verifiqué, enviar',
        tone: 'danger',
        onConfirm: () => enviarFacturaTrabajo(trabajo),
      })
      return
    }

    return enviarFacturaTrabajo(trabajo)
  }

  const enviarFacturaTrabajo = async (trabajo) => {
    // Guard SÍNCRONO anti doble-clic: el disabled del botón depende del estado
    // (async) y deja pasar dos clics rápidos; el ref se lee al instante.
    if (factRef.current.has(trabajo.id)) return
    factRef.current.add(trabajo.id)
    setFacturando(true)
    try {
      // Mapear id_banco segun el metodo de pago (VERIFICADO en Cuentti:
      // 1=Caja General, 2=Bancolombia, 3=Nequi):
      // - efectivo: id_banco = 1 (Caja General). Antes estaba en 2 => los pagos en
      //   efectivo caian en Bancolombia y NO aparecian en el cierre de caja.
      // - transferencia: id_banco = idBancoConfig (banco real configurado)
      // - credito: lstPagos vacio (no aplica)
      const idBanco = metodoPagoKey === 'transferencia' ? idBancoConfig
                    : metodoPagoKey === 'credito' ? 0
                    : 1
      // El pago (efectivo/transferencia) NO se manda inline: se crea la factura a
      // crédito y luego se registra el pago con agregarPagoTransacion, que SÍ crea el
      // recibo de caja (es_ingreso/n_caja) y entra al cierre de caja. El lstPagos
      // inline solo marcaba la factura pagada pero no alimentaba el cierre de caja.
      const esPagoInmediato = metodoPagoKey !== 'credito'
      const facturaData = {
        ...trabajo,
        resolucion: prefijo,
        idMedioPago: metodoPago,
        idBanco,
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
      let pagoOk = false
      if (txId) {
        setEmitId(txId.toString())
        setPagoForm(p => ({ ...p, idTransacion: txId.toString(), valor: trabajo.total || p.valor }))
        setDocId(txId.toString())
        // Registrar el pago como recibo de caja (esto es lo que entra al cierre de
        // caja). Se paga el total EXACTO de la factura (payload.total_neto) para que
        // quede pagada sin saldo por redondeo.
        if (esPagoInmediato) {
          try {
            // El id_cliente se lee de la FACTURA recien creada, no se adivina.
            // Antes salia de trabajo.cuenttiId y, si la OT no lo tenia, se mandaba
            // -1 confiando en que Cuentti lo resolviera. La factura 5955 (21/08/2026)
            // demostro que no lo resuelve: el pago se perdia sin avisar. La propia
            // factura sabe a que cliente pertenece; se le pregunta a ella.
            const datosFac = await datosFacturaCuentti(txId.toString())
            const idClienteReal = datosFac?.id_cliente || trabajo.cuenttiId || undefined
            await agregarPagoTransacion({
              idTransacion: txId.toString(),
              valor: payload.total_neto,
              idMedioPago: metodoPago,
              idBanco,
              // NUNCA el id local de la app (trabajo.clienteId): Cuentti lo tomaba
              // como suyo y el recibo quedaba a nombre de otra persona.
              idCliente: idClienteReal,
              nota: `OT ${trabajo.otCodigo || trabajo.id}`,
            })
            // No basta con que la llamada no lance: Cuentti responde sus errores
            // con HTTP 200. Se relee la factura y se mira el total_abono que dice
            // Cuentti, que es la unica fuente que vale. Si no cuadra, la OT NO se
            // marca pagada. Paso el 21/08/2026 con la factura 5955.
            const chk = await confirmarPagoEnCuentti(txId.toString(), payload.total_neto)
            if (chk.confirmado) {
              pagoOk = true
            } else {
              notify(`Factura creada, pero Cuentti no confirma el pago (${chk.motivo}). Regístralo en "Pago / Abono".`, 'error')
            }
          } catch (err) {
            notify(`Factura creada, pero el pago no entró a caja: ${err.message}. Regístralo en "Pago / Abono".`, 'error')
          }
        }
        // Marcar trabajo como facturado (anti-duplicado entre dispositivos)
        if (actualizarTrabajo) {
          try {
            await actualizarTrabajo(trabajo.id, {
              cuenttiTransacionId: txId.toString(),
              facturadoEn: new Date().toISOString(),
              cuenttiResolucion: prefijo,
              // Pagado solo si el recibo de caja se registró OK.
              pagado: esPagoInmediato && pagoOk,
              metodoPago: metodoPagoKey,
            })
          } catch (err) {
            // Sin este marcado, otro dispositivo (o esta misma pantalla tras
            // recargar) podría re-facturar la OT. Avisar, no solo loguear.
            notify(`⚠ Factura #${txId} creada, pero no se pudo marcar la OT como facturada. Anótalo: si reintentas, se duplicaría.`, 'error')
            console.warn('No se pudo persistir el id_transacion en el trabajo:', err.message)
          }
        }
        setFactError(f => { const n = { ...f }; delete n[trabajo.id]; return n })
        notify('Factura enviada a Cuentti exitosamente', 'success')
      } else {
        // Cuentti respondió pero no se pudo leer el número de factura: NO es un
        // éxito confiable. La OT no quedó marcada — un reintento podría duplicar.
        setFactError(f => ({ ...f, [trabajo.id]: true }))
        notify('⚠ Cuentti respondió pero no se pudo leer el número de factura. Revisa "Última respuesta" y verifica en Cuentti ANTES de reenviar.', 'error')
      }
    } catch (e) {
      setFacturaResp({ error: e.message, detalle: e.body || e.headers || e.stack })
      // La red falló, PERO la factura pudo haber llegado a Cuentti igual (timeout
      // que sí grabó). Se marca para que el reintento pida verificar antes.
      setFactError(f => ({ ...f, [trabajo.id]: true }))
      notify(`Error facturando: ${e.message}. ⚠️ La factura PUDO quedar en Cuentti — verifícalo antes de reintentar.`, 'error')
      console.error('Factura error detalle:', e)
    } finally {
      factRef.current.delete(trabajo.id)
      setFacturando(false)
    }
  }

  // Recupera una factura de efectivo/transferencia cuyo pago NO entró a caja
  // (falló el paso al facturar). Solo marca el estado local como pagada — NO
  // escribe a Cuentti aquí, para no arriesgar un pago DOBLE (el usuario ya lo
  // registra en Cuentti, manual o en "Pago / Abono").
  // ── Anular una factura ────────────────────────────────────────────────────
  //
  // Por que hace falta: la resolucion (interna MAS / electronica FEIC) se graba
  // DENTRO de la factura al crearla, en su serie de numeracion. Una factura que
  // salio por la serie interna no se puede pasar a la electronica ni renumerar:
  // la unica salida es anularla y volver a facturar. Hasta ahora eso solo se
  // podia hacer entrando a Cuentti.
  const ejecutarAnulacion = async (f) => {
    const num = f.cuenttiTransacionId
    setAnulando(num)
    try {
      const resp = await anularTransacion({
        idTransacion: num,
        observacion: `Anulada desde la app. OT ${f.otCodigo || '?'} - ${f.placa || ''}`.trim(),
      })
      // Cuentti responde HTTP 200 tambien cuando falla; el motivo viaja en el
      // cuerpo con type:0. Sin esta comprobacion una anulacion rechazada se
      // veria como exito y la OT quedaria desmarcada con la factura VIVA.
      if (resp && Number(resp.type) === 0) {
        throw new Error(resp.message || 'Cuentti rechazó la anulación')
      }
      // El orden importa: primero Cuentti, despues lo de aqui. Si se hiciera al
      // contrario y Cuentti fallara, la OT volveria a "por facturar" con la
      // factura todavia viva, y el siguiente envio la duplicaria.
      if (actualizarTrabajo) {
        await actualizarTrabajo(f.id, {
          cuenttiTransacionId: null,
          cuenttiResolucion: null,
          facturadoEn: null,
          pagado: false,
          metodoPago: null,
        })
      }
      notify(`Factura ${num} anulada. La orden volvió a "por facturar".`, 'success')
    } catch (e) {
      notify(`No se pudo anular la factura ${num}: ${e.message}. Aquí NO se cambió nada. Revisa en Cuentti antes de reintentar.`, 'error')
    } finally {
      setAnulando(null)
    }
  }

  const anularFactura = (f) => {
    const num = f.cuenttiTransacionId
    const esElectronica = (f.cuenttiResolucion || '') === 'FEIC'
    setConfirmCfg({
      title: 'Anular esta factura',
      // Una electronica ya la tiene la DIAN: anularla en Cuentti no la borra
      // alli, eso pide nota credito. No se bloquea (lo decide el contador),
      // pero no se puede dejar que se apriete sin saberlo.
      lead: esElectronica
        ? `La factura ${num} de ${f.cliente || 'este cliente'} (${fmt(f.total || 0)}) es ELECTRÓNICA: la DIAN ya la tiene. Anularla aquí no la elimina ante la DIAN, para eso hace falta una nota crédito. Consulta con tu contador antes de seguir.`
        : `Se anula la factura ${num} de ${f.cliente || 'este cliente'} (${fmt(f.total || 0)}) en Cuentti, y la orden ${f.otCodigo || ''} vuelve a la lista de "por facturar". El pago sale de caja.`.replace('  ', ' '),
      confirmLabel: 'Sí, anular',
      tone: 'danger',
      onConfirm: () => ejecutarAnulacion(f),
    })
  }

  const marcarFacturaPagada = (f) => {
    setConfirmCfg({
      title: 'Marcar como pagada',
      lead: `Confirma que el pago de la factura ${f.cuenttiTransacionId} (${fmt(f.total || 0)}) YA quedó registrado en Cuentti. Esto solo actualiza el estado aquí para que cuadre la caja.`,
      confirmLabel: 'Sí, ya está pagada',
      tone: 'primary',
      onConfirm: () => {
        if (actualizarTrabajo) actualizarTrabajo(f.id, { pagado: true })
        notify(`Factura ${f.cuenttiTransacionId} marcada como pagada`, 'success')
      },
    })
  }

  const emitirFE = async () => {
    if (!emitId.trim()) { notify('Ingresa la Factura # que devolvio Cuentti', 'error'); return }
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
    if (!pagoForm.idTransacion.trim()) { notify('Falta la Factura # para aplicar el pago', 'error'); return }
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
    if (!docId.trim()) { notify('Ingresa una Factura # para consultar el documento', 'error'); return }
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
  const porFacturarCount = facturablesAll.length - yaFacturadosCount
  const conexionOK = !!testResult && testResult.clientes?.startsWith('OK')

  // Estado del hilo de 5 pasos. MISMAS condiciones que ya tenía el stepper y el
  // panel de estado; solo se calculan una vez y se pintan en un único hilo.
  const hasTrabajo = !!facturaId
  const hasFactura = !!facturaResp && !facturaResp.error
  const hasDian = !!emitResp && !emitResp.error
  const hasPago = !!pagoResp && !pagoResp.error
  const hasDoc = !!docResp && !docResp.error

  const ultimasFacturas = trabajos
    .filter(t => t.cuenttiTransacionId)
    .sort((a, b) => new Date(b.facturadoEn || b.fecha || 0) - new Date(a.facturadoEn || a.fecha || 0))
    .slice(0, 5)

  const statusItems = [
    { lbl: 'Trabajo seleccionado', ok: hasTrabajo },
    { lbl: 'Cliente sincronizado', ok: conexionOK && hasTrabajo },
    { lbl: 'Inventario actualizado', ok: conexionOK },
    { lbl: 'Enviado a Cuentti', ok: hasFactura },
    { lbl: 'Firmado y aprobado DIAN', ok: hasDian },
    { lbl: 'Pago registrado', ok: hasPago },
  ]
  const statusDone = statusItems.filter(s => s.ok).length

  const resolucionLabel = resoluciones.find(r => r.code === prefijo)?.label || prefijo
  const metodoLabel = METODOS_PAGO.find(m => m.key === metodoPagoKey)?.nombre || '—'

  return (
    <div>
      {/* Barra de título del handoff. Los conteos que no se accionan (por
          facturar / ya facturados) bajan al subtítulo, y la ÚNICA cifra sobre la
          que se aprieta un botón hoy —el total del trabajo elegido— queda a la
          derecha. El estado de conexión es una pastilla, no una franja. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Cuentti</h1>
          <div className="hd-head__sub">
            Facturación electrónica · {porFacturarCount} por facturar · {yaFacturadosCount} ya facturados
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          {trabajoFacturaSel && (
            <>
              <div className="hd-fig" style={{ '--fg': 'var(--text)' }}>
                <div className="hd-fig__l">A FACTURAR</div>
                <div className="hd-fig__v">{fmt(trabajoFacturaSel.total || 0)}</div>
                <div className="hd-fig__s">
                  {trabajoFacturaSel.otCodigo || trabajoFacturaSel.id}
                  {' · '}
                  {/* Sin carro no se deja el hueco: dice SERVICIO, apagado. */}
                  <span className={trabajoFacturaSel.placa ? undefined : 'hd-empty'}>{trabajoFacturaSel.placa || 'SERVICIO'}</span>
                </div>
              </div>
              <div className="hd-head__div" />
            </>
          )}
          {testResult && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px',
              borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 600,
              background: conexionOK ? 'var(--ok-bg)' : 'var(--bad-bg)',
              color: conexionOK ? 'var(--ok-fg)' : 'var(--bad-fg)',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
              {conexionOK ? 'Conexión activa' : 'Sin conexión'}
            </span>
          )}
          <Button variant="primary" onClick={testConexion} disabled={testing}>{testing ? 'Probando...' : 'Probar Conexión'}</Button>
        </div>
      </div>

      {/* Test de conexión. La franja de color con el icono de 48px desaparece:
          decía lo mismo que la pastilla del título y que esta tabla. */}
      {testResult && (
        <div className="hd-card" style={{ marginTop: 14 }}>
          {/* La tarjeta lleva su nombre: en <=960px la cabecera de columnas
              (.hd-tbl__h) se oculta por diseño, y sin este título quedaban dos
              filas sueltas sin decir de qué eran. */}
          <div className="hd-bar">
            <span className="hd-strong">Test de conexión</span>
          </div>
          <div className="hd-tbl__h">
            <span style={{ width: 110, flex: 'none' }}>ENDPOINT</span>
            <span style={{ flex: 1 }}>RESULTADO</span>
          </div>
          {[['Clientes', testResult.clientes], ['Inventario', testResult.inventario]].map(([lbl, val]) => (
            <div key={lbl} className="hd-row" style={{ height: 'auto', minHeight: 'var(--row-h)', padding: '8px 18px', cursor: 'default' }}>
              <span className="hd-strong" style={{ width: 110, flex: 'none' }}>{lbl}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: (val || '').startsWith('OK') ? 'var(--ok-fg)' : 'var(--bad-fg)', fontWeight: 600 }}>{val}</span>
            </div>
          ))}
          {testResult.tokenRaw && (
            <>
              <button type="button" onClick={() => toggleDebug('token')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 'var(--tap)', padding: '0 18px', background: 'none', border: 'none', borderTop: '1px solid var(--row-line)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 12, color: 'var(--text-3)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: debugOpen.token ? 'none' : 'rotate(-90deg)', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                Respuesta cruda del token test (diagnóstico)
              </button>
              {debugOpen.token && (
                <pre style={{ background: 'var(--navy)', color: testResult.tokenRaw.ok ? '#86efac' : '#fca5a5', margin: 0, padding: 14, fontSize: 12, overflowX: 'auto' }}>
                  {formatJson(testResult.tokenRaw)}
                </pre>
              )}
            </>
          )}
        </div>
      )}

      {/* Un solo hilo a la izquierda (los 5 pasos con su campo dentro) y el
          seguimiento a la derecha. */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'start', marginTop: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          <div className="hd-card">
            <div className="hd-bar">
              <span className="hd-strong">Facturar trabajo</span>
              <div className="hd-bar__sp" />
              {yaFacturadosCount > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 'var(--tap)', padding: '0 13px', borderRadius: 'var(--radius-pill)', background: 'var(--chip)', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                  <input type="checkbox" checked={verFacturados} onChange={e => setVerFacturados(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                  Mostrar ya facturados ({yaFacturadosCount})
                </label>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 18px 14px' }}>

              {/* PASO 1 — Seleccionar trabajo */}
              <Paso n={1} titulo="Seleccionar trabajo" state={hasTrabajo ? 'done' : 'active'}
                estado={hasTrabajo ? 'LISTO' : 'EN CURSO'}>
                <Campo label="Trabajo a cobrar">
                  <select className="input" value={facturaId} onChange={e => { const v = e.target.value; setFacturaId(v); refreshPreview(v, prefijo) }}>
                    <option value="">Seleccionar trabajo...</option>
                    {/* El código OT (OT-0134) es lo que el mostrador tiene a la vista;
                        el id interno no le dice nada a nadie. */}
                    {facturables.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.cuenttiTransacionId ? '✓ ' : ''}{t.otCodigo || t.id} — {t.placa || 'SERVICIO'} — {t.cliente} — {fmt(t.total)}
                      </option>
                    ))}
                  </select>
                </Campo>
                <div className="hd-sub" style={{ marginTop: 8, lineHeight: 1.45 }}>
                  {trabajoFacturaSel
                    ? <>
                        {trabajoFacturaSel.otCodigo || trabajoFacturaSel.id} · <span className={trabajoFacturaSel.placa ? undefined : 'hd-empty'}>{trabajoFacturaSel.placa || 'SERVICIO'}</span> · {trabajoFacturaSel.cliente || '—'} · {fmt(trabajoFacturaSel.total || 0)}
                      </>
                    : <>Sin trabajo seleccionado</>}
                </div>
                {/* El filtro activo se avisa SIEMPRE, haya o no trabajo elegido.
                    Antes solo aparecía en el estado sin selección: desaparecía
                    justo cuando el usuario buscaba en la lista una OT que estaba
                    oculta y no entendía por qué no salía. */}
                {!verFacturados && yaFacturadosCount > 0 && (
                  <div className="hd-sub" style={{ marginTop: 4, lineHeight: 1.45 }}>
                    Los {yaFacturadosCount} trabajos ya facturados están ocultos.
                  </div>
                )}
                {trabajoFacturaSel?.cuenttiTransacionId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9, padding: '9px 12px', borderRadius: 10, background: 'var(--ok-bg)' }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ok-fg)', flexShrink: 0 }}>
                      <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
                    </svg>
                    <div style={{ minWidth: 0, fontSize: 12.5 }}>
                      {/* Cerrado a mano: no decir "Factura enviada · SIN-FACTURA", que
                         se lee como si existiera un documento con ese número. */}
                      <div style={{ fontWeight: 700, color: 'var(--ok-fg)' }}>
                        {trabajoFacturaSel.cuenttiTransacionId === SIN_FACTURA ? 'Cobrado sin factura' : 'Factura enviada'}
                      </div>
                      <div className="hd-sub" style={{ marginTop: 2 }}>
                        {trabajoFacturaSel.cuenttiTransacionId === SIN_FACTURA
                          ? 'Cerrado a mano, sin documento en Cuentti'
                          : <>Factura <span className="hd-mono" style={{ color: 'var(--text)', fontWeight: 700 }}>{trabajoFacturaSel.cuenttiTransacionId}</span></>}
                        {trabajoFacturaSel.facturadoEn && ` · ${new Date(trabajoFacturaSel.facturadoEn).toLocaleDateString('es-CO')}`}
                      </div>
                    </div>
                  </div>
                )}
              </Paso>

              {/* PASO 2 — Facturar */}
              <Paso n={2} titulo="Facturar"
                state={hasFactura ? 'done' : hasTrabajo ? 'active' : 'pending'}
                estado={hasFactura ? 'LISTO' : hasTrabajo ? 'EN CURSO' : 'ESPERA EL TRABAJO'}
                accion={
                  <Button variant="primary" onClick={facturarTrabajo} disabled={!facturaId || facturando}>
                    {facturando ? 'Enviando...' : 'Enviar a Cuentti'}
                  </Button>
                }>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                  <Campo label="Resolución (Interna · Electrónica DIAN)">
                    <select className="input" value={prefijo} onChange={e => { const v = e.target.value; setPrefijo(v); if (facturaId) refreshPreview(facturaId, v) }}>
                      {resoluciones.map(r => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Método de pago">
                    {/* Sin el "(ID 1)": el número interno de Cuentti solo sirve dentro
                        del panel "Encontrar IDs", no en la cara del mostrador. */}
                    <select className="input" value={metodoPagoKey} onChange={e => setMetodoPagoKeyPersist(e.target.value)}>
                      {METODOS_PAGO.map(m => (
                        <option key={m.key} value={m.key}>{m.nombre}</option>
                      ))}
                    </select>
                  </Campo>
                </div>
                <div className="hd-sub" style={{ marginTop: 8, lineHeight: 1.45 }}>
                  Se envía como {resolucionLabel} · {metodoLabel}.
                </div>
                {facturaId && factError[facturaId] && (
                  <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--bad-bg)', color: 'var(--bad-fg)', fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>
                    El envío anterior falló, pero la factura PUDO quedar creada en Cuentti. Verifícalo en "Últimas facturas" antes de reintentar.
                  </div>
                )}
              </Paso>

              {/* PASO 3 — Emitir DIAN. Era una tarjeta aparte al final de la
                  página; el número de factura que pide es justo el que devuelve
                  el paso 2, así que vive dentro del mismo hilo. */}
              <Paso n={3} titulo="Emitir DIAN"
                state={hasDian ? 'done' : hasFactura ? 'active' : 'pending'}
                estado={hasDian ? 'LISTO' : hasFactura ? 'EN CURSO' : 'ESPERA EL ID'}
                accion={
                  <Button variant="primary" onClick={emitirFE} disabled={emitiendo || !emitId}>
                    {emitiendo ? 'Enviando...' : 'Emitir FE + DIAN'}
                  </Button>
                }>
                <Campo label="Factura #">
                  <input className="input hd-mono" value={emitId} placeholder="ID devuelto al facturar"
                    onChange={e => setEmitId(e.target.value)} />
                </Campo>
                {emitResp && (
                  <pre style={{ background: 'var(--navy)', color: '#e2e8f0', padding: 12, borderRadius: 10, fontSize: 12, marginTop: 9, marginBottom: 0, overflowX: 'auto' }}>
                    {formatJson(emitResp)}
                  </pre>
                )}
              </Paso>

              {/* PASO 4 — Pago / Abono */}
              <Paso n={4} titulo="Pago / Abono"
                state={hasPago ? 'done' : hasFactura ? 'active' : 'pending'}
                estado={hasPago ? 'LISTO' : hasFactura ? 'EN CURSO' : 'PENDIENTE'}>
                <div className="hd-sub" style={{ lineHeight: 1.45 }}>
                  El pago del método elegido entra a caja al enviar la factura. Con Crédito la factura queda pendiente de abono en Cuentti.
                </div>
              </Paso>

              {/* PASO 5 — URL · QR */}
              <Paso n={5} titulo="URL · QR"
                state={hasDoc ? 'done' : hasPago ? 'active' : 'pending'}
                estado={hasDoc ? 'LISTO' : hasPago ? 'EN CURSO' : 'PENDIENTE'}>
                <div className="hd-sub" style={{ lineHeight: 1.45 }}>
                  Enlace del documento para el cliente.
                </div>
              </Paso>
            </div>

            {/* Pie de la tarjeta: la configuración de IDs es de instalación, no
                del día a día, así que vive abajo y plegada. */}
            <div className="hd-tbl__f" style={{ height: 'auto', minHeight: 52, padding: '8px 18px', flexWrap: 'wrap' }}>
              <Button variant="outline" size="sm" onClick={() => setShowConfigIds(s => !s)}
                icon={showConfigIds
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>}>
                {showConfigIds ? 'Cerrar' : 'Encontrar IDs'}
              </Button>
              <div className="hd-bar__sp" />
              <span className="hd-bar__n">Medios de pago e id_banco de tu Cuentti</span>
            </div>

            {/* Panel para encontrar los IDs reales de Cuentti. Mismo contenido de
                antes, sin las cajas dentro de cajas: dos bloques separados por
                una línea. */}
            {showConfigIds && (
              <div style={{ padding: '14px 18px 16px', borderTop: '1px solid var(--row-line)' }}>
                <div className="hd-strong" style={{ marginBottom: 5 }}>Encontrar los IDs reales de tu Cuentti</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
                  Tu Cuentti tiene IDs únicos en su tabla <code className="hd-mono">vent_medio_pago</code>. Hay 2 formas de encontrarlos:
                </div>

                {/* Opcion 1: detector automatico */}
                <div className="hd-fig__l" style={{ textAlign: 'left', marginBottom: 8 }}>OPCIÓN 1 · AUTO-DETECTAR (RÁPIDO)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Button type="button" variant="primary" size="sm" onClick={detectarIdsAutomaticamente}
                    disabled={detectandoMedios}
                    icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}>
                    {detectandoMedios ? 'Probando 30 endpoints…' : 'Auto-detectar'}
                  </Button>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', flex: '1 1 200px' }}>
                    Prueba 30+ endpoints comunes hasta encontrar uno que liste tus medios.
                  </div>
                </div>
                {mediosDetectados && mediosDetectados.ok && (
                  <div style={{ padding: '9px 11px', background: 'var(--ok-bg)', borderRadius: 10, fontSize: 12 }}>
                    <div style={{ color: 'var(--ok-fg)', fontWeight: 700, marginBottom: 6 }}>{mediosDetectados.medios.length} medios encontrados</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {mediosDetectados.medios.map((m, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--tap)' }}>
                          <span className="hd-mono" style={{ minWidth: 30, fontWeight: 700, color: 'var(--accent)' }}>{m.id}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>{m.nombre}</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => aplicarMedioDetectado(m)}>Aplicar</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mediosDetectados && !mediosDetectados.ok && (
                  <div style={{ padding: '9px 11px', background: 'var(--warn-bg)', color: 'var(--warn-fg)', borderRadius: 10, fontSize: 11.5, lineHeight: 1.45 }}>
                    Tu Cuentti no expone los medios vía API. Usa la <strong>Opción 2</strong> abajo para probar IDs uno por uno.
                  </div>
                )}

                <div style={{ height: 1, background: 'var(--row-line)', margin: '16px 0 14px' }} />

                {/* Opcion 2: probar IDs manualmente */}
                <div className="hd-fig__l" style={{ textAlign: 'left', marginBottom: 8 }}>OPCIÓN 2 · PROBAR ID CON FACTURA TEST</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.45 }}>
                  Cambia el número al lado de cada método y dale "Probar". La app crea una factura de $1 con ese ID y la anula inmediatamente. Si funciona, el ID es válido.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {metodosConfig.filter(m => m.key !== 'credito').map(m => {
                    const res = resultadoPrueba[m.key]
                    const isLoading = probandoId?.key === m.key
                    return (
                      <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--row-line)', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                          <div className="hd-strong">{m.nombre}</div>
                          {res && (
                            <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: res.ok ? 'var(--ok-fg)' : res.loading ? 'var(--text-3)' : 'var(--bad-fg)' }}>
                              {res.loading ? (res.mensaje || 'Probando...') : (res.ok ? (res.mensaje || 'ID válido') : (res.mensaje || '').slice(0, 50))}
                            </div>
                          )}
                        </div>
                        <input type="number" min="0" max="50" className="input hd-mono"
                          value={m.id}
                          onChange={e => guardarMetodoId(m.key, parseInt(e.target.value) || 0)}
                          style={{ width: 62, fontWeight: 700, textAlign: 'center', fontSize: 13, padding: '5px 6px' }}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => probarIdEspecifico(m.key, m.id)}
                          disabled={isLoading}>
                          {isLoading ? 'Probando…' : 'Probar'}
                        </Button>
                        <Button type="button" variant="primary" size="sm" onClick={() => autoProbarIds(m.key)}
                          disabled={isLoading}
                          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>}>
                          {isLoading && probandoId?.id === 'auto' ? 'Probando…' : 'Auto 1-15'}
                        </Button>
                      </div>
                    )
                  })}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--row-line)', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                      <div className="hd-strong">Banco para transferencia/tarjetas</div>
                      <div className="hd-sub">id_banco</div>
                    </div>
                    <input type="number" min="1" className="input hd-mono"
                      value={idBancoConfig}
                      onChange={e => guardarIdBanco(parseInt(e.target.value) || 1)}
                      style={{ width: 62, fontWeight: 700, textAlign: 'center', fontSize: 13, padding: '5px 6px' }}
                    />
                    <Button type="button" variant="primary" size="sm" onClick={autoProbarBanco}
                      disabled={probandoId !== null}
                      icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>}>
                      Auto 1-15
                    </Button>
                  </div>
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 12, padding: '9px 11px', background: 'var(--accent-soft)', borderRadius: 10, lineHeight: 1.5 }}>
                  <strong>Recomendado:</strong> click <strong>"Auto 1-15"</strong> al lado de cada método. La app prueba IDs del 1 al 15 hasta encontrar el correcto, lo guarda y se detiene. Tarda ~30 segundos por método. Cada prueba crea-y-anula una factura test de $1.
                </div>
              </div>
            )}
          </div>

          {previewPayload && (
            <DebugCard title="Previsualización de envío" open={!!debugOpen.preview} onToggle={() => toggleDebug('preview')}>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 10px' }}>
                Payload que se enviara a Cuentti (token en headers enmascarado).
              </p>
              <pre style={{ background: 'var(--navy)', color: '#e2e8f0', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto' }}>
                {formatJson(previewPayload)}
              </pre>
              {previewHeaders && (
                <>
                  <div className="hd-sub" style={{ marginTop: 8 }}>Headers</div>
                  <pre style={{ background: 'var(--navy)', color: '#e2e8f0', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto' }}>
                    {formatJson(previewHeaders)}
                  </pre>
                </>
              )}
            </DebugCard>
          )}

          {ultimoPayload && (
            <DebugCard title="Último payload enviado" open={!!debugOpen.ultimo} onToggle={() => toggleDebug('ultimo')}>
              <pre style={{ background: 'var(--navy)', color: '#e2e8f0', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto' }}>
                {formatJson(ultimoPayload)}
              </pre>
              {ultimoHeaders && (
                <>
                  <div className="hd-sub" style={{ marginTop: 8 }}>Headers</div>
                  <pre style={{ background: 'var(--navy)', color: '#e2e8f0', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto' }}>
                    {formatJson(ultimoHeaders)}
                  </pre>
                </>
              )}
            </DebugCard>
          )}

          {facturaResp && (
            <DebugCard title="Última respuesta de facturación" sub={extractIdTransacion(facturaResp) ? `Factura #${extractIdTransacion(facturaResp)}` : null} open={!!debugOpen.resp} onToggle={() => toggleDebug('resp')}>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 10px' }}>
                Factura # detectada: <span className="hd-mono" style={{ color: 'var(--text)', fontWeight: 700 }}>{extractIdTransacion(facturaResp) || '—'}</span>
              </p>
              <pre style={{ background: 'var(--navy)', color: '#e2e8f0', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto' }}>
                {formatJson(facturaResp)}
              </pre>
            </DebugCard>
          )}

        </div>{/* end left column */}

        {/* PANEL DERECHO: Estado de envio + Ultimas facturas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div className="hd-card">
            <div className="hd-bar">
              <span className="hd-strong">Estado de envío</span>
              <div className="hd-bar__sp" />
              <span className="hd-chip hd-chip--info">{statusDone} DE {statusItems.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '0 18px 15px' }}>
              {statusItems.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 20, height: 20, flex: 'none', borderRadius: '50%',
                    display: 'grid', placeItems: 'center',
                    background: s.ok ? 'var(--ok-bg)' : 'var(--chip)',
                    color: s.ok ? 'var(--ok-fg)' : 'var(--text-4)',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.3, color: s.ok ? 'var(--text)' : 'var(--text-3)', fontWeight: s.ok ? 600 : 400 }}>{s.lbl}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hd-card">
            <div className="hd-bar">
              <span className="hd-strong">Últimas facturas</span>
              <div className="hd-bar__sp" />
              <span className="hd-chip hd-chip--mute">{ultimasFacturas.length}</span>
            </div>
            {ultimasFacturas.length === 0 ? (
              <div className="hd-void" style={{ padding: '26px 20px' }}>
                <div className="hd-void__t">Sin facturas registradas</div>
                <div className="hd-void__s">Las facturas emitidas aparecen aquí.</div>
              </div>
            ) : (
              <>
                <div className="hd-tbl__h">
                  <span style={{ width: 58, flex: 'none' }}>N°</span>
                  <span style={{ flex: 1 }}>CLIENTE · RESOLUCIÓN</span>
                  <span style={{ width: 92, flex: 'none', textAlign: 'right' }}>VALOR</span>
                </div>
                {ultimasFacturas.map((f, i) => {
                  const sinFactura = f.cuenttiTransacionId === SIN_FACTURA
                  // cuenttiResolucion PRIMERO: es el campo que se guarda al
                  // facturar. Antes se miraba cuenttiPrefijo, que no existe en el
                  // objeto, y el respaldo era "empieza por FE" - los ids son
                  // numericos (6019), asi que TODA factura se rotulaba "Interna"
                  // aunque fuera electronica.
                  const tipo = f.cuenttiResolucion || f.cuenttiPrefijo || (f.cuenttiTransacionId?.toString().startsWith('FE') ? 'FEIC' : 'MAS')
                  const tipoLabel = sinFactura ? 'Sin factura' : (tipo === 'FEIC' ? 'Electrónica DIAN' : 'Interna')
                  const num = sinFactura ? '—' : f.cuenttiTransacionId
                  // efectivo/transferencia SIN pagar = el pago NO entró a caja (falló al
                  // facturar). Se distingue del crédito, que sí es "pendiente" normal.
                  const pagoNoEntroCaja = !f.pagado && !f.cuenttiPagado && !f.cuenttiAprobado && !!f.metodoPago && f.metodoPago !== 'credito'
                  const estadoBadge = (f.pagado || f.cuenttiPagado)
                    ? { c: 'hd-chip--ok', l: 'PAGADA' }
                    : f.cuenttiAprobado ? { c: 'hd-chip--ok', l: 'APROBADA' }
                    : pagoNoEntroCaja ? { c: 'hd-chip--bad', l: 'NO ENTRÓ A CAJA' }
                    : f.metodoPago === 'credito' ? { c: 'hd-chip--warn', l: 'A CRÉDITO' }
                    : { c: 'hd-chip--warn', l: 'PENDIENTE' }
                  return (
                    <div key={i} style={{ padding: '9px 16px', borderBottom: i < ultimasFacturas.length - 1 ? '1px solid var(--row-line)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span className={`hd-mono hd-strong ${sinFactura ? 'hd-empty' : ''}`} style={{ width: 58, flex: 'none', fontSize: 12.5 }}>{num}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="hd-clip" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{f.cliente || '—'}</span>
                          <span className="hd-sub" style={{ display: 'block', marginTop: 2 }}>{tipoLabel}</span>
                        </span>
                        <span style={{ width: 92, flex: 'none', textAlign: 'right' }}>
                          <span className="hd-mono" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{fmt(f.total || 0)}</span>
                          <span className={`hd-chip ${estadoBadge.c}`} style={{ marginTop: 4 }}>{estadoBadge.l}</span>
                        </span>
                      </div>
                      {!sinFactura && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                          <Button variant="ghost" size="sm" disabled={anulando === f.cuenttiTransacionId}
                            title={`Anular la factura ${num} en Cuentti y devolver la orden a "por facturar"`}
                            onClick={() => anularFactura(f)}>
                            {anulando === f.cuenttiTransacionId ? 'Anulando...' : 'Anular'}
                          </Button>
                        </div>
                      )}
                      {pagoNoEntroCaja && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 8, padding: '8px 10px', background: 'var(--bad-bg)', borderRadius: 10 }}>
                          <span style={{ fontSize: 11.5, color: 'var(--bad-fg)', lineHeight: 1.35, flex: 1, minWidth: 140 }}>El pago en {f.metodoPago} no entró a caja. Regístralo en Cuentti y márcalo pagado aquí.</span>
                          <Button variant="outline" size="sm" onClick={() => marcarFacturaPagada(f)}>Marcar pagada</Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>{/* end 2-column grid */}

      <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </div>
  )
}
