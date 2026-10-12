import { randomUUID } from 'crypto';
import boom from '@hapi/boom';
import { getCatalogsRepository } from '../repositories/catalogs';

// ---------------------------------------------------------------------------
// SERVICIO: reglas de negocio del Catalogo de Catalogos. No sabe si los datos
// viven en MongoDB o en Supabase: recibe la sesion (ctx) y le pide al
// repositorio correspondiente que lea o escriba.
//   ctx = { dbServer: 'mongodb' | 'supabase', usuario: 'KPEREZ' }
// ---------------------------------------------------------------------------

const KEY_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/; // snake_case: vehicle_type
const CODE_RE = /^[A-Z0-9]+(_[A-Z0-9]+)*$/; // UPPER_SNAKE: VEH_PICKUP
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Campos que el cliente puede escribir; id, auditoria y fechas los pone el servicio
const CATALOG_FIELDS = [
  'label', 'description', 'collection', 'section', 'sequence', 'imageUrl', 'route', 'active',
];
const VALUE_FIELDS = ['value', 'alias', 'sequence', 'imageUrl', 'description', 'active'];

const pick = (source, fields) =>
  Object.fromEntries(fields.filter((f) => source[f] !== undefined).map((f) => [f, source[f]]));

const repo = (ctx) => getCatalogsRepository(ctx.dbServer);

const isAlive = (item) => !item.deletedAt;

// Orden fijo de las propiedades del contrato: las dos bases responden igual
const CATALOG_ORDER = [
  'id', 'key', 'label', 'description', 'collection', 'section', 'sequence', 'imageUrl', 'route',
  'active', 'deletedAt', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
];
const VALUE_ORDER = [
  'id', 'parentId', 'code', 'value', 'alias', 'sequence', 'imageUrl', 'description', 'active',
  'deletedAt', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
];
const ordered = (source, order) => Object.fromEntries(order.map((f) => [f, source[f] ?? null]));

// Recorrido en profundidad (padre, hijos por secuencia, ...): es el mismo orden
// que produce el recursive CTE de Supabase, asi MongoDB responde identico
const depthFirst = (values, parentId = null) =>
  values
    .filter((v) => (v.parentId ?? null) === parentId)
    .sort((a, b) => a.sequence - b.sequence)
    .flatMap((v) => [v, ...depthFirst(values, v.id)]);

// Vista publica del catalogo: contrato canonico sin los valores con baja logica
const present = (catalog, { includeDeleted = false } = {}) => ({
  ...ordered(catalog, CATALOG_ORDER),
  values: depthFirst(includeDeleted ? catalog.values : catalog.values.filter(isAlive))
    .map((v) => ordered(v, VALUE_ORDER)),
});

// --- Utilidades del arbol (maestro-detalle-detalle) -----------------------

// Nivel de cada valor: 1 si no tiene padre, 1 + nivel del padre si lo tiene
const levelsOf = (values) => {
  const byId = new Map(values.map((v) => [v.id, v]));
  const levels = new Map();
  const levelOf = (v) => {
    if (levels.has(v.id)) return levels.get(v.id);
    const parent = v.parentId ? byId.get(v.parentId) : null;
    const level = parent ? levelOf(parent) + 1 : 1;
    levels.set(v.id, level);
    return level;
  };
  values.forEach(levelOf);
  return levels;
};

// Ids de todos los descendientes de un valor (hijos, nietos, ...)
const descendantsOf = (values, id) => {
  const result = [];
  const pending = [id];
  while (pending.length) {
    const current = pending.pop();
    values
      .filter((v) => v.parentId === current)
      .forEach((child) => {
        result.push(child.id);
        pending.push(child.id);
      });
  }
  return result;
};

const buildTree = (values, parentId = null) =>
  values
    .filter((v) => (v.parentId ?? null) === parentId)
    .sort((a, b) => a.sequence - b.sequence)
    .map((v) => ({ ...ordered(v, VALUE_ORDER), children: buildTree(values, v.id) }));

// --- Validaciones -----------------------------------------------------------

const assertKey = (key) => {
  if (!key || !KEY_RE.test(key)) {
    throw boom.badRequest(`La key '${key ?? ''}' es invalida: debe ir en snake_case (ej. vehicle_type).`);
  }
};

const assertUuid = (id, what = 'id') => {
  if (!UUID_RE.test(String(id))) throw boom.badRequest(`El ${what} '${id}' no es un UUID valido.`);
};

const findCatalogOrFail = async (ctx, key) => {
  const catalog = await repo(ctx).findByKey(String(key).toLowerCase());
  if (!catalog || !isAlive(catalog)) throw boom.notFound(`No se encontro el catalogo '${key}'.`);
  return catalog;
};

const findValueOrFail = (catalog, valueId) => {
  assertUuid(valueId, 'valueId');
  const value = catalog.values.find((v) => v.id === valueId && isAlive(v));
  if (!value) throw boom.notFound(`El valor '${valueId}' no existe en el catalogo '${catalog.key}'.`);
  return value;
};

// Prepara un lote de valores nuevos contra los que ya existen en el catalogo:
// genera ids, valida code/parentId/sequence y los ordena padre -> hijo.
const prepareValues = (existing, incoming, actor) => {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    throw boom.badRequest('Se esperaba al menos un valor.');
  }
  const now = new Date();
  const all = [...existing];
  const batch = [];

  incoming.forEach((raw, i) => {
    const where = `values[${i}]`;
    if (!raw || typeof raw !== 'object') throw boom.badRequest(`${where} debe ser un objeto.`);
    if (!raw.code || !CODE_RE.test(raw.code)) {
      throw boom.badRequest(`${where}.code '${raw.code ?? ''}' es invalido: debe ir en UPPER_SNAKE.`);
    }
    if (!raw.value) throw boom.badRequest(`${where}.value es obligatorio.`);
    if (raw.id !== undefined) assertUuid(raw.id, `${where}.id`);
    if (raw.id && all.some((v) => v.id === raw.id)) {
      throw boom.conflict(`${where}.id '${raw.id}' ya existe.`);
    }
    if (all.some((v) => v.code === raw.code)) {
      throw boom.conflict(`El code '${raw.code}' ya existe en el catalogo.`);
    }

    const parentId = raw.parentId ?? null;
    if (parentId) {
      const parent = all.find((v) => v.id === parentId);
      if (!parent || !isAlive(parent)) {
        throw boom.badRequest(`${where}.parentId '${parentId}' no corresponde a un valor activo.`);
      }
    }

    // Secuencia unica por scope (mismo padre). Se cuentan tambien los borrados
    // logicamente porque siguen ocupando su lugar en la base de datos.
    const scope = all.filter((v) => (v.parentId ?? null) === parentId);
    let { sequence } = raw;
    if (sequence === undefined || sequence === null) {
      sequence = scope.reduce((max, v) => Math.max(max, v.sequence), 0) + 1;
    } else if (scope.some((v) => v.sequence === sequence)) {
      throw boom.conflict(`La secuencia ${sequence} ya esta ocupada en ese nivel (${where}).`);
    }

    const value = {
      ...pick(raw, VALUE_FIELDS),
      id: raw.id || randomUUID(),
      parentId,
      code: raw.code,
      sequence,
      active: raw.active ?? true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    all.push(value);
    batch.push(value);
  });

  // Padres antes que hijos: Supabase necesita que la FK parent_id ya exista
  const levels = levelsOf(all);
  return batch.sort((a, b) => levels.get(a.id) - levels.get(b.id));
};

const prepareCatalog = (payload, actor) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw boom.badRequest('El body debe ser un objeto catalogo.');
  }
  assertKey(payload.key);
  if (!payload.label) throw boom.badRequest('El campo label es obligatorio.');
  if (!payload.collection) throw boom.badRequest('El campo collection es obligatorio.');

  const now = new Date();
  const values = payload.values?.length ? prepareValues([], payload.values, actor) : [];
  return {
    ...pick(payload, CATALOG_FIELDS),
    id: randomUUID(),
    key: payload.key,
    sequence: payload.sequence ?? 0,
    active: payload.active ?? true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    values,
  };
};

// Ejecuta una operacion por elemento y reporta cuales salieron bien y cuales no
const runMany = async (items, operation) => {
  const ok = [];
  const failed = [];
  for (const [index, item] of items.entries()) {
    try {
      ok.push(await operation(item));
    } catch (error) {
      failed.push({
        index,
        statusCode: boom.isBoom(error) ? error.output.statusCode : 500,
        message: error.message,
      });
    }
  }
  return { ok, failed };
};

const assertArray = (items, name) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw boom.badRequest(`Se esperaba un arreglo ${name} con al menos un elemento.`);
  }
};

// ===========================================================================
// CATALOGOS (coleccion / tabla principal)
// ===========================================================================

// GET /catalogs
export const getCatalogs = async (ctx, query = {}) => {
  const catalogs = await repo(ctx).list({
    collection: query.collection,
    section: query.section,
    active: query.active === undefined ? undefined : query.active === 'true',
  });
  return catalogs.map((c) => present(c));
};

// GET /catalogs/:key
export const getCatalog = async (ctx, key, { includeDeleted = false } = {}) =>
  present(await findCatalogOrFail(ctx, key), { includeDeleted });

// POST /catalogs
export const createCatalog = async (ctx, payload) => {
  const catalog = prepareCatalog(payload, ctx.usuario);
  const existing = await repo(ctx).findByKey(catalog.key);
  if (existing) {
    const how = isAlive(existing) ? '' : ' (con baja logica; usa DELETE ?hard=true para liberarla)';
    throw boom.conflict(`Ya existe un catalogo con key '${catalog.key}'${how}.`);
  }
  return present(await repo(ctx).insertCatalog(catalog));
};

// POST /catalogs/many
export const createManyCatalogs = async (ctx, items) => {
  assertArray(items, 'de catalogos');
  return runMany(items, (item) => createCatalog(ctx, item));
};

// PUT /catalogs/:key  (la key no cambia: es la llave de negocio)
export const updateCatalog = async (ctx, key, payload = {}) => {
  const catalog = await findCatalogOrFail(ctx, key);
  const fields = pick(payload, CATALOG_FIELDS);
  if (Object.keys(fields).length === 0) {
    throw boom.badRequest(`No se envio ningun campo modificable (${CATALOG_FIELDS.join(', ')}).`);
  }
  const updated = await repo(ctx).updateCatalog(catalog.id, {
    ...fields,
    updatedAt: new Date(),
    updatedBy: ctx.usuario,
  });
  return present(updated);
};

// PUT /catalogs/many  -> [{ key, ...campos }]
export const updateManyCatalogs = async (ctx, items) => {
  assertArray(items, 'de catalogos');
  return runMany(items, (item) => updateCatalog(ctx, item?.key, item));
};

// DELETE /catalogs/:key  (logico por defecto, fisico con hard=true)
export const deleteCatalog = async (ctx, key, { hard = false } = {}) => {
  if (hard) {
    // El borrado fisico tambien alcanza a los catalogos que ya tenian baja logica
    const catalog = await repo(ctx).findByKey(String(key).toLowerCase());
    if (!catalog) throw boom.notFound(`No se encontro el catalogo '${key}'.`);
    await repo(ctx).deleteCatalog(catalog.id);
    return { key: catalog.key, deleted: 'hard' };
  }
  const catalog = await findCatalogOrFail(ctx, key);
  const updated = await repo(ctx).updateCatalog(catalog.id, {
    active: false,
    deletedAt: new Date(),
    updatedAt: new Date(),
    updatedBy: ctx.usuario,
  });
  return { key: updated.key, deleted: 'soft', deletedAt: updated.deletedAt };
};

// DELETE /catalogs/many  -> { keys: [...] }
export const deleteManyCatalogs = async (ctx, keys, options) => {
  assertArray(keys, 'keys');
  return runMany(keys, (key) => deleteCatalog(ctx, key, options));
};

// ===========================================================================
// VALORES (subdocumento values[] / tabla catalog_values)
// ===========================================================================

// GET /catalogs/:key/values?parentId=&level=
export const getValues = async (ctx, key, { parentId, level } = {}) => {
  const catalog = await findCatalogOrFail(ctx, key);
  const alive = catalog.values.filter(isAlive);
  const levels = levelsOf(alive);
  return depthFirst(alive)
    .map((v) => ({ ...ordered(v, VALUE_ORDER), level: levels.get(v.id) }))
    .filter((v) => parentId === undefined || (v.parentId ?? 'null') === parentId)
    .filter((v) => level === undefined || v.level === Number(level));
};

// GET /catalogs/:key/values/:valueId
export const getValue = async (ctx, key, valueId) => {
  const catalog = await findCatalogOrFail(ctx, key);
  const value = findValueOrFail(catalog, valueId);
  const alive = catalog.values.filter(isAlive);
  return {
    ...ordered(value, VALUE_ORDER),
    level: levelsOf(alive).get(value.id),
    children: alive.filter((v) => v.parentId === value.id).map((v) => ordered(v, VALUE_ORDER)),
  };
};

// GET /catalogs/:key/tree
export const getTree = async (ctx, key) => {
  const catalog = await findCatalogOrFail(ctx, key);
  return { ...ordered(catalog, CATALOG_ORDER), values: buildTree(catalog.values.filter(isAlive)) };
};

// POST /catalogs/:key/values   (uno)   y   /values/many   (arreglo)
export const addValues = async (ctx, key, incoming) => {
  const catalog = await findCatalogOrFail(ctx, key);
  const values = prepareValues(catalog.values, incoming, ctx.usuario);
  await repo(ctx).insertValues(catalog.id, values);
  await repo(ctx).updateCatalog(catalog.id, { updatedAt: new Date(), updatedBy: ctx.usuario });
  return values.map((v) => ordered(v, VALUE_ORDER));
};

// PUT /catalogs/:key/values/:valueId  (uno)  y  /values/many  [{ id, ... }]
// code y parentId no se cambian: identifican al valor y a su lugar en el arbol
export const updateValues = async (ctx, key, changes) => {
  assertArray(changes, 'de valores');
  const catalog = await findCatalogOrFail(ctx, key);
  const now = new Date();

  const prepared = changes.map((change, i) => {
    const current = findValueOrFail(catalog, change?.id);
    const fields = pick(change, VALUE_FIELDS);
    if (Object.keys(fields).length === 0) {
      throw boom.badRequest(`values[${i}] no trae campos modificables (${VALUE_FIELDS.join(', ')}).`);
    }
    if (fields.sequence !== undefined && fields.sequence !== current.sequence) {
      const taken = catalog.values.some(
        (v) => v.id !== current.id
          && (v.parentId ?? null) === (current.parentId ?? null)
          && v.sequence === fields.sequence,
      );
      if (taken) throw boom.conflict(`La secuencia ${fields.sequence} ya esta ocupada en ese nivel.`);
    }
    return { id: current.id, fields: { ...fields, updatedAt: now, updatedBy: ctx.usuario } };
  });

  await repo(ctx).updateValues(catalog.id, prepared);
  const fresh = await findCatalogOrFail(ctx, key);
  return prepared.map(({ id }) => ordered(fresh.values.find((v) => v.id === id), VALUE_ORDER));
};

// DELETE /catalogs/:key/values/:valueId  y  /values/many { ids: [...] }
// Borrar un valor arrastra a sus descendientes: no pueden quedar hijos huerfanos
export const deleteValues = async (ctx, key, ids, { hard = false } = {}) => {
  assertArray(ids, 'ids');
  const catalog = await findCatalogOrFail(ctx, key);
  ids.forEach((id) => findValueOrFail(catalog, id));

  const affected = [...new Set(ids.flatMap((id) => [id, ...descendantsOf(catalog.values, id)]))];

  if (hard) {
    await repo(ctx).deleteValues(catalog.id, affected);
  } else {
    const now = new Date();
    await repo(ctx).updateValues(
      catalog.id,
      affected.map((id) => ({
        id,
        fields: { active: false, deletedAt: now, updatedAt: now, updatedBy: ctx.usuario },
      })),
    );
  }
  return { key: catalog.key, deleted: hard ? 'hard' : 'soft', requested: ids, affected };
};
