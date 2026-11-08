// Arquitectura de microservicios: un proceso por API + un API Gateway.
//
//   cliente ─► gateway :3060 ─┬─► watchlists    :3061  (/watchlists)
//   (REST, GraphQL,           ├─► orders        :3062  (/orders, /account)
//    Swagger, front)          ├─► option-chains :3063  (/option-chains)
//                             ├─► strategies    :3064  (/strategies, motor WASM, recomendador)
//                             └─► ai            :3065  (/ai, validación de riesgo con OpenRouter)
//
// Cada servicio monta solo sus routers; la lógica vive en services/ y no se duplica.
import express from 'express';
import morgan from 'morgan';
import { config } from '../config.js';
import { routers } from '../routes/index.js';
import { createApp } from '../app.js';
import { HttpError, errorHandler, notFoundHandler } from '../lib/errors.js';
import { monitoring } from '../lib/metrics.js';

export const SERVICES = {
  watchlists: { port: 3061, paths: ['watchlists'] },
  orders: { port: 3062, paths: ['orders', 'account'] },
  'option-chains': { port: 3063, paths: ['option-chains', 'market'] },
  strategies: { port: 3064, paths: ['strategies'] },
  ai: { port: 3065, paths: ['ai'] },
};

// Ruta pública (/orders, /account...) -> microservicio dueño.
const serviceOwnerByPath = Object.fromEntries(
  Object.entries(SERVICES).flatMap(([serviceName, serviceConfig]) =>
    serviceConfig.paths.map((routePath) => [routePath, serviceName]),
  ),
);

/**
 * Crea e inicializa la aplicación Express para un microservicio individual específico.
 *
 * @param {string} name - Nombre del microservicio registrado en SERVICES.
 * @returns {import('express').Express} Aplicación Express configurada para el microservicio.
 */
export function serviceApp(name) {
  const app = express();
  const serviceMonitoring = monitoring(name);
  app.use(morgan('dev'));
  app.use(serviceMonitoring.track);
  app.use(express.json());
  app.get('/health', serviceMonitoring.health);
  app.get('/metrics', serviceMonitoring.metrics);
  for (const routePath of SERVICES[name].paths) {
    app.use(`${config.apiUrl}/${routePath}`, routers[routePath]);
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/**
 * Crea e inicializa el API Gateway con proxy inverso HTTP hacia los microservicios y health check agregado.
 *
 * @param {Record<string, string>} [urls=config.services] - Mapa de URLs base de los microservicios.
 * @returns {import('express').Express} Aplicación Express del API Gateway.
 */
export function gatewayApp(urls = config.services) {
  const proxy = async (req, res, next) => {
    const routePrefix = req.path.split('/')[1];
    const targetService = serviceOwnerByPath[routePrefix];
    const targetUrl = urls[targetService];
    if (!targetUrl) return next();

    req.metricRoute = `/${routePrefix}`;
    let upstreamResponse;
    try {
      upstreamResponse = await fetch(`${targetUrl}${req.originalUrl}`, {
        method: req.method,
        headers: { 'content-type': 'application/json' },
        body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new HttpError(503, `El microservicio ${targetService} no responde`);
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? 'application/json';
    const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    res.status(upstreamResponse.status).type(contentType).send(responseBuffer);
  };

  // Salud agregada: 200 solo si los 4 microservicios responden "ok".
  const health = async (_req, res) => {
    const healthChecks = await Promise.all(
      Object.entries(urls).map(async ([serviceName, serviceUrl]) => {
        try {
          const checkResponse = await fetch(`${serviceUrl}/health`, { signal: AbortSignal.timeout(3000) });
          const checkData = await checkResponse.json();
          return [serviceName, checkData.status];
        } catch {
          return [serviceName, 'down'];
        }
      }),
    );
    const isHealthy = healthChecks.every(([, status]) => status === 'ok');
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'degraded',
      service: 'gateway',
      services: Object.fromEntries(healthChecks),
    });
  };

  // shortcut: GraphQL corre dentro del gateway llamando a los servicios en proceso; si GraphQL
  // crece, sus resolvers deberían llamar a los microservicios por HTTP.
  return createApp({ service: 'gateway', apiHandler: proxy, health });
}
