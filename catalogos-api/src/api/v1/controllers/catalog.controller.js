import boom from '@hapi/boom';
import * as CatalogServices from '../services/catalog.service';

// El controller traduce HTTP -> service -> HTTP. Nunca usa Mongoose directamente.
// El usuario que hace el cambio viaja en el header x-user (si no viene, se guarda 'system').
const actorOf = (req) => req.headers['x-user'] || 'system';

// GET /catalogs
export const getCatalogList = async (req, res, next) => {
  try {
    res.status(200).json(await CatalogServices.getCatalogList());
  } catch (error) {
    next(error);
  }
};

// GET /catalogs/:key   (?includeDeleted=true muestra también valores borrados)
export const getCatalogItem = async (req, res, next) => {
  try {
    const { key } = req.params;
    const catalog = await CatalogServices.getCatalogItem(key, {
      includeDeleted: req.query.includeDeleted === 'true',
    });
    if (!catalog) throw boom.notFound(`Catálogo '${key}' no encontrado.`);
    res.status(200).json(catalog);
  } catch (error) {
    next(error);
  }
};

// POST /catalogs
export const createCatalog = async (req, res, next) => {
  try {
    res.status(201).json(await CatalogServices.createCatalog(req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// PUT /catalogs/:key
export const updateCatalog = async (req, res, next) => {
  try {
    res.status(200).json(await CatalogServices.updateCatalog(req.params.key, req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// DELETE /catalogs/:key
export const deleteCatalog = async (req, res, next) => {
  try {
    res.status(200).json(await CatalogServices.deleteCatalog(req.params.key, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// GET /catalogs/:key/tree?parentId=
export const getCatalogTree = async (req, res, next) => {
  try {
    const tree = await CatalogServices.getCatalogTree(req.params.key, {
      parentId: req.query.parentId || null,
    });
    res.status(200).json(tree);
  } catch (error) {
    next(error);
  }
};

// GET /catalogs/:key/children?parentId=
export const getCatalogChildren = async (req, res, next) => {
  try {
    const children = await CatalogServices.getCatalogChildren(req.params.key, req.query.parentId || null);
    res.status(200).json(children);
  } catch (error) {
    next(error);
  }
};

// POST /catalogs/:key/values
export const addValue = async (req, res, next) => {
  try {
    res.status(201).json(await CatalogServices.addValue(req.params.key, req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// PUT /catalogs/:key/values/:valueId
export const updateValue = async (req, res, next) => {
  try {
    const { key, valueId } = req.params;
    res.status(200).json(await CatalogServices.updateValue(key, valueId, req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// DELETE /catalogs/:key/values/:valueId
export const deleteValue = async (req, res, next) => {
  try {
    const { key, valueId } = req.params;
    res.status(200).json(await CatalogServices.deleteValue(key, valueId, actorOf(req)));
  } catch (error) {
    next(error);
  }
};
