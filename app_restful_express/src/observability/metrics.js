import client from 'prom-client';

// Metricas Prometheus con el metodo RED (Rate, Errors, Duration) y las
// metricas por defecto de Node.js (CPU, memoria, event loop).
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duracion de las peticiones HTTP en segundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

const dbOps = new client.Counter({
  name: 'db_server_requests_total',
  help: 'Peticiones resueltas por motor de base de datos (mongodb / supabase)',
  labelNames: ['db'],
  registers: [registry],
});

// Middleware: mide cada peticion al terminar la respuesta
export const metricsMiddleware = (req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'no_route';
    end({ method: req.method, route, status: res.statusCode });
    const db = res.getHeader('X-Db-Server');
    if (db) dbOps.inc({ db });
  });
  next();
};

export const metricsHandler = async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
};
