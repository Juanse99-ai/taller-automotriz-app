-- 001 · Tabla de pagos: abonos de clientes a una orden de trabajo.
--
-- Hoy `trabajos.pagado` es sí/no y un abono parcial no cabe en ninguna parte:
-- la OT-0221 se facturó por $6.704.000, el cliente abonó $5.635.000 y ninguna
-- de las dos marcas (pagada / sin pagar) dice la verdad.
--
-- Cada fila es UN pago. Vienen de tres sitios (columna `origen`):
--   manual     registrado en la app
--   cuentti    recibo de caja de la factura, bajado de Cuentti (idempotente por
--              `cuentti_ref` = 'cuentti:<id_comprobante_caja>')
--   migracion  creado por 003 para las órdenes que ya estaban pagadas
--
-- Idempotente: se puede correr dos veces.

create table if not exists public.pagos (
  id          uuid primary key default gen_random_uuid(),
  trabajo_id  text not null references public.trabajos(id) on delete cascade,
  fecha       date not null default current_date,
  monto       numeric(14,2) not null check (monto > 0),
  metodo      text not null default 'efectivo'
              check (metodo in ('efectivo', 'transferencia', 'credito', 'wompi', 'otro')),
  nota        text,
  origen      text not null default 'manual'
              check (origen in ('manual', 'cuentti', 'migracion')),
  cuentti_ref text unique,
  created_at  timestamptz not null default now()
);

create index if not exists idx_pagos_trabajo on public.pagos (trabajo_id);
create index if not exists idx_pagos_fecha   on public.pagos (fecha);

-- Es plata: un pago se registra o se borra, nunca se edita por fuera. Sin
-- política de UPDATE. (Las políticas para `anon` existen porque el proxy de la
-- app todavía usa la llave anon; el día que pase a la llave de servicio, se
-- quitan y la tabla queda cerrada al público.)
alter table public.pagos enable row level security;
drop policy if exists pagos_select on public.pagos;
drop policy if exists pagos_insert on public.pagos;
drop policy if exists pagos_delete on public.pagos;
create policy pagos_select on public.pagos for select to anon, authenticated using (true);
create policy pagos_insert on public.pagos for insert to anon, authenticated with check (true);
create policy pagos_delete on public.pagos for delete to anon, authenticated using (true);
