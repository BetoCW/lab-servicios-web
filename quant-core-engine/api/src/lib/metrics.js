// Monitoreo mínimo: /health (para UptimeRobot / Docker) y /metrics en formato Prometheus.
// shortcut: contadores en memoria por proceso (se reinician al reiniciar); si se escala a varias
// réplicas, migrar a prom-client + Pushgateway o a un APM.
import { missingConfig } from '../config.js';

export function monitoring(service) {
  // In-memory request metric counters keyed by 'method|route|status'.
  // Counters reset upon process restart; suitable for single-instance or sidecar scraping.
  const series = new Map();
  const started = Date.now();

  const track = (req, res, next) => {
    const startTimeNs = process.hrtime.bigint();
    res.on('finish', () => {
      // Use route pattern (e.g., /:id) rather than concrete path to prevent cardinality explosion.
      const route = req.metricRoute ?? req.route?.path ?? (res.statusCode === 404 ? 'not_found' : 'other');
      const key = `${req.method}|${route}|${res.statusCode}`;
      const metricStat = series.get(key) ?? { count: 0, seconds: 0 };
      metricStat.count++;
      metricStat.seconds += Number(process.hrtime.bigint() - startTimeNs) / 1e9;
      series.set(key, metricStat);
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
    for (const [key, metricStat] of series) {
      const [method, route, status] = key.split('|');
      const labels = `service="${service}",method="${method}",route="${route}",status="${status}"`;
      lines.push(`http_requests_total{${labels}} ${metricStat.count}`);
      lines.push(`http_request_duration_seconds_sum{${labels}} ${metricStat.seconds.toFixed(6)}`);
      lines.push(`http_request_duration_seconds_count{${labels}} ${metricStat.count}`);
    }
    lines.push('# TYPE process_resident_memory_bytes gauge', `process_resident_memory_bytes{service="${service}"} ${process.memoryUsage().rss}`);
    lines.push('# TYPE process_uptime_seconds gauge', `process_uptime_seconds{service="${service}"} ${(Date.now() - started) / 1000}`);
    res.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  };

  return { track, health, metrics };
}
