-- 002 · Vista trabajos_saldo: cuánto vale, cuánto se ha abonado y cuánto falta.
--
-- `saldo` respeta `trabajos.pagado`: si la orden está marcada pagada (porque
-- Cuentti la dio por saldada, aunque la factura allá tuviera un descuento y los
-- recibos no lleguen al total de la app), el saldo es 0. Cuentti manda en lo
-- contable; la app nunca "des-paga" sola.
--
-- `deleted is not true` y no `= false`: hoy no hay nulos, pero si mañana los
-- hay, una fila con `deleted = null` es una orden viva y no debe desaparecer.
--
-- security_invoker: la vista se consulta con los permisos de QUIEN pregunta,
-- no con los del dueño de la base. Sin esto, Supabase la marca como error de
-- seguridad (una vista así se salta la RLS de las tablas que lee).

create or replace view public.trabajos_saldo with (security_invoker = true) as
select
  t.id,
  t.ot_codigo,
  t.cliente,
  t.cedula_cliente,
  t.telefono_cliente,
  t.placa,
  t.fecha,
  t.facturado_en,
  t.estado,
  t.pagado,
  t.cuentti_id_transacion,
  coalesce(t.total, 0)                                        as total,
  coalesce(p.abonado, 0)                                      as abonado,
  case when t.pagado is true then 0
       else greatest(coalesce(t.total, 0) - coalesce(p.abonado, 0), 0) end as saldo,
  p.ultimo_pago,
  coalesce(p.n_pagos, 0)                                      as n_pagos,
  case when t.pagado is true or coalesce(p.abonado, 0) >= coalesce(t.total, 0) then 'pagado'
       when coalesce(p.abonado, 0) > 0                                         then 'parcial'
       else 'pendiente' end                                   as estado_pago,
  case when t.facturado_en is null then null
       else (current_date - t.facturado_en::date) end          as dias_facturada
from public.trabajos t
left join (
  select trabajo_id, sum(monto) as abonado, max(fecha) as ultimo_pago, count(*) as n_pagos
  from public.pagos
  group by trabajo_id
) p on p.trabajo_id = t.id
where t.deleted is not true;
