-- 004 · Mantener `trabajos.pagado` sincronizado con los abonos.
--
-- Solo hacia arriba: cuando los abonos cubren el total, la orden queda pagada.
-- NUNCA la des-marca: si un pago se borra por error, la app lo hace explícito
-- (es una acción del usuario, no una consecuencia silenciosa), y Cuentti puede
-- haber dado la factura por saldada con un descuento que la app no conoce.
-- Tolerancia de $1 por el redondeo de centavos de Cuentti.

-- search_path vacío: la función usa nombres completos (public.pagos,
-- public.trabajos), así que nadie puede colarle una tabla con el mismo nombre.
create or replace function public.pagos_actualiza_pagado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trabajo text;
  v_abonado numeric;
  v_total   numeric;
begin
  v_trabajo := coalesce(new.trabajo_id, old.trabajo_id);
  select coalesce(sum(monto), 0) into v_abonado from public.pagos where trabajo_id = v_trabajo;
  select coalesce(total, 0)      into v_total   from public.trabajos where id = v_trabajo;
  if v_total > 0 and v_abonado >= v_total - 1 then
    update public.trabajos set pagado = true
     where id = v_trabajo and pagado is not true;
  end if;
  return null;
end;
$$;

drop trigger if exists pagos_pagado on public.pagos;
create trigger pagos_pagado
  after insert or update or delete on public.pagos
  for each row execute function public.pagos_actualiza_pagado();
