import { useEffect, useRef } from 'react'

// Diálogo de confirmación propio (reemplaza al confirm() nativo, que rompe la
// estética). Controlado por `cfg`: si es null no muestra nada. Al confirmar cierra
// y ejecuta cfg.onConfirm. Cierra con Escape, con el botón Cancelar o tocando el fondo.
//   cfg = { title, lead?, body?, confirmLabel?, cancelLabel?, tone?: 'primary'|'danger', onConfirm }
export default function ConfirmDialog({ cfg, onClose }) {
  const confirmRef = useRef(null)
  useEffect(() => {
    if (!cfg) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => confirmRef.current?.focus(), 30)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t) }
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
