// Prueba de carga con k6 contra el gateway (solo lecturas: no crea órdenes ni toca la cuenta).
// Uso: npm run carga (en pruebas/)   (BASE=http://localhost:3060 por defecto)
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:3060';

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '30s', target: 25 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  for (const path of ['/health', '/api/v1/watchlists', '/api/v1/strategies', '/api/v1/option-chains']) {
    check(http.get(`${BASE}${path}`), { [`${path} 200`]: (r) => r.status === 200 });
  }
  sleep(1);
}
