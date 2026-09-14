// Estados de una OT y de una cotizacion TAL COMO SE GUARDAN en Supabase.
//
// Es el unico sitio donde se escriben. La app (src/) y los servidores MCP (api/)
// importan de aqui: cuando cada uno tenia sus propios strings, el MCP del taller
// filtraba por 'Entregado', 'Listo' y 'En Proceso', que la app nunca escribe, y
// el dashboard reportaba $0 de ingresos con 217 OT completadas.
//
// Sin imports a proposito: las funciones de Vercel lo cargan con Node, sin Vite.
// Los valores no se cambian: son los de miles de filas ya guardadas.

/** Estados de una orden de trabajo (columna trabajos.estado). */
export const ESTADOS = Object.freeze({
  PENDIENTE: 'Pendiente',
  EN_DIAGNOSTICO: 'En Diagnostico',
  ESPERANDO_REPUESTOS: 'Esperando Repuestos',
  EN_PROGRESO: 'En Progreso',
  EN_PRUEBA: 'En Prueba',
  PROGRAMADO: 'Programado',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
})

/** @typedef {typeof ESTADOS[keyof typeof ESTADOS]} EstadoOT */

/**
 * OT que siguen en el taller: todo lo que no esta Completado ni Cancelado.
 * Se deriva del catalogo en vez de listarse, para que un estado nuevo cuente
 * como activo desde el primer dia en lugar de quedar fuera sin que nadie lo vea.
 * @type {readonly EstadoOT[]}
 */
export const ESTADOS_ACTIVOS = Object.freeze(
  Object.values(ESTADOS).filter(e => e !== ESTADOS.COMPLETADO && e !== ESTADOS.CANCELADO),
)

/** Estados de una cotizacion (columna cotizaciones.estado). */
export const ESTADOS_COTIZACION = Object.freeze({
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  FACTURADA: 'Facturada',
})

/** @typedef {typeof ESTADOS_COTIZACION[keyof typeof ESTADOS_COTIZACION]} EstadoCotizacion */

/** @param {unknown} valor @returns {valor is EstadoOT} */
export const esEstadoOT = (valor) => Object.values(ESTADOS).includes(/** @type {EstadoOT} */ (valor))

/** @param {unknown} valor @returns {valor is EstadoCotizacion} */
export const esEstadoCotizacion = (valor) =>
  Object.values(ESTADOS_COTIZACION).includes(/** @type {EstadoCotizacion} */ (valor))

// Como se ESCRIBE cada estado en pantalla. El valor guardado no se toca; este
// mapa solo arregla la ortografia al mostrarlo y baja el Title Case ingles a
// mayuscula inicial, que es como se escribe en español.
const ROTULO_ESTADO = {
  [ESTADOS.EN_DIAGNOSTICO]: 'En diagnóstico',
  [ESTADOS.ESPERANDO_REPUESTOS]: 'Esperando repuestos',
  [ESTADOS.EN_PROGRESO]: 'En progreso',
  [ESTADOS.EN_PRUEBA]: 'En prueba',
}

/** @param {string | null | undefined} estado */
export const rotuloEstado = (estado) => ROTULO_ESTADO[estado] || estado || ''
