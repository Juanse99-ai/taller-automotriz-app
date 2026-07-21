// Ícono X (cerrar) limpio y consistente — reemplaza el glifo suelto ✕/× que se
// veía delgado y desalineado. Hereda el color del botón (currentColor).
export default function IconX({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
