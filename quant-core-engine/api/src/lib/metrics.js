// Monitoreo mínimo: /health (para UptimeRobot / Docker) y /metrics en formato Prometheus.
// shortcut: contadores en memoria por proceso (se reinician al reiniciar); si se escala a varias
// réplicas, migrar a prom-client + Pushgateway o a un APM.
import { missingConfig } from '../config.js';

export function monitoring(service) {
  const series = new Map(); // 'method|route|status' -> { count, seconds }
  const started = Date.now();

  const track = (req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      // Ruta como patrón (/:id) y no como URL real, para no crear una serie por cada id.
      const route = req.metricRoute ?? req.route?.path ?? (res.statusCode === 404 ? 'not_found' : 'other');
      const key = `${req.method}|${route}|${res.statusCode}`;
      const s = series.get(key) ?? { count: 0, seconds: 0 };
      s.count++;
      s.seconds += Number(process.hrtime.bigint() - t0) / 1e9;
      series.set(key, s);
    });
    next();
  };

  const health = (_req, res) => {
    const missing = missingConfig();
    res.status(missing.length ? 503 : 200).json({
      status: missing.length ? 'degraded' : 'ok',
      service,
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      missingConfig: missing,
    });
  };

  const metrics = (_req, res) => {
    const lines = [
      '# HELP http_requests_total Peticiones HTTP atendidas.',
      '# TYPE http_requests_total counter',
      '# HELP http_request_duration_seconds Tiempo de respuesta.',
      '# TYPE http_request_duration_seconds summary',
    ];
    for (const [key, s] of series) {
      const [method, route, status] = key.split('|');
      const labels = `service="${service}",method="${method}",route="${route}",status="${status}"`;
      lines.push(`http_requests_total{${labels}} ${s.count}`);
      lines.push(`http_request_duration_seconds_sum{${labels}} ${s.seconds.toFixed(6)}`);
      lines.push(`http_request_duration_seconds_count{${labels}} ${s.count}`);
    }
    lines.push('# TYPE process_resident_memory_bytes gauge', `process_resident_memory_bytes{service="${service}"} ${process.memoryUsage().rss}`);
    lines.push('# TYPE process_uptime_seconds gauge', `process_uptime_seconds{service="${service}"} ${(Date.now() - started) / 1000}`);
    res.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  };

  return { track, health, metrics };
}
