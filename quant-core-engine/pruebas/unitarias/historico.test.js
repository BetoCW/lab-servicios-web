import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alpaca } from '../../api/src/lib/alpaca.js';
import { marketService } from '../../api/src/services/market.service.js';

const bar = (t, c = 100) => ({ t, o: 100, h: 110, l: 90, c, v: 1000 });

test('histórico: fechas inclusivas, cantidad pequeña y paginación sin alterar velas cerradas', async (t) => {
  const queries = [];
  t.mock.method(alpaca, 'stockSnapshot', async () => { throw new Error('No debe pedir cotización para un rango cerrado'); });
  t.mock.method(alpaca, 'stockBars', async (_, query) => {
    queries.push(query);
    return query.page_token
      ? { bars: [bar('2026-01-02T14:30:00Z')] }
      : { bars: [bar('2026-01-05T14:30:00Z', 105)], next_page_token: 'pagina2' };
  });
  const out = await marketService.bars('AAPL', { timeframe: '1Day', limit: '2', start: '2026-01-01', end: '2026-01-05' });
  assert.equal(queries.length, 2);
  assert.equal(queries[0].start, '2026-01-01T00:00:00.000Z');
  assert.equal(queries[0].end, '2026-01-05T23:59:59.999Z');
  assert.equal(queries[1].limit, 1);
  assert.equal(queries[1].page_token, 'pagina2');
  assert.deepEqual(out.bars.map((b) => b.close), [100, 105]);
  assert.equal(out.indicators.ema9.length, 2);
});

test('histórico: sin fin consulta hasta la actualidad; acepta semanas y meses', async (t) => {
  const queries = [];
  t.mock.method(alpaca, 'stockBars', async (_, q) => {
    queries.push(q);
    return { bars: [bar('2026-01-01T05:00:00Z')] };
  });
  t.mock.method(alpaca, 'stockSnapshot', async () => ({ latestTrade: { t: '2026-01-20T15:00:00Z', p: 120 } }));
  const weekly = await marketService.bars('WEEK', { timeframe: '1Week', start: '2026-01-01' });
  const monthly = await marketService.bars('MONTH', { timeframe: '1Month', start: '2026-01-01', end: '' });
  assert.equal(queries[0].end, undefined);
  assert.equal(queries[1].end, undefined);
  assert.equal(weekly.bars[0].close, 100); // el trade ya está fuera de la semana
  assert.equal(monthly.bars[0].close, 120); // pero pertenece al mes
});

test('histórico: ventana automática relativa al fin y trade anterior a la vela', async (t) => {
  let query;
  t.mock.method(alpaca, 'stockBars', async (_, q) => {
    query = q;
    return { bars: [bar('2026-03-02T05:00:00Z')] };
  });
  t.mock.method(alpaca, 'stockSnapshot', async () => ({ latestTrade: { t: '2026-03-01T15:00:00Z', p: 999 } }));
  await marketService.bars('PAST', { timeframe: '1Day', end: '2020-01-31' });
  assert.ok(query.start < query.end);
  assert.ok(query.start.startsWith('2018-'));
  const out = await marketService.bars('OLDTRADE', { timeframe: '1Day' });
  assert.equal(out.bars[0].close, 100);
});

test('histórico: rechaza filtros inválidos antes de consultar Alpaca', async (t) => {
  t.mock.method(alpaca, 'stockBars', async () => assert.fail('No debe consultar Alpaca'));
  for (const query of [
    { limit: 0 }, { limit: 1001 }, { limit: 'abc' }, { limit: 1.5 },
    { start: '2026-02-30' }, { end: 'invalida' }, { end: '2026-13-01' },
    { start: '2026-02-01', end: '2026-01-01' }, { timeframe: 'toString' },
    { start: '2999-01-01' },
  ]) await assert.rejects(marketService.bars('AAPL', query), { status: 400 });
});
