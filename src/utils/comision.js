import { COMISION } from './constants'

// Base de mano de obra SIN IVA para calcular la comisión del técnico.
// Es la MISMA regla que usa Liquidación (lo que realmente se paga):
//  - Manda la suma de las líneas marcadas "Servicio", quitándoles el IVA.
//  - Si no hay ninguna (ej. cambio de aceite), cae a la M.O. escrita a mano en la OT.
// Antes Mecánicos y Reportes calculaban con el precio CON IVA → mostraban ~19% de
// más que lo que el técnico cobraba al liquidar. Mantener en sync con
// getManoObra() de src/pages/Liquidacion.jsx.
export function manoObraBase(t) {
  // M.O. adicional (no facturada): base extra que se paga al técnico sin cobrarla
  // al cliente (ej. la mano de obra del cambio de aceite cuando ya hay otra línea
  // de servicio). Ya viene SIN IVA. Se SUMA siempre, tenga o no líneas de servicio.
  const extra = Math.max(0, parseFloat(t?.manoObraExtra ?? t?.mano_obra_extra) || 0)
  if (Array.isArray(t?.items) && t.items.length) {
    const suma = t.items.reduce((s, i) => {
      const precio = parseFloat(i?.precio) || 0
      const cant = parseInt(i?.cantidad) || 1
      const ivaPct = parseFloat(i?.iva) || 0
      const tipo = (i?.tipo || i?.categoria || '').toString().toLowerCase()
      const esServ = i?.esServicio === true || i?.es_servicio === 1 || tipo.includes('serv')
      if (!esServ) return s
      const totalLinea = precio * cant
      const base = ivaPct > 0 ? totalLinea / (1 + ivaPct / 100) : totalLinea
      return s + base
    }, 0)
    if (suma > 0) return Math.round(suma + extra)
  }
  if (typeof t?.manoObra === 'number' && !Number.isNaN(t.manoObra)) return Math.round(Math.max(0, t.manoObra) + extra)
  if (typeof t?.mano_obra === 'number' && !Number.isNaN(t.mano_obra)) return Math.round(Math.max(0, t.mano_obra) + extra)
  return Math.round(extra)
}

// Comisión del técnico (40% de la base sin IVA).
export function comisionTecnico(t) {
  return Math.round(manoObraBase(t) * COMISION.TOTAL)
}
