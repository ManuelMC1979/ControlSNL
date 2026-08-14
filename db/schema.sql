-- Esquema para el panel de Auditoría SNL (Progesys) en Neon (Postgres).
-- Ejecutar una sola vez antes de cargar datos: psql "$DATABASE_URL" -f db/schema.sql

CREATE TABLE IF NOT EXISTS master_records (
  id               SERIAL PRIMARY KEY,
  module_id        TEXT NOT NULL,           -- reembolsos | informes | otras | cd
  fila             INTEGER NOT NULL,        -- fila dentro de la hoja *_BASE original
  nombre           TEXT NOT NULL,
  rut              TEXT,
  rut_estado       TEXT NOT NULL,           -- valido | vacio | formato | dv
  rut_sugerencia   TEXT,
  correo           TEXT,
  servicio         TEXT,
  paciente         TEXT,
  ejecutivo        TEXT,
  estado_bo        TEXT,
  ingreso          TEXT,                    -- dd-mm-aaaa (texto, tal como se muestra)
  ingreso_sugerido TEXT,                    -- corrección sugerida si el ingreso quedó con día/mes invertido
  atencion         TEXT,
  atencion_sugerida TEXT,
  inc_texto        TEXT,                    -- texto de inconsistencia de fecha tal como en la base original
  inc_ok           BOOLEAN NOT NULL DEFAULT true,
  sla_estado       TEXT,                    -- dentro | fuera | invalido | sin_fecha
  dias             INTEGER,                 -- días hábiles transcurridos desde el ingreso
  sec_estado       TEXT,                    -- ok | mismo_dia | posterior | null (no comparable)
  UNIQUE(module_id, fila)
);

CREATE INDEX IF NOT EXISTS idx_master_module ON master_records(module_id);
CREATE INDEX IF NOT EXISTS idx_master_rut_estado ON master_records(rut_estado);
CREATE INDEX IF NOT EXISTS idx_master_sla_estado ON master_records(sla_estado);

-- Texto descriptivo de cada módulo (nombre, ícono, descripción, estado de gestión, observación).
CREATE TABLE IF NOT EXISTS modules_meta (
  id          TEXT PRIMARY KEY,   -- reembolsos | informes | otras | cd
  nombre      TEXT NOT NULL,
  icon        TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  gestion     TEXT NOT NULL,
  observacion TEXT NOT NULL,
  sla_dias    INTEGER NOT NULL,   -- plazo de SLA del módulo, en días hábiles
  issues      JSONB NOT NULL DEFAULT '[]' -- desglose de inconsistencias de fecha [{t,c,sev}, ...]
);

-- Tarjetas de causa raíz y solución (sección "Resumen general").
CREATE TABLE IF NOT EXISTS causas (
  id  SERIAL PRIMARY KEY,
  sev TEXT NOT NULL,   -- good | warning | serious | critical
  h   TEXT NOT NULL,    -- título
  p   TEXT NOT NULL,    -- descripción del problema
  s   TEXT NOT NULL,    -- solución propuesta
  orden INTEGER NOT NULL DEFAULT 0
);
