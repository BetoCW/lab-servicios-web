// ---------------------------------------------------------------------------
// CLASE MODELO (Supabase/PostgreSQL): tablas catalogs y catalog_values.
// En SQL las columnas viven en snake_case; la API siempre responde camelCase.
// Este archivo describe cada tabla y traduce filas <-> objetos del contrato.
// El DDL completo esta en scripts/supabase/01_catalogs.sql.
// ---------------------------------------------------------------------------

// columna SQL -> propiedad del contrato
export const CatalogTable = {
  name: 'catalogs',
  columns: {
    id: 'id',
    key: 'key',
    label: 'label',
    description: 'description',
    collection: 'collection',
    section: 'section',
    sequence: 'sequence',
    image_url: 'imageUrl',
    route: 'route',
    active: 'active',
    deleted_at: 'deletedAt',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    created_by: 'createdBy',
    updated_by: 'updatedBy',
  },
};

export const CatalogValueTable = {
  name: 'catalog_values',
  columns: {
    id: 'id',
    catalog_id: 'catalogId',
    parent_id: 'parentId',
    code: 'code',
    value: 'value',
    alias: 'alias',
    sequence: 'sequence',
    image_url: 'imageUrl',
    description: 'description',
    active: 'active',
    deleted_at: 'deletedAt',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    created_by: 'createdBy',
    updated_by: 'updatedBy',
  },
};

// Fila SQL -> objeto camelCase (solo columnas conocidas)
export const fromRow = (table, row) =>
  Object.fromEntries(
    Object.entries(table.columns)
      .filter(([column]) => row[column] !== undefined)
      .map(([column, prop]) => [prop, row[column]]),
  );

// Objeto camelCase -> { columna: valor } (ignora lo que no sea columna)
export const toColumns = (table, data) => {
  const byProp = Object.fromEntries(Object.entries(table.columns).map(([c, p]) => [p, c]));
  return Object.fromEntries(
    Object.entries(data)
      .filter(([prop, value]) => byProp[prop] && value !== undefined)
      .map(([prop, value]) => [byProp[prop], value]),
  );
};
