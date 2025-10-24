-- Tablas para gestionar órdenes de compra y sus líneas de detalle.
CREATE TABLE IF NOT EXISTS ordenes_compra (
  id BIGSERIAL PRIMARY KEY,
  numero_orden VARCHAR(30) UNIQUE,
  id_proveedor BIGINT NOT NULL REFERENCES terceros (id),
  fecha_orden DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega_estimada DATE,
  condiciones_pago VARCHAR(120),
  metodo_envio VARCHAR(120),
  lugar_entrega VARCHAR(200),
  notas TEXT,
  estado VARCHAR(40) NOT NULL DEFAULT 'Pendiente',
  sub_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_impuestos NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  creado_por BIGINT,
  modificado_por BIGINT,
  creado_por_nombre VARCHAR(120),
  modificado_por_nombre VARCHAR(120),
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  modificado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lineas_orden_compra (
  id BIGSERIAL PRIMARY KEY,
  id_orden BIGINT NOT NULL REFERENCES ordenes_compra (id) ON DELETE CASCADE,
  id_articulo BIGINT REFERENCES articulos (id),
  tipo VARCHAR(40) NOT NULL DEFAULT 'Producto',
  descripcion TEXT,
  cantidad NUMERIC(18, 4) NOT NULL DEFAULT 0,
  costo_unitario NUMERIC(18, 4) NOT NULL DEFAULT 0,
  total_impuestos NUMERIC(18, 4) NOT NULL DEFAULT 0,
  total_linea NUMERIC(18, 4) NOT NULL DEFAULT 0,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Si requieres auditar cambios adicionales, crea tablas de historial
-- siguiendo las mismas llaves primarias y foráneas.
