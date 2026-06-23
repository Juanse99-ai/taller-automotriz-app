-- Tabla de compras (egresos) ya enviadas a Cuentti, para el anti-duplicado de
-- la herramienta MCP `registrar_compra` (api/mcp/cuentti.js).
--
-- Antes de registrar una compra, el MCP consulta esta tabla por
-- (proveedor_nit, numero_factura): si ya existe, avisa y bloquea (a menos que
-- se pase permitirDuplicado:true). Tras registrar OK, guarda la fila aquí.
--
-- RLS DESACTIVADO a propósito: el MCP del taller accede con la anon key y todas
-- sus tablas usan este mismo patrón. (El proyecto habilita RLS por defecto en
-- tablas nuevas, por eso hay que desactivarlo explícitamente.)

CREATE TABLE IF NOT EXISTS public.compras_registradas (
  id text PRIMARY KEY,
  proveedor_nit text NOT NULL,
  proveedor_nombre text DEFAULT '',
  numero_factura text DEFAULT '',
  fecha text DEFAULT '',            -- fecha de la factura del proveedor (YYYY-MM-DD)
  total numeric DEFAULT 0,
  items_count integer DEFAULT 0,
  id_transacion text DEFAULT '',    -- id que devolvió Cuentti
  registrado_en timestamptz DEFAULT now()
);

-- Un mismo proveedor no puede tener dos compras con el mismo número de factura
-- (parcial: solo aplica cuando numero_factura no está vacío).
CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_proveedor_factura
  ON public.compras_registradas (proveedor_nit, numero_factura)
  WHERE numero_factura <> '';

ALTER TABLE public.compras_registradas DISABLE ROW LEVEL SECURITY;
