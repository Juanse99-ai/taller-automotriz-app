import { useState, useEffect, useMemo, useCallback } from 'react'
import { fmt, fmtCompact } from '../utils/helpers'
import { cargarInventarioCompleto } from '../services/cuentti'
import { lsGet, lsSet, LS_KEYS } from '../services/storage'

const STOCK_BAJO_UMBRAL = 3

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
    stockBajo: productos.filter(p => !p.esServicio && p.stock > 0 && p.stock <= STOCK_BAJO_UMBRAL).length,
    valorTotal: productos.reduce((s, p) => s + (p.precio * p.stock), 0),
  }), [productos])

  const alertasStock = useMemo(() =>
    productos.filter(p => !p.esServicio && p.stock > 0 && p.stock <= STOCK_BAJO_UMBRAL)
      .sort((a, b) => a.stock - b.stock).slice(0, 10),
  [productos])

  const stockState = (p) => {
    if (p.stock <= 0) return { cls: 'badge-d', lbl: 'Sin stock' }
    if (p.stock <= STOCK_BAJO_UMBRAL) return { cls: 'badge-w', lbl: 'Bajo' }
    return { cls: 'badge-s', lbl: 'OK' }
  }

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
      <div className="pagehd">
        <div>
          <h2>Inventario</h2>
          <p className="sub">{stats.total} referencias · {stats.stockBajo} bajo mínimo · {stats.sinStock} sin stock</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline btn-sm" onClick={() => cargar(true)} disabled={loading}>
            {loading ? 'Sincronizando...' : '🔄 Sincronizar Cuentti'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 18 }}>
        <div className="kpi">
          <div className="kpi__head"><span>Total referencias</span><span className="kpi__ic blue">📦</span></div>
          <div className="kpi__v">{stats.total.toLocaleString('es-CO')}</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><span>Stock bajo</span><span className="kpi__ic amber">⚠️</span></div>
          <div className="kpi__v">{stats.stockBajo}</div>
          <div className="kpi__delta">Requiere reposición</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><span>Sin stock</span><span className="kpi__ic red">🚫</span></div>
          <div className="kpi__v">{stats.sinStock}</div>
          {stats.sinStock > 0 && <div className="kpi__delta" style={{ color: 'var(--red-600)' }}>Agotado</div>}
        </div>
        <div className="kpi">
          <div className="kpi__head"><span>Valor inventario</span><span className="kpi__ic green">💰</span></div>
          <div className="kpi__v" style={{ fontSize: 20 }}>{fmtCompact(stats.valorTotal)}</div>
        </div>
      </div>

      {/* Alertas de stock bajo */}
      {alertasStock.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--amber-500)' }}>
          <div className="card__h">
            <h3 style={{ color: 'var(--amber-600)' }}>⚠️ Stock bajo ({alertasStock.length} productos)</h3>
          </div>
          <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alertasStock.map(p => (
              <div key={p.id || p.codigo} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge badge-w">{p.stock} uds</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Cód: {p.codigo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de productos */}
      <div className="card">
        <div className="card__h" style={{ gap: 12 }}>
          <h3>Productos ({filtrados.length})</h3>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
            {/* Búsqueda */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 11px', minWidth: 200 }}>
              <span style={{ opacity: 0.5, fontSize: 13 }}>🔍</span>
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar código o nombre..."
                style={{ border: 'none', outline: 'none', background: 'none', flex: 1, fontSize: 12.5 }}
              />
            </div>
            {/* Filtro categorías */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-subtle)', padding: 3, borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
              {categorias.slice(0, 6).map(c => (
                <button key={c} onClick={() => setCategoriaFiltro(c)} style={{
                  padding: '5px 10px', fontSize: 11.5, fontWeight: 600, borderRadius: 6,
                  background: categoriaFiltro === c ? 'var(--bg-raised)' : 'transparent',
                  color: categoriaFiltro === c ? 'var(--text)' : 'var(--text-3)',
                  boxShadow: categoriaFiltro === c ? 'var(--shadow-sm)' : 'none',
                  border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                }}>
                  {c === 'todas' ? 'Todas' : c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="card__b">
            <div className="empty-state">
              <div className="empty-state-icon">📦</div>
              <p>No se encontraron productos.</p>
            </div>
          </div>
        ) : (
          <div className="card__b card__b--flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="c-right">Stock</th>
                  <th className="c-right">Precio</th>
                  <th className="c-right">IVA</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 100).map(p => {
                  const s = stockState(p)
                  return (
                    <tr key={p.id || p.codigo}>
                      <td className="c-mono" style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{p.codigo}</td>
                      <td className="c-name">{p.nombre}</td>
                      <td className="c-muted" style={{ textTransform: 'capitalize' }}>{p.categoria}</td>
                      <td className="c-mono c-right" style={{
                        fontWeight: 700,
                        color: p.stock <= 0 ? 'var(--red-600)' : p.stock <= STOCK_BAJO_UMBRAL ? 'var(--amber-500)' : 'var(--text)',
                      }}>{p.stock}</td>
                      <td className="c-mono c-right" style={{ fontWeight: 700 }}>{fmt(p.precio)}</td>
                      <td className="c-mono c-right c-muted">{p.iva}%</td>
                      <td><span className={`badge ${s.cls}`}>{s.lbl}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtrados.length > 100 && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: 12 }}>
                Mostrando 100 de {filtrados.length} productos. Usa el buscador para filtrar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
