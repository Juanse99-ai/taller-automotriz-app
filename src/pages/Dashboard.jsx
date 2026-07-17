import { useMemo } from 'react'
import { fmt, fmtDate, whatsappLink } from '../utils/helpers'
import { ESTADOS, TECNICOS, DIAS_ESTANCADO, TALLER } from '../utils/constants'
import { Button, Badge } from '../components/ui'

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
const IcWa = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
    <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.86 9.86 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2zm5.8 14.04c-.24.68-1.42 1.32-1.95 1.36-.5.05-.5.4-3.15-.66-2.66-1.06-4.32-3.79-4.45-3.97-.13-.18-1.06-1.4-1.06-2.67 0-1.27.67-1.9.9-2.16.24-.26.52-.32.7-.32.17 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.8 2 .87 2.14.07.14.12.31.02.49-.09.18-.14.29-.28.45-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.18 1.54 1.92 1.06.94 1.95 1.24 2.23 1.38.28.14.44.12.6-.07.17-.19.7-.81.88-1.09.18-.28.36-.23.6-.14.24.09 1.55.73 1.81.86.27.13.44.2.5.31.07.12.07.65-.17 1.32z"/>
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
  if (estado === ESTADOS.COMPLETADO) return 's'
  if (estado === ESTADOS.CANCELADO) return 'd'
  if (estado === ESTADOS.EN_PROGRESO || estado === ESTADOS.EN_PRUEBA) return 'n'
  return 'w'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard({ trabajos = [], onNavigate, user }) {
  const now = new Date()

  // ── KPI stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activos = trabajos.filter(t => ACTIVOS.includes(t.estado)).length
    // Listo para entregar = completado pero AÚN NO facturado (facturar = entregado/cobrado).
    const listoCount = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO && !t.cuenttiTransacionId).length
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
    // Los ingresos NO cuentan OTs canceladas (no son plata) — así cuadra con Reportes.
    const ingresosMes = trabajos
      .filter(t => t.estado !== ESTADOS.CANCELADO && new Date(t.fecha) >= inicioMes)
      .reduce((s, t) => s + (t.total || 0), 0)
    // Hoy
    const hoyStart = new Date(now); hoyStart.setHours(0,0,0,0)
    const hoyEnd = new Date(now); hoyEnd.setHours(23,59,59,999)
    const ingresosHoy = trabajos
      .filter(t => { const f = new Date(t.fecha); return t.estado !== ESTADOS.CANCELADO && f >= hoyStart && f <= hoyEnd })
      .reduce((s, t) => s + (t.total || 0), 0)
    // Por cobrar = facturado (tiene factura en Cuentti) pero AÚN sin pagar
    const porCobrarList = trabajos.filter(t => t.cuenttiTransacionId && !t.pagado)
    const porCobrar = porCobrarList.reduce((s, t) => s + (t.total || 0), 0)
    return { activos, listoCount, ingresosMes, ingresosHoy, porCobrar, porCobrarCount: porCobrarList.length }
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
    trabajos.filter(t => t.estado === ESTADOS.COMPLETADO && !t.cuenttiTransacionId).slice(-3).reverse(),
  [trabajos])

  // ── Por contactar: vehículos sin volver hace 4+ meses (nudge → CRM) ─────────
  const porContactar = useMemo(() => {
    const ultima = {}
    trabajos.forEach(t => {
      const placa = (t.placa || '').toUpperCase().trim()
      if (!placa || placa === 'SERVICIO') return
      const f = new Date(t.fecha); if (isNaN(f)) return
      if (!ultima[placa] || f > ultima[placa]) ultima[placa] = f
    })
    const limite = Date.now() - 120 * 86400000
    return Object.values(ultima).filter(f => f.getTime() < limite).length
  }, [trabajos])

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
          <h2>Hola{user?.nombre ? `, ${user.nombre.split(' ')[0]}` : ''} 👋</h2>
        </div>
        <div className="actions">
          {onNavigate && (
            <Button variant="primary" onClick={() => onNavigate('recepcion')}>
              <IcPlus /> Recibir vehículo
            </Button>
          )}
        </div>
      </div>

      {/* ── Alerta CRM: clientes vencidos para contactar ──────────────────── */}
      {(() => {
        // Mismo cálculo que el CRM pero rápido: solo contar vencidos
        const HOY = new Date()
        const dias = (a, b) => Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
        const completados = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO)
        const trabajosPorPlaca = {}
        for (const t of completados) {
          const placa = (t.placa || '').toUpperCase().trim()
          if (!placa) continue
          if (!trabajosPorPlaca[placa]) trabajosPorPlaca[placa] = []
          trabajosPorPlaca[placa].push(t)
        }
        // Cliente con teléfono y vehículo que ya pasó >5 meses (intervalo medio aceite)
        const vencidos = new Set()
        for (const t of completados) {
          const placa = (t.placa || '').toUpperCase().trim()
          if (!placa || !t.telefonoCliente) continue
          const lista = trabajosPorPlaca[placa] || []
          const ultima = lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]
          if (!ultima) continue
          const d = dias(new Date(ultima.fecha), HOY)
          // 5 meses ~ 150 días = más allá del intervalo de aceite mineral (4 meses)
          if (d > 150) vencidos.add(placa)
        }
        const total = vencidos.size
        if (total === 0) return null
        return (
          <div style={{
            padding: '16px 20px',
            background: 'rgba(22,163,74,.08)',
            border: '1px solid rgba(22,163,74,.32)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 11, background: '#25D366',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--green-700)' }}>
                {total} {total === 1 ? 'cliente para contactar' : 'clientes para contactar'} (CRM)
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 3 }}>
                Vehículos que pasaron su intervalo de mantenimiento. Envíales un WhatsApp para reactivarlos.
              </div>
            </div>
            {onNavigate && (
              <button className="btn btn-primary btn-sm" onClick={() => onNavigate('crm')} style={{ background: '#16a34a' }}>
                Abrir CRM <IcArrow />
              </button>
            )}
          </div>
        )
      })()}

      {/* ── Alerta de trabajos estancados (>3 dias sin moverse) ───────────── */}
      {estancados.length > 0 && (
        <div style={{
          padding: '16px 20px',
          background: 'rgba(220,38,38,.08)',
          border: '1px solid rgba(220,38,38,.32)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11, background: 'var(--red-600)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--red-700)' }}>
              {estancados.length} {estancados.length === 1 ? 'trabajo estancado' : 'trabajos estancados'}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 3 }}>
              {estancados.length === 1 ? 'Lleva' : 'Llevan'} más de {DIAS_ESTANCADO} días sin actualizarse. Revísalos para mover el avance o cambiar estado.
            </div>
          </div>
          {onNavigate && (
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('trabajos')} style={{ background: 'var(--red-600)' }}>
              Ver estancados <IcArrow />
            </button>
          )}
        </div>
      )}

      {/* ── KPIs ─ hero + 3 secundarios (rompe simetría 4x igual) ───────── */}
      <div className="kpi-bh" style={{ marginBottom: 16 }}>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">Ingresos del mes</div>
          <div className="kpi-bh__row">
            <span className="kpi-bh__v">{fmt(stats.ingresosMes)}</span>
            {stats.ingresosHoy > 0 && <span className="kpi-bh__pill">↑ {fmt(stats.ingresosHoy)} hoy</span>}
          </div>
          <div className="kpi-bh__sub">
            {(() => {
              const d = new Date(); const dia = d.getDate()
              return `Acumulado del 1 al ${dia} de ${d.toLocaleString('es-CO', { month: 'long' })}`
            })()}
          </div>
        </div>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">Listos para entregar</div>
          <div className="kpi-bh__row"><span className="kpi-bh__v">{stats.listoCount}</span></div>
          <div className="kpi-bh__sub">por entregar</div>
        </div>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">Activos hoy</div>
          <div className="kpi-bh__row">
            <span className="kpi-bh__v">{stats.activos}</span>
            {estancados.length > 0 && <span className="kpi-bh__pill red">{estancados.length} estancados</span>}
          </div>
          <div className="kpi-bh__sub">en taller</div>
        </div>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">Por cobrar</div>
          <div className="kpi-bh__row">
            <span className="kpi-bh__v">{fmt(stats.porCobrar)}</span>
            {stats.porCobrarCount > 0 && <span className="kpi-bh__pill red">{stats.porCobrarCount} facturas</span>}
          </div>
          <div className="kpi-bh__sub">facturado sin pagar</div>
        </div>
        <div className="kpi-bh__s">
          <div className="kpi-bh__l">Total OTs</div>
          <div className="kpi-bh__row"><span className="kpi-bh__v">{trabajos.length}</span></div>
          <div className="kpi-bh__sub">histórico</div>
        </div>
      </div>

      {/* ── Nudge: vehículos por contactar (mantenimiento) → CRM ──────────── */}
      {porContactar > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(37,99,235,.28)', background: 'rgba(37,99,235,.04)', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--blue-600)' }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700 }}>{porContactar} vehículo{porContactar !== 1 ? 's' : ''} sin volver hace 4+ meses</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Envíales un recordatorio de mantenimiento (cambio de aceite) y hazlos regresar.</div>
          </div>
          {onNavigate && (
            <Button variant="primary" size="sm" onClick={() => onNavigate('crm')}>Ver recordatorios →</Button>
          )}
        </div>
      )}

      {/* ── 2-col: urgentes + agenda ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

        {/* Pendientes & urgentes */}
        <div className="card">
          <div className="card__h">
            <h3>Pendientes &amp; urgentes</h3>
            <div className="act">
              <span className="count">{urgentes.length}</span>
              {onNavigate && (
                <Button variant="ghost" size="sm" onClick={() => onNavigate('trabajos')}>
                  Ver todos <IcArrow />
                </Button>
              )}
            </div>
          </div>
          {urgentes.length === 0 ? (
            <div className="card__b">
              <div className="empty-state">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .85 }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <h4>Todo al día</h4>
                <p>No hay trabajos pendientes en este momento.</p>
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
                            ? <Badge tone="d">Estancado</Badge>
                            : <Badge tone={estadoBadge(t.estado)}>{t.estado}</Badge>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {onNavigate && (
                            <Button variant="ghost" size="sm" onClick={() => onNavigate('trabajos')} title="Ver trabajos">
                              <IcArrow />
                            </Button>
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
              <div className="empty-state" style={{ padding: '24px 14px' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .8 }}>
                  <rect x="9" y="2" width="6" height="4" rx="1"/>
                  <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>
                </svg>
                <p style={{ fontSize: 13.5 }}>Ningún vehículo ingresado hoy.</p>
              </div>
            </div>
          ) : (
            <div className="card__b card__b--flush">
              {agenda.map((t, i) => (
                <div key={t.id} className="grow" style={{ cursor: 'default' }}>
                  <span className={`av av-${(i % 5) + 1}`} style={{ fontSize: 11, width: 36, height: 36, flexShrink: 0 }}>
                    {initials(t.cliente)}
                  </span>
                  <div className="tx">
                    <div className="t">{t.cliente || '—'}</div>
                    <div className="s"><span className="mono">{t.placa || '—'}</span> · {t.marca || ''} {t.modelo || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 2-col: chart + listos ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>

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
              <div className="empty-state" style={{ padding: '24px 14px' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .8 }}>
                  <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
                  <circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>
                </svg>
                <p style={{ fontSize: 13.5 }}>No hay vehículos listos por ahora.</p>
              </div>
            </div>
          ) : (
            <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
              {listos.map((t, i) => (
                <div key={t.id} style={{
                  padding: 12, borderRadius: 10, background: 'var(--bg-subtle)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="mono" style={{ fontWeight: 700 }}>{t.placa || '—'}</span>
                    <Badge tone="s">Listo</Badge>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.cliente || '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Total</span>
                    <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{fmt(t.total)}</span>
                  </div>
                  {t.telefonoCliente && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <a
                        href={whatsappLink(t.telefonoCliente, `Hola ${t.cliente || ''}, su vehículo ${t.placa || ''} ya está listo para entrega en ${TALLER.nombre}. Total ${fmt(t.total)}. ¡Lo esperamos!`)}
                        target="_blank" rel="noreferrer"
                        className="btn btn-sm"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', background: 'var(--green-600)', color: '#fff', border: 'none' }}
                      >
                        <IcWa /> Avisar listo
                      </a>
                      <a
                        href={`tel:${t.telefonoCliente}`}
                        className="btn btn-outline btn-sm"
                        style={{ flex: '0 0 auto', width: 42, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                        aria-label="Llamar cliente"
                      >
                        <IcPhone />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Estancados alert (si existen) ────────────────────────────────── */}
      {estancados.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(220,38,38,.32)' }}>
          <div className="card__h">
            <h3 style={{ color: 'var(--red-700)' }}>Trabajos estancados</h3>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
              color: 'var(--red-700)', background: 'var(--red-100)',
              padding: '3px 10px', borderRadius: 999
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
                      <td><Badge tone="w">{t.estado}</Badge></td>
                      <td><Badge tone="d">{dias}d</Badge></td>
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
            const colors = ['var(--blue-600)', 'var(--green-600)', 'var(--amber-500)']
            return (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t.nombre}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{t.completados}</span> completados · {fmt(t.ingresos)}
                  </span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: colors[i % colors.length],
                    borderRadius: 4
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
