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
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center',
        padding: 16, background: 'rgba(13,27,53,.72)', animation: 'cdlgIn .12s ease-out',
      }}
    >
      <style>{`@keyframes cdlgIn{from{opacity:0}to{opacity:1}}`}</style>
      <div
        ref={cajaRef}
        role="alertdialog" aria-modal="true" aria-label={cfg.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)', background: 'var(--bg-raised)', borderRadius: 16, padding: 24,
          boxShadow: 'var(--shadow-lg)', color: 'var(--text)', border: '1px solid var(--border)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>{cfg.title}</h3>
        {cfg.lead && <p style={{ margin: '6px 0 18px', color: 'var(--text-3, #5b6472)', fontSize: 14, lineHeight: 1.45 }}>{cfg.lead}</p>}
        {cfg.body}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
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
