import { useEffect, useRef } from 'react'

// Diálogo de confirmación propio (reemplaza al confirm() nativo, que rompe la
// estética). Controlado por `cfg`: si es null no muestra nada. Al confirmar cierra
// y ejecuta cfg.onConfirm. Cierra con Escape, con el botón Cancelar o tocando el fondo.
//   cfg = { title, lead?, body?, confirmLabel?, cancelLabel?, tone?: 'primary'|'danger', onConfirm }
export default function ConfirmDialog({ cfg, onClose }) {
  const confirmRef = useRef(null)
  const cajaRef = useRef(null)
  const disparadorRef = useRef(null)
  useEffect(() => {
    if (!cfg) return
    // De donde venia el foco, para devolverlo al cerrar. Sin esto el foco se
    // pierde en el <body> y quien navega con teclado tiene que volver a
    // recorrer la pagina entera desde arriba.
    disparadorRef.current = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      // Trampa de foco: un dialogo modal que deja salir con Tab no es modal.
      // El lector de pantalla se va a leer la pagina de detras, que ademas
      // esta tapada por el fondo oscuro.
      if (e.key !== 'Tab') return
      const foco = cajaRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (!foco?.length) return
      const primero = foco[0], ultimo = foco[foco.length - 1]
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => confirmRef.current?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      disparadorRef.current?.focus?.()
    }
  }, [cfg, onClose])

  if (!cfg) return null
  const danger = cfg.tone === 'danger'

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation" style={{ zIndex: 1000 }}>
      <div
        ref={cajaRef}
        className="modal modal--confirm"
        role="alertdialog" aria-modal="true" aria-label={cfg.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{cfg.title}</h3>
        {cfg.lead && <p className="modal--confirm__lead">{cfg.lead}</p>}
        {cfg.body}
        <div className="modal--confirm__f">
          <button className="btn btn-ghost" onClick={onClose}>{cfg.cancelLabel || 'Cancelar'}</button>
          <button
            ref={confirmRef}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { onClose(); cfg.onConfirm && cfg.onConfirm() }}
          >
            {cfg.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Fila de resumen para el cuerpo del diálogo de pago (etiqueta a la izq, valor a la der).
export function DlgRow({ label, value, total }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '11px 14px', fontSize: 14,
      borderTop: '1px solid var(--border, #e6e8ef)',
      background: total ? 'var(--blue-50, #eef1f9)' : undefined,
      fontWeight: total ? 700 : 400,
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
