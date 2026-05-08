#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ── Config Supabase ──
const SUPABASE_URL = 'https://hpndvrjjizzkusuuhefb.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbmR2cmpqaXp6a3VzdXVoZWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjkwMzMsImV4cCI6MjA4OTA0NTAzM30.-6Jz1TsDjAladZUOGD-WNMvVbZXd1Z4WBoOF-npew5c'

const TABLES = [
  'trabajos', 'cotizaciones', 'clientes', 'vehiculos', 'inspecciones',
  'movimientos_tecnicos', 'liquidacion_historial', 'liquidados', 'trabajos_compartidos',
]

// ── Supabase helper ──
async function supabase(table, { method = 'GET', query = '', body = null, upsert = false } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Prefer: upsert ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
    Accept: 'application/json',
  }
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

// ── Helpers de formato ──
function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
}
function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Crear servidor MCP ──
const server = new McpServer({
  name: 'Taller MultiAS',
  version: '1.0.0',
})

// ═══════════════════════════════════════
// TOOL: dashboard — Resumen general
// ═══════════════════════════════════════
server.tool('dashboard', 'Resumen general del taller: trabajos activos, ingresos, pendientes', {}, async () => {
  const trabajos = await supabase('trabajos', { query: 'select=*&order=fecha.desc&limit=500' })
  const hoy = new Date().toISOString().slice(0, 10)
  const mesActual = new Date().toISOString().slice(0, 7)

  const activos = trabajos.filter(t => t.estado === 'En Proceso' || t.estado === 'Pendiente')
  const listos = trabajos.filter(t => t.estado === 'Listo')
  const entregados = trabajos.filter(t => t.estado === 'Entregado')
  const hoyIngresados = trabajos.filter(t => (t.fecha || '').startsWith(hoy))
  const ingresosMes = trabajos
    .filter(t => t.estado === 'Entregado' && (t.fecha || '').startsWith(mesActual))
    .reduce((s, t) => s + (parseFloat(t.total) || 0), 0)
  const totalHistorico = entregados.reduce((s, t) => s + (parseFloat(t.total) || 0), 0)

  return {
    content: [{
      type: 'text',
      text: [
        `## Dashboard Taller MultiAS`,
        `**Fecha:** ${fmtFecha(new Date().toISOString())}`,
        ``,
        `| Metrica | Valor |`,
        `|---------|-------|`,
        `| Trabajos activos (Pendiente + En Proceso) | ${activos.length} |`,
        `| Listos para entregar | ${listos.length} |`,
        `| Ingresados hoy | ${hoyIngresados.length} |`,
        `| Total OTs historicas | ${trabajos.length} |`,
        `| Ingresos del mes | ${fmtCOP(ingresosMes)} |`,
        `| Total historico facturado | ${fmtCOP(totalHistorico)} |`,
        ``,
        listos.length > 0 ? `### Listos para entregar:\n${listos.map(t =>
          `- **${t.placa}** — ${t.cliente} — ${fmtCOP(t.total)} (${t.ot_codigo || t.id})`
        ).join('\n')}` : '✅ No hay vehiculos listos para entregar.',
      ].join('\n'),
    }],
  }
})

// ═══════════════════════════════════════
// TOOL: buscar_trabajos — Buscar OTs
// ═══════════════════════════════════════
server.tool('buscar_trabajos', 'Buscar ordenes de trabajo por placa, cliente, estado o ID', {
  termino: z.string().describe('Placa, nombre del cliente, OT codigo, o estado (Pendiente, En Proceso, Listo, Entregado)'),
}, async ({ termino }) => {
  const t = termino.trim()
  const trabajos = await supabase('trabajos', { query: 'select=*&order=fecha.desc&limit=500' })

  const tLower = t.toLowerCase()
  const filtrados = trabajos.filter(tr =>
    (tr.placa || '').toLowerCase().includes(tLower) ||
    (tr.cliente || '').toLowerCase().includes(tLower) ||
    (tr.ot_codigo || '').toLowerCase().includes(tLower) ||
    (tr.id || '').toLowerCase().includes(tLower) ||
    (tr.estado || '').toLowerCase() === tLower ||
    (tr.cedula_cliente || '').includes(t)
  )

  if (filtrados.length === 0) {
    return { content: [{ type: 'text', text: `No se encontraron trabajos para "${t}".` }] }
  }

  const lineas = filtrados.slice(0, 20).map(tr =>
    `- **${tr.ot_codigo || tr.id}** | ${tr.placa || '—'} | ${tr.cliente || '—'} | ${tr.estado} | ${fmtCOP(tr.total)} | ${fmtFecha(tr.fecha)}`
  )

  return {
    content: [{
      type: 'text',
      text: `## Trabajos encontrados (${filtrados.length})\n\n${lineas.join('\n')}${filtrados.length > 20 ? `\n\n... y ${filtrados.length - 20} mas` : ''}`,
    }],
  }
})

// ═══════════════════════════════════════
// TOOL: detalle_trabajo — Ver OT completa
// ═══════════════════════════════════════
server.tool('detalle_trabajo', 'Ver detalle completo de una orden de trabajo', {
  id: z.string().describe('ID o codigo OT del trabajo'),
}, async ({ id }) => {
  const trabajos = await supabase('trabajos', { query: `select=*&or=(id.eq.${id},ot_codigo.eq.${id})` })
  const t = trabajos[0]
  if (!t) return { content: [{ type: 'text', text: `No se encontro trabajo con ID "${id}".` }] }

  const items = typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || [])
  const itemsText = items.length > 0
    ? items.map((i, idx) => `  ${idx + 1}. ${i.nombre || '—'} x${i.cantidad || 1} — ${fmtCOP(i.precio || 0)}`).join('\n')
    : '  (sin items)'

  return {
    content: [{
      type: 'text',
      text: [
        `## Orden de Trabajo: ${t.ot_codigo || t.id}`,
        `**Estado:** ${t.estado} | **Fecha:** ${fmtFecha(t.fecha)}`,
        ``,
        `### Cliente`,
        `- Nombre: ${t.cliente || '—'}`,
        `- Cedula: ${t.cedula_cliente || '—'}`,
        `- Telefono: ${t.telefono_cliente || '—'}`,
        `- Email: ${t.email_cliente || '—'}`,
        ``,
        `### Vehiculo`,
        `- Placa: ${t.placa || '—'}`,
        `- Marca/Modelo: ${t.marca || '—'} ${t.modelo || '—'}`,
        `- Ano: ${t.ano || '—'}`,
        `- Km: ${t.kilometraje || '—'}`,
        ``,
        `### Items`,
        itemsText,
        ``,
        `### Totales`,
        `- Subtotal: ${fmtCOP(t.subtotal_sin_iva)}`,
        `- IVA: ${fmtCOP(t.total_iva)}`,
        `- **Total: ${fmtCOP(t.total)}**`,
        `- Pagado: ${t.pagado ? 'Si' : 'No'} ${t.metodo_pago ? `(${t.metodo_pago})` : ''}`,
        ``,
        `### Observaciones`,
        t.observaciones || '(ninguna)',
      ].join('\n'),
    }],
  }
})

// ═══════════════════════════════════════
// TOOL: buscar_clientes — Buscar clientes
// ═══════════════════════════════════════
server.tool('buscar_clientes', 'Buscar clientes por cedula, nombre o telefono', {
  termino: z.string().describe('Cedula, nombre o telefono del cliente'),
}, async ({ termino }) => {
  const clientes = await supabase('clientes', { query: 'select=*&limit=1000' })
  const tLower = termino.trim().toLowerCase()

  const filtrados = clientes.filter(c =>
    (c.cedula || '').toLowerCase().includes(tLower) ||
    (c.nombre || '').toLowerCase().includes(tLower) ||
    (c.telefono1 || '').includes(termino.trim()) ||
    (c.identificacion || '').includes(termino.trim())
  )

  if (filtrados.length === 0) {
    return { content: [{ type: 'text', text: `No se encontraron clientes para "${termino}".` }] }
  }

  const lineas = filtrados.slice(0, 15).map(c =>
    `- **${c.nombre || '—'}** | CC: ${c.cedula || c.identificacion || '—'} | Tel: ${c.telefono1 || '—'} | Email: ${c.email || '—'}`
  )

  return {
    content: [{
      type: 'text',
      text: `## Clientes encontrados (${filtrados.length})\n\n${lineas.join('\n')}`,
    }],
  }
})

// ═══════════════════════════════════════
// TOOL: cotizaciones — Listar cotizaciones
// ═══════════════════════════════════════
server.tool('listar_cotizaciones', 'Ver cotizaciones recientes o filtrar por estado', {
  estado: z.string().optional().describe('Filtrar por estado: Pendiente, Aprobada, Rechazada (o dejar vacio para todas)'),
}, async ({ estado }) => {
  let query = 'select=*&order=fecha.desc&limit=50'
  if (estado) query += `&estado=eq.${estado}`
  const cotizaciones = await supabase('cotizaciones', { query })

  if (cotizaciones.length === 0) {
    return { content: [{ type: 'text', text: estado ? `No hay cotizaciones con estado "${estado}".` : 'No hay cotizaciones.' }] }
  }

  const total = cotizaciones.reduce((s, c) => s + (parseFloat(c.total) || 0), 0)
  const lineas = cotizaciones.slice(0, 20).map(c =>
    `- **${c.id}** | ${c.cliente || '—'} | ${c.placa || '—'} | ${c.estado} | ${fmtCOP(c.total)} | ${fmtFecha(c.fecha)}`
  )

  return {
    content: [{
      type: 'text',
      text: [
        `## Cotizaciones${estado ? ` (${estado})` : ''} — ${cotizaciones.length} resultados`,
        `**Valor total:** ${fmtCOP(total)}`,
        ``,
        lineas.join('\n'),
      ].join('\n'),
    }],
  }
})

// ═══════════════════════════════════════
// TOOL: stats_ingresos — Estadisticas
// ═══════════════════════════════════════
server.tool('stats_ingresos', 'Estadisticas de ingresos por periodo', {
  periodo: z.string().optional().describe('Periodo: "hoy", "semana", "mes", "anio" (default: mes)'),
}, async ({ periodo = 'mes' }) => {
  const trabajos = await supabase('trabajos', { query: 'select=fecha,total,estado,placa,cliente&order=fecha.desc&limit=2000' })
  const entregados = trabajos.filter(t => t.estado === 'Entregado')

  const ahora = new Date()
  let desde
  switch (periodo) {
    case 'hoy': desde = ahora.toISOString().slice(0, 10); break
    case 'semana': {
      const d = new Date(ahora)
      d.setDate(d.getDate() - 7)
      desde = d.toISOString().slice(0, 10)
      break
    }
    case 'anio': desde = `${ahora.getFullYear()}-01-01`; break
    default: desde = ahora.toISOString().slice(0, 7) // mes
  }

  const enPeriodo = entregados.filter(t => (t.fecha || '') >= desde)
  const totalIngresos = enPeriodo.reduce((s, t) => s + (parseFloat(t.total) || 0), 0)
  const promedio = enPeriodo.length > 0 ? totalIngresos / enPeriodo.length : 0

  return {
    content: [{
      type: 'text',
      text: [
        `## Ingresos — ${periodo}`,
        `**Desde:** ${desde}`,
        ``,
        `| Metrica | Valor |`,
        `|---------|-------|`,
        `| Trabajos entregados | ${enPeriodo.length} |`,
        `| Total ingresos | ${fmtCOP(totalIngresos)} |`,
        `| Promedio por trabajo | ${fmtCOP(promedio)} |`,
        `| Total trabajos (todos los estados) | ${trabajos.length} |`,
      ].join('\n'),
    }],
  }
})

// ═══════════════════════════════════════
// TOOL: vehiculos — Buscar vehiculos
// ═══════════════════════════════════════
server.tool('buscar_vehiculos', 'Buscar vehiculos por placa', {
  placa: z.string().describe('Placa del vehiculo (completa o parcial)'),
}, async ({ placa }) => {
  const vehiculos = await supabase('vehiculos', { query: 'select=*&limit=500' })
  const pLower = placa.trim().toLowerCase()
  const filtrados = vehiculos.filter(v => (v.placa || '').toLowerCase().includes(pLower))

  if (filtrados.length === 0) {
    return { content: [{ type: 'text', text: `No se encontro vehiculo con placa "${placa}".` }] }
  }

  const lineas = filtrados.map(v => {
    const historial = typeof v.historial === 'string' ? JSON.parse(v.historial) : (v.historial || [])
    return `- **${v.placa}** | ${v.marca || '—'} ${v.modelo || '—'} ${v.ano || ''} | Propietario CC: ${v.cedula_propietario || '—'} | Visitas: ${historial.length}`
  })

  return {
    content: [{ type: 'text', text: `## Vehiculos encontrados\n\n${lineas.join('\n')}` }],
  }
})

// ═══════════════════════════════════════
// TOOL: consulta_sql — Consulta libre
// ═══════════════════════════════════════
server.tool('consultar_tabla', 'Consultar datos de cualquier tabla del taller', {
  tabla: z.enum(TABLES).describe('Tabla a consultar'),
  filtro: z.string().optional().describe('Filtro PostgREST, ej: "estado=eq.Pendiente" o "placa=eq.ABC123"'),
  limite: z.number().optional().describe('Cantidad maxima de registros (default: 20)'),
}, async ({ tabla, filtro, limite = 20 }) => {
  let query = `select=*&order=fecha.desc&limit=${limite}`
  if (filtro) query += `&${filtro}`
  const data = await supabase(tabla, { query })

  return {
    content: [{
      type: 'text',
      text: `## ${tabla} (${data.length} registros)\n\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 8000)}\n\`\`\``,
    }],
  }
})

// ── Iniciar servidor ──
const transport = new StdioServerTransport()
await server.connect(transport)
