// Años de vehículo para los desplegables de captura.
// El handoff lo decidió: "AÑO es lista desplegable en los cuatro formularios
// que lo piden, con el mismo chevron y alineación que Marca, Modelo y
// Cilindraje. En Vehículos sigue siendo columna de tabla: ahí es dato de
// lectura, no campo."
// Se calcula al importar, no se escribe a mano, para que no haya que tocarlo
// cada enero. El +1 es porque los modelos del año entrante ya entran al taller.
export const ANIOS = (() => {
  const tope = new Date().getFullYear() + 1
  const lista = []
  for (let a = tope; a >= 1980; a--) lista.push(String(a))
  return lista
})()
