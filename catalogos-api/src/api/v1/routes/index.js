import { Router } from 'express';
import config from '../../../config/config';
import catalogRoutes from './catalog.routes';

// Monta todos los módulos bajo el prefijo de la versión: /api/v1/...
const routeAPI = (app) => {
  const router = Router();
  app.use(config.API_URL, router);

  router.use('/catalogs', catalogRoutes);

  return router;
};

export default routeAPI;
