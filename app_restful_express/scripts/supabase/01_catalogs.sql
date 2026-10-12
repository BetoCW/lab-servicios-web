-- =====================================================================
-- T2-Actividad 2 - Catalogo de Catalogos en Supabase (PostgreSQL)
-- Ejecutar en Supabase > SQL Editor (o en el PostgreSQL local de Docker).
-- Tablas y columnas en snake_case; la API responde siempre camelCase.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() (ya activa en Supabase)

-- Maestro: definicion del catalogo
CREATE TABLE IF NOT EXISTS catalogs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  collection  TEXT NOT NULL,
  section     TEXT,
  sequence    INTEGER NOT NULL DEFAULT 0,
  image_url   TEXT,
  route       TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  updated_by  TEXT
);

-- Detalle auto-referenciado: N niveles mediante parent_id (NULL = nivel 1)
CREATE TABLE IF NOT EXISTS catalog_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  UUID NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES catalog_values(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  value       TEXT NOT NULL,
  alias       TEXT,
  sequence    INTEGER NOT NULL DEFAULT 0,
  image_url   TEXT,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  updated_by  TEXT,
  CONSTRAINT catalog_values_code_scope UNIQUE (catalog_id, parent_id, code),
  CONSTRAINT catalog_values_seq_scope  UNIQUE (catalog_id, parent_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_catalog_values_catalog ON catalog_values (catalog_id);
CREATE INDEX IF NOT EXISTS idx_catalog_values_parent  ON catalog_values (parent_id);

-- La API se conecta con el rol del servidor (cadena de conexion), no con la
-- llave anonima; aun asi se activa RLS para que nadie lea las tablas desde el
-- cliente publico de Supabase sin una politica explicita.
ALTER TABLE catalogs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_values ENABLE ROW LEVEL SECURITY;
