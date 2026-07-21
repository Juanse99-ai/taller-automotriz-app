import { useState, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, fmtDate } from '../utils/helpers'
import { COMISION, ESTADOS } from '../utils/constants'
import { useTecnicos } from '../services/tecnicos'
import { manoObraBase } from '../utils/comision'
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

  // Aviso de tope: si traemos el máximo de OTs y el rango es amplio, puede haber
  // trabajos antiguos que no llegaron (fetchTrabajos limita a 500, orden fecha desc).
  const topeAlcanzado = trabajos.length >= MAX_TRABAJOS && ['todo', 'anio', 'trimestre'].includes(presetActivo)

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
      placaMap[t.placa].total += t.total || 0
    })
    const topVehiculos = Object.values(placaMap).sort((a, b) => b.visitas - a.visitas || b.total - a.total).slice(0, 10)

    // Desglose de ingresos SIN IVA (repuestos vs mano de obra) + repuestos más vendidos
    const repMap = {}
    completados.forEach(t => {
      (t.items || []).forEach(i => {
        const esServ = i.esServicio === true || (i.tipo || i.categoria || '').toString().toLowerCase().includes('serv')
        if (esServ) return
        const cant = parseInt(i.cantidad) || 1
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
      .map(r => ({ ...r, ingresos: Math.round(r.ingresos) }))
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
        const esServ = i.esServicio === true || (i.tipo || i.categoria || '').toString().toLowerCase().includes('serv')
        if (esServ) return
        const cant = parseInt(i.cantidad) || 1
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

    // ----- RIGHT: caja con NETO TALLER (real: ventas sin IVA − comisiones − costo)
    doc.setFillColor(...PDF_COLORS.NAVY)
    doc.rect(rightX, y, rightW, cellH * 2, 'F')
    doc.setTextColor(...PDF_COLORS.AMBER)
    doc.setFontSize(8)
    doc.setFont(undefined, 'bold')
    doc.text('NETO TALLER', rightX + 5, y + 8)
    doc.setTextColor(...PDF_COLORS.WHITE)
    doc.setFontSize(19)
    doc.text(fmt(stats.neto), rightX + rightW - 5, y + 19, { align: 'right' })
    doc.setFontSize(6.5)
    doc.setFont(undefined, 'normal')
    const notaNeto = stats.coberturaMargen > 0 && stats.coberturaMargen < 100
      ? `ventas s/IVA - comis. - costo (${stats.coberturaMargen}% repuestos)`
      : 'ventas s/IVA - comisiones - costo repuestos'
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

  const rangoTexto = `${fmtDate(rango.desde)} — ${fmtDate(rango.hasta)}`

  return (
    <div>
      <div className="pagehd">
        <div>
          <h2>Reportes</h2>
          <p className="pagehd__sub" style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-3)' }}>{rangoTexto}</p>
        </div>
        <div className="actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Button variant="outline" size="sm" onClick={exportarCSV}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportarResumen()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </Button>
        </div>
      </div>

      {/* Filtros rapidos + custom */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__b" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Periodo rápido</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.map(([k, l]) => {
                const on = presetActivo === k
                return (
                  <Button key={k} type="button"
                    variant={on ? 'primary' : 'outline'} size="sm"
                    aria-pressed={on}
                    onClick={() => aplicarPreset(k)}
                    style={{ padding: '7px 13px', fontSize: 12.5, minHeight: 38 }}>
                    {l}
                  </Button>
                )
              })}
            </div>
          </div>
          <div className="filtro-sep" style={{ width: 1, height: 36, background: 'var(--border)', margin: '0 6px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Personalizado</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" type="date" aria-label="Fecha desde" value={rango.desde} onChange={e => setFecha('desde', e.target.value)} style={{ width: 160, fontSize: 16 }} />
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>→</span>
              <input className="input" type="date" aria-label="Fecha hasta" value={rango.hasta} onChange={e => setFecha('hasta', e.target.value)} style={{ width: 160, fontSize: 16 }} />
            </div>
          </div>
        </div>
        {rangoInvalido && (
          <div className="card__b" style={{ paddingTop: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--amber-600)', fontWeight: 600 }}>
              El rango está invertido: “desde” ({fmtDate(rango.desde)}) es posterior a “hasta” ({fmtDate(rango.hasta)}).
            </span>
            <Button variant="warning" size="sm" onClick={corregirRango}>Corregir</Button>
          </div>
        )}
        {topeAlcanzado && !rangoInvalido && (
          <div className="card__b" style={{ paddingTop: 0, fontSize: 12.5, color: 'var(--amber-600)' }}>
            Mostrando las últimas {MAX_TRABAJOS} OT. Un historial más largo puede quedar por fuera de este total.
          </div>
        )}
      </div>

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
      {/* KPI cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,marginBottom:12}}>
        <div className="kpi"><div className="kpi__head"><div className="kpi__lbl">Total trabajos</div></div><div className="kpi__v">{stats.total}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__lbl">Completados</div></div><div className="kpi__v" style={{color:'var(--green-600)'}}>{stats.completados}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__lbl">Facturado <span style={{fontWeight:400,color:'var(--text-4)'}}>c/IVA</span></div></div><div className="kpi__v">{fmt(stats.facturado)}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__lbl">Comisiones técnicos</div></div><div className="kpi__v" style={{color:'var(--amber-600)'}}>{fmt(stats.comisiones)}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__lbl">Neto taller</div></div><div className="kpi__v" style={{color:stats.neto>=0?'var(--green-600)':'var(--red-600)'}}>{fmt(stats.neto)}</div></div>
        <div className="kpi"><div className="kpi__head"><div className="kpi__lbl">Ticket promedio</div></div><div className="kpi__v">{fmt(stats.ticket)}</div></div>
      </div>
      <p style={{fontSize:12.5,color:'var(--text-3)',margin:'0 2px 18px',lineHeight:1.5}}>
        <strong style={{color:'var(--text-2)'}}>Neto taller</strong> = ventas sin IVA − comisiones − costo de repuestos.
        {stats.coberturaMargen > 0 && stats.coberturaMargen < 100 && ` El costo de Cuentti cubre el ${stats.coberturaMargen}% de los repuestos vendidos; sobre el resto no se pudo restar costo, así que el neto real es algo menor.`}
        {stats.coberturaMargen === 0 && ' Cuentti aún no devuelve el costo de los repuestos, así que este neto todavía no descuenta ese costo.'}
      </p>

      {/* Distribution by state - stacked bar */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card__h"><h3>Distribución por estado</h3></div>
        <div className="card__b" style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'flex',height:14,borderRadius:7,overflow:'hidden',border:'1px solid var(--border)'}}>
            {stats.porEstado.filter(e=>e.cantidad>0).map((e,i)=>{
              const colors = {'Completado':'var(--green-500)','Cancelado':'var(--red-500)','En Progreso':'var(--blue-500)','Pendiente':'var(--amber-400)','En Diagnostico':'var(--blue-400)','Esperando Repuestos':'var(--amber-500)','En Prueba':'var(--purple-500,#7c3aed)','Programado':'var(--slate-400)'}
              return <div key={i} style={{width:`${(e.cantidad/stats.total)*100}%`,background:colors[e.estado]||'var(--slate-400)'}}/>
            })}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:9}}>
            {stats.porEstado.filter(e=>e.cantidad>0).map((e,i)=>{
              const colors = {'Completado':'var(--green-500)','Cancelado':'var(--red-500)','En Progreso':'var(--blue-500)','Pendiente':'var(--amber-400)','En Diagnostico':'var(--blue-400)','Esperando Repuestos':'var(--amber-500)','En Prueba':'var(--purple-500,#7c3aed)','Programado':'var(--slate-400)'}
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:10,fontSize:13}}>
                  <div style={{width:10,height:10,borderRadius:3,background:colors[e.estado]||'var(--slate-400)',flexShrink:0}}/>
                  <span style={{flex:1,fontWeight:500}}>{e.estado}</span>
                  <span className="mono" style={{fontWeight:700}}>{e.cantidad}</span>
                  <span className="mono" style={{color:'var(--text-3)'}}>{stats.total>0?Math.round(e.cantidad/stats.total*100):0}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Ingresos: repuestos vs mano de obra (SIN IVA) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__h"><h3>Ingresos: repuestos vs mano de obra</h3><span style={{fontSize:12,color:'var(--text-3)'}}>sin IVA</span></div>
        <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(() => {
            const rep = Math.round(stats.repVentaSinIva), mo = stats.moBase, tot = rep + mo
            if (tot <= 0) return <p className="text-sm text-muted" style={{margin:0}}>Sin ventas registradas en el periodo.</p>
            const pRep = Math.round(rep / tot * 100)
            return (
              <>
                <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ width: `${pRep}%`, background: 'var(--blue-500)' }} />
                  <div style={{ width: `${100 - pRep}%`, background: 'var(--amber-500)' }} />
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--blue-500)' }} />Repuestos <strong className="mono">{fmt(rep)}</strong> <span style={{ color: 'var(--text-3)' }}>({pRep}%)</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--amber-500)' }} />Mano de obra <strong className="mono">{fmt(mo)}</strong> <span style={{ color: 'var(--text-3)' }}>({100 - pRep}%)</span></span>
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* Utilidad por mano de obra (margen casi puro; repuestos requieren costo Cuentti) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__h"><h3>Utilidad por mano de obra</h3></div>
        <div className="card__b" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Mano de obra (sin IVA)</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>{fmt(stats.moBase)}</div>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Comisiones técnicos</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber-600)' }}>−{fmt(stats.comisiones)}</div>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Utilidad taller</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-600)' }}>{fmt(stats.utilidadMO)}</div>
          </div>
        </div>
        <div className="card__b" style={{ paddingTop: 0, fontSize: 12, color: 'var(--text-3)' }}>
          El técnico se lleva el {Math.round(COMISION.TOTAL * 100)}% de la mano de obra; el resto queda al taller.
        </div>
      </div>

      {/* Margen de repuestos (cruza venta con costo de Cuentti) */}
      {stats.repVentaSinIva > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__h"><h3>Margen de repuestos</h3>{stats.coberturaMargen > 0 && <span style={{fontSize:12,color:'var(--text-3)',fontWeight:600}}>margen {stats.margenPct}%</span>}</div>
          {!stats.inventarioListo ? (
            <div className="card__b"><p className="text-sm text-muted">Sincronizando inventario de Cuentti… vuelve en un momento para ver el margen.</p></div>
          ) : stats.coberturaMargen === 0 ? (
            <div className="card__b"><p className="text-sm text-muted">Cuentti no devolvió el costo de estos repuestos; no se puede calcular el margen.</p></div>
          ) : (
            <>
              <div className="card__b" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Venta con costo conocido (sin IVA)</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>{fmt(Math.round(stats.repVentaConCosto))}</div>
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Costo (Cuentti)</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber-600)' }}>−{fmt(Math.round(stats.repCosto))}</div>
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Margen ({stats.margenPct}%)</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-600)' }}>{fmt(Math.round(stats.margenRep))}</div>
                </div>
              </div>
              {stats.coberturaMargen < 100 && (
                <div className="card__b" style={{ paddingTop: 0, fontSize: 12, color: 'var(--text-3)' }}>
                  Calculado sobre el {stats.coberturaMargen}% de las ventas de repuestos (los que cruzan con el inventario de Cuentti). El costo es el actual, no el del momento de la venta.
                </div>
              )}
              {stats.topMargen.length > 0 && (
                <div className="card__b card__b--flush">
                  <table className="tbl tbl-cards">
                    <thead><tr><th>Repuesto</th><th className="c-right">Cant.</th><th className="c-right">Venta</th><th className="c-right">Costo</th><th className="c-right">Margen</th></tr></thead>
                    <tbody>
                      {stats.topMargen.map((m, i) => (
                        <tr key={i}>
                          <td className="c-name" title={m.nombre}>{m.nombre}</td>
                          <td className="c-mono c-right" data-label="Cant.">{m.vendidas}</td>
                          <td className="c-mono c-right" data-label="Venta">{fmt(Math.round(m.venta))}</td>
                          <td className="c-mono c-right" data-label="Costo" style={{ color: 'var(--text-3)' }}>{fmt(Math.round(m.costo))}</td>
                          <td className="c-mono c-right" data-label="Margen" style={{ fontWeight: 700, color: m.margen >= 0 ? 'var(--green-600)' : 'var(--red-600)' }}>{fmt(Math.round(m.margen))} <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.pct}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Repuestos más vendidos */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__h"><h3>Repuestos más vendidos</h3><span className="count">{stats.topRepuestos.length}</span></div>
        {stats.topRepuestos.length === 0 ? (
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
                      <td className="c-name" title={r.nombre}>{r.nombre}</td>
                      <td className="c-mono c-right" data-label="Cant." style={{ fontWeight: 700 }}>{r.cantidad}</td>
                      <td className="c-mono c-right" data-label="Ingresos" style={{ fontWeight: 700, color: 'var(--green-600)' }}>{fmt(r.ingresos)}</td>
                      <td className="td-bar"><div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--blue-500)' }} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rotación de inventario (vendidas en el rango vs stock actual de Cuentti) */}
      {stats.inventarioListo && stats.rotacion.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__h"><h3>Rotación de inventario</h3><span className="count">{stats.rotacion.length}</span></div>
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
        </div>
      )}

      {/* Top clientes */}
      {stats.topClientes.length > 0 && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card__h"><h3>Top clientes</h3><span className="count">{stats.topClientes.length}</span></div>
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead><tr><th>Cliente</th><th className="c-right">OTs</th><th className="c-right">Facturado</th><th style={{width:'25%'}}/></tr></thead>
              <tbody>
                {stats.topClientes.map((c,i)=>{
                  const maxTot = Math.max(...stats.topClientes.map(x=>x.total),1)
                  const pct = Math.round((c.total/maxTot)*100)
                  return (
                    <tr key={i}>
                      <td className="c-name"><div style={{display:'flex',alignItems:'center',gap:10}}><span className={`av av-${(i%5)+1}`}>{c.nombre.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</span><span style={{fontWeight:600}}>{c.nombre}{c.mostrador && <span style={{marginLeft:6,fontSize:11,fontWeight:600,color:'var(--text-4)'}}>· Mostrador</span>}</span></div></td>
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
        </div>
      )}

      {/* Technician ranking */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card__h"><h3>Rendimiento del equipo</h3></div>
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
                      <span style={{fontWeight:600}}>{t.nombre}{t.inactivo && <span style={{marginLeft:6,fontSize:11,fontWeight:600,color:'var(--amber-600)'}}>· Inactivo</span>}</span>
                    </div></td>
                    <td className="c-mono c-right" data-label="Trabajos" style={{fontWeight:700}}>{t.cantidad}</td>
                    <td className="c-mono c-right" data-label="Mano de obra" style={{fontWeight:700,color:'var(--green-600)'}}>{fmt(t.facturado)}</td>
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
      </div>

      {/* Top vehicles */}
      {stats.topVehiculos.length > 0 && (
        <div className="card">
          <div className="card__h"><h3>Vehículos frecuentes</h3><span className="count">{stats.topVehiculos.length}</span></div>
          <div className="card__b card__b--flush">
            <table className="tbl tbl-cards">
              <thead><tr><th>Placa</th><th>Vehículo</th><th className="c-right">Visitas</th><th className="c-right">Total facturado</th></tr></thead>
              <tbody>
                {stats.topVehiculos.map(v=>(
                  <tr key={v.placa}>
                    <td className="c-name c-mono">{v.placa}{v.mostrador && <span style={{marginLeft:6,fontFamily:'var(--font)',fontSize:11,fontWeight:600,color:'var(--text-4)'}}>· Mostrador</span>}</td>
                    <td className="c-muted" data-label="Vehículo">{[v.marca,v.modelo].filter(Boolean).join(' ')||'—'}</td>
                    <td className="c-mono c-right" data-label="Visitas" style={{fontWeight:700}}>{v.visitas}</td>
                    <td className="c-mono c-right" data-label="Total" style={{fontWeight:700}}>{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
