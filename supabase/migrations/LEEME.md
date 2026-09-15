# Migraciones de Supabase

Se aplican **a mano y en orden** en el editor SQL de Supabase (Dashboard → SQL Editor).
Cada archivo es idempotente: correrlo dos veces no duplica nada.

| Archivo | Qué hace | Toca datos existentes |
|---|---|---|
| `20260911_001_pagos.sql` | Crea la tabla `pagos` (abonos de clientes a una OT) | No |
| `20260911_002_trabajos_saldo.sql` | Crea la vista `trabajos_saldo` (total, abonado, saldo, estado_pago) | No |
| `20260911_003_backfill_pagos.sql` | Un pago por cada OT que ya estaba `pagado = true` | **Solo inserta** en `pagos` (191 filas esperadas). No modifica `trabajos` |
| `20260911_004_trigger_pagado.sql` | Cuando los abonos cubren el total, marca `trabajos.pagado = true` | Solo hacia `true`, nunca al revés |
| `20260914_001_insumos_propuestos.sql` | Insumos que carga el mecánico para que la oficina los revise | No |
| `20260915_001_gastos.sql` | Crea la tabla `gastos`: los gastos fijos de cada mes, sus pagos y los gastos sueltos (pantalla Gastos) | No |
| `20260915_002_gastos_fijos_iniciales.sql` | **Opcional.** Carga los tres gastos fijos del Excel: arriendo $1.500.000, nómina $3.160.000 y crédito $2.500.000 el día 15 | **Solo inserta** en `gastos` (3 filas); no repite si ya existen |

Después de aplicarlas, en la app: Cartera → "Actualizar desde Cuentti" baja los recibos
reales de las facturas que siguen sin pagar.
