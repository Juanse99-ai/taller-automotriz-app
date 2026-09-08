// Aviso corto. En escritorio entra por la derecha arriba; en el celular sube
// desde abajo (arriba tapaba la campana y el buscador, y quedaba lejos del pulgar).
//
//   accion  opcional: { label, onClick } para lo que se puede revertir.
//           Al pulsarlo se ejecuta y el aviso se cierra.
export default function Toast({ message, type = 'info', accion, onClose }) {
  return (
    <div className={`toast toast-${type}`} role="status" aria-live="polite">
      <span className="toast__m" onClick={onClose}>{message}</span>
      {accion && (
        <button
          type="button"
          className="toast__a"
          onClick={() => { accion.onClick(); onClose() }}
        >
          {accion.label}
        </button>
      )}
    </div>
  )
}
