// Carga jsPDF solo cuando alguien va a generar un PDF de verdad.
//
// Por que: jspdf + autotable pesan 419 kB y se importaban de forma ESTATICA en
// siete pantallas, incluido el Portal del Cliente. Medido en produccion, un
// cliente que abria el portal desde el celular para ver tres filas de historial
// descargaba 1.078 kB, y 419 de esos eran un generador de PDF que casi nadie
// pulsa. Aqui viaja solo cuando se pide.
//
// Se guarda en cache: si el usuario baja dos PDF seguidos, la libreria se pide
// una sola vez. Solo se cachea el EXITO, asi que un fallo se puede reintentar.

import { recargarSiEsVersionVieja, esVersionVieja, marca } from './recargaVersion'

const MARCA = 'jspdf'
let cache = null

export async function cargarPdf() {
  if (cache) return cache
  try {
    const [mod, auto] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    cache = { jsPDF: mod.jsPDF, autoTable: auto.default }
    marca.quitar(MARCA)
    return cache
  } catch (err) {
    // Se publico una version nueva con esta pestaña abierta: el navegador esta
    // pidiendo un jspdf con nombre viejo que ya no existe. Se recarga UNA vez.
    // Sin esto, el boton de PDF se quedaba muerto hasta que el usuario recargara
    // por su cuenta, y no habia forma de que supiera que eso era lo que pasaba.
    if (recargarSiEsVersionVieja(MARCA, err)) {
      // La pagina se esta yendo: no se resuelve ni se lanza, para no alcanzar a
      // pintar un error que el usuario no necesita ver.
      return new Promise(() => {})
    }
    // Ya se recargo por jsPDF y sigue fallando, o es otro fallo. Se lanza con un
    // texto que se pueda enseñar tal cual: quien llama solo tiene que mostrarlo.
    throw esVersionVieja(err)
      ? new Error('Se actualizó la aplicación. Recarga la página y vuelve a intentarlo.')
      : new Error(`No se pudo cargar el generador de PDF: ${err?.message || err}`)
  }
}
