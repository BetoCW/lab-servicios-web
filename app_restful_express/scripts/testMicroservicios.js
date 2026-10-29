import http from 'http';
import config from '../src/config/config';

// T3-Actividad 2 - Pruebas de los microservicios (servidor en ejecucion).
// Verifica salud, metricas, cabeceras de optimizacion (ETag/304, compresion,
// seguridad, X-Request-Id) y que MongoDB y Supabase respondan el mismo contrato.
const ROOT = `http://${config.HOST}:${config.PORT}`;
const BASE = `${ROOT}${config.API_URL}`;
const results = [];
const SEED = ['brokers', 'strategies', 'indicators', 'timeframes'];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

// fetch de Node oculta los 304; con node:http se ve el codigo real del servidor
const rawGet = (url, headers) => new Promise((resolve, reject) => {
  http.get(url, { headers }, (res) => {
    res.resume();
    res.on('end', () => resolve({ status: res.statusCode }));
  }).on('error', reject);
});

const login = async (dbServer) => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'kperez', dbServer }),
  });
  return (await res.json()).token;
};

const run = async () => {
  const h = await fetch(`${ROOT}/health`);
  check('GET /health responde 200 con status ok', h.status === 200 && (await h.json()).status === 'ok');

  const r = await fetch(`${ROOT}/ready`);
  const rb = await r.json();
  check('GET /ready: MongoDB y Supabase arriba', r.status === 200 && rb.checks.mongodb === 'up' && rb.checks.supabase === 'up', JSON.stringify(rb.checks));

  const rid = await fetch(`${ROOT}/health`, { headers: { 'X-Request-Id': 'prueba-123' } });
  check('X-Request-Id se propaga (correlacion)', rid.headers.get('x-request-id') === 'prueba-123');
  check('Helmet: X-Content-Type-Options=nosniff', h.headers.get('x-content-type-options') === 'nosniff');

  const contracts = {};
  for (const db of config.DB_SERVERS) {
    const token = await login(db);
    const auth = { Authorization: `Bearer ${token}` };
    const res = await fetch(`${BASE}/catalogs`, { headers: auth });
    const body = await res.json();
    check(`[${db}] GET /catalogs 200 y X-Db-Server=${db}`, res.status === 200 && res.headers.get('x-db-server') === db);
    check(`[${db}] Cache-Control y ETag presentes`, !!res.headers.get('etag') && /max-age/.test(res.headers.get('cache-control') || ''));
    const etag = res.headers.get('etag');
    const again = await rawGet(`${BASE}/catalogs`, { ...auth, 'If-None-Match': etag });
    check(`[${db}] revalidacion con ETag devuelve 304`, again.status === 304);
    contracts[db] = body.filter((c) => SEED.includes(c.key)).map((c) => `${c.key}:${c.values.length}`).sort().join(',');
    const sin = await fetch(`${BASE}/catalogs`);
    check(`[${db}] sin token devuelve 401`, sin.status === 401);
  }
  check('Mismo contrato en MongoDB y Supabase (catalogos del seed y sus valores)', contracts.mongodb === contracts.supabase, `${contracts.mongodb} | ${contracts.supabase}`);

  const m = await (await fetch(`${ROOT}/metrics`)).text();
  check('GET /metrics expone http_request_duration_seconds', m.includes('http_request_duration_seconds_count'));
  check('GET /metrics cuenta peticiones por motor de BD', /db_server_requests_total\{db="mongodb"\}/.test(m) && /db_server_requests_total\{db="supabase"\}/.test(m));
  check('GET /metrics incluye metricas de Node.js', m.includes('process_cpu_user_seconds_total'));
};

run()
  .catch((e) => check('Ejecucion sin excepciones', false, e.message))
  .finally(() => {
    let failed = 0;
    results.forEach((r) => {
      if (!r.ok) failed += 1;
      console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
    });
    console.log(`\n${results.length - failed}/${results.length} pruebas correctas`);
    process.exit(failed ? 1 : 0);
  });
