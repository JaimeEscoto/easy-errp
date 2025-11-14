-- Script de creacion de la tabla articulos y registro de cambios.
-- Compatible con PostgreSQL.

BEGIN;

CREATE TABLE IF NOT EXISTS articulos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    precio NUMERIC(10, 2) NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(150) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS articulos_log (
    id SERIAL PRIMARY KEY,
    articulo_id INTEGER NOT NULL REFERENCES articulos(id) ON DELETE CASCADE,
    change_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action VARCHAR(20) NOT NULL,
    changed_by VARCHAR(150) NOT NULL,
    change_set JSONB NOT NULL
);

CREATE OR REPLACE FUNCTION articulos_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articulos_set_updated_at ON articulos;
CREATE TRIGGER trg_articulos_set_updated_at
BEFORE UPDATE ON articulos
FOR EACH ROW
EXECUTE FUNCTION articulos_set_updated_at();

CREATE OR REPLACE FUNCTION articulos_log_insert() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO articulos_log(articulo_id, action, changed_by, change_set)
    VALUES (
        NEW.id,
        'CREACION',
        NEW.created_by,
        to_jsonb(NEW) - ARRAY['id', 'updated_at', 'updated_by']
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articulos_log_insert ON articulos;
CREATE TRIGGER trg_articulos_log_insert
AFTER INSERT ON articulos
FOR EACH ROW
EXECUTE FUNCTION articulos_log_insert();

CREATE OR REPLACE FUNCTION articulos_log_update() RETURNS TRIGGER AS $$
DECLARE
    changes JSONB := '{}'::JSONB;
BEGIN
    IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
        changes := changes || jsonb_build_object('codigo', jsonb_build_object('old', OLD.codigo, 'new', NEW.codigo));
    END IF;
    IF NEW.nombre IS DISTINCT FROM OLD.nombre THEN
        changes := changes || jsonb_build_object('nombre', jsonb_build_object('old', OLD.nombre, 'new', NEW.nombre));
    END IF;
    IF NEW.descripcion IS DISTINCT FROM OLD.descripcion THEN
        changes := changes || jsonb_build_object('descripcion', jsonb_build_object('old', OLD.descripcion, 'new', NEW.descripcion));
    END IF;
    IF NEW.precio IS DISTINCT FROM OLD.precio THEN
        changes := changes || jsonb_build_object('precio', jsonb_build_object('old', OLD.precio, 'new', NEW.precio));
    END IF;
    IF NEW.stock IS DISTINCT FROM OLD.stock THEN
        changes := changes || jsonb_build_object('stock', jsonb_build_object('old', OLD.stock, 'new', NEW.stock));
    END IF;
    IF NEW.updated_by IS DISTINCT FROM OLD.updated_by THEN
        changes := changes || jsonb_build_object('updated_by', jsonb_build_object('old', OLD.updated_by, 'new', NEW.updated_by));
    END IF;

    IF jsonb_typeof(changes) = 'object' AND jsonb_object_length(changes) > 0 THEN
        INSERT INTO articulos_log(articulo_id, action, changed_by, change_set)
        VALUES (
            NEW.id,
            'ACTUALIZACION',
            COALESCE(NEW.updated_by, OLD.updated_by, OLD.created_by),
            changes
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articulos_log_update ON articulos;
CREATE TRIGGER trg_articulos_log_update
AFTER UPDATE ON articulos
FOR EACH ROW
WHEN (OLD IS DISTINCT FROM NEW)
EXECUTE FUNCTION articulos_log_update();

INSERT INTO articulos (codigo, nombre, descripcion, precio, stock, created_by)
VALUES
    ('ART-001', 'Articulo de Prueba 1', 'Primer articulo de prueba', 120.50, 10, 'usuario_admin'),
    ('ART-002', 'Articulo de Prueba 2', 'Segundo articulo de prueba', 89.99, 25, 'usuario_editor')
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
