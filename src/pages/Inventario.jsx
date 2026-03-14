import { useState, useEffect, useMemo, useCallback } from 'react'
import { fmt, fmtCompact } from '../utils/helpers'
import { cargarInventarioCompleto } from '../services/cuentti'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

export default function Inventario({ notify }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas')

  const cargar = useCallback(async (forzar = false) => {
    setLoading(true)
    try {
      if (!forzar) {
        const cached = lsGet(LS_KEYS.INVENTARIO_CACHE, [])
        if (cached.length > 0) {
          setProductos(cached)
          setLoading(false)
          // Actualizar en background
          cargarInventarioCompleto().then(data => {
            if (data.length > 0) {
              setProductos(data)
              lsSet(LS_KEYS.INVENTARIO_CACHE, data)
            }
          }).catch(() => {})
          return
        }
      }
      const data = await cargarInventarioCompleto()
      if (data.length > 0) {
        setProductos(data)
        lsSet(LS_KEYS.INVENTARIO_CACHE, data)
        if (forzar) notify('Inventario actualizado desde Cuentti', 'success')
      } else {
        const cached = lsGet(LS_KEYS.INVENTARIO_CACHE, [])
        setProductos(cached)
        if (forzar) notify('No se pudo conectar con Cuentti, mostrando cache', 'error')
      }
    } catch {
      setProductos(lsGet(LS_KEYS.INVENTARIO_CACHE, []))
      if (forzar) notify('Error conectando con Cuentti', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { cargar() }, [cargar])

  const categorias = useMemo(() => {
    const cats = new Set(productos.map(p => p.categoria || 'General'))
    return ['todas', ...Array.from(cats).sort()]
  }, [productos])

  const filtrados = useMemo(() => {
    let list = productos
    if (categoriaFiltro !== 'todas') {
      list = list.filter(p => p.categoria === categoriaFiltro)
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      list = list.filter(p =>
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.codigo || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [productos, busqueda, categoriaFiltro])

  const stats = useMemo(() => ({
    total: productos.length,
    sinStock: productos.filter(p => p.stock <= 0).length,
    valorTotal: productos.reduce((s, p) => s + (p.precio * p.stock), 0),
  }), [productos])

  if (loading && productos.length === 0) {
    return (
      <div className="empty-state">
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p>Cargando inventario desde Cuentti...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{stats.total.toLocaleString('es-CO')}</div>
          <div className="metric-label">Productos</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: 'var(--red-500)' }}>{stats.sinStock.toLocaleString('es-CO')}</div>
          <div className="metric-label">Sin Stock</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ fontSize: stats.valorTotal >= 1_000_000 ? '1.4rem' : undefined }}>{fmtCompact(stats.valorTotal)}</div>
          <div className="metric-label">Valor Inventario</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Productos ({filtrados.length})</div>
          <button className="btn btn-outline btn-sm" onClick={() => cargar(true)} disabled={loading}>
            {loading ? 'Sincronizando...' : 'Sincronizar Cuentti'}
          </button>
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input className="form-input" placeholder="Buscar por nombre o codigo..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select className="form-select" value={categoriaFiltro}
              onChange={e => setCategoriaFiltro(e.target.value)}>
              {categorias.map(c => (
                <option key={c} value={c}>{c === 'todas' ? 'Todas las categorias' : c}</option>
              ))}
            </select>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p>No se encontraron productos.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Producto</th>
                  <th>Categoria</th>
                  <th className="text-right">Precio (IVA inc.)</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">IVA %</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 100).map(p => (
                  <tr key={p.id || p.codigo}>
                    <td className="text-mono text-sm">{p.codigo}</td>
                    <td>{p.nombre}</td>
                    <td className="text-sm text-muted">{p.categoria}</td>
                    <td className="text-right text-mono">{fmt(p.precio)}</td>
                    <td className="text-right">
                      <span className={p.stock <= 0 ? 'badge badge-danger' : p.stock < 5 ? 'badge badge-warning' : 'badge badge-success'}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="text-right text-sm">{p.iva}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtrados.length > 100 && (
              <p className="text-sm text-muted text-center" style={{ padding: 12 }}>
                Mostrando 100 de {filtrados.length} productos. Usa el buscador para filtrar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
