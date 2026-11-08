import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { config, missingConfig } from './config.js';
import { yoga } from './graphql/index.js';
import { openapi } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { monitoring } from './lib/metrics.js';
import { securityHeaders } from './lib/security.js';
import { fileURLToPath } from 'node:url';

/**
 * Crea y configura la aplicación Express del gateway o microservicio, configurando middlewares,
 * Private Network Access, CORS, endpoints de monitoreo, GraphQL Yoga, Swagger UI y enrutamiento API.
 *
 * @param {object} options - Opciones de inicialización.
 * @param {string} options.service - Nombre del servicio.
 * @param {import('express').RequestHandler} options.apiHandler - Enrutador o proxy para la API v1.
 * @param {import('express').RequestHandler} [options.health] - Controlador personalizado de health check.
 * @returns {import('express').Express} Aplicación Express configurada.
 */
export function createApp({ service, apiHandler, health }) {
  const app = express();
  app.disable('x-powered-by'); // no anunciar "Express" en cada respuesta
  app.use(securityHeaders);

  // Private Network Access: permite que el front publicado en GitHub Pages (https) llame a
  // esta API en localhost; Chrome lo pregunta en el preflight.
  app.use((req, res, next) => {
    if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
  });
  app.use(cors());
  app.use(morgan('dev'));

  const serviceMonitoring = monitoring(service);
  app.use(serviceMonitoring.track);
  app.get('/health', health ?? serviceMonitoring.health);
  app.get('/metrics', serviceMonitoring.metrics);

  // GraphQL va antes de express.json(): Yoga lee el body por su cuenta.
  app.use(yoga.graphqlEndpoint, yoga);

  app.use(express.json());

  app.get('/', (_req, res) =>
    res.json({
      name: 'Quant Core Engine & Market Data (F0)',
      mode: service,
      rest: config.apiUrl,
      graphql: yoga.graphqlEndpoint,
      docs: '/api-docs',
      app: '/app',
      health: '/health',
      metrics: '/metrics',
      apis: ['watchlists', 'orders', 'option-chains', 'strategies'].map((routePath) => `${config.apiUrl}/${routePath}`),
      missingConfig: missingConfig(),
    }),
  );
  app.use('/app', express.static(fileURLToPath(new URL('../../web/', import.meta.url))));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.use(config.apiUrl, apiHandler);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
