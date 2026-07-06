import { NumericFormat } from 'react-number-format'

// Input de dinero: muestra "$ 30.000" (signo peso + separador de miles colombiano),
// pero entrega el NÚMERO crudo por onChange(v) — no el evento. Si está vacío, da ''.
// Usa react-number-format (NumericFormat) para el formateo mientras se escribe, con
// caret estable y parseo robusto (pegar "1.234,50" ya no multiplica el monto).
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
  return (
    <div style={{ position: 'relative', ...style }}>
      <span aria-hidden="true" style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-4)', pointerEvents: 'none', fontSize: 14, fontWeight: 600,
      }}>$</span>
      <NumericFormat
        className={className}
        value={num === '' || Number.isNaN(num) ? '' : num}
        thousandSeparator="."
        decimalSeparator=","
        decimalScale={0}
        allowNegative={false}
        inputMode="numeric"
        placeholder={placeholder}
        style={{ paddingLeft: 24, ...inputStyle }}
        onValueChange={(vals, src) => {
          // Solo reaccionar a lo que escribe el usuario (no a cambios del prop value),
          // para no disparar onChange en bucle.
          if (src.source !== 'event') return
          onChange(vals.floatValue === undefined ? '' : vals.floatValue)
        }}
        {...rest}
      />
    </div>
  )
}
