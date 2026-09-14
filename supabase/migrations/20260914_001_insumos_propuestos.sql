-- 001 · Insumos que carga el taller (rol mecanico) y que la oficina revisa.
--
-- Un mecanico no escribe en `items`: esas lineas son las que se facturan y las
-- que suman el total. Lo que carga queda aqui, cada entrada con su estado:
--   pendiente   recien cargado; no afecta totales, factura, portal ni comision
--   aprobado    la oficina lo paso a `items` tal cual
--   corregido   la oficina lo paso a `items` cambiando cantidad o precio
--   descartado  no se uso
-- Las entradas no se borran al revisarlas: son el historial para medir cuanto
-- acierta cada mecanico. Forma de cada entrada (la valida api/_lib/mecanico.js):
--   { id, productoId?, sku?, codigo?, nombre, cantidad, precio, iva,
--     cargadoPor, cargadoPorNombre, cargadoEn, estado,
--     revisadoPor?, revisadoEn?, cantidadFinal?, precioFinal? }
--
-- Idempotente. Solo agrega la columna; no toca ninguna fila existente.

alter table public.trabajos
  add column if not exists insumos_propuestos jsonb not null default '[]'::jsonb;
