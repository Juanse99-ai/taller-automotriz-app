import { useMemo, useState, useEffect } from 'react'
import { fmt, fmtDate, whatsappLink } from '../utils/helpers'
import { ESTADOS, TECNICOS, DIAS_ESTANCADO, TALLER } from '../utils/constants'
import { Button } from '../components/ui'
import { formatCacheAge } from '../hooks/useInventario'

// Cuando las cifras dejan de ser de fiar sin que nada falle: la app consulta
// cada 60s, pero SOLO con la pestaña a la vista. Una pestaña olvidada toda la
// tarde no consulta ni una vez y no salta ningun aviso, asi que el tablero
// puede estar enseñando plata de hace horas como si fuera de ahora.
const VIEJO_MS = 5 * 60 * 1000

// Sello de frescura: desde cuando son los numeros que estas viendo.
function SelloFrescura({ ultimaSync, sinConexion, onRefrescar }) {
  // Un reloj propio: sin esto el texto se congela en la edad que tenia al
  // pintarse y diria "hace 3s" media hora despues. La hora vive en el estado y
  // no se lee en el render: Date.now() durante el render es impuro y da
  // resultados que cambian solos en cualquier repintado.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 10000)
    return () => clearInterval(id)
  }, [])

  const edad = ultimaSync ? ahora - ultimaSync : null
  const viejo = edad == null || edad > VIEJO_MS
  // El tono no decora: dice si puedes confiar en la cifra de al lado.
  const tono = sinConexion ? 'bad' : viejo ? 'warn' : 'mute'
  // formatCacheAge devuelve "sin sincronizar" tanto si no hay fecha como si la
  // fecha es absurda (cache roto). Sin esta comprobacion saldria el sinsentido
  // "Actualizado sin sincronizar".
  const relativo = formatCacheAge(edad)
  const texto = sinConexion
    ? 'Sin conexión · datos guardados'
    : relativo.startsWith('hace') ? `Actualizado ${relativo}` : 'Sin sincronizar'

  return (
    <button
      type="button"
      onClick={onRefrescar}
      className={`hd-chip hd-chip--${tono} dsh-frescura`}
      title={ultimaSync
        ? `El servidor respondió a las ${new Date(ultimaSync).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}. Toca para volver a consultar.`
        : 'Todavía no se ha podido leer del servidor. Toca para intentarlo.'}
    >
      {texto}
    </button>
  )
}

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
export default function Dashboard({ trabajos = [], onNavigate, user, ultimaSync = 0, sinConexion = false, onRefrescar }) {
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
    // Mismo tramo del mes pasado: del 1 al MISMO dia. Comparar un mes a medias
    // contra un mes entero siempre pinta una caida que no existe. Si el mes
    // pasado fue mas corto (hoy 31, febrero), se corta en su ultimo dia.
    const diaDeHoy = now.getDate()
    const diasMesAnt = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    const corte = Math.min(diaDeHoy, diasMesAnt)
    const iniAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const finAnt = new Date(now.getFullYear(), now.getMonth() - 1, corte, 23, 59, 59, 999)
    const ingresosMesAnt = trabajos
      .filter(t => { const f = new Date(t.fecha); return t.estado !== ESTADOS.CANCELADO && f >= iniAnt && f <= finAnt })
      .reduce((s, t) => s + (t.total || 0), 0)
    const mesAntNombre = iniAnt.toLocaleString('es-CO', { month: 'long' })
    return { activos, listoCount, ingresosMes, ingresosHoy, porCobrar, porCobrarCount: porCobrarList.length,
             ingresosMesAnt, mesAntNombre }
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


  // ── Tira de 4 KPI (mockup :75-89 · datos :292-295) ──────────────────────────
  // Los cuatro conteos que antes vivían apretados en el subtítulo vuelven a la
  // tira que dibuja el diseño. Ninguno se pierde: ingresos del mes (con lo de
  // hoy en la pastilla), listos, activos y el total del historial.
  const diaHoy = now.getDate()
  const mesHoy = now.toLocaleString('es-CO', { month: 'long' })
  const kpis = [
    {
      k: 'ing', label: 'INGRESOS DEL MES', value: fmt(stats.ingresosMes),
      sub: `Acumulado del 1 al ${diaHoy} de ${mesHoy}`,
      // Solo se compara si el mes pasado tuvo movimiento: dividir por cero, o
      // contra un mes en que la app no se usaba, da porcentajes de fantasia.
      delta: stats.ingresosMesAnt > 0
        ? (() => {
            const pct = Math.round((stats.ingresosMes - stats.ingresosMesAnt) / stats.ingresosMesAnt * 100)
            return { pct, texto: `${pct >= 0 ? '+' : ''}${pct}% vs ${stats.mesAntNombre}`,
                     titulo: `Del 1 al ${diaHoy} de ${stats.mesAntNombre} llevabas ${fmt(stats.ingresosMesAnt)}` }
          })()
        : null,
      badge: stats.ingresosHoy > 0 ? `${fmt(stats.ingresosHoy)} HOY` : null,
      d: 'M23 6 13.5 15.5 8.5 10.5 1 18M17 6h6v6',
    },
    {
      k: 'listos', label: 'LISTOS PARA ENTREGAR', value: String(stats.listoCount),
      sub: 'por entregar', badge: null,
      d: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zm-13 0 2 2 4-4',
    },
    {
      k: 'activos', label: 'ACTIVOS HOY', value: String(stats.activos),
      sub: 'en taller', badge: null,
      d: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM12 6v6l4 2',
    },
    {
      k: 'total', label: 'TOTAL TRABAJOS', value: String(trabajos.length),
      sub: 'registrados en el historial', badge: null,
      d: 'M10 2h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M9 12h6M9 16h4',
    },
  ]

  return (
    <div className="dsh">
      {/* Maquetación propia de esta pantalla. Vive aquí y no en index.css
         porque nada de esto se comparte con las otras 12: la tira de KPI, el
         rail de 288px y el lienzo del gráfico son del Dashboard y de nadie más.
         Todo va bajo `.dsh` para que no se escape a ninguna otra página. */}
      <style>{`
.dsh{display:flex;flex-direction:column;gap:10px}
/* El mockup dibuja TODAS sus tarjetas a 14px. --radius-card vale 16 y lo
   comparten las 12 pantallas restantes, así que aquí se ajusta sólo el
   Dashboard para que la tira de KPI, las tarjetas y el navy coincidan. */
.dsh .hd-card{border-radius:var(--r-lg)}

/* --- Tira de 4 KPI: una sola tarjeta blanca partida en cuatro (mockup :75-89) --- */
.dsh-kpis{flex:none;display:flex;flex-wrap:wrap;background:var(--bg-raised);
  border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden}
.dsh-kpi{flex:1 1 0;min-width:0;padding:14px 16px;border-left:1px solid var(--row-line)}
.dsh-kpi:first-child{border-left-color:transparent}
.dsh-kpi__h{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-kpi__ic{width:26px;height:26px;flex:none;display:grid;place-items:center;border-radius:var(--r-sm);background:var(--chip)}
.dsh-kpi__ic svg{width:14px;height:14px;stroke:var(--text-3);fill:none;stroke-width:2}
.dsh-kpi--a .dsh-kpi__ic{background:var(--accent-soft)}
.dsh-kpi--a .dsh-kpi__ic svg{stroke:var(--accent)}
.dsh-kpi__l{font-size:10.5px;line-height:1;font-weight:700;letter-spacing:.5px;color:var(--text-3);
  min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-kpi__v{font-size:21px;line-height:1.05;font-weight:700;color:var(--text-2);margin-top:9px;
  font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-kpi--a .dsh-kpi__v{color:var(--text)}
.dsh-kpi__f{display:flex;align-items:center;flex-wrap:wrap;gap:7px;row-gap:5px;margin-top:7px;min-width:0}
.dsh-kpi__b{flex:none;font-size:9.5px;line-height:1;font-weight:700;letter-spacing:.4px;
  padding:4px 6px;border-radius:var(--r-xs);background:var(--ok-bg);color:var(--ok-fg);white-space:nowrap}
/* El delta va contra el MISMO tramo del mes pasado. En ambar cuando baja, no en
   rojo: un mes mas flojo no es un error, es informacion. Y sin flechas: el signo
   ya lo dice y una flecha mas el signo es decir lo mismo dos veces. */
.dsh-kpi__d{flex:none;font-size:9.5px;line-height:1;font-weight:700;letter-spacing:.3px;
  padding:4px 6px;border-radius:var(--r-xs);background:var(--warn-bg);color:var(--warn-fg);
  white-space:nowrap;cursor:help}
.dsh-kpi__d.up{background:var(--ok-bg);color:var(--ok-fg)}
.dsh-kpi__s{font-size:11.5px;line-height:1.3;color:var(--text-4);min-width:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* --- Tiras de aviso: el mockup no dibuja ninguna, así que aquí bajan de
   jerarquía a un renglón. No se borra ni una palabra: rótulo, contador,
   explicación y acción siguen todos visibles. --- */
.dsh-alert{display:flex;align-items:center;flex-wrap:wrap;gap:9px;row-gap:4px;
  min-height:36px;padding:7px 12px;border-radius:var(--r-md)}
.dsh-alert b{font-size:12.5px;line-height:1.2;font-weight:700;color:var(--text);white-space:nowrap}
.dsh-alert__s{flex:1;min-width:120px;font-size:11.5px;line-height:1.3;color:var(--text-2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-alert__a{display:inline-flex;align-items:center;gap:5px;flex:none;height:26px;padding:0;
  border:none;background:none;font-family:inherit;font-size:11.5px;line-height:1;font-weight:700;
  color:var(--text);cursor:pointer;white-space:nowrap}
.dsh-alert__a:hover{text-decoration:underline}
.dsh-alert__a svg{width:13px;height:13px;flex:none}

/* --- Fila principal: columna flexible + rail fijo de 288px (mockup :91-170) --- */
.dsh-main{display:flex;gap:10px;align-items:stretch}
.dsh-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
.dsh-rail{width:288px;flex:none;display:flex;flex-direction:column;gap:10px}
.dsh-lc .hd-bar{padding:15px 18px 0;gap:10px}
.dsh-rc .hd-bar{padding:14px 16px 0;gap:9px;flex-wrap:wrap;row-gap:6px}
.dsh-t{font-size:14px;line-height:1;font-weight:700;color:var(--text);white-space:nowrap}
.dsh-rc .dsh-t{font-size:13.5px}
/* En el rail de 288px el título + contador + "Ver todos" van justos: si no
   caben, el enlace baja a su propia línea pegado a la derecha en vez de
   partir el título en dos. */
.dsh-link{display:inline-flex;align-items:center;gap:5px;margin-left:auto;height:26px;padding:0;
  border:none;background:none;font-family:inherit;font-size:11.5px;line-height:1;font-weight:700;
  color:var(--accent);cursor:pointer;white-space:nowrap}
.dsh-link:hover{text-decoration:underline}
.dsh-link svg{width:13px;height:13px;flex:none}

/* --- Lienzo del gráfico: alto real, no los 140px de .chartbar (mockup :101-105) --- */
.dsh-chart{display:flex;align-items:flex-end;gap:8px;height:332px;margin-top:14px;padding:0 18px 16px}
.dsh-chart__c{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:7px;
  height:100%;justify-content:flex-end}
.dsh-chart__b{width:100%;border-radius:4px 4px 0 0;min-height:3px;transition:opacity .12s;
  background:color-mix(in srgb,var(--accent) 22%,var(--bg-raised))}
.dsh-chart__c:hover .dsh-chart__b{opacity:.78}
.dsh-chart__b.on{background:var(--accent)}
.dsh-chart__x{font-size:9.5px;line-height:1;font-weight:700;letter-spacing:.5px;
  color:var(--text-4);text-transform:uppercase}
.dsh-chart__x.on{color:var(--accent)}

/* --- Productividad (mockup :107-125) --- */
.dsh-prod{display:flex;flex-direction:column;gap:12px;padding:12px 18px 16px}
.dsh-prod__h{display:flex;align-items:baseline;gap:8px;min-width:0}
.dsh-prod__av{width:22px;height:22px;flex:none;border-radius:50%;display:grid;place-items:center;
  font-size:9.5px;font-weight:700;line-height:1;align-self:center}
.dsh-prod__n{font-size:13px;line-height:1.2;font-weight:700;color:var(--text)}
.dsh-prod__u{font-size:11.5px;line-height:1;color:var(--text-4);white-space:nowrap}
.dsh-prod__v{font-size:12.5px;line-height:1;font-weight:700;color:var(--text);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-prod__t{height:7px;margin-top:7px;border-radius:var(--r-xs);background:var(--chip);overflow:hidden}
.dsh-prod__f{height:7px;background:var(--accent);border-radius:var(--r-xs)}

/* --- Filas del rail: la tabla de 5 columnas no cabe en 288px, así que la fila
   se dobla en tres renglones. Placa, cliente, trabajo, técnico, estado y la
   acción siguen todos ahí. --- */
.dsh-pr{display:flex;flex-direction:column;gap:5px;padding:10px 16px;border-top:1px solid var(--row-line)}
.dsh-pr:hover{background:var(--bg-subtle)}
.dsh-pr__1{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-pr__2{font-size:12.5px;line-height:1.15;font-weight:700;color:var(--text)}
.dsh-pr__3{display:flex;align-items:center;gap:6px;min-width:0}
.dsh-pr__ico{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:28px;height:28px;margin:-4px -6px -4px 0;border:none;border-radius:var(--r-sm);background:none;
  color:var(--text-5);cursor:pointer}
.dsh-pr__ico:hover{background:var(--chip);color:var(--text-2)}
.dsh-pr__ico svg{width:14px;height:14px}

/* --- Vacío verde de Pendientes (mockup :140-143) y notas secas (:151, :159) --- */
.dsh-ok{display:flex;align-items:center;gap:8px;margin:11px 16px 14px;padding:9px 11px;
  background:var(--green-50);border-radius:var(--r-sm)}
.dsh-ok svg{width:15px;height:15px;flex:none;color:var(--green-700)}
.dsh-ok span{font-size:12px;line-height:1.35;color:var(--ok-fg)}
.dsh-note{font-size:12px;line-height:1.4;color:var(--text-3);margin:8px 0 0;padding:0 16px 14px}

/* --- Tarjeta navy POR COBRAR (mockup :162-167) --- */
.dsh-navy{border-radius:var(--r-lg);padding:15px 16px;margin:0;flex:1 1 auto;min-height:132px}
.dsh-navy__l{font-size:9.5px;font-weight:700;letter-spacing:.9px}
.dsh-navy__v{font-size:26px;margin-top:8px}
.dsh-navy__s{font-size:11.5px;line-height:1.4;color:rgba(255,255,255,.6);margin-top:6px}
.dsh-navy__btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:38px;
  margin-top:14px;border:none;border-radius:var(--r-sm);background:rgba(255,255,255,.12);color:#fff;
  font-family:inherit;font-size:12.5px;line-height:1;font-weight:700;cursor:pointer}
.dsh-navy__btn:hover{background:rgba(255,255,255,.2)}

/* --- Móvil: el rail sube (el mockup pone cartera y pendientes antes que el
   gráfico), la tira de KPI se parte 1 + 2 + 1 y los objetivos vuelven a 44px --- */
@media (max-width:960px){
  .dsh-main{flex-direction:column}
  .dsh-rail{width:auto;order:1}
  .dsh-col{order:2}
  .dsh-navy{flex:none}
  .dsh .hd-head__right{width:100%}
  .dsh .hd-head__right .btn{flex:1}
  .dsh-kpi{flex:1 1 50%;padding:12px 14px}
  .dsh-kpi:first-child{flex:1 1 100%;border-bottom:1px solid var(--row-line)}
  .dsh-kpi:nth-child(4){flex:1 1 100%;border-left-color:transparent;border-top:1px solid var(--row-line)}
  .dsh-kpi:nth-child(3){border-top:1px solid var(--row-line)}
  .dsh-kpi:nth-child(2){border-left-color:transparent;border-top:1px solid var(--row-line)}
  .dsh-kpi--a .dsh-kpi__v{font-size:26px}
  .dsh-kpi__v{font-size:22px}
  /* En las tres celdas 2-up el mockup móvil (:209-218) no dibuja icono: sin él
     caben los rótulos largos. El rótulo puede doblar antes que recortarse. */
  .dsh-kpi:not(.dsh-kpi--a) .dsh-kpi__ic{display:none}
  .dsh-kpi__l{font-size:10px;letter-spacing:.6px;line-height:1.25;white-space:normal}
  .dsh-alert__s{white-space:normal;flex:1 1 100%}
  /* La grafica es contexto, no la razon por la que se abre el dashboard en
     el celular: nueve de los doce meses estan en cero. */
  .dsh-chart{height:160px;gap:4px;padding:0 14px 14px}
  .dsh-chart__x{font-size:8.5px;letter-spacing:.3px}
  .dsh-alert__a,.dsh-link,.dsh-pr__ico,.dsh-navy__btn{min-height:var(--tap)}
  .dsh-pr__ico{min-width:var(--tap)}
}
      `}</style>

      {/* ── Cabecera: saludo, fecha y la acción del día (mockup :69-73) ──── */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Hola{user?.nombre ? `, ${user.nombre.split(' ')[0]}` : ''}</h1>
          <div className="hd-head__sub">
            {fechaCap}
            {' · '}
            <SelloFrescura ultimaSync={ultimaSync} sinConexion={sinConexion} onRefrescar={onRefrescar} />
          </div>
        </div>
        <div className="hd-head__sp" />
        {onNavigate && (
          <div className="hd-head__right">
            <Button
              variant="primary"
              onClick={() => onNavigate('recepcion')}
              style={{ height: 40, padding: '0 18px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, boxShadow: 'var(--accent-shadow)' }}
            >
              <IcPlus /> Recibir vehículo
            </Button>
          </div>
        )}
      </div>

      {/* ── Tira de 4 KPI ─────────────────────────────────────────────────── */}
      <div className="dsh-kpis">
        {kpis.map((k, i) => (
          <div key={k.k} className={`dsh-kpi${i === 0 ? ' dsh-kpi--a' : ''}`}>
            <div className="dsh-kpi__h">
              <span className="dsh-kpi__ic">
                <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d={k.d} /></svg>
              </span>
              <span className="dsh-kpi__l" title={k.label}>{k.label}</span>
            </div>
            <div className="dsh-kpi__v" title={k.value}>{k.value}</div>
            <div className="dsh-kpi__f">
              {k.badge && <span className="dsh-kpi__b">{k.badge}</span>}
              {k.delta && (
                <span className={`dsh-kpi__d${k.delta.pct >= 0 ? ' up' : ''}`} title={k.delta.titulo}>
                  {k.delta.texto}
                </span>
              )}
              <span className="dsh-kpi__s" title={k.sub}>{k.sub}</span>
            </div>
          </div>
        ))}
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
          <div className="dsh-alert" style={{ background: 'var(--ok-bg)' }}>
            <span className="hd-chip hd-chip--ok-solid">CRM</span>
            <b>{total} {total === 1 ? 'cliente para contactar' : 'clientes para contactar'}</b>
            <span className="dsh-alert__s">Vehículos que pasaron su intervalo de mantenimiento. Envíales un WhatsApp para reactivarlos.</span>
            {onNavigate && (
              <button type="button" className="dsh-alert__a" onClick={() => onNavigate('crm')}>
                Abrir CRM <IcArrow />
              </button>
            )}
          </div>
        )
      })()}

      {/* ── Alerta de trabajos estancados (>3 dias sin moverse) ───────────── */}
      {estancados.length > 0 && (
        <div className="dsh-alert" style={{ background: 'var(--bad-bg)' }}>
          <span className="hd-chip hd-chip--bad-solid">ESTANCADOS</span>
          <b>{estancados.length} {estancados.length === 1 ? 'trabajo estancado' : 'trabajos estancados'}</b>
          <span className="dsh-alert__s">
            {estancados.length === 1 ? 'Lleva' : 'Llevan'} más de {DIAS_ESTANCADO} días sin actualizarse. Revísalos para mover el avance o cambiar estado.
          </span>
          {onNavigate && (
            <button type="button" className="dsh-alert__a" onClick={() => onNavigate('trabajos')}>
              Ver estancados <IcArrow />
            </button>
          )}
        </div>
      )}

      {/* ── Nudge: vehículos por contactar (mantenimiento) → CRM ──────────── */}
      {porContactar > 0 && (
        <div className="dsh-alert" style={{ background: 'var(--info-bg)' }}>
          <span className="hd-chip hd-chip--info-solid">MANTENIMIENTO</span>
          <b>{porContactar} vehículo{porContactar !== 1 ? 's' : ''} sin volver hace 4+ meses</b>
          <span className="dsh-alert__s">Envíales un recordatorio de mantenimiento (cambio de aceite) y hazlos regresar.</span>
          {onNavigate && (
            <button type="button" className="dsh-alert__a" onClick={() => onNavigate('crm')}>
              Ver recordatorios <IcArrow />
            </button>
          )}
        </div>
      )}

      {/* ── El cuerpo: histórico a la izquierda, rail de 288px a la derecha ─
         Es el reparto del mockup (:91-170): Ingresos sobre Productividad, y
         en el rail Pendientes, Ingresados hoy, Listos y la cartera. */}
      <div className="dsh-main">

        <div className="dsh-col">

          {/* Ingresos: últimos 12 meses */}
          <div className="hd-card dsh-lc" style={{ minWidth: 0 }}>
            <div className="hd-bar" style={{ alignItems: 'baseline' }}>
              <span className="dsh-t">Ingresos · últimos 12 meses</span>
              <span className="hd-bar__sp" />
              <span className="hd-bar__n" style={{ fontSize: 11.5 }}>Total:</span>
              <span className="hd-n hd-strong" style={{ fontSize: 14 }}>{fmt(totalIngresos)}</span>
            </div>
            <div className="dsh-chart">
              {barras.values.map((b, i) => {
                const on = i === barras.values.length - 1
                return (
                  <div key={i} className="dsh-chart__c" title={`${barras.labels[i]}: ${fmt(b)}`}>
                    <div className={`dsh-chart__b${on ? ' on' : ''}`} style={{ height: `${(b / maxB) * 100}%` }} />
                    <span className={`dsh-chart__x${on ? ' on' : ''}`}>{barras.labels[i]}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Productividad técnicos */}
          <div className="hd-card dsh-lc">
            <div className="hd-bar">
              <span className="dsh-t">Productividad por técnico</span>
              <span className="hd-chip hd-chip--mute" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{TECNICOS.length}</span>
            </div>
            <div className="dsh-prod">
              {porTecnico.map((t, i) => {
                const max = Math.max(...porTecnico.map(x => x.completados), 1)
                const pct = (t.completados / max) * 100
                return (
                  <div key={i}>
                    <div className="dsh-prod__h">
                      <span className={`dsh-prod__av av av-${(i % 5) + 1}`}>{initials(t.nombre)}</span>
                      <span className="dsh-prod__n">{t.nombre}</span>
                      <span className="hd-bar__sp" />
                      <span className="dsh-prod__v">{t.completados}</span>
                      <span className="dsh-prod__u">completados ·</span>
                      <span className="dsh-prod__v">{fmt(t.ingresos)}</span>
                    </div>
                    {/* Una sola barra de acento: tres colores distintos sugerían tres
                       categorías que no existen — es la misma magnitud tres veces. */}
                    <div className="dsh-prod__t">
                      <div className="dsh-prod__f" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="dsh-rail">

          {/* Pendientes & urgentes */}
          <div className="hd-card dsh-rc">
            <div className="hd-bar">
              <span className="dsh-t">Pendientes &amp; urgentes</span>
              <span className="hd-chip hd-chip--mute" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{urgentes.length}</span>
              {onNavigate && (
                <button type="button" className="dsh-link" onClick={() => onNavigate('trabajos')}>
                  Ver todos <IcArrow />
                </button>
              )}
            </div>
            {urgentes.length === 0 ? (
              /* El diseño celebra este vacío concreto: es el único que dice que
                 no hay nada que hacer ahora mismo. */
              <div className="dsh-ok">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                <span><b>Todo al día.</b> No hay trabajos pendientes en este momento.</span>
              </div>
            ) : (
              <div style={{ paddingBottom: 4 }}>
                {urgentes.map((t, i) => {
                  const tec = tecNombre(t.tecnicoId)
                  const isVencido = estancados.some(e => e.id === t.id)
                  const servicio = t.items?.length > 0
                    ? (t.items[0].descripcion || t.items[0].nombre || 'Servicio')
                    : (t.observaciones?.slice(0, 40) || 'Sin descripción')
                  return (
                    <div key={t.id} className="dsh-pr">
                      <div className="dsh-pr__1">
                        <span className="hd-plate" style={{ fontSize: 12.5, color: t.placa ? 'var(--text)' : 'var(--text-4)' }}>
                          {t.placa || 'SERVICIO'}
                        </span>
                        <span className="hd-bar__sp" />
                        {isVencido
                          ? <span className="hd-chip hd-chip--bad">Estancado</span>
                          : <span className={`hd-chip hd-chip--${chipEstado(t.estado)}`}>{t.estado}</span>}
                        {onNavigate && (
                          <button type="button" className="dsh-pr__ico" aria-label="Ver trabajos" title="Ver trabajos" onClick={() => onNavigate('trabajos')}>
                            <IcArrow />
                          </button>
                        )}
                      </div>
                      <div className="dsh-pr__2 hd-clip">{t.cliente || '—'}</div>
                      <div className="dsh-pr__3">
                        {tec ? (
                          <>
                            <span className={`hd-av av av-${(i % 5) + 1}`}>{initials(tec)}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-2)', flex: 'none' }}>{tec.split(' ')[0]}</span>
                          </>
                        ) : <span className="hd-empty" style={{ fontSize: 11.5 }}>Sin técnico</span>}
                        <span className="hd-sub" style={{ color: 'var(--text-5)' }}>·</span>
                        <span className="hd-clip hd-sub">{servicio}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Ingresados hoy */}
          <div className="hd-card dsh-rc">
            <div className="hd-bar">
              <span className="dsh-t">Ingresados hoy</span>
              <span className="hd-chip hd-chip--mute" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{agenda.length}</span>
            </div>
            {agenda.length === 0 ? (
              <div className="dsh-note">Ningún vehículo ingresado hoy.</div>
            ) : (
              <div style={{ paddingBottom: 4 }}>
                {agenda.map((t, i) => (
                  <div key={t.id} className="dsh-pr" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <span className={`av av-${(i % 5) + 1}`} style={{ width: 30, height: 30, fontSize: 11, flex: 'none' }}>
                      {initials(t.cliente)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="hd-clip" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{t.cliente || '—'}</div>
                      <div className="hd-clip hd-sub" style={{ marginTop: 2 }}>
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
          <div className="hd-card dsh-rc">
            <div className="hd-bar">
              <span className="dsh-t">Listos para entregar</span>
              <span className="hd-chip hd-chip--mute" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{stats.listoCount}</span>
            </div>
            {listos.length === 0 ? (
              <div className="dsh-note">No hay vehículos listos por ahora.</div>
            ) : (
              <div style={{ paddingBottom: 4 }}>
                {listos.map(t => (
                  <div key={t.id} className="dsh-pr">
                    <div className="dsh-pr__1">
                      <span className="hd-plate" style={{ fontSize: 12.5 }}>{t.placa || 'SERVICIO'}</span>
                      <span className="hd-chip hd-chip--ok">Listo</span>
                      <span className="hd-bar__sp" />
                      <span className="hd-sub">Total</span>
                      <span className="hd-n hd-strong">{fmt(t.total)}</span>
                    </div>
                    <div className="hd-clip" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t.cliente || '—'}</div>
                    {t.telefonoCliente && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
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

          {/* Por cobrar: la única cifra de esta pantalla sobre la que se actúa el
              mismo día, así que es la única que lleva navy y botón propio.

              Y por eso mismo NO se pinta cuando vale cero: el navy está reservado
              para lo que exige actuar, y un día sin cartera el elemento más
              gritón de la pantalla estaría diciendo "POR COBRAR $ 0". Nada que
              cobrar es una buena noticia, no un titular. */}
          {stats.porCobrar > 0 && (
            <div className="hd-neto dsh-navy" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="hd-neto__l dsh-navy__l">POR COBRAR</div>
              <div className="hd-neto__v dsh-navy__v">{fmt(stats.porCobrar)}</div>
              <div className="dsh-navy__s">
                {stats.porCobrarCount} factura{stats.porCobrarCount !== 1 ? 's' : ''} facturada{stats.porCobrarCount !== 1 ? 's' : ''} sin pagar
              </div>
              <div style={{ flex: 1, minHeight: 6 }} />
              {onNavigate && (
                <button type="button" className="dsh-navy__btn" onClick={() => onNavigate('trabajos')}>
                  Ver cartera <IcArrow />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Estancados: el detalle de la tira roja de arriba. El mockup no lo
         dibuja, así que va al fondo, después de todo lo que sí dibuja. ──── */}
      {estancados.length > 0 && (
        <div className="hd-card dsh-lc">
          <div className="hd-bar">
            <span className="dsh-t">Trabajos estancados</span>
            <span className="hd-chip hd-chip--bad">{estancados.length}</span>
          </div>
          <div className="hd-tbl" style={{ marginTop: 12 }}>
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

    </div>
  )
}
