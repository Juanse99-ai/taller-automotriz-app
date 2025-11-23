-- =====================================================
-- TABLA DE TRABAJOS PARA MULTIDIAGNÓSTICOS AS
-- =====================================================
-- Esta tabla almacena las órdenes de trabajo del taller
-- Los clientes e inventario ahora vienen de CUENTTI

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

