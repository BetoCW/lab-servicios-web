import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../api/node_modules/express/index.js';
import { routers } from '../../api/src/routes/index.js';
import { recommendService } from '../../api/src/services/recommend.service.js';
import { autoTradeService } from '../../api/src/services/autoTrade.service.js';
import { errorHandler } from '../../api/src/lib/errors.js';

test('recomendador HTTP: caché separada por cores y rechazo de selección vacía', async () => {
  const saved = recommendService.recommend;
  const calls = [];
  recommendService.recommend = async (symbol, query) => {
    calls.push(query.cores);
    return { symbol, cores: query.cores };
  };
  const app = express();
  app.use('/strategies', routers.strategies);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/strategies/recommend?symbol=ZZCACHE`;
  try {
    const get = async (cores) => (await fetch(`${url}&cores=${encodeURIComponent(cores)}`)).json();
    assert.equal((await get('ai')).cores, 'ai');
    assert.equal((await get('technical')).cores, 'technical');
    await get('ai');
    assert.deepEqual(calls, ['ai', 'technical']);
    await get('ai,technical');
    await get('technical,ai');
    assert.equal(calls.length, 3, 'el orden no crea otra entrada de caché');
    const empty = await fetch(`${url}&cores=`);
    assert.equal(empty.status, 400);
    assert.equal(calls.length, 3, 'selección inválida no llega al servicio');
  } finally {
    recommendService.recommend = saved;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('automático: conserva los cores elegidos al recalcular la recomendación', async () => {
  const saved = recommendService.recommend;
  let received;
  recommendService.recommend = async (_symbol, query) => {
    received = query.cores;
    throw new Error('detener antes de operar');
  };
  try {
    await assert.rejects(autoTradeService.run({ symbol: 'ZZCORES', cores: ['ai'], dryRun: true }), /detener antes de operar/);
    assert.deepEqual(received, ['ai']);
  } finally {
    recommendService.recommend = saved;
  }
});
