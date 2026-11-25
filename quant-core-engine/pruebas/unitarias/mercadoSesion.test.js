import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../api/node_modules/express/index.js';
import { alpaca } from '../../api/src/lib/alpaca.js';
import { marketSession } from '../../api/src/services/marketSession.service.js';
import { strategiesService } from '../../api/src/services/strategies.service.js';
import { autoTradeService } from '../../api/src/services/autoTrade.service.js';
import { recommendService } from '../../api/src/services/recommend.service.js';
import { routers } from '../../api/src/routes/index.js';
import { errorHandler } from '../../api/src/lib/errors.js';

test('sesión: consulta sin caché y respeta próxima apertura del proveedor, incluso festivos', async (t) => {
  let calls = 0;
  t.mock.method(alpaca, 'clock', async () => ({ is_open: ++calls === 1, next_open: '2026-11-27T09:30:00-05:00' }));
  assert.equal((await marketSession.assertOpen()).is_open, true);
  await assert.rejects(marketSession.assertOpen(), (err) => {
    assert.equal(err.status, 409);
    assert.equal(err.details.code, 'MARKET_CLOSED');
    assert.equal(err.details.nextOpen, '2026-11-27T14:30:00.000Z');
    return true;
  });
  assert.equal(calls, 2);
});

test('sesión: reloj caído o inválido impide envío con 503, sin inventar apertura', async (t) => {
  for (const clock of [null, { is_open: false }, { is_open: 'false', next_open: '2026-11-27' }]) {
    t.mock.method(alpaca, 'clock', async () => clock);
    await assert.rejects(marketSession.assertOpen(), { status: 503 });
    t.mock.restoreAll();
  }
  t.mock.method(alpaca, 'clock', async () => { throw new Error('network'); });
  await assert.rejects(marketSession.assertOpen(), { status: 503 });
});

test('sesión: submit cerrado no consulta estrategia ni crea órdenes; automático no llega al recomendador', async (t) => {
  t.mock.method(alpaca, 'clock', async () => ({ is_open: false, next_open: '2026-11-27T14:30:00Z' }));
  t.mock.method(alpaca, 'createOrder', () => assert.fail('No debe enviar la orden'));
  t.mock.method(recommendService, 'recommend', () => assert.fail('No debe calcular antes de informar cierre'));
  // No hay Supabase configurado en estas pruebas; llegar a la DB también haría fallar el caso.
  await assert.rejects(strategiesService.submit('test'), { status: 409 });
  await assert.rejects(autoTradeService.run({ symbol: 'AAPL', confirm: true }), { status: 409 });
});

test('sesión: dryRun sigue analizando fuera de horario sin consultar reloj', async (t) => {
  t.mock.method(alpaca, 'clock', () => assert.fail('dryRun no necesita sesión abierta'));
  t.mock.method(recommendService, 'recommend', async () => { throw new Error('Llegó a analizar'); });
  await assert.rejects(autoTradeService.run({ symbol: 'AAPL', dryRun: true }), /Llegó a analizar/);
});

test('sesión: HTTP submit entrega código y próxima apertura para el modal', async (t) => {
  t.mock.method(alpaca, 'clock', async () => ({ is_open: false, next_open: '2026-11-27T14:30:00Z' }));
  const app = express();
  app.use('/strategies', routers.strategies);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/strategies/11111111-1111-4111-8111-111111111111/submit`, { method: 'POST' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.details.code, 'MARKET_CLOSED');
    assert.equal(body.details.nextOpen, '2026-11-27T14:30:00.000Z');
  } finally { await new Promise((r) => server.close(r)); }
});
