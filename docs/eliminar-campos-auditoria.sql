-- Elimina los campos duplicados en inglés de las tablas principales.
ALTER TABLE terceros
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS created_by_name,
  DROP COLUMN IF EXISTS updated_by,
  DROP COLUMN IF EXISTS updated_by_name;

ALTER TABLE articulos
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_by;

-- Si gestionas historiales/auditorías en tablas separadas, repite el procedimiento
-- usando el nombre real de la tabla. Por ejemplo:
-- ALTER TABLE terceros_log
--   DROP COLUMN IF EXISTS created_by,
--   DROP COLUMN IF EXISTS created_by_name,
--   DROP COLUMN IF EXISTS updated_by,
--   DROP COLUMN IF EXISTS updated_by_name;
