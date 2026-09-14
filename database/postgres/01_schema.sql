-- =====================================================================
-- Esquema relacional (PostgreSQL 15+ / Supabase) del proyecto
-- Módulo 1: Catálogo de catálogos   Módulo 2: Institutos y Productos/Servicios
-- Tablas y columnas en snake_case. La API REST responde siempre en el mismo
-- contrato JSON que MongoDB (ver 03_views.sql).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() (ya viene activa en Supabase)

-- ---------------------------------------------------------------------
-- MÓDULO 1. CATÁLOGO DE CATÁLOGOS
-- ---------------------------------------------------------------------

-- Maestro: definición del catálogo
CREATE TABLE catalogs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'), -- snake_case
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
CREATE TABLE catalog_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  UUID NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES catalog_values(id) ON DELETE CASCADE,
  code        TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_]+$'), -- UPPER_SNAKE
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
  CONSTRAINT catalog_values_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id),
  -- code único dentro del catálogo (equivale al índice mon-3 de MongoDB)
  CONSTRAINT catalog_values_code_scope UNIQUE (catalog_id, code),
  -- secuencia única por padre; NULLS NOT DISTINCT hace que también aplique al nivel 1
  CONSTRAINT catalog_values_seq_scope UNIQUE NULLS NOT DISTINCT (catalog_id, parent_id, sequence)
);

CREATE INDEX idx_catalog_values_catalog ON catalog_values (catalog_id);
CREATE INDEX idx_catalog_values_parent  ON catalog_values (parent_id);

-- ---------------------------------------------------------------------
-- MÓDULO 2. INSTITUTOS Y PRODUCTOS/SERVICIOS
-- Las columnas activo/borrado + created_*/updated_* sustituyen al detail_row
-- embebido de MongoDB; el historial detail_row_reg vive en la tabla bitacora.
-- ---------------------------------------------------------------------

CREATE TABLE institutos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_instituto_ok     TEXT NOT NULL UNIQUE,
  id_instituto_bk     TEXT NOT NULL,
  des_instituto       TEXT NOT NULL,
  alias               TEXT,
  matriz              CHAR(1) NOT NULL DEFAULT 'S' CHECK (matriz IN ('S', 'N')),
  giro                TEXT, -- code del catálogo institute_business
  id_instituto_sup_ok TEXT REFERENCES institutos(id_instituto_ok) ON UPDATE CASCADE,
  activo              CHAR(1) NOT NULL DEFAULT 'S' CHECK (activo IN ('S', 'N')),
  borrado             CHAR(1) NOT NULL DEFAULT 'N' CHECK (borrado IN ('S', 'N')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          TEXT NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          TEXT NOT NULL,
  CONSTRAINT institutos_no_self_sup CHECK (id_instituto_sup_ok IS NULL OR id_instituto_sup_ok <> id_instituto_ok)
);

CREATE TABLE prod_serv (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_instituto_ok     TEXT NOT NULL REFERENCES institutos(id_instituto_ok) ON UPDATE CASCADE,
  id_prod_serv_ok     TEXT NOT NULL UNIQUE,
  id_prod_serv_bk     TEXT,
  codigo_barras       TEXT,
  des_prod_serv       TEXT NOT NULL,
  id_tipo_prod_serv_ok TEXT, -- code del catálogo prod_serv_type
  indice              TEXT,
  activo              CHAR(1) NOT NULL DEFAULT 'S' CHECK (activo IN ('S', 'N')),
  borrado             CHAR(1) NOT NULL DEFAULT 'N' CHECK (borrado IN ('S', 'N')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          TEXT NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          TEXT NOT NULL
);

CREATE INDEX idx_prod_serv_instituto ON prod_serv (id_instituto_ok);
-- Búsqueda de texto equivalente al índice text de MongoDB
CREATE INDEX idx_prod_serv_busqueda ON prod_serv
  USING gin (to_tsvector('spanish', coalesce(des_prod_serv, '') || ' ' || coalesce(indice, '')));

CREATE TABLE prod_serv_estatus (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prod_serv_id      UUID NOT NULL REFERENCES prod_serv(id) ON DELETE CASCADE,
  id_tipo_estatus_ok TEXT NOT NULL, -- code del catálogo prod_serv_status
  actual            CHAR(1) NOT NULL DEFAULT 'S' CHECK (actual IN ('S', 'N')),
  observacion       TEXT,
  activo            CHAR(1) NOT NULL DEFAULT 'S' CHECK (activo IN ('S', 'N')),
  borrado           CHAR(1) NOT NULL DEFAULT 'N' CHECK (borrado IN ('S', 'N')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT NOT NULL
);

-- Solo un estatus Actual por producto/servicio
CREATE UNIQUE INDEX uq_prod_serv_estatus_actual ON prod_serv_estatus (prod_serv_id) WHERE actual = 'S';

CREATE TABLE prod_serv_info_ad (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prod_serv_id  UUID NOT NULL REFERENCES prod_serv(id) ON DELETE CASCADE,
  id_etiqueta_ok TEXT NOT NULL,
  etiqueta      TEXT,
  valor         TEXT NOT NULL,
  secuencia     INTEGER NOT NULL DEFAULT 1,
  activo        CHAR(1) NOT NULL DEFAULT 'S' CHECK (activo IN ('S', 'N')),
  borrado       CHAR(1) NOT NULL DEFAULT 'N' CHECK (borrado IN ('S', 'N')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT NOT NULL,
  UNIQUE (prod_serv_id, secuencia)
);

CREATE TABLE prod_serv_presenta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prod_serv_id    UUID NOT NULL REFERENCES prod_serv(id) ON DELETE CASCADE,
  id_presenta_ok  TEXT NOT NULL,
  id_presenta_bk  TEXT,
  codigo_barras   TEXT,
  des_presenta    TEXT NOT NULL,
  precio          NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio >= 0),
  principal       CHAR(1) NOT NULL DEFAULT 'N' CHECK (principal IN ('S', 'N')),
  indice          TEXT,
  activo          CHAR(1) NOT NULL DEFAULT 'S' CHECK (activo IN ('S', 'N')),
  borrado         CHAR(1) NOT NULL DEFAULT 'N' CHECK (borrado IN ('S', 'N')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT NOT NULL,
  UNIQUE (prod_serv_id, id_presenta_ok)
);

-- Solo una presentación principal (no borrada) por producto/servicio
CREATE UNIQUE INDEX uq_prod_serv_presenta_principal ON prod_serv_presenta (prod_serv_id)
  WHERE principal = 'S' AND borrado = 'N';

CREATE TABLE prod_serv_presenta_archivos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presenta_id        UUID NOT NULL REFERENCES prod_serv_presenta(id) ON DELETE CASCADE,
  id_archivo_ok      TEXT NOT NULL,
  id_tipo_archivo_ok TEXT NOT NULL, -- code del catálogo file_type
  des_archivo        TEXT,
  ruta_archivo       TEXT NOT NULL,
  principal          CHAR(1) NOT NULL DEFAULT 'N' CHECK (principal IN ('S', 'N')),
  secuencia          INTEGER NOT NULL DEFAULT 1,
  activo             CHAR(1) NOT NULL DEFAULT 'S' CHECK (activo IN ('S', 'N')),
  borrado            CHAR(1) NOT NULL DEFAULT 'N' CHECK (borrado IN ('S', 'N')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         TEXT NOT NULL,
  UNIQUE (presenta_id, id_archivo_ok)
);

-- Bitácora (equivalente a detail_row.detail_row_reg[] de MongoDB)
CREATE TABLE bitacora (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabla       TEXT NOT NULL,
  registro_id UUID NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('ALTA', 'CAMBIO', 'BAJA_LOGICA')),
  fecha_reg   TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_reg TEXT NOT NULL
);

CREATE INDEX idx_bitacora_registro ON bitacora (tabla, registro_id);

-- ---------------------------------------------------------------------
-- Reglas comunes
-- ---------------------------------------------------------------------

-- Mantiene updated_at al día en cada UPDATE
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_catalogs_updated        BEFORE UPDATE ON catalogs           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_catalog_values_updated  BEFORE UPDATE ON catalog_values     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_institutos_updated      BEFORE UPDATE ON institutos         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prod_serv_updated       BEFORE UPDATE ON prod_serv          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prod_serv_presenta_upd  BEFORE UPDATE ON prod_serv_presenta FOR EACH ROW EXECUTE FUNCTION set_updated_at();
