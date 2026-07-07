// Campo de formulario del sistema. Envuelve .field (label + control + ayuda/error)
// e Input/Select/Textarea envuelven .input de index.css. Paridad visual.
export function Field({ label, required, help, error, htmlFor, children, className = '' }) {
  return (
    <div className={`field ${className}`.trim()}>
      {label && (
        <label htmlFor={htmlFor}>
          {label}{required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error
        ? <span className="help" style={{ color: 'var(--red-600)' }}>{error}</span>
        : help ? <span className="help">{help}</span> : null}
    </div>
  )
}

export function Input({ className = '', ...rest }) {
  return <input className={`input ${className}`.trim()} {...rest} />
}

export function Select({ className = '', children, ...rest }) {
  return <select className={`input ${className}`.trim()} {...rest}>{children}</select>
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`input ${className}`.trim()} {...rest} />
}
