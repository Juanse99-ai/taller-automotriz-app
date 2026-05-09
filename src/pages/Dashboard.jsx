import { useMemo } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { ESTADOS, TECNICOS, DIAS_ESTANCADO } from '../utils/constants'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)
const IcDollar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
)
const IcCar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
    <circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>
  </svg>
)
const IcCal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IcArrow = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)
const IcPlus = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IcDownload = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)
const IcPhone = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
)

// ── Helpers ───────────────────────────────────────────────────────────────────
const ACTIVOS = [ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.EN_PROGRESO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.EN_PRUEBA, ESTADOS.PROGRAMADO]

function tecNombre(id) {
  const t = TECNICOS.find(t => t.id === parseInt(id))
  return t ? t.nombre : null
}

function initials(nombre) {
  if (!nombre) return '?'
  return nombre.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
}

function estadoBadge(estado) {
  if (estado === ESTADOS.COMPLETADO) return 'badge-s'
  if (estado === ESTADOS.CANCELADO) return 'badge-d'
  if (estado === ESTADOS.EN_PROGRESO || estado === ESTADOS.EN_PRUEBA) return 'badge-n'
  return 'badge-w'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard({ trabajos = [], onNavigate }) {
  const now = new Date()

  // ── KPI stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activos = trabajos.filter(t => ACTIVOS.includes(t.estado)).length
    const listoCount = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO).length
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
    const ingresosMes = trabajos
      .filter(t => new Date(t.fecha) >= inicioMes)
      .reduce((s, t) => s + (t.total || 0), 0)
    // Hoy
    const hoyStart = new Date(now); hoyStart.setHours(0,0,0,0)
    const hoyEnd = new Date(now); hoyEnd.setHours(23,59,59,999)
    const ingresosHoy = trabajos
      .filter(t => { const f = new Date(t.fecha); return f >= hoyStart && f <= hoyEnd })
      .reduce((s, t) => s + (t.total || 0), 0)
    return { activos, listoCount, ingresosMes, ingresosHoy }
  }, [trabajos])

  // ── Estancados ─────────────────────────────────────────────────────────────
  const estancados = useMemo(() =>
    trabajos.filter(t => {
      if (t.estado === ESTADOS.COMPLETADO || t.estado === ESTADOS.CANCELADO) return false
      const dias = t.fecha ? Math.floor((Date.now() - new Date(t.fecha)) / 86400000) : 0
      return dias >= DIAS_ESTANCADO
    }), [trabajos])

  // ── Urgentes (activos, sin completados, sin cancelados) ───────────────────
  const urgentes = useMemo(() =>
    [...trabajos]
      .filter(t => ACTIVOS.includes(t.estado))
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .slice(0, 5),
  [trabajos])

  // ── Listos para entregar ───────────────────────────────────────────────────
  const listos = useMemo(() =>
    trabajos.filter(t => t.estado === ESTADOS.COMPLETADO).slice(-3).reverse(),
  [trabajos])

  // ── Agenda de hoy (ingresados hoy) ────────────────────────────────────────
  const agenda = useMemo(() => {
    const hoyStart = new Date(now); hoyStart.setHours(0,0,0,0)
    const hoyEnd = new Date(now); hoyEnd.setHours(23,59,59,999)
    return trabajos
      .filter(t => { const f = new Date(t.fecha); return f >= hoyStart && f <= hoyEnd })
      .slice(0, 4)
  }, [trabajos])

  // ── Ingresos: últimos 12 meses ────────────────────────────────────────────
  const barras = useMemo(() => {
    const meses = []
    const labels = []
    const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const inicio = new Date(d.getFullYear(), d.getMonth(), 1)
      const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      const total = trabajos
        .filter(t => { const f = new Date(t.fecha); return f >= inicio && f <= fin })
        .reduce((s, t) => s + (t.total || 0), 0)
      meses.push(total)
      labels.push(MESES[d.getMonth()])
    }
    return { values: meses, labels }
  }, [trabajos])

  const maxB = Math.max(...barras.values, 1)

  // ── Productividad por técnico ──────────────────────────────────────────────
  const porTecnico = useMemo(() =>
    TECNICOS.map(tec => {
      const ts = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id)
      const completados = ts.filter(t => t.estado === ESTADOS.COMPLETADO).length
      const ingresos = ts.reduce((s, t) => s + (t.total || 0), 0)
      return { nombre: tec.nombre.split(' ')[0], completados, ingresos, total: ts.length }
    }), [trabajos])

  // ── Fecha display ──────────────────────────────────────────────────────────
  const fechaHoy = now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  const fechaCap = fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)

  const totalIngresos = barras.values.reduce((s, v) => s + v, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Welcome row ─────────────────────────────────────────────────── */}
      <div className="pagehd">
        <div>
          <h2>Bienvenido al taller</h2>
          <p className="sub">
            {fechaCap}
            {estancados.length > 0 && (
              <> · Hay <b style={{ color: 'var(--red-600)' }}>{estancados.length} trabajo{estancados.length !== 1 ? 's estancados' : ' estancado'}</b></>
            )}
            {estancados.length === 0 && stats.activos > 0 && (
              <> · <b style={{ color: 'var(--text)' }}>{stats.activos} activos</b> en el taller</>
            )}
          </p>
        </div>
        <div className="actions">
          {onNavigate && (
            <button className="btn btn-primary" onClick={() => onNavigate('recepcion')}>
              <IcPlus /> Recibir vehículo
            </button>
          )}
        </div>
      </div>

      {/* ── Alerta de trabajos estancados (>3 dias sin moverse) ───────────── */}
      {estancados.length > 0 && (
        <div style={{
          padding: '14px 18px',
          background: 'linear-gradient(90deg, rgba(220,38,38,.10), rgba(245,158,11,.08))',
          border: '1px solid rgba(220,38,38,.35)',
          borderLeft: '4px solid var(--red-500)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--red-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--red-700, #b91c1c)' }}>
              {estancados.length} {estancados.length === 1 ? 'trabajo estancado' : 'trabajos estancados'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
              {estancados.length === 1 ? 'Lleva' : 'Llevan'} más de {DIAS_ESTANCADO} días sin actualizarse — revísalos para mover el avance o cambiar estado.
            </div>
          </div>
          {onNavigate && (
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('trabajos')} style={{ background: 'var(--red-600)' }}>
              Ver estancados <IcArrow />
            </button>
          )}
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic red"><IcAlert /></div>
            <div className="kpi__lbl">Activos hoy</div>
          </div>
          <div className="kpi__v">{stats.activos}</div>
          <div className="kpi__delta">
            {estancados.length > 0
              ? <><b className="down">{estancados.length}</b> estancados</>
              : 'Sin retrasos'}
          </div>
        </div>

        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic green"><IcDollar /></div>
            <div className="kpi__lbl">Ingresos del mes</div>
          </div>
          <div className="kpi__v">{fmt(stats.ingresosMes)}</div>
          <div className="kpi__delta">
            {stats.ingresosHoy > 0
              ? <><b className="up">{fmt(stats.ingresosHoy)}</b> hoy</>
              : 'Sin ingresos hoy'}
          </div>
        </div>

        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic blue"><IcCar /></div>
            <div className="kpi__lbl">Listos para entregar</div>
          </div>
          <div className="kpi__v">{stats.listoCount}</div>
          <div className="kpi__delta">Avisar al cliente</div>
        </div>

        <div className="kpi">
          <div className="kpi__head">
            <div className="kpi__ic amber"><IcCal /></div>
            <div className="kpi__lbl">Total OTs</div>
          </div>
          <div className="kpi__v">{trabajos.length}</div>
          <div className="kpi__delta">Acumulado histórico</div>
        </div>
      </div>

      {/* ── 2-col: urgentes + agenda ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

        {/* Pendientes & urgentes */}
        <div className="card">
          <div className="card__h">
            <h3>Pendientes &amp; urgentes</h3>
            <div className="act">
              <span className="count">{urgentes.length}</span>
              {onNavigate && (
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('trabajos')}>
                  Ver todos <IcArrow />
                </button>
              )}
            </div>
          </div>
          {urgentes.length === 0 ? (
            <div className="card__b">
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <p>No hay trabajos pendientes. ¡Todo al día!</p>
              </div>
            </div>
          ) : (
            <div className="card__b card__b--flush">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Cliente</th>
                    <th>Trabajo</th>
                    <th>Técnico</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {urgentes.map((t, i) => {
                    const tec = tecNombre(t.tecnicoId)
                    const isVencido = estancados.some(e => e.id === t.id)
                    const servicio = t.items?.length > 0
                      ? (t.items[0].descripcion || t.items[0].nombre || 'Servicio')
                      : (t.observaciones?.slice(0, 40) || 'Sin descripción')
                    return (
                      <tr key={t.id}>
                        <td className="c-mono">{t.placa || '—'}</td>
                        <td className="c-name">{t.cliente || '—'}</td>
                        <td className="c-muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {servicio}
                        </td>
                        <td>
                          {tec ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className={`av av-${(i % 5) + 1}`}>{initials(tec)}</span>
                              <span style={{ fontSize: 12.5 }}>{tec.split(' ')[0]}</span>
                            </div>
                          ) : <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>}
                        </td>
                        <td>
                          {isVencido
                            ? <span className="badge badge-d">Estancado</span>
                            : <span className={`badge ${estadoBadge(t.estado)}`}>{t.estado}</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {onNavigate && (
                            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('trabajos')} title="Ver trabajos">
                              <IcArrow />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Agenda de hoy */}
        <div className="card">
          <div className="card__h">
            <h3>Ingresados hoy</h3>
            <span className="count">{agenda.length}</span>
          </div>
          {agenda.length === 0 ? (
            <div className="card__b">
              <div className="empty-state" style={{ padding: '20px 14px' }}>
                <div className="empty-state-icon" style={{ fontSize: 28 }}>📋</div>
                <p style={{ fontSize: 12.5 }}>Ningún vehículo ingresado hoy.</p>
              </div>
            </div>
          ) : (
            <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
              {agenda.map((t, i) => (
                <div key={t.id} style={{
                  display: 'flex', gap: 12, padding: '10px 12px',
                  background: 'var(--bg-subtle)', borderRadius: 10, border: '1px solid var(--border)'
                }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', minWidth: 40
                  }}>
                    <span className={`av av-${(i % 5) + 1}`} style={{ fontSize: 10, width: 36, height: 36 }}>
                      {initials(t.cliente)}
                    </span>
                  </div>
                  <div style={{ borderLeft: '2px solid var(--border-strong)', paddingLeft: 11, flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t.cliente || '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                      <span className="mono">{t.placa || '—'}</span> · {t.marca || ''} {t.modelo || ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 2-col: chart + listos ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

        {/* Ingresos chart */}
        <div className="card">
          <div className="card__h">
            <h3>Ingresos · últimos 12 meses</h3>
            <div className="act">
              <span className="mono" style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>
                Total: <b style={{ color: 'var(--text)' }}>{fmt(totalIngresos)}</b>
              </span>
            </div>
          </div>
          <div className="card__b">
            <div className="chartbar">
              {barras.values.map((b, i) => (
                <div
                  key={i}
                  className={`bar ${i === barras.values.length - 1 ? 'a' : ''}`}
                  style={{ height: `${(b / maxB) * 100}%` }}
                  title={`${barras.labels[i]}: ${fmt(b)}`}
                />
              ))}
            </div>
            <div className="chart-x">
              {barras.labels.map(m => <span key={m}>{m}</span>)}
            </div>
          </div>
        </div>

        {/* Listos para entregar */}
        <div className="card">
          <div className="card__h">
            <h3>Listos para entregar</h3>
            <span className="count">{stats.listoCount}</span>
          </div>
          {listos.length === 0 ? (
            <div className="card__b">
              <div className="empty-state" style={{ padding: '20px 14px' }}>
                <div className="empty-state-icon" style={{ fontSize: 28 }}>🚗</div>
                <p style={{ fontSize: 12.5 }}>No hay vehículos listos.</p>
              </div>
            </div>
          ) : (
            <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
              {listos.map((t, i) => (
                <div key={t.id} style={{
                  padding: 12, border: '1px solid var(--border)',
                  borderRadius: 10, background: 'var(--bg-subtle)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="mono" style={{ fontWeight: 700 }}>{t.placa || '—'}</span>
                    <span className="badge badge-s">Listo</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.cliente || '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Total</span>
                    <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{fmt(t.total)}</span>
                  </div>
                  {t.telefonoCliente && (
                    <a
                      href={`tel:${t.telefonoCliente}`}
                      className="btn btn-outline btn-sm"
                      style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
                    >
                      <IcPhone /> Llamar cliente
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Estancados alert (si existen) ────────────────────────────────── */}
      {estancados.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--red-600)' }}>
          <div className="card__h">
            <h3 style={{ color: 'var(--red-600)' }}>Trabajos estancados</h3>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              color: '#991b1b', background: 'var(--red-100)',
              padding: '2px 8px', borderRadius: 999
            }}>{estancados.length}</span>
          </div>
          <div className="card__b card__b--flush">
            <table className="tbl">
              <thead>
                <tr><th>Placa</th><th>Cliente</th><th>Estado</th><th>Días</th><th>Técnico</th></tr>
              </thead>
              <tbody>
                {estancados.map(t => {
                  const dias = Math.floor((Date.now() - new Date(t.fecha)) / 86400000)
                  return (
                    <tr key={t.id}>
                      <td className="c-mono">{t.placa || '—'}</td>
                      <td className="c-name">{t.cliente || '—'}</td>
                      <td><span className="badge badge-w">{t.estado}</span></td>
                      <td><span className="badge badge-d">{dias}d</span></td>
                      <td style={{ fontSize: 12.5 }}>{tecNombre(t.tecnicoId) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Productividad técnicos ───────────────────────────────────────── */}
      <div className="card">
        <div className="card__h">
          <h3>Productividad por técnico</h3>
          <span className="count">{TECNICOS.length}</span>
        </div>
        <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
          {porTecnico.map((t, i) => {
            const max = Math.max(...porTecnico.map(x => x.completados), 1)
            const pct = (t.completados / max) * 100
            const colors = ['var(--blue-500)', 'var(--green-500)', 'var(--amber-400)']
            return (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{t.nombre}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{t.completados}</span> completados · {fmt(t.ingresos)}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: `linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[i % colors.length]}dd)`,
                    borderRadius: 3
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
