-- Tablas y estructuras sugeridas para el flujo de registro de pagos de clientes.
-- Ajusta los nombres de columnas o llaves foráneas según tu modelo actual.

-- Tabla de pagos recibidos para facturas de venta.
CREATE TABLE IF NOT EXISTS pagos_recibidos (
  id BIGSERIAL PRIMARY KEY,
  id_factura BIGINT NOT NULL REFERENCES facturas_venta (id) ON DELETE CASCADE,
  id_cliente BIGINT NOT NULL,
  fecha_pago TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  monto_pago NUMERIC(18, 2) NOT NULL CHECK (monto_pago > 0),
  metodo_pago VARCHAR(120),
  referencia VARCHAR(150),
  notas TEXT,
  creado_por BIGINT,
  modificado_por BIGINT,
  creado_por_nombre VARCHAR(120),
  modificado_por_nombre VARCHAR(120),
  creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  modificado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pagos_recibidos_factura_idx ON pagos_recibidos (id_factura);
CREATE INDEX IF NOT EXISTS pagos_recibidos_cliente_idx ON pagos_recibidos (id_cliente);

-- Si tu catálogo de clientes está en la tabla "terceros", añade la restricción foránea:
-- ALTER TABLE pagos_recibidos
--   ADD CONSTRAINT pagos_recibidos_cliente_fk
--   FOREIGN KEY (id_cliente) REFERENCES terceros (id);

-- Asegúrate de que la tabla de facturas tenga los campos utilizados por el flujo.
ALTER TABLE facturas_venta
  ALTER COLUMN estado SET DEFAULT 'Pendiente de Pago';

-- Opcional: agrega una marca de auditoría para el último pago registrado.
-- ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS fecha_ultimo_pago TIMESTAMP WITH TIME ZONE;
