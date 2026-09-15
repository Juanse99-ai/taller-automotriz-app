-- 002 · Los tres gastos fijos del Excel, cargados como gastos fijos de la app.
--
-- Opcional: también se pueden crear a mano en Gastos → "Gasto fijo".
-- Montos del brief. El día de pago del arriendo y de la nómina no venía: quedan
-- sin día y se ponen en la app. Aplican desde septiembre de 2026, así que el
-- pago de septiembre se puede confirmar en la app.
-- Sin proveedor ni cuenta de Cuentti: sin eso sus pagos quedan solo en la app
-- hasta que se completen.
--
-- Solo inserta, y no repite: si ya hay un gasto fijo con ese concepto, lo salta.

insert into public.gastos (fecha, categoria, concepto, monto, recurrente, dia_pago)
select v.fecha, v.categoria, v.concepto, v.monto, true, v.dia_pago
from (values
  (date '2026-09-01', 'arriendo', 'Arriendo del local', 1500000, null::int),
  (date '2026-09-01', 'nomina',   'Nómina',             3160000, null::int),
  (date '2026-09-01', 'credito',  'Crédito del taller', 2500000, 15)
) as v(fecha, categoria, concepto, monto, dia_pago)
where not exists (
  select 1 from public.gastos g where g.recurrente and g.concepto = v.concepto
);
