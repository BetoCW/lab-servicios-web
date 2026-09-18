import { Router } from 'express';
import config from '../../../config/config';
import institutosRoutes from './institutos.routes';

// Monta cada modulo de rutas bajo el prefijo de la version: /api/v1/...
const routerAPI = (app) => {
  const router = Router();
  const api = config.API_URL;

  app.use(api, router);

  router.use('/institutos', institutosRoutes);

  return router;
};

export default routerAPI;
