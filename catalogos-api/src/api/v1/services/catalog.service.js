import { v4 as uuidv4 } from 'uuid';
import boom from '@hapi/boom';
import Catalog from '../models/Catalog';
import { buildTree, getChildren } from '../../../utils/buildTree';
import { rethrow } from '../../../utils/rethrow';

// Campos del catálogo que se pueden modificar con PUT (key y values tienen sus propias reglas)
const CATALOG_FIELDS = ['label', 'description', 'collection', 'section', 'sequence', 'imageUrl', 'route', 'active'];
const VALUE_FIELDS = ['value', 'alias', 'sequence', 'imageUrl', 'description', 'active'];

const pick = (source, fields) =>
  Object.fromEntries(fields.filter((f) => source[f] !== undefined).map((f) => [f, source[f]]));

const activeValues = (catalog) => catalog.toJSON().values.filter((v) => !v.deletedAt);

// Busca un catálogo vivo (no borrado) o lanza 404
const findCatalogOrFail = async (key) => {
  const catalog = await Catalog.findOne({ key: String(key).toLowerCase(), deletedAt: null });
  if (!catalog) throw boom.notFound(`Catálogo '${key}' no encontrado.`);
  return catalog;
};

// Siguiente secuencia disponible dentro del mismo padre
const nextSequence = (values, parentId) =>
  values.filter((v) => (v.parentId ?? null) === (parentId ?? null) && !v.deletedAt)
    .reduce((max, v) => Math.max(max, v.sequence), 0) + 1;

// GET - Lista de catálogos
export const getCatalogList = async () => {
  try {
    return await Catalog.find({ deletedAt: null }).sort({ sequence: 1, key: 1 });
  } catch (error) {
    return rethrow(error);
  }
};

// GET - Un catálogo por key
export const getCatalogItem = async (key, opts = {}) => {
  try {
    const catalog = await Catalog.findOne({ key: String(key).toLowerCase(), deletedAt: null });
    if (!catalog) return null;

    const json = catalog.toJSON();
    const values = opts.includeDeleted ? json.values : json.values.filter((v) => !v.deletedAt);
    return { ...json, values };
  } catch (error) {
    return rethrow(error);
  }
};

// POST - Crear catálogo (puede venir con values iniciales)
export const createCatalog = async (payload, actor = 'system') => {
  try {
    if (!payload?.key) throw boom.badRequest('El campo key es obligatorio.');

    const exists = await Catalog.findOne({ key: String(payload.key).toLowerCase() });
    if (exists) throw boom.conflict(`Ya existe un catálogo con key '${payload.key}'.`);

    const values = (payload.values || []).map((v, i) => ({
      ...v,
      id: v.id || uuidv4(),
      sequence: v.sequence ?? i + 1,
      createdBy: actor,
      updatedBy: actor,
    }));

    return await Catalog.create({ ...payload, values, createdBy: actor, updatedBy: actor });
  } catch (error) {
    return rethrow(error);
  }
};

// PUT - Actualizar datos generales del catálogo (no cambia key ni values)
export const updateCatalog = async (key, payload, actor = 'system') => {
  try {
    const catalog = await findCatalogOrFail(key);
    Object.assign(catalog, pick(payload, CATALOG_FIELDS), { updatedBy: actor });
    await catalog.save();
    return catalog;
  } catch (error) {
    return rethrow(error);
  }
};

// DELETE - Borrado lógico del catálogo (soft delete)
export const deleteCatalog = async (key, actor = 'system') => {
  try {
    const catalog = await findCatalogOrFail(key);
    catalog.deletedAt = new Date();
    catalog.active = false;
    catalog.updatedBy = actor;
    await catalog.save();
    return catalog;
  } catch (error) {
    return rethrow(error);
  }
};

// GET - Árbol completo (o desde un parentId)
export const getCatalogTree = async (key, { parentId = null } = {}) => {
  try {
    const catalog = await findCatalogOrFail(key);
    return buildTree(activeValues(catalog), parentId);
  } catch (error) {
    return rethrow(error);
  }
};

// GET - Hijos directos de un parentId (null = nivel 1)
export const getCatalogChildren = async (key, parentId = null) => {
  try {
    const catalog = await findCatalogOrFail(key);
    return getChildren(activeValues(catalog), parentId);
  } catch (error) {
    return rethrow(error);
  }
};

// POST - Agregar valor
export const addValue = async (key, valueData = {}, actor = 'system') => {
  try {
    const catalog = await findCatalogOrFail(key);

    const code = String(valueData.code || '').trim().toUpperCase();
    if (!code) throw boom.badRequest('El campo code es obligatorio.');

    if (catalog.values.some((v) => v.code === code && !v.deletedAt)) {
      throw boom.conflict(`Ya existe el code '${code}' en el catálogo '${key}'.`);
    }

    const parentId = valueData.parentId || null;
    if (parentId && !catalog.values.some((v) => v.id === parentId && !v.deletedAt)) {
      throw boom.badRequest(`parentId '${parentId}' no existe en este catálogo.`);
    }

    catalog.values.push({
      ...pick(valueData, VALUE_FIELDS),
      id: uuidv4(),
      parentId,
      code,
      sequence: valueData.sequence ?? nextSequence(catalog.values, parentId),
      createdBy: actor,
      updatedBy: actor,
    });
    catalog.updatedBy = actor;
    await catalog.save();

    return catalog.values[catalog.values.length - 1];
  } catch (error) {
    return rethrow(error);
  }
};

// Evita ciclos: el nuevo padre no puede ser descendiente del propio valor
const isDescendant = (values, ancestorId, candidateId) => {
  let current = values.find((v) => v.id === candidateId);
  while (current) {
    if (current.parentId === ancestorId) return true;
    current = values.find((v) => v.id === current.parentId);
  }
  return false;
};

// PUT - Actualizar valor
export const updateValue = async (key, valueId, valueData = {}, actor = 'system') => {
  try {
    const catalog = await findCatalogOrFail(key);
    const value = catalog.values.find((v) => v.id === valueId && !v.deletedAt);
    if (!value) throw boom.notFound(`Valor '${valueId}' no encontrado.`);

    if (valueData.code) {
      const newCode = String(valueData.code).trim().toUpperCase();
      if (catalog.values.some((v) => v.id !== valueId && v.code === newCode && !v.deletedAt)) {
        throw boom.conflict(`Ya existe el code '${newCode}' en el catálogo '${key}'.`);
      }
      value.code = newCode;
    }

    if (Object.prototype.hasOwnProperty.call(valueData, 'parentId')) {
      const parentId = valueData.parentId || null;
      if (parentId === valueId) throw boom.badRequest('Un valor no puede ser su propio padre.');
      if (parentId && !catalog.values.some((v) => v.id === parentId && !v.deletedAt)) {
        throw boom.badRequest(`parentId '${parentId}' no existe en este catálogo.`);
      }
      if (parentId && isDescendant(catalog.values, valueId, parentId)) {
        throw boom.badRequest('No se puede mover un valor debajo de uno de sus propios hijos.');
      }
      value.parentId = parentId;
    }

    Object.assign(value, pick(valueData, VALUE_FIELDS), { updatedBy: actor });
    catalog.updatedBy = actor;
    await catalog.save();
    return value;
  } catch (error) {
    return rethrow(error);
  }
};

// DELETE - Borrado lógico de un valor y de todos sus descendientes
export const deleteValue = async (key, valueId, actor = 'system') => {
  try {
    const catalog = await findCatalogOrFail(key);
    const value = catalog.values.find((v) => v.id === valueId && !v.deletedAt);
    if (!value) throw boom.notFound(`Valor '${valueId}' no encontrado.`);

    const now = new Date();
    catalog.values
      .filter((v) => !v.deletedAt && (v.id === valueId || isDescendant(catalog.values, valueId, v.id)))
      .forEach((v) => Object.assign(v, { deletedAt: now, active: false, updatedBy: actor }));

    catalog.updatedBy = actor;
    await catalog.save();
    return value;
  } catch (error) {
    return rethrow(error);
  }
};
