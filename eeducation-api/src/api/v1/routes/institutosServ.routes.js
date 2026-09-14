import { Router } from 'express';
import * as InstitutosServController from '../controllers/institutosServ.controller';

const router = Router();

router.get('/', InstitutosServController.getInstitutosServList);
router.post('/', InstitutosServController.createInstituto);
router.get('/:id', InstitutosServController.getInstitutoItem);
router.put('/:id', InstitutosServController.updateInstituto);
router.delete('/:id', InstitutosServController.deleteInstituto);

router.get('/:id/prod-serv', InstitutosServController.getInstitutoProdServ);

export default router;
