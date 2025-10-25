-- Script de referencia para habilitar la administración de almacenes,
-- recepciones y pagos a proveedores.

CREATE TABLE IF NOT EXISTS almacenes (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  ubicacion VARCHAR(255),
  descripcion TEXT,
  notas TEXT,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  creado_por BIGINT,
  creado_por_nombre VARCHAR(120),
  modificado_por BIGINT,
  modificado_por_nombre VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS inventario_articulos (
  id BIGSERIAL PRIMARY KEY,
  articulo_id BIGINT NOT NULL REFERENCES articulos(id) ON DELETE CASCADE,
  almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  existencia NUMERIC(18, 4) DEFAULT 0,
  reservado NUMERIC(18, 4) DEFAULT 0,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  creado_por BIGINT,
  creado_por_nombre VARCHAR(120),
  modificado_por BIGINT,
  modificado_por_nombre VARCHAR(120),
  UNIQUE (articulo_id, almacen_id)
);

CREATE TABLE IF NOT EXISTS entradas_almacen (
  id BIGSERIAL PRIMARY KEY,
  orden_compra_id BIGINT NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
  fecha_entrada DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  registrado_por VARCHAR(120),
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  creado_por BIGINT,
  creado_por_nombre VARCHAR(120),
  modificado_por BIGINT,
  modificado_por_nombre VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS lineas_entrada_almacen (
  id BIGSERIAL PRIMARY KEY,
  entrada_id BIGINT NOT NULL REFERENCES entradas_almacen(id) ON DELETE CASCADE,
  orden_compra_id BIGINT NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  linea_orden_id BIGINT REFERENCES lineas_orden_compra(id) ON DELETE SET NULL,
  articulo_id BIGINT REFERENCES articulos(id) ON DELETE SET NULL,
  cantidad NUMERIC(18, 4) NOT NULL,
  costo_unitario NUMERIC(18, 2) DEFAULT 0,
  subtotal NUMERIC(18, 2) DEFAULT 0,
  descripcion TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  creado_por BIGINT,
  creado_por_nombre VARCHAR(120),
  modificado_por BIGINT,
  modificado_por_nombre VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id BIGSERIAL PRIMARY KEY,
  orden_compra_id BIGINT NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  proveedor_id BIGINT REFERENCES terceros(id) ON DELETE SET NULL,
  monto_pagado NUMERIC(18, 2) NOT NULL,
  fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago VARCHAR(120),
  referencia VARCHAR(120),
  notas TEXT,
  registrado_por VARCHAR(120),
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  creado_por BIGINT,
  creado_por_nombre VARCHAR(120),
  modificado_por BIGINT,
  modificado_por_nombre VARCHAR(120)
);

-- Índices sugeridos para mejorar el desempeño de consultas frecuentes.
CREATE INDEX IF NOT EXISTS idx_inventario_articulos_almacen ON inventario_articulos (almacen_id);
CREATE INDEX IF NOT EXISTS idx_inventario_articulos_articulo ON inventario_articulos (articulo_id);
CREATE INDEX IF NOT EXISTS idx_entradas_almacen_orden ON entradas_almacen (orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_lineas_entrada_articulo ON lineas_entrada_almacen (articulo_id);
CREATE INDEX IF NOT EXISTS idx_pagos_proveedores_orden ON pagos_proveedores (orden_compra_id);
