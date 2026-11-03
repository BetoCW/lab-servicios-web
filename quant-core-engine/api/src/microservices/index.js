// Arquitectura de microservicios: un proceso por API + un API Gateway.
//
//   cliente ─► gateway :3060 ─┬─► watchlists    :3061  (/watchlists)
//   (REST, GraphQL,           ├─► orders        :3062  (/orders, /account)
//    Swagger, front)          ├─► option-chains :3063  (/option-chains)
//                             └─► strategies    :3064  (/strategies, motor WASM)
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
};

// Ruta pública (/orders, /account...) -> microservicio dueño.
const owner = Object.fromEntries(Object.entries(SERVICES).flatMap(([name, s]) => s.paths.map((p) => [p, name])));

export function serviceApp(name) {
  const app = express();
  const mon = monitoring(name);
  app.use(morgan('dev'));
  app.use(mon.track);
  app.use(express.json());
  app.get('/health', mon.health);
  app.get('/metrics', mon.metrics);
  for (const p of SERVICES[name].paths) app.use(`${config.apiUrl}/${p}`, routers[p]);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function gatewayApp(urls = config.services) {
  const proxy = async (req, res, next) => {
    const path = req.path.split('/')[1];
    const target = urls[owner[path]];
    if (!target) return next();
    req.metricRoute = `/${path}`;
    let r;
    try {
      r = await fetch(`${target}${req.originalUrl}`, {
        method: req.method,
        headers: { 'content-type': 'application/json' },
        body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new HttpError(503, `El microservicio ${owner[path]} no responde`);
    }
    res.status(r.status).type(r.headers.get('content-type') ?? 'application/json').send(Buffer.from(await r.arrayBuffer()));
  };

  // Salud agregada: 200 solo si los 4 microservicios responden "ok".
  const health = async (_req, res) => {
    const checks = await Promise.all(
      Object.entries(urls).map(async ([name, url]) => {
        try {
          const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
          return [name, (await r.json()).status];
        } catch {
          return [name, 'down'];
        }
      }),
    );
    const ok = checks.every(([, s]) => s === 'ok');
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', service: 'gateway', services: Object.fromEntries(checks) });
  };

  // shortcut: GraphQL corre dentro del gateway llamando a los servicios en proceso; si GraphQL
  // crece, sus resolvers deberían llamar a los microservicios por HTTP.
  return createApp({ service: 'gateway', apiHandler: proxy, health });
}
