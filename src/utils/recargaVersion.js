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
  // Los tres ultimos son el mismo problema visto desde otro lado: lo que llego
  // no es JavaScript (una copia guardada dañada, o una pagina de error en su
  // lugar). Tambien se arregla pidiendo la version de verdad, no reintentando.
  // WebKit: "'text/html' is not a valid JavaScript MIME type"; Chrome:
  // "Expected a JavaScript-or-Wasm module script"; Firefox: "disallowed MIME type".
  return /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|dynamically imported module|is not a valid javascript mime type|expected a javascript[\w-]* module script|disallowed mime type/i
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
// Recarga a fondo: suelta el service worker y borra SUS copias antes de pedir
// la pagina otra vez.
//
// Existe porque recargar a secas no alcanza cuando lo que esta dañado es la
// copia guardada: el service worker vuelve a servir lo mismo y la seccion
// sigue sin abrir, recargue quien recargue. Paso el 2026-09-14 en Safari, tras
// el bloqueo del firewall: el servidor estaba sano y Cotizaciones no abria.
//
// Solo borra las caches del service worker (mda-shell-*, mda-assets-*). La
// sesion y los datos guardados viven en localStorage y no se tocan: nadie
// tiene que volver a entrar. El service worker se registra de nuevo solo al
// cargar (main.jsx), ya limpio.
export async function limpiarYRecargar() {
  const limpiar = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
      await Promise.all(regs.map(r => r.unregister()))
    } catch { /* sin service worker: nada que soltar */ }
    try {
      const claves = (await window.caches?.keys?.()) || []
      await Promise.all(claves.filter(k => k.startsWith('mda-')).map(k => window.caches.delete(k)))
    } catch { /* sin Cache Storage: nada que borrar */ }
  }
  // Safari a veces no contesta getRegistrations: pase lo que pase, se recarga.
  await Promise.race([limpiar(), new Promise(r => setTimeout(r, 2500))])
  window.location.reload()
}

export function recargarSiEsVersionVieja(nombre, err) {
  if (!esVersionVieja(err) || marca.hay(nombre)) return false
  marca.poner(nombre)
  window.location.reload()
  return true
}
