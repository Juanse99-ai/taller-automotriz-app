import { useMemo } from 'react'
import { fmt, fmtDate, whatsappLink } from '../utils/helpers'
import { ESTADOS, TECNICOS, DIAS_ESTANCADO, TALLER } from '../utils/constants'
import { Button } from '../components/ui'

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

// Tono de la pastilla del estado. Mismo criterio que la insignia anterior,
// traducido a los modificadores de `.hd-chip` del handoff.
function chipEstado(estado) {
  if (estado === ESTADOS.COMPLETADO) return 'ok'
  if (estado === ESTADOS.CANCELADO) return 'bad'
  if (estado === ESTADOS.EN_PROGRESO || estado === ESTADOS.EN_PRUEBA) return 'info'
  return 'warn'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Barra de título: saludo + los conteos que antes eran tarjetas ──
         La tira de 4 KPI (unos 200px de alto antes del primer dato real) se
         fue: "Ingresos del mes" es la cifra grande de la derecha, "Por cobrar"
         subió a la tarjeta navy —es la única sobre la que se aprieta un botón
         el mismo día— y los conteos que solo se miran bajaron al subtítulo.
         Ninguno se perdió: activos, listos y total de trabajos siguen aquí. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Hola{user?.nombre ? `, ${user.nombre.split(' ')[0]}` : ''}</h1>
          <div className="hd-head__sub">
            {fechaCap} · {stats.activos} activo{stats.activos !== 1 ? 's' : ''} en taller
            {' · '}{stats.listoCount} listo{stats.listoCount !== 1 ? 's' : ''} para entregar
            {' · '}{trabajos.length} trabajo{trabajos.length !== 1 ? 's' : ''} en el historial
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-fig">
            <div className="hd-fig__l">INGRESOS DEL MES</div>
            <div className="hd-fig__v hd-n">{fmt(stats.ingresosMes)}</div>
            <div className="hd-fig__s">
              {(() => {
                const d = new Date(); const dia = d.getDate()
                return `Acumulado del 1 al ${dia} de ${d.toLocaleString('es-CO', { month: 'long' })}`
              })()}
              {stats.ingresosHoy > 0 && <> · <strong style={{ color: 'var(--text-2)' }}>{fmt(stats.ingresosHoy)} hoy</strong></>}
            </div>
          </div>
          {onNavigate && <div className="hd-head__div" />}
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
          // Antes: 42px de icono, título en 15.5px y 74px de alto para un aviso
          // que se lee en dos segundos. Ahora es una tira: pastilla que dice de
          // qué va, el hecho, el detalle y el botón. Mismo texto, un tercio de
          // alto, y el color vive en la pastilla y no en una franja.
          <div className="hd-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--ok-bg)', borderColor: 'transparent', flexWrap: 'wrap' }}>
            <span className="hd-chip hd-chip--ok-solid">CRM</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {total} {total === 1 ? 'cliente para contactar' : 'clientes para contactar'}
              </div>
              <div className="hd-sub" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                Vehículos que pasaron su intervalo de mantenimiento. Envíales un WhatsApp para reactivarlos.
              </div>
            </div>
            {onNavigate && (
              <Button variant="outline" size="sm" onClick={() => onNavigate('crm')}>
                Abrir CRM <IcArrow />
              </Button>
            )}
          </div>
        )
      })()}

      {/* ── Alerta de trabajos estancados (>3 dias sin moverse) ───────────── */}
      {estancados.length > 0 && (
        <div className="hd-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--bad-bg)', borderColor: 'transparent', flexWrap: 'wrap' }}>
          <span className="hd-chip hd-chip--bad-solid">ESTANCADOS</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {estancados.length} {estancados.length === 1 ? 'trabajo estancado' : 'trabajos estancados'}
            </div>
            <div className="hd-sub" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
              {estancados.length === 1 ? 'Lleva' : 'Llevan'} más de {DIAS_ESTANCADO} días sin actualizarse. Revísalos para mover el avance o cambiar estado.
            </div>
          </div>
          {onNavigate && (
            <Button variant="outline" size="sm" onClick={() => onNavigate('trabajos')}>
              Ver estancados <IcArrow />
            </Button>
          )}
        </div>
      )}

      {/* ── Nudge: vehículos por contactar (mantenimiento) → CRM ──────────── */}
      {porContactar > 0 && (
        <div className="hd-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--info-bg)', borderColor: 'transparent', flexWrap: 'wrap' }}>
          <span className="hd-chip hd-chip--info-solid">MANTENIMIENTO</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{porContactar} vehículo{porContactar !== 1 ? 's' : ''} sin volver hace 4+ meses</div>
            <div className="hd-sub" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Envíales un recordatorio de mantenimiento (cambio de aceite) y hazlos regresar.</div>
          </div>
          {onNavigate && (
            <Button variant="outline" size="sm" onClick={() => onNavigate('crm')}>Ver recordatorios <IcArrow /></Button>
          )}
        </div>
      )}

      {/* ── Fila 1: lo que hay que mover hoy · lo que hay que cobrar hoy ───
          Si no hay cartera, la fila pasa a una sola columna: dejar la rejilla en
          2fr 1fr sin su segundo hijo abre un hueco de un tercio de pantalla. */}
      <div style={{ display: 'grid', gridTemplateColumns: stats.porCobrar > 0 ? '2fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>

        {/* Pendientes & urgentes */}
        <div className="hd-card" style={{ minWidth: 0 }}>
          <div className="hd-bar">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Pendientes &amp; urgentes</span>
            <span className="hd-chip hd-chip--mute" style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>{urgentes.length}</span>
            <span className="hd-bar__sp" />
            {onNavigate && (
              <Button variant="ghost" size="sm" onClick={() => onNavigate('trabajos')}>
                Ver todos <IcArrow />
              </Button>
            )}
          </div>
          {urgentes.length === 0 ? (
            /* Etiqueta seca: el estado vacío no se celebra ni se ilustra. */
            <div className="hd-void" style={{ padding: '26px 18px' }}>
              <div className="hd-void__t">Sin trabajos pendientes</div>
            </div>
          ) : (
            <div className="hd-tbl">
              <div className="hd-tbl__h">
                <span style={{ width: 84 }}>PLACA</span>
                <span style={{ flex: 1, minWidth: 0 }}>CLIENTE · TRABAJO</span>
                <span style={{ width: 104 }}>TÉCNICO</span>
                <span style={{ width: 96 }}>ESTADO</span>
                <span style={{ width: 44 }} />
              </div>
              <div className="hd-tbl__b">
                {urgentes.map((t, i) => {
                  const tec = tecNombre(t.tecnicoId)
                  const isVencido = estancados.some(e => e.id === t.id)
                  const servicio = t.items?.length > 0
                    ? (t.items[0].descripcion || t.items[0].nombre || 'Servicio')
                    : (t.observaciones?.slice(0, 40) || 'Sin descripción')
                  // La placa manda, como en Órdenes de trabajo. El trabajo no se
                  // pierde: baja a segunda línea bajo el cliente. minHeight y no
                  // height porque en móvil `.hd-row` pasa a alto automático y un
                  // height inline lo recortaría.
                  return (
                    <div key={t.id} className="hd-row" style={{ minHeight: 52, cursor: 'default', flexWrap: 'wrap', rowGap: 6 }}>
                      <div className="hd-plate" style={{ width: 84, fontSize: 12.5, color: t.placa ? 'var(--text)' : 'var(--text-4)' }}>
                        {t.placa || 'SERVICIO'}
                      </div>
                      <div style={{ flex: 1, minWidth: 150, paddingRight: 10 }}>
                        <div className="hd-clip" style={{ fontSize: 12.5, lineHeight: 1.15, fontWeight: 700, color: 'var(--text)' }}>{t.cliente || '—'}</div>
                        <div className="hd-clip hd-sub" style={{ fontSize: 10.5, marginTop: 2 }}>{servicio}</div>
                      </div>
                      <div style={{ width: 104, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        {tec ? (
                          <>
                            <span className={`hd-av av av-${(i % 5) + 1}`}>{initials(tec)}</span>
                            <span className="hd-clip" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{tec.split(' ')[0]}</span>
                          </>
                        ) : <span className="hd-empty" style={{ fontSize: 12 }}>—</span>}
                      </div>
                      <div style={{ width: 96 }}>
                        {isVencido
                          ? <span className="hd-chip hd-chip--bad">Estancado</span>
                          : <span className={`hd-chip hd-chip--${chipEstado(t.estado)}`}>{t.estado}</span>}
                      </div>
                      <div style={{ width: 44, display: 'flex', justifyContent: 'flex-end' }}>
                        {onNavigate && (
                          <Button variant="ghost" className="btn-icon" aria-label="Ver trabajos" title="Ver trabajos" onClick={() => onNavigate('trabajos')}>
                            <IcArrow />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Por cobrar: sale de la tira de KPI y sube a la tarjeta navy. Es la
            única cifra de esta pantalla sobre la que se actúa el mismo día,
            así que es la única que lleva navy y botón propio.

            Y por eso mismo NO se pinta cuando vale cero: el navy está reservado
            para lo que exige actuar, y un día sin cartera el elemento más
            gritón de la pantalla estaría diciendo "POR COBRAR $ 0". Nada que
            cobrar es una buena noticia, no un titular. */}
        {stats.porCobrar > 0 && (
        <div className="hd-neto" style={{ margin: 0 }}>
          <div className="hd-neto__l">POR COBRAR</div>
          <div className="hd-neto__v">{fmt(stats.porCobrar)}</div>
          <div className="hd-neto__rows">
            <div className="hd-neto__r">
              <span>Facturado sin pagar</span>
              <span>{stats.porCobrarCount} factura{stats.porCobrarCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('trabajos')}
              style={{
                marginTop: 14, width: '100%', height: 44, border: 'none', borderRadius: 10,
                background: 'rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              Ver cartera <IcArrow />
            </button>
          )}
        </div>
        )}
      </div>

      {/* ── Fila 2: histórico · el movimiento del día ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Ingresos: últimos 12 meses */}
        <div className="hd-card" style={{ minWidth: 0 }}>
          <div className="hd-bar">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Ingresos · últimos 12 meses</span>
            <span className="hd-bar__sp" />
            <span className="hd-bar__n">Total</span>
            <span className="hd-n hd-strong">{fmt(totalIngresos)}</span>
          </div>
          <div style={{ padding: '2px 18px 14px' }}>
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
            {/* Cada rótulo bajo su barra (flex:1), y el mes en curso en acento
               para que se sepa cuál barra está a medio llenar. */}
            <div className="chart-x">
              {barras.labels.map((m, i) => (
                <span key={i} style={{ flex: 1, textAlign: 'center', color: i === barras.labels.length - 1 ? 'var(--accent)' : undefined }}>{m}</span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Ingresados hoy */}
          <div className="hd-card">
            <div className="hd-bar">
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Ingresados hoy</span>
              <span className="hd-chip hd-chip--mute" style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>{agenda.length}</span>
            </div>
            {agenda.length === 0 ? (
              <div className="hd-void" style={{ padding: '22px 18px' }}>
                <div className="hd-void__t">Ningún vehículo ingresado hoy</div>
              </div>
            ) : (
              <div>
                {agenda.map((t, i) => (
                  <div key={t.id} className="hd-row" style={{ minHeight: 50, cursor: 'default', gap: 10 }}>
                    <span className={`av av-${(i % 5) + 1}`} style={{ width: 30, height: 30, fontSize: 11, flex: 'none' }}>
                      {initials(t.cliente)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="hd-clip" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{t.cliente || '—'}</div>
                      <div className="hd-clip hd-sub" style={{ fontSize: 10.5, marginTop: 2 }}>
                        <span className="hd-mono">{t.placa || '—'}</span> · {[t.marca, t.modelo].filter(Boolean).join(' ') || '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Listos para entregar. Eran tarjetas dentro de una tarjeta; ahora
             son filas del mismo contenedor, con los mismos datos y los mismos
             dos botones (WhatsApp y llamar) a 44px. */}
          <div className="hd-card">
            <div className="hd-bar">
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Listos para entregar</span>
              <span className="hd-chip hd-chip--mute" style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>{stats.listoCount}</span>
            </div>
            {listos.length === 0 ? (
              <div className="hd-void" style={{ padding: '22px 18px' }}>
                <div className="hd-void__t">No hay vehículos listos por ahora</div>
              </div>
            ) : (
              <div>
                {listos.map(t => (
                  <div key={t.id} style={{ padding: '11px 18px', borderTop: '1px solid var(--row-line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="hd-plate">{t.placa || 'SERVICIO'}</span>
                      <span className="hd-chip hd-chip--ok">Listo</span>
                      <span className="hd-bar__sp" />
                      <span className="hd-sub">Total</span>
                      <span className="hd-n hd-strong">{fmt(t.total)}</span>
                    </div>
                    <div className="hd-clip" style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3 }}>{t.cliente || '—'}</div>
                    {t.telefonoCliente && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <a
                          href={whatsappLink(t.telefonoCliente, `Hola ${t.cliente || ''}, su vehículo ${t.placa || ''} ya está listo para entrega en ${TALLER.nombre}. Total ${fmt(t.total)}. ¡Lo esperamos!`)}
                          target="_blank" rel="noreferrer"
                          className="btn btn-sm"
                          style={{ flex: 1, height: 44, background: 'var(--green-600)', color: '#fff', border: 'none', textDecoration: 'none' }}
                        >
                          <IcWa /> Avisar listo
                        </a>
                        <a
                          href={`tel:${t.telefonoCliente}`}
                          className="btn btn-outline btn-sm"
                          style={{ flex: '0 0 auto', width: 44, height: 44, padding: 0, textDecoration: 'none' }}
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
      </div>

      {/* ── Estancados: el detalle de la tira roja de arriba ──────────────── */}
      {estancados.length > 0 && (
        <div className="hd-card">
          <div className="hd-bar">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Trabajos estancados</span>
            <span className="hd-chip hd-chip--bad">{estancados.length}</span>
          </div>
          <div className="hd-tbl">
            <div className="hd-tbl__h">
              <span style={{ width: 96 }}>PLACA</span>
              <span style={{ flex: 1, minWidth: 0 }}>CLIENTE</span>
              <span style={{ width: 120 }}>ESTADO</span>
              <span style={{ width: 60, textAlign: 'right' }}>DÍAS</span>
              <span style={{ width: 130, paddingLeft: 14 }}>TÉCNICO</span>
            </div>
            <div className="hd-tbl__b">
              {estancados.map(t => {
                const dias = Math.floor((Date.now() - new Date(t.fecha)) / 86400000)
                return (
                  <div key={t.id} className="hd-row" style={{ cursor: 'default', flexWrap: 'wrap', rowGap: 6 }}>
                    <div className="hd-plate" style={{ width: 96, fontSize: 12.5, color: t.placa ? 'var(--text)' : 'var(--text-4)' }}>
                      {t.placa || 'SERVICIO'}
                    </div>
                    <div className="hd-clip" style={{ flex: 1, minWidth: 140, paddingRight: 10, fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{t.cliente || '—'}</div>
                    <div style={{ width: 120 }}><span className="hd-chip hd-chip--warn">{t.estado}</span></div>
                    {/* Los días son el dato que decide: van en rojo y a la derecha. */}
                    <div className="hd-n" style={{ width: 60, fontSize: 13, fontWeight: 700, color: 'var(--bad-fg)' }}>{dias}d</div>
                    <div className="hd-clip" style={{ width: 130, paddingLeft: 14, fontSize: 11.5, color: 'var(--text-2)' }}>
                      {tecNombre(t.tecnicoId) || <span className="hd-empty">—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Productividad técnicos ───────────────────────────────────────── */}
      <div className="hd-card">
        <div className="hd-bar">
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Productividad por técnico</span>
          <span className="hd-chip hd-chip--mute" style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>{TECNICOS.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '2px 18px 16px' }}>
          {porTecnico.map((t, i) => {
            const max = Math.max(...porTecnico.map(x => x.completados), 1)
            const pct = (t.completados / max) * 100
            return (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <span className={`hd-av av av-${(i % 5) + 1}`}>{initials(t.nombre)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t.nombre}</span>
                  <span className="hd-bar__sp" />
                  <span className="hd-n hd-strong">{t.completados}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>completados ·</span>
                  <span className="hd-n hd-strong">{fmt(t.ingresos)}</span>
                </div>
                {/* Una sola barra de acento: tres colores distintos sugerían tres
                   categorías que no existen — es la misma magnitud tres veces. */}
                <div style={{ height: 7, background: 'var(--chip)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
