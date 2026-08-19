import { useState, useMemo, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate, cantidadItem } from '../utils/helpers'
import { COMISION, ESTADOS } from '../utils/constants'
import { useTecnicos } from '../services/tecnicos'
import { manoObraBase, esServicioItem } from '../utils/comision'
import { drawHeader, drawSectionHeader, drawFooter, tableStylesItems, tableStylesMuted, PDF_LAYOUT, PDF_COLORS } from '../utils/pdfTheme'
import { Button, Badge } from '../components/ui'
import { useInventario } from '../hooks/useInventario'

// Fecha LOCAL en formato YYYY-MM-DD (no UTC). Con toISOString(), en la tarde/noche
// de Colombia (UTC-5) la fecha salta al día siguiente y el preset "Hoy" sale vacío.
const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Parsea la fecha de una OT respetando la zona local. Los registros date-only
// (YYYY-MM-DD, legado) se anclan a mediodía local: con new Date('2026-07-15') el
// navegador asume UTC y en UTC-5 el trabajo caería el día ANTERIOR, sacándolo del
// rango. Los registros nuevos ya vienen con hora (T12:00) desde Recepción/Trabajos.
const parseFechaLocal = (f) => {
  if (!f) return new Date(NaN)
  const s = String(f)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00')
  return new Date(s)
}

// ¿Es una entidad interna del mostrador (venta de repuestos suelta, cuantías
// menores) y no un cliente/vehículo real? Se marca en los rankings para que el
// reporte no presente "SERVICIO" como el vehículo más frecuente.
const esMostradorPlaca = (placa) => /^servicio$/i.test((placa || '').toString().trim())
const esMostradorCliente = (nombre) => /cuant[ií]as?\s*menores|mostrador|consumidor\s*final|varios/i.test((nombre || '').toString())

// Señal defensiva: un "repuesto" cuyo nombre suena a mano de obra probablemente
// está mal marcado (esServicio no seteado en la OT) e infla el ranking de
// repuestos y el split repuestos/M.O. No se excluye ni se corrige el dato: solo
// se marca "¿servicio?" para que Juan lo revise en la fuente.
// Solo raíces que casi nunca aparecen en el nombre de un repuesto físico. Antes
// incluía computador/pintura/soldadura/lavad/etc. y marcaba falsos positivos
// (ECU "computadora", pintura como material, "bomba lavaparabrisas").
const pareceServicio = (nombre) => /mano\s*de\s*obra|reparaci|servicio|diagn[oó]stic|revisi[oó]n|calibraci|alineaci|balanceo|sincroniz|manten/i.test((nombre || '').toString())

const MAX_TRABAJOS = 500 // debe coincidir con el limit de fetchTrabajos() en services/supabase.js

export default function Reportes({ trabajos, loading = false, notify }) {
  const tecnicos = useTecnicos()

  const [rango, setRango] = useState(() => {
    const now = new Date()
    const inicio = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
      desde: ymdLocal(inicio),
      hasta: ymdLocal(now),
    }
  })
  // Preset activo (para resaltar el botón). null = rango personalizado.
  const [presetActivo, setPresetActivo] = useState('mes')
  const [verRango, setVerRango] = useState(false) // el rango DESDE/HASTA vive tras su pastilla

  // Tarjetas plegables: cada sección de detalle se puede recoger para dejar la
  // pantalla en el resumen (KPIs) sin scrollear nueve tarjetas. `colapso[id]===true`
  // = recogida. Vacío = todas abiertas.
  const SECCIONES = ['estado', 'ingresos', 'utilidad', 'margen', 'repuestos', 'rotacion', 'clientes', 'equipo', 'vehiculos']
  const COLAPSO_KEY = 'mda:reportes-colapso'
  // Arranca en modo RESUMEN (detalle recogido) la primera vez, y luego recuerda lo
  // que Juan dejó configurado (persiste en localStorage).
  const [colapso, setColapso] = useState(() => {
    try { const raw = localStorage.getItem(COLAPSO_KEY); if (raw) return JSON.parse(raw) } catch { /* default */ }
    return Object.fromEntries(SECCIONES.map(k => [k, true]))
  })
  useEffect(() => {
    try { localStorage.setItem(COLAPSO_KEY, JSON.stringify(colapso)) } catch { /* quota */ }
  }, [colapso])
  const toggleColapso = (k) => setColapso(c => ({ ...c, [k]: !c[k] }))
  const todasColapsadas = SECCIONES.every(k => colapso[k])
  const toggleTodas = () => {
    const recoger = !todasColapsadas
    setColapso(Object.fromEntries(SECCIONES.map(k => [k, recoger])))
  }
  // Encabezado plegable reutilizable. El <h3> se mantiene como encabezado real
  // (para el esquema del lector de pantalla) y DENTRO va un <button> que hace el
  // disclosure (aria-expanded + teclado nativo Enter/Espacio). El aside (conteo)
  // queda fuera del botón para que no dispare el plegado.
  const cabezal = (id, titulo, aside = null) => (
    <div className="card__h">
      <h3 style={{ margin: 0, flex: 1, minWidth: 0 }}>
        <button type="button" className="rep-toggle" aria-expanded={!colapso[id]} onClick={() => toggleColapso(id)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 0, padding: '12px 4px', margin: '-12px -4px', borderRadius: 8, font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
          <svg className="rep-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: colapso[id] ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0, color: 'var(--text-2)' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {titulo}
        </button>
      </h3>
      {aside && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{aside}</div>}
    </div>
  )
  // Una seccion recogida tiene que poder descartarse sin abrirla: bajo su
  // titulo va una linea que dice QUE hay dentro, no solo su nombre.
  const dentro = (id, texto) => (colapso[id] && texto ? <div className="rep-dentro">{texto}</div> : null)

  // Inventario de Cuentti (mismo cache compartido) para costo y stock de repuestos.
  const { inventario } = useInventario()

  // El rango está invertido si "desde" es posterior a "hasta" (compara strings
  // YYYY-MM-DD, que ordenan cronológicamente). Produce cero resultados y hay que avisarlo.
  const rangoInvalido = rango.desde > rango.hasta

  const filtrados = useMemo(() => {
    if (rangoInvalido) return []
    const desde = new Date(rango.desde + 'T00:00:00')
    const hasta = new Date(rango.hasta + 'T23:59:59')
    return trabajos.filter(t => {
      const d = parseFechaLocal(t.fecha)
      return d >= desde && d <= hasta
    })
  }, [trabajos, rango, rangoInvalido])

  // Aviso de tope: fetchTrabajos limita a 500 OT (orden fecha desc). Si llegamos al
  // tope Y el "desde" pedido es anterior a la OT más antigua que SÍ trajimos, es
  // probable que haya trabajos viejos por fuera y el total esté corto. Se calcula por
  // el rango efectivo (no por el nombre del preset), así también avisa en rangos
  // personalizados amplios (antes solo avisaba en 'todo'/'anio'/'trimestre').
  const fechaMasAntigua = useMemo(() => {
    if (trabajos.length < MAX_TRABAJOS) return null
    let min = null
    for (const t of trabajos) {
      const d = (t.fecha || '').slice(0, 10)
      if (d && (!min || d < min)) min = d
    }
    return min
  }, [trabajos])
  const topeAlcanzado = !rangoInvalido && trabajos.length >= MAX_TRABAJOS && fechaMasAntigua != null && rango.desde < fechaMasAntigua

  const stats = useMemo(() => {
    const completados = filtrados.filter(t => t.estado === ESTADOS.COMPLETADO)
    // Facturado bruto (CON IVA): lo que realmente se cobró al cliente / entró a Cuentti.
    const facturado = completados.reduce((s, t) => s + (t.total || 0), 0)
    // Mano de obra base (SIN IVA) — MISMA regla que Liquidación/Mecánicos. Es el ÚNICO
    // número de "mano de obra" del reporte: sobre esta base se paga la comisión.
    const getMO = manoObraBase
    const moBase = completados.reduce((s, t) => s + getMO(t), 0)
    const comisiones = Math.round(moBase * COMISION.TOTAL)

    // Por técnico — se agrupa por el tecnicoId REAL de las OTs (no iterando la lista
    // de técnicos), así ninguna OT completada se pierde si su técnico ya no está en el
    // equipo. La suma de "trabajos" cuadra con "Completados".
    const tecMap = {}
    completados.forEach(t => {
      const idNum = parseInt(t.tecnicoId)
      const key = Number.isFinite(idNum) ? idNum : 'none'
      if (!tecMap[key]) tecMap[key] = { id: key, cantidad: 0, facturado: 0 }
      tecMap[key].cantidad++
      tecMap[key].facturado += getMO(t)
    })
    const porTecnico = Object.values(tecMap).map(row => {
      if (row.id === 'none') return { ...row, nombre: 'Sin técnico asignado', sinAsignar: true, inactivo: false }
      const tec = tecnicos.find(x => x.id === row.id)
      return {
        ...row,
        nombre: tec ? tec.nombre : `Técnico #${row.id}`,
        inactivo: tec ? tec.activo === false : true, // sin registro = eliminado con historia
      }
    }).sort((a, b) => b.facturado - a.facturado || b.cantidad - a.cantidad)

    // Por estado
    const porEstado = Object.values(ESTADOS).map(estado => ({
      estado,
      cantidad: filtrados.filter(t => t.estado === estado).length,
    }))

    // Top vehiculos (por placa)
    const placaMap = {}
    filtrados.forEach(t => {
      if (!t.placa) return
      if (!placaMap[t.placa]) placaMap[t.placa] = { placa: t.placa, marca: t.marca, modelo: t.modelo, visitas: 0, total: 0, mostrador: esMostradorPlaca(t.placa) }
      placaMap[t.placa].visitas++
      // "Total facturado" = solo OTs completadas (facturadas), igual que Top clientes.
      // Antes sumaba TODAS las OTs y una cancelada inflaba el total del vehículo.
      if (t.estado === ESTADOS.COMPLETADO) placaMap[t.placa].total += t.total || 0
    })
    const topVehiculos = Object.values(placaMap).sort((a, b) => b.visitas - a.visitas || b.total - a.total).slice(0, 10)

    // Desglose de ingresos SIN IVA (repuestos vs mano de obra) + repuestos más vendidos
    const repMap = {}
    completados.forEach(t => {
      (t.items || []).forEach(i => {
        const esServ = esServicioItem(i)
        if (esServ) return
        const cant = cantidadItem(i)
        const ivaPct = parseFloat(i.iva) || 0
        const lineaSinIva = (parseFloat(i.precio) || 0) * cant / (1 + ivaPct / 100)
        if (lineaSinIva <= 0) return
        const key = (i.nombre || i.codigo || 'Sin nombre').toString().trim()
        if (!repMap[key]) repMap[key] = { nombre: key, cantidad: 0, ingresos: 0 }
        repMap[key].cantidad += cant
        repMap[key].ingresos += lineaSinIva
      })
    })
    const topRepuestos = Object.values(repMap)
      .map(r => ({ ...r, ingresos: Math.round(r.ingresos), sospechoso: pareceServicio(r.nombre) }))
      .sort((a, b) => b.ingresos - a.ingresos).slice(0, 10)
    const ticket = completados.length ? Math.round(facturado / completados.length) : 0

    // Top clientes — total facturado + # de OTs en el rango. Dedupe por cédula si
    // existe, si no por nombre normalizado. Cuenta TODAS las OTs del rango (no solo
    // completadas), pero factura solo sobre las completadas para no inflar ingresos.
    const cliMap = {}
    filtrados.forEach(t => {
      const nombre = (t.cliente || '').toString().trim() || 'Sin nombre'
      const key = (t.cedula || '').toString().trim() || nombre.toLowerCase()
      if (!cliMap[key]) cliMap[key] = { nombre, ots: 0, total: 0, mostrador: esMostradorCliente(nombre) }
      cliMap[key].ots++
      if (t.estado === ESTADOS.COMPLETADO) cliMap[key].total += t.total || 0
    })
    const topClientes = Object.values(cliMap).sort((a, b) => b.total - a.total || b.ots - a.ots).slice(0, 10)

    // === Margen de repuestos + rotación (cruza venta con costo/stock de Cuentti) ===
    // El costo es el ACTUAL de Cuentti (no el del momento de la venta): margen
    // aproximado pero real. Solo cuenta repuestos que cruzan con inventario y con
    // costo > 0; `coberturaMargen` dice sobre qué % de la venta se pudo calcular.
    const norm = (s) => (s || '').toString().trim().toLowerCase()
    const invBySku = {}, invByCod = {}, invByNom = {}
    inventario.forEach(p => {
      if (p.esServicio) return
      const rec = { costoBase: parseFloat(p.costoBase) || 0, stock: parseFloat(p.stock) || 0 }
      if (p.sku) invBySku[norm(p.sku)] = rec
      if (p.codigo) invByCod[norm(p.codigo)] = rec
      if (p.nombre) invByNom[norm(p.nombre)] = rec
    })
    const matchInv = (i) =>
      (i.sku && invBySku[norm(i.sku)]) ||
      (i.codigo && invByCod[norm(i.codigo)]) ||
      (i.nombre && invByNom[norm(i.nombre)]) || null

    let repVentaSinIva = 0, repVentaConCosto = 0, repCosto = 0
    const margenMap = {}, rotMap = {}
    completados.forEach(t => {
      (t.items || []).forEach(i => {
        const esServ = esServicioItem(i)
        if (esServ) return
        const cant = cantidadItem(i)
        const ivaPct = parseFloat(i.iva) || 0
        const ventaLinea = (parseFloat(i.precio) || 0) * cant / (1 + ivaPct / 100) // sin IVA
        if (ventaLinea <= 0) return
        repVentaSinIva += ventaLinea
        const inv = matchInv(i)
        const nombre = (i.nombre || i.codigo || 'Sin nombre').toString().trim()
        if (!rotMap[nombre]) rotMap[nombre] = { nombre, vendidas: 0, stock: inv ? inv.stock : null }
        rotMap[nombre].vendidas += cant
        if (inv && rotMap[nombre].stock == null) rotMap[nombre].stock = inv.stock
        if (inv && inv.costoBase > 0) {
          const costoLinea = inv.costoBase * cant
          repVentaConCosto += ventaLinea
          repCosto += costoLinea
          if (!margenMap[nombre]) margenMap[nombre] = { nombre, vendidas: 0, venta: 0, costo: 0 }
          margenMap[nombre].vendidas += cant
          margenMap[nombre].venta += ventaLinea
          margenMap[nombre].costo += costoLinea
        }
      })
    })
    const margenRep = repVentaConCosto - repCosto
    const margenPct = repVentaConCosto > 0 ? Math.round(margenRep / repVentaConCosto * 100) : null
    const coberturaMargen = repVentaSinIva > 0 ? Math.round(repVentaConCosto / repVentaSinIva * 100) : 0
    const topMargen = Object.values(margenMap)
      .map(m => ({ ...m, margen: m.venta - m.costo, pct: m.venta > 0 ? Math.round((m.venta - m.costo) / m.venta * 100) : 0 }))
      .sort((a, b) => b.margen - a.margen).slice(0, 10)
    const rotacion = Object.values(rotMap).sort((a, b) => b.vendidas - a.vendidas).slice(0, 12)
    const inventarioListo = inventario.length > 0

    // Ingresos totales SIN IVA y utilidades honestas.
    const ingresosSinIva = repVentaSinIva + moBase
    const utilidadMO = moBase - comisiones
    // Neto taller = ventas sin IVA − comisiones − costo de repuestos (el conocido por
    // Cuentti). Si la cobertura es < 100%, no se pudo restar el costo de todos los
    // repuestos, así que el neto real es algo MENOR (se avisa en la nota).
    const neto = Math.round(ingresosSinIva - comisiones - repCosto)

    return {
      total: filtrados.length, completados: completados.length, facturado, comisiones,
      moBase, ingresosSinIva, neto, utilidadMO, ticket,
      porTecnico, porEstado, topVehiculos, topRepuestos, topClientes,
      repVentaSinIva, repVentaConCosto, repCosto, margenRep, margenPct, coberturaMargen, topMargen,
      rotacion, inventarioListo,
    }
  }, [filtrados, inventario, tecnicos])

  const exportarCSV = () => {
    const headers = ['ID', 'Fecha', 'Placa', 'Cliente', 'Marca', 'Modelo', 'Tecnico', 'Estado', 'Total']
    const rows = filtrados.map(t => [
      t.id, t.fecha?.slice(0, 10) || '', t.placa, t.cliente,
      t.marca, t.modelo,
      tecnicos.find(tc => tc.id === parseInt(t.tecnicoId))?.nombre || '',
      t.estado, t.total || 0,
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_${rango.desde}_${rango.hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notify?.(`CSV descargado (${rows.length} OT)`, 'success')
  }

  const exportarResumen = () => {
    const doc = new jsPDF()
    const { MARGIN, CONTENT_W } = PDF_LAYOUT

    drawHeader(doc, {
      docType: 'REPORTE DE OPERACIÓN',
      docNumber: `${stats.total} OT`,
      dateRows: [
        { lbl: 'DESDE', val: fmtDate(rango.desde) },
        { lbl: 'HASTA', val: fmtDate(rango.hasta) },
      ],
    })

    // Resumen ejecutivo (totales en caja navy estilo factura)
    let y = drawSectionHeader(doc, 'Resumen ejecutivo', 47)
    y += 2

    // 2 columnas: izquierda métricas grid, derecha caja NETO
    const leftW = 104
    const rightX = MARGIN + leftW + 4
    const rightW = CONTENT_W - leftW - 4

    // ----- LEFT: 2x2 grid de métricas -----
    const cellH = 18
    const cellW = leftW / 2
    const cells = [
      { lbl: 'TOTAL TRABAJOS', val: String(stats.total), color: PDF_COLORS.NAVY },
      { lbl: 'COMPLETADOS',    val: String(stats.completados), color: PDF_COLORS.GREEN_600 },
      { lbl: 'FACTURADO (C/IVA)', val: fmt(stats.facturado), color: PDF_COLORS.NAVY },
      { lbl: 'COMISIONES',     val: fmt(stats.comisiones), color: PDF_COLORS.AMBER_500 },
    ]
    doc.setDrawColor(...PDF_COLORS.SLATE_300)
    cells.forEach((c, i) => {
      const cx = MARGIN + (i % 2) * cellW
      const cy = y + Math.floor(i / 2) * cellH
      doc.rect(cx, cy, cellW, cellH)
      doc.setFontSize(7)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(...PDF_COLORS.SLATE_500)
      doc.text(c.lbl, cx + 4, cy + 5)
      doc.setFontSize(13)
      doc.setTextColor(...c.color)
      doc.text(c.val, cx + 4, cy + 13)
    })

    // ----- RIGHT: caja con el APORTE al taller (ventas s/IVA − comisiones − costo).
    // El nombre no dice "neto" porque no resta gastos fijos ni IVA. Si Cuentti aún no
    // da costos (cobertura 0%), el rótulo lo dice para no prometer un número completo.
    const netoConfiablePDF = stats.coberturaMargen >= 75
    doc.setFillColor(...PDF_COLORS.NAVY)
    doc.rect(rightX, y, rightW, cellH * 2, 'F')
    doc.setTextColor(...PDF_COLORS.AMBER)
    doc.setFontSize(8)
    doc.setFont(undefined, 'bold')
    doc.text(netoConfiablePDF ? 'APORTE AL TALLER' : 'MARGEN ANTES DE REPUESTOS', rightX + 5, y + 8)
    doc.setTextColor(...PDF_COLORS.WHITE)
    doc.setFontSize(19)
    doc.text(fmt(stats.neto), rightX + rightW - 5, y + 19, { align: 'right' })
    doc.setFontSize(6.5)
    doc.setFont(undefined, 'normal')
    const notaNeto = stats.coberturaMargen === 0
      ? 'ventas s/IVA - comisiones (sin costo de repuestos aun)'
      : !netoConfiablePDF
        ? `ventas s/IVA - comis. - costo (solo ${stats.coberturaMargen}% de repuestos), el real es menor`
        : 'ventas s/IVA - comisiones - costo, antes de gastos fijos e IVA'
    doc.text(notaNeto, rightX + 5, y + cellH * 2 - 4)

    y += cellH * 2 + 8

    // ----- Productividad por técnico -----
    y = drawSectionHeader(doc, 'Productividad por técnico', y) + 1
    autoTable(doc, {
      startY: y,
      head: [['TÉCNICO', 'TRABAJOS', 'MANO DE OBRA']],
      body: stats.porTecnico.map(t => [t.nombre + (t.inactivo ? ' (inactivo)' : ''), String(t.cantidad), fmt(t.facturado)]),
      ...tableStylesItems,
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 40, fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 8

    // ----- Distribución por estado -----
    y = drawSectionHeader(doc, 'Distribución por estado', y) + 1
    autoTable(doc, {
      startY: y,
      head: [['ESTADO', 'CANTIDAD', '%']],
      body: stats.porEstado.filter(e => e.cantidad > 0).map(e => {
        const pct = stats.total > 0 ? Math.round((e.cantidad / stats.total) * 100) : 0
        return [e.estado, String(e.cantidad), `${pct}%`]
      }),
      ...tableStylesMuted,
      columnStyles: {
        1: { halign: 'center', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })

    drawFooter(doc, { page: 1, total: 1 })
    doc.save(`reporte_${rango.desde}_${rango.hasta}.pdf`)
    notify?.('PDF generado', 'success')
  }

  // Presets rapidos de rango de fechas
  const aplicarPreset = (preset) => {
    const now = new Date()
    const yyyymmdd = ymdLocal
    let desde, hasta = yyyymmdd(now)
    switch (preset) {
      case 'hoy':
        desde = hasta
        break
      case 'semana': {
        const d = new Date(now)
        d.setDate(d.getDate() - 6)
        desde = yyyymmdd(d)
        break
      }
      case 'mes':
        desde = yyyymmdd(new Date(now.getFullYear(), now.getMonth(), 1))
        break
      case 'mesPasado': {
        desde = yyyymmdd(new Date(now.getFullYear(), now.getMonth() - 1, 1))
        hasta = yyyymmdd(new Date(now.getFullYear(), now.getMonth(), 0))
        break
      }
      case 'trimestre': {
        const d = new Date(now)
        d.setMonth(d.getMonth() - 3)
        desde = yyyymmdd(d)
        break
      }
      case 'anio':
        desde = `${now.getFullYear()}-01-01`
        break
      case 'todo':
        desde = '2020-01-01'
        break
      default:
        return
    }
    setRango({ desde, hasta })
    setPresetActivo(preset)
  }

  // Cambiar una fecha personalizada quita el preset activo.
  const setFecha = (campo, val) => {
    setRango(r => ({ ...r, [campo]: val }))
    setPresetActivo(null)
  }
  // Corrige un rango invertido intercambiando las fechas.
  const corregirRango = () => setRango(r => ({ desde: r.hasta, hasta: r.desde }))

  const PRESETS = [
    ['hoy', 'Hoy'],
    ['semana', '7 días'],
    ['mes', 'Mes actual'],
    ['mesPasado', 'Mes pasado'],
    ['trimestre', '3 meses'],
    ['anio', 'Este año'],
    ['todo', 'Todo'],
  ]

  const rangoTexto = `${fmtDate(rango.desde)} → ${fmtDate(rango.hasta)}`

  // Presentación honesta del "aporte al taller": el verde se GANA de forma GRADUAL,
  // solo cuando el costo de repuestos está casi completo. Bajo el umbral el número
  // va NEUTRO (no promete una utilidad que no descontó su costo).
  //  - cobertura 0%             → neutro + badge "sin costo de repuestos", rótulo "Margen antes de repuestos"
  //  - 0% < cobertura < 75%     → neutro + salvedad ámbar, rótulo "Margen antes de repuestos"
  //  - 75% ≤ cobertura < 100%   → verde, rótulo "Aporte al taller", PERO conserva salvedad muted
  //  - cobertura = 100%         → verde limpio, sin salvedad
  const UMBRAL_COBERTURA = 75
  const netoConfiable = stats.coberturaMargen >= UMBRAL_COBERTURA
  const netoSinCosto = stats.coberturaMargen === 0
  const netoParcial = stats.coberturaMargen > 0 && !netoConfiable
  const netoIncompletoVerde = netoConfiable && stats.coberturaMargen < 100 // verde pero aún no descuenta todo el costo
  const netoLabel = netoConfiable ? 'Aporte al taller' : 'Margen antes de repuestos'
  // No hay nada que exportar si el rango es inválido o no cae ninguna OT.
  const sinDatos = rangoInvalido || stats.total === 0

  return (
    <div>
      {/* Barra de titulo: los presets pasan de seis botones de 44px a un
          segmentado, y el rango DESDE/HASTA a una pastilla con el rango
          escrito. Los dos campos siguen ahi, dentro. */}
      <div className="hd-head rep-head">
        <div className="hd-head__t">
          <h1>Reportes</h1>
          <div className="hd-head__sub">{stats.total} trabajos · {stats.completados} completados</div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-seg rep-presets">
            {PRESETS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={presetActivo === k}
                className={`hd-seg__i${presetActivo === k ? ' on' : ''}`}
                onClick={() => { aplicarPreset(k); setVerRango(false) }}>{l}</button>
            ))}
          </div>
          <button type="button" className={`rep-rango${verRango ? ' on' : ''}`} onClick={() => setVerRango(v => !v)}
            aria-expanded={verRango}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
            {fmtDate(rango.desde)} – {fmtDate(rango.hasta)}
          </button>
          <button type="button" className="rep-ico" onClick={toggleTodas} aria-pressed={todasColapsadas}
            title={todasColapsadas ? 'Expandir todas las secciones' : 'Recoger todas las secciones'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: todasColapsadas ? 'none' : 'rotate(180deg)' }}>
              <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
            </svg>
          </button>
          <button type="button" className="rep-ico" onClick={() => exportarResumen()} disabled={sinDatos}
            title={sinDatos ? 'No hay datos para exportar en este rango' : 'Exportar el resumen en PDF'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </button>
          <Button variant="primary" onClick={exportarCSV} disabled={sinDatos}
            title={sinDatos ? 'No hay datos para exportar en este rango' : undefined}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 19h16" /></svg>}>
            Exportar CSV
          </Button>
        </div>
      </div>

      {verRango && (
        <div className="rep-rango__b">
          <span className="ec-form__l">DESDE</span>
          <input className="hd-drop" type="date" aria-label="Fecha desde" value={rango.desde} onChange={e => setFecha('desde', e.target.value)} />
          <span className="ec-form__l">HASTA</span>
          <input className="hd-drop" type="date" aria-label="Fecha hasta" value={rango.hasta} onChange={e => setFecha('hasta', e.target.value)} />
          <span className="hd-bar__sp" />
          <span className="rep-rango__n">{rangoTexto}</span>
        </div>
      )}

      {rangoInvalido && (
        <div className="rep-aviso">
          <span>El rango está invertido: “desde” ({fmtDate(rango.desde)}) es posterior a “hasta” ({fmtDate(rango.hasta)}).</span>
          <Button variant="warning" size="sm" onClick={corregirRango}>Corregir</Button>
        </div>
      )}
      {topeAlcanzado && !rangoInvalido && (
        <div className="rep-aviso">Mostrando las últimas {MAX_TRABAJOS} OT. Un historial más largo puede quedar por fuera de este total.</div>
      )}

      {/* Estados de carga y vacío ------------------------------------------------ */}
      {loading && trabajos.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="kpi" aria-hidden="true">
              <div className="skeleton" style={{ height: 13, width: '55%', borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 26, width: '70%', borderRadius: 6, marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : stats.total === 0 ? (
        <div className="card">
          <div className="empty">
            <h4>{rangoInvalido ? 'Rango de fechas inválido' : 'Sin trabajos en el periodo'}</h4>
            <p>
              {rangoInvalido
                ? 'Corrige las fechas para ver el reporte.'
                : `No hay órdenes de trabajo entre ${fmtDate(rango.desde)} y ${fmtDate(rango.hasta)}. Prueba un rango más amplio.`}
            </p>
            {!rangoInvalido && (
              <div style={{ marginTop: 12 }}>
                <Button variant="outline" size="sm" onClick={() => aplicarPreset('mes')}>Ver mes actual</Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
      {/* Banda de cifras: las dos que mandan salen de la grilla de seis KPIs
          iguales y pasan a 27px, con la formula pegada al margen (no suelta
          debajo) y los otros cuatro en una rejilla 2x2 al lado. */}
      <div className="hd-card rep-band">
        <div className="rep-band__c">
          <div className="ec-fig__l">FACTURADO (C/IVA)</div>
          <div className="rep-band__v">{fmt(stats.facturado)}</div>
        </div>
        <div className="rep-band__div" />
        <div className="rep-band__c rep-band__c--margen">
          <div className="ec-fig__l rep-band__la">{netoLabel.toUpperCase()}</div>
          <div className="rep-band__r">
            <span className="rep-band__v rep-band__v--acc">{fmt(stats.facturado ? stats.neto : 0)}</span>
            {stats.facturado > 0 && (
              <span className={`hd-chip hd-chip--${stats.neto >= 0 ? 'ok' : 'bad'}`}>
                {Math.round(stats.neto / stats.facturado * 100)}% de lo facturado
              </span>
            )}
            {netoSinCosto && <span className="hd-chip hd-chip--warn">sin costo de repuestos</span>}
          </div>
          {/* La formula se conserva palabra por palabra: es lo que hace
              entendible la cifra. */}
          <div className="rep-band__f">
            {netoLabel} = ventas sin IVA − comisiones − costo de repuestos, antes de gastos fijos e IVA.
          </div>
          {(netoParcial || netoIncompletoVerde) && (
            <div className="rep-band__f">El costo cubre {stats.coberturaMargen}% de las ventas de repuestos; el real es algo menor.</div>
          )}
        </div>
        <div className="rep-band__div" />
        <div className="rep-band__kpis">
          <div><div className="ec-band__gl">TOTAL TRABAJOS</div><div className="rep-band__kv">{stats.total}</div></div>
          <div><div className="ec-band__gl">COMPLETADOS</div><div className="rep-band__kv ok">{stats.completados}</div></div>
          <div><div className="ec-band__gl">COMISIONES TÉCNICOS</div><div className="rep-band__kv">{fmt(stats.comisiones)}</div></div>
          <div><div className="ec-band__gl">TICKET PROM. (C/IVA)</div><div className="rep-band__kv">{fmt(stats.ticket)}</div></div>
        </div>
      </div>

      <div className="rep-book">
      <div className="rep-col">

      {/* Las tres secciones de ingresos eran tres bloques plegables que
          contestaban la MISMA pregunta. Ahora es una: de donde sale el margen.
          Los tres numeros y sus porcentajes quedan completos. */}
      <div className="hd-card rep-marg">
        {(() => {
          const rep = Math.round(stats.repVentaSinIva), mo = Math.round(stats.moBase), tot = rep + mo
          if (tot <= 0) return <div className="hd-void">Sin ventas registradas en el periodo</div>
          const pRep = Math.round(rep / tot * 100)
          return (
            <>
              <div className="rep-marg__h">
                <span className="ec-aside__t">De dónde sale el margen</span>
                <span className="rep-marg__hs">sin IVA · {fmt(tot)}</span>
              </div>
              <div className="rep-marg__bar">
                <span style={{ width: `${pRep}%`, background: 'var(--accent)' }} />
                <span style={{ width: `${100 - pRep}%`, background: '#93b4f7' }} />
              </div>
              <div className="rep-marg__cols">
                <div className="rep-marg__c">
                  <div className="rep-marg__cl"><span className="rep-marg__dot" style={{ background: 'var(--accent)' }} />REPUESTOS</div>
                  <div className="rep-marg__cv">{fmt(rep)}</div>
                  <div className="rep-marg__cn">
                    {stats.coberturaMargen > 0
                      ? `Margen de repuestos ${fmt(Math.round(stats.margenRep))} · ${stats.margenPct}%`
                      : 'Cuentti no devolvió el costo: sin margen calculable'}
                  </div>
                </div>
                <div className="rep-marg__c">
                  <div className="rep-marg__cl"><span className="rep-marg__dot" style={{ background: '#93b4f7' }} />MANO DE OBRA</div>
                  <div className="rep-marg__cv">{fmt(mo)}</div>
                  <div className="rep-marg__cn">
                    Utilidad por mano de obra {fmt(stats.utilidadMO)} · {mo > 0 ? Math.round(stats.utilidadMO / mo * 100) : 0}%
                    {' · '}el técnico se lleva el {Math.round(COMISION.TOTAL * 100)}%
                  </div>
                </div>
                <div className="rep-marg__c">
                  <div className="rep-marg__cl">COSTO DE REPUESTOS</div>
                  <div className="rep-marg__cv">{fmt(Math.round(stats.repCosto))}</div>
                  <div className="rep-marg__cn">
                    Lo que se pagó al proveedor
                    {stats.coberturaMargen > 0 && stats.coberturaMargen < 100 && ` · cubre ${stats.coberturaMargen}% de la venta`}
                  </div>
                </div>
              </div>
            </>
          )
        })()}
      </div>

      {/* Repuestos más vendidos */}
      <div className="card" style={{ marginBottom: 16 }}>
        {cabezal('repuestos', 'Repuestos más vendidos', <span className="count">{stats.topRepuestos.length}</span>)}
        {!colapso.repuestos && (
          stats.topRepuestos.length === 0 ? (
          <div className="card__b"><p className="text-sm text-muted">Sin repuestos vendidos en el periodo.</p></div>
        ) : (
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead><tr><th>Repuesto</th><th className="c-right">Cant.</th><th className="c-right">Ingresos</th><th style={{ width: '25%' }} /></tr></thead>
              <tbody>
                {stats.topRepuestos.map((r, i) => {
                  const max = Math.max(...stats.topRepuestos.map(x => x.ingresos), 1)
                  const pct = Math.round(r.ingresos / max * 100)
                  return (
                    <tr key={i}>
                      <td className="c-name" title={r.nombre}>{r.nombre}{r.sospechoso && <span className="badge badge-w" title="El nombre suena a mano de obra: puede estar mal marcado como repuesto (revísalo en la OT)." style={{ marginLeft: 8, fontSize: 10.5, verticalAlign: 'middle' }}>¿servicio?</span>}</td>
                      <td className="c-mono c-right" data-label="Cant." style={{ fontWeight: 700 }}>{r.cantidad}</td>
                      <td className="c-mono c-right" data-label="Ingresos" style={{ fontWeight: 700, color: 'var(--green-600)' }}>{fmt(r.ingresos)}</td>
                      <td className="td-bar"><div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--blue-500)' }} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      </div>{/* cierra la columna izquierda */}

      <div className="rep-col rep-col--side">
      {/* Technician ranking */}
      <div className="card" style={{marginBottom:16}}>
        {cabezal('equipo', 'Rendimiento del equipo')}
        {!colapso.equipo && (
        <div className="card__b card__b--flush">
          <table className="tbl tbl-cards">
            <thead><tr><th>Mecánico</th><th className="c-right">Trabajos</th><th className="c-right">Mano de obra</th><th style={{width:'25%'}}/></tr></thead>
            <tbody>
              {stats.porTecnico.map((t,i)=>{
                const maxFact = Math.max(...stats.porTecnico.map(x=>x.facturado),1)
                const pct = Math.round((t.facturado/maxFact)*100)
                return (
                  <tr key={t.id}>
                    <td className="c-name"><div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span className={`av av-${(i%5)+1}`}>{t.sinAsignar ? '—' : t.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</span>
                      <span style={{fontWeight:600}}>{t.nombre}{t.inactivo && <span className="aviso-ambar" style={{marginLeft:6,fontSize:11,fontWeight:600}}>· Inactivo</span>}</span>
                    </div></td>
                    <td className="c-mono c-right" data-label="Trabajos" style={{fontWeight:700}}>{t.cantidad}</td>
                    <td className="c-mono c-right" data-label="Mano de obra" style={{fontWeight:700,color:t.facturado>0?'var(--green-600)':'var(--text-3)'}}>{fmt(t.facturado)}</td>
                    <td className="td-bar">
                      <div style={{height:6,background:'var(--bg-subtle)',borderRadius:3,overflow:'hidden',border:'1px solid var(--border)'}}>
                        <div style={{width:`${pct}%`,height:'100%',background:'var(--blue-500)'}}/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Consulta: cuatro secciones recogidas. Cada una dice QUE hay
          dentro, no solo su nombre: la regla es que una seccion recogida
          se pueda descartar sin abrirla. */}
      <div className="rep-consulta">CONSULTA · 4 SECCIONES RECOGIDAS</div>
      {/* Rotación de inventario (vendidas en el rango vs stock actual de Cuentti) */}
      {stats.inventarioListo && stats.rotacion.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          {cabezal('rotacion', 'Rotación de inventario', <span className="count">{stats.rotacion.length}</span>)}
        {dentro('rotacion', `${stats.rotacion.length} referencias con venta en el periodo · stock actual de Cuentti al lado de lo vendido`)}
          {!colapso.rotacion && (
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead><tr><th>Repuesto</th><th className="c-right">Vendidas</th><th className="c-right">Stock</th><th className="c-right">Estado</th></tr></thead>
              <tbody>
                {stats.rotacion.map((r, i) => {
                  const stock = r.stock
                  const descuadre = stock != null && stock < 0        // negativo = descuadre, no "agotado"
                  const agotado = stock != null && stock === 0
                  const reponer = stock != null && stock > 0 && stock <= r.vendidas
                  return (
                    <tr key={i}>
                      <td className="c-name" title={r.nombre}>{r.nombre}</td>
                      <td className="c-mono c-right" data-label="Vendidas">{r.vendidas}</td>
                      <td className="c-mono c-right" data-label="Stock">{stock == null ? '—' : stock}</td>
                      <td className="c-right" data-label="Estado">
                        {stock == null ? <Badge tone="neutral">Sin dato</Badge>
                          : descuadre ? <Badge tone="danger">Revisar</Badge>
                          : agotado ? <Badge tone="danger">Agotado</Badge>
                          : reponer ? <Badge tone="warning">Reponer</Badge>
                          : <Badge tone="success">OK</Badge>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Top clientes */}
      {stats.topClientes.length > 0 && (
        <div className="card" style={{marginBottom:16}}>
          {cabezal('clientes', 'Top clientes', <span className="count">{stats.topClientes.length}</span>)}
        {dentro('clientes', stats.topClientes[0] ? `${stats.topClientes[0].nombre} encabeza con ${fmt(stats.topClientes[0].total)} en ${stats.topClientes[0].ots} trabajos` : 'Sin clientes facturados en el periodo')}
          {!colapso.clientes && (
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead><tr><th>Cliente</th><th className="c-right">OTs</th><th className="c-right">Facturado</th><th style={{width:'25%'}}/></tr></thead>
              <tbody>
                {stats.topClientes.map((c,i)=>{
                  const maxTot = Math.max(...stats.topClientes.map(x=>x.total),1)
                  const pct = Math.round((c.total/maxTot)*100)
                  return (
                    <tr key={i}>
                      <td className="c-name"><div style={{display:'flex',alignItems:'center',gap:10}}><span className={`av av-${(i%5)+1}`}>{c.nombre.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</span><span style={{fontWeight:600}}>{c.nombre}{c.mostrador && <span style={{marginLeft:6,fontSize:11,fontWeight:600,color:'var(--text-3)'}}>· Mostrador</span>}</span></div></td>
                      <td className="c-mono c-right" data-label="OTs" style={{fontWeight:700}}>{c.ots}</td>
                      <td className="c-mono c-right" data-label="Facturado" style={{fontWeight:700,color:'var(--green-600)'}}>{fmt(c.total)}</td>
                      <td className="td-bar">
                        <div style={{height:6,background:'var(--bg-subtle)',borderRadius:3,overflow:'hidden',border:'1px solid var(--border)'}}>
                          <div style={{width:`${pct}%`,height:'100%',background:'var(--blue-500)'}}/>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Top vehicles */}
      {stats.topVehiculos.length > 0 && (
        <div className="card">
          {cabezal('vehiculos', 'Vehículos frecuentes', <span className="count">{stats.topVehiculos.length}</span>)}
        {dentro('vehiculos', stats.topVehiculos[0] ? `${stats.topVehiculos[0].placa} con ${stats.topVehiculos[0].visitas} visitas · ${stats.topVehiculos.length} placas en el periodo` : 'Sin placas repetidas en el periodo')}
          {!colapso.vehiculos && (
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead><tr><th>Placa</th><th>Vehículo</th><th className="c-right">Visitas</th><th className="c-right">Total facturado</th></tr></thead>
              <tbody>
                {stats.topVehiculos.map(v=>(
                  <tr key={v.placa}>
                    <td className="c-name c-mono">{v.placa}{v.mostrador && <span style={{marginLeft:6,fontFamily:'var(--font)',fontSize:11,fontWeight:600,color:'var(--text-3)'}}>· Mostrador</span>}</td>
                    <td className="c-muted" data-label="Vehículo">{[v.marca,v.modelo].filter(Boolean).join(' ')||'—'}</td>
                    <td className="c-mono c-right" data-label="Visitas" style={{fontWeight:700}}>{v.visitas}</td>
                    <td className="c-mono c-right" data-label="Total" style={{fontWeight:700}}>{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Distribución por estado — al final: cuando todo está Completado aporta poco */}
      <div className="card">
        {cabezal('estado', 'Distribución por estado')}
        {dentro('estado', `${stats.completados} completados · ${stats.total - stats.completados} sin cerrar · ${stats.porEstado.length} estados`)}
        {!colapso.estado && (() => {
          const activos = stats.porEstado.filter(e => e.cantidad > 0)
          const colors = {'Completado':'var(--green-500)','Cancelado':'var(--red-500)','En Progreso':'var(--blue-500)','Pendiente':'var(--amber-400)','En Diagnostico':'var(--blue-400)','Esperando Repuestos':'var(--amber-500)','En Prueba':'var(--purple-500,#7c3aed)','Programado':'var(--slate-400)'}
          if (activos.length <= 1) {
            const e = activos[0]
            return (
              <div className="card__b" style={{display:'flex',alignItems:'center',gap:10,fontSize:13.5}}>
                <div style={{width:10,height:10,borderRadius:3,background:colors[e?.estado]||'var(--slate-400)',flexShrink:0}}/>
                <span style={{fontWeight:500}}>{e ? e.estado : 'Sin trabajos'}</span>
                <span className="mono" style={{fontWeight:700,marginLeft:'auto'}}>{e?.cantidad||0}</span>
                <span className="mono" style={{color:'var(--text-3)'}}>100%</span>
              </div>
            )
          }
          return (
            <div className="card__b" style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{display:'flex',height:14,borderRadius:7,overflow:'hidden',border:'1px solid var(--border)'}}>
                {activos.map((e,i)=>(<div key={i} style={{width:`${(e.cantidad/stats.total)*100}%`,background:colors[e.estado]||'var(--slate-400)'}}/>))}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:9}}>
                {activos.map((e,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,fontSize:13}}>
                    <div style={{width:10,height:10,borderRadius:3,background:colors[e.estado]||'var(--slate-400)',flexShrink:0}}/>
                    <span style={{flex:1,fontWeight:500}}>{e.estado}</span>
                    <span className="mono" style={{fontWeight:700}}>{e.cantidad}</span>
                    <span className="mono" style={{color:'var(--text-3)'}}>{stats.total>0?Math.round(e.cantidad/stats.total*100):0}%</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
      </div>{/* cierra la columna lateral */}
      </div>{/* cierra rep-book */}

        </>
      )}
    </div>
  )
}
