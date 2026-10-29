import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Configuracion de variables de entorno
import config from './config/config';
// Rutas
import routerAPI from './api/v1/routes';
// Swagger
import { swaggerDocs } from './docs/swagger';
// Observabilidad (T3-Actividad 2): logs JSON, metricas Prometheus y salud
import { httpLogger } from './observability/logger';
import { metricsMiddleware, metricsHandler } from './observability/metrics';
import { health, ready } from './observability/health';
// Middlewares
import { notFound, errorHandler } from './api/v1/middlewares/error.handler';

// app.js configura Express: middlewares, rutas, documentacion y manejo de
// errores. No levanta el servidor ni abre la conexion a la base de datos.
const app = express();

// Configuraciones
app.set('port', config.PORT);

// Middlewares generales
app.use(httpLogger);
app.use(metricsMiddleware);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
// Proteccion contra abuso: 300 peticiones por minuto por IP (excepto /metrics y /health)
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT || 300),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => ['/metrics', '/health', '/ready'].includes(req.path),
}));
// Las respuestas GET de la API se pueden revalidar con ETag (304) durante 30 s
app.use((req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'private, max-age=30, must-revalidate');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Rutas informativas
const api = config.API_URL;

app.get('/health', health);
app.get('/ready', ready);
app.get('/metrics', metricsHandler);

app.get(`${api}`, (req, res) => {
  res.send(
    `<h1>RESTful running in root</h1>
     <p>Catalogo de Institutos: <b>${api}/institutos</b></p>
     <p>Catalogo de Catalogos (Supabase / MongoDB): <b>${api}/catalogs</b>
        - inicia sesion en <b>POST ${api}/auth/login</b></p>
     <p>Documentacion Swagger: <b>${api}/api-docs</b></p>`,
  );
});

// Rutas de la API (modelo -> servicio -> controlador -> ruteo)
routerAPI(app);

// Documentacion OpenAPI/Swagger
swaggerDocs(app);

// Siempre al final: primero el 404 generico y despues el manejador de errores
app.use(notFound);
app.use(errorHandler);

export default app;
