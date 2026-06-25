import { motion } from 'motion/react'

// Switch estilo Material Design 3 adaptado a ESTE stack (JSX + CSS + motion, sin
// Tailwind/shadcn/lucide). El "thumb" desliza con resorte (spring) y crece al
// activarse. Usa la paleta de la app (var(--primary) por defecto para el "on").
//
// Props:
//   checked        boolean
//   onChange(next) recibe el nuevo valor (true/false)
//   checkedIcon    nodo opcional dentro del thumb cuando está ON
//   uncheckedIcon  nodo opcional dentro del thumb cuando está OFF
//   onColor        color del track/borde en ON (default var(--primary))
//   disabled, ariaLabel, title
export default function Switch({
  checked,
  onChange,
  checkedIcon,
  uncheckedIcon,
  onColor = 'var(--primary)',
  disabled = false,
  ariaLabel,
  title,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => { if (!disabled) onChange(!checked) }}
      className="m3switch"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        width: 52,
        height: 32,
        padding: 4,
        borderRadius: 16,
        boxSizing: 'border-box',
        border: '2px solid',
        borderColor: checked ? onColor : 'var(--border-strong)',
        background: checked ? onColor : 'var(--bg-subtle)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background .25s, border-color .25s',
        flexShrink: 0,
      }}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 480, damping: 28 }}
        style={{
          width: checked ? 24 : 18,
          height: checked ? 24 : 18,
          borderRadius: '50%',
          background: checked ? '#fff' : 'var(--text-3)',
          color: checked ? onColor : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,.25)',
          flexShrink: 0,
        }}
      >
        {checked ? checkedIcon : uncheckedIcon}
      </motion.span>
    </button>
  )
}
