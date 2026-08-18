import { useState, useEffect, useMemo } from 'react'
import { fmt, fmtCompact } from '../utils/helpers'
import { TALLER } from '../utils/constants'
import { useInventario } from '../hooks/useInventario'
import { Button, Badge } from '../components/ui'

const STOCK_BAJO_UMBRAL = 3

export default function Inventario({ notify }) {
  const {
    inventario: productos,
    loading,
    refreshing,
    error,
    errorEsToken,
    refresh,
  } = useInventario()
  const [busqueda, setBusqueda] = useState('')
  // Antes habia un filtro por categoria (Cat-1..Cat-5) y un boton "Por reponer".
  // Contra el catalogo real de 3.460 productos, ninguno de los dos partia nada:
  // 3.366 (97%) son "Cat-1" —y "Cat-1" no es un nombre, es el id sin traducir—
  // y "Por reponer" filtraba a 2.996, el 87% del catalogo. Filtrar al 87% no es
  // filtrar. Los grupos que SI parten el inventario son los tres estados de
  // stock, y el mas grave (negativo) no tenia forma de aislarse.
  const [grupo, setGrupo] = useState('todos') // todos | negativo | agotado | bajo
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

  // Estado para ordenamiento de columnas
  // sortBy: 'codigo' | 'nombre' | 'stock' | 'precio' | 'iva'
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

  const filtrados = useMemo(() => {
    let list = productos
    if (soloReponer) {
      list = list.filter(p => !p.esServicio && (parseFloat(p.stock) || 0) <= STOCK_BAJO_UMBRAL)
    }
    if (grupo !== 'todos') {
      list = list.filter(p => {
        if (p.esServicio) return false
        const st = parseFloat(p.stock) || 0
        if (grupo === 'negativo') return st < 0
        if (grupo === 'agotado') return st === 0
        return st > 0 && st <= STOCK_BAJO_UMBRAL // bajo
      })
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
          case 'stock': av = parseFloat(a.stock) || 0; bv = parseFloat(b.stock) || 0; break
          case 'precio': av = parseFloat(a.precio) || 0; bv = parseFloat(b.precio) || 0; break
          case 'iva': av = parseFloat(a.iva) || 0; bv = parseFloat(b.iva) || 0; break
          default: return 0
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [productos, busqueda, grupo, sortBy, sortDir, soloReponer])

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

  // Volver a la página 1 al cambiar la búsqueda/grupo/reposición
  useEffect(() => { setPagina(1) }, [busqueda, grupo, soloReponer])
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaActual = Math.min(pagina, totalPaginas)
  const paginados = filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)

  const stats = useMemo(() => ({
    total: productos.length,
    // "Agotado" = en cero. El stock NEGATIVO va aparte (descuadre): se vendio mas de
    // lo registrado, y eso se arregla cuadrando el inventario, no comprando. Antes
    // los 472 negativos se sumaban a los agotados y el titular pedia reponer de mas.
    sinStock: productos.filter(p => !p.esServicio && (parseFloat(p.stock) || 0) === 0).length,
    descuadre: productos.filter(p => !p.esServicio && (parseFloat(p.stock) || 0) < 0).length,
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

  // Un servicio (mano de obra, "Mas Administracion"…) no tiene existencias: decir
  // "Sin stock" sobre el hace pensar que hay que reponerlo. Y un stock NEGATIVO no
  // es lo mismo que uno en cero: significa que se vendio mas de lo registrado, o
  // sea que el inventario esta descuadrado — comprar no lo arregla, cuadrarlo si.
  // stockState() se fue con la columna "Estado": su etiqueta (OK / Bajo / Sin
  // stock / Descuadre) la dan ahora el color de la celda de Stock y los filtros
  // de arriba. El orden por estado sigue existiendo vía estadoRank().

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
        </div>
        <div className="actions">
          <Button variant="outline" size="sm" onClick={() => cargar(true)} disabled={loading || refreshing}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>}>
            {loading || refreshing ? 'Sincronizando…' : 'Sincronizar Cuentti'}
          </Button>
        </div>
      </div>

      {error && productos.length === 0 && (
        <div style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.35)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: 'var(--red-700,#b91c1c)', flex: 1, minWidth: 200 }}>⚠ {error}</span>
          {/* Con el token vencido, "Reintentar" era un boton al lado de un
             mensaje que dice que reintentar no sirve. La accion que si renueva
             la sesion es volver a cargar la app. */}
          {errorEsToken
            ? <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Recargar</Button>
            : <Button variant="outline" size="sm" onClick={() => cargar(true)} disabled={loading || refreshing}>Reintentar</Button>}
        </div>
      )}

      {/* Cifras del inventario en franja. Se quita la tarjeta "Stock bajo": repetía
          un número que ya va en el desglose de "A reponer".
          NO se dibujan cuando la carga falló: con el catálogo vacío por un error
          de Cuentti, la franja decía "A reponer 0 · 0 agotados", "Referencias 0"
          y "Valor inventario $0" — tres cifras tranquilizadoras sobre un
          inventario de 2.537 referencias del que 940 están agotadas y 327 en
          negativo. Un cero que en realidad es "no sé" es peor que no mostrar
          nada. */}
      {!(error && productos.length === 0) && (
      <div className="statline">
        {/* La cifra que encabezaba era "A reponer 2.996" — el 87% del catálogo.
            Un número que abarca a casi todo no dice qué hacer. El que sí exige
            actuar es el descuadre: 480 productos con stock por debajo de cero
            significa que se vendió más de lo que había registrado, y eso no se
            arregla comprando. Los otros dos grupos siguen ahí, debajo. */}
        <div className="statline__i">
          <span className="eyebrow eyebrow--warn">Stock en negativo</span>
          <span className={`statline__v${stats.descuadre === 0 ? ' is-zero' : ''}`} style={{ color: stats.descuadre > 0 ? 'var(--red-700)' : undefined }}>
            {stats.descuadre.toLocaleString('es-CO')}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {stats.descuadre > 0 ? 'se vendieron sin existencia' : 'inventario cuadrado'}
          </span>
        </div>
        <div className="statline__i">
          <span className="eyebrow">Por comprar</span>
          <span className={`statline__v${(stats.sinStock + stats.stockBajo) === 0 ? ' is-zero' : ''}`}>
            {(stats.sinStock + stats.stockBajo).toLocaleString('es-CO')}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {stats.sinStock.toLocaleString('es-CO')} agotados · {stats.stockBajo.toLocaleString('es-CO')} bajo mínimo
          </span>
        </div>
        <div className="statline__i">
          <span className="eyebrow">Referencias</span>
          <span className={`statline__v${stats.total === 0 ? ' is-zero' : ''}`}>{stats.total.toLocaleString('es-CO')}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>en catálogo</span>
        </div>
        <div className="statline__i">
          <span className="eyebrow">Valor inventario</span>
          <span className={`statline__v${stats.valorTotal === 0 ? ' is-zero' : ''}`}>{fmtCompact(stats.valorTotal)}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{stats.valorCosto > 0 ? `a costo ${fmtCompact(stats.valorCosto)}` : 'a precio de venta'}</span>
        </div>
      </div>
      )}

      {/* Tabla de productos */}
      <div className="card">
        <div className="card__h" style={{ gap: 12 }}>
          <h3>Productos ({filtrados.length})</h3>
          <div className="inv-filtros" style={{ flex: 1, justifyContent: 'flex-end' }}>
            {/* Búsqueda */}
            {/* Search bar iOS: relleno gris del sistema, sin borde, con botón de
                limpiar cuando hay texto (antes tocaba borrar a mano). */}
            <div className="search" style={{ minWidth: 220 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-4)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar código o nombre..."
                aria-label="Buscar producto"
              />
              {busqueda && (
                <button type="button" className="input-clear" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              )}
            </div>
            {/* Situación de stock. Reemplaza a los botones Cat-1..Cat-5: eran
               ids sin traducir y 97% del catálogo caía en el primero, así que
               tres de los cinco filtraban a 3 y 4 productos. Estos tres grupos
               sí parten el inventario, y el primero —el descuadre— no tenía
               forma de aislarse en ningún sitio. */}
            <div className="segctl">
              {[
                ['todos', 'Todos', productos.length],
                ['negativo', 'En negativo', stats.descuadre],
                ['agotado', 'Agotados', stats.sinStock],
                ['bajo', 'Bajo mínimo', stats.stockBajo],
              ].map(([k, lbl, n]) => (
                <button key={k} className={grupo === k ? 'on' : ''} onClick={() => setGrupo(k)}
                  title={k === 'negativo' ? 'Stock por debajo de cero: se vendió más de lo que había registrado' : undefined}>
                  {lbl}{k !== 'todos' && n > 0 ? ` (${n.toLocaleString('es-CO')})` : ''}
                </button>
              ))}
            </div>
            {/* Reposición: filtrar a bajo/sin stock + compartir lista */}
            <button type="button" className={`btn btn-sm ${soloReponer ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSoloReponer(v => !v)}>
              {soloReponer && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              Por reponer ({porReponer.length})
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
              <p>{error && productos.length === 0
                ? (errorEsToken
                    ? 'El catálogo no se pudo cargar: Cuentti rechazó la sesión.'
                    : 'No se pudo cargar el catálogo. Reintenta arriba.')
                : 'No se encontraron productos.'}</p>
            </div>
          </div>
        ) : (
          <div className="card__b card__b--flush">
            <table className="tbl tbl--center tbl-cards tbl--sticky inv-tabla">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('codigo')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Referencia {sortIcon('codigo')}</span>
                  </th>
                  <th onClick={() => toggleSort('nombre')} className="col-left" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Producto {sortIcon('nombre')}</span>
                  </th>
                  {/* Se quitó "Categoría": 3.366 de los 3.460 productos son
                      "Cat-1" (97%), y "Cat-1" no es un nombre sino el id de
                      categoría de Cuentti sin traducir. Una columna que dice lo
                      mismo en 97 de cada 100 filas, con un valor que además no
                      significa nada para quien lo lee. */}
                  <th onClick={() => toggleSort('stock')} className="c-right" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Stock {sortIcon('stock')}</span>
                  </th>
                  <th className="c-right" title="Costo de compra con IVA (traído de Cuentti)">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Costo</span>
                  </th>
                  <th onClick={() => toggleSort('precio')} className="c-right" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Precio {sortIcon('precio')}</span>
                  </th>
                  <th className="c-right" title="Utilidad = margen sobre la venta = (precio − costo) / precio, sin IVA (como Cuentti)">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>Utilidad</span>
                  </th>
                  <th onClick={() => toggleSort('iva')} className="c-right" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>IVA {sortIcon('iva')}</span>
                  </th>
                  {/* Se quitó "Estado" (OK / Bajo / Sin stock / Servicio): lo
                      dice ya la columna Stock, que colorea el negativo en rojo y
                      el bajo en ámbar, y ahora también los filtros de arriba.
                      Era la columna que empujaba la tabla a 1.073px en un
                      contenedor de 952 y aparecía tras una barra de scroll. */}
                </tr>
              </thead>
              <tbody>
                {paginados.map(p => {
                  const baseCosto = parseFloat(p.costoBase) || 0
                  const costoIva = baseCosto > 0 ? baseCosto * (1 + (p.iva || 0) / 100) : 0
                  // Utilidad = MARGEN sobre el precio de venta (como Cuentti): (precio − costo) / precio, sin IVA.
                  const util = (baseCosto > 0 && p.precioBase > 0) ? ((p.precioBase - baseCosto) / p.precioBase) * 100 : null
                  // Un margen bajo -100% no existe: significa que el costo o el precio
                  // estan mal en Cuentti (ej. "Bolsa": costo $63.865 y precio $20 daba
                  // -383.093%). Mostrar ese numero lo hace pasar por dato bueno.
                  const utilRota = util != null && util < -100
                  return (
                    <tr key={p.id || p.codigo}>
                      <td className="c-mono" data-label="Referencia" style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{p.codigo}</td>
                      <td className="c-name col-left">{p.nombre}</td>
                      {/* Un servicio no tiene existencias: su "0" en rojo hacia creer
                          que estaba agotado. Se muestra en gris, sin alarma. */}
                      <td className="c-mono c-right" data-label="Stock" style={{
                        fontWeight: p.esServicio ? 500 : 700,
                        color: p.esServicio ? 'var(--text-4)'
                          : p.stock <= 0 ? 'var(--red-600)'
                          : p.stock <= STOCK_BAJO_UMBRAL ? 'var(--amber-500)' : 'var(--text)',
                      }}>{p.esServicio ? '—' : p.stock}</td>
                      <td className="c-mono c-right" data-label="Costo" style={{ fontWeight: 600, color: 'var(--text-2)' }}>
                        {costoIva > 0 ? fmt(costoIva) : '—'}
                      </td>
                      <td className="c-mono c-right" data-label="Precio" style={{ fontWeight: 700 }}>{fmt(p.precio)}</td>
                      <td className="c-mono c-right" data-label="Utilidad" style={{
                        fontWeight: 700,
                        color: util == null ? 'var(--text-4)' : utilRota ? 'var(--amber-600)' : util < 0 ? 'var(--red-600)' : util < 15 ? 'var(--amber-600)' : 'var(--green-600)',
                      }}>
                        {util == null ? '—'
                          : utilRota
                            ? <span title={`Costo ${fmt(baseCosto)} y precio ${fmt(p.precioBase)}: revisar el producto en Cuentti`}>Revisar</span>
                            : `${util.toFixed(0)}%`}
                      </td>
                      <td className="c-mono c-right c-muted" data-label="IVA">{p.iva}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalPaginas > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 14, flexWrap: 'wrap' }}>
                <Button type="button" variant="outline" size="sm" disabled={paginaActual <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>← Anterior</Button>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  Página <strong style={{ color: 'var(--text)' }}>{paginaActual}</strong> de {totalPaginas} · {filtrados.length} productos
                </span>
                <Button type="button" variant="outline" size="sm" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente →</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
