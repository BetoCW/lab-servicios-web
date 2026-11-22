import autocannon from 'autocannon';
import config from '../src/config/config';

// Prueba de carga con autocannon: 20 conexiones durante 10 s contra la lista
// de catalogos, una corrida por motor de base de datos.
const ROOT = `http://${config.HOST}:${config.PORT}${config.API_URL}`;

const login = async (dbServer) => {
  const res = await fetch(`${ROOT}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'kperez', dbServer }),
  });
  return (await res.json()).token;
};

(async () => {
  for (const db of config.DB_SERVERS) {
    const token = await login(db);
    const r = await autocannon({
      url: `${ROOT}/catalogs`,
      connections: 20,
      duration: 10,
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`[${db}] ${r.requests.average} req/s | latencia prom ${r.latency.average} ms | p99 ${r.latency.p99} ms | errores ${r.errors} | no-2xx ${r.non2xx}`);
  }
})();
