// Carga jsPDF solo cuando alguien va a generar un PDF de verdad.
//
// Por que: jspdf + autotable pesan 419 kB y se importaban de forma ESTATICA en
// siete pantallas, incluido el Portal del Cliente. Medido en produccion, un
// cliente que abria el portal desde el celular para ver tres filas de historial
// descargaba 1.078 kB, y 419 de esos eran un generador de PDF que casi nadie
// pulsa. Aqui viaja solo cuando se pide.
//
// Se guarda en cache: si el usuario baja dos PDF seguidos, la libreria se pide
// una sola vez.

let cache = null

export async function cargarPdf() {
  if (!cache) {
    const [mod, auto] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    cache = { jsPDF: mod.jsPDF, autoTable: auto.default }
  }
  return cache
}
