// MCP HTTP endpoint para el Taller (Supabase) — montado en Vercel.
// URL final: https://<dominio>/mcp/taller  (ver vercel.json rewrites)
//
// Variables de entorno requeridas en Vercel:
//   MCP_TOKEN          - Bearer token para autenticar a claude.ai
//   MCP_SUPABASE_URL   - URL del proyecto Supabase del taller (con prefijo MCP_
//                        para evitar conflicto con la integracion de Supabase en Vercel)
//   SUPABASE_KEY       - Anon key del proyecto Supabase del taller

import { handleMcp } from '../_mcp/shared.js'

const SUPABASE_URL = process.env.MCP_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''

const TABLES = [
  'trabajos', 'cotizaciones', 'clientes', 'vehiculos', 'inspecciones',
  'movimientos_tecnicos', 'liquidacion_historial', 'liquidados', 'trabajos_compartidos',
]

async function supabase(table, { method = 'GET', query = '', body = null, upsert = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL/SUPABASE_KEY no configurados en el servidor')
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
  const r = await fetch(url, opts)
  const text = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
}
function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

const tools = [
  {
    name: 'dashboard',
    description: 'Resumen general del taller: trabajos activos, ingresos, pendientes',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
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
      return [
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
        listos.length > 0
          ? `### Listos para entregar:\n${listos.map(t => `- **${t.placa}** — ${t.cliente} — ${fmtCOP(t.total)} (${t.ot_codigo || t.id})`).join('\n')}`
          : '✅ No hay vehiculos listos para entregar.',
      ].join('\n')
    },
  },
  {
    name: 'buscar_trabajos',
    description: 'Buscar ordenes de trabajo por placa, cliente, estado o ID',
    inputSchema: {
      type: 'object',
      properties: { termino: { type: 'string', description: 'Placa, cliente, OT codigo o estado' } },
      required: ['termino'],
    },
    handler: async ({ termino }) => {
      const t = String(termino || '').trim()
      const trabajos = await supabase('trabajos', { query: 'select=*&order=fecha.desc&limit=500' })
      const tLow = t.toLowerCase()
      const filtrados = trabajos.filter(tr =>
        (tr.placa || '').toLowerCase().includes(tLow) ||
        (tr.cliente || '').toLowerCase().includes(tLow) ||
        (tr.ot_codigo || '').toLowerCase().includes(tLow) ||
        (tr.id || '').toLowerCase().includes(tLow) ||
        (tr.estado || '').toLowerCase() === tLow ||
        (tr.cedula_cliente || '').includes(t))
      if (filtrados.length === 0) return `No se encontraron trabajos para "${t}".`
      const lineas = filtrados.slice(0, 20).map(tr =>
        `- **${tr.ot_codigo || tr.id}** | ${tr.placa || '—'} | ${tr.cliente || '—'} | ${tr.estado} | ${fmtCOP(tr.total)} | ${fmtFecha(tr.fecha)}`)
      return `## Trabajos encontrados (${filtrados.length})\n\n${lineas.join('\n')}${filtrados.length > 20 ? `\n\n... y ${filtrados.length - 20} mas` : ''}`
    },
  },
  {
    name: 'detalle_trabajo',
    description: 'Ver detalle completo de una orden de trabajo',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID o codigo OT' } },
      required: ['id'],
    },
    handler: async ({ id }) => {
      const trabajos = await supabase('trabajos', { query: `select=*&or=(id.eq.${id},ot_codigo.eq.${id})` })
      const t = trabajos[0]
      if (!t) return `No se encontro trabajo con ID "${id}".`
      const items = typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || [])
      const itemsText = items.length > 0
        ? items.map((i, idx) => `  ${idx + 1}. ${i.nombre || '—'} x${i.cantidad || 1} — ${fmtCOP(i.precio || 0)}`).join('\n')
        : '  (sin items)'
      return [
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
      ].join('\n')
    },
  },
  {
    name: 'buscar_clientes',
    description: 'Buscar clientes por cedula, nombre o telefono',
    inputSchema: {
      type: 'object',
      properties: { termino: { type: 'string' } },
      required: ['termino'],
    },
    handler: async ({ termino }) => {
      const clientes = await supabase('clientes', { query: 'select=*&limit=1000' })
      const tLow = String(termino || '').trim().toLowerCase()
      const filtrados = clientes.filter(c =>
        (c.cedula || '').toLowerCase().includes(tLow) ||
        (c.nombre || '').toLowerCase().includes(tLow) ||
        (c.telefono1 || '').includes(termino.trim()) ||
        (c.identificacion || '').includes(termino.trim()))
      if (filtrados.length === 0) return `No se encontraron clientes para "${termino}".`
      const lineas = filtrados.slice(0, 15).map(c =>
        `- **${c.nombre || '—'}** | CC: ${c.cedula || c.identificacion || '—'} | Tel: ${c.telefono1 || '—'} | Email: ${c.email || '—'}`)
      return `## Clientes encontrados (${filtrados.length})\n\n${lineas.join('\n')}`
    },
  },
  {
    name: 'listar_cotizaciones',
    description: 'Ver cotizaciones recientes o filtrar por estado',
    inputSchema: {
      type: 'object',
      properties: { estado: { type: 'string', description: 'Pendiente, Aprobada, Rechazada' } },
    },
    handler: async ({ estado }) => {
      let query = 'select=*&order=fecha.desc&limit=50'
      if (estado) query += `&estado=eq.${estado}`
      const cotizaciones = await supabase('cotizaciones', { query })
      if (cotizaciones.length === 0) return estado ? `No hay cotizaciones con estado "${estado}".` : 'No hay cotizaciones.'
      const total = cotizaciones.reduce((s, c) => s + (parseFloat(c.total) || 0), 0)
      const lineas = cotizaciones.slice(0, 20).map(c =>
        `- **${c.id}** | ${c.cliente || '—'} | ${c.placa || '—'} | ${c.estado} | ${fmtCOP(c.total)} | ${fmtFecha(c.fecha)}`)
      return [`## Cotizaciones${estado ? ` (${estado})` : ''} — ${cotizaciones.length} resultados`, `**Valor total:** ${fmtCOP(total)}`, '', lineas.join('\n')].join('\n')
    },
  },
  {
    name: 'stats_ingresos',
    description: 'Estadisticas de ingresos por periodo (hoy/semana/mes/anio)',
    inputSchema: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoy', 'semana', 'mes', 'anio'], default: 'mes' } },
    },
    handler: async ({ periodo = 'mes' }) => {
      const trabajos = await supabase('trabajos', { query: 'select=fecha,total,estado,placa,cliente&order=fecha.desc&limit=2000' })
      const entregados = trabajos.filter(t => t.estado === 'Entregado')
      const ahora = new Date()
      let desde
      switch (periodo) {
        case 'hoy': desde = ahora.toISOString().slice(0, 10); break
        case 'semana': { const d = new Date(ahora); d.setDate(d.getDate() - 7); desde = d.toISOString().slice(0, 10); break }
        case 'anio': desde = `${ahora.getFullYear()}-01-01`; break
        default: desde = ahora.toISOString().slice(0, 7)
      }
      const enPeriodo = entregados.filter(t => (t.fecha || '') >= desde)
      const totalIngresos = enPeriodo.reduce((s, t) => s + (parseFloat(t.total) || 0), 0)
      const promedio = enPeriodo.length > 0 ? totalIngresos / enPeriodo.length : 0
      return [
        `## Ingresos — ${periodo}`,
        `**Desde:** ${desde}`,
        ``,
        `| Metrica | Valor |`,
        `|---------|-------|`,
        `| Trabajos entregados | ${enPeriodo.length} |`,
        `| Total ingresos | ${fmtCOP(totalIngresos)} |`,
        `| Promedio por trabajo | ${fmtCOP(promedio)} |`,
        `| Total trabajos (todos los estados) | ${trabajos.length} |`,
      ].join('\n')
    },
  },
  {
    name: 'buscar_vehiculos',
    description: 'Buscar vehiculos por placa',
    inputSchema: {
      type: 'object',
      properties: { placa: { type: 'string' } },
      required: ['placa'],
    },
    handler: async ({ placa }) => {
      const vehiculos = await supabase('vehiculos', { query: 'select=*&limit=500' })
      const pLow = String(placa || '').trim().toLowerCase()
      const filtrados = vehiculos.filter(v => (v.placa || '').toLowerCase().includes(pLow))
      if (filtrados.length === 0) return `No se encontro vehiculo con placa "${placa}".`
      const lineas = filtrados.map(v => {
        const hist = typeof v.historial === 'string' ? JSON.parse(v.historial) : (v.historial || [])
        return `- **${v.placa}** | ${v.marca || '—'} ${v.modelo || '—'} ${v.ano || ''} | Propietario CC: ${v.cedula_propietario || '—'} | Visitas: ${hist.length}`
      })
      return `## Vehiculos encontrados\n\n${lineas.join('\n')}`
    },
  },
  {
    name: 'consultar_tabla',
    description: 'Consultar datos de cualquier tabla del taller con filtro PostgREST',
    inputSchema: {
      type: 'object',
      properties: {
        tabla: { type: 'string', enum: TABLES },
        filtro: { type: 'string', description: 'Filtro PostgREST, ej: "estado=eq.Pendiente"' },
        limite: { type: 'integer', default: 20 },
      },
      required: ['tabla'],
    },
    handler: async ({ tabla, filtro, limite = 20 }) => {
      if (!TABLES.includes(tabla)) return `❌ Tabla "${tabla}" no permitida.`
      let query = `select=*&order=fecha.desc&limit=${limite}`
      if (filtro) query += `&${filtro}`
      const data = await supabase(tabla, { query })
      return `## ${tabla} (${data.length} registros)\n\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 8000)}\n\`\`\``
    },
  },
]

const mcpServer = { name: 'Taller MultiAS (HTTP)', version: '1.0.0', tools }

export default async function handler(req, res) {
  return handleMcp(req, res, mcpServer)
}
