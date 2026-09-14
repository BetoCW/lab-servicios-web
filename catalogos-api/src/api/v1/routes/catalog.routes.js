import { Router } from 'express';
import * as catalogController from '../controllers/catalog.controller';

const router = Router();

// Catálogo (maestro)
router.get('/', catalogController.getCatalogList);
router.post('/', catalogController.createCatalog);
router.get('/:key', catalogController.getCatalogItem);
router.put('/:key', catalogController.updateCatalog);
router.delete('/:key', catalogController.deleteCatalog);

// Jerarquía de valores (maestro-detalle-detalle)
router.get('/:key/tree', catalogController.getCatalogTree);
router.get('/:key/children', catalogController.getCatalogChildren);

// Valores (detalle)
router.post('/:key/values', catalogController.addValue);
router.put('/:key/values/:valueId', catalogController.updateValue);
router.delete('/:key/values/:valueId', catalogController.deleteValue);

export default router;
