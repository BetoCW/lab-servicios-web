-- =====================================================================
-- Vistas que arman el MISMO contrato JSON que devuelve MongoDB
-- (camelCase, values[] con parentId). Así la API responde igual sin
-- importar el motor de base de datos.
-- =====================================================================

-- Árbol de valores con su nivel (recursive CTE)
CREATE OR REPLACE VIEW v_catalog_values_tree AS
WITH RECURSIVE tree AS (
  SELECT v.*, 1 AS level, ARRAY[v.sequence] AS path
  FROM catalog_values v
  WHERE v.parent_id IS NULL
  UNION ALL
  SELECT v.*, t.level + 1, t.path || v.sequence
  FROM catalog_values v
  JOIN tree t ON v.parent_id = t.id
)
SELECT * FROM tree;

-- Catálogo completo en formato canónico (un renglón JSON por catálogo)
CREATE OR REPLACE VIEW v_catalogs_json AS
SELECT
  c.key,
  jsonb_build_object(
    'id', c.id,
    'key', c.key,
    'label', c.label,
    'description', c.description,
    'collection', c.collection,
    'section', c.section,
    'sequence', c.sequence,
    'imageUrl', c.image_url,
    'route', c.route,
    'active', c.active,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at,
    'values', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id,
               'parentId', t.parent_id,
               'code', t.code,
               'value', t.value,
               'alias', t.alias,
               'sequence', t.sequence,
               'level', t.level,
               'imageUrl', t.image_url,
               'description', t.description,
               'active', t.active
             ) ORDER BY t.path)
      FROM v_catalog_values_tree t
      WHERE t.catalog_id = c.id AND t.deleted_at IS NULL
    ), '[]'::jsonb)
  ) AS catalog
FROM catalogs c
WHERE c.deleted_at IS NULL;

-- Producto/servicio en el formato de la colección ProdServ de MongoDB
CREATE OR REPLACE VIEW v_prod_serv_json AS
SELECT
  ps.id_prod_serv_ok,
  jsonb_build_object(
    'IdInstitutoOK', ps.id_instituto_ok,
    'IdProdServOK', ps.id_prod_serv_ok,
    'IdProdServBK', ps.id_prod_serv_bk,
    'CodigoBarras', ps.codigo_barras,
    'DesProdServ', ps.des_prod_serv,
    'IdTipoProdServOK', ps.id_tipo_prod_serv_ok,
    'Indice', ps.indice,
    'cat_prod_serv_estatus', coalesce((
      SELECT jsonb_agg(jsonb_build_object('IdTipoEstatusOK', e.id_tipo_estatus_ok, 'Actual', e.actual, 'Observacion', e.observacion) ORDER BY e.created_at)
      FROM prod_serv_estatus e WHERE e.prod_serv_id = ps.id
    ), '[]'::jsonb),
    'cat_prod_serv_info_ad', coalesce((
      SELECT jsonb_agg(jsonb_build_object('IdEtiquetaOK', i.id_etiqueta_ok, 'Etiqueta', i.etiqueta, 'Valor', i.valor, 'Secuencia', i.secuencia) ORDER BY i.secuencia)
      FROM prod_serv_info_ad i WHERE i.prod_serv_id = ps.id AND i.borrado = 'N'
    ), '[]'::jsonb),
    'cat_prod_serv_presenta', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'IdPresentaOK', p.id_presenta_ok,
               'DesPresenta', p.des_presenta,
               'CodigoBarras', p.codigo_barras,
               'Precio', p.precio,
               'Principal', p.principal,
               'cat_prod_serv_archivos', coalesce((
                 SELECT jsonb_agg(jsonb_build_object('IdArchivoOK', a.id_archivo_ok, 'IdTipoArchivoOK', a.id_tipo_archivo_ok, 'DesArchivo', a.des_archivo, 'RutaArchivo', a.ruta_archivo, 'Principal', a.principal) ORDER BY a.secuencia)
                 FROM prod_serv_presenta_archivos a WHERE a.presenta_id = p.id AND a.borrado = 'N'
               ), '[]'::jsonb)
             ) ORDER BY p.principal DESC, p.id_presenta_ok)
      FROM prod_serv_presenta p WHERE p.prod_serv_id = ps.id AND p.borrado = 'N'
    ), '[]'::jsonb),
    'detail_row', jsonb_build_object('Activo', ps.activo, 'Borrado', ps.borrado)
  ) AS prod_serv
FROM prod_serv ps
WHERE ps.borrado = 'N';
