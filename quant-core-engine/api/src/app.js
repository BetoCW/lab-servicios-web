import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { config, missingConfig } from './config.js';
import { api } from './routes/index.js';
import { yoga } from './graphql/index.js';
import { openapi } from './docs/openapi.js';

export const app = express();

// Private Network Access: permite que el front publicado en GitHub Pages (https) llame a
// esta API en localhost; Chrome lo pregunta en el preflight.
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(cors());
app.use(morgan('dev'));

// GraphQL va antes de express.json(): Yoga lee el body por su cuenta.
app.use(yoga.graphqlEndpoint, yoga);

app.use(express.json());

app.get('/', (_req, res) =>
  res.json({
    name: 'Quant Core Engine & Market Data (F0)',
    rest: config.apiUrl,
    graphql: yoga.graphqlEndpoint,
    docs: '/api-docs',
    app: '/app',
    apis: ['watchlists', 'orders', 'option-chains', 'strategies'].map((r) => `${config.apiUrl}/${r}`),
    missingConfig: missingConfig(),
  }),
);
app.use('/app', express.static(new URL('../../web/', import.meta.url).pathname));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use(config.apiUrl, api);

app.use((req, res) => res.status(404).json({ status: 404, message: `No existe ${req.method} ${req.path}` }));

// Express 5 manda aquí los errores de los handlers async.
app.use((err, _req, res, _next) => {
  const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ status, message: err.message, ...(err.details ? { details: err.details } : {}) });
});
