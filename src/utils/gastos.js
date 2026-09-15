// Gastos del taller: los fijos de cada mes y los sueltos (tabla `gastos`, ver
// supabase/migrations/20260915_001_gastos.sql).
//
// Una tabla, tres clases de fila:
//   gasto fijo    recurrente = true. Lo que se paga cada mes: monto esperado,
//                 dia_pago y desde que mes aplica (fecha). Se apaga con activo.
//   pago del mes  gasto_fijo_id + periodo ('2026-09'). Lo crea "Confirmar pago";
//                 su monto es lo que se pago de verdad.
//   gasto suelto  ni recurrente ni gasto_fijo_id.
//
// Aqui solo hay cuentas: nada lee la red, asi se prueba sin base.

export const CATEGORIAS_GASTO = [
  { clave: 'arriendo', nombre: 'Arriendo' },
  { clave: 'nomina', nombre: 'Nómina' },
  { clave: 'servicios', nombre: 'Servicios' },
  { clave: 'credito', nombre: 'Crédito' },
  { clave: 'otros', nombre: 'Otros' },
]
export const nombreCategoria = (clave) => CATEGORIAS_GASTO.find(c => c.clave === clave)?.nombre || 'Otros'

// Los mismos dos del MCP (registrar_gasto): deciden contra que caja o banco
// entra el egreso en Cuentti. "A credito" no aplica: esto es un pago hecho.
export const METODOS_GASTO = [
  { clave: 'efectivo', nombre: 'Efectivo' },
  { clave: 'transferencia', nombre: 'Transferencia' },
]

// Cuentas del plan contable de Cuentti con nombre CONFIRMADO en el codigo
// (api/_lib/gasto.js y la descripcion de registrar_gasto). El resto se ofrece
// con el concepto con que ya se uso, que es lo unico cierto que se sabe de ella.
export const CUENTAS_CONOCIDAS = [
  { id: 43, nombre: 'Nómina' },
  { id: 28, nombre: 'Costos servicios vendidos' },
  { id: 20, nombre: 'Alquiler de equipos y licencias' },
  { id: 21, nombre: 'Comisiones' },
]

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export const hoyTaller = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
export const periodoDe = (fecha) => String(fecha || '').slice(0, 7)

export function sumarMeses(periodo, n) {
  const [a, m] = String(periodo).split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// "septiembre 2026"
export function nombreMes(periodo) {
  const [a, m] = String(periodo).split('-').map(Number)
  if (!a || !m) return ''
  return new Date(Date.UTC(a, m - 1, 15))
    .toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .replace(' de ', ' ')
}

// El dia de pago dentro del mes. Un 31 en un mes de 30 cae el 30: el arriendo
// no deja de vencer porque el mes sea corto.
export function vencimiento(fijo, periodo) {
  const dia = parseInt(fijo?.dia_pago, 10)
  if (!(dia >= 1 && dia <= 31)) return null
  const [a, m] = String(periodo).split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${periodo}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`
}

export const esFijo = (g) => g?.recurrente === true
export const esPagoDeFijo = (g) => !!g?.gasto_fijo_id
export const esSuelto = (g) => !!g && !esFijo(g) && !esPagoDeFijo(g)

const RANGO_ESTADO = { vencido: 0, pendiente: 1, pagado: 2 }

// Los gastos fijos que tocan en `periodo`, cada uno con su pago si ya se hizo.
//   estado: pagado · vencido (paso el dia, o el mes ya termino) · pendiente
export function fijosDelMes(filas, periodo, hoy = hoyTaller()) {
  const lista = Array.isArray(filas) ? filas : []
  const pagos = new Map(lista.filter(g => esPagoDeFijo(g) && g.periodo === periodo).map(g => [g.gasto_fijo_id, g]))
  const mesTerminado = periodo < periodoDe(hoy)
  return lista
    .filter(esFijo)
    // Aplica desde su mes: un gasto fijo cargado en septiembre no aparece
    // "vencido" en agosto.
    .filter(f => periodoDe(f.fecha) <= periodo)
    // Apagado: ya no se espera, pero el mes en que se pago conserva su pago.
    .filter(f => f.activo !== false || pagos.has(f.id))
    .map(fijo => {
      const pago = pagos.get(fijo.id) || null
      const vence = vencimiento(fijo, periodo)
      const estado = pago ? 'pagado' : (mesTerminado || (vence && vence < hoy)) ? 'vencido' : 'pendiente'
      return { fijo, pago, vence, estado }
    })
    .sort((a, b) => RANGO_ESTADO[a.estado] - RANGO_ESTADO[b.estado]
      || String(a.vence || '9').localeCompare(String(b.vence || '9'))
      || String(a.fijo.concepto || '').localeCompare(String(b.fijo.concepto || ''), 'es'))
}

export function sueltosDelMes(filas, periodo) {
  return (Array.isArray(filas) ? filas : [])
    .filter(g => esSuelto(g) && periodoDe(g.fecha) === periodo)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

export function totalesDelMes(fijos, sueltos) {
  const suma = (arr, f) => arr.reduce((s, x) => s + num(f(x)), 0)
  const pagados = fijos.filter(x => x.pago)
  const sinPagar = fijos.filter(x => !x.pago)
  const pagadoFijos = suma(pagados, x => x.pago.monto)
  const totalSueltos = suma(sueltos, g => g.monto)
  return {
    // Lo pagado cuenta por lo que se pago; lo que falta, por lo esperado.
    esperado: pagadoFijos + suma(sinPagar, x => x.fijo.monto),
    pagadoFijos,
    falta: suma(sinPagar, x => x.fijo.monto),
    vencido: suma(fijos.filter(x => x.estado === 'vencido'), x => x.fijo.monto),
    sueltos: totalSueltos,
    salidas: pagadoFijos + totalSueltos,
  }
}

// La clave con que el registro en Cuentti se reconoce a si mismo: si la
// respuesta se pierde y se reintenta, el servidor la encuentra en la bitacora
// (gastos_registrados) y no graba el egreso dos veces.
export const claveCuentti = (fila) => (fila?.gasto_fijo_id
  ? `gasto:${fila.gasto_fijo_id}:${fila.periodo}`
  : `gasto:${fila?.id}`)

// Registrar en Cuentti viene marcado salvo donde casi siempre es un error
// hacerlo desde aqui: la nomina ya sale de Liquidacion y el arriendo lo crea
// Cuentti solo, una compra recurrente al arrendador cada mes (visto el 15 sep
// 2026). El credito va entero como gasto financiero, sin separar intereses:
// decision del dueño del 15 sep 2026.
export const cuenttiPorDefecto = (categoria) => !['nomina', 'arriendo'].includes(categoria)

export function avisoCuentti(categoria) {
  if (categoria === 'arriendo') {
    return 'Cuentti ya crea el arriendo solo, cada mes, como una compra al arrendador. Anótalo aquí para controlar el pago; mandarlo a Cuentti desde aquí lo deja doble.'
  }
  if (categoria === 'nomina') {
    return 'La nómina de los técnicos ya se registra en Cuentti desde Liquidación. Regístrala aquí solo si es otra (sueldos fijos); si es la misma, queda doble.'
  }
  return ''
}

// Lo que falta para poder registrar un gasto en Cuentti: el proveedor (tercero
// del egreso) y la cuenta contable. Sin eso el pago queda solo en la app.
export function faltaParaCuentti(g) {
  const faltan = []
  if (!String(g?.proveedor_nit || '').replace(/\D/g, '')) faltan.push('el NIT o la cédula del proveedor')
  if (!(parseInt(g?.id_plan_cuentas, 10) > 0)) faltan.push('la cuenta de Cuentti')
  return faltan
}

// Devuelve el error en palabras, o null si se puede guardar.
export function validarGasto(g, { fijo = false } = {}) {
  if (!CATEGORIAS_GASTO.some(c => c.clave === g?.categoria)) return 'Elige la categoría'
  if (!String(g?.concepto || '').trim()) return 'Escribe el concepto'
  if (!(num(g?.monto) > 0)) return 'El monto debe ser mayor a 0'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(g?.fecha || ''))) return fijo ? 'Elige desde qué mes aplica' : 'Elige la fecha'
  if (g?.dia_pago != null && g.dia_pago !== '' && !(parseInt(g.dia_pago, 10) >= 1 && parseInt(g.dia_pago, 10) <= 31)) return 'El día de pago va del 1 al 31'
  if (g?.metodo_pago && !METODOS_GASTO.some(m => m.clave === g.metodo_pago)) return 'Método de pago no válido'
  return null
}
