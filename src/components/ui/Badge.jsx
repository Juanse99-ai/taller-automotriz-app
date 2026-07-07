// Etiqueta de estado. Envuelve .badge / .badge-* de index.css.
//   tone: success | warning | info | danger | neutral | purple
//   (acepta alias cortos s|w|i|d|n|p por compat con el CSS legacy)
const ALIAS = {
  success: 'success', warning: 'warning', info: 'info', danger: 'danger', neutral: 'neutral', purple: 'purple',
  s: 'success', w: 'warning', i: 'info', d: 'danger', n: 'neutral', p: 'purple',
}

export default function Badge({ tone = 'neutral', children, className = '', ...rest }) {
  const t = ALIAS[tone] || 'neutral'
  return (
    <span className={`badge badge-${t} ${className}`.trim()} {...rest}>
      {children}
    </span>
  )
}
