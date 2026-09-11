-- 003 · Migración inicial: un pago por cada orden que ya estaba pagada.
--
-- Sin esto, la vista diría "pendiente" en 191 órdenes que sí se cobraron.
-- Medido antes de escribir esto: 191 órdenes vivas con pagado = true, ninguna
-- con total 0 ni sin facturado_en.
--
-- Método: se conserva el de la orden cuando es una forma de pago real. 'credito'
-- (26 órdenes) y sin método (15) van como 'otro': "crédito" es "quedó debiendo
-- y luego pagó", no dice cómo pagó.
--
-- Idempotente: solo inserta si la orden no tiene ya su fila de origen 'migracion'.
-- NO modifica `trabajos`.

insert into public.pagos (trabajo_id, fecha, monto, metodo, nota, origen)
select
  t.id,
  coalesce(t.facturado_en::date, t.fecha::date, current_date),
  t.total,
  case when t.metodo_pago in ('efectivo', 'transferencia', 'wompi') then t.metodo_pago else 'otro' end,
  'migración inicial',
  'migracion'
from public.trabajos t
where t.pagado is true
  and t.deleted is not true
  and coalesce(t.total, 0) > 0
  and not exists (
    select 1 from public.pagos p where p.trabajo_id = t.id and p.origen = 'migracion'
  );

-- Comprobación (debería dar 191 la primera vez y lo mismo después):
-- select count(*) from public.pagos where origen = 'migracion';
