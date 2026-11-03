// Pruebas de integración: levanta un microservicio y el gateway en puertos libres y
// los recorre por HTTP. No llega a Alpaca ni a Supabase (solo rutas que fallan antes de salir).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gatewayApp, serviceApp } from '../../api/src/microservices/index.js';

const servers = [];
const listen = (a) =>
  new Promise((resolve) => {
    const s = a.listen(0, () => resolve(`http://localhost:${s.address().port}`));
    servers.push(s);
  });
let gw;

before(async () => {
  const watchlists = await listen(serviceApp('watchlists'));
  const down = 'http://localhost:9'; // nadie escucha: simula microservicio caído
  gw = await listen(gatewayApp({ watchlists, orders: down, 'option-chains': down, strategies: down }));
});
after(() => servers.forEach((s) => s.close()));

test('gateway: raíz y metrics', async () => {
  const root = await (await fetch(gw)).json();
  assert.equal(root.apis.length, 4);
  assert.equal(root.mode, 'gateway');
  assert.match(await (await fetch(`${gw}/metrics`)).text(), /http_requests_total\{service="gateway"/);
});

test('gateway: ruta inexistente -> 404', async () => {
  assert.equal((await fetch(`${gw}/api/v1/nada`)).status, 404);
});

test('gateway reenvía al microservicio y propaga su respuesta', async () => {
  const r = await fetch(`${gw}/api/v1/watchlists/no-es-uuid`);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, 'El id debe ser un UUID');
});

test('gateway responde 503 si el microservicio está caído', async () => {
  const r = await fetch(`${gw}/api/v1/strategies`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 503);
});

test('gateway: health agregado marca los servicios caídos', async () => {
  const r = await fetch(`${gw}/health`);
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.services.orders, 'down');
  assert.ok(['ok', 'degraded'].includes(body.services.watchlists));
});
