import { useState, useEffect, useMemo, useCallback } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { TALLER, ESTADOS } from '../utils/constants'
import { lsGet, lsSet } from '../services/storage'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, IconX } from '../components/ui'

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
  // Primero quita ".0" final (cuando el numero vino como float desde Supabase),
  // luego strip de cualquier no-digito.
  const sinDecimal = tel.toString().replace(/[.,]\d+$/, '')
  const limpio = sinDecimal.replace(/\D/g, '')
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
  const [busquedaInactivos, setBusquedaInactivos] = useState('')
  const [filtroInactivos, setFiltroInactivos] = useState('todos') // 'todos' | 'wa' | 'email'
  const [confirmCfg, setConfirmCfg] = useState(null)

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
        </div>
        <div className="actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          {recordatoriosImportar.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowImportar(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Inactivos ({recordatoriosImportar.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowTemplate('aceite_mineral')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Plantillas
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}>Servicios</Button>
        </div>
      </div>

      {/* KPIs — hero "Vencidos" (lo urgente) + 3 mini */}
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi-hero" style={{
          background: stats.vencidos > 0 ? 'rgba(220,38,38,.05)' : 'var(--bg-raised)',
          border: '1px solid',
          borderColor: stats.vencidos > 0 ? 'rgba(220,38,38,.32)' : 'var(--border)',
          borderRadius: 14, padding: '22px 26px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Vencidos</span>
            {stats.contactadosHoy > 0 && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--green-700)', background: 'var(--soft-green)', padding: '4px 10px', borderRadius: 999 }}>
                +{stats.contactadosHoy} hoy
              </span>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'clamp(36px, 5.5vw, 56px)', letterSpacing: '-1.2px', lineHeight: 1, color: stats.vencidos > 0 ? 'var(--red-700)' : 'var(--text)' }}>
                {stats.vencidos}
              </div>
              <div style={{ fontSize: 14.5, color: 'var(--text-2)', fontWeight: 500 }}>
                clientes para contactar ahora
              </div>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-3)', marginTop: 8, fontWeight: 500 }}>
              {stats.estaSemana} más esta semana · {stats.total} en total
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr 1fr', gap: 10 }}>
          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic amber" style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Esta semana</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 22, color: 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{stats.estaSemana}</div>
            </div>
          </div>

          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic blue" style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Total recordatorios</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 22, color: 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{stats.total}</div>
            </div>
          </div>

          <div className="kpi-mini" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="kpi__ic green" style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Contactados hoy</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 22, color: stats.contactadosHoy > 0 ? 'var(--green-700)' : 'var(--text)', lineHeight: 1.1, marginTop: 2 }}>{stats.contactadosHoy}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__b" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Búsqueda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 12px', flex: '1 1 200px', minWidth: 220 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} placeholder="Buscar cliente o placa..." style={{ border: 'none', outline: 'none', background: 'none', flex: 1, fontSize: 13.5 }} />
          </div>

          {/* Filtro por tipo de servicio */}
          <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 220 }}>
            <option value="todos">Todos los servicios</option>
            {config.servicios.map(s => <option key={s.key} value={s.key}>{s.nombre}</option>)}
          </select>

          {/* Filtro por urgencia */}
          <div className="segctl">
            {[
              ['vencidos', 'Vencidos'],
              ['esta_semana', 'Esta semana'],
              ['proximos_30', '30 días'],
              ['todos', 'Todos'],
            ].map(([k, l]) => (
              <button key={k} className={filtroUrgencia === k ? 'on' : ''} onClick={() => setFiltroUrgencia(k)}>{l}</button>
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
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .85 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p>No hay recordatorios pendientes con estos filtros.</p>
            </div>
          </div>
        ) : (
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
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
                      <td className="c-name">
                        <div style={{ fontWeight: 700 }}>{r.cliente.nombre}</div>
                        <div className="c-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.cliente.cedula}</div>
                      </td>
                      <td data-label="Vehículo">
                        <div className="c-mono" style={{ fontWeight: 700 }}>{r.vehiculo.placa}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.vehiculo.marca} {r.vehiculo.modelo}</div>
                      </td>
                      <td data-label="Servicio">
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
                      <td className="c-muted" data-label="Última visita">{fmtDate(r.fechaUltima.toISOString())}<br/><span style={{ fontSize: 11 }}>hace {r.diasDesde}d</span></td>
                      <td data-label="Estado"><span className={`badge ${urgenteCls}`}>{urgenteLbl}</span></td>
                      <td data-label="Contacto">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={r.cliente.telefono ? 'var(--green-600)' : 'var(--text-4)'} strokeOpacity={r.cliente.telefono ? 1 : 0.4} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={r.cliente.telefono ? 'Con teléfono' : 'Sin teléfono'}>
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={r.cliente.email ? 'var(--blue-600)' : 'var(--text-4)'} strokeOpacity={r.cliente.email ? 1 : 0.4} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={r.cliente.email ? 'Con email' : 'Sin email'}>
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                            </svg>
                            {r.historial.length > 0 && <span title={`${r.historial.length} contactos previos`} style={{ color: 'var(--text-3)', fontSize: 11 }}>·{r.historial.length}</span>}
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
                      <td className="td-actions" style={{ textAlign: 'right' }}>
                        <Button variant="primary" size="sm" onClick={() => abrirContacto(r)}>
                          Contactar
                        </Button>
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
              <Button variant="ghost" size="sm" onClick={() => setContactoActivo(null)}><IconX /></Button>
            </div>
            <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5 }}>
                <div><strong>{contactoActivo.servicio.nombre}</strong></div>
                <div style={{ color: 'var(--text-3)' }}>
                  {contactoActivo.vehiculo.marca} {contactoActivo.vehiculo.modelo} · <span className="c-mono">{contactoActivo.vehiculo.placa}</span>
                  {' · '}última visita: {fmtDate(contactoActivo.fechaUltima.toISOString())}
                </div>
                {contactoActivo.historial.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--amber-700)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Ya contactado {contactoActivo.historial.length} {contactoActivo.historial.length === 1 ? 'vez' : 'veces'} antes (último: {fmtDate(contactoActivo.historial[contactoActivo.historial.length - 1].fecha)})
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
                <Button
                  variant="primary"
                  onClick={() => enviarPorCanal('whatsapp')}
                  disabled={!contactoActivo.cliente.telefono}
                  style={{ background: '#16a34a', flex: '1 1 auto' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                  WhatsApp{!contactoActivo.cliente.telefono && ' (sin tel)'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => enviarPorCanal('email')}
                  disabled={!contactoActivo.cliente.email}
                  style={{ flex: '1 1 auto' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Email{!contactoActivo.cliente.email && ' (sin email)'}
                </Button>
                {contactoActivo.cliente.telefono && (
                  <a href={`tel:${contactoActivo.cliente.telefono}`} className="btn btn-outline" style={{ flex: '1 1 auto', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    Llamar
                  </a>
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
                      ['vino_taller', 'Vino al taller', 'var(--green-700)'],
                      ['respondio', 'Respondió', 'var(--blue-700)'],
                      ['no_respondio', 'No respondió', 'var(--text-3)'],
                      ['no_quiere', 'No quiere', 'var(--red-700)'],
                    ].map(([k, l, c]) => {
                      const ult = contactoActivo.historial[contactoActivo.historial.length - 1]
                      const activo = ult?.resultado === k
                      return (
                        <Button key={k} variant="outline" size="sm"
                          onClick={() => marcarResultado(contactoActivo.trackKey, k)}
                          style={{
                            fontSize: 11.5,
                            background: activo ? c : undefined,
                            color: activo ? '#fff' : c,
                            borderColor: c,
                          }}>
                          {l}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <Button variant="ghost" size="sm" onClick={() => marcarContactado(contactoActivo)}>
                  ✓ Marcar contactado (sin enviar)
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setContactoActivo(null)}>Cerrar</Button>
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
              <Button variant="ghost" size="sm" onClick={() => setEditandoAceite(null)}><IconX /></Button>
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
              <Button variant="outline" onClick={() => setEditandoAceite(null)}>Cancelar</Button>
              <Button variant="primary" onClick={guardarTipoAceite}>Guardar en la OT</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Clientes inactivos (sin OT o >1 año) */}
      {showImportar && (() => {
        const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
        const filtrados = recordatoriosImportar.filter(c => {
          if (filtroInactivos === 'wa' && !c.telefono) return false
          if (filtroInactivos === 'email' && !c.email) return false
          if (busquedaInactivos.trim()) {
            const t = norm(busquedaInactivos.trim())
            return norm(c.nombre).includes(t) || (c.cedula || '').includes(t.replace(/\D/g, ''))
          }
          return true
        })
        return (
        <div className="modal-overlay" onClick={() => setShowImportar(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{
            maxWidth: '95vw', width: 1100, maxHeight: '92vh', display: 'flex', flexDirection: 'column'
          }}>
            <div className="modal__h" style={{ flexShrink: 0 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Clientes inactivos · <strong>{filtrados.length}</strong> de {recordatoriosImportar.length}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowImportar(false)} aria-label="Cerrar"><IconX /></Button>
            </div>

            {/* Filtros y búsqueda — siempre visibles */}
            <div style={{ flexShrink: 0, padding: '12px 22px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 12px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={busquedaInactivos}
                  onChange={e => setBusquedaInactivos(e.target.value)}
                  placeholder="Buscar nombre o cédula..."
                  style={{ border: 'none', outline: 'none', background: 'none', flex: 1, fontSize: 13.5 }}
                />
                {busquedaInactivos && (
                  <button type="button" className="input-clear" onClick={() => setBusquedaInactivos('')} aria-label="Limpiar búsqueda"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                )}
              </div>
              <div className="segctl">
                {[['todos', 'Todos'], ['wa', 'Con WhatsApp'], ['email', 'Con Email']].map(([k, l]) => (
                  <button key={k} className={filtroInactivos === k ? 'on' : ''} onClick={() => setFiltroInactivos(k)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ padding: '10px 22px 0', flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                Clientes con teléfono o email que <strong>nunca han venido</strong> o <strong>llevan +1 año</strong> sin venir. Buena oportunidad para reactivarlos.
              </p>
            </div>

            {/* Lista con scroll vertical (muestra TODOS, no slice) */}
            <div style={{ flex: 1, overflow: 'auto', padding: '10px 22px 0', minHeight: 200 }}>
              {filtrados.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 0' }}>
                  {recordatoriosImportar.length === 0 ? (
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .85 }}>
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  ) : (
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .8 }}>
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  )}
                  <p>{recordatoriosImportar.length === 0 ? 'No hay clientes inactivos.' : 'Sin resultados con esos filtros.'}</p>
                </div>
              ) : (
                <table className="tbl tbl-cards" style={{ margin: 0, fontSize: 12.5 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-raised)', zIndex: 1 }}>
                    <tr>
                      <th style={{ width: '40%' }}>Cliente</th>
                      <th style={{ width: '20%' }}>Teléfono</th>
                      <th>Email</th>
                      <th style={{ width: 220, textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(c => {
                      const telSinDecimal = c.telefono ? c.telefono.toString().replace(/[.,]\d+$/, '') : ''
                      const tel = telSinDecimal.replace(/\D/g, '')
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
                      const mailto = c.email ? `mailto:${c.email}?subject=${encodeURIComponent(TALLER.nombre + ' - Te extrañamos')}&body=${encodeURIComponent(mensaje)}` : null
                      return (
                        <tr key={c.cedula}>
                          <td className="c-name">
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nombre || '—'}</div>
                            <div className="c-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.cedula}</div>
                          </td>
                          <td className="c-mono" data-label="Teléfono" style={{ fontSize: 12 }}>
                            {c.telefono || <span style={{ color: 'var(--text-4)' }}>—</span>}
                          </td>
                          <td data-label="Email" style={{ fontSize: 11.5, color: 'var(--text-2)', wordBreak: 'break-all' }}>
                            {c.email || <span style={{ color: 'var(--text-4)' }}>—</span>}
                          </td>
                          <td className="td-actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {wa && (
                                <a href={wa} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11, padding: '4px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                  📱 WhatsApp
                                </a>
                              )}
                              {mailto && (
                                <a href={mailto} className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                  ✉ Email
                                </a>
                              )}
                              {c.telefono && (
                                <a href={`tel:${c.telefono}`} className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }} title="Llamar">
                                  📞
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal__f" style={{ flexShrink: 0 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginRight: 'auto' }}>
                Mostrando <strong>{filtrados.length}</strong> de {recordatoriosImportar.length} inactivos
              </span>
              <Button variant="primary" onClick={() => setShowImportar(false)}>Cerrar</Button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Modal: configurar servicios */}
      {showConfig && (
        <div className="modal-overlay" onClick={() => setShowConfig(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal__h">
              <h3 style={{ margin: 0 }}>⚙️ Servicios e intervalos</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowConfig(false)}><IconX /></Button>
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
                  <Button variant="ghost" size="sm" onClick={() => setConfig(c => ({ ...c, servicios: c.servicios.filter((_, i) => i !== idx) }))} style={{ color: 'var(--red-600)' }}><IconX /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setConfig(c => ({ ...c, servicios: [...c.servicios, { key: `custom_${Date.now()}`, nombre: 'Nuevo servicio', km: 10000, meses: 6 }] }))}>+ Añadir servicio</Button>
              <Button variant="ghost" size="sm" style={{ color: 'var(--text-3)', fontSize: 11 }} onClick={() => setConfirmCfg({ title: 'Restaurar servicios', lead: 'Vuelve a los intervalos por defecto.', confirmLabel: 'Restaurar', tone: 'primary', onConfirm: () => setConfig({ servicios: SERVICIOS_DEFAULT }) })}>Restaurar valores por defecto</Button>
            </div>
            <div className="modal__f">
              <Button variant="primary" onClick={() => setShowConfig(false)}>Guardar y cerrar</Button>
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
              <Button variant="ghost" size="sm" onClick={() => setShowTemplate(null)}><IconX /></Button>
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
                    <Button key={key} onClick={() => setShowTemplate(key)} variant="outline" size="sm" style={{
                      fontSize: 11.5,
                      background: showTemplate === key ? 'var(--blue-600)' : undefined,
                      color: showTemplate === key ? '#fff' : undefined,
                      borderColor: showTemplate === key ? 'var(--blue-600)' : undefined,
                    }}>{lbl}</Button>
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
              <Button variant="ghost" onClick={() => setConfirmCfg({ title: 'Restaurar plantilla', lead: 'Vuelve al texto por defecto.', confirmLabel: 'Restaurar', tone: 'primary', onConfirm: () => setTemplates(t => ({ ...t, [showTemplate]: TEMPLATES_DEFAULT[showTemplate] || '' })) })}>
                Restaurar default
              </Button>
              <Button variant="primary" onClick={() => setShowTemplate(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </div>
  )
}
