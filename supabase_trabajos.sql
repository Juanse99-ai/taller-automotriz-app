-- =====================================================
-- TABLA DE TRABAJOS PARA MULTIDIAGNÓSTICOS AS
-- =====================================================
-- Esta tabla almacena las órdenes de trabajo del taller
-- Los clientes e inventario ahora vienen de CUENTTI

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS trabajos (
    id VARCHAR(50) PRIMARY KEY,
    fecha TIMESTAMP DEFAULT NOW(),
    cedula_cliente VARCHAR(50),
    cliente VARCHAR(255) NOT NULL,
    telefono_cliente VARCHAR(20),
    email_cliente VARCHAR(255),
    placa VARCHAR(20) NOT NULL,
    marca VARCHAR(100),
    modelo VARCHAR(100),
    ano INTEGER,
    kilometraje INTEGER,
    tecnico_id INTEGER,
    estado VARCHAR(50) DEFAULT 'Pendiente',
    observaciones TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    mano_obra DECIMAL(10,2) DEFAULT 0,
    subtotal_sin_iva DECIMAL(10,2) DEFAULT 0,
    total_iva DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    pagado BOOLEAN DEFAULT false,
    metodo_pago VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Compatibilidad: si la tabla trabajos ya existía sin la columna placa,
-- la añadimos antes de crear los índices que la usan para evitar errores
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trabajos' AND column_name = 'placa'
    ) THEN
        ALTER TABLE trabajos ADD COLUMN placa VARCHAR(20) NOT NULL DEFAULT '';
        ALTER TABLE trabajos ALTER COLUMN placa DROP DEFAULT;
    END IF;
END $$;

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_trabajos_placa ON trabajos(placa);
CREATE INDEX IF NOT EXISTS idx_trabajos_cliente ON trabajos(cedula_cliente);
CREATE INDEX IF NOT EXISTS idx_trabajos_tecnico ON trabajos(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_estado ON trabajos(estado);
CREATE INDEX IF NOT EXISTS idx_trabajos_fecha ON trabajos(fecha);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para actualizar updated_at
CREATE TRIGGER update_trabajos_updated_at 
    BEFORE UPDATE ON trabajos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios
COMMENT ON TABLE trabajos IS 'Órdenes de trabajo del taller';
COMMENT ON COLUMN trabajos.items IS 'Array JSON con los items del trabajo (repuestos, servicios)';
COMMENT ON COLUMN trabajos.estado IS 'Estado: Pendiente, En Progreso, Completado';

-- Habilitar Row Level Security (RLS) si es necesario
-- ALTER TABLE trabajos ENABLE ROW LEVEL SECURITY;

-- Política de ejemplo (ajustar según necesidades)
-- CREATE POLICY "Permitir lectura pública" ON trabajos FOR SELECT USING (true);
-- CREATE POLICY "Permitir inserción" ON trabajos FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Permitir actualización" ON trabajos FOR UPDATE USING (true);

-- =====================================================
-- TABLA DE CLIENTES PARA RESPALDO LOCAL
-- =====================================================
-- Se usa como respaldo local si CUENTTI no está disponible
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedula VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(30),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_cedula ON clientes(cedula);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);

-- Actualizar updated_at automáticamente
CREATE TRIGGER update_clientes_updated_at
    BEFORE UPDATE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE clientes IS 'Respaldo de clientes cuando CUENTTI no está disponible';
COMMENT ON COLUMN clientes.cedula IS 'Documento/Cédula del cliente (único)';

-- =====================================================
-- TABLA DE INVENTARIO (RESPALDO LOCAL)
-- =====================================================
CREATE TABLE IF NOT EXISTS inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(100) NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    precio NUMERIC(12,2) DEFAULT 0,
    stock INTEGER DEFAULT 0,
    stock_minimo INTEGER DEFAULT 0,
    iva INTEGER DEFAULT 19,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventario_nombre ON inventario(nombre);
CREATE INDEX IF NOT EXISTS idx_inventario_categoria ON inventario(categoria);
CREATE INDEX IF NOT EXISTS idx_inventario_stock ON inventario(stock);

CREATE TRIGGER update_inventario_updated_at
    BEFORE UPDATE ON inventario
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE inventario IS 'Respaldo local de inventario sincronizado con CUENTTI';
COMMENT ON COLUMN inventario.codigo IS 'Código único del repuesto/producto';

-- =====================================================
-- TABLA DE VEHÍCULOS
-- =====================================================
-- Mantiene la relación placa → cliente para búsquedas rápidas
CREATE TABLE IF NOT EXISTS vehiculos (
    placa VARCHAR(20) PRIMARY KEY,
    cliente_doc VARCHAR(50) NOT NULL,
    cliente_nombre VARCHAR(255) NOT NULL,
    marca VARCHAR(100),
    modelo VARCHAR(100),
    ano INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_vehiculo_cliente_doc FOREIGN KEY (cliente_doc) REFERENCES clientes(cedula)
);

CREATE INDEX IF NOT EXISTS idx_vehiculos_cliente_doc ON vehiculos(cliente_doc);
CREATE INDEX IF NOT EXISTS idx_vehiculos_marca ON vehiculos(marca);

CREATE TRIGGER update_vehiculos_updated_at
    BEFORE UPDATE ON vehiculos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vehiculos IS 'Asociación de placas con clientes';
COMMENT ON COLUMN vehiculos.cliente_doc IS 'Documento del cliente propietario';

-- =====================================================
-- POLÍTICAS DE RLS SUGERIDAS (DESCOMENTAR SEGÚN CASO DE USO)
-- =====================================================
-- ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "lectura_publica_clientes" ON clientes FOR SELECT USING (true);
-- CREATE POLICY "insercion_clientes" ON clientes FOR INSERT WITH CHECK (true);

-- CREATE POLICY "lectura_publica_inventario" ON inventario FOR SELECT USING (true);
-- CREATE POLICY "insercion_inventario" ON inventario FOR INSERT WITH CHECK (true);

-- CREATE POLICY "lectura_publica_vehiculos" ON vehiculos FOR SELECT USING (true);
-- CREATE POLICY "insercion_vehiculos" ON vehiculos FOR INSERT WITH CHECK (true);

