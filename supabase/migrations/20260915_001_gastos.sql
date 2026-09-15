-- 001 · Gastos del taller: los fijos de cada mes (arriendo, nómina, crédito…)
-- y los sueltos.
--
-- Hoy los gastos fijos viven en un Excel y la app no registra egresos, así que
-- el flujo de caja no se puede armar solo. Es la tabla del brief con seis
-- columnas más: la app necesita saber de qué gasto fijo es cada pago y de qué
-- mes, y lo que Cuentti pide para registrar el egreso.
--
-- Una tabla, tres clases de fila:
--   gasto fijo    recurrente = true. Lo que se paga cada mes: monto esperado,
--                 dia_pago y desde qué mes aplica (fecha). Se apaga con activo.
--   pago del mes  recurrente = false, con gasto_fijo_id y periodo ('2026-09').
--                 Lo crea "Confirmar pago"; monto es lo que se pagó de verdad.
--   gasto suelto  recurrente = false, sin gasto_fijo_id.
--
-- Además de las columnas del brief: gasto_fijo_id, periodo, proveedor_nit,
-- id_plan_cuentas, iva y cuentti_ref (cada una explica abajo para qué es).
--
-- Idempotente: se puede correr dos veces. No toca ninguna tabla existente.

create table if not exists public.gastos (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null default current_date,
  categoria        text not null
                   check (categoria in ('arriendo', 'nomina', 'servicios', 'credito', 'otros')),
  concepto         text not null check (length(trim(concepto)) > 0),
  monto            numeric(14,2) not null check (monto > 0),
  metodo_pago      text check (metodo_pago in ('efectivo', 'transferencia')),
  proveedor        text,
  recurrente       boolean not null default false,
  dia_pago         int check (dia_pago between 1 and 31),
  activo           boolean not null default true,
  nota             text,

  -- Lo que se agrega al diseño del brief ----------------------------------
  -- De qué gasto fijo es este pago. RESTRICT: un gasto fijo con pagos no se
  -- borra, se apaga (activo = false) y su historia queda.
  gasto_fijo_id    uuid references public.gastos(id) on delete restrict,
  -- Mes que cubre el pago. Puede no ser el de `fecha`: el arriendo de
  -- septiembre pagado el 2 de octubre es de septiembre.
  periodo          text check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- El tercero del egreso en Cuentti y la cuenta del plan contable. Sin los
  -- dos el pago queda solo en la app.
  proveedor_nit    text,
  id_plan_cuentas  int check (id_plan_cuentas > 0),
  -- IVA que YA trae el monto (un arriendo comercial lo lleva): Cuentti separa
  -- la base del impuesto. Solo 0 o 19, las dos tarifas que el taller usa.
  iva              numeric(5,2) not null default 0 check (iva in (0, 19)),
  -- Documento del egreso en Cuentti (G-<número>), cuando se registró allá.
  cuentti_ref      text,
  created_at       timestamptz not null default now(),

  -- Un pago del mes siempre dice de qué gasto fijo y de qué mes es; un gasto
  -- fijo o uno suelto no tienen ninguno de los dos.
  constraint gastos_pago_con_su_mes check ((gasto_fijo_id is null) = (periodo is null)),
  constraint gastos_fijo_no_es_pago check (not (recurrente and gasto_fijo_id is not null))
);

-- Un solo pago por gasto fijo por mes: confirmar dos veces (doble toque, dos
-- teléfonos a la vez) no puede dejar el arriendo pagado dos veces.
create unique index if not exists gastos_un_pago_por_mes
  on public.gastos (gasto_fijo_id, periodo) where gasto_fijo_id is not null;
create index if not exists idx_gastos_fecha on public.gastos (fecha);

-- Mismo esquema que `pagos`: las políticas para anon existen porque el proxy de
-- la app todavía usa la llave anon (y ahí exige sesión de administrador). A
-- diferencia de un abono, un gasto fijo sí se edita: sube el arriendo, cambia
-- el día de pago.
alter table public.gastos enable row level security;
drop policy if exists gastos_select on public.gastos;
drop policy if exists gastos_insert on public.gastos;
drop policy if exists gastos_update on public.gastos;
drop policy if exists gastos_delete on public.gastos;
create policy gastos_select on public.gastos for select to anon, authenticated using (true);
create policy gastos_insert on public.gastos for insert to anon, authenticated with check (true);
create policy gastos_update on public.gastos for update to anon, authenticated using (true) with check (true);
create policy gastos_delete on public.gastos for delete to anon, authenticated using (true);
