import { useState, useEffect, useMemo, useCallback } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { TALLER, ESTADOS } from '../utils/constants'
import { lsGet, lsSet } from '../services/storage'

// ── Storage keys (locales al CRM) ───────────────────────────────────────────
const KEY_CONFIG = 'crm:config'
const KEY_CONTACTOS = 'crm:contactos'
const KEY_TEMPLATES = 'crm:templates'

// ── Servicios y sus intervalos por defecto ──────────────────────────────────
const SERVICIOS_DEFAULT = [
  { key: 'aceite_mineral',    nombre: 'Aceite mineral / semisintético', km: 5000,  meses: 4 },
  { key: 'aceite_sintetico',  nombre: 'Aceite full sintético',          km: 10000, meses: 6 },
  { key: 'mantenimiento',     nombre: 'Mantenimiento general',           km: 10000, meses: 12 },
  { key: 'frenos',            nombre: 'Pastillas / frenos',              km: 15000, meses: 18 },
  { key: 'distribucion',      nombre: 'Correa / cadena distribución',    km: 80000, meses: 60 },
  { key: 'llantas',           nombre: 'Rotación de llantas',             km: 10000, meses: 12 },
]

// ── Templates por defecto (usan placeholders {nombre} {placa} ...) ──────────
const TEMPLATES_DEFAULT = {
  aceite_mineral: `Hola {nombre} 👋, te saluda {taller} 🛠️

Tu {marca} {modelo} con placa {placa} ya cumplió {dias_desde} días desde el último cambio de aceite (mineral/semisintético cada 5,000 km).

¿Te agendamos una cita esta semana?
📞 {telefono_taller}
📍 {direccion}`,

  aceite_sintetico: `Hola {nombre} 👋, te saluda {taller} 🛠️

Tu {marca} {modelo} con placa {placa} ya cumplió {dias_desde} días desde el último cambio de aceite (full sintético cada 10,000 km).

¿Te agendamos una cita?
📞 {telefono_taller}
📍 {direccion}`,

  mantenimiento: `Hola {nombre} 👋, te saluda {taller} 🛠️

Tu {marca} {modelo} {placa} llegó a su mantenimiento periódico (cada año o 10,000 km). Última visita: {ultima_visita}.

¿Programamos la revisión?
📞 {telefono_taller}`,

  frenos: `Hola {nombre} 👋, en {taller} te recomendamos revisar pastillas/frenos de tu {marca} {modelo} {placa}.

Última visita hace {dias_desde} días. Por seguridad, conviene revisarlo.
📞 {telefono_taller}`,

  distribucion: `Hola {nombre} 👋, te recordamos que la correa de distribución de tu {marca} {modelo} {placa} debe cambiarse cada ~80,000 km. Si está cerca, evita un daño mayor en el motor.

📞 {telefono_taller} - {taller}`,

  llantas: `Hola {nombre} 👋, en {taller} te invitamos a una rotación de llantas para tu {marca} {modelo} {placa} y prolongar su vida.

📞 {telefono_taller}`,

  generico: `Hola {nombre} 👋, te saluda {taller}.

Hace {dias_desde} días que tu {marca} {modelo} {placa} no nos visita. ¿Quieres que revisemos cómo va?
📞 {telefono_taller}`,
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const HOY = () => new Date()
const diasEntre = (a, b) => Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))

function detectarTipoAceite(items = []) {
  const txt = items.map(i => `${i.nombre || ''} ${i.descripcion || ''}`).join(' ').toUpperCase()
  if (/FULL.?SINT|SINTETICO|SYNTHETIC|100.?SINT/.test(txt)) return 'aceite_sintetico'
  if (/ACEITE|MINERAL|SEMI.?SINT|5W30|10W30|10W40|15W40|20W50/.test(txt)) return 'aceite_mineral'
  return null
}

function aplicarTemplate(template, vars) {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : `{${k}}`)
}

// Formatear número de teléfono colombiano para wa.me
function whatsappLink(tel, mensaje) {
  if (!tel) return null
  const limpio = tel.toString().replace(/\D/g, '')
  // Si no empieza con 57 (Colombia) y tiene 10 dígitos, prepender 57
  const num = limpio.length === 10 ? `57${limpio}` : limpio
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}

function emailLink(email, asunto, cuerpo) {
  if (!email) return null
  return `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
}

// ────────────────────────────────────────────────────────────────────────────
// COMPONENTE
// ────────────────────────────────────────────────────────────────────────────
export default function CRM({ trabajos = [], clientes, vehiculos, notify, actualizarTrabajo }) {
  const clientesTable = clientes?.clientesTable || []

  // Config persistente: intervalos personalizables
  const [config, setConfig] = useState(() => {
    const saved = lsGet(KEY_CONFIG, null)
    if (saved && saved.servicios) return saved
    return { servicios: SERVICIOS_DEFAULT }
  })
  useEffect(() => { lsSet(KEY_CONFIG, config) }, [config])

  // Templates persistentes
  const [templates, setTemplates] = useState(() => {
    const saved = lsGet(KEY_TEMPLATES, null)
    return saved && Object.keys(saved).length > 0 ? saved : TEMPLATES_DEFAULT
  })
  useEffect(() => { lsSet(KEY_TEMPLATES, templates) }, [templates])

  // Tracking de contactos: { [cedula+placa+tipo]: [{fecha, canal, mensaje}] }
  const [contactos, setContactos] = useState(() => lsGet(KEY_CONTACTOS, {}))
  useEffect(() => { lsSet(KEY_CONTACTOS, contactos) }, [contactos])

  // Filtros UI
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroUrgencia, setFiltroUrgencia] = useState('vencidos')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [showTemplate, setShowTemplate] = useState(null) // null o key del servicio
  const [contactoActivo, setContactoActivo] = useState(null) // {cliente, vehiculo, servicio}
  const [mensajeCustom, setMensajeCustom] = useState('')
  // Edición rápida de tipo de aceite desde CRM
  const [editandoAceite, setEditandoAceite] = useState(null) // item de recordatorio
  const [aceiteEditTipo, setAceiteEditTipo] = useState('')
  // Importar contactos sin OT (clientes inactivos)
  const [showImportar, setShowImportar] = useState(false)

  // ── Calcular recordatorios pendientes ─────────────────────────────────────
  const recordatorios = useMemo(() => {
    const items = []
    const completados = trabajos.filter(t => t.estado === ESTADOS.COMPLETADO)

    // Indexar trabajos por placa
    const trabajosPorPlaca = {}
    for (const t of completados) {
      const placa = (t.placa || '').toUpperCase().trim()
      if (!placa) continue
      if (!trabajosPorPlaca[placa]) trabajosPorPlaca[placa] = []
      trabajosPorPlaca[placa].push(t)
    }
    for (const placa of Object.keys(trabajosPorPlaca)) {
      trabajosPorPlaca[placa].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    }

    // Por cada cliente con vehículo
    for (const c of clientesTable) {
      const cedula = (c.cedula || '').toString().trim()
      const placas = (c.vehiculos || []).map(p => (p || '').toString().toUpperCase())
      if (!cedula || placas.length === 0) continue

      for (const placa of placas) {
        const trabs = trabajosPorPlaca[placa] || []
        const ultima = trabs[0]
        if (!ultima) continue
        const fechaUltima = new Date(ultima.fecha)
        if (isNaN(fechaUltima)) continue
        const diasDesde = diasEntre(fechaUltima, HOY())

        // PRIORIDAD 1: campo manual `tipoAceite` en la OT
        // PRIORIDAD 2: detección automática leyendo items facturados
        // PRIORIDAD 3: default mineral (5,000 km)
        let tipoAceiteUsado = null
        let origenAceite = ''
        if (ultima.tipoAceite === 'mineral') { tipoAceiteUsado = 'aceite_mineral'; origenAceite = 'manual' }
        else if (ultima.tipoAceite === 'sintetico') { tipoAceiteUsado = 'aceite_sintetico'; origenAceite = 'manual' }
        else if (ultima.tipoAceite === 'no_aplica') { tipoAceiteUsado = 'no_aplica'; origenAceite = 'manual' }
        else {
          tipoAceiteUsado = detectarTipoAceite(ultima.items || [])
          origenAceite = tipoAceiteUsado ? 'detectado_items' : 'default'
        }

        // Si la OT tiene proximaVisita manual y/o proximoKm
        const proximaVisitaManual = ultima.proximaVisita ? new Date(ultima.proximaVisita) : null

        // Para cada servicio, evaluar si está pendiente
        for (const srv of config.servicios) {
          // Lógica especial para aceites: solo aplica el que coincida con el último usado
          if (srv.key.startsWith('aceite_')) {
            // Si "no_aplica" → no mostrar recordatorio de aceite (no se cambió, no toca aún)
            if (tipoAceiteUsado === 'no_aplica') continue
            // Si no se sabe, asumir mineral por defecto
            const tipoEsperado = tipoAceiteUsado || 'aceite_mineral'
            if (srv.key !== tipoEsperado) continue
          }

          // Si hay fecha manual de próxima visita Y este servicio es de aceite, usar esa fecha
          let diasPendientes
          if (srv.key.startsWith('aceite_') && proximaVisitaManual && !isNaN(proximaVisitaManual)) {
            diasPendientes = diasEntre(proximaVisitaManual, HOY())
          } else {
            const limiteDias = srv.meses * 30
            diasPendientes = diasDesde - limiteDias // si > 0, está vencido
          }
          // Mostrar si está vencido O si faltan menos de 30 días para vencer
          if (diasPendientes < -30) continue

          // Vehículo (datos básicos del último trabajo)
          const veh = {
            placa,
            marca: ultima.marca || '',
            modelo: ultima.modelo || '',
            ano: ultima.ano || '',
          }

          // Tracking: ¿ya lo contactamos para este servicio?
          const trackKey = `${cedula}|${placa}|${srv.key}`
          const historial = contactos[trackKey] || []
          const ultimoContacto = historial[historial.length - 1]
          // No mostrar si lo contactamos en los últimos 14 días
          if (ultimoContacto) {
            const diasDesdeContacto = diasEntre(new Date(ultimoContacto.fecha), HOY())
            if (diasDesdeContacto < 14) continue
          }

          items.push({
            cliente: c,
            vehiculo: veh,
            servicio: srv,
            ultima,
            fechaUltima,
            diasDesde,
            diasPendientes,
            urgencia: diasPendientes > 60 ? 'vencido_mucho'
                    : diasPendientes > 0 ? 'vencido'
                    : diasPendientes > -7 ? 'esta_semana'
                    : 'proximos_30',
            historial,
            trackKey,
            origenAceite, // 'manual' | 'detectado_items' | 'default'
          })
        }
      }
    }

    return items
  }, [trabajos, clientesTable, config, contactos])

  // Filtrar
  const filtrados = useMemo(() => {
    let list = recordatorios
    if (filtroTipo !== 'todos') list = list.filter(r => r.servicio.key === filtroTipo)
    if (filtroUrgencia === 'vencidos') list = list.filter(r => r.diasPendientes > 0)
    else if (filtroUrgencia === 'esta_semana') list = list.filter(r => r.diasPendientes >= -7)
    else if (filtroUrgencia === 'proximos_30') list = list.filter(r => r.diasPendientes >= -30)
    if (filtroBusqueda.trim()) {
      const q = filtroBusqueda.toLowerCase()
      list = list.filter(r =>
        (r.cliente.nombre || '').toLowerCase().includes(q) ||
        (r.vehiculo.placa || '').toLowerCase().includes(q) ||
        (r.cliente.cedula || '').includes(q)
      )
    }
    // Ordenar por urgencia (más vencido primero)
    return list.sort((a, b) => b.diasPendientes - a.diasPendientes)
  }, [recordatorios, filtroTipo, filtroUrgencia, filtroBusqueda])

  // Métricas
  const stats = useMemo(() => ({
    total: recordatorios.length,
    vencidos: recordatorios.filter(r => r.diasPendientes > 0).length,
    estaSemana: recordatorios.filter(r => r.diasPendientes >= -7 && r.diasPendientes <= 7).length,
    contactadosHoy: Object.values(contactos).flat().filter(c => {
      const d = new Date(c.fecha)
      return d.toDateString() === HOY().toDateString()
    }).length,
  }), [recordatorios, contactos])

  // ── Acciones ───────────────────────────────────────────────────────────
  const armarMensaje = (item, channel = 'whatsapp') => {
    const { cliente, vehiculo, servicio, fechaUltima, diasDesde } = item
    const template = templates[servicio.key] || templates.generico || TEMPLATES_DEFAULT.generico
    const vars = {
      nombre: (cliente.nombre || '').split(' ')[0] || 'cliente',
      nombre_completo: cliente.nombre || '',
      placa: vehiculo.placa,
      marca: vehiculo.marca || 'tu vehículo',
      modelo: vehiculo.modelo || '',
      ano: vehiculo.ano || '',
      dias_desde: diasDesde,
      ultima_visita: fmtDate(fechaUltima.toISOString()),
      taller: TALLER.nombre,
      telefono_taller: TALLER.celular,
      email_taller: TALLER.email,
      direccion: TALLER.direccion,
      servicio: servicio.nombre,
    }
    return aplicarTemplate(template, vars)
  }

  const abrirContacto = (item) => {
    setContactoActivo(item)
    setMensajeCustom(armarMensaje(item))
  }

  const enviarPorCanal = (canal) => {
    if (!contactoActivo) return
    const item = contactoActivo
    const mensaje = mensajeCustom || armarMensaje(item)
    let url = null

    if (canal === 'whatsapp') {
      url = whatsappLink(item.cliente.telefono, mensaje)
      if (!url) { notify('El cliente no tiene teléfono registrado', 'error'); return }
    } else if (canal === 'email') {
      const asunto = `${TALLER.nombre} - Recordatorio: ${item.servicio.nombre}`
      url = emailLink(item.cliente.email, asunto, mensaje)
      if (!url) { notify('El cliente no tiene email registrado', 'error'); return }
    }

    if (url) window.open(url, '_blank')
    // Registrar el contacto
    registrarContacto(item, canal, mensaje)
    setContactoActivo(null)
  }

  const registrarContacto = (item, canal, mensaje) => {
    const trackKey = item.trackKey
    setContactos(prev => {
      const lista = prev[trackKey] || []
      return {
        ...prev,
        [trackKey]: [...lista, { fecha: new Date().toISOString(), canal, mensaje }],
      }
    })
    notify(`Contacto registrado vía ${canal}`, 'success')
  }

  const marcarContactado = (item) => {
    registrarContacto(item, 'manual', '')
    notify('Marcado como contactado', 'info')
  }

  // Marcar resultado de un contacto previo (respondió, vino al taller, etc.)
  const marcarResultado = (trackKey, resultado) => {
    setContactos(prev => {
      const lista = prev[trackKey] || []
      if (lista.length === 0) return prev
      const ultimo = lista[lista.length - 1]
      const actualizado = { ...ultimo, resultado, resultadoFecha: new Date().toISOString() }
      return { ...prev, [trackKey]: [...lista.slice(0, -1), actualizado] }
    })
    notify(`Resultado registrado: ${resultado}`, 'success')
  }

  // Edición rápida del tipo de aceite (actualiza la última OT del vehículo)
  const guardarTipoAceite = async () => {
    if (!editandoAceite || !actualizarTrabajo) return
    const trabajoId = editandoAceite.ultima?.id
    if (!trabajoId) { notify('No se encontró la OT a actualizar', 'error'); return }
    try {
      // Auto-calcular próximo km/visita si se eligió mineral o sintético
      const km = parseInt(editandoAceite.ultima.kilometraje) || 0
      let proximoKm = editandoAceite.ultima.proximoKm
      let proximaVisita = editandoAceite.ultima.proximaVisita
      if (aceiteEditTipo === 'mineral') {
        proximoKm = km + 5000
        const d = new Date(); d.setMonth(d.getMonth() + 4)
        proximaVisita = d.toISOString()
      } else if (aceiteEditTipo === 'sintetico') {
        proximoKm = km + 10000
        const d = new Date(); d.setMonth(d.getMonth() + 6)
        proximaVisita = d.toISOString()
      } else if (aceiteEditTipo === 'no_aplica') {
        proximoKm = null
        proximaVisita = null
      }
      await actualizarTrabajo(trabajoId, {
        tipoAceite: aceiteEditTipo || null,
        proximoKm,
        proximaVisita,
      })
      notify('Tipo de aceite actualizado en la OT', 'success')
      setEditandoAceite(null)
    } catch (e) {
      notify('Error: ' + e.message, 'error')
    }
  }

  // Importar clientes sin OT al CRM (los que están en clientesTable sin trabajos)
  const recordatoriosImportar = useMemo(() => {
    // Clientes con teléfono que NO han venido NUNCA o llevan >1 año sin venir
    const trabajosCedulas = new Set(trabajos.filter(t => t.cedula).map(t => (t.cedula || '').toString().trim()))
    return clientesTable.filter(c => {
      if (!c.telefono && !c.email) return false // sin medio de contacto
      const cedula = (c.cedula || '').toString().trim()
      const tieneOT = trabajosCedulas.has(cedula)
      if (!tieneOT) return true // nunca ha venido
      // Tiene OT pero hace mucho — buscar última y comparar
      const susTrabajos = trabajos.filter(t => (t.cedula || '').toString().trim() === cedula)
      const fechas = susTrabajos.map(t => new Date(t.fecha).getTime()).filter(t => !isNaN(t))
      if (fechas.length === 0) return true
      const ultimaFecha = Math.max(...fechas)
      const diasDesde = diasEntre(new Date(ultimaFecha), HOY())
      return diasDesde > 365 // >1 año sin venir
    })
  }, [clientesTable, trabajos])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>CRM · Recordatorios</h2>
          <p className="sub">{stats.total} recordatorios · {stats.vencidos} vencidos · {stats.contactadosHoy} contactados hoy</p>
        </div>
        <div className="actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          {recordatoriosImportar.length > 0 && (
            <button className="btn btn-outline btn-sm" onClick={() => setShowImportar(true)}>
              👥 Inactivos ({recordatoriosImportar.length})
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => setShowTemplate('aceite_mineral')}>📝 Plantillas</button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowConfig(true)}>⚙️ Servicios</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 18 }}>
        <div className="kpi">
          <div className="kpi__head"><div className="kpi__ic red">🚨</div><div className="kpi__lbl">Vencidos</div></div>
          <div className="kpi__v" style={{ color: 'var(--red-600)' }}>{stats.vencidos}</div>
          <div className="kpi__delta">Necesitan contacto urgente</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><div className="kpi__ic amber">📅</div><div className="kpi__lbl">Esta semana</div></div>
          <div className="kpi__v" style={{ color: 'var(--amber-600)' }}>{stats.estaSemana}</div>
          <div className="kpi__delta">±7 días del vencimiento</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><div className="kpi__ic blue">📊</div><div className="kpi__lbl">Total recordatorios</div></div>
          <div className="kpi__v">{stats.total}</div>
          <div className="kpi__delta">Vencidos + próximos 30 días</div>
        </div>
        <div className="kpi">
          <div className="kpi__head"><div className="kpi__ic green">✓</div><div className="kpi__lbl">Contactados hoy</div></div>
          <div className="kpi__v" style={{ color: 'var(--green-600)' }}>{stats.contactadosHoy}</div>
          <div className="kpi__delta">Mensajes enviados</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__b" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Búsqueda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 11px', flex: '1 1 200px', minWidth: 200 }}>
            <span style={{ opacity: 0.5 }}>🔍</span>
            <input value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} placeholder="Buscar cliente o placa..." style={{ border: 'none', outline: 'none', background: 'none', flex: 1, fontSize: 13 }} />
          </div>

          {/* Filtro por tipo de servicio */}
          <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 220 }}>
            <option value="todos">Todos los servicios</option>
            {config.servicios.map(s => <option key={s.key} value={s.key}>{s.nombre}</option>)}
          </select>

          {/* Filtro por urgencia */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-subtle)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
            {[
              ['vencidos', 'Vencidos'],
              ['esta_semana', 'Esta semana'],
              ['proximos_30', '30 días'],
              ['todos', 'Todos'],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setFiltroUrgencia(k)} style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                background: filtroUrgencia === k ? 'var(--bg-raised)' : 'transparent',
                color: filtroUrgencia === k ? 'var(--text)' : 'var(--text-3)',
                boxShadow: filtroUrgencia === k ? 'var(--shadow-sm)' : 'none',
                border: 'none', cursor: 'pointer',
              }}>{l}</button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
            <strong style={{ color: 'var(--text)' }}>{filtrados.length}</strong> resultados
          </div>
        </div>
      </div>

      {/* Lista de recordatorios */}
      <div className="card">
        <div className="card__h"><h3>Clientes para contactar</h3>{filtrados.length > 0 && <span className="count">{filtrados.length}</span>}</div>
        {filtrados.length === 0 ? (
          <div className="card__b">
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <p>No hay recordatorios pendientes con estos filtros.</p>
            </div>
          </div>
        ) : (
          <div className="card__b card__b--flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vehículo</th>
                  <th>Servicio</th>
                  <th>Última visita</th>
                  <th>Estado</th>
                  <th>Contacto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 100).map((r, i) => {
                  const urgenteCls = r.diasPendientes > 60 ? 'badge-d' : r.diasPendientes > 0 ? 'badge-w' : r.diasPendientes >= -7 ? 'badge-i' : 'badge-s'
                  const urgenteLbl = r.diasPendientes > 60 ? `${r.diasPendientes}d vencido` : r.diasPendientes > 0 ? `${r.diasPendientes}d vencido` : r.diasPendientes >= -7 ? 'Esta semana' : `Faltan ${-r.diasPendientes}d`
                  // Origen visual
                  const origenInfo = r.origenAceite === 'manual' ? { txt: 'manual', color: 'var(--green-600)', tip: 'Tipo de aceite definido por el técnico en la OT' }
                    : r.origenAceite === 'detectado_items' ? { txt: 'auto', color: 'var(--blue-600)', tip: 'Tipo detectado automáticamente leyendo los items facturados' }
                    : r.origenAceite === 'default' ? { txt: 'default', color: 'var(--text-3)', tip: 'Sin información, asume aceite mineral (5,000 km)' }
                    : null
                  // Resultado del último contacto
                  const ultContacto = r.historial[r.historial.length - 1]
                  const resultadoBadge = ultContacto?.resultado
                  return (
                    <tr key={`${r.trackKey}-${i}`}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.cliente.nombre}</div>
                        <div className="c-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.cliente.cedula}</div>
                      </td>
                      <td>
                        <div className="c-mono" style={{ fontWeight: 700 }}>{r.vehiculo.placa}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.vehiculo.marca} {r.vehiculo.modelo}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13 }}>{r.servicio.nombre}</span>
                          {r.servicio.key.startsWith('aceite_') && origenInfo && (
                            <span title={origenInfo.tip}
                              style={{
                                fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                color: origenInfo.color, background: 'var(--bg-subtle)',
                                border: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '.4px',
                                cursor: actualizarTrabajo ? 'pointer' : 'default',
                              }}
                              onClick={() => {
                                if (!actualizarTrabajo) return
                                setEditandoAceite(r)
                                setAceiteEditTipo(r.ultima?.tipoAceite || '')
                              }}
                            >
                              {origenInfo.txt}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>cada {r.servicio.km.toLocaleString()} km / {r.servicio.meses} meses</div>
                      </td>
                      <td className="c-muted">{fmtDate(r.fechaUltima.toISOString())}<br/><span style={{ fontSize: 11 }}>hace {r.diasDesde}d</span></td>
                      <td><span className={`badge ${urgenteCls}`}>{urgenteLbl}</span></td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5 }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {r.cliente.telefono ? <span style={{ color: 'var(--green-600)' }}>📱</span> : <span style={{ opacity: 0.3 }}>📱</span>}
                            {r.cliente.email ? <span style={{ color: 'var(--blue-600)' }}>✉</span> : <span style={{ opacity: 0.3 }}>✉</span>}
                            {r.historial.length > 0 && <span title={`${r.historial.length} contactos previos`} style={{ color: 'var(--text-3)' }}>·{r.historial.length}</span>}
                          </div>
                          {resultadoBadge && (
                            <span style={{
                              fontSize: 9.5, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                              color: resultadoBadge === 'vino_taller' ? 'var(--green-700)' : resultadoBadge === 'respondio' ? 'var(--blue-700)' : 'var(--text-3)',
                              background: 'var(--bg-subtle)', textTransform: 'uppercase', letterSpacing: '.4px',
                            }}>
                              {resultadoBadge === 'vino_taller' ? '✓ vino' : resultadoBadge === 'respondio' ? '✓ respondió' : resultadoBadge === 'no_respondio' ? '✗ no resp.' : resultadoBadge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => abrirContacto(r)}>
                          Contactar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtrados.length > 100 && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                Mostrando 100 de {filtrados.length}. Filtra para ver más relevantes.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: contactar */}
      {contactoActivo && (
        <div className="modal-overlay" onClick={() => setContactoActivo(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal__h">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Contactar a {contactoActivo.cliente.nombre}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setContactoActivo(null)}>✕</button>
            </div>
            <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5 }}>
                <div><strong>{contactoActivo.servicio.nombre}</strong></div>
                <div style={{ color: 'var(--text-3)' }}>
                  {contactoActivo.vehiculo.marca} {contactoActivo.vehiculo.modelo} · <span className="c-mono">{contactoActivo.vehiculo.placa}</span>
                  {' · '}última visita: {fmtDate(contactoActivo.fechaUltima.toISOString())}
                </div>
                {contactoActivo.historial.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--amber-600)' }}>
                    ⚠️ Ya contactado {contactoActivo.historial.length} {contactoActivo.historial.length === 1 ? 'vez' : 'veces'} antes (último: {fmtDate(contactoActivo.historial[contactoActivo.historial.length - 1].fecha)})
                  </div>
                )}
              </div>
              <div className="field">
                <label>Mensaje</label>
                <textarea className="input" rows={9} value={mensajeCustom} onChange={e => setMensajeCustom(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5 }} />
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Puedes editar antes de enviar. Se guarda en el historial del cliente.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => enviarPorCanal('whatsapp')}
                  disabled={!contactoActivo.cliente.telefono}
                  style={{ background: '#25D366', flex: '1 1 auto' }}>
                  📱 WhatsApp{!contactoActivo.cliente.telefono && ' (sin tel)'}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => enviarPorCanal('email')}
                  disabled={!contactoActivo.cliente.email}
                  style={{ flex: '1 1 auto' }}>
                  ✉️ Email{!contactoActivo.cliente.email && ' (sin email)'}
                </button>
                {contactoActivo.cliente.telefono && (
                  <a href={`tel:${contactoActivo.cliente.telefono}`} className="btn btn-outline" style={{ flex: '1 1 auto', textAlign: 'center' }}>📞 Llamar</a>
                )}
              </div>
              {/* Resultado del último contacto (si existe) */}
              {contactoActivo.historial.length > 0 && (
                <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                    Resultado del último contacto
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      ['vino_taller', '🚗 Vino al taller', 'var(--green-600)'],
                      ['respondio', '💬 Respondió', 'var(--blue-600)'],
                      ['no_respondio', '✗ No respondió', 'var(--text-3)'],
                      ['no_quiere', '❌ No quiere', 'var(--red-600)'],
                    ].map(([k, l, c]) => {
                      const ult = contactoActivo.historial[contactoActivo.historial.length - 1]
                      const activo = ult?.resultado === k
                      return (
                        <button key={k} className="btn btn-outline btn-sm"
                          onClick={() => marcarResultado(contactoActivo.trackKey, k)}
                          style={{
                            fontSize: 11.5,
                            background: activo ? c : undefined,
                            color: activo ? '#fff' : c,
                            borderColor: c,
                          }}>
                          {l}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => marcarContactado(contactoActivo)}>
                  ✓ Marcar contactado (sin enviar)
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setContactoActivo(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edición rápida del tipo de aceite */}
      {editandoAceite && (
        <div className="modal-overlay" onClick={() => setEditandoAceite(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal__h">
              <h3 style={{ margin: 0 }}>Tipo de aceite</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditandoAceite(null)}>✕</button>
            </div>
            <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                Actualiza el tipo de aceite usado en la última OT de <strong>{editandoAceite.vehiculo.placa}</strong> ({editandoAceite.vehiculo.marca} {editandoAceite.vehiculo.modelo}). Esto recalcula la próxima visita.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['', 'Sin especificar (deja al CRM detectar)'],
                  ['mineral', 'Mineral / Semisintético — próximo en 5,000 km · 4 meses'],
                  ['sintetico', 'Full sintético — próximo en 10,000 km · 6 meses'],
                  ['no_aplica', 'No se cambió aceite (no generar recordatorio)'],
                ].map(([val, lbl]) => (
                  <label key={val || 'none'} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: `1.5px solid ${aceiteEditTipo === val ? 'var(--blue-600)' : 'var(--border)'}`,
                    background: aceiteEditTipo === val ? 'var(--blue-50,#eff6ff)' : 'var(--bg-raised)',
                    borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  }}>
                    <input type="radio" name="aceiteTipo" value={val} checked={aceiteEditTipo === val}
                      onChange={() => setAceiteEditTipo(val)} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-outline" onClick={() => setEditandoAceite(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarTipoAceite}>Guardar en la OT</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Clientes inactivos (sin OT o >1 año) */}
      {showImportar && (
        <div className="modal-overlay" onClick={() => setShowImportar(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal__h">
              <h3 style={{ margin: 0 }}>👥 Clientes inactivos ({recordatoriosImportar.length})</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowImportar(false)}>✕</button>
            </div>
            <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>
                Clientes con teléfono o email registrado que <strong>nunca han venido</strong> o <strong>llevan más de 1 año</strong> sin venir. Buena oportunidad para reactivarlos con una campaña.
              </p>
              {recordatoriosImportar.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 0' }}>
                  <div className="empty-state-icon">✅</div>
                  <p>No hay clientes inactivos.</p>
                </div>
              ) : (
                <div style={{ maxHeight: '50vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table className="tbl" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Contacto</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordatoriosImportar.slice(0, 50).map(c => {
                        const tel = c.telefono ? c.telefono.toString().replace(/\D/g, '') : ''
                        const num = tel.length === 10 ? `57${tel}` : tel
                        const mensaje = aplicarTemplate(templates.generico || TEMPLATES_DEFAULT.generico, {
                          nombre: (c.nombre || '').split(' ')[0] || 'cliente',
                          placa: (c.vehiculos || [])[0] || '—',
                          marca: 'tu vehículo',
                          modelo: '',
                          ano: '',
                          dias_desde: '?',
                          ultima_visita: 'hace tiempo',
                          taller: TALLER.nombre,
                          telefono_taller: TALLER.celular,
                          direccion: TALLER.direccion,
                        })
                        const wa = tel ? `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}` : null
                        return (
                          <tr key={c.cedula}>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{c.nombre}</div>
                              <div className="c-mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{c.cedula}</div>
                            </td>
                            <td style={{ fontSize: 11.5 }}>
                              {c.telefono && <div className="c-mono">{c.telefono}</div>}
                              {c.email && <div style={{ color: 'var(--text-3)' }}>{c.email}</div>}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ background: '#25D366', fontSize: 11 }}>📱 WhatsApp</a>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {recordatoriosImportar.length > 50 && (
                    <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: 'var(--text-3)' }}>
                      Mostrando 50 de {recordatoriosImportar.length}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal__f">
              <button className="btn btn-primary" onClick={() => setShowImportar(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: configurar servicios */}
      {showConfig && (
        <div className="modal-overlay" onClick={() => setShowConfig(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal__h">
              <h3 style={{ margin: 0 }}>⚙️ Servicios e intervalos</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowConfig(false)}>✕</button>
            </div>
            <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>
                Cada servicio dispara un recordatorio cuando pasan los KM o meses indicados desde la última visita.
              </p>
              {config.servicios.map((s, idx) => (
                <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 30px', gap: 8, alignItems: 'center', padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                  <input type="text" className="input" value={s.nombre}
                    onChange={e => setConfig(c => ({ ...c, servicios: c.servicios.map((x, i) => i === idx ? { ...x, nombre: e.target.value } : x) }))}
                    style={{ fontSize: 12.5 }} />
                  <input type="number" className="input" value={s.km}
                    onChange={e => setConfig(c => ({ ...c, servicios: c.servicios.map((x, i) => i === idx ? { ...x, km: parseInt(e.target.value) || 0 } : x) }))}
                    style={{ fontSize: 12.5 }} placeholder="km" />
                  <input type="number" className="input" value={s.meses}
                    onChange={e => setConfig(c => ({ ...c, servicios: c.servicios.map((x, i) => i === idx ? { ...x, meses: parseInt(e.target.value) || 0 } : x) }))}
                    style={{ fontSize: 12.5 }} placeholder="meses" />
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfig(c => ({ ...c, servicios: c.servicios.filter((_, i) => i !== idx) }))} style={{ color: 'var(--red-600)' }}>✕</button>
                </div>
              ))}
              <button className="btn btn-outline btn-sm" onClick={() => setConfig(c => ({ ...c, servicios: [...c.servicios, { key: `custom_${Date.now()}`, nombre: 'Nuevo servicio', km: 10000, meses: 6 }] }))}>+ Añadir servicio</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)', fontSize: 11 }} onClick={() => { if (window.confirm('¿Restaurar servicios por defecto?')) setConfig({ servicios: SERVICIOS_DEFAULT }) }}>Restaurar valores por defecto</button>
            </div>
            <div className="modal__f">
              <button className="btn btn-primary" onClick={() => setShowConfig(false)}>Guardar y cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar plantillas */}
      {showTemplate && (
        <div className="modal-overlay" onClick={() => setShowTemplate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal__h">
              <h3 style={{ margin: 0 }}>📝 Plantillas de mensajes</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTemplate(null)}>✕</button>
            </div>
            <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>
                Edita los mensajes que se envían por WhatsApp/email. Variables disponibles:
                <code style={{ display: 'inline-block', margin: '4px 0', fontSize: 11 }}>
                  {' '}{'{nombre}'} {'{placa}'} {'{marca}'} {'{modelo}'} {'{ano}'} {'{dias_desde}'} {'{ultima_visita}'} {'{taller}'} {'{telefono_taller}'} {'{direccion}'}
                </code>
              </p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[...config.servicios.map(s => s.key), 'generico'].map(key => {
                  const lbl = key === 'generico' ? 'Genérico' : config.servicios.find(s => s.key === key)?.nombre || key
                  return (
                    <button key={key} onClick={() => setShowTemplate(key)} className="btn btn-outline btn-sm" style={{
                      fontSize: 11.5,
                      background: showTemplate === key ? 'var(--blue-600)' : undefined,
                      color: showTemplate === key ? '#fff' : undefined,
                      borderColor: showTemplate === key ? 'var(--blue-600)' : undefined,
                    }}>{lbl}</button>
                  )
                })}
              </div>
              <textarea
                className="input"
                rows={12}
                value={templates[showTemplate] || ''}
                onChange={e => setTemplates(t => ({ ...t, [showTemplate]: e.target.value }))}
                style={{ fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                💡 Tip: usa emojis 👋 🛠️ 📞 para que el mensaje se vea más amigable en WhatsApp.
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-ghost" onClick={() => { if (window.confirm('¿Restaurar esta plantilla a la default?')) setTemplates(t => ({ ...t, [showTemplate]: TEMPLATES_DEFAULT[showTemplate] || '' })) }}>
                Restaurar default
              </button>
              <button className="btn btn-primary" onClick={() => setShowTemplate(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
