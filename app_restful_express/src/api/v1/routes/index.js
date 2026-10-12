import { Router } from 'express';
import config from '../../../config/config';
import institutosRoutes from './institutos.routes';
import authRoutes from './auth.routes';
import catalogsRoutes from './catalogs.routes';

// Monta cada modulo de rutas bajo el prefijo de la version: /api/v1/...
const routerAPI = (app) => {
  const router = Router();
  const api = config.API_URL;

  app.use(api, router);

  // T1-Actividad 3: proceso DEMO
  router.use('/institutos', institutosRoutes);

  // T2-Actividad 2: submodulo del proyecto final (Supabase y MongoDB)
  router.use('/auth', authRoutes);
  router.use('/catalogs', catalogsRoutes);

  return router;
};

export default routerAPI;
