import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLiquidity } from '../../api/src/services/liquidity.service.js';
import { parseCores, scoreCores, DEFAULT_CORES } from '../../api/src/lib/cores.js';
import { autoTradeService } from '../../api/src/services/autoTrade.service.js';
import { recommendService } from '../../api/src/services/recommend.service.js';
import { alpaca } from '../../api/src/lib/alpaca.js';
import { backtestService } from '../../api/src/services/backtest.service.js';
import { config } from '../../api/src/config.js';
import { marketSession } from '../../api/src/services/marketSession.service.js';

const now = Date.parse('2026-11-25T15:00:00Z');
const options = { now, feed: 'opra', maxAgeSeconds: 120, commissionPerContract: 0.65, slippageBps: 10 };
const quote = (extra = {}) => ({ latestQuote: { bp: 2, ap: 2.2, bs: 10, as: 10, t: new Date(now - 1000).toISOString(), ...extra } });
const legs = [{ symbol: 'CALL', side: 'buy', ratio_qty: 1 }, { symbol: 'PUT', side: 'sell', ratio_qty: 1 }];
const snaps = { CALL: quote(), PUT: quote() };

test('liquidez: calcula lados, multiplicador, costos separados y escenario de EV sin netear spreads', () => {
  const a = analyzeLiquidity(legs, snaps, 100, options);
  assert.equal(a.entryPenalty, 20);
  assert.equal(a.roundTripSpread, 40);
  assert.equal(a.commissions, 2.6);
  assert.equal(a.extraSlippage, 0.84);
  assert.equal(a.estimatedCost, 43.44);
  assert.equal(a.expectedAfterCosts, 56.56);
  assert.equal(a.entryDebit, 20);
  assert.equal(a.ready, true);
  const b = analyzeLiquidity(legs, snaps, 200, { ...options, qty: 2 });
  assert.equal(b.estimatedCost, a.estimatedCost * 2);
  assert.equal(b.legs[0].contracts, 2);
  assert.equal(analyzeLiquidity([{ ...legs[1], ratio_qty: 2 }], snaps, 100, options).entryDebit, -400);
});

test('liquidez: spreads amplios empeoran puntaje y pueden borrar EV positivo', () => {
  const narrow = analyzeLiquidity(legs, snaps, 100, options);
  const wide = analyzeLiquidity(legs, { CALL: quote({ bp: 1, ap: 3 }), PUT: quote({ bp: 1, ap: 3 }) }, 100, options);
  assert.ok(wide.score < narrow.score);
  assert.ok(wide.expectedAfterCosts < 0);
});

test('liquidez: bid/ask ausente, cruzado, cero o inválido no usa último trade como liquidez', () => {
  for (const extra of [{ bp: null }, { bp: 3, ap: 2 }, { bp: 0 }, { ap: -1 }, { bp: '2' }]) {
    const a = analyzeLiquidity(legs, { ...snaps, CALL: quote(extra) }, 100, options);
    assert.equal(a.status, 'unavailable');
    assert.equal(a.score, 0);
    assert.equal(a.expectedAfterCosts, null);
    assert.equal(a.estimatedCost, null);
    assert.equal(a.ready, false);
  }
});

test('liquidez: controla edad, fechas futuras y tamaño en ambos lados con ratios', () => {
  for (const extra of [{ t: 'bad' }, { t: new Date(now + 1000).toISOString() }, { t: new Date(now - 121000).toISOString() }, { bs: 0 }, { as: null }]) {
    const a = analyzeLiquidity(legs, { ...snaps, CALL: quote(extra) }, 100, options);
    assert.equal(a.ready, false);
    assert.ok(a.score <= 0.5);
    assert.ok(a.warnings.length);
  }
  const a = analyzeLiquidity([{ ...legs[0], ratio_qty: 11 }], snaps, 100, options);
  assert.equal(a.legs[0].sizeEnough, false);
});

test('liquidez: feed indicativo y comisiones desconocidas se declaran; cero explícito sí es configuración', () => {
  const a = analyzeLiquidity(legs, snaps, 100, { ...options, feed: 'indicative', commissionPerContract: null });
  assert.equal(a.ready, false);
  assert.equal(a.commissions, null);
  assert.equal(a.commissionsKnown, false);
  assert.equal(a.expectedAfterCosts, 59.16);
  assert.ok(a.warnings.some((w) => /indicativo/.test(w)));
  assert.ok(a.warnings.some((w) => /excluye/.test(w)));
  assert.equal(analyzeLiquidity(legs, snaps, 100, { ...options, commissionPerContract: 0 }).ready, true);
  for (const bad of [{ slippageBps: -1 }, { maxAgeSeconds: 0 }, { commissionPerContract: NaN }]) {
    assert.throws(() => analyzeLiquidity(legs, snaps, 100, { ...options, ...bad }), /Configuración/);
  }
});

test('liquidez: opcional, pesos normalizados y backtest no usa cotizaciones presentes', async () => {
  assert.deepEqual(parseCores('liquidity, risk,liquidity'), ['risk', 'liquidity']);
  assert.ok(!DEFAULT_CORES.includes('liquidity'));
  assert.equal(scoreCores({ liquidity: 0.42 }, ['liquidity'], -100), 42);
  assert.equal(scoreCores({ probability: 0.6, liquidity: 0 }, ['probability'], 1), 60);
  await assert.rejects(backtestService.run('AAPL', { cores: 'liquidity' }), /no admite Liquidez/);
});

test('automático: liquidez incompleta impide enviar aunque riesgo e IA aprueben', async (t) => {
  t.mock.method(recommendService, 'recommend', async () => ({ symbol: 'ZZLIQ', cores: ['liquidity'],
    winner: { name: 'Test', execution: { ready: false, expectedAfterCosts: 100 },
      metrics: { probProfit: 0.9, expectedValue: 200, var95: 10, marginRegT: 10 }, report: {} } }));
  t.mock.method(alpaca, 'account', async () => ({ equity: 100000, buying_power: 100000 }));
  t.mock.method(alpaca, 'createOrder', () => assert.fail('No debe enviar'));
  const savedKey = config.ai.apiKey;
  config.ai.apiKey = 'test';
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ verdict: 'approved', reason: 'Test' }) }));
  try {
    const r = await autoTradeService.run({ symbol: 'ZZLIQ', dryRun: true });
    assert.equal(r.executed, false);
    assert.equal(r.filters.risk.passed, false);
  } finally { config.ai.apiKey = savedKey; }
});

test('automático: vuelve a verificar liquidez después de IA antes de crear estrategia', async (t) => {
  t.mock.method(marketSession, 'assertOpen', async () => ({}));
  t.mock.method(recommendService, 'recommend', async () => ({ symbol: 'ZZRECHECK', cores: ['liquidity'],
    winner: { name: 'Test', legs, execution: { ready: true, expectedAfterCosts: 100 },
      metrics: { probProfit: 0.9, expectedValue: 200, var95: 10, marginRegT: 10 }, report: {} } }));
  t.mock.method(alpaca, 'account', async () => ({ equity: 100000, buying_power: 100000 }));
  t.mock.method(alpaca, 'optionSnapshots', async () => ({}));
  t.mock.method(alpaca, 'createOrder', () => assert.fail('No debe enviar'));
  const savedKey = config.ai.apiKey;
  config.ai.apiKey = 'test';
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ verdict: 'approved', reason: 'Test' }) }));
  try {
    const r = await autoTradeService.run({ symbol: 'ZZRECHECK', confirm: true });
    assert.equal(r.executed, false);
    assert.match(r.message, /liquidez cambió/);
  } finally { config.ai.apiKey = savedKey; }
});
