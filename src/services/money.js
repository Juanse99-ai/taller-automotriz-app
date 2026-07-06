import { dinero, allocate, toSnapshot } from 'dinero.js'

// Dinero exacto en pesos colombianos ENTEROS. COP no usa centavos en la práctica,
// así que trabajamos con exponent 0 → 1 unidad = 1 peso. Toda la matemática de plata
// del módulo de liquidación pasa por aquí para evitar el "polvo" de los flotantes.
export const COP = { code: 'COP', base: 10, exponent: 0 }

// Crea un Dinero en pesos enteros (redondea por si entra un flotante).
export const money = (pesos) => dinero({ amount: Math.round(Number(pesos) || 0), currency: COP })

// Pesos enteros a partir de un Dinero.
export const toPesos = (d) => toSnapshot(d).amount

// Porcentaje de un monto (ej. comisión = M.O. × 0.4), redondeado al peso.
// Mantiene el redondeo half-up de Math.round que ya usa toda la app (para no
// cambiar ni un peso de lo que hoy se paga).
export const pct = (pesos, factor) => Math.round((Number(pesos) || 0) * factor)

// Reparte un monto ENTERO en partes según ratios SIN perder ni un peso: el residuo
// va a las primeras partes (allocate de dinero.js). Ej. repartir(31933, [1,1]) = [15967, 15966].
export const repartir = (pesos, ratios) => {
  const total = Math.round(Number(pesos) || 0)
  if (total === 0) return ratios.map(() => 0)
  return allocate(money(total), ratios).map(toPesos)
}

// Comisión de un trabajo COMPARTIDO repartida 20/20 en dos mitades EXACTAS
// [asignado, compañero] que suman round(M.O. × factor). Antes cada mitad se
// redondeaba por separado y asignado+compañero podían ganar/perder ≤1 peso.
export const splitComision = (moPesos, factor = 0.40) => repartir(pct(moPesos, factor), [1, 1])
