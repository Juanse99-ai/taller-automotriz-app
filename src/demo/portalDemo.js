import { ESTADOS, ESTADOS_COTIZACION } from '../utils/constants'

// Portal de demostracion: /portal?c=demo (o escribir "demo" como cedula).
//
// Sirve para enseñarle a un cliente como va a seguir su carro sin mostrarle el
// de nadie. En modo demo el portal NO consulta la base: toma estas filas, y lo
// que el visitante haga (firmar una cotizacion, pagar) no se guarda.
//
// Las filas tienen la MISMA forma que las de Supabase y pasan por los mismos
// conversores del portal, asi que si el portal cambia, la demo cambia con el.
// Solo trae lo que un cliente real ve hoy: sin inspecciones ni tecnico
// asignado, que el portal publico no recibe. Prometer en la demo algo que el
// cliente despues no encuentra seria peor que no enseñarlo.
//
// Las fechas se cuentan desde hoy, para que la demo siempre este al dia. Las
// fotos y el video viven en public/demo/.

export const CEDULA_DEMO = 'demo'
export const esDemo = (cedula) => String(cedula || '').trim().toLowerCase() === CEDULA_DEMO

const DIA = 86400000
const haceDias = (n) => new Date(Date.now() - n * DIA).toISOString()
const dentroDeDias = (n) => new Date(Date.now() + n * DIA).toISOString().slice(0, 10)
const M = '/demo/'

const CLIENTE = 'LAURA GÓMEZ'
const CARRO = { placa: 'DEM024', marca: 'Chevrolet', modelo: 'Onix', ano: 2020 }

const item = (nombre, precio, cantidad = 1, esServicio = false) => ({ nombre, precio, cantidad, esServicio })
const totalDe = (items) => items.reduce((s, i) => s + i.precio * i.cantidad, 0)

export function trabajosDemo() {
  const enTaller = [
    item('RÓTULA INFERIOR DELANTERA', 98000, 2),
    item('SOPORTE DE MOTOR DERECHO', 165000),
    item('BUJÍA DE IRIDIO', 38000, 4),
    item('MANO DE OBRA SUSPENSIÓN Y SOPORTE DE MOTOR', 140000, 1, true),
  ]
  const aceite = [
    item('ACEITE SINTÉTICO 5W-30 (CUARTO)', 38000, 4),
    item('FILTRO DE ACEITE', 28000),
    item('FILTRO DE AIRE', 35000),
    item('MANO DE OBRA CAMBIO DE ACEITE', 20000, 1, true),
  ]
  const alineacion = [
    item('ALINEACIÓN', 55000, 1, true),
    item('BALANCEO 4 RUEDAS', 40000, 1, true),
  ]
  const base = { cedula_cliente: CEDULA_DEMO, cliente: CLIENTE, ...CARRO, sin_vehiculo: false, tecnico_id: null }
  return [
    {
      ...base,
      id: 'demo-3', ot_codigo: 'OT-DEMO-3', fecha: haceDias(2), created_at: haceDias(2), kilometraje: 48210,
      estado: ESTADOS.EN_PROGRESO,
      observaciones: 'Entró por un golpe en la suspensión delantera al pasar por huecos y vibración del motor en mínimo. La rótula tenía juego y el soporte de motor estaba vencido: ya los estamos cambiando. También cambiamos las bujías.',
      items: JSON.stringify(enTaller), total: totalDe(enTaller), pagado: false, facturado_en: null,
      ingreso: JSON.stringify({ combustible: 4, inventario: ['documentos', 'rueda_repuesto', 'gato', 'llave_ruedas'], estado: 'Rayón leve en el bómper trasero.' }),
      evidencias: JSON.stringify([
        { id: 'demo-e1', tipo: 'foto', url: M + 'soporte-motor.jpg', nota: 'Soporte de motor con el caucho agrietado: de ahí venía la vibración en mínimo.' },
        { id: 'demo-e2', tipo: 'video', url: M + 'rotula.mp4', poster: M + 'rotula-portada.jpg', nota: 'La rótula vieja tenía juego y por eso golpeaba. Al lado, la nueva que le instalamos.' },
        { id: 'demo-e3', tipo: 'foto', url: M + 'bujias.jpg', nota: 'Bujías con el electrodo gastado. Cambiamos las cuatro.' },
        { id: 'demo-e4', tipo: 'foto', url: M + 'amortiguador.jpg', nota: 'Los amortiguadores delanteros ya perdieron firmeza. Le dejamos la cotización para cambiarlos.' },
      ]),
    },
    {
      ...base,
      id: 'demo-2', ot_codigo: 'OT-DEMO-2', fecha: haceDias(21), created_at: haceDias(21), kilometraje: 47930,
      estado: ESTADOS.COMPLETADO,
      observaciones: 'Cambio de aceite y filtros. Revisamos el nivel del refrigerante y del líquido de frenos.',
      items: JSON.stringify(aceite), total: totalDe(aceite), pagado: false, facturado_en: haceDias(21),
      tipo_aceite: '5W-30 sintético', proximo_km: 52900, proxima_visita: dentroDeDias(150),
      notas_proximo_mant: 'En la próxima visita conviene revisar las pastillas de freno: van por la mitad.',
      evidencias: '[]',
    },
    {
      ...base,
      id: 'demo-1', ot_codigo: 'OT-DEMO-1', fecha: haceDias(128), created_at: haceDias(128), kilometraje: 44120,
      estado: ESTADOS.COMPLETADO,
      observaciones: 'Alineación y balanceo. Rotamos las llantas.',
      items: JSON.stringify(alineacion), total: totalDe(alineacion), pagado: true, facturado_en: haceDias(128),
      evidencias: '[]',
    },
  ]
}

export function cotizacionesDemo() {
  const items = [
    item('AMORTIGUADOR DELANTERO', 245000, 2),
    item('BASE DE AMORTIGUADOR', 52000, 2),
    item('MANO DE OBRA CAMBIO DE AMORTIGUADORES', 120000, 1, true),
    item('ALINEACIÓN', 55000, 1, true),
  ]
  const total = totalDe(items)
  const subtotal = Math.round(total / 1.19)
  return [{
    id: 'demo-cot-1', fecha: haceDias(1), cliente: CLIENTE, ...CARRO,
    items: JSON.stringify(items), subtotal, iva: total - subtotal, total,
    observaciones: 'Los amortiguadores delanteros perdieron firmeza. No es urgente, pero conviene cambiarlos antes de un viaje largo.',
    validez_dias: 15, estado: ESTADOS_COTIZACION.PENDIENTE, aprobada_en: null,
  }]
}
