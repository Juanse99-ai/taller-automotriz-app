-- ============================================================
-- MIGRACION SUPABASE - App Gestion Taller MDA
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- ==========================================
-- PASO 0: Eliminar TODAS las FOREIGN KEYS en todas las tablas
-- (Necesario para poder cambiar tipos de columna)
-- ==========================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname, conrelid::regclass AS tabla
    FROM pg_constraint
    WHERE contype = 'f'
    AND conrelid::regclass::text IN (
      'trabajos','cotizaciones','vehiculos','clientes','inspecciones',
      'movimientos_tecnicos','liquidacion_historial','liquidados','trabajos_compartidos'
    )
  ) LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
    RAISE NOTICE 'Eliminada FK: % en tabla %', r.conname, r.tabla;
  END LOOP;
  -- Tambien eliminar FKs que REFERENCIAN estas tablas desde otras
  FOR r IN (
    SELECT conname, conrelid::regclass AS tabla
    FROM pg_constraint
    WHERE contype = 'f'
    AND confrelid::regclass::text IN (
      'trabajos','cotizaciones','vehiculos','clientes','inspecciones',
      'movimientos_tecnicos','liquidacion_historial','liquidados','trabajos_compartidos'
    )
  ) LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
    RAISE NOTICE 'Eliminada FK referenciando: % en tabla %', r.conname, r.tabla;
  END LOOP;
END $$;

-- ==========================================
-- PASO 1: Desactivar Row Level Security
-- ==========================================
ALTER TABLE IF EXISTS trabajos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cotizaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vehiculos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inspecciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS movimientos_tecnicos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS liquidacion_historial DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS liquidados DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trabajos_compartidos DISABLE ROW LEVEL SECURITY;

-- ==========================================
-- PASO 2: Corregir tabla 'trabajos'
-- ==========================================
ALTER TABLE trabajos ALTER COLUMN plate DROP NOT NULL;
ALTER TABLE trabajos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE trabajos ALTER COLUMN id TYPE text USING id::text;
DROP SEQUENCE IF EXISTS trabajos_id_seq CASCADE;

-- ==========================================
-- PASO 3: Corregir tabla 'cotizaciones'
-- ==========================================
ALTER TABLE cotizaciones ALTER COLUMN id DROP DEFAULT;
ALTER TABLE cotizaciones ALTER COLUMN id TYPE text USING id::text;
DROP SEQUENCE IF EXISTS cotizaciones_id_seq CASCADE;

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS cedula text DEFAULT '';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS cliente text DEFAULT '';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS telefono_cliente text DEFAULT '';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS placa text DEFAULT '';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS marca text DEFAULT '';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS modelo text DEFAULT '';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS iva numeric DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS observaciones text DEFAULT '';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS validez_dias integer DEFAULT 15;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS estado text DEFAULT 'Pendiente';

-- ==========================================
-- PASO 4: Corregir tabla 'vehiculos'
-- ==========================================
ALTER TABLE vehiculos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE vehiculos ALTER COLUMN id TYPE text USING id::text;
DROP SEQUENCE IF EXISTS vehiculos_id_seq CASCADE;

ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS placa text;
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS marca text DEFAULT '';
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS modelo text DEFAULT '';
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS ano integer;
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS cedula_propietario text DEFAULT '';
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS historial jsonb DEFAULT '[]';
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS fecha_creacion timestamptz DEFAULT now();
ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS fecha_ultimo_servicio timestamptz;

-- ==========================================
-- PASO 5: Corregir tabla 'clientes'
-- ==========================================
ALTER TABLE clientes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE clientes ALTER COLUMN id TYPE text USING id::text;
DROP SEQUENCE IF EXISTS clientes_id_seq CASCADE;

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cedula text DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vehiculos jsonb DEFAULT '[]';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_creacion timestamptz DEFAULT now();
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_ultima_visita timestamptz;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS total_visitas integer DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS total_gastado numeric DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuentti_id text;
UPDATE clientes SET cedula = identificacion WHERE cedula IS NULL OR cedula = '';

-- ==========================================
-- PASO 6: Corregir tabla 'inspecciones'
-- ==========================================
ALTER TABLE inspecciones ALTER COLUMN id DROP DEFAULT;
ALTER TABLE inspecciones ALTER COLUMN id TYPE text USING id::text;
DROP SEQUENCE IF EXISTS inspecciones_id_seq CASCADE;

ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS placa text DEFAULT '';
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS cliente text DEFAULT '';
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS cedula text DEFAULT '';
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS vehiculo text DEFAULT '';
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS tecnico text DEFAULT '';
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS km text DEFAULT '';
ALTER TABLE inspecciones ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]';

-- ==========================================
-- PASO 7: Corregir tabla 'movimientos_tecnicos'
-- ==========================================
ALTER TABLE movimientos_tecnicos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE movimientos_tecnicos ALTER COLUMN id TYPE text USING id::text;
DROP SEQUENCE IF EXISTS movimientos_tecnicos_id_seq CASCADE;

ALTER TABLE movimientos_tecnicos ADD COLUMN IF NOT EXISTS tecnico_id text;
ALTER TABLE movimientos_tecnicos ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'adelanto';
ALTER TABLE movimientos_tecnicos ADD COLUMN IF NOT EXISTS monto numeric DEFAULT 0;
ALTER TABLE movimientos_tecnicos ADD COLUMN IF NOT EXISTS nota text DEFAULT '';
ALTER TABLE movimientos_tecnicos ADD COLUMN IF NOT EXISTS fecha timestamptz;

-- ==========================================
-- PASO 8: Corregir tabla 'liquidacion_historial'
-- ==========================================
ALTER TABLE liquidacion_historial ALTER COLUMN id DROP DEFAULT;
ALTER TABLE liquidacion_historial ALTER COLUMN id TYPE text USING id::text;
DROP SEQUENCE IF EXISTS liquidacion_historial_id_seq CASCADE;

ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS tecnico text DEFAULT '';
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS tecnico_id text;
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS trabajos_ids jsonb DEFAULT '[]';
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS cantidad_trabajos integer DEFAULT 0;
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS mano_obra numeric DEFAULT 0;
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS comision numeric DEFAULT 0;
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS cargos numeric DEFAULT 0;
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS neto numeric DEFAULT 0;
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS movimientos jsonb DEFAULT '[]';
ALTER TABLE liquidacion_historial ADD COLUMN IF NOT EXISTS detalle_trabajo jsonb DEFAULT '[]';

-- ==========================================
-- PASO 9: Tablas auxiliares (trabajo_id a text)
-- ==========================================
ALTER TABLE liquidados ALTER COLUMN trabajo_id TYPE text USING trabajo_id::text;
ALTER TABLE trabajos_compartidos ALTER COLUMN trabajo_id TYPE text USING trabajo_id::text;

-- ==========================================
-- PASO 10: Columnas adicionales cotizaciones (ano, cilindraje)
-- ==========================================
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS ano integer;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS cilindraje text DEFAULT '';

-- ==========================================
-- VERIFICACION
-- ==========================================
SELECT 'Migracion completada exitosamente' AS resultado;
