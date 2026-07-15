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

// Cuentti comparte proyecto de Vercel con el taller, asi que comparte estas env.
// Se usa SOLO como fallback de lectura en buscar_clientes: muchos clientes se
// crean directo en Cuentti al facturar y nunca pasan por la base del taller.
const CUENTTI = {
  baseUrl: process.env.CUENTTI_BASE_URL || 'https://app.cuenti.com',
  token: process.env.CUENTTI_TOKEN || '',
  companyId: process.env.CUENTTI_COMPANY_ID || '11464',
  branchId: process.env.CUENTTI_BRANCH_ID || '1',
  employeeId: process.env.CUENTTI_EMPLOYEE_ID || '2',
  gtm: process.env.CUENTTI_GTM || 'GMT-0500',
}

// Busca un cliente en Cuentti por cedula/NIT. Devuelve datos minimos o null.
// Falla en silencio (null): es un fallback, nunca debe romper la busqueda del taller.
async function buscarClienteEnCuentti(cedula) {
  const ced = String(cedula || '').trim()
  if (!CUENTTI.token || !ced) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    const r = await fetch(
      `${CUENTTI.baseUrl}/jServerj4ErpPro/api/token/consultarClienteIdentificacion/${encodeURIComponent(ced)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CUENTTI.token}`,
          'x-auth-token-empresa': CUENTTI.companyId,
          'x-id-sucursal': CUENTTI.branchId,
          'x-id-empleado': CUENTTI.employeeId,
          'X-Auth-Token-id-usuario': CUENTTI.employeeId,
          'X-Auth-Token-usuario': CUENTTI.employeeId,
          'x-gtm': CUENTTI.gtm,
          usuario: CUENTTI.employeeId,
          Accept: 'application/json',
        },
        signal: controller.signal,
      },
    )
    clearTimeout(timer)
    if (!r.ok) return null
    let data = null
    try { data = JSON.parse(await r.text()) } catch { return null }
    if (!data || data.message || data.type === 0) return null
    const items = Array.isArray(data) ? data : (data.data ? data.data : [data])
    const c = items.filter(x => x && Object.keys(x).length > 0 && !x.message)[0]
    if (!c) return null
    const nombre = c.nombre_cliente
      || [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')
      || '(sin nombre)'
    return {
      idCliente: c.id_cliente || c.id || null,
      identificacion: c.identificacion || ced,
      nombre,
      telefono: c.telefono1 || c.telefono3 || c.telefono || '',
      email: c.email1 || c.email2 || c.email || '',
    }
  } catch {
    return null
  }
}

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

// ID unico — mismo formato que la app (src/utils/helpers.js)
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// Calcula subtotal/IVA/total de una lista de items. El precio de cada item
// INCLUYE IVA (misma convencion que Cotizaciones.jsx y buildFacturaPayload).
function calcularTotales(items) {
  let subtotal = 0, iva = 0, total = 0
  const norm = (items || []).map(i => {
    const precio = parseFloat(i.precio) || 0
    const cant = parseInt(i.cantidad, 10) || 1
    const ivaPct = parseFloat(i.iva ?? 19) || 0
    const lineaTotal = precio * cant
    if (ivaPct > 0) { const base = lineaTotal / (1 + ivaPct / 100); subtotal += base; iva += lineaTotal - base }
    else { subtotal += lineaTotal }
    total += lineaTotal
    return { id: i.id || uid(), nombre: i.nombre || '', precio, cantidad: cant, iva: ivaPct, sku: i.sku || i.codigo || '', esServicio: !!i.esServicio }
  })
  return { items: norm, subtotal: Math.round(subtotal), iva: Math.round(iva), total: Math.round(total) }
}

// Siguiente codigo OT segun el maximo existente en Supabase (fuente de verdad
// multi-dispositivo). La app usa un contador local; aqui derivamos del max real.
async function nextOtCodigo() {
  const rows = await supabase('trabajos', { query: 'select=ot_codigo&limit=2000' })
  let max = 0
  for (const r of rows) {
    const m = String(r.ot_codigo || '').match(/OT-(\d+)/i)
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n }
  }
  return `OT-${String(max + 1).padStart(4, '0')}`
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
    description: 'Buscar clientes por cedula, nombre o telefono. Si el cliente no esta en la base del taller y buscas por cedula/NIT, tambien consulta Cuentti (muchos clientes se crean directo alla al facturar).',
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
      if (filtrados.length > 0) {
        const lineas = filtrados.slice(0, 15).map(c =>
          `- **${c.nombre || '—'}** | CC: ${c.cedula || c.identificacion || '—'} | Tel: ${c.telefono1 || '—'} | Email: ${c.email || '—'}`)
        return `## Clientes encontrados (${filtrados.length})\n\n${lineas.join('\n')}`
      }
      // No esta en el taller. Si el termino parece cedula/NIT (solo digitos),
      // preguntarle a Cuentti: muchos clientes viven solo alla.
      const term = String(termino || '').trim()
      if (/^\d{5,}$/.test(term)) {
        const cc = await buscarClienteEnCuentti(term)
        if (cc) {
          return [
            `No está en la base del taller, pero **sí existe en Cuentti**:`,
            ``,
            `- **${cc.nombre}** | CC/NIT: ${cc.identificacion} | Tel: ${cc.telefono || '—'} | Email: ${cc.email || '—'} | id_cliente Cuentti: ${cc.idCliente || '—'}`,
            ``,
            `Puedes crear la cotización o el trabajo con estos datos; queda registrado en el taller al hacerlo.`,
          ].join('\n')
        }
        return `No se encontró "${termino}" ni en el taller ni en Cuentti.`
      }
      return `No se encontraron clientes para "${termino}" en el taller. Si es un cliente que solo está en Cuentti, búscalo por su cédula/NIT para revisar allá.`
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
  {
    name: 'crear_cotizacion',
    description: 'Crea una cotizacion nueva en el taller (Supabase). El precio de cada item INCLUYE IVA; el subtotal/IVA/total se calculan automaticamente. Por defecto hace dry-run (no guarda); pasa confirm:true para guardar de verdad.',
    inputSchema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre del cliente' },
        cedula: { type: 'string', default: '' },
        telefono: { type: 'string', default: '' },
        placa: { type: 'string', default: '' },
        marca: { type: 'string', default: '' },
        modelo: { type: 'string', default: '' },
        ano: { type: 'integer' },
        cilindraje: { type: 'string', default: '' },
        items: {
          type: 'array',
          description: 'Items a cotizar. precio INCLUYE IVA; iva en porcentaje (ej 19).',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              precio: { type: 'number', description: 'Precio unitario con IVA incluido' },
              cantidad: { type: 'number', default: 1 },
              iva: { type: 'number', default: 19 },
            },
            required: ['nombre', 'precio'],
          },
        },
        observaciones: { type: 'string', default: '' },
        validezDias: { type: 'integer', default: 15 },
        confirm: { type: 'boolean', description: 'true = guardar; false (default) = dry-run' },
      },
      required: ['cliente', 'items'],
    },
    handler: async ({ cliente, cedula = '', telefono = '', placa = '', marca = '', modelo = '',
                     ano, cilindraje = '', items = [], observaciones = '', validezDias = 15, confirm = false }) => {
      if (!cliente || !Array.isArray(items) || items.length === 0) return '❌ Se requiere cliente e items (al menos uno).'
      const t = calcularTotales(items)
      const fecha = new Date().toISOString()
      const resumen = t.items.map((i, idx) => `  ${idx + 1}. ${i.nombre} x${i.cantidad} — ${fmtCOP(i.precio * i.cantidad)} (IVA ${i.iva}%)`).join('\n')

      if (!confirm) {
        return [
          `## Dry-run: cotizacion (NO guardada)`,
          `Pasa **confirm:true** para guardar.`, ``,
          `**ID:** COT-#### (el número se asigna al guardar)`,
          `**Cliente:** ${cliente}${cedula ? ` (CC ${cedula})` : ''}`,
          `**Vehiculo:** ${[placa, marca, modelo, ano].filter(Boolean).join(' ') || '—'}`,
          ``, `### Items`, resumen, ``,
          `Subtotal: ${fmtCOP(t.subtotal)} · IVA: ${fmtCOP(t.iva)} · **Total: ${fmtCOP(t.total)}**`,
          `Validez: ${validezDias} dias`,
        ].join('\n')
      }

      // Consecutivo secuencial atomico (secuencia Postgres via RPC next_cotizacion_num).
      // Solo al guardar de verdad — el dry-run no gasta numeros. Si la secuencia aun
      // no existe (o la RPC falla), cae al formato viejo COT-<base36>: nunca rompe.
      let id
      try {
        const seqRes = await supabase('rpc/next_cotizacion_num', { method: 'POST', body: {} })
        let num = Array.isArray(seqRes) ? seqRes[0] : seqRes
        if (num && typeof num === 'object') num = Object.values(num)[0]
        num = parseInt(num, 10)
        if (Number.isFinite(num) && num > 0) id = `COT-${String(num).padStart(4, '0')}`
      } catch { /* cae al fallback de abajo */ }
      if (!id) id = `COT-${uid()}`

      const row = {
        id, fecha, cedula, cliente, telefono_cliente: telefono,
        placa, marca, modelo, ano: ano || null, cilindraje,
        items: JSON.stringify(t.items),
        subtotal: t.subtotal, iva: t.iva, total: t.total,
        observaciones, validez_dias: validezDias, estado: 'Pendiente',
      }
      await supabase('cotizaciones', { method: 'POST', body: row, upsert: true })

      // Dar de alta al cliente en el taller si aun no existe (por cedula), para que
      // deje de ser "fantasma" y aparezca en la lista de Clientes. Se enriquece con
      // los datos reales de Cuentti (nombre/telefono/email). Si algo falla, NO se
      // rompe la cotizacion (ya quedo guardada).
      let clienteMsg = ''
      const ced = String(cedula || '').trim()
      if (ced) {
        try {
          const existentes = await supabase('clientes', { query: `select=id&or=(cedula.eq.${ced},identificacion.eq.${ced})&limit=1` })
          if (!existentes || existentes.length === 0) {
            const cc = /^\d{5,}$/.test(ced) ? await buscarClienteEnCuentti(ced) : null
            const nombreFinal = (cc?.nombre || cliente || '').trim()
            const nuevo = {
              id: `CL-${Date.now()}`,
              identificacion: ced,
              cedula: ced,
              cuentti_id: cc?.idCliente || null,
              nombre: nombreFinal,
              telefono1: cc?.telefono || telefono || '',
              email: cc?.email || '',
              vehiculos: JSON.stringify(placa ? [String(placa).trim().toUpperCase()] : []),
              fecha_creacion: new Date().toISOString(),
              total_visitas: 0,
              total_gastado: 0,
            }
            await supabase('clientes', { method: 'POST', body: nuevo, upsert: true })
            clienteMsg = `\n👤 Cliente **${nombreFinal}** dado de alta en el taller (CC ${ced}${cc ? ', datos traídos de Cuentti' : ''}).`
          }
        } catch { /* el alta del cliente no debe tumbar la cotizacion */ }
      }

      return [`## ✅ Cotizacion creada`, ``, `**${id}** — ${cliente}`, `**Total:** ${fmtCOP(t.total)}`, `Estado: Pendiente · Validez ${validezDias} dias${clienteMsg}`].join('\n')
    },
  },
  {
    name: 'actualizar_cotizacion',
    description: 'Cambia el estado de una cotizacion (Pendiente, Aprobada, Rechazada, Facturada) y/o sus observaciones. Pasa confirm:true para aplicar.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de la cotizacion (COT-...)' },
        estado: { type: 'string', enum: ['Pendiente', 'Aprobada', 'Rechazada', 'Facturada'] },
        observaciones: { type: 'string' },
        confirm: { type: 'boolean', description: 'true = aplicar; false (default) = dry-run' },
      },
      required: ['id'],
    },
    handler: async ({ id, estado, observaciones, confirm = false }) => {
      const found = await supabase('cotizaciones', { query: `select=*&id=eq.${encodeURIComponent(id)}` })
      const cot = found[0]
      if (!cot) return `❌ No existe la cotizacion "${id}".`
      const cambios = {}
      if (estado) cambios.estado = estado
      if (observaciones !== undefined) cambios.observaciones = observaciones
      if (Object.keys(cambios).length === 0) return '❌ Nada que actualizar (pasa estado u observaciones).'
      if (!confirm) {
        return [
          `## Dry-run: actualizar ${id}`,
          estado ? `Estado: **${cot.estado}** → **${estado}**` : `Estado: ${cot.estado} (sin cambio)`,
          observaciones !== undefined ? `Observaciones → ${observaciones}` : '',
          ``, `Pasa **confirm:true** para aplicar.`,
        ].filter(Boolean).join('\n')
      }
      await supabase('cotizaciones', { method: 'PATCH', query: `id=eq.${encodeURIComponent(id)}`, body: cambios })
      return `## ✅ Cotizacion ${id} actualizada\n${estado ? `Estado: ${estado}` : ''}`.trim()
    },
  },
  {
    name: 'crear_trabajo',
    description: 'Crea una orden de trabajo (OT) en el taller. Puede crearse desde cero o a partir de una cotizacion existente (pasa desdeCotizacion con su ID COT-...). Genera el codigo OT automaticamente. El precio de cada item INCLUYE IVA. Por defecto dry-run; confirm:true para guardar. Si viene de una cotizacion, la marca como Aprobada.',
    inputSchema: {
      type: 'object',
      properties: {
        desdeCotizacion: { type: 'string', description: 'ID de cotizacion (COT-...) para copiar cliente, vehiculo e items.' },
        cliente: { type: 'string' },
        cedula: { type: 'string', default: '' },
        telefono: { type: 'string', default: '' },
        placa: { type: 'string', default: '' },
        marca: { type: 'string', default: '' },
        modelo: { type: 'string', default: '' },
        ano: { type: 'integer' },
        kilometraje: { type: 'string', default: '' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { nombre: { type: 'string' }, precio: { type: 'number' }, cantidad: { type: 'number' }, iva: { type: 'number' } },
            required: ['nombre', 'precio'],
          },
        },
        estado: { type: 'string', default: 'Pendiente' },
        observaciones: { type: 'string', default: '' },
        confirm: { type: 'boolean', description: 'true = guardar; false (default) = dry-run' },
      },
    },
    handler: async (a) => {
      let { desdeCotizacion, cliente, cedula = '', telefono = '', placa = '', marca = '', modelo = '',
            ano, kilometraje = '', items = [], estado = 'Pendiente', observaciones = '', confirm = false } = a
      let origenCot = null
      if (desdeCotizacion) {
        const found = await supabase('cotizaciones', { query: `select=*&id=eq.${encodeURIComponent(desdeCotizacion)}` })
        const cot = found[0]
        if (!cot) return `❌ No existe la cotizacion "${desdeCotizacion}".`
        const cotItems = typeof cot.items === 'string' ? JSON.parse(cot.items) : (cot.items || [])
        cliente = cliente || cot.cliente; cedula = cedula || cot.cedula; telefono = telefono || cot.telefono_cliente
        placa = placa || cot.placa; marca = marca || cot.marca; modelo = modelo || cot.modelo; ano = ano || cot.ano
        if (!items || items.length === 0) items = cotItems
        origenCot = desdeCotizacion
      }
      if (!cliente) return '❌ Se requiere cliente (o desdeCotizacion).'
      const t = calcularTotales(items)
      const otCodigo = await nextOtCodigo()
      const id = uid()
      const fecha = new Date().toISOString()

      if (!confirm) {
        return [
          `## Dry-run: OT ${otCodigo} (NO guardada)`,
          `Pasa **confirm:true** para guardar.`, ``,
          `**Cliente:** ${cliente}${cedula ? ` (CC ${cedula})` : ''}`,
          `**Vehiculo:** ${[placa, marca, modelo, ano].filter(Boolean).join(' ') || '—'}`,
          `**Items:** ${t.items.length} · **Total:** ${fmtCOP(t.total)}`,
          `**Estado:** ${estado}`,
          origenCot ? `**Origen:** cotizacion ${origenCot} (se marcara Aprobada)` : '',
        ].filter(Boolean).join('\n')
      }

      const row = {
        id, plate: placa || null, fecha,
        cedula_cliente: cedula, cliente, telefono_cliente: telefono,
        placa, marca, modelo, ano: ano || null, kilometraje: kilometraje || null,
        estado, observaciones,
        items: JSON.stringify(t.items),
        subtotal_sin_iva: t.subtotal, total_iva: t.iva, total: t.total,
        pagado: false, ot_codigo: otCodigo,
      }
      await supabase('trabajos', { method: 'POST', body: row, upsert: true })
      if (origenCot) {
        try { await supabase('cotizaciones', { method: 'PATCH', query: `id=eq.${encodeURIComponent(origenCot)}`, body: { estado: 'Aprobada' } }) } catch { /* no-fatal */ }
      }
      return [
        `## ✅ OT creada: ${otCodigo}`, ``,
        `**Cliente:** ${cliente}`, `**Total:** ${fmtCOP(t.total)}`, `**Estado:** ${estado}`,
        origenCot ? `Cotizacion ${origenCot} marcada como Aprobada.` : '',
      ].filter(Boolean).join('\n')
    },
  },
]

const mcpServer = { name: 'Taller MultiAS (HTTP)', version: '1.0.0', tools }

export default async function handler(req, res) {
  return handleMcp(req, res, mcpServer)
}
