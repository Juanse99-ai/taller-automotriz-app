# Migraciones de Supabase

Se aplican **a mano y en orden** en el editor SQL de Supabase (Dashboard → SQL Editor).
Cada archivo es idempotente: correrlo dos veces no duplica nada.

| Archivo | Qué hace | Toca datos existentes |
|---|---|---|
| `20260911_001_pagos.sql` | Crea la tabla `pagos` (abonos de clientes a una OT) | No |
| `20260911_002_trabajos_saldo.sql` | Crea la vista `trabajos_saldo` (total, abonado, saldo, estado_pago) | No |
| `20260911_003_backfill_pagos.sql` | Un pago por cada OT que ya estaba `pagado = true` | **Solo inserta** en `pagos` (191 filas esperadas). No modifica `trabajos` |
| `20260911_004_trigger_pagado.sql` | Cuando los abonos cubren el total, marca `trabajos.pagado = true` | Solo hacia `true`, nunca al revés |

Después de aplicarlas, en la app: Cartera → "Actualizar desde Cuentti" baja los recibos
reales de las facturas que siguen sin pagar.
