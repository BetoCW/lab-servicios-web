import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { config, missingConfig } from './config.js';
import { yoga } from './graphql/index.js';
import { openapi } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { monitoring } from './lib/metrics.js';
import { fileURLToPath } from 'node:url';

// Shell HTTP del gateway: CORS, GraphQL, Swagger y el front; `apiHandler` reenvía /api/v1 a los microservicios.
export function createApp({ service, apiHandler, health }) {
  const app = express();

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
