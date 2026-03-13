import { useState } from 'react'
import { fmt } from '../utils/helpers'
import { buscarClientePorCedula, cargarInventario, enviarFactura, cuenttiConfig } from '../services/cuentti'

export default function CuenttiPanel({ trabajos, notify }) {
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [facturaId, setFacturaId] = useState('')
  const [facturando, setFacturando] = useState(false)

  const testConexion = async () => {
    setTesting(true)
    setTestResult(null)
    const results = { clientes: null, inventario: null }

    try {
      const cliente = await buscarClientePorCedula('222222222222')
      results.clientes = cliente ? 'OK - Respuesta recibida' : 'OK - Sin datos para cedula de prueba'
    } catch (e) {
      results.clientes = `Error: ${e.message}`
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
      const result = await enviarFactura(trabajo)
      notify('Factura enviada a Cuentti exitosamente', 'success')
      console.log('Factura result:', result)
    } catch (e) {
      notify(`Error facturando: ${e.message}`, 'error')
    } finally {
      setFacturando(false)
    }
  }

  // Trabajos facturables (completados con items)
  const facturables = trabajos.filter(t =>
    t.estado === 'Completado' && t.items && t.items.length > 0
  )

  return (
    <div>
      {/* Config actual */}
      <div className="card">
        <div className="card-title">Configuracion Cuentti</div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><td style={{ fontWeight: 600, width: 180 }}>Empresa ID</td><td className="text-mono">{cuenttiConfig.companyId}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Sucursal</td><td className="text-mono">{cuenttiConfig.branchId}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Empleado</td><td className="text-mono">{cuenttiConfig.employeeId}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Zona horaria</td><td className="text-mono">{cuenttiConfig.gtm}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Proxy URL</td><td className="text-mono">{cuenttiConfig.baseUrl}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Token</td><td className="text-mono text-sm" style={{ wordBreak: 'break-all' }}>{cuenttiConfig.token.slice(0, 30)}...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Test de conexion */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Test de Conexion</div>
          <button className="btn btn-primary btn-sm" onClick={testConexion} disabled={testing}>
            {testing ? 'Probando...' : 'Probar Conexion'}
          </button>
        </div>
        {testResult && (
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
            <select className="form-select" value={facturaId} onChange={e => setFacturaId(e.target.value)}>
              <option value="">Seleccionar trabajo...</option>
              {facturables.map(t => (
                <option key={t.id} value={t.id}>
                  {t.id} — {t.placa} — {t.cliente} — {fmt(t.total)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button className="btn btn-success" onClick={facturarTrabajo}
              disabled={!facturaId || facturando}>
              {facturando ? 'Enviando...' : 'Enviar a Cuentti'}
            </button>
          </div>
        </div>
      </div>

      {/* Endpoints disponibles */}
      <div className="card">
        <div className="card-title">Endpoints API</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Operacion</th><th>Path</th></tr>
            </thead>
            <tbody>
              {Object.entries(cuenttiConfig.paths).map(([grupo, paths]) =>
                Object.entries(paths).map(([key, path]) => (
                  <tr key={`${grupo}-${key}`}>
                    <td style={{ fontWeight: 600 }}>{grupo}.{key}</td>
                    <td className="text-mono text-sm" style={{ wordBreak: 'break-all' }}>{path}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
