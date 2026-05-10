import { useState, useEffect, useMemo } from 'react'
import { fmt, fmtCompact } from '../utils/helpers'
import { useInventario, formatCacheAge } from '../hooks/useInventario'

const STOCK_BAJO_UMBRAL = 3

export default function Inventario({ notify }) {
  const {
    inventario: productos,
    loading,
    refreshing,
    cacheAge,
    isStale,
    refresh,
  } = useInventario()
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas')
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 10000)
    return () => clearInterval(id)
  }, [])

  const cargar = async (forzar = false) => {
    await refresh()
    if (forzar) notify('Inventario actualizado desde Cuentti', 'success')
  }

  const categorias = useMemo(() => {
    const cats = new Set(productos.map(p => p.categoria || 'General'))
    return ['todas', ...Array.from(cats).sort()]
  }, [productos])

  // Estado para ordenamiento de columnas
  // sortBy: 'codigo' | 'nombre' | 'categoria' | 'stock' | 'precio' | 'iva' | 'estado'
  // sortDir: 'asc' | 'desc' | null (null = sin orden, default por nombre)
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const toggleSort = (col) => {
    if (sortBy !== col) {
      setSortBy(col)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      // Tercer click: limpiar orden
      setSortBy(null)
      setSortDir('asc')
    }
  }

  const sortIcon = (col) => {
    if (sortBy !== col) return <span style={{ opacity: 0.25, fontSize: 9 }}>↕</span>
    return sortDir === 'asc'
      ? <span style={{ color: 'var(--blue-600)', fontSize: 10 }}>▲</span>
      : <span style={{ color: 'var(--blue-600)', fontSize: 10 }}>▼</span>
  }

  // Para ordenamiento por estado: priorizar Sin stock > Bajo > OK
  const estadoRank = (p) => {
    if (p.esServicio) return 3
    if (p.stock <= 0) return 0
    if (p.stock <= STOCK_BAJO_UMBRAL) return 1
    return 2
  }

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
    if (sortBy) {
      list = [...list].sort((a, b) => {
        let av, bv
        switch (sortBy) {
          case 'codigo': av = (a.codigo || '').toString(); bv = (b.codigo || '').toString(); break
          case 'nombre': av = (a.nombre || '').toLowerCase(); bv = (b.nombre || '').toLowerCase(); break
          case 'categoria': av = (a.categoria || '').toLowerCase(); bv = (b.categoria || '').toLowerCase(); break
          case 'stock': av = parseFloat(a.stock) || 0; bv = parseFloat(b.stock) || 0; break
          case 'precio': av = parseFloat(a.precio) || 0; bv = parseFloat(b.precio) || 0; break
          case 'iva': av = parseFloat(a.iva) || 0; bv = parseFloat(b.iva) || 0; break
          case 'estado': av = estadoRank(a); bv = estadoRank(b); break
          default: return 0
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [productos, busqueda, categoriaFiltro, sortBy, sortDir])

  const stats = useMemo(() => ({
    total: productos.length,
    sinStock: productos.filter(p => p.stock <= 0).length,
    stockBajo: productos.filter(p => !p.esServicio && p.stock > 0 && p.stock <= STOCK_BAJO_UMBRAL).length,
    valorTotal: productos.reduce((s, p) => s + (p.precio * p.stock), 0),
  }), [productos])

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
          <p className="sub">
            {stats.total} referencias · {stats.stockBajo} bajo mínimo · {stats.sinStock} sin stock
            {!loading && <>
              {' · '}
              <span style={{ color: isStale ? 'var(--amber-600)' : 'var(--green-600)', fontWeight: 600 }}>
                {refreshing ? 'sincronizando…' : `Cuentti ${formatCacheAge(cacheAge)}`}
              </span>
            </>}
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-outline btn-sm" onClick={() => cargar(true)} disabled={loading || refreshing}>
            {loading || refreshing ? 'Sincronizando...' : '🔄 Sincronizar Cuentti'}
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
                  <th onClick={() => toggleSort('codigo')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Código {sortIcon('codigo')}</span>
                  </th>
                  <th onClick={() => toggleSort('nombre')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Producto {sortIcon('nombre')}</span>
                  </th>
                  <th onClick={() => toggleSort('categoria')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Categoría {sortIcon('categoria')}</span>
                  </th>
                  <th onClick={() => toggleSort('stock')} className="c-right" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Stock {sortIcon('stock')}</span>
                  </th>
                  <th onClick={() => toggleSort('precio')} className="c-right" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Precio {sortIcon('precio')}</span>
                  </th>
                  <th onClick={() => toggleSort('iva')} className="c-right" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>IVA {sortIcon('iva')}</span>
                  </th>
                  <th onClick={() => toggleSort('estado')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Estado {sortIcon('estado')}</span>
                  </th>
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
