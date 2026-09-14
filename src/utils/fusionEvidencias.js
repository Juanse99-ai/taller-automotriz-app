// Evidencias de una OT cuando dos personas la tocan a la vez.
//
// El formulario de la oficina guarda la lista ENTERA de evidencias, y el mecanico
// sube las suyas desde el taller mientras tanto (TrabajosMecanico). Sin esto, la
// oficina abria la OT, Anderson subia tres fotos y al guardar la oficina las
// borraba sin que nadie se enterara.
//
// Fusion a tres bandas:
//   base    = lo que habia en la base al abrir el formulario
//   mias    = lo que queda en el formulario al guardar
//   frescas = lo que hay en la base justo antes de guardar
// Gana lo que cambio cada uno: lo que otro subio despues de abrir se agrega, lo
// que otro quito y aqui nadie toco se va, y una evidencia que aqui no se toco
// toma la version fresca (por ejemplo, una nota que escribio el mecanico).

const clave = (e) => e?.id || e?.url || (e?.dataUrl || '').slice(0, 40)
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function fusionarEvidencias(base, mias, frescas) {
  if (!Array.isArray(base) || !Array.isArray(frescas) || !Array.isArray(mias)) return mias
  const enBase = new Map(base.map(e => [clave(e), e]))
  const enFrescas = new Map(frescas.map(e => [clave(e), e]))
  const enMias = new Set(mias.map(clave))
  const out = []
  for (const e of mias) {
    const k = clave(e)
    const antes = enBase.get(k)
    const intacta = antes !== undefined && igual(antes, e)
    if (intacta && !enFrescas.has(k)) continue // otra persona la quito
    out.push(intacta ? enFrescas.get(k) : e)
  }
  for (const e of frescas) {
    const k = clave(e)
    if (!enBase.has(k) && !enMias.has(k)) out.push(e) // llego despues de abrir
  }
  return out
}
