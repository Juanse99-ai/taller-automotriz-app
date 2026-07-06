import { useState, useEffect, useMemo } from 'react'
import { fmt, fmtCompact } from '../utils/helpers'
import { TALLER } from '../utils/constants'
import { useInventario, formatCacheAge } from '../hooks/useInventario'

const STOCK_BAJO_UMBRAL = 3

export default function Inventario({ notify }) {
  const {
    inventario: productos,
    loading,
    refreshing,
    error,
    cacheAge,
    isStale,
    refresh,
  } = useInventario()
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas')
  const [soloReponer, setSoloReponer] = useState(false)
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
  const PAGE_SIZE = 100
  const [pagina, setPagina] = useState(1)

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
    if (soloReponer) {
      list = list.filter(p => !p.esServicio && (parseFloat(p.stock) || 0) <= STOCK_BAJO_UMBRAL)
    }
    if (categoriaFiltro !== 'todas') {
      list = list.filter(p => p.categoria === categoriaFiltro)
    }
    if (busqueda.trim()) {
      // Multi-palabra: cada palabra debe aparecer (en cualquier orden) en
      // nombre/código/SKU. Ej: "rodamiento duster" trae los que tengan AMBAS.
      const terms = busqueda.toLowerCase().split(/\s+/).filter(Boolean)
      list = list.filter(p => {
        const hay = `${p.nombre || ''} ${p.codigo || ''} ${p.sku || ''} ${p.codigoBarras || ''}`.toLowerCase()
        return terms.every(t => hay.includes(t))
      })
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
  }, [productos, busqueda, categoriaFiltro, sortBy, sortDir, soloReponer])

  // Productos por reponer (bajo o sin stock, sin servicios) — para el botón y la lista
  const porReponer = useMemo(
    () => productos.filter(p => !p.esServicio && (parseFloat(p.stock) || 0) <= STOCK_BAJO_UMBRAL),
    [productos])

  // Texto de la lista de reposición para compartir (WhatsApp al proveedor)
  const listaReposicion = () => {
    const items = [...porReponer].sort((a, b) => (parseFloat(a.stock) || 0) - (parseFloat(b.stock) || 0))
    const lineas = items.map(p => {
      const stock = parseFloat(p.stock) || 0
      const traer = Math.max(1, STOCK_BAJO_UMBRAL * 2 - stock)
      return `• ${p.nombre}${p.codigo ? ` [${p.codigo}]` : ''} — stock ${stock}, traer ~${traer}`
    })
    return `*Lista de reposición · ${TALLER.nombre}*\n${items.length} productos por reponer:\n\n${lineas.join('\n')}`
  }
  const compartirReposicion = async () => {
    if (!porReponer.length) return
    const texto = listaReposicion()
    // Copiar al portapapeles: funciona en todos lados (pégala en WhatsApp, correo, etc.).
    // wa.me/?text sin número da "WhatsApp Error" en desktop, por eso no se usa.
    try {
      await navigator.clipboard.writeText(texto)
      notify('Lista copiada — pégala en WhatsApp, correo o donde quieras', 'success')
    } catch {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
    }
  }

  // Volver a la página 1 al cambiar la búsqueda/categoría/reposición
  useEffect(() => { setPagina(1) }, [busqueda, categoriaFiltro, soloReponer])
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaActual = Math.min(pagina, totalPaginas)
  const paginados = filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)

  const stats = useMemo(() => ({
    total: productos.length,
    sinStock: productos.filter(p => !p.esServicio && (parseFloat(p.stock) || 0) <= 0).length,
    stockBajo: productos.filter(p => !p.esServicio && p.stock > 0 && p.stock <= STOCK_BAJO_UMBRAL).length,
    // Solo repuestos con stock en mano (>0). Los servicios/mano de obra quedan en
    // negativo por venderse sin control de existencias y falseaban el total.
    valorTotal: productos.reduce((s, p) => {
      const stock = parseFloat(p.stock) || 0
      return s + (!p.esServicio && stock > 0 ? (parseFloat(p.precio) || 0) * stock : 0)
    }, 0),
    // Valor a costo CON IVA = Σ costo×(1+IVA)×stock, SOLO stock > 0 (inventario en
    // mano). Se excluye el stock negativo de servicios/mano de obra (que quedan en
    // negativo por venderse sin control de existencias) para no falsear el total.
    valorCosto: productos.reduce((s, p) => {
      const base = parseFloat(p.costoBase) || 0
      const stock = parseFloat(p.stock) || 0
      return s + (base > 0 && stock > 0 ? base * (1 + (parseFloat(p.iva) || 0) / 100) * stock : 0)
    }, 0),
  }), [productos])

  const stockState = (p) => {
    if (p.stock <= 0) return { cls: 'badge-d', lbl: 'Sin stock' }
    if (p.stock <= STOCK_BAJO_UMBRAL) return { cls: 'badge-w', lbl: 'Bajo' }
    return { cls: 'badge-s', lbl: 'OK' }
  }

  if (loading && productos.length === 0) {
    return (
      <div>
        <div className="skeleton" style={{ height: 30, width: 200, marginBottom: 18 }} />
        <div className="skeleton" style={{ height: 92, borderRadius: 14, marginBottom: 18 }} />
        <div className="card">
          <div className="card__b">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sk-row">
                <div className="skeleton" style={{ height: 14, width: 70 }} />
                <div className="skeleton" style={{ height: 14, flex: 1 }} />
                <div className="skeleton" style={{ height: 14, width: 80 }} />
                <div className="skeleton" style={{ height: 14, width: 60 }} />
              </div>
            ))}
          </div>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, marginTop: 14 }}>Cargando inventario desde Cuentti…</p>
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

      {error && productos.length === 0 && (
        <div style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.35)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: 'var(--red-700,#b91c1c)', flex: 1, minWidth: 200 }}>⚠ {error}</span>
          <button className="btn btn-outline btn-sm" onClick={() => cargar(true)} disabled={loading || refreshing}>Reintentar</button>
        </div>
      )}

      {/* KPIs — hero "Atención" + 3 mini (rompe simetría 4x igual) */}
      <div className="kpi-bh" style={{ marginBottom: 18 }}>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">A reponer</div>
          <div className="kpi-bh__row"><span className="kpi-bh__v" style={{ color: 'var(--red-700)' }}>{(stats.sinStock + stats.stockBajo).toLocaleString('es-CO')}</span></div>
          <div className="kpi-bh__sub">{stats.sinStock} agotados · {stats.stockBajo} bajo mínimo</div>
        </div>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">Referencias</div>
          <div className="kpi-bh__row"><span className="kpi-bh__v">{stats.total.toLocaleString('es-CO')}</span></div>
          <div className="kpi-bh__sub">total</div>
        </div>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">Valor inventario</div>
          <div className="kpi-bh__row"><span className="kpi-bh__v">{fmtCompact(stats.valorTotal)}</span></div>
          <div className="kpi-bh__sub">{stats.valorCosto > 0 ? `a costo ${fmtCompact(stats.valorCosto)}` : 'venta'}</div>
        </div>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">Stock bajo</div>
          <div className="kpi-bh__row"><span className="kpi-bh__v">{stats.stockBajo.toLocaleString('es-CO')}</span></div>
          <div className="kpi-bh__sub">reponer</div>
        </div>
      </div>

      {/* Tabla de productos */}
      <div className="card">
        <div className="card__h" style={{ gap: 12 }}>
          <h3>Productos ({filtrados.length})</h3>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
            {/* Búsqueda */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 12px', minWidth: 220 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar código o nombre..."
                style={{ border: 'none', outline: 'none', background: 'none', flex: 1, fontSize: 13.5 }}
              />
            </div>
            {/* Filtro categorías */}
            <div className="segctl">
              {categorias.slice(0, 6).map(c => (
                <button key={c} className={categoriaFiltro === c ? 'on' : ''} onClick={() => setCategoriaFiltro(c)} style={{ textTransform: 'capitalize' }}>
                  {c === 'todas' ? 'Todas' : c}
                </button>
              ))}
            </div>
            {/* Reposición: filtrar a bajo/sin stock + compartir lista */}
            <button type="button" className={`btn btn-sm ${soloReponer ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSoloReponer(v => !v)}>
              {soloReponer ? '✓ ' : ''}Por reponer ({porReponer.length})
            </button>
            {soloReponer && porReponer.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={compartirReposicion}
                style={{ background: 'var(--green-600)', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copiar lista
              </button>
            )}
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="card__b">
            <div className="empty-state">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: .8 }}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              <p>No se encontraron productos.</p>
            </div>
          </div>
        ) : (
          <div className="card__b card__b--flush">
            <table className="tbl tbl--center tbl-cards">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('codigo')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Código {sortIcon('codigo')}</span>
                  </th>
                  <th onClick={() => toggleSort('nombre')} className="col-left" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Producto {sortIcon('nombre')}</span>
                  </th>
                  <th onClick={() => toggleSort('categoria')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Categoría {sortIcon('categoria')}</span>
                  </th>
                  <th onClick={() => toggleSort('stock')} className="c-right" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Stock {sortIcon('stock')}</span>
                  </th>
                  <th className="c-right" title="Costo de compra con IVA (traído de Cuentti)">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Costo</span>
                  </th>
                  <th onClick={() => toggleSort('precio')} className="c-right" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Precio {sortIcon('precio')}</span>
                  </th>
                  <th className="c-right" title="Utilidad = (precio venta − costo) / costo, sobre valores sin IVA">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Utilidad</span>
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
                {paginados.map(p => {
                  const s = stockState(p)
                  const baseCosto = parseFloat(p.costoBase) || 0
                  const costoIva = baseCosto > 0 ? baseCosto * (1 + (p.iva || 0) / 100) : 0
                  const util = (baseCosto > 0 && p.precioBase > 0) ? ((p.precioBase - baseCosto) / baseCosto) * 100 : null
                  return (
                    <tr key={p.id || p.codigo}>
                      <td className="c-mono" data-label="Código" style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{p.codigo}</td>
                      <td className="c-name col-left">{p.nombre}</td>
                      <td className="c-muted" data-label="Categoría" style={{ textTransform: 'capitalize' }}>{p.categoria}</td>
                      <td className="c-mono c-right" data-label="Stock" style={{
                        fontWeight: 700,
                        color: p.stock <= 0 ? 'var(--red-600)' : p.stock <= STOCK_BAJO_UMBRAL ? 'var(--amber-500)' : 'var(--text)',
                      }}>{p.stock}</td>
                      <td className="c-mono c-right" data-label="Costo" style={{ fontWeight: 600, color: 'var(--text-2)' }}>
                        {costoIva > 0 ? fmt(costoIva) : '—'}
                      </td>
                      <td className="c-mono c-right" data-label="Precio" style={{ fontWeight: 700 }}>{fmt(p.precio)}</td>
                      <td className="c-mono c-right" data-label="Utilidad" style={{
                        fontWeight: 700,
                        color: util == null ? 'var(--text-4)' : util < 0 ? 'var(--red-600)' : util < 15 ? 'var(--amber-600)' : 'var(--green-600)',
                      }}>
                        {util == null ? '—' : `${util.toFixed(0)}%`}
                      </td>
                      <td className="c-mono c-right c-muted" data-label="IVA">{p.iva}%</td>
                      <td data-label="Estado"><span className={`badge ${s.cls}`}>{s.lbl}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalPaginas > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 14, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline btn-sm" disabled={paginaActual <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>← Anterior</button>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  Página <strong style={{ color: 'var(--text)' }}>{paginaActual}</strong> de {totalPaginas} · {filtrados.length} productos
                </span>
                <button type="button" className="btn btn-outline btn-sm" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
