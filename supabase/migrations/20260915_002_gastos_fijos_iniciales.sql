-- 002 · Los gastos fijos del modelo financiero, cargados como gastos fijos de la app.
--
-- Opcional: también se pueden crear a mano en Gastos → "Gasto fijo".
-- Confirmados por el dueño el 15 sep 2026:
--   - Dos arriendos (el Excel los sumaba en $1.500.000): el local de repuestos
--     $1.000.000, que Cuentti ya crea solo cada mes como compra al arrendador, y
--     el taller $500.000.
--   - Crédito del taller $2.500.000 el día 15.
--   - La "nómina $3.160.000" son tres sueldos fijos que no pasan por
--     Liquidación: administrador, ayudante de taller y servicios generales. El
--     sueldo de gerencia ($2.000.000) no se carga: hoy no se saca.
-- El día de pago que no se conoce queda vacío y se pone en la app. Aplican desde
-- septiembre de 2026, así que el pago de septiembre se puede confirmar en la app.
-- Sin proveedor ni cuenta de Cuentti: sin eso sus pagos quedan solo en la app
-- hasta que se completen.
--
-- Solo inserta, y no repite: si ya hay un gasto fijo con ese concepto, lo salta.

insert into public.gastos (fecha, categoria, concepto, monto, recurrente, dia_pago, nota)
select v.fecha, v.categoria, v.concepto, v.monto, true, v.dia_pago, v.nota
from (values
  (date '2026-09-01', 'arriendo', 'Arriendo del local de repuestos', 1000000, null::int, 'Cuentti lo crea solo cada mes como compra al arrendador'),
  (date '2026-09-01', 'arriendo', 'Arriendo del taller',               500000, null::int, null),
  (date '2026-09-01', 'credito',  'Crédito del taller',               2500000, 15,        null),
  (date '2026-09-01', 'nomina',   'Sueldo administrador',              960000, null::int, '$40.000 × 24 días'),
  (date '2026-09-01', 'nomina',   'Sueldo ayudante de taller',        1200000, null::int, '$50.000 × 24 días'),
  (date '2026-09-01', 'nomina',   'Servicios generales (medio día)',  1000000, null::int, null)
) as v(fecha, categoria, concepto, monto, dia_pago, nota)
where not exists (
  select 1 from public.gastos g where g.recurrente and g.concepto = v.concepto
);
