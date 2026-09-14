import { Router } from 'express';
import config from '../../../config/config';
import institutosServRoutes from './institutosServ.routes';
import prodServRoutes from './prodServ.routes';

// Monta todos los módulos bajo el prefijo de la versión: /api/v1/...
const routeAPI = (app) => {
  const router = Router();
  app.use(config.API_URL, router);

  router.use('/institutos', institutosServRoutes);
  router.use('/prod-serv', prodServRoutes);

  return router;
};

export default routeAPI;
