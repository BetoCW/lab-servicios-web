import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';

// Logs estructurados en JSON (un renglon por evento). Cada peticion lleva un
// identificador de correlacion (X-Request-Id) para seguirla entre servicios.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'app_restful_express' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const httpLogger = pinoHttp({
  logger,
  // Log compacto: sin cabeceras completas (llevan el token JWT)
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ status: res.statusCode }),
  },
  genReqId: (req, res) => {
    const id = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: { ignore: (req) => req.url === '/metrics' || req.url === '/health' },
});
