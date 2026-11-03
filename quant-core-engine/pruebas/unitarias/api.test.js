// Pruebas unitarias: funciones puras, sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOcc } from '../../api/src/lib/occ.js';
import { assertUuid, check } from '../../api/src/lib/errors.js';
import { monitoring } from '../../api/src/lib/metrics.js';

test('parseOcc descompone un símbolo OCC', () => {
  assert.deepEqual(parseOcc('AAPL251219C00200000'), { root: 'AAPL', expiration: '2025-12-19', type: 'call', strike: 200 });
  assert.deepEqual(parseOcc('spy260116p00450500'), { root: 'SPY', expiration: '2026-01-16', type: 'put', strike: 450.5 });
  assert.equal(parseOcc('AAPL'), null);
  assert.equal(parseOcc('AAPL251219X00200000'), null);
});

test('check lista todos los errores del body en un 400', () => {
  assert.throws(
    () => check({ qty: -1, side: 'hold' }, { symbol: { required: true }, qty: { positive: true }, side: { oneOf: ['buy', 'sell'] } }),
    (err) => err.status === 400 && err.details.length === 3,
  );
  assert.doesNotThrow(() => check({ symbol: 'SPY', qty: 1 }, { symbol: { required: true, type: 'string' }, qty: { type: 'number' } }));
});

test('assertUuid rechaza ids que no son UUID', () => {
  assert.throws(() => assertUuid('123'), { status: 400 });
  assert.doesNotThrow(() => assertUuid('7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f'));
});

test('monitoring expone métricas en formato Prometheus', () => {
  const mon = monitoring('demo');
  const req = { method: 'GET', route: { path: '/:id' } };
  const handlers = {};
  const res = { statusCode: 200, on: (ev, fn) => (handlers[ev] = fn) };
  mon.track(req, res, () => {});
  handlers.finish();
  let body = '';
  mon.metrics({}, { type: () => ({ send: (b) => (body = b) }) });
  assert.match(body, /http_requests_total\{service="demo",method="GET",route="\/:id",status="200"\} 1/);
});
