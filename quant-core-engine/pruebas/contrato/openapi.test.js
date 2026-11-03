// Pruebas de contrato: el contrato publicado (OpenAPI/Swagger) y lo implementado deben coincidir,
// y cada microservicio cumple el contrato que el gateway consume (/health con { status, service }).
// shortcut: contrato verificado contra OpenAPI en vez de Pact broker; migrar a Pact cuando otro
// equipo consuma la API desde su propio repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openapi } from '../../api/src/docs/openapi.js';
import { routers } from '../../api/src/routes/index.js';
import { SERVICES, serviceApp } from '../../api/src/microservices/index.js';

const implemented = new Set(
  Object.entries(routers).flatMap(([base, router]) =>
    router.stack
      .filter((l) => l.route)
      .flatMap((l) => Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} /${base}${l.route.path === '/' ? '' : l.route.path}`)),
  ),
);
const documented = new Set(
  Object.entries(openapi.paths).flatMap(([path, ops]) =>
    Object.keys(ops).filter((m) => m !== 'parameters').map((m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`),
  ),
);

test('todo endpoint documentado en OpenAPI está implementado', () => {
  assert.deepEqual([...documented].filter((e) => !implemented.has(e)), []);
});

test('todo endpoint implementado está documentado en OpenAPI', () => {
  assert.deepEqual([...implemented].filter((e) => !documented.has(e)), []);
});

test('cada microservicio cumple el contrato /health del gateway', async () => {
  for (const name of Object.keys(SERVICES)) {
    const s = serviceApp(name).listen(0);
    await new Promise((r) => s.once('listening', r));
    const r = await fetch(`http://localhost:${s.address().port}/health`);
    const body = await r.json();
    s.close();
    assert.ok([200, 503].includes(r.status), name);
    assert.equal(body.service, name);
    assert.ok(['ok', 'degraded'].includes(body.status), name);
  }
});
