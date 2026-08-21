import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Junta clases y deja que la ultima gane cuando dos chocan (p.ej. px-2 y px-4).
// Lo usan todos los componentes de shadcn.
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
