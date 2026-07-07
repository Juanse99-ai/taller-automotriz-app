// Boton del sistema de diseno. Envuelve las clases .btn / .btn-* de index.css
// (paridad visual con lo que ya existe). No introduce estilos nuevos.
//   variant: primary | outline | ghost | danger | accent | success | warning
//   size:    'sm' para el boton compacto (.btn-sm)
//   icon:    nodo opcional (svg 15px) que va antes del texto
const VARIANTS = new Set(['primary', 'outline', 'ghost', 'danger', 'accent', 'success', 'warning'])

export default function Button({ variant = 'primary', size, icon, children, className = '', type = 'button', ...rest }) {
  const v = VARIANTS.has(variant) ? variant : 'primary'
  const cls = ['btn', `btn-${v}`, size === 'sm' ? 'btn-sm' : '', className].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  )
}
