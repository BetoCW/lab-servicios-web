import { getPool, withTransaction } from '../../../../config/supabase.config';
import {
  CatalogTable,
  CatalogValueTable,
  fromRow,
  toColumns,
} from '../../models/supabase/Catalogs';

// ---------------------------------------------------------------------------
// REPOSITORIO Supabase (PostgreSQL): unico lugar que habla con las tablas
// catalogs y catalog_values. Arma values[] con un recursive CTE para entregar
// exactamente el mismo contrato que MongoDB devuelve embebido.
// ---------------------------------------------------------------------------

// Recorre el arbol desde el nivel 1 y ordena cada rama por su secuencia
const VALUES_TREE_SQL = `
  WITH RECURSIVE tree AS (
    SELECT v.*, 1 AS level, ARRAY[v.sequence] AS path
      FROM catalog_values v
     WHERE v.catalog_id = ANY($1::uuid[]) AND v.parent_id IS NULL
    UNION ALL
    SELECT v.*, t.level + 1, t.path || v.sequence
      FROM catalog_values v
      JOIN tree t ON v.parent_id = t.id
  )
  SELECT * FROM tree ORDER BY catalog_id, path`;

const valueOf = (row) => {
  const { catalogId, ...value } = fromRow(CatalogValueTable, row);
  return value;
};

// Agrega a cada catalogo su arreglo values[] (una sola consulta para todos)
const attachValues = async (db, catalogs) => {
  if (catalogs.length === 0) return catalogs;
  const { rows } = await db.query(VALUES_TREE_SQL, [catalogs.map((c) => c.id)]);
  return catalogs.map((catalog) => ({
    ...catalog,
    values: rows.filter((r) => r.catalog_id === catalog.id).map(valueOf),
  }));
};

// INSERT ... VALUES ($1, $2, ...) RETURNING *  a partir de un objeto camelCase
const insertRow = async (db, table, data) => {
  const cols = toColumns(table, data);
  const names = Object.keys(cols);
  const params = names.map((_, i) => `$${i + 1}`);
  const { rows } = await db.query(
    `INSERT INTO ${table.name} (${names.join(', ')}) VALUES (${params.join(', ')}) RETURNING *`,
    Object.values(cols),
  );
  return rows[0];
};

// UPDATE ... SET col = $n  WHERE <where>  RETURNING *
const updateRow = async (db, table, fields, where, whereParams) => {
  const cols = toColumns(table, fields);
  const names = Object.keys(cols);
  if (names.length === 0) return null;
  const sets = names.map((c, i) => `${c} = $${i + 1 + whereParams.length}`);
  const { rows } = await db.query(
    `UPDATE ${table.name} SET ${sets.join(', ')} WHERE ${where} RETURNING *`,
    [...whereParams, ...Object.values(cols)],
  );
  return rows[0] || null;
};

export const list = async ({ collection, section, active, includeDeleted } = {}) => {
  const where = [];
  const params = [];
  if (!includeDeleted) where.push('deleted_at IS NULL');
  if (collection) where.push(`collection = $${params.push(collection)}`);
  if (section) where.push(`section = $${params.push(section)}`);
  if (active !== undefined) where.push(`active = $${params.push(active)}`);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM catalogs ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY sequence, key`,
    params,
  );
  return attachValues(pool, rows.map((r) => fromRow(CatalogTable, r)));
};

export const findByKey = async (key) => {
  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM catalogs WHERE key = $1', [key]);
  if (rows.length === 0) return null;
  const [catalog] = await attachValues(pool, [fromRow(CatalogTable, rows[0])]);
  return catalog;
};

// Maestro y detalle en una transaccion: si falla un valor no queda nada a medias.
// Los valores llegan ordenados por nivel, asi el padre siempre existe antes que el hijo.
export const insertCatalog = async ({ values = [], ...catalog }) =>
  withTransaction(async (client) => {
    const row = await insertRow(client, CatalogTable, catalog);
    for (const value of values) {
      await insertRow(client, CatalogValueTable, { ...value, catalogId: row.id });
    }
    const [created] = await attachValues(client, [fromRow(CatalogTable, row)]);
    return created;
  });

export const updateCatalog = async (id, fields) => {
  const pool = getPool();
  const row = await updateRow(pool, CatalogTable, fields, 'id = $1', [id]);
  if (!row) return null;
  const [catalog] = await attachValues(pool, [fromRow(CatalogTable, row)]);
  return catalog;
};

export const deleteCatalog = async (id) => {
  // ON DELETE CASCADE elimina tambien todos sus catalog_values
  const { rowCount } = await getPool().query('DELETE FROM catalogs WHERE id = $1', [id]);
  return rowCount;
};

// --- Detalle: catalog_values --------------------------------------------

export const insertValues = async (catalogId, values) =>
  withTransaction(async (client) => {
    for (const value of values) {
      await insertRow(client, CatalogValueTable, { ...value, catalogId });
    }
  });

export const updateValues = async (catalogId, changes) =>
  withTransaction(async (client) => {
    for (const { id, fields } of changes) {
      await updateRow(client, CatalogValueTable, fields, 'catalog_id = $1 AND id = $2', [
        catalogId,
        id,
      ]);
    }
  });

export const deleteValues = async (catalogId, ids) => {
  await getPool().query(
    'DELETE FROM catalog_values WHERE catalog_id = $1 AND id = ANY($2::uuid[])',
    [catalogId, ids],
  );
};
