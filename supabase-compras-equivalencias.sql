-- ============================================================
-- MIGRACION SUPABASE — Tabla de equivalencias para COMPRAS
-- codigo del proveedor -> SKU interno en Cuentti
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS compras_equivalencias (
  id text PRIMARY KEY,
  proveedor_nit text NOT NULL,
  proveedor_nombre text DEFAULT '',
  codigo_proveedor text NOT NULL,
  sku_cuentti text DEFAULT '',
  id_producto_cuentti text DEFAULT '',
  nombre_producto text DEFAULT '',
  fecha_creacion timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_equiv
  ON compras_equivalencias (proveedor_nit, codigo_proveedor);

ALTER TABLE compras_equivalencias DISABLE ROW LEVEL SECURITY;

SELECT 'compras_equivalencias lista' AS resultado;
