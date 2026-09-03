// Cuando una pestaña se queda con la version vieja.
//
// La app se descarga por partes (cada seccion, y el generador de PDF) con el
// numero de version en el nombre del archivo. Al publicar una version nueva,
// una pestaña que lleve horas abierta sigue pidiendo los nombres VIEJOS, que ya
// no existen en el servidor: el navegador falla y esa parte no carga. La app no
// esta rota; la pestaña quedo vieja.
//
// Vive aqui, en un solo sitio, porque hay DOS sitios que se descargan aparte
// (las 14 secciones en App.jsx y jsPDF en pdfLazy.js) y dos copias de un
// guardia tan sutil como este acaban separandose.

// Los navegadores redactan este fallo cada uno a su manera; se mira por trozos.
export function esVersionVieja(err) {
  return /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|dynamically imported module/i
    .test(String(err?.message || err))
}

// La marca lleva NOMBRE a proposito. Con una marca global paso esto: la seccion
// rota recargaba, el Dashboard cargaba bien, eso borraba la marca, y volver a la
// seccion rota recargaba otra vez. Bucle infinito de recargas.
//
// Va en sessionStorage y no en una variable porque tiene que sobrevivir justo a
// la recarga que ella misma provoca.
const clave = (nombre) => `taller_recarga:${nombre}`
export const marca = {
  hay: (n) => { try { return !!sessionStorage.getItem(clave(n)) } catch { return false } },
  poner: (n) => { try { sessionStorage.setItem(clave(n), '1') } catch { /* modo privado */ } },
  quitar: (n) => { try { sessionStorage.removeItem(clave(n)) } catch { /* modo privado */ } },
}

// Devuelve true si se hizo cargo (la pagina se esta recargando) y false si el
// error hay que propagarlo: o no es de version, o ya se recargo una vez por
// esta misma cosa y sigue fallando, que es un fallo de verdad.
export function recargarSiEsVersionVieja(nombre, err) {
  if (!esVersionVieja(err) || marca.hay(nombre)) return false
  marca.poner(nombre)
  window.location.reload()
  return true
}
