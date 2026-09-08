// Silueta de una pantalla mientras llegan sus datos.
//
// Antes en su lugar salia un "Cargando..." centrado: la pagina se encogia a una
// linea de texto y, al llegar los datos, todo saltaba a su sitio. Aqui se pinta
// la forma que la pantalla VA a tener (titulo, cifras de cabecera y filas de
// 38px), asi que al llegar los datos no se mueve nada.
//
//   filas   cuantas filas de tabla dibujar (por defecto 6)
//   figuras cuantas cifras de cabecera (0 para las pantallas que no llevan)
export default function Esqueleto({ filas = 6, figuras = 3 }) {
  return (
    <div className="sk-page" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando…</span>

      <div className="sk-page__h" aria-hidden="true">
        <div className="sk-b" />
        <div className="sk-b" />
      </div>

      {figuras > 0 && (
        <div className="sk-page__figs" aria-hidden="true">
          {Array.from({ length: figuras }, (_, i) => <div key={i} className="sk-b" />)}
        </div>
      )}

      <div className="sk-page__tbl" aria-hidden="true">
        <div className="sk-th" />
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="sk-tr">
            <div className="sk-b" /><div className="sk-b" /><div className="sk-b" />
          </div>
        ))}
      </div>
    </div>
  )
}
