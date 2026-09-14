import { Router } from 'express';
import * as ProdServController from '../controllers/prodServ.controller';

const router = Router();

// Producto/servicio (documento principal)
router.get('/', ProdServController.getProdServList);
router.post('/', ProdServController.createProdServ);
router.get('/:id', ProdServController.getProdServItem);
router.put('/:id', ProdServController.updateProdServ);
router.delete('/:id', ProdServController.deleteProdServ);

// Historial de estatus
router.post('/:id/estatus', ProdServController.changeEstatus);

// Presentaciones (subdocumentos)
router.post('/:id/presentaciones', ProdServController.addPresentacion);
router.put('/:id/presentaciones/:idPresenta', ProdServController.updatePresentacion);
router.delete('/:id/presentaciones/:idPresenta', ProdServController.deletePresentacion);

export default router;
