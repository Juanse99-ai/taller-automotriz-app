export default function Toast({ message, type = 'info', onClose }) {
  return (
    <div className={`toast toast-${type}`} onClick={onClose} role="status" aria-live="polite">
      {message}
    </div>
  )
}
