// Input de dinero: muestra "$ 30.000" (signo peso + separador de miles colombiano),
// pero entrega el NÚMERO crudo por onChange(v) — no el evento. Si está vacío, da ''.
export default function MoneyInput({
  value,
  onChange,
  placeholder = '0',
  className = 'input',
  style,
  inputStyle,
  ...rest
}) {
  const num = value === '' || value === null || value === undefined ? '' : Number(value)
  const display = num === '' || Number.isNaN(num) ? '' : num.toLocaleString('es-CO')
  const handle = (e) => {
    const digits = (e.target.value || '').replace(/[^\d]/g, '')
    onChange(digits === '' ? '' : Number(digits))
  }
  return (
    <div style={{ position: 'relative', ...style }}>
      <span aria-hidden="true" style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-4)', pointerEvents: 'none', fontSize: 14, fontWeight: 600,
      }}>$</span>
      <input
        className={className}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handle}
        placeholder={placeholder}
        style={{ paddingLeft: 24, ...inputStyle }}
        {...rest}
      />
    </div>
  )
}
